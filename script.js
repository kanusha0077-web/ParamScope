// ==UserScript==
// @name         Paramscope
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Collects visible/hidden parameters from URLs, forms, data-attributes, JSON, meta tags, cookies, and basic JS assignments into a unified parameter atlas.
// @author       rix4uni (refactored)
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'nebulaParameterAtlas';
    const PANEL_ID = 'nebulaParameterAtlasUI';

    // paramIndex structure:
    // {
    //   paramName: {
    //     count: number,
    //     examples: [value1, value2, ...],
    //     sources: {
    //       urlQuery: number,
    //       formField: number,
    //       dataAttr: number,
    //       jsonKey: number,
    //       metaTag: number,
    //       cookie: number,
    //       jsAssignment: number
    //     }
    //   }
    // }
    let paramIndex = GM_getValue(STORAGE_KEY, {});
    let lastScanTimestamp = null;

    const BLUE = '#3498db';
    const RED = '#e74c3c';

    // -------------------------------
    // Helpers
    // -------------------------------

    function safeLog(...args) {
        try {
            console.log('[ParamScope]', ...args);
        } catch (e) {}
    }

    function ensureParamEntry(name) {
        if (!paramIndex[name]) {
            paramIndex[name] = {
                count: 0,
                examples: [],
                sources: {
                    urlQuery: 0,
                    formField: 0,
                    dataAttr: 0,
                    jsonKey: 0,
                    metaTag: 0,
                    cookie: 0,
                    jsAssignment: 0
                }
            };
        }
        return paramIndex[name];
    }

    function addExampleValue(entry, value) {
        if (value == null) return;
        const stringVal = String(value);
        if (stringVal === '') return;
        // Limit examples & avoid huge blobs
        const trimmed = stringVal.length > 200 ? stringVal.slice(0, 200) + '...' : stringVal;
        if (!entry.examples.includes(trimmed)) {
            if (entry.examples.length < 10) {
                entry.examples.push(trimmed);
            }
        }
    }

    function recordParam(name, value, sourceType) {
        if (!name || typeof name !== 'string') return;
        name = name.trim();
        if (!name) return;

        const entry = ensureParamEntry(name);
        entry.count += 1;

        if (entry.sources[sourceType] != null) {
            entry.sources[sourceType] += 1;
        }

        addExampleValue(entry, value);
    }

    function safeSetClipboard(text, successMessage) {
        try {
            GM_setClipboard(text, 'text');
            showNotification(successMessage);
        } catch (e) {
            console.error('[ParamScope] Clipboard error:', e);
            alert('ParamScope: clipboard access failed. Check console for details.');
        }
    }

    // ----------------------------------------
    // URL collection & query param extraction
    // ----------------------------------------

    function collectPageUrls() {
        const urls = new Set();

        // Current URL
        try {
            urls.add(new URL(window.location.href).href);
        } catch (e) {}

        // Anchors
        document.querySelectorAll('a[href]').forEach(a => {
            const href = a.getAttribute('href');
            if (!href) return;
            try {
                const abs = new URL(href, window.location.href).href;
                urls.add(abs);
            } catch (e) {}
        });

        // Link tags
        document.querySelectorAll('link[href]').forEach(link => {
            const href = link.getAttribute('href');
            if (!href) return;
            try {
                const abs = new URL(href, window.location.href).href;
                urls.add(abs);
            } catch (e) {}
        });

        // Script tags
        document.querySelectorAll('script[src]').forEach(s => {
            const src = s.getAttribute('src');
            if (!src) return;
            try {
                const abs = new URL(src, window.location.href).href;
                urls.add(abs);
            } catch (e) {}
        });

        // Img tags
        document.querySelectorAll('img[src]').forEach(img => {
            const src = img.getAttribute('src');
            if (!src) return;
            try {
                const abs = new URL(src, window.location.href).href;
                urls.add(abs);
            } catch (e) {}
        });

        return Array.from(urls);
    }

    function extractQueryParamsFromUrls() {
        const urls = collectPageUrls();
        urls.forEach(u => {
            try {
                const url = new URL(u);
                url.searchParams.forEach((value, key) => {
                    recordParam(key, value, 'urlQuery');
                });
            } catch (e) {}
        });
    }

    // ----------------------------------------
    // Forms & fields (hidden + visible)
    // ----------------------------------------

    function extractFormParams() {
        const forms = document.forms;
        for (let i = 0; i < forms.length; i++) {
            const form = forms[i];
            const method = (form.method || 'GET').toUpperCase();
            let action = form.getAttribute('action') || window.location.href;
            try {
                action = new URL(action, window.location.href).href;
            } catch (e) {}

            const contextInfo = `[FORM:${method} ${action}]`;

            const fields = form.querySelectorAll('input, select, textarea');
            fields.forEach(field => {
                const name = field.getAttribute('name') || field.id;
                if (!name) return;

                let value = '';
                if (field.tagName === 'INPUT') {
                    const type = (field.getAttribute('type') || 'text').toLowerCase();
                    if (['checkbox', 'radio'].includes(type)) {
                        if (!field.checked) return;
                        value = field.value || 'on';
                    } else {
                        value = field.value;
                    }
                } else if (field.tagName === 'SELECT') {
                    if (field.multiple) {
                        const selected = Array.from(field.selectedOptions).map(o => o.value);
                        value = selected.join(',');
                    } else {
                        value = field.value;
                    }
                } else {
                    value = field.value;
                }

                recordParam(name, `${value} ${contextInfo}`, 'formField');
            });
        }
    }

    // ----------------------------------------
    // data-* attributes
    // ----------------------------------------

    function extractDataAttributes() {
        const elements = document.querySelectorAll('*');
        elements.forEach(el => {
            if (!el.attributes) return;
            for (let i = 0; i < el.attributes.length; i++) {
                const attr = el.attributes[i];
                if (!attr || !attr.name) continue;
                if (!attr.name.startsWith('data-')) continue;

                const paramName = attr.name.slice(5); // remove "data-"
                const value = attr.value;
                recordParam(paramName, value, 'dataAttr');
            }
        });
    }

    // ----------------------------------------
    // Meta tags
    // ----------------------------------------

    function extractMetaTags() {
        const metas = document.querySelectorAll('meta[name], meta[property]');
        metas.forEach(meta => {
            const name = meta.getAttribute('name') || meta.getAttribute('property');
            const content = meta.getAttribute('content') || '';
            if (!name) return;
            recordParam(`meta:${name}`, content, 'metaTag');
        });
    }

    // ----------------------------------------
    // Cookies
    // ----------------------------------------

    function extractCookies() {
        try {
            const cookieStr = document.cookie;
            if (!cookieStr) return;
            cookieStr.split(';').forEach(part => {
                const piece = part.trim();
                if (!piece) return;
                const eqIndex = piece.indexOf('=');
                if (eqIndex === -1) return;
                const name = piece.slice(0, eqIndex).trim();
                const value = piece.slice(eqIndex + 1).trim();
                if (!name) return;
                recordParam(`cookie:${name}`, value, 'cookie');
            });
        } catch (e) {
            safeLog('Cookie extraction failed:', e);
        }
    }

    // ----------------------------------------
    // JSON & inline JS
    // ----------------------------------------

    function walkJson(obj, prefix = [], depth = 0, maxDepth = 4) {
        if (depth > maxDepth || obj == null) return;

        if (Array.isArray(obj)) {
            obj.forEach((item, idx) => {
                walkJson(item, prefix.concat(`[${idx}]`), depth + 1, maxDepth);
            });
            return;
        }

        if (typeof obj === 'object') {
            Object.keys(obj).forEach(key => {
                const value = obj[key];
                const newPath = prefix.concat(key);
                const name = newPath.join('.');
                if (typeof value !== 'object' || value === null) {
                    recordParam(name, value, 'jsonKey');
                } else {
                    walkJson(value, newPath, depth + 1, maxDepth);
                }
            });
        }
    }

    function extractJsonBlocks() {
        const scripts = document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]');
        scripts.forEach(script => {
            const text = script.textContent.trim();
            if (!text) return;
            try {
                const json = JSON.parse(text);
                walkJson(json, [], 0, 4);
            } catch (e) {
                // ignore parse errors
            }
        });
    }

    function extractJSAssignments() {
        const scripts = document.querySelectorAll('script:not([src])');
        const regex = /([A-Za-z0-9_$]{2,50})\s*[:=]\s*["'`]([^"'`]{1,120})["'`]/g;

        scripts.forEach(script => {
            const text = script.textContent;
            if (!text) return;

            let match;
            let hitCount = 0;
            const maxHitsPerScript = 50;

            while ((match = regex.exec(text)) !== null) {
                const name = match[1];
                const value = match[2];
                recordParam(`js:${name}`, value, 'jsAssignment');
                hitCount++;
                if (hitCount >= maxHitsPerScript) break;
            }
        });
    }

    // ----------------------------------------
    // Main extraction pipeline
    // ----------------------------------------

    function extractAllParameters() {
        lastScanTimestamp = new Date().toISOString();

        try {
            extractQueryParamsFromUrls();
        } catch (e) {
            safeLog('Query param extraction error:', e);
        }

        try {
            extractFormParams();
        } catch (e) {
            safeLog('Form param extraction error:', e);
        }

        try {
            extractDataAttributes();
        } catch (e) {
            safeLog('Data attribute extraction error:', e);
        }

        try {
            extractMetaTags();
        } catch (e) {
            safeLog('Meta extraction error:', e);
        }

        try {
            extractCookies();
        } catch (e) {
            safeLog('Cookie extraction error:', e);
        }

        try {
            extractJsonBlocks();
        } catch (e) {
            safeLog('JSON extraction error:', e);
        }

        try {
            extractJSAssignments();
        } catch (e) {
            safeLog('JS assignment extraction error:', e);
        }

        GM_setValue(STORAGE_KEY, paramIndex);
        updateUI();
    }

    // ----------------------------------------
    // UI
    // ----------------------------------------

    function updateUI() {
        const existing = document.getElementById(PANEL_ID);
        if (existing) {
            existing.remove();
        }

        const paramNames = Object.keys(paramIndex);
        const totalParams = paramNames.length;
        let totalOccurrences = 0;
        const sourceTotals = {
            urlQuery: 0,
            formField: 0,
            dataAttr: 0,
            jsonKey: 0,
            metaTag: 0,
            cookie: 0,
            jsAssignment: 0
        };

        paramNames.forEach(name => {
            const entry = paramIndex[name];
            totalOccurrences += entry.count;
            Object.keys(sourceTotals).forEach(source => {
                sourceTotals[source] += entry.sources[source] || 0;
            });
        });

        const ui = document.createElement('div');
        ui.id = PANEL_ID;
        ui.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: #1b2631;
            color: #ecf0f1;
            padding: 12px;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            z-index: 100000;
            max-width: 380px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.35);
            border: 1px solid #34495e;
            max-height: 80vh;
            overflow-y: auto;
        `;

        const header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '8px';
        header.style.cursor = 'move';

        const title = document.createElement('div');
        title.innerHTML = '<strong>🧬 ParamScope</strong>';
        title.style.fontSize = '13px';

        const headerButtons = document.createElement('div');

        const collapseBtn = document.createElement('button');
        collapseBtn.textContent = '–';
        collapseBtn.title = 'Collapse/expand';
        collapseBtn.style.cssText = `
            background: #2c3e50;
            color: #ecf0f1;
            border: none;
            width: 20px;
            height: 20px;
            border-radius: 3px;
            cursor: pointer;
            margin-right: 4px;
        `;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.title = 'Hide panel';
        closeBtn.style.cssText = `
            background: ${RED};
            color: #ecf0f1;
            border: none;
            width: 20px;
            height: 20px;
            border-radius: 3px;
            cursor: pointer;
        `;

        headerButtons.appendChild(collapseBtn);
        headerButtons.appendChild(closeBtn);
        header.appendChild(title);
        header.appendChild(headerButtons);

        const contentWrapper = document.createElement('div');
        contentWrapper.style.marginTop = '6px';

        const stats = document.createElement('div');
        stats.style.marginBottom = '8px';
        stats.style.lineHeight = '1.4';

        const lastScanText = lastScanTimestamp
            ? new Date(lastScanTimestamp).toLocaleTimeString()
            : 'n/a';

        stats.innerHTML = `
            <div>🧾 Parameter names: <strong>${totalParams}</strong></div>
            <div>🔢 Total occurrences: <strong>${totalOccurrences}</strong></div>
            <div>🌐 URL query hits: <strong>${sourceTotals.urlQuery}</strong></div>
            <div>📨 Form fields: <strong>${sourceTotals.formField}</strong></div>
            <div>📌 data-* attrs: <strong>${sourceTotals.dataAttr}</strong></div>
            <div>📦 JSON keys: <strong>${sourceTotals.jsonKey}</strong></div>
            <div>🏷️ Meta tags: <strong>${sourceTotals.metaTag}</strong></div>
            <div>🍪 Cookies: <strong>${sourceTotals.cookie}</strong></div>
            <div>🧪 JS assignments: <strong>${sourceTotals.jsAssignment}</strong></div>
            <div>⏱️ Last scan: <strong>${lastScanText}</strong></div>
        `;

        const buttons = document.createElement('div');
        buttons.style.display = 'flex';
        buttons.style.flexDirection = 'column';
        buttons.style.gap = '5px';
        buttons.style.marginBottom = '4px';

        const btnAllText = createButton('📋 Copy all parameters (text)', '#27ae60', copyAllParamsAsText);
        const btnAllJson = createButton('🧾 Copy all parameters (JSON)', '#16a085', copyAllParamsAsJson);
        const btnUrlOnly = createButton('🌐 Copy URL query parameters', BLUE, copyUrlParamsOnly);
        const btnReset = createButton('🗑️ Reset parameter atlas', RED, resetAtlas);

        buttons.appendChild(btnAllText);
        buttons.appendChild(btnAllJson);
        buttons.appendChild(btnUrlOnly);
        buttons.appendChild(btnReset);

        contentWrapper.appendChild(stats);
        contentWrapper.appendChild(buttons);

        ui.appendChild(header);
        ui.appendChild(contentWrapper);

        document.body.appendChild(ui);
        makeDraggable(ui, header);

        collapseBtn.addEventListener('click', () => {
            const isHidden = contentWrapper.style.display === 'none';
            contentWrapper.style.display = isHidden ? 'block' : 'none';
        });

        closeBtn.addEventListener('click', () => {
            ui.style.display = 'none';
        });
    }

    function createButton(text, color, onClick) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = `
            padding: 7px;
            background: ${color};
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            width: 100%;
            text-align: left;
        `;
        button.addEventListener('click', onClick);
        return button;
    }

    function copyAllParamsAsText() {
        const lines = [];
        Object.keys(paramIndex).sort().forEach(name => {
            const entry = paramIndex[name];
            const example = entry.examples[0] || '';
            lines.push(`${name} = ${example}    (count: ${entry.count})`);
        });
        const text = lines.join('\n');
        safeSetClipboard(text, `Copied ${lines.length} parameters as text`);
    }

    function copyAllParamsAsJson() {
        const payload = {
            generatedAt: new Date().toISOString(),
            host: window.location.hostname,
            totalParamNames: Object.keys(paramIndex).length,
            parameters: paramIndex
        };
        const text = JSON.stringify(payload, null, 2);
        safeSetClipboard(text, 'Copied parameter atlas as JSON');
    }

    function copyUrlParamsOnly() {
        const lines = [];
        Object.keys(paramIndex).sort().forEach(name => {
            const entry = paramIndex[name];
            if ((entry.sources.urlQuery || 0) > 0) {
                const example = entry.examples[0] || '';
                lines.push(`${name} = ${example}    (urlQuery hits: ${entry.sources.urlQuery})`);
            }
        });
        const text = lines.join('\n');
        safeSetClipboard(text, `Copied ${lines.length} URL query parameters`);
    }

    function resetAtlas() {
        if (!confirm('ParamScope: reset all collected parameters?')) return;
        paramIndex = {};
        lastScanTimestamp = null;
        GM_setValue(STORAGE_KEY, paramIndex);
        updateUI();
        showNotification('ParamScope cleared');
    }

    function makeDraggable(element, handle) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        const dragHandle = handle || element;

        dragHandle.addEventListener('mousedown', dragMouseDown);

        function dragMouseDown(e) {
            e.preventDefault();
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.addEventListener('mouseup', closeDragElement);
            document.addEventListener('mousemove', elementDrag);
        }

        function elementDrag(e) {
            e.preventDefault();
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            element.style.top = (element.offsetTop - pos2) + 'px';
            element.style.left = (element.offsetLeft - pos1) + 'px';
            element.style.right = 'auto';
        }

        function closeDragElement() {
            document.removeEventListener('mouseup', closeDragElement);
            document.removeEventListener('mousemove', elementDrag);
        }
    }

    function showNotification(message) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.85);
            color: white;
            padding: 12px 20px;
            border-radius: 5px;
            z-index: 100001;
            font-family: Arial, sans-serif;
            font-size: 13px;
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2000);
    }

    function togglePanelVisibility() {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
    }

    // ----------------------------------------
    // Init
    // ----------------------------------------

    function init() {
        if (!document.body) {
            const interval = setInterval(() => {
                if (document.body) {
                    clearInterval(interval);
                    init();
                }
            }, 100);
            return;
        }

        // Initial extraction after a short delay (allow DOM to settle)
        setTimeout(extractAllParameters, 2000);

        // React to DOM changes (debounced)
        let mutationTimeout = null;
        const observer = new MutationObserver(() => {
            if (mutationTimeout) return;
            mutationTimeout = setTimeout(() => {
                mutationTimeout = null;
                extractAllParameters();
            }, 2000);
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true
        });

        // Keyboard shortcut: Ctrl+Shift+P toggles panel
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
                togglePanelVisibility();
            }
        });

        // Tampermonkey menu commands
        GM_registerMenuCommand('Nebula Param Atlas: Copy all (text)', copyAllParamsAsText);
        GM_registerMenuCommand('Nebula Param Atlas: Copy all (JSON)', copyAllParamsAsJson);
        GM_registerMenuCommand('Nebula Param Atlas: Copy URL query params', copyUrlParamsOnly);
        GM_registerMenuCommand('Nebula Param Atlas: Reset atlas', resetAtlas);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
