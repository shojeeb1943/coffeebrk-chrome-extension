/**
 * @file newtab.js
 * @description New Tab page controller for the CoffeeBrk Chrome Extension (Editorial Redesign).
 *
 * Responsibilities:
 *  - Load and apply user settings from the background service worker.
 *  - Render greeting, search bar, and quick-access shortcuts.
 *  - Fetch and display mixed news articles & video reel stories in a 3-column feed.
 *  - Render curated X (Twitter) AI market intelligence cards in the sidebar.
 *  - Support video modal playback for Reels/Stories.
 *  - Infinite scroll for continuous story discovery.
 *  - Real-time settings sync via chrome.storage.onChanged.
 *
 * @version 1.2.0
 * @author  CoffeeBrk.ai <hello@coffeebrk.ai>
 * @license Proprietary — © 2024 CoffeeBrk.ai. All rights reserved.
 */

(() => {
    'use strict';

    // ─── Config ──────────────────────────────────────────────────────────
    const API_BASE = 'https://app.coffeebrk.ai/wp-json/coffeebrk/v1/public';

    const SEARCH_ENGINES = {
        google: 'https://www.google.com/search',
        bing: 'https://www.bing.com/search',
        duckduckgo: 'https://duckduckgo.com/',
        brave: 'https://search.brave.com/search'
    };

    // ─── Module State ─────────────────────────────────────────────────────
    let currentPage = 1;
    let totalPages = 1;
    let isLoading = false;
    let activeCategory = '';
    let settings = null;
    let storiesCache = [];

    const DEFAULT_SETTINGS = {
        theme: 'light',
        userName: 'Hasan',
        accentColor: '#B46938',
        cardLayout: 'grid',
        showImages: true,
        showExcerpts: true,
        showShortcuts: true,
        shortcutMode: 'prefixed', // 'prefixed' | 'mostVisited'
        shortcuts: [
            { name: 'YouTube', url: 'https://youtube.com', icon: 'youtube', enabled: true },
            { name: 'Figma', url: 'https://figma.com', icon: 'figma', enabled: true },
            { name: 'Claude', url: 'https://claude.ai', icon: 'claude', enabled: true },
            { name: 'GitHub', url: 'https://github.com', icon: 'github', enabled: true },
            { name: 'Anthropic', url: 'https://anthropic.com', icon: 'anthropic', enabled: true },
            { name: 'Figma', url: 'https://figma.com', icon: 'figma', enabled: true },
            { name: 'YouTube', url: 'https://youtube.com', icon: 'youtube', enabled: true }
        ],
        maxShortcuts: 8,
        showSearchBar: true,
        showGreeting: true,
        searchEngine: 'google',
        customGreeting: '',
        articlesPerPage: 18,
        openLinksIn: 'newTab',
        defaultCategory: ''
    };

    // ─── DOM refs ────────────────────────────────────────────────────────
    const grid = document.getElementById('news-grid');
    const socialFeedEl = document.getElementById('social-feed');
    const loader = document.getElementById('loader');
    const emptyState = document.getElementById('empty-state');
    const errorState = document.getElementById('error-state');
    const retryBtn = document.getElementById('retry-btn');
    const greetingEl = document.getElementById('greeting');
    const userNameDisplay = document.getElementById('user-name-display');
    const searchSection = document.getElementById('search-section');
    const shortcutsSection = document.getElementById('shortcuts-section');
    const searchForm = document.getElementById('search-form');
    const videoModal = document.getElementById('video-modal');
    const videoModalContent = document.getElementById('video-modal-content');
    const videoModalClose = document.querySelector('.video-modal__close');
    const videoModalBackdrop = document.querySelector('.video-modal__backdrop');
    const loadMoreContainer = document.getElementById('load-more-container');
    const loadMoreBtn = document.getElementById('load-more-btn');
    const loadMoreText = loadMoreBtn?.querySelector('.load-more-text');

    // ─── Initialize ──────────────────────────────────────────────────────
    async function init() {
        await loadSettings();
        applySettings();
        setGreeting();
        renderShortcuts();
        renderSocialFeed();
        setupEventListeners();
        setupVideoModal();

        // Fetch stories first then articles so we can weave them together
        await fetchStories();
        fetchNews(1);
    }

    // ─── Settings ────────────────────────────────────────────────────────
    async function loadSettings() {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
                if (response?.success) {
                    settings = { ...DEFAULT_SETTINGS, ...response.settings };
                    return;
                }
            }
        } catch (e) { }
        settings = { ...DEFAULT_SETTINGS };
    }

    function applySettings() {
        if (settings.theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
        } else if (settings.theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
        }

        if (settings.accentColor) {
            document.documentElement.style.setProperty('--accent', settings.accentColor);
        }

        if (searchSection) searchSection.style.display = settings.showSearchBar ? '' : 'none';
        if (shortcutsSection) shortcutsSection.style.display = settings.showShortcuts ? '' : 'none';

        if (searchForm && settings.searchEngine) {
            searchForm.action = SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.google;
        }

        if (settings.defaultCategory) activeCategory = settings.defaultCategory;
        renderShortcuts();
    }

    // ─── Greeting ────────────────────────────────────────────────────────
    function setGreeting() {
        if (!greetingEl) return;
        if (!settings.showGreeting) {
            greetingEl.style.display = 'none';
            return;
        }
        greetingEl.style.display = 'flex';

        if (settings.customGreeting) {
            const leadEl = greetingEl.querySelector('.greeting-lead');
            if (leadEl) leadEl.textContent = settings.customGreeting;
            if (userNameDisplay) userNameDisplay.textContent = '';
        } else {
            const name = settings.userName || 'Hasan';
            if (userNameDisplay) userNameDisplay.textContent = name;
        }
    }

    // ─── Shortcuts Rendering (Prefixed / Most Visited) ───────────────────
    function renderShortcuts() {
        if (!shortcutsSection) return;
        if (!settings.showShortcuts) {
            shortcutsSection.style.display = 'none';
            return;
        }
        shortcutsSection.style.display = 'flex';

        if (settings.shortcutMode === 'mostVisited' && typeof chrome !== 'undefined' && chrome.topSites?.get) {
            try {
                chrome.topSites.get((sites) => {
                    if (sites && sites.length > 0) {
                        const maxCount = settings.maxShortcuts || 8;
                        const formatted = sites.slice(0, maxCount).map(s => ({
                            name: s.title || getDomain(s.url),
                            url: s.url,
                            enabled: true
                        }));
                        buildShortcutElements(formatted);
                    } else {
                        buildShortcutElements(getPrefixedShortcuts());
                    }
                });
                return;
            } catch (e) { }
        }

        buildShortcutElements(getPrefixedShortcuts());
    }

    function getPrefixedShortcuts() {
        const list = settings.shortcuts || DEFAULT_SETTINGS.shortcuts;
        const enabled = list.filter(s => s.enabled !== false);
        return enabled.length > 0 ? enabled : DEFAULT_SETTINGS.shortcuts;
    }

    function getDomain(urlStr) {
        try {
            return new URL(urlStr).hostname.replace(/^www\./, '');
        } catch (e) {
            return urlStr;
        }
    }

    function getShortcutIconHtml(shortcut) {
        const url = shortcut.url || '';
        const iconKey = (shortcut.icon || '').toLowerCase();
        const domain = getDomain(url).toLowerCase();

        // YouTube
        if (iconKey === 'youtube' || domain.includes('youtube.com') || domain.includes('youtu.be')) {
            return `
                <div class="shortcut-circle shortcut-circle--youtube">
                    <svg viewBox="0 0 24 24" fill="white">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                    </svg>
                </div>`;
        }

        // Figma
        if (iconKey === 'figma' || domain.includes('figma.com')) {
            return `
                <div class="shortcut-circle shortcut-circle--figma">
                    <svg viewBox="0 0 38 57" width="18" height="26">
                        <path fill="#0ACF83" d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z"/>
                        <path fill="#A259FF" d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z"/>
                        <path fill="#F24E1E" d="M0 28.5A9.5 9.5 0 0 1 9.5 19H19v19H9.5A9.5 9.5 0 0 1 0 28.5z"/>
                        <path fill="#FF7262" d="M0 9.5A9.5 9.5 0 0 1 9.5 0H19v19H9.5A9.5 9.5 0 0 1 0 9.5z"/>
                        <path fill="#1ABCFE" d="M19 0h9.5a9.5 9.5 0 1 1 0 19H19V0z"/>
                    </svg>
                </div>`;
        }

        // Claude / Anthropic
        if (iconKey === 'claude' || iconKey === 'anthropic' || domain.includes('claude.ai') || domain.includes('anthropic.com')) {
            return `
                <div class="shortcut-circle shortcut-circle--claude">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="#D97757">
                        <path d="M12 2L13.8 8.2L20 10L13.8 11.8L12 18L10.2 11.8L4 10L10.2 8.2L12 2Z" fill="#D97757"/>
                        <path d="M18 16L18.9 19.1L22 20L18.9 20.9L18 24L17.1 20.9L14 20L17.1 19.1L18 16Z" fill="#D97757"/>
                        <path d="M6 16L6.9 19.1L10 20L6.9 20.9L6 24L5.1 20.9L2 20L5.1 19.1L6 16Z" fill="#D97757"/>
                    </svg>
                </div>`;
        }

        // GitHub
        if (iconKey === 'github' || domain.includes('github.com')) {
            return `
                <div class="shortcut-circle shortcut-circle--github">
                    <svg viewBox="0 0 24 24" fill="white">
                        <path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.164 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
                    </svg>
                </div>`;
        }

        // X / Twitter
        if (iconKey === 'x' || domain.includes('x.com') || domain.includes('twitter.com')) {
            return `
                <div class="shortcut-circle shortcut-circle--x">
                    <svg viewBox="0 0 24 24" fill="white">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                </div>`;
        }

        // Gmail
        if (iconKey === 'gmail' || domain.includes('mail.google.com')) {
            return `
                <div class="shortcut-circle shortcut-circle--gmail">
                    <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#EA4335" d="M20 18h-2V9.25L12 13 6 9.25V18H4V6h1.2l6.8 4.25L18.8 6H20v12z"/></svg>
                </div>`;
        }

        // ChatGPT / OpenAI
        if (iconKey === 'chatgpt' || domain.includes('openai.com')) {
            return `
                <div class="shortcut-circle shortcut-circle--chatgpt">
                    <svg viewBox="0 0 24 24" fill="white"><path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.052.5a6.044 6.044 0 00-5.79 4.26 6.028 6.028 0 00-4.035 2.921 6.044 6.044 0 00.745 7.09 5.985 5.985 0 00.516 4.91 6.046 6.046 0 006.51 2.9A6.065 6.065 0 0012.95 23.5a6.044 6.044 0 005.79-4.26 6.028 6.028 0 004.035-2.921 6.043 6.043 0 00-.493-6.498zM12.95 21.654a4.508 4.508 0 01-2.9-1.055l.144-.08 4.818-2.782a.783.783 0 00.395-.678v-6.79l2.037 1.176a.071.071 0 01.039.055v5.627a4.527 4.527 0 01-4.533 4.527zM3.584 17.656a4.494 4.494 0 01-.538-3.028l.144.085 4.818 2.782a.779.779 0 00.789 0l5.884-3.398v2.352a.07.07 0 01-.028.061l-4.87 2.813a4.527 4.527 0 01-6.199-1.667zM2.308 7.877a4.494 4.494 0 012.362-1.973V11.6a.78.78 0 00.395.678l5.884 3.398-2.037 1.176a.072.072 0 01-.067.006l-4.87-2.813A4.527 4.527 0 012.308 7.877zm16.56 3.858l-5.884-3.398 2.037-1.176a.072.072 0 01.067-.006l4.87 2.813a4.525 4.525 0 01-.7 8.164v-5.72a.78.78 0 00-.39-.677zm2.028-3.044l-.144-.085-4.818-2.782a.779.779 0 00-.789 0l-5.884 3.398V6.87a.07.07 0 01.028-.061l4.87-2.813a4.527 4.527 0 016.737 4.695zm-12.727 4.19L6.132 11.704a.071.071 0 01-.039-.055V6.022a4.527 4.527 0 017.433-3.472l-.144.08-4.818 2.782a.783.783 0 00-.395.678v6.79zm1.106-2.385l2.621-1.513 2.621 1.513v3.026l-2.621 1.513-2.621-1.513V10.496z"/></svg>
                </div>`;
        }

        // CoffeeBrk
        if (iconKey === 'coffeebrk' || domain.includes('coffeebrk.ai')) {
            return `
                <div class="shortcut-circle shortcut-circle--coffeebrk">
                    <svg viewBox="0 0 24 24" fill="white"><path d="M2 21V17C2 14.79 3.79 13 6 13H14C16.21 13 18 14.79 18 17V21H2ZM18 9H20C21.1 9 22 9.9 22 11V13C22 14.1 21.1 15 20 15H18V9ZM4 9H16V5C16 3.9 15.1 3 14 3H6C4.9 3 4 3.9 4 5V9Z"/></svg>
                </div>`;
        }

        // Generic / Fallback using Google Favicon Service or letter monogram
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
        const initial = (shortcut.name || domain || 'W').charAt(0).toUpperCase();

        return `
            <div class="shortcut-circle shortcut-circle--custom">
                <img src="${faviconUrl}" alt="${escapeHtml(shortcut.name)}" onerror="this.style.display='none';this.nextElementSibling.style.display='block';">
                <span class="shortcut-letter" style="display:none">${escapeHtml(initial)}</span>
            </div>`;
    }

    function buildShortcutElements(shortcuts) {
        shortcutsSection.innerHTML = '';
        shortcuts.forEach(s => {
            const link = document.createElement('a');
            link.href = s.url;
            link.className = 'shortcut-pill';
            link.title = s.name || s.url;
            link.target = settings.openLinksIn === 'sameTab' ? '_self' : '_blank';
            link.innerHTML = getShortcutIconHtml(s);
            shortcutsSection.appendChild(link);
        });

        // Add customizable button '+' linking to options
        const addBtn = document.createElement('a');
        addBtn.href = 'options.html#shortcuts';
        addBtn.className = 'shortcut-pill';
        addBtn.title = 'Customize Shortcuts';
        addBtn.innerHTML = `
            <div class="shortcut-circle shortcut-circle--add">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
            </div>`;
        shortcutsSection.appendChild(addBtn);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    function formatArticleDate(dateStr) {
        if (!dateStr) return 'September 17, 2025';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric'
            });
        } catch (e) {
            return dateStr;
        }
    }

    // ─── Skeleton Loading ────────────────────────────────────────────────
    function showSkeletons(count = 6) {
        grid.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = 'skeleton-article';
            el.innerHTML = `
                <div class="skeleton-article__img"></div>
                <div class="skeleton-article__line" style="width: 35%;"></div>
                <div class="skeleton-article__line" style="width: 90%;"></div>
                <div class="skeleton-article__line" style="width: 75%;"></div>
            `;
            grid.appendChild(el);
        }
    }

    // ─── Stories / Reels Fetching ────────────────────────────────────────
    async function fetchStories() {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(`${API_BASE}/stories?limit=6`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });
            clearTimeout(timeout);
            if (res.ok) {
                const data = await res.json();
                if (data.items?.length > 0) {
                    storiesCache = data.items;
                    return;
                }
            }
        } catch (e) { }

        // No stories available (fetch failed or returned none) — leave storiesCache
        // empty; callers already skip reel cards when it's empty.
        storiesCache = [];
    }

    // ─── Card Builders ───────────────────────────────────────────────────

    /**
     * Standard News Article Card
     */
    function createArticleCard(article) {
        const card = document.createElement('article');
        card.className = 'article-card';

        const sourceName = article.source || 'Google';
        const formattedDate = formatArticleDate(article.date || article.published_at || article.date_gmt);
        const imageUrl = article.image || 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop&q=80';

        card.innerHTML = `
            <div class="article-card__thumb">
                <img class="article-card__img" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(article.title)}" loading="lazy">
            </div>
            <div class="article-card__body">
                <span class="article-card__source">${escapeHtml(sourceName)}</span>
                <h3 class="article-card__title">${escapeHtml(article.title)}</h3>
                <div class="article-card__footer">
                    <span class="article-card__date">${escapeHtml(formattedDate)}</span>
                    <span class="article-card__link-icon" title="Read Article">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="3"/>
                            <path d="M10 14L15 9"/>
                            <path d="M11 9h4v4"/>
                        </svg>
                    </span>
                </div>
            </div>
        `;

        // Handle image error fallback
        const img = card.querySelector('.article-card__img');
        if (img) {
            img.addEventListener('error', function () {
                this.src = 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=600&auto=format&fit=crop&q=80';
            });
        }

        card.addEventListener('click', () => {
            trackArticleRead();
            const target = settings.openLinksIn === 'sameTab' ? '_self' : '_blank';
            const url = article.source_url || article.permalink || article.link || 'https://coffeebrk.ai';
            window.open(url, target);
        });

        return card;
    }

    const REEL_COLUMNS = [1, 3, 2]; // Alternates Left (Col 1), Right (Col 3), Center (Col 2)
    let totalReelsRendered = 0;

    /**
     * Tall Video Reel / Story Card
     */
    function createReelCard(story, colNum = 1) {
        const card = document.createElement('article');
        card.className = `reel-card reel-card--col-${colNum}`;

        const sourceName = story.source || 'Google';
        const formattedDate = formatArticleDate(story.date || 'September 17, 2025');
        const imageUrl = story.image || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80';
        const caption = story.caption || 'with a setting that you like.';

        card.innerHTML = `
            <div class="reel-card__video-wrap">
                <img class="reel-card__img" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(story.title)}" loading="lazy">
                <div class="reel-card__overlay"></div>
                <div class="reel-card__play-btn" aria-label="Play Reel">
                    <svg viewBox="0 0 24 24">
                        <polygon points="6 4 20 12 6 20 6 4"/>
                    </svg>
                </div>
                <div class="reel-card__caption">${escapeHtml(caption)}</div>
            </div>
            <div class="reel-card__body">
                <span class="reel-card__source">${escapeHtml(sourceName)}</span>
                <h3 class="reel-card__title">${escapeHtml(story.title)}</h3>
                <div class="reel-card__footer">
                    <span class="reel-card__date">${escapeHtml(formattedDate)}</span>
                    <span class="reel-card__link-icon" title="View Reel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="3"/>
                            <path d="M10 14L15 9"/>
                            <path d="M11 9h4v4"/>
                        </svg>
                    </span>
                </div>
            </div>
        `;

        card.addEventListener('click', () => {
            if (story.video_url) {
                openVideoModal(story.video_url);
            } else {
                window.open('https://coffeebrk.ai', '_blank');
            }
        });

        return card;
    }

    /**
     * Renders Curated Social Cards in the Right Sidebar.
     * No live social feed source exists yet, so the sidebar is hidden rather
     * than showing fabricated posts. Wire this up to a real API_BASE/social
     * endpoint once one exists.
     */
    function renderSocialFeed() {
        if (!socialFeedEl) return;
        socialFeedEl.closest('.sidebar-column')?.style.setProperty('display', 'none');
    }

    // ─── Fetch News Articles ─────────────────────────────────────────────
    async function fetchNews(page = 1, append = false) {
        if (isLoading) return;
        isLoading = true;

        if (!append) {
            showSkeletons();
            emptyState.style.display = 'none';
            errorState.style.display = 'none';
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        } else {
            if (loadMoreBtn) {
                loadMoreBtn.classList.add('loading');
                loadMoreBtn.disabled = true;
            }
            if (loadMoreText) loadMoreText.textContent = 'Loading Stories...';
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const perPage = settings.articlesPerPage || 18;
            let url = `${API_BASE}/posts?page=${page}&per_page=${perPage}`;
            if (activeCategory) url += `&category=${encodeURIComponent(activeCategory)}`;

            const res = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            totalPages = data.total_pages || 1;
            currentPage = page;

            if (!append) {
                grid.innerHTML = '';
                totalReelsRendered = 0;
            }

            const items = data.items || [];

            if (items.length === 0 && !append) {
                emptyState.style.display = 'block';
                errorState.style.display = 'none';
                if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            } else {
                // Weave Stories/Reels and News into the Bento Box dense feed (Left -> Right -> Center)
                items.forEach((article, i) => {
                    // Insert a tall reel every 4 articles (indices 0, 4, 8, etc.)
                    if (storiesCache.length > 0 && i % 4 === 0) {
                        const story = storiesCache[totalReelsRendered % storiesCache.length];
                        const colNum = REEL_COLUMNS[totalReelsRendered % REEL_COLUMNS.length];
                        grid.appendChild(createReelCard(story, colNum));
                        totalReelsRendered++;
                    }
                    grid.appendChild(createArticleCard(article));
                });

                emptyState.style.display = 'none';
                errorState.style.display = 'none';
                if (loadMoreContainer) loadMoreContainer.style.display = 'flex';
            }
        } catch (err) {
            console.error('[CoffeeBrk] Article fetch failed:', err);
            currentPage = page;
            if (!append) {
                grid.innerHTML = '';
                totalReelsRendered = 0;
                emptyState.style.display = 'none';
                errorState.style.display = 'block';
                if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            }
            // On a failed "load more", just leave the existing grid as-is so the user can retry.
        } finally {
            clearTimeout(timeout);
            isLoading = false;
            loader.style.display = 'none';
            if (loadMoreBtn) {
                loadMoreBtn.classList.remove('loading');
                loadMoreBtn.disabled = false;
            }
            if (loadMoreText) loadMoreText.textContent = 'Load More Stories';
        }
    }

    function trackArticleRead() {
        try {
            const today = new Date().toDateString();
            const stored = localStorage.getItem('coffeebrk_articles_read');
            let data = stored ? JSON.parse(stored) : { date: today, count: 0 };
            if (data.date !== today) data = { date: today, count: 0 };
            data.count++;
            localStorage.setItem('coffeebrk_articles_read', JSON.stringify(data));
        } catch (e) { }
    }

    // ─── Video Modal ─────────────────────────────────────────────────────
    function isVerticalVideo(url) {
        return url && url.includes('/shorts/');
    }

    function openVideoModal(url) {
        const embedUrl = `${API_BASE}/embed?url=${encodeURIComponent(url)}`;
        const isVertical = isVerticalVideo(url);
        const container = videoModal.querySelector('.video-modal__container');

        if (isVertical) {
            videoModalContent.classList.remove('landscape');
            container?.classList.remove('landscape');
        } else {
            videoModalContent.classList.add('landscape');
            container?.classList.add('landscape');
        }

        videoModalContent.innerHTML = `<iframe src="${embedUrl}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen scrolling="no"></iframe>`;
        videoModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeVideoModal() {
        videoModal.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => {
            videoModalContent.innerHTML = '';
        }, 300);
    }

    function setupVideoModal() {
        if (!videoModal) return;
        videoModalClose?.addEventListener('click', closeVideoModal);
        videoModalBackdrop?.addEventListener('click', closeVideoModal);

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && videoModal.classList.contains('active')) {
                closeVideoModal();
            }
        });
    }

    // ─── Event Listeners ─────────────────────────────────────────────────
    function setupEventListeners() {
        retryBtn?.addEventListener('click', () => fetchNews(1));

        loadMoreBtn?.addEventListener('click', () => {
            if (!isLoading) {
                fetchNews(currentPage + 1, true);
            }
        });

        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.onChanged.addListener((changes, namespace) => {
                if (namespace === 'sync' && changes.settings) {
                    settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
                    applySettings();
                    setGreeting();
                    fetchNews(1);
                }
            });
        }

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (settings.theme === 'system') {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        });
    }

    // ─── Start ───────────────────────────────────────────────────────────
    init();
})();
