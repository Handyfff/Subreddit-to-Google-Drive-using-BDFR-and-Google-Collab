// ==UserScript==
// @name         Age of Empires Mods - Direct Download Button
// @namespace    https://chatgpt.com/
// @version      1.0.0
// @description  Adds a direct download button on ageofempires.com mod detail pages.
// @match        https://www.ageofempires.com/mods/*
// @match        https://ageofempires.com/mods/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const API_URL = 'https://api.ageofempires.com/api/v1/mods/Download';
    const ROOT_ID = 'aoe-direct-mod-download-root';
    const STYLE_ID = 'aoe-direct-mod-download-style';
    const MAX_ERROR_LENGTH = 500;

    let lastUrl = location.href;
    let busy = false;
    let dismissedForModId = null;

    function parseModId(href = location.href) {
        try {
            const url = new URL(href);
            const match = url.pathname.match(/\/mods\/details\/(\d+)(?:\/|$)/i);
            if (!match) return null;

            const id = Number(match[1]);
            return Number.isSafeInteger(id) && id > 0 ? id : null;
        } catch {
            return null;
        }
    }

    function compactText(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, MAX_ERROR_LENGTH);
    }

    function jsonFromText(text) {
        try {
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    function setStatus(message, isError = false) {
        const status = document.querySelector(`#${ROOT_ID} .aoe-dd-status`);
        if (!status) return;

        status.textContent = message || '';
        status.dataset.error = isError ? '1' : '0';
    }

    function getDownloadUrlFromPayload(payload) {
        const candidates = [
            payload?.value?.downloadUrl,
            payload?.value?.url,
            payload?.downloadUrl,
            payload?.url,
        ];

        for (const candidate of candidates) {
            if (typeof candidate !== 'string') continue;

            try {
                const url = new URL(candidate.trim());
                if (url.protocol === 'https:' || url.protocol === 'http:') {
                    return url.href;
                }
            } catch {
                // Ignore invalid candidates.
            }
        }

        return null;
    }

    async function requestDownloadUrl(modId) {
        const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: modId, boolValue: true }),
        });

        const text = await response.text();
        const payload = jsonFromText(text);

        if (!response.ok) {
            const detail = compactText(payload?.message || payload?.error || text || response.statusText);
            throw new Error(`Age of Empires API returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
        }

        const downloadUrl = getDownloadUrlFromPayload(payload);
        if (!downloadUrl) {
            const detail = compactText(text);
            throw new Error(`API answered, but no download URL was found${detail ? `: ${detail}` : '.'}`);
        }

        return downloadUrl;
    }

    function ensureStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
#${ROOT_ID} {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 2147483647;
    width: min(340px, calc(100vw - 36px));
    box-sizing: border-box;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #fff;
}
#${ROOT_ID} .aoe-dd-card {
    background: rgba(20, 20, 20, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 12px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.36);
    padding: 12px;
}
#${ROOT_ID} .aoe-dd-title {
    font-size: 13px;
    line-height: 1.35;
    font-weight: 700;
    margin: 0 0 9px;
}
#${ROOT_ID} .aoe-dd-row {
    display: flex;
    gap: 8px;
    align-items: center;
}
#${ROOT_ID} .aoe-dd-button {
    appearance: none;
    border: 0;
    border-radius: 9px;
    padding: 10px 12px;
    width: 100%;
    font: inherit;
    font-size: 14px;
    font-weight: 800;
    line-height: 1;
    color: #101010;
    background: #f5c542;
    cursor: pointer;
}
#${ROOT_ID} .aoe-dd-button:hover:not(:disabled) {
    filter: brightness(1.07);
}
#${ROOT_ID} .aoe-dd-button:disabled {
    opacity: 0.65;
    cursor: wait;
}
#${ROOT_ID} .aoe-dd-close {
    appearance: none;
    border: 0;
    border-radius: 9px;
    width: 38px;
    height: 34px;
    flex: 0 0 38px;
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
}
#${ROOT_ID} .aoe-dd-close:hover {
    background: rgba(255, 255, 255, 0.20);
}
#${ROOT_ID} .aoe-dd-status {
    min-height: 16px;
    margin-top: 8px;
    font-size: 12px;
    line-height: 1.35;
    color: rgba(255, 255, 255, 0.76);
    overflow-wrap: anywhere;
}
#${ROOT_ID} .aoe-dd-status[data-error="1"] {
    color: #ffb3b3;
}
        `.trim();

        document.head.appendChild(style);
    }

    function removeButton() {
        document.getElementById(ROOT_ID)?.remove();
    }

    function dismissButton() {
        dismissedForModId = parseModId();
        removeButton();
    }

    function createButton(modId) {
        ensureStyle();

        const root = document.createElement('div');
        root.id = ROOT_ID;
        root.dataset.modId = String(modId);

        const card = document.createElement('div');
        card.className = 'aoe-dd-card';

        const title = document.createElement('div');
        title.className = 'aoe-dd-title';
        title.textContent = `Age of Empires mod #${modId}`;

        const row = document.createElement('div');
        row.className = 'aoe-dd-row';

        const button = document.createElement('button');
        button.className = 'aoe-dd-button';
        button.type = 'button';
        button.textContent = 'Download mod archive';

        const close = document.createElement('button');
        close.className = 'aoe-dd-close';
        close.type = 'button';
        close.title = 'Hide download button';
        close.setAttribute('aria-label', 'Hide download button');
        close.textContent = '×';

        const status = document.createElement('div');
        status.className = 'aoe-dd-status';
        status.dataset.error = '0';
        status.textContent = 'Sign in on ageofempires.com first, then click this.';

        close.addEventListener('click', dismissButton);

        button.addEventListener('click', async () => {
            if (busy) return;

            const currentId = parseModId();
            if (!currentId) {
                setStatus('No mod ID found in this page URL.', true);
                return;
            }

            busy = true;
            button.disabled = true;
            button.textContent = 'Getting download link…';
            setStatus('Requesting the official download URL…');

            try {
                const downloadUrl = await requestDownloadUrl(currentId);
                setStatus('Download starting. If nothing happens, allow downloads/popups for this site.');
                window.location.assign(downloadUrl);
            } catch (error) {
                console.error('[AoE direct mod downloader]', error);
                setStatus(`${error?.message || error} — Make sure you are signed into ageofempires.com in this browser.`, true);
                button.disabled = false;
                button.textContent = 'Try download again';
                busy = false;
            }
        });

        row.append(button, close);
        card.append(title, row, status);
        root.appendChild(card);
        document.body.appendChild(root);
    }

    function syncButton() {
        const modId = parseModId();
        const existing = document.getElementById(ROOT_ID);

        if (!modId) {
            removeButton();
            return;
        }

        if (dismissedForModId === modId) {
            removeButton();
            return;
        }

        if (existing?.dataset.modId === String(modId)) return;

        removeButton();
        createButton(modId);
    }

    function onPossibleUrlChange() {
        if (location.href === lastUrl) return;

        const previousId = parseModId(lastUrl);
        lastUrl = location.href;
        const nextId = parseModId(location.href);

        if (previousId !== nextId) dismissedForModId = null;

        busy = false;
        setTimeout(syncButton, 50);
    }

    function patchHistoryMethod(name) {
        const original = history[name];
        if (typeof original !== 'function') return;

        history[name] = function patchedHistoryMethod(...args) {
            const result = original.apply(this, args);
            queueMicrotask(onPossibleUrlChange);
            return result;
        };
    }

    patchHistoryMethod('pushState');
    patchHistoryMethod('replaceState');

    window.addEventListener('popstate', () => setTimeout(onPossibleUrlChange, 0));

    const observer = new MutationObserver(syncButton);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    syncButton();
})();
