/**
 * @file background.js
 * @description Service worker for the CoffeeBrk — New Tab Chrome Extension.
 *
 * Responsibilities:
 *  - Initialise and migrate user settings on install / update.
 *  - Provide a message-passing API (GET_SETTINGS, UPDATE_SETTINGS, RESET_SETTINGS,
 *    GET_ARTICLES, GET_CATEGORIES, BOOKMARK_ARTICLE, GET_BOOKMARKS, CLEAR_CACHE).
 *  - Cache API responses in memory to reduce network traffic.
 *  - Schedule a periodic alarm (every 15 minutes) to pre-warm the cache.
 *
 * @version 1.1.0
 * @author  CoffeeBrk.ai <hello@coffeebrk.ai>
 * @license Proprietary — © 2024 CoffeeBrk.ai. All rights reserved.
 */

'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Base URL for the CoffeeBrk public REST API. */
const API_BASE = 'https://app.coffeebrk.ai/wp-json/coffeebrk/v1/public';

/** In-memory cache TTL in milliseconds (5 minutes). */
const CACHE_DURATION = 5 * 60 * 1000;

/** Name of the periodic alarm used to refresh the cache. */
const ALARM_NAME = 'refreshCache';

// ─── Default Settings ─────────────────────────────────────────────────────────

/**
 * Default user preferences applied on first install and used as a fallback
 * during settings migration on extension update.
 *
 * IMPORTANT: Keep this object in sync with the DEFAULT_SETTINGS defined in
 * newtab.js and options.js — they share the same shape.
 *
 * @type {Object}
 */
const DEFAULT_SETTINGS = {
    // ── Appearance ─────────────────────────────────────────────────────────
    theme: 'dark',            // 'dark' | 'light' | 'system'
    accentColor: '#E07A4B',   // Warm orange accent
    cardLayout: 'grid',       // 'grid' | 'list' | 'compact'
    showImages: true,
    showExcerpts: true,
    cardsPerRow: 3,

    // ── Content ────────────────────────────────────────────────────────────
    defaultCategory: '',
    articlesPerPage: 20,
    showFeaturedCard: true,
    openLinksIn: 'newTab',    // 'newTab' | 'sameTab'

    // ── Shortcuts ──────────────────────────────────────────────────────────
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

    // ── Search ─────────────────────────────────────────────────────────────
    searchEngine: 'google',   // 'google' | 'bing' | 'duckduckgo'
    showSearchBar: true,

    // ── Greeting ───────────────────────────────────────────────────────────
    showGreeting: true,
    customGreeting: '',
    showDate: true,
    showTime: false,

    // ── Feed ───────────────────────────────────────────────────────────────
    autoRefresh: true,
    refreshInterval: 15,      // minutes
    showCategories: true,

    // ── Bookmarks ──────────────────────────────────────────────────────────
    showBookmarks: false,
    bookmarkedArticles: [],

    // ── Analytics ──────────────────────────────────────────────────────────
    trackUsage: false
};

// ─── Installation & Migration ─────────────────────────────────────────────────

/**
 * Fired when the extension is first installed or updated.
 * On install  → writes DEFAULT_SETTINGS to chrome.storage.sync.
 * On update   → deep-merges existing settings with any new default keys so
 *               new settings don't require a factory reset.
 *
 * @param {chrome.runtime.InstalledDetails} details
 */
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    } else if (details.reason === 'update') {
        // Forward-migrate: preserve user values, add any new default keys.
        const { settings = {} } = await chrome.storage.sync.get('settings');
        const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
        await chrome.storage.sync.set({ settings: mergedSettings });
    }
});

// ─── In-Memory Cache ──────────────────────────────────────────────────────────

/**
 * Simple keyed in-memory store for API responses.
 * Entries expire after CACHE_DURATION milliseconds.
 *
 * @type {Map<string, {data: any, timestamp: number}>}
 */
const cache = new Map();

/**
 * Returns cached data for the given key if it has not yet expired.
 *
 * @param  {string}        key  Cache key.
 * @returns {Promise<any|null>} Cached data, or null if absent / stale.
 */
async function getCachedData(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    return null;
}

/**
 * Stores data in the in-memory cache with the current timestamp.
 *
 * @param  {string} key   Cache key.
 * @param  {any}    data  Data to cache.
 * @returns {Promise<void>}
 */
async function setCachedData(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// ─── Message Routing ──────────────────────────────────────────────────────────

/**
 * Listens for messages from newtab.js, popup.js, and options.js pages and
 * dispatches them to the appropriate handler.
 *
 * Returning `true` from the listener keeps the message channel open for the
 * asynchronous response — required by Chrome's Manifest V3 spec.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true;
});

/**
 * Dispatches an incoming runtime message to the correct handler and sends
 * back a structured { success, ...payload } response.
 *
 * @param  {Object}   message
 * @param  {string}   message.type  Action type constant.
 * @param  {chrome.runtime.MessageSender} sender
 * @param  {function} sendResponse  Callback to return a value to the caller.
 * @returns {Promise<void>}
 */
async function handleMessage(message, sender, sendResponse) {
    try {
        switch (message.type) {
            case 'GET_SETTINGS': {
                const { settings = DEFAULT_SETTINGS } = await chrome.storage.sync.get('settings');
                sendResponse({ success: true, settings });
                break;
            }
            case 'UPDATE_SETTINGS': {
                const current = (await chrome.storage.sync.get('settings')).settings || DEFAULT_SETTINGS;
                const updated = { ...current, ...message.settings };
                await chrome.storage.sync.set({ settings: updated });
                sendResponse({ success: true, settings: updated });
                break;
            }
            case 'RESET_SETTINGS': {
                await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
                sendResponse({ success: true, settings: DEFAULT_SETTINGS });
                break;
            }
            case 'GET_ARTICLES': {
                const articles = await fetchArticles(message.page, message.category);
                sendResponse({ success: true, ...articles });
                break;
            }
            case 'GET_CATEGORIES': {
                const categories = await fetchCategories();
                sendResponse({ success: true, categories });
                break;
            }
            case 'BOOKMARK_ARTICLE': {
                const bookmarks = await toggleBookmark(message.article);
                sendResponse({ success: true, bookmarks });
                break;
            }
            case 'GET_BOOKMARKS': {
                const stored = await chrome.storage.sync.get('settings');
                sendResponse({ success: true, bookmarks: stored.settings?.bookmarkedArticles || [] });
                break;
            }
            case 'CLEAR_CACHE': {
                cache.clear();
                sendResponse({ success: true });
                break;
            }
            default:
                sendResponse({ success: false, error: 'Unknown message type' });
        }
    } catch (error) {
        console.error('[CoffeeBrk] Background handler error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

/**
 * Fetches a page of articles from the CoffeeBrk API, using the in-memory
 * cache to avoid redundant network requests.
 *
 * @param  {number} [page=1]       1-based page number.
 * @param  {string} [category=''] Category slug to filter by; empty = all.
 * @returns {Promise<Object>}      API response body (items, total_pages, …).
 * @throws {Error}                 Re-throws on non-OK HTTP status.
 */
async function fetchArticles(page = 1, category = '') {
    const cacheKey = `articles_${page}_${category}`;
    const cached = await getCachedData(cacheKey);
    if (cached) return cached;

    let url = `${API_BASE}/posts?page=${page}&per_page=20`;
    if (category) url += `&category=${encodeURIComponent(category)}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    await setCachedData(cacheKey, data);
    return data;
}

/**
 * Fetches the list of available article categories from the API, caching
 * the result for the standard CACHE_DURATION.
 *
 * @returns {Promise<Array>} Array of category objects { name, slug }.
 * @throws  {Error}          Re-throws on non-OK HTTP status.
 */
async function fetchCategories() {
    const cacheKey = 'categories';
    const cached = await getCachedData(cacheKey);
    if (cached) return cached;

    const response = await fetch(`${API_BASE}/categories`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    await setCachedData(cacheKey, data);
    return data;
}

// ─── Bookmarks ────────────────────────────────────────────────────────────────

/**
 * Toggles the bookmark state of the given article.
 * If the article is already bookmarked it is removed; otherwise it is prepended
 * to the list (most-recent first). The list is capped at 50 items.
 *
 * @param  {Object} article               Article payload from the API.
 * @param  {number} article.id            Unique article ID.
 * @param  {string} article.title         Article title.
 * @param  {string} article.permalink     Canonical URL.
 * @param  {string} [article.image]       Thumbnail URL.
 * @returns {Promise<Array>}              Updated bookmarks array.
 */
async function toggleBookmark(article) {
    const { settings = DEFAULT_SETTINGS } = await chrome.storage.sync.get('settings');
    const bookmarks = settings.bookmarkedArticles || [];

    const existingIndex = bookmarks.findIndex(b => b.id === article.id);
    if (existingIndex > -1) {
        bookmarks.splice(existingIndex, 1);
    } else {
        bookmarks.unshift({
            id: article.id,
            title: article.title,
            permalink: article.permalink,
            image: article.image,
            savedAt: Date.now()
        });
    }

    // Enforce maximum of 50 bookmarks to stay within sync storage quota.
    settings.bookmarkedArticles = bookmarks.slice(0, 50);
    await chrome.storage.sync.set({ settings });
    return settings.bookmarkedArticles;
}

// ─── Periodic Cache Refresh ───────────────────────────────────────────────────

/**
 * Creates the periodic cache-refresh alarm only if it does not already exist.
 * Chrome service workers can be restarted frequently; calling alarms.create()
 * unconditionally would keep resetting the timer.
 */
chrome.alarms.get(ALARM_NAME, (existingAlarm) => {
    if (!existingAlarm) {
        chrome.alarms.create(ALARM_NAME, { periodInMinutes: 15 });
    }
});

/**
 * Handles the periodic alarm tick by clearing the in-memory cache and
 * pre-fetching the first page of articles so the next new-tab open is instant.
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== ALARM_NAME) return;

    cache.clear();

    try {
        await fetchArticles(1, '');
        await fetchCategories();
    } catch (e) {
        // Pre-fetch failures are non-critical; the new tab will fetch on demand.
        console.error('[CoffeeBrk] Periodic cache refresh failed:', e);
    }
});
