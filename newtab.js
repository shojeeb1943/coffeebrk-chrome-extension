/**
 * CoffeeBrk New Tab — Modern News Reader
 * Clean, fast, and user-friendly.
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

    // ─── State ───────────────────────────────────────────────────────────
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
        } catch (e) {
            console.log('CoffeeBrk: Using default settings');
        }
        settings = { ...DEFAULT_SETTINGS };
    }

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
    function timeAgo(dateStr) {
        const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function estimateReadTime(text) {
        if (!text) return '1 min';
        const words = text.split(/\s+/).length;
        const mins = Math.max(1, Math.ceil(words / 200));
        return mins + ' min';
    }

    function getSourceInitial(source) {
        if (!source) return 'C';
        return source.charAt(0).toUpperCase();
    }

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
                ${catName ? `<span class="news-card__category">${escapeHtml(catName)}</span>` : ''}
                <h3 class="news-card__title">${escapeHtml(article.title)}</h3>
                ${excerptHtml}
            </div>
            <div class="news-card__footer">
                <div class="news-card__meta">
                    <span class="news-card__source">
                        <span class="news-card__source-icon">${getSourceInitial(sourceName)}</span>
                        ${escapeHtml(sourceName)}
                    </span>
                    <span class="news-card__date">${timeAgo(article.date)}</span>
                </div>
                <span class="news-card__reading-time">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    ${readTime}
                </span>
            </div>
        `;

        // Handle image load errors (CSP-compliant)
        const img = card.querySelector('img[data-fallback="true"]');
        if (img) {
            img.addEventListener('error', function() {
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

    function trackArticleRead() {
        try {
            const today = new Date().toDateString();
            const stored = localStorage.getItem('coffeebrk_articles_read');
            let data = stored ? JSON.parse(stored) : { date: today, count: 0 };
            if (data.date !== today) data = { date: today, count: 0 };
            data.count++;
            localStorage.setItem('coffeebrk_articles_read', JSON.stringify(data));
        } catch (e) {}
    }

    // ─── Fetch News ──────────────────────────────────────────────────────
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
            console.error('CoffeeBrk: Fetch failed', err);
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

    // ─── Video Modal ────────────────────────────────────────────────────
    function getVideoEmbedUrl(url) {
        if (!url) return null;

        // YouTube Shorts
        const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
        if (shortsMatch) {
            return `https://www.youtube.com/embed/${shortsMatch[1]}?autoplay=1&loop=1&playlist=${shortsMatch[1]}`;
        }

        // YouTube standard
        const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
        if (ytMatch) {
            return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1`;
        }

        // Vimeo
        const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
        if (vimeoMatch) {
            return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
        }

        // Direct video URL - can't embed, open in new tab
        return null;
    }

    function isVerticalVideo(url) {
        // YouTube Shorts are vertical
        return url && url.includes('/shorts/');
    }

    function openVideoModal(url) {
        const embedUrl = getVideoEmbedUrl(url);

        if (!embedUrl) {
            // Can't embed, open in new tab
            window.open(url, '_blank');
            return;
        }

        const isVertical = isVerticalVideo(url);

        // Set aspect ratio based on video type
        if (isVertical) {
            videoModalContent.classList.remove('landscape');
            videoModal.querySelector('.video-modal__container').classList.remove('landscape');
        } else {
            videoModalContent.classList.add('landscape');
            videoModal.querySelector('.video-modal__container').classList.add('landscape');
        }

        videoModalContent.innerHTML = `<iframe src="${embedUrl}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
        videoModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeVideoModal() {
        videoModal.classList.remove('active');
        document.body.style.overflow = '';
        // Delay clearing to allow animation
        setTimeout(() => {
            videoModalContent.innerHTML = '';
        }, 300);
    }

    // Setup video modal event listeners
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
            console.error('CoffeeBrk: Failed to load stories', e);
            // Hide section on error - will show again when API is available
            storiesTrack.innerHTML = '';
            storiesSection.classList.add('stories-hidden');
        }
    }

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
        } catch (e) {}
    }

    // ─── Event Listeners ─────────────────────────────────────────────────
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
