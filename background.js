/**
 * CoffeeBrk Background Service Worker
 * Handles caching, settings management, and periodic updates.
 */

const API_BASE = 'https://app.coffeebrk.ai/wp-json/coffeebrk/v1/public';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Default settings
const DEFAULT_SETTINGS = {
    // Appearance
    theme: 'dark', // 'dark', 'light', 'system'
    accentColor: '#E07A4B', // Warm orange
    cardLayout: 'grid', // 'grid', 'list', 'compact'
    showImages: true,
    showExcerpts: true,
    cardsPerRow: 3,

    // Content
    defaultCategory: '',
    articlesPerPage: 20,
    showFeaturedCard: true,
    openLinksIn: 'newTab', // 'newTab', 'sameTab'

    // Shortcuts
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

    // Search
    searchEngine: 'google', // 'google', 'bing', 'duckduckgo'
    showSearchBar: true,

    // Greeting
    showGreeting: true,
    customGreeting: '',
    showDate: true,
    showTime: false,

    // Feed
    autoRefresh: true,
    refreshInterval: 15, // minutes
    showCategories: true,

    // Bookmarks
    showBookmarks: false,
    bookmarkedArticles: [],

    // Analytics
    trackUsage: false
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
        console.log('CoffeeBrk: Default settings initialized');
    } else if (details.reason === 'update') {
        // Merge new default settings with existing ones
        const { settings = {} } = await chrome.storage.sync.get('settings');
        const mergedSettings = { ...DEFAULT_SETTINGS, ...settings };
        await chrome.storage.sync.set({ settings: mergedSettings });
        console.log('CoffeeBrk: Settings migrated to new version');
    }
});

// Cache management
const cache = new Map();

async function getCachedData(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    return null;
}

async function setCachedData(key, data) {
    cache.set(key, {
        data,
        timestamp: Date.now()
    });
}

// Message handling from popup and newtab
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse);
    return true; // Keep channel open for async response
});

async function handleMessage(message, sender, sendResponse) {
    try {
        switch (message.type) {
            case 'GET_SETTINGS':
                const { settings = DEFAULT_SETTINGS } = await chrome.storage.sync.get('settings');
                sendResponse({ success: true, settings });
                break;

            case 'UPDATE_SETTINGS':
                const currentSettings = (await chrome.storage.sync.get('settings')).settings || DEFAULT_SETTINGS;
                const newSettings = { ...currentSettings, ...message.settings };
                await chrome.storage.sync.set({ settings: newSettings });
                sendResponse({ success: true, settings: newSettings });
                break;

            case 'RESET_SETTINGS':
                await chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
                sendResponse({ success: true, settings: DEFAULT_SETTINGS });
                break;

            case 'GET_ARTICLES':
                const articles = await fetchArticles(message.page, message.category);
                sendResponse({ success: true, ...articles });
                break;

            case 'GET_CATEGORIES':
                const categories = await fetchCategories();
                sendResponse({ success: true, categories });
                break;

            case 'BOOKMARK_ARTICLE':
                const bookmarks = await toggleBookmark(message.article);
                sendResponse({ success: true, bookmarks });
                break;

            case 'GET_BOOKMARKS':
                const stored = await chrome.storage.sync.get('settings');
                sendResponse({ success: true, bookmarks: stored.settings?.bookmarkedArticles || [] });
                break;

            case 'CLEAR_CACHE':
                cache.clear();
                sendResponse({ success: true });
                break;

            default:
                sendResponse({ success: false, error: 'Unknown message type' });
        }
    } catch (error) {
        console.error('CoffeeBrk background error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

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

    settings.bookmarkedArticles = bookmarks.slice(0, 50); // Max 50 bookmarks
    await chrome.storage.sync.set({ settings });
    return settings.bookmarkedArticles;
}

// Set up periodic cache refresh alarm
chrome.alarms.create('refreshCache', { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'refreshCache') {
        cache.clear();
        // Pre-fetch first page of articles
        try {
            await fetchArticles(1, '');
            await fetchCategories();
            console.log('CoffeeBrk: Cache refreshed');
        } catch (e) {
            console.log('CoffeeBrk: Cache refresh failed', e);
        }
    }
});

console.log('CoffeeBrk Service Worker initialized');
