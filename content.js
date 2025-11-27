// Content script for Lens Search cropping

(() => {
    if (window.hasLensSearchOverlay) return;
    window.hasLensSearchOverlay = true;

    let startX, startY, endX, endY;
    let isSelecting = false;
    let overlay, selection, instructions;

    function createOverlay() {
        overlay = document.createElement('div');
        overlay.className = 'lens-search-overlay';

        selection = document.createElement('div');
        selection.className = 'lens-search-selection';
        selection.style.display = 'none';

        instructions = document.createElement('div');
        instructions.className = 'lens-search-instructions';
        instructions.textContent = 'Click and drag to select an area';

        overlay.appendChild(selection);
        overlay.appendChild(instructions);
        document.body.appendChild(overlay);

        overlay.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('keydown', onKeyDown);
    }

    function removeOverlay() {
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.removeEventListener('keydown', onKeyDown);
        window.hasLensSearchOverlay = false;
    }

    function onMouseDown(e) {
        isSelecting = true;
        startX = e.clientX;
        startY = e.clientY;

        selection.style.left = startX + 'px';
        selection.style.top = startY + 'px';
        selection.style.width = '0px';
        selection.style.height = '0px';
        selection.style.display = 'block';
    }

    function onMouseMove(e) {
        if (!isSelecting) return;

        endX = e.clientX;
        endY = e.clientY;

        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        selection.style.left = left + 'px';
        selection.style.top = top + 'px';
        selection.style.width = width + 'px';
        selection.style.height = height + 'px';
    }

    function onMouseUp(e) {
        if (!isSelecting) return;
        isSelecting = false;

        // Calculate final coordinates and dimensions relative to the viewport
        const rect = selection.getBoundingClientRect();

        // Ensure we have a valid selection
        if (rect.width > 10 && rect.height > 10) {
            // Send coordinates to background
            // We need to account for device pixel ratio in the background script, 
            // but here we send CSS pixels.
            chrome.runtime.sendMessage({
                action: 'capture_crop',
                area: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                    devicePixelRatio: window.devicePixelRatio
                }
            });
        }

        removeOverlay();
    }

    function onKeyDown(e) {
        if (e.key === 'Escape') {
            removeOverlay();
        }
    }

    createOverlay();
})();
