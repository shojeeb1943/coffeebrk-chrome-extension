/**
 * @file newtab.js
 * @description New Tab page controller for the CoffeeBrk Chrome Extension.
 *
 * Responsibilities:
 *  - Load and apply user settings from the background service worker.
 *  - Render the greeting, date/time, search bar, and quick-access shortcuts.
 *  - Fetch and display paginated news articles from the CoffeeBrk API.
 *  - Render the Stories carousel with optional video modal playback.
 *  - Dynamically populate the category filter bar.
 *  - Support infinite scroll for seamless article browsing.
 *  - React to settings changes in real time via chrome.storage.onChanged.
 *
 * @version 1.1.0
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

    const DEFAULT_SETTINGS = {
        theme: 'dark',
        accentColor: '#E07A4B',
        cardLayout: 'grid',
        showImages: true,
        showExcerpts: true,
        showFeaturedCard: true,
        showShortcuts: true,
        showSearchBar: true,
        showGreeting: true,
        showDate: true,
        showTime: false,
        showCategories: true,
        searchEngine: 'google',
        customGreeting: '',
        articlesPerPage: 20,
        openLinksIn: 'newTab',
        defaultCategory: ''
    };

    // ─── DOM refs ────────────────────────────────────────────────────────
    const grid = document.getElementById('news-grid');
    const loader = document.getElementById('loader');
    const emptyState = document.getElementById('empty-state');
    const errorState = document.getElementById('error-state');
    const retryBtn = document.getElementById('retry-btn');
    const greetingEl = document.getElementById('greeting');
    const catBar = document.querySelector('.category-bar');
    const searchSection = document.getElementById('search-section');
    const shortcutsSection = document.getElementById('shortcuts-section');
    const categorySection = document.getElementById('category-section');
    const searchForm = document.getElementById('search-form');
    const storiesSection = document.getElementById('stories-section');
    const storiesTrack = document.getElementById('stories-track');
    const storiesPrevBtn = document.querySelector('.stories-nav-prev');
    const storiesNextBtn = document.querySelector('.stories-nav-next');
    const videoModal = document.getElementById('video-modal');
    const videoModalContent = document.getElementById('video-modal-content');
    const videoModalClose = document.querySelector('.video-modal__close');
    const videoModalBackdrop = document.querySelector('.video-modal__backdrop');

    // Stories carousel state
    let storiesScrollPos = 0;
    let storiesMaxScroll = 0;

    // ─── Initialize ──────────────────────────────────────────────────────
    async function init() {
        await loadSettings();
        applySettings();
        setGreeting();
        updateTime();
        loadStories();
        loadCategories();
        fetchNews(1);
        setupInfiniteScroll();
        setupEventListeners();
        setupVideoModal();
        setInterval(updateTime, 60000);
    }

    // ─── Settings ─────────────────────────────────────────────────────────────
    /**
     * Loads settings from the background service worker.
     * Falls back to DEFAULT_SETTINGS gracefully when not running inside the
     * extension context (e.g., during local development).
     *
     * @returns {Promise<void>}
     */
    async function loadSettings() {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
                if (response?.success) {
                    settings = { ...DEFAULT_SETTINGS, ...response.settings };
                    return;
                }
            }
        } catch (e) {
            // Unable to reach background worker — use compiled-in defaults.
        }
        settings = { ...DEFAULT_SETTINGS };
    }

    /**
     * Applies the current `settings` object to the DOM:
     * theme attribute, CSS custom properties, section visibility,
     * search-form action, and card-grid layout classes.
     */
    function applySettings() {
        // Theme
        if (settings.theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        } else if (settings.theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        // Accent color
        if (settings.accentColor) {
            document.documentElement.style.setProperty('--accent', settings.accentColor);
            document.documentElement.style.setProperty('--accent-soft', hexToRgba(settings.accentColor, 0.12));
        }

        // Visibility
        if (searchSection) searchSection.style.display = settings.showSearchBar ? '' : 'none';
        if (shortcutsSection) shortcutsSection.style.display = settings.showShortcuts ? '' : 'none';
        if (categorySection) categorySection.style.display = settings.showCategories ? '' : 'none';

        // Search engine
        if (searchForm && settings.searchEngine) {
            searchForm.action = SEARCH_ENGINES[settings.searchEngine] || SEARCH_ENGINES.google;
        }

        // Card layout
        if (grid) {
            grid.classList.remove('news-grid--list', 'news-grid--compact');
            if (settings.cardLayout === 'list') grid.classList.add('news-grid--list');
            if (settings.cardLayout === 'compact') grid.classList.add('news-grid--compact');
        }

        // Default category
        if (settings.defaultCategory) activeCategory = settings.defaultCategory;
    }

    /**
     * Converts a 6-digit hex colour string to an rgba() value.
     *
     * @param  {string} hex    Hex colour, e.g. '#E07A4B'.
     * @param  {number} alpha  Opacity in the range [0, 1].
     * @returns {string}        CSS rgba() string.
     */
    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // ─── Greeting ────────────────────────────────────────────────────────
    function setGreeting() {
        if (!greetingEl) return;
        if (!settings.showGreeting) {
            greetingEl.style.display = 'none';
            return;
        }
        greetingEl.style.display = '';

        const h = new Date().getHours();
        let msg, icon;

        if (settings.customGreeting) {
            msg = settings.customGreeting;
            icon = '';
        } else {
            if (h < 5) { msg = 'Good night'; icon = '🌙'; }
            else if (h < 12) { msg = 'Good morning'; icon = '☀️'; }
            else if (h < 17) { msg = 'Good afternoon'; icon = '🌤️'; }
            else if (h < 21) { msg = 'Good evening'; icon = '🌅'; }
            else { msg = 'Good night'; icon = '🌙'; }
        }

        const iconEl = greetingEl.querySelector('.greeting-icon');
        const textEl = greetingEl.querySelector('.greeting-text');
        if (iconEl) iconEl.textContent = icon;
        if (textEl) textEl.textContent = msg;
    }

    function updateTime() {
        const timeEl = document.getElementById('current-time');
        if (!timeEl) return;

        if (settings.showTime) {
            timeEl.textContent = new Date().toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
            timeEl.style.display = '';
        } else if (settings.showDate) {
            timeEl.textContent = new Date().toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });
            timeEl.style.display = '';
        } else {
            timeEl.style.display = 'none';
        }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────
    /**
     * Returns a human-readable relative time string for the given ISO date.
     *
     * @param  {string} dateStr  ISO 8601 date string.
     * @returns {string}          E.g. 'just now', '5m ago', '2h ago', 'Mar 3'.
     */
    function timeAgo(dateStr) {
        const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    /**
     * Estimates reading time for a piece of text at 200 words per minute.
     *
     * @param  {string} text  Plain-text excerpt or body content.
     * @returns {string}       E.g. '3 min'.
     */
    function estimateReadTime(text) {
        if (!text) return '1 min';
        const words = text.split(/\s+/).length;
        const mins = Math.max(1, Math.ceil(words / 200));
        return mins + ' min';
    }

    /**
     * Returns the uppercase first character of a source name, used as a
     * fallback avatar for articles without a thumbnail.
     *
     * @param  {string} [source]  Source publication name.
     * @returns {string}           Single uppercase letter, default 'C'.
     */
    function getSourceInitial(source) {
        if (!source) return 'C';
        return source.charAt(0).toUpperCase();
    }

    /**
     * Safely HTML-encodes a string by delegating to the browser's own text-node
     * serialiser — avoids regex-based escaping edge-cases.
     *
     * @param  {string} str  Raw string that may contain HTML characters.
     * @returns {string}      HTML-safe string.
     */
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // ─── Skeleton ────────────────────────────────────────────────────────
    function showSkeletons(count = 6) {
        grid.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = 'skeleton-card';
            el.innerHTML = `
                <div class="skeleton-image"></div>
                <div class="skeleton-body">
                    <div class="skeleton-line skeleton-line--short"></div>
                    <div class="skeleton-line"></div>
                    <div class="skeleton-line skeleton-line--medium"></div>
                </div>
            `;
            grid.appendChild(el);
        }
    }

    // ─── Card Rendering ──────────────────────────────────────────────────
    /**
     * Creates and returns a DOM <article> element for a single news article.
     *
     * @param  {Object}  article            Article data from the API.
     * @param  {number}  index              Position in the current page (used for CSS stagger delay).
     * @param  {boolean} [featured=false]   When true, applies the featured-card style to the first item.
     * @returns {HTMLElement}               The constructed article card element.
     */
    function createCard(article, index, featured = false) {
        const card = document.createElement('article');
        const isFeatured = featured && settings.showFeaturedCard;
        card.className = 'news-card' + (isFeatured ? ' news-card--featured' : '');
        card.style.animationDelay = `${index * 0.04}s`;

        const catName = article.categories?.[0]?.name || '';
        const sourceName = article.source || 'CoffeeBrk';
        const readTime = estimateReadTime(article.excerpt);

        // Image
        let imageHtml = '';
        if (settings.showImages) {
            if (article.image) {
                imageHtml = `
                    <div class="news-card__image-wrapper">
                        <img class="news-card__image"
                             src="${escapeHtml(article.image)}"
                             alt=""
                             loading="lazy"
                             data-fallback="true">
                    </div>`;
            } else {
                imageHtml = `
                    <div class="news-card__image-wrapper">
                        <div class="news-card__image news-card__image--placeholder">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1" opacity="0.3">
                                <rect x="3" y="3" width="18" height="18" rx="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <path d="M21 15l-5-5L5 21"/>
                            </svg>
                        </div>
                    </div>`;
            }
        }

        // Excerpt
        const excerptHtml = settings.showExcerpts && article.excerpt
            ? `<p class="news-card__excerpt">${escapeHtml(article.excerpt)}</p>`
            : '';

        card.innerHTML = `
            ${imageHtml}
            <div class="news-card__body">
                <h3 class="news-card__title">${escapeHtml(article.title)}</h3>
                ${excerptHtml}
            </div>
            <div class="news-card__footer">
                <span class="news-card__source">${escapeHtml(sourceName)}</span>
                <span class="news-card__link-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.33">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <path d="M9 15l6-6M15 15v-6h-6"/>
                    </svg>
                </span>
            </div>
        `;

        // Handle image load errors (CSP-compliant)
        const img = card.querySelector('img[data-fallback="true"]');
        if (img) {
            img.addEventListener('error', function () {
                this.style.display = 'none';
            });
        }

        card.addEventListener('click', () => {
            trackArticleRead();
            const target = settings.openLinksIn === 'sameTab' ? '_self' : '_blank';
            // Use source_url if available, otherwise fall back to permalink
            const url = article.source_url || article.permalink;
            window.open(url, target);
        });

        return card;
    }

    /**
     * Increments the daily articles-read counter stored in localStorage.
     * Resets to zero when the stored date does not match today.
     * Used only for the popup stats display — no data leaves the device.
     */
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

    // ─── Fetch News ──────────────────────────────────────────────────────
    /**
     * Fetches a page of articles from the CoffeeBrk API and renders them.
     *
     * @param  {number}  [page=1]       1-based page number to fetch.
     * @param  {boolean} [append=false] When true, appends cards to the existing
     *                                  grid instead of replacing it (infinite scroll).
     * @returns {Promise<void>}
     */
    async function fetchNews(page = 1, append = false) {
        if (isLoading) return;
        isLoading = true;

        if (!append) {
            showSkeletons();
            emptyState.style.display = 'none';
            errorState.style.display = 'none';
        } else {
            loader.style.display = 'flex';
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        try {
            const perPage = settings.articlesPerPage || 20;
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

            if (!append) grid.innerHTML = '';

            if (data.items?.length > 0) {
                data.items.forEach((article, i) => {
                    const featured = !append && page === 1 && i === 0;
                    grid.appendChild(createCard(article, i, featured));
                });
                emptyState.style.display = 'none';
            } else if (!append) {
                emptyState.style.display = 'block';
            }

            errorState.style.display = 'none';
        } catch (err) {
            console.error('[CoffeeBrk] Article fetch failed:', err);
            if (!append) {
                grid.innerHTML = '';
                errorState.style.display = 'block';
            }
        } finally {
            clearTimeout(timeout);
            isLoading = false;
            loader.style.display = 'none';
        }
    }

    // ─── Stories Carousel ────────────────────────────────────────────────
    function showStoriesSkeletons(count = 6) {
        if (!storiesTrack) return;
        storiesTrack.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const el = document.createElement('div');
            el.className = 'story-skeleton';
            storiesTrack.appendChild(el);
        }
    }

    /**
     * Creates and returns a DOM element representing a single Story card.
     *
     * @param  {Object}   story               Story data from the API.
     * @param  {string}   story.title          Displayed title.
     * @param  {string}   [story.image]        Background image URL.
     * @param  {string}   [story.gradient]     Fallback gradient / overlay colour.
     * @param  {number}   [story.gradient_intensity] Overlay opacity hint (0–100).
     * @param  {string}   [story.text_color]   Title text colour.
     * @param  {string}   [story.video_url]    Optional video URL; shows play button.
     * @returns {HTMLElement}  The constructed story card element.
     */
    function createStoryCard(story) {
        const card = document.createElement('div');
        card.className = 'story-card';

        // Background image or gradient
        const bgStyle = story.image
            ? `background-image: url('${escapeHtml(story.image)}')`
            : `background: ${story.gradient || '#F5F5FF'}`;

        // Overlay gradient using story gradient color
        const gradientColor = story.gradient || '#000';
        const intensity = story.gradient_intensity || 50;
        const overlayOpacity = intensity / 100;

        card.innerHTML = `
            <div class="story-card__bg" style="${bgStyle}"></div>
            <div class="story-card__overlay" style="background: linear-gradient(to top, ${hexToRgba(gradientColor, overlayOpacity * 0.8)} 0%, ${hexToRgba(gradientColor, overlayOpacity * 0.3)} 50%, transparent 100%)"></div>
            <div class="story-card__content">
                <span class="story-card__title" style="color: ${story.text_color || '#fff'}">${escapeHtml(story.title)}</span>
            </div>
            ${story.video_url ? `
                <div class="story-card__play">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                </div>
            ` : ''}
        `;

        card.addEventListener('click', () => {
            if (story.video_url) {
                openVideoModal(story.video_url);
            }
        });

        return card;
    }

    // ─── Video Modal ──────────────────────────────────────────────────────────
    /**
     * Returns true if the given video URL represents a vertical / Shorts format.
     *
     * @param  {string} url  Video URL to inspect.
     * @returns {boolean}
     */
    function isVerticalVideo(url) {
        return url && url.includes('/shorts/');
    }

    /**
     * Opens the video modal and loads the given URL via the API proxy iframe.
     * Adjusts the modal container class for vertical (Shorts) vs landscape video.
     *
     * @param  {string} url  Original video URL to embed.
     */
    function openVideoModal(url) {
        const embedUrl = `${API_BASE}/embed?url=${encodeURIComponent(url)}`;
        const isVertical = isVerticalVideo(url);
        const container = videoModal.querySelector('.video-modal__container');

        if (isVertical) {
            videoModalContent.classList.remove('landscape');
            container.classList.remove('landscape');
        } else {
            videoModalContent.classList.add('landscape');
            container.classList.add('landscape');
        }

        videoModalContent.innerHTML = `<iframe src="${embedUrl}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen scrolling="no"></iframe>`;
        videoModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    /**
     * Closes the video modal and clears the iframe src after the CSS transition.
     */
    function closeVideoModal() {
        videoModal.classList.remove('active');
        document.body.style.overflow = '';
        // Delay clearing to allow animation
        setTimeout(() => {
            videoModalContent.innerHTML = '';
        }, 300);
    }

    /**
     * Attaches close-button, backdrop-click, and Escape-key event listeners
     * to the video modal overlay. Safe to call multiple times (no-ops if modal absent).
     */
    function setupVideoModal() {
        if (!videoModal) return;

        videoModalClose?.addEventListener('click', closeVideoModal);
        videoModalBackdrop?.addEventListener('click', closeVideoModal);

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && videoModal.classList.contains('active')) {
                closeVideoModal();
            }
        });
    }

    /**
     * Fetches stories from the API and renders them into the Stories carousel.
     * Hides the entire stories section on error or when no items are returned.
     *
     * @returns {Promise<void>}
     */
    async function loadStories() {
        if (!storiesSection || !storiesTrack) return;

        showStoriesSkeletons(6);

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(`${API_BASE}/stories?limit=10`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            clearTimeout(timeout);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();

            if (data.items?.length > 0) {
                storiesTrack.innerHTML = '';
                data.items.forEach(story => {
                    storiesTrack.appendChild(createStoryCard(story));
                });
                storiesSection.classList.remove('stories-hidden');
                setupStoriesNavigation();
            } else {
                storiesSection.classList.add('stories-hidden');
            }
        } catch (e) {
            console.error('[CoffeeBrk] Failed to load stories:', e);
            // Hide section on error - will show again when API is available
            storiesTrack.innerHTML = '';
            storiesSection.classList.add('stories-hidden');
        }
    }

    /**
     * Wires up prev/next navigation buttons for the Stories carousel and
     * recalculates scroll limits on window resize.
     */
    function setupStoriesNavigation() {
        if (!storiesTrack || !storiesPrevBtn || !storiesNextBtn) return;

        const cardWidth = 160 + 16; // card width + gap
        const visibleWidth = storiesTrack.parentElement.offsetWidth;
        const totalWidth = storiesTrack.scrollWidth;
        storiesMaxScroll = Math.max(0, totalWidth - visibleWidth);

        function updateNavButtons() {
            storiesPrevBtn.disabled = storiesScrollPos <= 0;
            storiesNextBtn.disabled = storiesScrollPos >= storiesMaxScroll;
        }

        function scrollStories(direction) {
            const scrollAmount = cardWidth * 3; // Scroll 3 cards at a time
            storiesScrollPos = Math.max(0, Math.min(storiesMaxScroll,
                storiesScrollPos + (direction * scrollAmount)));
            storiesTrack.style.transform = `translateX(-${storiesScrollPos}px)`;
            updateNavButtons();
        }

        storiesPrevBtn.addEventListener('click', () => scrollStories(-1));
        storiesNextBtn.addEventListener('click', () => scrollStories(1));

        updateNavButtons();

        // Recalculate on resize
        window.addEventListener('resize', () => {
            const newVisibleWidth = storiesTrack.parentElement.offsetWidth;
            const newTotalWidth = storiesTrack.scrollWidth;
            storiesMaxScroll = Math.max(0, newTotalWidth - newVisibleWidth);
            storiesScrollPos = Math.min(storiesScrollPos, storiesMaxScroll);
            storiesTrack.style.transform = `translateX(-${storiesScrollPos}px)`;
            updateNavButtons();
        });
    }

    // ─── Categories ──────────────────────────────────────────────────────
    /**
     * Fetches available categories from the API and appends them as filter
     * pills to the category bar. Skips if showCategories setting is off.
     *
     * @returns {Promise<void>}
     */
    async function loadCategories() {
        if (!settings.showCategories) return;

        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 10000);

            const res = await fetch(`${API_BASE}/categories`, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            clearTimeout(timeout);
            if (!res.ok) return;

            const cats = await res.json();
            cats.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'cat-pill';
                btn.dataset.category = cat.slug;
                btn.textContent = cat.name;

                if (cat.slug === activeCategory) {
                    btn.classList.add('active');
                    const allBtn = catBar.querySelector('.cat-pill[data-category=""]');
                    if (allBtn) allBtn.classList.remove('active');
                }

                catBar.appendChild(btn);
            });
        } catch (e) { }
    }

    // ─── Event Listeners ─────────────────────────────────────────────────
    /**
     * Attaches all top-level DOM event listeners:
     *  - Category bar pill clicks
     *  - Error-state retry button
     *  - chrome.storage.onChanged (live settings sync)
     *  - System colour-scheme media query change
     */
    function setupEventListeners() {
        // Category selection
        catBar.addEventListener('click', (e) => {
            const pill = e.target.closest('.cat-pill');
            if (!pill) return;

            catBar.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            activeCategory = pill.dataset.category || '';
            currentPage = 1;
            fetchNews(1);
        });

        // Retry
        retryBtn.addEventListener('click', () => fetchNews(1));

        // Settings changes
        if (typeof chrome !== 'undefined' && chrome.storage) {
            chrome.storage.onChanged.addListener((changes, namespace) => {
                if (namespace === 'sync' && changes.settings) {
                    settings = { ...DEFAULT_SETTINGS, ...changes.settings.newValue };
                    applySettings();
                    setGreeting();
                    updateTime();
                    // Reload news to apply new card layout
                    fetchNews(1);
                }
            });
        }

        // System theme change
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (settings.theme === 'system') {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        });
    }

    // ─── Infinite Scroll ─────────────────────────────────────────────────
    /**
     * Attaches an IntersectionObserver to a sentinel element appended below
     * the news grid. When the sentinel enters the viewport, the next page of
     * articles is fetched and appended automatically.
     */
    function setupInfiniteScroll() {
        const sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        sentinel.style.height = '1px';
        document.querySelector('.news-section').appendChild(sentinel);

        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !isLoading && currentPage < totalPages) {
                fetchNews(currentPage + 1, true);
            }
        }, { rootMargin: '400px' });

        observer.observe(sentinel);
    }

    // ─── Start ───────────────────────────────────────────────────────────
    init();
})();
