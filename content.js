(function () {
    'use strict';

    const EXTENSION_BASE_URL = chrome.runtime.getURL('png/');
    const BATCH_DELAY = 16;

    // Track initialized shadow roots to avoid duplicate injection
    const processedShadowRoots = new WeakSet();

    const EMOJI_CSS = `
        img.emoji {
            height: 1.15em !important;
            width: 1.15em !important;
            vertical-align: -0.22em !important;
            margin: 0 0.05em !important;
            display: inline-block !important;
            image-rendering: auto !important;
            transform: translateZ(0);
            contain: layout paint style;
        }
    `;

    // =========================================================
    // TreeWalker Traversal (Browser-native API, faster than recursion)
    // =========================================================
    function efficientWalk(rootNode, callback) {
        const walker = document.createTreeWalker(
            rootNode,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const nodesToReplace = [];
        let node;
        while (node = walker.nextNode()) {
            if (node.data.length < 2 || !/\S/.test(node.data)) continue;

            const parent = node.parentNode;
            if (parent) {
                const tag = parent.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' ||
                    tag === 'TITLE' || parent.isContentEditable) continue;
            }
            nodesToReplace.push(node);
        }

        nodesToReplace.forEach(callback);

        // Penetrate into Shadow DOM subtrees
        discoverShadowRoots(rootNode, callback);
    }

    // =========================================================
    // Shadow DOM Penetration
    // =========================================================
    function discoverShadowRoots(rootNode, callback) {
        if (rootNode.shadowRoot) {
            initShadowRoot(rootNode.shadowRoot);
            efficientWalk(rootNode.shadowRoot, callback);
        }
        const elWalker = document.createTreeWalker(
            rootNode,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
        );
        let el;
        while (el = elWalker.nextNode()) {
            if (el.shadowRoot) {
                initShadowRoot(el.shadowRoot);
                efficientWalk(el.shadowRoot, callback);
            }
        }
    }

    function initShadowRoot(shadowRoot) {
        if (processedShadowRoots.has(shadowRoot)) return;
        processedShadowRoots.add(shadowRoot);

        // Inject emoji styles (external CSS can't pierce shadow boundary)
        const s = document.createElement('style');
        s.textContent = EMOJI_CSS;
        shadowRoot.appendChild(s);

        // Observe mutations within this shadow root
        const so = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    for (let i = 0; i < mutation.addedNodes.length; i++) {
                        const node = mutation.addedNodes[i];
                        if (node.nodeType === 1) {
                            scheduleScan(node);
                        } else if (node.nodeType === 3) {
                            scheduleScan(node.parentNode || shadowRoot);
                        }
                    }
                } else if (mutation.type === 'characterData') {
                    scheduleScan(mutation.target.parentNode || shadowRoot);
                }
            });
        });

        so.observe(shadowRoot, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    // =========================================================
    // Emoji Filtering & Filename Generation
    // =========================================================
    function shouldIgnore(codepoint, rawText) {
        if (rawText.includes('\ufe0e')) return true;
        if (codepoint.endsWith('-200d')) return true;
        const parts = codepoint.split('-');
        const firstCodeDec = parseInt(parts[0], 16);

        if (parts[0] === '1f48b' && parts.length > 1) return true;
        if (firstCodeDec >= 0x3000 && firstCodeDec <= 0x30FF) return true;
        if (firstCodeDec >= 0x1D400 && firstCodeDec <= 0x1D7FF) return true;
        if (firstCodeDec >= 0x10000 && firstCodeDec < 0x1F000) return true;
        if (firstCodeDec >= 0x20000) return true;
        if (firstCodeDec >= 0xE000 && firstCodeDec <= 0xF8FF) return true;

        const bmpBlacklist = new Set([
            0x2312, 0x2661, 0x266a, 0x266c, 0x2729, 0x275a, 0x21bb,
            0x21e3, 0x271a, 0x2b52, 0x2727, 0x2606, 0x2745, 0x2741,
            0x273d, 0x2726, 0x2304, 0x219f
        ]);
        return bmpBlacklist.has(firstCodeDec);
    }

    const needFe0fList = new Set([
        '0023', '002a', '0030', '0031', '0032', '0033', '0034',
        '0035', '0036', '0037', '0038', '0039', '2640', '2642'
    ]);

    function convertToLocalFilename(iconCode) {
        let baseCode = iconCode.split('-').map(part =>
            part.length < 4 ? ('0000' + part).slice(-4) : part
        ).join('_');
        baseCode = baseCode.replace(/_?fe0f/g, '');
        if (needFe0fList.has(baseCode)) return `emoji_u${baseCode}_fe0f.png`;
        return `emoji_u${baseCode}.png`;
    }

    // =========================================================
    // RGI Emoji Regex (compiled once)
    // =========================================================
    const regexCache = (function () {
        const r_surrogates = "[\\ud800-\\udbff][\\udc00-\\udfff]";
        const r_flags = "(?:\\ud83c[\\udde6-\\uddff]){2}";
        const r_skin = "\\ud83c[\\udffb-\\udfff]";
        const r_zwj = "\\u200d";
        const r_keycaps = "[\\u0023-\\u0039]\\ufe0f?\\u20e3";
        const r_zwj_tail = "(?:" + r_surrogates + "|" + r_keycaps + "|[\\u2640\\u2642\\u27a1\\u2695\\u2696\\u2708\\u27b0\\u2795-\\u2797])";
        const r_zwj_seq = "(?:" + r_zwj + r_zwj_tail + "(?:" + r_skin + ")?)*";
        const r_single_ranges = ["[\\u2300-\\u23ff]", "[\\u2190-\\u21ff]", "[\\u2934-\\u2935]", "[\\u2600-\\u27bf]", "[\\u2b05-\\u2b55]", "[\\u3030\\u303d\\u3297\\u3299]"].join("|");
        const r_selector = "[\\ufe0e\\ufe0f]?";
        const regexStr = "(?:" + r_flags + ")|(?:" + "(?:" + r_surrogates + "|" + r_single_ranges + ")" + "(?:" + r_skin + ")?" + r_zwj_seq + r_selector + ")|(?:" + r_keycaps + ")";
        return new RegExp(regexStr, 'g');
    })();

    function toCodePoint(unicodeSurrogates) {
        const r = [];
        let c = 0,
            p = 0,
            i = 0;
        while (i < unicodeSurrogates.length) {
            c = unicodeSurrogates.charCodeAt(i++);
            if (p) {
                r.push((0x10000 + ((p - 0xD800) << 10) + (c - 0xDC00)).toString(16));
                p = 0;
            } else if (0xD800 <= c && c <= 0xDBFF) {
                p = c;
            } else {
                r.push(c.toString(16));
            }
        }
        return r.join('-');
    }

    // =========================================================
    // Text Node Processing
    // =========================================================
    function processTextNode(node) {
        if (node._emojiReplaced) return;
        if (!regexCache.test(node.data)) return;

        regexCache.lastIndex = 0;

        const fragment = document.createDocumentFragment();
        let lastIdx = 0;
        let match;

        while ((match = regexCache.exec(node.data)) !== null) {
            const matchText = match[0];
            const iconCode = toCodePoint(matchText);

            if (shouldIgnore(iconCode, matchText)) continue;

            if (match.index > lastIdx) {
                fragment.appendChild(document.createTextNode(node.data.slice(lastIdx, match.index)));
            }

            const img = document.createElement('img');
            img.className = 'emoji';
            img.draggable = false;
            img.alt = matchText;
            img.src = `${EXTENSION_BASE_URL}${convertToLocalFilename(iconCode)}`;
            img.loading = "eager";
            fragment.appendChild(img);

            lastIdx = regexCache.lastIndex;
        }

        if (lastIdx < node.data.length) {
            fragment.appendChild(document.createTextNode(node.data.slice(lastIdx)));
        }

        if (fragment.childNodes.length > 0) {
            node.parentNode.replaceChild(fragment, node);
        }
    }

    // =========================================================
    // Batch Scheduler (RAF-based to prevent jank)
    // =========================================================
    let batchTimeout = null;
    let pendingNodes = new Set();

    function scheduleScan(root) {
        pendingNodes.add(root);
        if (batchTimeout) return;

        batchTimeout = setTimeout(() => {
            requestAnimationFrame(() => {
                pendingNodes.forEach(root => {
                    if (!root.isConnected) return;
                    efficientWalk(root, processTextNode);
                });
                pendingNodes.clear();
                batchTimeout = null;
            });
        }, BATCH_DELAY);
    }

    // =========================================================
    // CSS (GPU-accelerated rendering)
    // =========================================================
    const style = document.createElement('style');
    style.textContent = EMOJI_CSS;
    document.head.appendChild(style);

    // =========================================================
    // Init & MutationObserver
    // =========================================================
    if (document.body) {
        scheduleScan(document.body);
    } else {
        window.addEventListener('DOMContentLoaded', () => scheduleScan(document.body));
    }

    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                for (let i = 0; i < mutation.addedNodes.length; i++) {
                    const node = mutation.addedNodes[i];
                    if (node.nodeType === 1) {
                        scheduleScan(node);
                    } else if (node.nodeType === 3) {
                        scheduleScan(node.parentNode || document.body);
                    }
                }
            } else if (mutation.type === 'characterData') {
                scheduleScan(mutation.target.parentNode || document.body);
            }
        });
    });

    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true
    });

    // Graceful degradation: fallback to text if image fails
    window.addEventListener('error', (e) => {
        if (e.target.tagName === 'IMG' && e.target.classList.contains('emoji')) {
            const img = e.target;
            if (!img.dataset.retried) {
                img.dataset.retried = "true";
                if (img.src.includes('fe0f')) {
                    img.src = img.src.replace(/_?fe0f/g, '');
                } else {
                    img.src = img.src.replace('.png', '_fe0f.png');
                }
            } else {
                const text = document.createTextNode(img.alt);
                text._emojiReplaced = true;
                img.parentNode.replaceChild(text, img);
            }
            e.preventDefault();
        }
    }, true);

    console.log("Apple Emoji loaded");

})();