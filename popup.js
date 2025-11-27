document.addEventListener('DOMContentLoaded', () => {
    const analyzeBtn = document.getElementById('analyzeBtn');
    const wordLimitInput = document.getElementById('wordLimit');
    const resultContainer = document.getElementById('resultContainer');
    const resultText = document.getElementById('resultText');
    const copyBtn = document.getElementById('copyBtn');
    const statusMessage = document.getElementById('statusMessage');
    const loader = document.querySelector('.loader');
    const btnText = document.querySelector('.btn-text');
    const cropBtn = document.getElementById('cropBtn');

    // Load saved settings and last result
    chrome.storage.local.get(['wordLimit', 'lastResult'], (result) => {
        if (result.wordLimit) {
            wordLimitInput.value = result.wordLimit;
        }

        // Check if there is a recent result
        if (result.lastResult) {
            const { title, text } = result.lastResult;
            if (title) {
                resultText.value = `Product: ${title}\n\n${text}`;
            } else {
                resultText.value = text;
            }
            resultContainer.classList.remove('hidden');

            // Clear badge
            chrome.action.setBadgeText({ text: '' });
        }
    });

    // Save settings on change
    wordLimitInput.addEventListener('change', () => {
        const limit = parseInt(wordLimitInput.value, 10);
        if (limit >= 10 && limit <= 500) {
            chrome.storage.local.set({ wordLimit: limit });
        }
    });

    cropBtn.addEventListener('click', () => {
        // Clear previous result
        chrome.storage.local.remove('lastResult');

        // Close popup to let user interact with the page
        // We send a message to background to inject the content script
        chrome.runtime.sendMessage({ action: 'initiate_crop' });
        window.close();
    });

    analyzeBtn.addEventListener('click', async () => {
        const limit = parseInt(wordLimitInput.value, 10) || 50;

        // UI Loading State
        setLoading(true);
        hideError();
        resultContainer.classList.add('hidden');
        resultText.value = '';

        // Clear previous result
        chrome.storage.local.remove('lastResult');

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'analyze_image',
                limit: limit
            });

            if (response && response.success) {
                // Display Title if available
                if (response.title) {
                    resultText.value = `Product: ${response.title}\n\n${response.text}`;
                } else {
                    resultText.value = response.text;
                }
                resultContainer.classList.remove('hidden');
            } else {
                showError(response?.error || 'Unknown error occurred.');
            }
        } catch (error) {
            showError(error.message || 'Failed to communicate with background script.');
        } finally {
            setLoading(false);
        }
    });

    copyBtn.addEventListener('click', () => {
        resultText.select();
        document.execCommand('copy');

        // Visual feedback
        const originalIcon = copyBtn.innerHTML;
        copyBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor"><path d="M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z"/></svg>';
        setTimeout(() => {
            copyBtn.innerHTML = originalIcon;
        }, 1500);
    });

    const resetBtn = document.getElementById('resetBtn');
    resetBtn.addEventListener('click', () => {
        resultText.value = '';
        resultContainer.classList.add('hidden');
        chrome.storage.local.remove('lastResult');
        chrome.action.setBadgeText({ text: '' });
    });

    function setLoading(isLoading) {
        analyzeBtn.disabled = isLoading;
        if (isLoading) {
            loader.classList.remove('hidden');
            btnText.classList.add('hidden');
        } else {
            loader.classList.add('hidden');
            btnText.classList.remove('hidden');
        }
    }

    function showError(msg) {
        statusMessage.textContent = msg;
        statusMessage.classList.add('error');
        statusMessage.classList.remove('hidden');
    }

    function hideError() {
        statusMessage.classList.add('hidden');
        statusMessage.classList.remove('error');
    }
});
