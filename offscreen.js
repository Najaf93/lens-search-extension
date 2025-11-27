chrome.runtime.onMessage.addListener(handleMessages);

function handleMessages(message, sender, sendResponse) {
    if (message.target !== 'offscreen') {
        return;
    }

    if (message.type === 'parse-html') {
        const { html, limit } = message.data;
        const result = parseHtml(html, limit);
        sendResponse(result);
    } else if (message.type === 'find-link') {
        const { html } = message.data;
        const result = findFirstResult(html);
        sendResponse(result);
    } else if (message.type === 'crop-image') {
        const { image, area } = message.data;
        cropImage(image, area).then(sendResponse);
        return true; // Async response
    }
}

function parseHtml(html, limit) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove scripts, styles, etc.
    const scripts = doc.querySelectorAll('script, style, noscript, iframe, svg');
    scripts.forEach(el => el.remove());

    // Get text content
    let text = doc.body.innerText || doc.body.textContent;

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    // Limit words
    const words = text.split(' ');
    const limited = words.slice(0, limit).join(' ');

    return limited + (words.length > limit ? '...' : '');
}

function findFirstResult(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Heuristic for Google Search Results
    // Look for the main result container.
    // Usually div.g or div.MjjYud

    const results = doc.querySelectorAll('div.g, div.MjjYud');

    for (const result of results) {
        const a = result.querySelector('a');
        if (!a) continue;

        const href = a.href;
        if (href && href.startsWith('http') && !href.includes('google.com') && !href.includes('googleusercontent.com')) {
            // Try to find title
            const h3 = result.querySelector('h3');
            const title = h3 ? h3.textContent : '';

            return { link: href, title: title };
        }
    }

    // Fallback: any external link
    const allLinks = doc.querySelectorAll('a');
    for (const a of allLinks) {
        const href = a.href;
        if (href && href.startsWith('http') && !href.includes('google.com')) {
            const h3 = a.querySelector('h3') || a.parentElement.querySelector('h3');
            const title = h3 ? h3.textContent : a.textContent;
            return { link: href, title: title };
        }
    }

    return null;
}

async function cropImage(dataUrl, area) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            // Handle device pixel ratio
            const dpr = area.devicePixelRatio || 1;

            canvas.width = area.width * dpr;
            canvas.height = area.height * dpr;

            ctx.drawImage(
                img,
                area.x * dpr, area.y * dpr, area.width * dpr, area.height * dpr,
                0, 0, area.width * dpr, area.height * dpr
            );

            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
        img.src = dataUrl;
    });
}
