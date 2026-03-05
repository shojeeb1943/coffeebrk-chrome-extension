/**
 * @file options.js
 * @description Settings/Options page controller for the CoffeeBrk Chrome Extension.
 *
 * Responsibilities:
 *  - Load persisted settings from the background service worker on page open.
 *  - Render all setting controls (toggles, selects, colour pickers, shortcuts list).
 *  - Persist changes immediately on user interaction via chrome.runtime messages.
 *  - Provide shortcut management: add, toggle, re-order (drag-and-drop), delete.
 *  - Support settings export to JSON and import from JSON.
 *  - Populate the default-category dropdown from the live API.
 *
 * @version 1.1.0
 * @author  CoffeeBrk.ai <hello@coffeebrk.ai>
 * @license Proprietary — © 2024 CoffeeBrk.ai. All rights reserved.
 */

(() => {
    'use strict';

    // ─── Default Settings ─────────────────────────────────────────────────────
    /**
     * Canonical defaults for every user-configurable setting.
     *
     * IMPORTANT: Keep this object in sync with the DEFAULT_SETTINGS defined in
     * background.js and newtab.js — they all share the same shape.
     *
     * @type {Object}
     */
    const DEFAULT_SETTINGS = {
        theme: 'dark',
        accentColor: '#E07A4B',
        cardLayout: 'grid',
        showImages: true,
        showExcerpts: true,
        cardsPerRow: 3,
        defaultCategory: '',
        articlesPerPage: 20,
        showFeaturedCard: true,
        openLinksIn: 'newTab',
        showShortcuts: true,
        shortcuts: [
            { name: 'Gmail', url: 'https://mail.google.com', icon: 'gmail', enabled: true },
            { name: 'YouTube', url: 'https://youtube.com', icon: 'youtube', enabled: true },
            { name: 'GitHub', url: 'https://github.com', icon: 'github', enabled: true },
            { name: 'X', url: 'https://x.com', icon: 'x', enabled: true },
            { name: 'CoffeeBrk', url: 'https://app.coffeebrk.ai', icon: 'coffeebrk', enabled: true },
            { name: 'ChatGPT', url: 'https://chat.openai.com', icon: 'chatgpt', enabled: true },
            { name: 'LinkedIn', url: 'https://linkedin.com', icon: 'linkedin', enabled: true },
            { name: 'Reddit', url: 'https://reddit.com', icon: 'reddit', enabled: true }
        ],
        maxShortcuts: 8,
        searchEngine: 'google',
        showSearchBar: true,
        showGreeting: true,
        customGreeting: '',
        showDate: true,
        showTime: false,
        autoRefresh: true,
        refreshInterval: 15,
        showCategories: true,
        showBookmarks: false,
        bookmarkedArticles: [],
        trackUsage: false
    };

    /** Live mutable copy of the settings, updated on every user interaction. @type {Object} */
    let currentSettings = { ...DEFAULT_SETTINGS };

    // ─── DOM References ──────────────────────────────────────────────────────
    const navTabs = document.querySelectorAll('.nav-tab');
    const sections = document.querySelectorAll('.settings-section');

    // ─── Initialisation ──────────────────────────────────────────────────────

    /**
     * Entry point: loads persisted settings then wires up all UI controls.
     * @returns {Promise<void>}
     */
    async function init() {
        await loadSettings();
        setupNavigation();
        setupAppearanceControls();
        setupShortcutsManager();
        setupFeedControls();
        setupSearchControls();
        setupAdvancedControls();
        loadCategories();
    }

    // ─── Settings Load / Save ────────────────────────────────────────────────

    /**
     * Requests the current settings from the background service worker and
     * falls back to DEFAULT_SETTINGS if the message fails.
     *
     * @returns {Promise<void>}
     */
    async function loadSettings() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
            if (response.success) {
                currentSettings = { ...DEFAULT_SETTINGS, ...response.settings };
            }
        } catch (e) {
            // Background worker unavailable — use local defaults.
        }
        applySettingsToUI();
    }

    /**
     * Mirrors the current in-memory settings object into every UI control.
     * Called after load and after a full settings reset.
     */
    function applySettingsToUI() {
        // Theme buttons
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === currentSettings.theme);
        });

        // Accent colour picker
        document.getElementById('accentColor').value = currentSettings.accentColor;

        // Toggle controls
        setToggle('showImages', currentSettings.showImages);
        setToggle('showExcerpts', currentSettings.showExcerpts);
        setToggle('showFeaturedCard', currentSettings.showFeaturedCard);
        setToggle('showShortcuts', currentSettings.showShortcuts);
        setToggle('showCategories', currentSettings.showCategories);
        setToggle('autoRefresh', currentSettings.autoRefresh);
        setToggle('showSearchBar', currentSettings.showSearchBar);
        setToggle('showGreeting', currentSettings.showGreeting);
        setToggle('showDate', currentSettings.showDate);
        setToggle('showTime', currentSettings.showTime);

        // Select / dropdown controls
        setSelect('cardLayout', currentSettings.cardLayout);
        setSelect('articlesPerPage', currentSettings.articlesPerPage);
        setSelect('refreshInterval', currentSettings.refreshInterval);
        setSelect('openLinksIn', currentSettings.openLinksIn);
        setSelect('searchEngine', currentSettings.searchEngine);
        setSelect('defaultCategory', currentSettings.defaultCategory);

        // Text inputs
        document.getElementById('customGreeting').value = currentSettings.customGreeting || '';

        // Shortcuts list
        renderShortcuts();
    }

    /**
     * Sets a checkbox toggle element to the given value.
     *
     * @param {string}  id     Element ID.
     * @param {boolean} value  Checked state to apply.
     */
    function setToggle(id, value) {
        const el = document.getElementById(id);
        if (el) el.checked = value;
    }

    /**
     * Sets a <select> element to the given value.
     *
     * @param {string} id     Element ID.
     * @param {*}      value  Option value to select.
     */
    function setSelect(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    /**
     * Sends the current in-memory settings to the background service worker
     * for persistence in chrome.storage.sync.
     *
     * @returns {Promise<void>}
     */
    async function saveSettings() {
        try {
            await chrome.runtime.sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: currentSettings
            });
            showToast('Settings saved');
        } catch (e) {
            showToast('Failed to save settings', true);
        }
    }

    // ─── Toast Notification ──────────────────────────────────────────────────

    /**
     * Briefly displays a toast notification at the bottom of the options page.
     *
     * @param {string}  message         Text to display.
     * @param {boolean} [isError=false] When true, applies error styling.
     */
    function showToast(message, isError = false) {
        const toastEl = document.getElementById('toast');
        const toastIcon = toastEl.querySelector('.toast-icon');
        const toastMsg = toastEl.querySelector('.toast-message');

        toastMsg.textContent = message;
        toastEl.style.borderColor = isError ? 'var(--danger)' : 'var(--success)';
        toastIcon.style.color = isError ? 'var(--danger)' : 'var(--success)';

        toastEl.classList.add('show');
        setTimeout(() => toastEl.classList.remove('show'), 3000);
    }

    // ─── Navigation ──────────────────────────────────────────────────────────

    /**
     * Wires the sidebar navigation tabs to show/hide the corresponding
     * settings section panels.
     */
    function setupNavigation() {
        navTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const sectionId = tab.dataset.section;

                navTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                sections.forEach(s => {
                    s.classList.toggle('active', s.id === sectionId);
                });
            });
        });
    }

    // ─── Appearance Controls ─────────────────────────────────────────────────

    /**
     * Attaches event listeners for all Appearance section controls:
     * theme selector buttons, accent colour picker, colour presets,
     * card layout select, and image/excerpt/featured toggles.
     */
    function setupAppearanceControls() {
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentSettings.theme = btn.dataset.theme;
                saveSettings();
            });
        });

        document.getElementById('accentColor').addEventListener('change', (e) => {
            currentSettings.accentColor = e.target.value;
            saveSettings();
        });

        document.querySelectorAll('.color-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.dataset.color;
                document.getElementById('accentColor').value = color;
                currentSettings.accentColor = color;
                saveSettings();
            });
        });

        document.getElementById('cardLayout').addEventListener('change', (e) => {
            currentSettings.cardLayout = e.target.value;
            saveSettings();
        });

        setupToggle('showImages');
        setupToggle('showExcerpts');
        setupToggle('showFeaturedCard');
    }

    /**
     * Registers a change listener on a checkbox toggle that automatically
     * updates `currentSettings` and persists the change.
     *
     * @param {string} id  ID of the checkbox element to observe.
     */
    function setupToggle(id) {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', (e) => {
                currentSettings[id] = e.target.checked;
                saveSettings();
            });
        }
    }

    // ─── Shortcuts Manager ───────────────────────────────────────────────────

    /**
     * Initialises the Shortcuts section: registers the Add / Cancel / Save
     * modal controls, backdrop-click dismissal, and delegates toggle/delete
     * actions to the rendered shortcut list rows.
     */
    function setupShortcutsManager() {
        setupToggle('showShortcuts');
        renderShortcuts();

        document.getElementById('addShortcut').addEventListener('click', () => {
            document.getElementById('shortcutModal').classList.add('active');
        });

        document.getElementById('cancelShortcut').addEventListener('click', () => {
            document.getElementById('shortcutModal').classList.remove('active');
            clearShortcutForm();
        });

        document.getElementById('saveShortcut').addEventListener('click', () => {
            const name = document.getElementById('shortcutName').value.trim();
            const url = document.getElementById('shortcutUrl').value.trim();

            if (!name || !url) {
                showToast('Please fill in all fields', true);
                return;
            }
            if (!isValidUrl(url)) {
                showToast('Please enter a valid URL', true);
                return;
            }

            currentSettings.shortcuts.push({
                name,
                url: url.startsWith('http') ? url : 'https://' + url,
                icon: 'custom',
                enabled: true
            });

            saveSettings();
            renderShortcuts();
            document.getElementById('shortcutModal').classList.remove('active');
            clearShortcutForm();
        });

        // Close modal when clicking outside the dialog panel
        document.getElementById('shortcutModal').addEventListener('click', (e) => {
            if (e.target.id === 'shortcutModal') {
                document.getElementById('shortcutModal').classList.remove('active');
                clearShortcutForm();
            }
        });
    }

    /** Resets the Add Shortcut form fields to empty. */
    function clearShortcutForm() {
        document.getElementById('shortcutName').value = '';
        document.getElementById('shortcutUrl').value = '';
    }

    /**
     * Validates that a string represents a reasonably well-formed URL.
     * Prepends `https://` if no scheme is specified before testing.
     *
     * @param  {string}  string  URL string to validate.
     * @returns {boolean}         True when the URL is structurally valid.
     */
    function isValidUrl(string) {
        try {
            const url = string.startsWith('http') ? string : 'https://' + string;
            new URL(url);
            return true;
        } catch (_) {
            return false;
        }
    }

    /**
     * (Re-)renders the full list of shortcuts into `#shortcutsList`.
     * Each row includes a drag handle, favicon placeholder, info, enable toggle,
     * and delete button. Drag-and-drop reordering is also attached here.
     */
    function renderShortcuts() {
        const list = document.getElementById('shortcutsList');
        list.innerHTML = '';

        currentSettings.shortcuts.forEach((shortcut, index) => {
            const item = document.createElement('div');
            item.className = 'shortcut-item';
            item.draggable = true;
            item.dataset.index = index;

            item.innerHTML = `
                <div class="shortcut-drag">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="16" y2="6"/>
                        <line x1="8" y1="12" x2="16" y2="12"/>
                        <line x1="8" y1="18" x2="16" y2="18"/>
                    </svg>
                </div>
                <div class="shortcut-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="2" y1="12" x2="22" y2="12"/>
                        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/>
                    </svg>
                </div>
                <div class="shortcut-info">
                    <div class="shortcut-name">${escapeHtml(shortcut.name)}</div>
                    <div class="shortcut-url">${escapeHtml(shortcut.url)}</div>
                </div>
                <div class="shortcut-actions">
                    <label class="toggle toggle-sm">
                        <input type="checkbox" ${shortcut.enabled ? 'checked' : ''} data-index="${index}">
                        <span class="toggle-slider"></span>
                    </label>
                    <button class="shortcut-delete" data-index="${index}" title="Remove">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                        </svg>
                    </button>
                </div>
            `;

            item.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                currentSettings.shortcuts[index].enabled = e.target.checked;
                saveSettings();
            });

            item.querySelector('.shortcut-delete').addEventListener('click', () => {
                currentSettings.shortcuts.splice(index, 1);
                saveSettings();
                renderShortcuts();
            });

            item.addEventListener('dragstart', handleDragStart);
            item.addEventListener('dragover', handleDragOver);
            item.addEventListener('drop', handleDrop);
            item.addEventListener('dragend', handleDragEnd);

            list.appendChild(item);
        });
    }

    // ─── Drag-and-Drop Handlers ──────────────────────────────────────────────

    /** @type {number|null} Index of the shortcut row currently being dragged. */
    let draggedIndex = null;

    /** @param {DragEvent} e */
    function handleDragStart(e) {
        draggedIndex = parseInt(e.target.dataset.index);
        e.target.classList.add('dragging');
    }

    /** @param {DragEvent} e */
    function handleDragOver(e) {
        e.preventDefault();
    }

    /**
     * Drops the dragged shortcut at the target position and re-renders the list.
     * @param {DragEvent} e
     */
    function handleDrop(e) {
        e.preventDefault();
        const dropIndex = parseInt(e.target.closest('.shortcut-item')?.dataset.index);
        if (dropIndex !== undefined && draggedIndex !== null && draggedIndex !== dropIndex) {
            const item = currentSettings.shortcuts.splice(draggedIndex, 1)[0];
            currentSettings.shortcuts.splice(dropIndex, 0, item);
            saveSettings();
            renderShortcuts();
        }
    }

    /** @param {DragEvent} e */
    function handleDragEnd(e) {
        e.target.classList.remove('dragging');
        draggedIndex = null;
    }

    // ─── XSS Helper ──────────────────────────────────────────────────────────

    /**
     * Safely HTML-encodes a string via the browser's own text-node serialiser.
     *
     * @param  {string} str  Raw input.
     * @returns {string}      HTML-safe string.
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // ─── Feed Controls ───────────────────────────────────────────────────────

    /**
     * Attaches event listeners for all Feed section controls:
     * categories toggle, auto-refresh toggle, default category, articles-per-page,
     * refresh interval, and open-links-in select.
     */
    function setupFeedControls() {
        setupToggle('showCategories');
        setupToggle('autoRefresh');

        document.getElementById('defaultCategory').addEventListener('change', (e) => {
            currentSettings.defaultCategory = e.target.value;
            saveSettings();
        });

        document.getElementById('articlesPerPage').addEventListener('change', (e) => {
            currentSettings.articlesPerPage = parseInt(e.target.value);
            saveSettings();
        });

        document.getElementById('refreshInterval').addEventListener('change', (e) => {
            currentSettings.refreshInterval = parseInt(e.target.value);
            saveSettings();
        });

        document.getElementById('openLinksIn').addEventListener('change', (e) => {
            currentSettings.openLinksIn = e.target.value;
            saveSettings();
        });
    }

    // ─── Search & Greeting Controls ──────────────────────────────────────────

    /**
     * Attaches event listeners for all Search section controls:
     * search bar, greeting, date/time visibility, search engine select,
     * and custom greeting text.
     */
    function setupSearchControls() {
        setupToggle('showSearchBar');
        setupToggle('showGreeting');
        setupToggle('showDate');
        setupToggle('showTime');

        document.getElementById('searchEngine').addEventListener('change', (e) => {
            currentSettings.searchEngine = e.target.value;
            saveSettings();
        });

        document.getElementById('customGreeting').addEventListener('change', (e) => {
            currentSettings.customGreeting = e.target.value;
            saveSettings();
        });
    }

    // ─── Advanced Controls ───────────────────────────────────────────────────

    /**
     * Attaches event listeners for all Advanced section controls:
     * clear cache, reset to defaults, export settings to JSON, and
     * import settings from a JSON file.
     */
    function setupAdvancedControls() {
        document.getElementById('clearCache').addEventListener('click', async () => {
            try {
                await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' });
                showToast('Cache cleared');
            } catch (e) {
                showToast('Failed to clear cache', true);
            }
        });

        document.getElementById('resetSettings').addEventListener('click', async () => {
            if (confirm('Are you sure you want to reset all settings to defaults?')) {
                try {
                    const response = await chrome.runtime.sendMessage({ type: 'RESET_SETTINGS' });
                    if (response.success) {
                        currentSettings = { ...DEFAULT_SETTINGS, ...response.settings };
                        applySettingsToUI();
                        showToast('Settings reset to defaults');
                    }
                } catch (e) {
                    showToast('Failed to reset settings', true);
                }
            }
        });

        // Export settings as a downloadable JSON file
        document.getElementById('exportSettings').addEventListener('click', () => {
            const data = JSON.stringify(currentSettings, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'coffeebrk-settings.json';
            a.click();
            URL.revokeObjectURL(url);
            showToast('Settings exported');
        });

        // Import settings from a user-selected JSON file
        const importBtn = document.getElementById('importSettings');
        const importFile = document.getElementById('importFile');

        importBtn.addEventListener('click', () => importFile.click());

        importFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const imported = JSON.parse(event.target.result);
                    currentSettings = { ...DEFAULT_SETTINGS, ...imported };
                    await saveSettings();
                    applySettingsToUI();
                    showToast('Settings imported');
                } catch (err) {
                    showToast('Invalid settings file', true);
                }
            };
            reader.readAsText(file);
            // Clear the input so the same file can be re-selected if needed
            importFile.value = '';
        });
    }

    // ─── Category Dropdown Population ────────────────────────────────────────

    /**
     * Fetches the list of available categories from the background worker cache
     * and appends them as <option> elements to the Default Category dropdown.
     *
     * @returns {Promise<void>}
     */
    async function loadCategories() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_CATEGORIES' });
            if (response.success && response.categories) {
                const select = document.getElementById('defaultCategory');
                response.categories.forEach(cat => {
                    const option = document.createElement('option');
                    option.value = cat.slug;
                    option.textContent = cat.name;
                    select.appendChild(option);
                });
                select.value = currentSettings.defaultCategory;
            }
        } catch (e) {
            // Categories are cosmetic — silently skip if unavailable.
        }
    }

    // ─── Start ───────────────────────────────────────────────────────────────
    init();
})();
