// ==UserScript==
// @name         Age of Empires Mods - Direct Download Button
// @namespace    boiiii
// @version      1.2.0
// @description  Adds a direct download button on ageofempires.com mod detail pages and names the archive after the real mod title.
// @match        https://www.ageofempires.com/mods/*
// @match        https://ageofempires.com/mods/*
// @run-at       document-idle
// @grant        GM_download
// @grant        GM_xmlhttpRequest
// @connect      api.ageofempires.com
// @connect      *
// ==/UserScript==

(() => {
    'use strict';

    const API_URL = 'https://api.ageofempires.com/api/v1/mods/Download';
    const ROOT_ID = 'aoe-direct-mod-download-root';
    const STYLE_ID = 'aoe-direct-mod-download-style';
    const FALLBACK_BASENAME_PREFIX = 'aoe_';
    const DEFAULT_EXTENSION = '.zip';
    const MAX_ERROR_LENGTH = 600;

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

    function textOf(selector) {
        return compactText(document.querySelector(selector)?.textContent);
    }

    function attrOf(selector, attr) {
        return compactText(document.querySelector(selector)?.getAttribute(attr));
    }

    function jsonFromText(text) {
        try {
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    function stripSiteSuffix(value) {
        return compactText(value)
            .replace(/\s*[-–—|]\s*Mods?\s*[-–—|]\s*Age of Empires.*$/i, '')
            .replace(/\s*[-–—|]\s*Age of Empires.*$/i, '')
            .replace(/\s*[-–—|]\s*Mods?\s*$/i, '')
            .trim();
    }

    function isGenericTitle(value) {
        const title = stripSiteSuffix(value);
        return !title ||
            /^mods?$/i.test(title) ||
            /^mods?\s+single$/i.test(title) ||
            /^age of empires$/i.test(title) ||
            /^age of empires\s+mods?$/i.test(title) ||
            /^world'?s edge studio$/i.test(title);
    }

    function firstGoodTitle(candidates) {
        for (const candidate of candidates) {
            const cleaned = stripSiteSuffix(candidate);
            if (!isGenericTitle(cleaned)) return cleaned;
        }
        return '';
    }

    function getPageModTitle(modId) {
        /*
         * The AoE mod page uses generic OpenGraph titles like:
         * "Mods Single - Age of Empires - World's Edge Studio".
         * The actual mod name is in the rendered detail header:
         * #mod-detail-top h2
         */
        const sameModHref = `/mods/details/${modId}/`;

        const candidates = [
            textOf('#mod-detail-top h2'),
            textOf('#mod-detail .mods__details__top h2'),
            textOf('#mod-detail .mods__details__top__info h2'),
            textOf('.js-mods__details-page h2'),
            attrOf(`a[href*="${sameModHref}"] img[alt]`, 'alt'),
            textOf(`a[href*="${sameModHref}"]`),
            document.title,
            attrOf('meta[property="og:title"]', 'content'),
            attrOf('meta[name="twitter:title"]', 'content'),
        ];

        return firstGoodTitle(candidates) || `${FALLBACK_BASENAME_PREFIX}${modId}`;
    }

    function sanitizeBasename(rawName, modId) {
        const normalized = String(rawName || '')
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/&/g, 'And')
            .replace(/['’`]/g, '')
            .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
            .replace(/\s+/g, '')
            .replace(/[^\p{L}\p{N}()[\]{}+!,@#$%^=~._-]/gu, '')
            .replace(/^[.\s]+|[.\s]+$/g, '');

        return normalized.slice(0, 120) || `${FALLBACK_BASENAME_PREFIX}${modId}`;
    }

    function extensionFromUrl(downloadUrl) {
        try {
            const filename = new URL(downloadUrl).pathname.split('/').pop() || '';
            const match = filename.match(/\.(zip|7z|rar|tar|gz|tgz|bz2|xz)$/i);
            return match ? `.${match[1].toLowerCase()}` : DEFAULT_EXTENSION;
        } catch {
            return DEFAULT_EXTENSION;
        }
    }

    function filenameFromPage(modId, downloadUrl, payload) {
        const apiTitle = compactText(
            payload?.value?.title ||
            payload?.value?.name ||
            payload?.value?.modName ||
            payload?.title ||
            payload?.name ||
            payload?.modName
        );

        const realTitle = firstGoodTitle([apiTitle]) || getPageModTitle(modId);
        return `${sanitizeBasename(realTitle, modId)}${extensionFromUrl(downloadUrl)}`;
    }

    function setStatus(message, isError = false) {
        const status = document.querySelector(`#${ROOT_ID} .aoe-dd-status`);
        if (!status) return;

        status.textContent = message || '';
        status.dataset.error = isError ? '1' : '0';
    }

    function setProgress(loaded, total) {
        if (!Number.isFinite(loaded) || loaded <= 0) return;

        if (Number.isFinite(total) && total > 0) {
            const percent = Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
            setStatus(`Downloading archive… ${percent}%`);
            return;
        }

        const mib = loaded / 1048576;
        setStatus(`Downloading archive… ${mib.toFixed(mib >= 10 ? 0 : 1)} MiB`);
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
                // Ignore invalid URL candidate.
            }
        }

        return null;
    }

    async function requestDownloadInfo(modId) {
        const response = await fetch(API_URL, {
            method: 'POST',
            mode: 'cors',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                Accept: 'application/json, text/plain, */*',
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

        return {
            downloadUrl,
            filename: filenameFromPage(modId, downloadUrl, payload),
            payload,
        };
    }

    function gmDownload(url, filename) {
        return new Promise((resolve, reject) => {
            if (typeof GM_download !== 'function') {
                reject(new Error('GM_download is not available.'));
                return;
            }

            try {
                GM_download({
                    url,
                    name: filename,
                    saveAs: false,
                    onprogress: event => setProgress(event.loaded, event.total),
                    onload: () => resolve(),
                    ontimeout: () => reject(new Error('GM_download timed out.')),
                    onerror: error => {
                        const reason = compactText(error?.error || error?.details || error || 'unknown error');
                        reject(new Error(`GM_download failed: ${reason}`));
                    },
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function gmGetBlob(url) {
        return new Promise((resolve, reject) => {
            if (typeof GM_xmlhttpRequest !== 'function') {
                reject(new Error('GM_xmlhttpRequest is not available.'));
                return;
            }

            try {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    responseType: 'blob',
                    anonymous: true,
                    timeout: 0,
                    onprogress: event => setProgress(event.loaded, event.total),
                    onload: response => {
                        if (response.status < 200 || response.status >= 300) {
                            reject(new Error(`archive request returned HTTP ${response.status}`));
                            return;
                        }

                        const blob = response.response;
                        if (!(blob instanceof Blob) || blob.size === 0) {
                            reject(new Error('archive response was empty or not a Blob'));
                            return;
                        }

                        resolve(blob);
                    },
                    ontimeout: () => reject(new Error('archive request timed out')),
                    onerror: error => {
                        const reason = compactText(error?.error || error?.details || error || 'unknown error');
                        reject(new Error(`archive request failed: ${reason}`));
                    },
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    function saveBlob(blob, filename) {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');

        anchor.href = objectUrl;
        anchor.download = filename;
        anchor.style.display = 'none';

        document.body.appendChild(anchor);
        anchor.click();

        setTimeout(() => {
            URL.revokeObjectURL(objectUrl);
            anchor.remove();
        }, 30_000);
    }

    async function startNamedDownload(downloadUrl, filename) {
        setStatus(`Starting ${filename}…`);

        try {
            await gmDownload(downloadUrl, filename);
            setStatus(`Downloaded as ${filename}.`);
            return;
        } catch (gmError) {
            console.warn('[AoE direct mod downloader] GM_download failed; trying blob fallback.', gmError);
        }

        setStatus('Direct named download failed; using blob fallback…');
        const blob = await gmGetBlob(downloadUrl);
        saveBlob(blob, filename);
        setStatus(`Downloaded as ${filename}.`);
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
    width: min(360px, calc(100vw - 36px));
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
        button.textContent = 'Download named archive';

        const close = document.createElement('button');
        close.className = 'aoe-dd-close';
        close.type = 'button';
        close.title = 'Hide download button';
        close.setAttribute('aria-label', 'Hide download button');
        close.textContent = '×';

        const status = document.createElement('div');
        status.className = 'aoe-dd-status';
        status.dataset.error = '0';

        const detectedTitle = getPageModTitle(modId);
        status.textContent = `Detected title: ${detectedTitle}. Filename will remove spaces.`;

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
            button.textContent = 'Preparing download…';
            setStatus('Requesting the official download URL…');

            try {
                const { downloadUrl, filename } = await requestDownloadInfo(currentId);
                button.textContent = 'Downloading…';
                await startNamedDownload(downloadUrl, filename);

                button.textContent = 'Download again';
                button.disabled = false;
                busy = false;
            } catch (error) {
                console.error('[AoE direct mod downloader]', error);

                setStatus(
                    `${error?.message || error} — Make sure you are signed into ageofempires.com and allow Tampermonkey download/connect prompts.`,
                    true
                );

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
