/* =========================================================
 * link-card.js — 小红书 / 抖音链接卡片
 *  · 消息里出现相关链接时，自动渲染成带封面的卡片
 *  · 抖音使用 tikwm.com 免费 API 拉取封面
 *  · 小红书默认展示占位卡片（可在控制台配置自定义 API）
 * ========================================================= */
(function () {
    'use strict';

    var PLATFORMS = {
        xiaohongshu: {
            name: '小红书',
            icon: 'fa-book-open',
            color: '#ff2442',
            source: '(?:xiaohongshu\\.com|xhslink\\.com)/[^\\s"\'<>]+'
        },
        douyin: {
            name: '抖音',
            icon: 'fa-music',
            color: '#010101',
            source: '(?:douyin\\.com|v\\.douyin\\.com)/[^\\s"\'<>]+'
        }
    };

    var CACHE_KEY = 'linkCardCache_v1';
    var CACHE_MAX = 200;
    var cache = {};

    function loadCache() {
        try {
            var raw = localStorage.getItem(CACHE_KEY);
            if (raw) cache = JSON.parse(raw) || {};
        } catch (e) { cache = {}; }
    }
    function saveCache() {
        try {
            var keys = Object.keys(cache);
            if (keys.length > CACHE_MAX) {
                var drop = keys.slice(0, keys.length - CACHE_MAX);
                drop.forEach(function (k) { delete cache[k]; });
            }
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch (e) {}
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function cssEscape(s) {
        return String(s).replace(/["\\]/g, '\\$&');
    }

    function normalizeUrl(u) {
        u = String(u).replace(/[)\u3002\uff0c\uff1b;!?\uff01\uff1f]+$/g, '');
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        return u;
    }

    function extractLinks(text) {
        if (!text || typeof text !== 'string') return [];
        var found = [];
        var seen = {};
        Object.keys(PLATFORMS).forEach(function (pkey) {
            var p = PLATFORMS[pkey];
            var re = new RegExp(p.source, 'gi');
            var m;
            while ((m = re.exec(text)) !== null) {
                var url = normalizeUrl(m[0]);
                if (seen[url]) continue;
                seen[url] = true;
                found.push({ platform: pkey, url: url });
            }
        });
        return found;
    }

    function buildCardHtml(platform, url) {
        var p = PLATFORMS[platform];
        if (!p) return '';
        var cached = cache[url] || {};
        var coverStyle = cached.cover
            ? 'background-image:url("' + cached.cover.replace(/"/g, '%22') + '");'
            : '';
        var title = cached.title || '点击查看详情';
        return '' +
            '<div class="lc-card" data-lc-url="' + escapeHtml(url) + '" data-lc-platform="' + platform + '">' +
              '<div class="lc-cover" style="' + coverStyle + '">' +
                (cached.cover ? '' : '<div class="lc-cover-placeholder"><i class="fas ' + p.icon + '"></i></div>') +
              '</div>' +
              '<div class="lc-info">' +
                '<div class="lc-platform" style="color:' + p.color + ';">' +
                  '<i class="fas ' + p.icon + '"></i> ' + p.name +
                '</div>' +
                '<div class="lc-title">' + escapeHtml(title) + '</div>' +
                '<div class="lc-hint"><i class="fas fa-external-link-alt" style="font-size:9px;margin-right:3px;"></i>点击卡片打开</div>' +
              '</div>' +
            '</div>';
    }

    /* ---------- 对外接口：core.js 会调用 ---------- */
    window.LinkCard = {
        extractLinks: extractLinks,
        buildCardsHtml: function (text) {
            var links = extractLinks(text);
            if (!links.length) return '';
            var html = '<div class="lc-container">';
            links.forEach(function (l) {
                html += buildCardHtml(l.platform, l.url);
            });
            html += '</div>';
            return html;
        }
    };

    /* ---------- 点击卡片打开链接 ---------- */
    document.addEventListener('click', function (e) {
        var card = e.target.closest('.lc-card');
        if (!card) return;
        e.stopPropagation();
        var url = card.dataset.lcUrl;
        if (url) window.open(url, '_blank', 'noopener');
    });

    /* ---------- 解析封面 ---------- */
    function getApiFor(platform) {
        try {
            var custom = localStorage.getItem('linkCardApi_' + platform);
            if (custom && custom.trim()) return custom.trim();
        } catch (e) {}
        // 内置默认
        if (platform === 'douyin') {
            return 'https://www.tikwm.com/api/?url=';
        }
        // 小红书没有稳定公开 API，默认返回 null
        return null;
    }

    function parseResponse(platform, data) {
        if (!data || typeof data !== 'object') return null;
        // tikwm 格式
        if (platform === 'douyin') {
            if (data.code === 0 && data.data) {
                return {
                    cover: data.data.cover || data.data.origin_cover || data.data.dynamic_cover || null,
                    title: data.data.title || ''
                };
            }
        }
        // 通用兜底格式
        var d = data.data || data;
        if (d && (d.cover || d.image || d.pic)) {
            return {
                cover: d.cover || d.image || d.pic,
                title: d.title || d.desc || ''
            };
        }
        return null;
    }

    function resolveCover(card) {
        if (!card || card.dataset.lcResolved === '1') return;
        var url = card.dataset.lcUrl;
        var platform = card.dataset.lcPlatform;
        if (!url || !platform) return;

        // 命中缓存直接跳过
        if (cache[url] && cache[url].cover) {
            card.dataset.lcResolved = '1';
            return;
        }

        var api = getApiFor(platform);
        if (!api) {
            card.dataset.lcResolved = '1';
            return;
        }
        card.dataset.lcResolved = '1';

        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, 8000) : null;

        fetch(api + encodeURIComponent(url), controller ? { signal: controller.signal } : {})
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (timer) clearTimeout(timer);
                var info = parseResponse(platform, data);
                if (!info || !info.cover) return;
                cache[url] = info;
                saveCache();
                // 更新所有同 URL 的卡片
                try {
                    document.querySelectorAll('.lc-card[data-lc-url="' + cssEscape(url) + '"]').forEach(function (el) {
                        var cover = el.querySelector('.lc-cover');
                        if (cover) {
                            cover.style.backgroundImage = 'url("' + info.cover.replace(/"/g, '%22') + '")';
                            cover.innerHTML = '';
                        }
                        var title = el.querySelector('.lc-title');
                        if (title && info.title) title.textContent = info.title;
                    });
                } catch (e) {}
            })
            .catch(function () {
                if (timer) clearTimeout(timer);
            });
    }

    /* ---------- 观察聊天区新增的卡片 ---------- */
    var observer = null;
    function initObserver() {
        if (observer) return;
        var chatContainer = document.getElementById('chat-container');
        if (!chatContainer) {
            setTimeout(initObserver, 500);
            return;
        }
        observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (m) {
                m.addedNodes.forEach(function (node) {
                    if (node.nodeType !== 1) return;
                    if (node.classList && node.classList.contains('lc-card')) {
                        resolveCover(node);
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('.lc-card').forEach(resolveCover);
                    }
                });
            });
        });
        observer.observe(chatContainer, { childList: true, subtree: true });
        // 初始扫描
        chatContainer.querySelectorAll('.lc-card').forEach(resolveCover);
    }

    function init() {
        loadCache();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () { setTimeout(initObserver, 900); });
        } else {
            setTimeout(initObserver, 900);
        }
    }
    init();

    window.linkCardFeature = {
        getCache: function () { return cache; },
        clearCache: function () { cache = {}; saveCache(); },
        setApi: function (platform, api) {
            try { localStorage.setItem('linkCardApi_' + platform, api || ''); } catch (e) {}
        }
    };
})();