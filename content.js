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

    // Valid single-BMP emoji codepoints that have actual PNG files (153 entries)
    const VALID_BMP_EMOJI = new Set([
        '2194', '2195', '2196', '2197', '2198', '2199', '21a9', '21aa',
        '231a', '231b', '2328', '23cf', '23e9', '23ea', '23eb', '23ec',
        '23ed', '23ee', '23ef', '23f0', '23f1', '23f2', '23f3', '23f8',
        '23f9', '23fa', '2600', '2601', '2602', '2603', '2604', '260e',
        '2611', '2614', '2615', '2618', '261d', '2620', '2622', '2623',
        '2626', '262a', '262e', '262f', '2638', '2639', '263a', '2640',
        '2642', '2648', '2649', '264a', '264b', '264c', '264d', '264e',
        '264f', '2650', '2651', '2652', '2653', '265f', '2660', '2663',
        '2665', '2666', '2668', '267b', '267e', '267f', '2692', '2693',
        '2694', '2695', '2696', '2697', '2699', '269b', '269c', '26a0',
        '26a1', '26a7', '26aa', '26ab', '26b0', '26b1', '26bd', '26be',
        '26c4', '26c5', '26c8', '26ce', '26cf', '26d1', '26d3', '26d4',
        '26e9', '26ea', '26f0', '26f1', '26f2', '26f3', '26f4', '26f5',
        '26f7', '26f8', '26f9', '26fa', '26fd', '2702', '2705', '2708',
        '2709', '270a', '270b', '270c', '270d', '270f', '2712', '2714',
        '2716', '271d', '2721', '2728', '2733', '2734', '2744', '2747',
        '274c', '274e', '2753', '2754', '2755', '2757', '2763', '2764',
        '2795', '2796', '2797', '27a1', '27b0', '27bf', '2934', '2935',
        '2b05', '2b06', '2b07', '2b1b', '2b1c', '2b50', '2b55',
        '3297', '3299'
    ]);

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
        if (firstCodeDec >= 0x1D400 && firstCodeDec <= 0x1D7FF) return true;
        if (firstCodeDec >= 0x10000 && firstCodeDec < 0x1F000) return true;
        if (firstCodeDec >= 0x20000) return true;
        if (firstCodeDec >= 0xE000 && firstCodeDec <= 0xF8FF) return true;

        // Whitelist: only replace single BMP codepoints that have actual PNG files
        if (parts.length === 1 && firstCodeDec < 0x10000) {
            return !VALID_BMP_EMOJI.has(parts[0]);
        }

        return false;
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

            // Inline error handler ensures fallback works inside Shadow DOM
            img.onerror = function () {
                if (!this.dataset.retried) {
                    this.dataset.retried = 'true';
                    if (this.src.includes('fe0f')) {
                        this.src = this.src.replace(/_?fe0f/g, '');
                    } else {
                        this.src = this.src.replace('.png', '_fe0f.png');
                    }
                } else {
                    const t = document.createTextNode(this.alt);
                    t._emojiReplaced = true;
                    if (this.parentNode) this.parentNode.replaceChild(t, this);
                }
            };
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

    console.log("Apple Emoji loaded");

})();