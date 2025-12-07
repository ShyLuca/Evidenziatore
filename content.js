// Evidenziatore Content Script

// Global variables
let isExtensionEnabled = true; // Default enabled
let isAutoHighlighting = false;
let defaultColor = '#facc15'; // Default yellow
let tooltipElement = null;
let lastRange = null;

// History stacks
let historyStack = [];
let redoStack = [];

console.log("Evidenziatore Content Script Loaded");

// Initialize State from Storage
if (chrome.storage) {
    chrome.storage.local.get(['extensionEnabled'], (result) => {
        isExtensionEnabled = result.extensionEnabled !== false;
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.extensionEnabled) {
            isExtensionEnabled = changes.extensionEnabled.newValue;
            if (!isExtensionEnabled) hideTooltip();
        }
    });
}

// --- UTILS ---

function generateId() {
    return 'hl-' + Math.random().toString(36).substr(2, 9);
}

function createTooltip() {
    if (tooltipElement) return tooltipElement;

    const tooltip = document.createElement('div');
    tooltip.id = 'evidenziatore-tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.zIndex = '2147483647';
    tooltip.style.display = 'flex';
    tooltip.style.gap = '8px';
    tooltip.style.padding = '6px 10px';
    tooltip.style.borderRadius = '30px';
    tooltip.style.backgroundColor = '#1e293b';
    tooltip.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)';
    tooltip.style.pointerEvents = 'auto';
    tooltip.style.transition = 'opacity 0.2s ease-in-out, transform 0.2s ease-in-out';
    tooltip.style.opacity = '0';
    tooltip.style.visibility = 'hidden';
    tooltip.style.transform = 'translateY(5px)';

    const arrow = document.createElement('div');
    arrow.style.position = 'absolute';
    arrow.style.bottom = '-6px';
    arrow.style.left = '50%';
    arrow.style.marginLeft = '-6px';
    arrow.style.width = '0';
    arrow.style.height = '0';
    arrow.style.borderLeft = '6px solid transparent';
    arrow.style.borderRight = '6px solid transparent';
    arrow.style.borderTop = '6px solid #1e293b';
    tooltip.appendChild(arrow);

    const colors = ['#facc15', '#4ade80', '#38bdf8', '#fb7185', '#a78bfa'];

    colors.forEach(color => {
        const btn = document.createElement('div');
        btn.style.width = '24px';
        btn.style.height = '24px';
        btn.style.borderRadius = '50%';
        btn.style.backgroundColor = color;
        btn.style.cursor = 'pointer';
        btn.style.border = '2px solid transparent';
        btn.style.transition = 'transform 0.1s';

        btn.onmouseover = () => { btn.style.transform = 'scale(1.2)'; btn.style.borderColor = '#fff'; };
        btn.onmouseout = () => { btn.style.transform = 'scale(1)'; btn.style.borderColor = 'transparent'; };

        btn.onmousedown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (lastRange) {
                performHighlight(lastRange, color);
                hideTooltip();
                window.getSelection()?.removeAllRanges();
            }
        };

        tooltip.appendChild(btn);
    });

    document.body.appendChild(tooltip);
    tooltipElement = tooltip; // Assign to global variable
    return tooltip;
}

function showTooltip(range) {
    const tooltip = createTooltip();
    const rect = range.getBoundingClientRect();

    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    const tooltipWidth = 180;
    const tooltipHeight = 40;
    const top = rect.top + scrollY - tooltipHeight - 10;
    const left = rect.left + scrollX + (rect.width / 2) - (tooltipWidth / 2);

    tooltip.style.top = `${Math.max(0, top)}px`;
    tooltip.style.left = `${Math.max(0, left)}px`;

    tooltip.style.visibility = 'visible';
    tooltip.style.opacity = '1';
    tooltip.style.transform = 'translateY(0)';
}

function hideTooltip() {
    if (tooltipElement) {
        tooltipElement.style.opacity = '0';
        tooltipElement.style.visibility = 'hidden';
        tooltipElement.style.transform = 'translateY(5px)';
    }
}

// --- CORE LOGIC ---

function performHighlight(range, color) {
    if (range.toString().length === 0) return;

    // Check if we are selecting inside an existing highlight
    const commonAncestor = range.commonAncestorContainer;
    let existingMark = null;

    if (commonAncestor.nodeType === Node.ELEMENT_NODE && commonAncestor.classList.contains('web-highlighter-mark')) {
        existingMark = commonAncestor;
    } else if (commonAncestor.parentElement && commonAncestor.parentElement.classList.contains('web-highlighter-mark')) {
        existingMark = commonAncestor.parentElement;
    }

    if (existingMark) {
        existingMark.style.backgroundColor = color;
        return;
    }

    const id = generateId();

    try {
        recursiveWrapper(range.commonAncestorContainer, range, color, id);
        window.getSelection()?.removeAllRanges(); // Clear selection to avoid visual glitches

        historyStack.push(id);
        redoStack = [];
        broadcastStatus();

    } catch (e) {
        console.warn("Could not highlight selection.", e);
    }
}

// --- SMART COLOR LOGIC ---

const COLOR_VARIANTS = {
    '#facc15': '#fef08a', // Light Yellow
    '#4ade80': '#bbf7d0', // Light Green
    '#38bdf8': '#bae6fd', // Light Blue
    '#fb7185': '#fecdd3', // Light Pink
    '#a78bfa': '#ddd6fe'  // Light Purple
};

function getAdaptiveColor(baseColor) {
    // Always return the light variant for maximum readability with black text
    return COLOR_VARIANTS[baseColor] || baseColor;
}

function recursiveWrapper(node, range, baseColor, id) {
    // If node is a text node and intersects with range
    if (node.nodeType === Node.TEXT_NODE) {
        // Skip whitespace-only nodes (newlines between blocks) to avoid artifacts
        // unless we are inside a <pre> tag where whitespace matters.
        if (node.textContent.trim().length === 0) {
            const parent = node.parentElement;
            const isPre = parent && (parent.tagName === 'PRE' || window.getComputedStyle(parent).whiteSpace.startsWith('pre'));
            if (!isPre) return;
        }

        // Check if this text node is fully or partially selectedRange();
        const nodeRange = document.createRange();
        nodeRange.selectNode(node);

        if (!range.intersectsNode(node)) return;

        // Always use the light variant
        const adaptiveColor = getAdaptiveColor(baseColor);

        // Check if node is effectively contained
        const isStartNode = (range.startContainer === node);
        const isEndNode = (range.endContainer === node);

        if (isStartNode && isEndNode) {
            const range2 = document.createRange();
            range2.setStart(node, range.startOffset);
            range2.setEnd(node, range.endOffset);
            wrapRange(range2, adaptiveColor, id);
            return;
        } else if (isStartNode) {
            const range2 = document.createRange();
            range2.setStart(node, range.startOffset);
            range2.setEnd(node, node.length);
            wrapRange(range2, adaptiveColor, id);
            return;
        } else if (isEndNode) {
            const range2 = document.createRange();
            range2.setStart(node, 0);
            range2.setEnd(node, range.endOffset);
            wrapRange(range2, adaptiveColor, id);
            return;
        } else {
            if (range.isPointInRange(node, 0) && range.isPointInRange(node, node.length)) {
                wrapNode(node, adaptiveColor, id);
            }
        }
    } else {
        // Element node, recurse
        const children = Array.from(node.childNodes);
        children.forEach(child => recursiveWrapper(child, range, baseColor, id));
    }
}

function wrapNode(node, color, id) {
    const span = document.createElement('span');
    span.className = 'web-highlighter-mark';
    span.dataset.highlightId = id;
    span.style.backgroundColor = color;
    span.style.color = '#000000'; // Force black text
    span.style.textShadow = 'none'; // Remove shadows
    span.style.borderRadius = '2px';
    span.style.padding = '0 1px';
    span.style.boxShadow = '0 1px 1px rgba(0,0,0,0.1)';

    node.parentNode.insertBefore(span, node);
    span.appendChild(node);
}

function wrapRange(range, color, id) {
    const span = document.createElement('span');
    span.className = 'web-highlighter-mark';
    span.dataset.highlightId = id;
    span.style.backgroundColor = color;
    span.style.color = '#000000'; // Force black text
    span.style.textShadow = 'none'; // Remove shadows
    span.style.borderRadius = '2px';
    span.style.padding = '0 1px';
    span.style.boxShadow = '0 1px 1px rgba(0,0,0,0.1)';
    range.surroundContents(span);
}

function unwrapHighlights(root) {
    const highlights = root.querySelectorAll('.web-highlighter-mark');
    highlights.forEach(hl => {
        const parent = hl.parentNode;
        while (hl.firstChild) {
            parent.insertBefore(hl.firstChild, hl);
        }
        parent.removeChild(hl);
    });
}

function robustUndo() {
    const id = historyStack.pop();
    if (!id) return;

    const el = document.querySelector(`span[data-highlight-id="${id}"]`);
    if (el) {
        el.dataset.savedColor = el.style.backgroundColor;
        el.style.backgroundColor = 'transparent';
        el.style.boxShadow = 'none';
        redoStack.push(id);
    }
    broadcastStatus();
}

function robustRedo() {
    const id = redoStack.pop();
    if (!id) return;

    const el = document.querySelector(`span[data-highlight-id="${id}"]`);
    if (el) {
        el.style.backgroundColor = el.dataset.savedColor || defaultColor;
        el.style.boxShadow = '0 1px 1px rgba(0,0,0,0.1)';
        historyStack.push(id);
    }
    broadcastStatus();
}

function broadcastStatus() {
    chrome.runtime.sendMessage({
        type: 'GET_STATUS',
        payload: {
            isHighlighting: isAutoHighlighting,
            activeColor: defaultColor,
            canUndo: historyStack.length > 0,
            canRedo: redoStack.length > 0
        }
    }).catch(() => { });
}

// --- EVENT LISTENERS ---

document.addEventListener('mouseup', (event) => {
    if (!isExtensionEnabled) return;

    const selection = window.getSelection();

    if (tooltipElement && tooltipElement.contains(event.target)) {
        return;
    }

    if (!selection || selection.rangeCount === 0 || selection.toString().trim().length === 0) {
        hideTooltip();
        return;
    }

    const range = selection.getRangeAt(0);
    lastRange = range;

    if (isAutoHighlighting) {
        performHighlight(range, defaultColor);
        selection.removeAllRanges();
        hideTooltip();
    } else {
        showTooltip(range);
    }
});

document.addEventListener('mousedown', (event) => {
    if (!isExtensionEnabled) return;
    if (tooltipElement && !tooltipElement.contains(event.target)) {
        hideTooltip();
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'TOGGLE_GLOBAL':
            isExtensionEnabled = message.payload;
            if (!isExtensionEnabled) hideTooltip();
            sendResponse({ status: 'ok' });
            break;

        case 'TOGGLE_HIGHLIGHT':
            isAutoHighlighting = message.payload;
            if (isAutoHighlighting) hideTooltip();
            sendResponse({ status: 'ok' });
            broadcastStatus();
            break;

        case 'SET_COLOR':
            defaultColor = message.payload;
            broadcastStatus();
            break;

        case 'CLEAR_HIGHLIGHTS':
            const highlights = document.querySelectorAll('.web-highlighter-mark');
            highlights.forEach(span => {
                const parent = span.parentNode;
                if (parent) {
                    parent.replaceChild(document.createTextNode(span.textContent || ''), span);
                    parent.normalize();
                }
            });
            historyStack = [];
            redoStack = [];
            hideTooltip();
            sendResponse({ status: 'cleaned' });
            broadcastStatus();
            break;

        case 'UNDO':
            robustUndo();
            break;

        case 'REDO':
            robustRedo();
            break;

        case 'GET_STATUS':
            sendResponse({
                isHighlighting: isAutoHighlighting,
                activeColor: defaultColor,
                canUndo: historyStack.length > 0,
                canRedo: redoStack.length > 0
            });
            break;

        case 'EXPORT_PNG':
            hideTooltip();
            capturePage('png', sendResponse);
            return true;

        case 'EXPORT_PDF':
            hideTooltip();
            capturePage('pdf', sendResponse);
            return true;
    }
});

// --- EXPORT ---
async function capturePage(format, sendResponse) {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'visible';

    try {
        if (window.location.protocol.startsWith('chrome')) {
            throw new Error("Cannot export Chrome system pages.");
        }

        // Ensure html2canvas is loaded
        if (typeof html2canvas === 'undefined') {
            throw new Error("html2canvas library not loaded.");
        }

        const canvas = await html2canvas(document.body, {
            useCORS: true,
            allowTaint: true,
            scrollY: -window.scrollY,
            logging: false,
            ignoreElements: (element) => element.id === 'evidenziatore-tooltip'
        });

        if (format === 'png') {
            const link = document.createElement('a');
            link.download = `evidenziatore-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } else if (format === 'pdf') {
            // Ensure jsPDF is loaded
            // jspdf.umd.min.js exposes window.jspdf.jsPDF
            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                throw new Error("jsPDF library not loaded.");
            }

            const imgData = canvas.toDataURL('image/png');
            const imgWidth = 210;
            const pageHeight = 295;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            const pdf = new jsPDF('p', 'mm', 'a4');
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`evidenziatore-${Date.now()}.pdf`);
        }
        sendResponse({ status: 'done' });
    } catch (err) {
        console.error("Export failed", err);
        chrome.runtime.sendMessage({
            type: 'ERROR',
            payload: "Export error: " + err.message
        });
        sendResponse({ status: 'error', message: err.message });
    } finally {
        document.body.style.overflow = originalOverflow;
    }
}
