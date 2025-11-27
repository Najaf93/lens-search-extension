// Background script for Lens Image Searcher

let creating; // A global promise to avoid concurrency issues

async function setupOffscreenDocument(path) {
    // Check all windows controlled by the service worker to see if one 
    // of them is the offscreen document with the given path
    const offscreenUrl = chrome.runtime.getURL(path);
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [offscreenUrl]
    });

    if (existingContexts.length > 0) {
        return;
    }

    // create offscreen document
    if (creating) {
        await creating;
    } else {
        creating = chrome.offscreen.createDocument({
            url: path,
            reasons: ['DOM_PARSER'],
            justification: 'To parse HTML from search results',
        });
        await creating;
        creating = null;
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'analyze_image') {
        handleAnalyzeImage(request.limit)
            .then(result => sendResponse({ success: true, text: result.text, title: result.title }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    } else if (request.action === 'initiate_crop') {
        injectCropScript();
    } else if (request.action === 'capture_crop') {
        handleCropCapture(request.area);
    }
});

async function injectCropScript() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
    });

    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
    });
}

async function handleAnalyzeImage(limit) {
    try {
        await setupOffscreenDocument('offscreen.html');

        // 1. Capture visible tab
        const dataUrl = await captureTab();

        // 2. Upload to Google Lens and get result URL
        const lensResultUrl = await uploadToGoogleLens(dataUrl);

        // 3. Fetch first result from Lens page
        const result = await fetchFirstResultUrl(lensResultUrl);

        if (!result || !result.link) {
            throw new Error('No search results found.');
        }

        // 4. Scrape content from the first result
        const text = await scrapeContent(result.link, limit);

        return { text: text, title: result.title };
    } catch (error) {
        console.error('Analysis failed:', error);
        throw error;
    }
}

async function handleCropCapture(area) {
    try {
        // 1. Capture visible tab
        const dataUrl = await captureTab();

        // 2. Crop the image
        const croppedDataUrl = await cropImage(dataUrl, area);

        // 3. Upload to Lens
        const lensResultUrl = await uploadToGoogleLens(croppedDataUrl);

        // 4. Fetch and extract content
        // Get limit from storage or default to 50
        const settings = await chrome.storage.local.get(['wordLimit']);
        const limit = settings.wordLimit || 50;

        const result = await fetchFirstResultUrl(lensResultUrl);

        if (result && result.link) {
            const text = await scrapeContent(result.link, limit);

            // 5. Save result to storage for popup
            await chrome.storage.local.set({
                lastResult: {
                    title: result.title,
                    text: text,
                    timestamp: Date.now()
                }
            });

            // Notify user
            chrome.action.setBadgeText({ text: '1' });
            chrome.action.setBadgeBackgroundColor({ color: '#4285f4' });
        }

        // 6. Open results in new tab
        chrome.tabs.create({ url: lensResultUrl });

    } catch (error) {
        console.error('Crop capture failed:', error);
        chrome.action.setBadgeText({ text: 'ERR' });
        chrome.action.setBadgeBackgroundColor({ color: '#d93025' });
    }
}

function captureTab() {
    return new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(dataUrl);
            }
        });
    });
}

async function cropImage(dataUrl, area) {
    // Use offscreen document to crop using Canvas
    await setupOffscreenDocument('offscreen.html');

    const cropped = await chrome.runtime.sendMessage({
        type: 'crop-image',
        target: 'offscreen',
        data: { image: dataUrl, area: area }
    });

    return cropped;
}

async function uploadToGoogleLens(dataUrl) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();

    const formData = new FormData();
    formData.append('encoded_image', blob, 'screenshot.jpg');

    const uploadUrl = 'https://lens.google.com/upload';

    const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        throw new Error(`Upload failed with status ${response.status}`);
    }

    return response.url;
}

async function fetchFirstResultUrl(lensUrl) {
    const response = await fetch(lensUrl);
    const html = await response.text();

    // Send to offscreen for parsing
    const result = await chrome.runtime.sendMessage({
        type: 'find-link',
        target: 'offscreen',
        data: { html }
    });

    return result;
}

async function scrapeContent(url, limit) {
    try {
        const response = await fetch(url);
        const html = await response.text();

        // Send to offscreen for parsing
        const text = await chrome.runtime.sendMessage({
            type: 'parse-html',
            target: 'offscreen',
            data: { html, limit }
        });

        return text;
    } catch (e) {
        return `Failed to scrape ${url}: ${e.message}`;
    }
}
