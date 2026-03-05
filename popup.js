/**
 * @file popup.js
 * @description Popup controller for the CoffeeBrk Chrome Extension.
 *
 * Renders the quick-access toolbar popup (opened when the user clicks the
 * extension icon). Provides fast toggles for the most common settings and
 * a one-click feed refresh button without requiring the full Options page.
 *
 * Features:
 *  - Dark mode / light mode toggle
 *  - Show/hide shortcuts toggle
 *  - Show/hide images toggle
 *  - Bookmarks count display
 *  - Articles-read-today counter (sourced from localStorage, stays on-device)
 *  - Refresh feed button (clears background cache and reloads open new-tab pages)
 *
 * @version 1.1.0
 * @author  CoffeeBrk.ai <hello@coffeebrk.ai>
 * @license Proprietary — © 2024 CoffeeBrk.ai. All rights reserved.
 */

(() => {
    'use strict';

    // ─── Initialisation ──────────────────────────────────────────────────────

    /**
     * Entry point: loads settings, wires up controls, and updates stats.
     * @returns {Promise<void>}
     */
    async function init() {
        await loadSettings();
        setupControls();
        updateStats();
    }

    // ─── Settings ────────────────────────────────────────────────────────────

    /**
     * Retrieves the current settings from the background service worker and
     * pre-fills the popup toggle states.
     *
     * @returns {Promise<void>}
     */
    async function loadSettings() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
            if (response.success) {
                const settings = response.settings;

                // Theme: treat anything other than 'dark' as light mode
                document.getElementById('darkMode').checked = settings.theme === 'dark';
                document.getElementById('showShortcuts').checked = settings.showShortcuts !== false;
                document.getElementById('showImages').checked = settings.showImages !== false;

                // Show current bookmarks count
                document.getElementById('bookmarksCount').textContent =
                    settings.bookmarkedArticles?.length || 0;
            }
        } catch (e) {
            // Background worker not reachable — controls remain at HTML default state.
        }
    }

    // ─── Controls ────────────────────────────────────────────────────────────

    /**
     * Attaches change/click listeners to all interactive popup controls.
     */
    function setupControls() {
        // Dark mode toggle
        document.getElementById('darkMode').addEventListener('change', async (e) => {
            await updateSetting('theme', e.target.checked ? 'dark' : 'light');
        });

        // Show shortcuts toggle
        document.getElementById('showShortcuts').addEventListener('change', async (e) => {
            await updateSetting('showShortcuts', e.target.checked);
        });

        // Show images toggle
        document.getElementById('showImages').addEventListener('change', async (e) => {
            await updateSetting('showImages', e.target.checked);
        });

        // Refresh feed button
        const btn = document.getElementById('refreshFeed');
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite">
                    <path d="M23 4v6h-6"/>
                    <path d="M1 20v-6h6"/>
                    <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                </svg>
                Refreshing...
            `;

            try {
                // Clear the background cache so the next new-tab load fetches fresh data
                await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });

                // Reload any currently open new-tab pages to pick up the fresh feed
                chrome.tabs.query({ url: 'chrome://newtab/*' }, (tabs) => {
                    tabs.forEach(tab => chrome.tabs.reload(tab.id));
                });
            } catch (e) {
                // Refresh is best-effort; the next new-tab open will still fetch fresh data.
            }

            // Restore button after a short feedback delay
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M23 4v6h-6"/>
                        <path d="M1 20v-6h6"/>
                        <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
                    </svg>
                    Refresh Feed
                `;
            }, 1500);
        });
    }

    // ─── Settings Helpers ────────────────────────────────────────────────────

    /**
     * Reads the current settings from the background, merges a single key-value
     * change, and persists the result.
     *
     * @param  {string} key    Settings key to update (e.g. 'theme').
     * @param  {*}      value  New value for the key.
     * @returns {Promise<void>}
     */
    async function updateSetting(key, value) {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
            if (response.success) {
                const settings = { ...response.settings, [key]: value };
                await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings });
            }
        } catch (e) {
            // Setting update failed silently — user can retry via Options page.
        }
    }

    // ─── Stats ───────────────────────────────────────────────────────────────

    /**
     * Reads the daily articles-read counter from localStorage and displays it
     * in the popup. Resets naturally when the stored date differs from today.
     * No data is sent off-device.
     */
    function updateStats() {
        const today = new Date().toDateString();
        const articlesRaw = localStorage.getItem('coffeebrk_articles_read');
        if (!articlesRaw) return;

        try {
            const data = JSON.parse(articlesRaw);
            if (data.date === today) {
                document.getElementById('articlesRead').textContent = data.count || 0;
            }
        } catch (e) {
            // Corrupted localStorage entry — ignore, will reset on next article click.
        }
    }

    // ─── Keyframe for spinner ────────────────────────────────────────────────

    /**
     * Injects the @keyframes spin rule required by the refresh-button spinner.
     * Keeping it here avoids adding an extra <style> block in popup.html.
     */
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    // ─── Start ───────────────────────────────────────────────────────────────
    init();
})();
