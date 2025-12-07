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

// --- AUTO-SAVE LOGIC ---
let saveTimeout = null;

function saveToStorage() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        const highlights = serializeHighlights();
        const key = `autosave_${window.location.href}`;
        // If empty, we can either save empty or remove. Saving empty is safer for "clearing" state.
        chrome.storage.local.set({
            [key]: {
                highlights: highlights,
                timestamp: Date.now()
            }
        }, () => {
            // Optional: console.log("Auto-saved");
        });
    }, 1000); // 1 second debounce
}

// Initialize State from Storage
if (chrome.storage) {
    chrome.storage.local.get(['extensionEnabled'], (result) => {
        isExtensionEnabled = result.extensionEnabled !== false;
    });

    // Auto-Restore Logic
    const autoSaveKey = `autosave_${window.location.href}`;
    chrome.storage.local.get([autoSaveKey], (result) => {
        if (result[autoSaveKey] && result[autoSaveKey].highlights && result[autoSaveKey].highlights.length > 0) {
            console.log("Restoring from auto-save...");
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    setTimeout(() => deserializeHighlights(result[autoSaveKey].highlights), 500);
                });
            } else {
                setTimeout(() => deserializeHighlights(result[autoSaveKey].highlights), 500);
            }
        }
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local' && changes.extensionEnabled) {
            isExtensionEnabled = changes.extensionEnabled.newValue;
            if (!isExtensionEnabled) hideTooltip();
        }
    });

    // Check for pending restore (Smart Restore)
    chrome.storage.local.get(['pendingRestore'], (result) => {
        if (result.pendingRestore) {
            const { url, data } = result.pendingRestore;
            // Clean up immediately
            chrome.storage.local.remove('pendingRestore');

            if (url === window.location.href) {
                console.log("Applying pending restore...");
                // Allow some time for DOM to stabilize/render?
                // Depending on site, we might need to wait. 
                // Using a small delay or checking document.readyState
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', () => {
                        setTimeout(() => deserializeHighlights(data), 500);
                    });
                } else {
                    setTimeout(() => deserializeHighlights(data), 500);
                }
            }
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
        el.dataset.savedTextColor = el.style.color; // Save text color (likely black)

        el.style.backgroundColor = 'transparent';
        el.style.color = ''; // Reset to inherit from parent/page
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
        el.style.color = el.dataset.savedTextColor || '#000000'; // Restore text color
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
    saveToStorage();
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

        case 'CLEAR_HIGHLIGHTS': {
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
        }

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
            capturePage('pdf', sendResponse, message.payload?.quality);
            return true;

        case 'EXPORT_DATA': {
            hideTooltip();
            const highlights = serializeHighlights();
            const exportData = {
                url: window.location.href,
                createdAt: new Date().toISOString(),
                version: 1,
                highlights: highlights
            };

            const blob = new Blob([JSON.stringify(exportData)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = getExportFilename('json');
            a.click();
            URL.revokeObjectURL(url);
            sendResponse({ status: 'ok' });
            break;
        }

        case 'TRIGGER_IMPORT': {
            hideTooltip();
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.style.display = 'none';
            document.body.appendChild(input);

            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) {
                    document.body.removeChild(input);
                    return;
                }

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const json = JSON.parse(event.target.result);

                        // normalize data
                        let highlights = [];
                        let targetUrl = null;

                        if (Array.isArray(json)) {
                            // Legacy format
                            highlights = json;
                        } else if (json.highlights) {
                            // New format
                            highlights = json.highlights;
                            targetUrl = json.url;
                        }

                        if (targetUrl && targetUrl !== window.location.href) {
                            // Smart Redirect
                            if (confirm(`This backup is for:\n${targetUrl}\n\nDo you want to go there to restore?`)) {
                                chrome.storage.local.set({
                                    pendingRestore: {
                                        url: targetUrl,
                                        data: highlights
                                    }
                                }, () => {
                                    window.location.href = targetUrl;
                                });
                                return;
                            }
                        }

                        deserializeHighlights(highlights);
                        console.log("Import successful");
                    } catch (err) {
                        console.error("Import failed", err);
                        alert("Failed to parse Import file.");
                    } finally {
                        document.body.removeChild(input);
                    }
                };
                reader.readAsText(file);
            };

            input.click();
            sendResponse({ status: 'opened' });
            break;
        }
    }
});

// Helper to generate filename: "Page Title - YYYY-MM-DD.ext"
function getExportFilename(extension) {
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

    // Sanitize title
    let title = document.title || 'evidenziatore-export';
    title = title.replace(/[^a-z0-9\u00C0-\u017F\s-]/gi, '_').replace(/\s+/g, '-').toLowerCase();

    // Limit length
    if (title.length > 50) title = title.substring(0, 50);

    return `${title}-${dateStr}.${extension}`;
}

// --- EXPORT ---
async function capturePage(format, sendResponse, quality = 'high') {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'visible';
    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;

    try {
        window.scrollTo(0, 0);
        await new Promise(resolve => setTimeout(resolve, 100)); // Allow render to catch up

        if (window.location.protocol.startsWith('chrome')) {
            throw new Error("Cannot export Chrome system pages.");
        }

        // Ensure html2canvas is loaded
        if (typeof html2canvas === 'undefined') {
            throw new Error("html2canvas library not loaded.");
        }

        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error("Export timed out (page too large)")), 12000);
        });

        const canvasPromise = html2canvas(document.body, {
            useCORS: true,
            allowTaint: true,
            scrollY: -window.scrollY,
            logging: false,
            ignoreElements: (element) => element.id === 'evidenziatore-tooltip'
        });

        // Race between export and timeout
        const canvas = await Promise.race([canvasPromise, timeoutPromise]);

        if (format === 'png') {
            const link = document.createElement('a');
            link.download = getExportFilename('png');
            link.href = canvas.toDataURL('image/png');
            link.click();
        } else if (format === 'pdf') {
            // Ensure jsPDF is loaded
            // jspdf.umd.min.js exposes window.jspdf.jsPDF
            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                throw new Error("jsPDF library not loaded.");
            }

            let imgData;
            let imgFormat = 'PNG';

            if (quality === 'medium') {
                imgData = canvas.toDataURL('image/jpeg', 0.75);
                imgFormat = 'JPEG';
            } else if (quality === 'low') {
                imgData = canvas.toDataURL('image/jpeg', 0.5);
                imgFormat = 'JPEG';
            } else {
                imgData = canvas.toDataURL('image/png');
            }

            const imgWidth = 210;
            const pageHeight = 295;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            const pdf = new jsPDF('p', 'mm', 'a4');
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, imgFormat, 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, imgFormat, 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(getExportFilename('pdf'));
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
        window.scrollTo(originalScrollX, originalScrollY);
    }
}

// --- BACKUP & RESTORE ---

// ... existing code ...

function serializeHighlights() {
    const highlights = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let offset = 0;

    let currentNode = walker.nextNode();
    while (currentNode) {
        const length = currentNode.textContent.length;
        const parent = currentNode.parentElement;

        if (parent && parent.classList.contains('web-highlighter-mark')) {
            const id = parent.dataset.highlightId;
            const color = parent.style.backgroundColor;

            highlights.push({
                start: offset,
                end: offset + length,
                color: color,
                id: id
            });
        }

        offset += length;
        currentNode = walker.nextNode();
    }
    return highlights;
}

function deserializeHighlights(data) {
    if (!Array.isArray(data)) return;

    // 1. Sort ascending to map to text nodes efficiently
    data.sort((a, b) => a.start - b.start);
    const validData = data.filter(h => h.start < h.end);

    const tasks = [];

    // 2. Single Pass to collect Ranges
    // We walk the DOM once to find all start/end nodes
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
    let currentGlobalOffset = 0;
    let node = walker.nextNode();
    let dataIndex = 0;

    while (node && dataIndex < validData.length) {
        const nodeLength = node.textContent.length;
        const nodeStart = currentGlobalOffset;
        const nodeEnd = currentGlobalOffset + nodeLength;

        // Check for all highlights that might start or end in this node
        // (Since sorted by start, we only check the current queue head)

        // Actually, we need to find the START and END node for each highlight.
        // A highlight might span multiple nodes. 
        // But our `serialize` split them into huge lists of segments?
        // Yes, serialize logic produces segments per text node (or contiguous block).
        // If we assumed segments, then each highlight fits in one node?
        // My serializer implementation:
        // `highlights.push({ start: offset, end: offset + length ... })`
        // It pushes PER text node found in a wrapper.
        // So NO highlight in the JSON should span multiple text nodes. 
        // They are all local segments!
        // This simplifies matched ranges massively.

        while (dataIndex < validData.length) {
            const h = validData[dataIndex];

            // If highlight starts after this node ends, we need to advance the walker
            if (h.start >= nodeEnd) {
                break; // Move to next node
            }

            // If we are here, h.start < nodeEnd.
            // Since we process in order, h.start >= nodeStart usually (unless overlap/unsorted, but we sorted).
            // Actually, if we have overlaps, h.start could be < nodeStart?
            // If h.start < nodeStart && h.end > nodeStart: intersection.

            // Calculate intersection
            const startInNode = Math.max(nodeStart, h.start);
            const endInNode = Math.min(nodeEnd, h.end);

            if (startInNode < endInNode) {
                // Valid intersection found
                const range = document.createRange();
                range.setStart(node, startInNode - nodeStart);
                range.setEnd(node, endInNode - nodeStart);

                tasks.push({
                    range: range,
                    color: h.color,
                    id: h.id
                });
            }

            // If this highlight ends within (or at end of) this node, we are done with it.
            if (h.end <= nodeEnd) {
                dataIndex++;
            } else {
                // Highlight continues to next node?
                // If serializer is segment-based, this shouldn't happen.
                // But robust logic handles it: we just process the next node for the SAME highlight?
                // No, `dataIndex` increments. 
                // If a highlight spans multiple nodes, we should keep it for the next node?
                // Complex.
                // Re-reading logic: "findNodeAtGlobalOffset".
                // If I switch to "Segment Match", I assume strict segments.
                // Let's assume segment-based for now as my serializer produces segments.
                // If I am importing data from elsewhere... treat safely.

                // If h.end > nodeEnd, it spans. 
                // We captured the part in this node.
                // We should NOT increment dataIndex if we want to capture the rest in next node?
                // But my loop structure `while (dataIndex ...)` implies processing one item.
                // Better approach: filter candidates?

                // Simplified: The serializer generates ONE entry per text node wrapped.
                // So h.end <= nodeEnd is guaranteed for self-generated files.
                dataIndex++;
            }
        }

        currentGlobalOffset += nodeLength;
        node = walker.nextNode();
    }

    // 3. Apply ranges in Reverse Order to preserve validity
    tasks.reverse();

    // Use a batching mechanism to avoid freezing UI if many tasks
    const batchSize = 50;

    function processBatch(startIndex) {
        const endIndex = Math.min(startIndex + batchSize, tasks.length);
        for (let i = startIndex; i < endIndex; i++) {
            const task = tasks[i];
            try {
                // Ensure range is still valid (it should be if reverse applied)
                if (task.range.collapsed) continue;
                // Direct wrapping
                // wrapRange(task.range, task.color, task.id || generateId());

                // We must use `performHighlight` or `wrapRange`.
                // `wrapRange` creates the span.
                const span = document.createElement('span');
                span.className = 'web-highlighter-mark';
                span.dataset.highlightId = task.id || generateId();
                span.style.backgroundColor = task.color;
                span.style.color = '#000000';
                span.style.textShadow = 'none';
                span.style.borderRadius = '2px';
                span.style.padding = '0 1px';
                span.style.boxShadow = '0 1px 1px rgba(0,0,0,0.1)';

                task.range.surroundContents(span);

            } catch (e) {
                console.warn("Batch apply error", e);
            }
        }

        if (endIndex < tasks.length) {
            requestAnimationFrame(() => processBatch(endIndex));
        } else {
            // Batch finished
            saveToStorage();
        }
    }

    processBatch(0);
}
