/**
 * CoffeeBrk Popup JavaScript
 * Quick settings and actions from the extension icon popup.
 */

(() => {
    'use strict';

    async function init() {
        await loadSettings();
        setupControls();
        updateStats();
    }

    async function loadSettings() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
            if (response.success) {
                const settings = response.settings;

                // Dark mode (theme)
                document.getElementById('darkMode').checked = settings.theme === 'dark';

                // Show shortcuts
                document.getElementById('showShortcuts').checked = settings.showShortcuts !== false;

                // Show images
                document.getElementById('showImages').checked = settings.showImages !== false;

                // Update bookmarks count
                document.getElementById('bookmarksCount').textContent =
                    settings.bookmarkedArticles?.length || 0;
            }
        } catch (e) {
            console.log('Could not load settings');
        }
    }

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
        document.getElementById('refreshFeed').addEventListener('click', async () => {
            const btn = document.getElementById('refreshFeed');
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
                await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
                // Notify any open new tab pages to refresh
                chrome.tabs.query({ url: 'chrome://newtab/*' }, (tabs) => {
                    tabs.forEach(tab => {
                        chrome.tabs.reload(tab.id);
                    });
                });
            } catch (e) {
                console.log('Refresh failed');
            }

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

    async function updateSetting(key, value) {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
            if (response.success) {
                const settings = { ...response.settings, [key]: value };
                await chrome.runtime.sendMessage({ type: 'UPDATE_SETTINGS', settings });
            }
        } catch (e) {
            console.log('Could not update setting');
        }
    }

    function updateStats() {
        // Articles read today - stored in local storage
        const today = new Date().toDateString();
        const articlesData = localStorage.getItem('coffeebrk_articles_read');
        if (articlesData) {
            try {
                const data = JSON.parse(articlesData);
                if (data.date === today) {
                    document.getElementById('articlesRead').textContent = data.count || 0;
                }
            } catch (e) {
                // Invalid data
            }
        }
    }

    // Add CSS for spin animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(style);

    init();
})();
