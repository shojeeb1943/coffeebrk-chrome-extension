/**
 * CoffeeBrk New Tab — JavaScript
 * Fetches news from the public API, handles categories, search, and pagination.
 */

(() => {
    'use strict';

    // ─── Config ──────────────────────────────────────────────────────────
    const API_BASE = 'https://app.coffeebrk.ai/wp-json/coffeebrk/v1/public';
    const PER_PAGE = 20;

    // ─── State ───────────────────────────────────────────────────────────
    let currentPage = 1;
    let totalPages = 1;
    let isLoading = false;
    let activeCategory = '';

    // ─── DOM refs ────────────────────────────────────────────────────────
    const grid = document.getElementById('news-grid');
    const loader = document.getElementById('loader');
    const emptyState = document.getElementById('empty-state');
    const errorState = document.getElementById('error-state');
    const retryBtn = document.getElementById('retry-btn');
    const greetingEl = document.getElementById('greeting');
    const catBar = document.querySelector('.category-bar');

    // ─── Greeting ────────────────────────────────────────────────────────
    function setGreeting() {
        const h = new Date().getHours();
        let msg;
        if (h < 5) msg = '🌙 Good night';
        else if (h < 12) msg = '☀️ Good morning';
        else if (h < 17) msg = '🌤️ Good afternoon';
        else if (h < 21) msg = '🌅 Good evening';
        else msg = '🌙 Good night';
        greetingEl.textContent = msg;
    }

    // ─── Time helpers ────────────────────────────────────────────────────
    function timeAgo(dateStr) {
        const now = Date.now();
        const then = new Date(dateStr).getTime();
        const diff = Math.floor((now - then) / 1000);

        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric',
        });
    }

    // ─── Skeleton cards ──────────────────────────────────────────────────
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

    // ─── Render a news card ──────────────────────────────────────────────
    function createCard(article, index, featured = false) {
        const card = document.createElement('article');
        card.className = 'news-card' + (featured ? ' news-card--featured' : '');
        card.style.animationDelay = `${index * 0.06}s`;

        const catName = article.categories && article.categories.length > 0
            ? article.categories[0].name
            : '';

        const imgHtml = article.image
            ? `<img class="news-card__image" src="${article.image}" alt="${escapeHtml(article.title)}" loading="lazy">`
            : `<div class="news-card__image" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#1e1e24,#2a2a32)">
           <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
         </div>`;

        card.innerHTML = `
      ${imgHtml}
      <div class="news-card__body">
        ${catName ? `<span class="news-card__category">${escapeHtml(catName)}</span>` : ''}
        <h3 class="news-card__title">${escapeHtml(article.title)}</h3>
        <p class="news-card__excerpt">${escapeHtml(article.excerpt)}</p>
      </div>
      <div class="news-card__footer">
        <span class="news-card__source">${escapeHtml(article.source || 'CoffeeBrk')}</span>
        <span class="news-card__date">${timeAgo(article.date)}</span>
      </div>
    `;

        card.addEventListener('click', () => {
            window.open(article.permalink, '_blank');
        });

        return card;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    // ─── Fetch news ──────────────────────────────────────────────────────
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
        const timeout = setTimeout(() => controller.abort(), 10000);

        try {
            let url = `${API_BASE}/posts?page=${page}&per_page=${PER_PAGE}`;
            if (activeCategory) url += `&category=${encodeURIComponent(activeCategory)}`;

            const res = await fetch(url, { signal: controller.signal });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const data = await res.json();
            totalPages = data.total_pages || 1;
            currentPage = page;

            if (!append) grid.innerHTML = '';

            if (data.items && data.items.length > 0) {
                data.items.forEach((article, i) => {
                    const featured = !append && page === 1 && i === 0;
                    grid.appendChild(createCard(article, i, featured));
                });
                emptyState.style.display = 'none';
            } else if (!append) {
                emptyState.style.display = 'block';
            }

            errorState.style.display = 'none';
        } catch {
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

    // ─── Load categories ─────────────────────────────────────────────────
    async function loadCategories() {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
            const res = await fetch(`${API_BASE}/categories`, { signal: controller.signal });
            if (!res.ok) return;
            const cats = await res.json();
            cats.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'cat-pill';
                btn.dataset.category = cat.slug;
                btn.textContent = cat.name;
                catBar.appendChild(btn);
            });
        } catch {
            // Categories are non-critical; silently skip on failure
        } finally {
            clearTimeout(timeout);
        }
    }

    // ─── Category click handler ──────────────────────────────────────────
    catBar.addEventListener('click', (e) => {
        const pill = e.target.closest('.cat-pill');
        if (!pill) return;

        catBar.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        activeCategory = pill.dataset.category || '';
        currentPage = 1;
        fetchNews(1);
    });

    // ─── Infinite scroll ─────────────────────────────────────────────────
    function setupInfiniteScroll() {
        const sentinel = document.createElement('div');
        sentinel.id = 'scroll-sentinel';
        sentinel.style.height = '1px';
        document.querySelector('.news-section').appendChild(sentinel);

        const observer = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && !isLoading && currentPage < totalPages) {
                fetchNews(currentPage + 1, true);
            }
        }, { rootMargin: '300px' });

        observer.observe(sentinel);
    }

    // ─── Retry button ────────────────────────────────────────────────────
    retryBtn.addEventListener('click', () => {
        fetchNews(1);
    });

    // ─── Init ────────────────────────────────────────────────────────────
    setGreeting();
    loadCategories();
    fetchNews(1);
    setupInfiniteScroll();
})();
