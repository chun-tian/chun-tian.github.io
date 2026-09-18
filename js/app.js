document.addEventListener('DOMContentLoaded', async () => {
    const loaderBar = document.getElementById('loader-tech-bar');
    const welcomeSubtitle = document.querySelector('.welcome-subtitle-scramble');
    const welcomeScreen = document.getElementById('welcome-animation');
    const disclaimerModal = document.getElementById('disclaimer-modal');
    const acceptDisclaimerBtn = document.getElementById('accept-disclaimer');

    const updateLoader = (text, width) => {
        if (welcomeSubtitle) welcomeSubtitle.textContent = text;
        if (loaderBar) loaderBar.style.width = width;
    };

    const hideWelcomeScreen = () => {
        if (!welcomeScreen) return;
        welcomeScreen.classList.add('hidden');
        setTimeout(() => {
            welcomeScreen.style.display = 'none';
        }, 800);
    };

    const safeAwait = async (promise, fallback = null) => {
        try {
            return await promise;
        } catch (error) {
            console.error('操作失败:', error);
            return fallback;
        }
    };

    try {
        try { setupEventListeners?.(); } catch(e) { console.error('setupEventListeners:', e); }

        if (typeof localforage === 'undefined') {
            console.warn('LocalForage 未加载，将使用 localStorage 降级方案');
        }

        try {
            const emergencyBackupRaw = localStorage.getItem('BACKUP_V1_critical');
            if (emergencyBackupRaw) {
                const emergencyBackup = JSON.parse(emergencyBackupRaw);
                if (emergencyBackup && Array.isArray(emergencyBackup.messages) && emergencyBackup.messages.length > 0) {
                    console.warn('[boot] 检测到紧急备份，可用于异常恢复');
                }
            }
        } catch (e) {
            console.warn('[boot] 紧急备份检查失败:', e);
        }

        updateLoader('正在建立安全连接...', '10%');
        await safeAwait(initializeSession());

        updateLoader('正在读取记忆存档...', '40%');
        await safeAwait(loadData());

        updateLoader('正在渲染我们的世界...', '70%');
        
        await Promise.allSettled([
            safeAwait(initializeRandomUI?.()),
            safeAwait(initMusicPlayer?.())
        ]);

        setInterval(checkStatusChange, 60000);

        if (disclaimerModal) {
            const tourSeen = await safeAwait(localforage?.getItem(APP_PREFIX + 'tour_seen'), false);
            
            if (!tourSeen) {
                showModal(disclaimerModal);
                
                if (acceptDisclaimerBtn && !acceptDisclaimerBtn._bound) {
                    acceptDisclaimerBtn._bound = true;
                    acceptDisclaimerBtn.addEventListener('click', () => {
                        hideModal(disclaimerModal);
                        localforage?.setItem(APP_PREFIX + 'tour_seen', true).catch(() => {});
                        startTour?.();
                    }, { once: true });
                }
            }
        }

        updateLoader('连接成功，欢迎回来。', '100%');
        setTimeout(hideWelcomeScreen, 3500);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                try {
                    if (typeof saveTimeout !== 'undefined') clearTimeout(saveTimeout);
                } catch (e) {}
                try { _backupCriticalData(); } catch (e) { console.warn('[visibilitychange] 紧急备份失败:', e); }
                try {
                    const p = saveData();
                    if (p && typeof p.catch === 'function') {
                        p.catch(e => console.error('[visibilitychange] 保存失败:', e));
                    }
                } catch (e) {
                    console.error('[visibilitychange] 保存失败:', e);
                }
            } else if (document.visibilityState === 'visible') {
                try {
                    const backup = typeof _tryRecoverFromBackup === 'function' ? _tryRecoverFromBackup() : null;
                    if (backup && Array.isArray(backup.messages) && backup.messages.length > 0 && Array.isArray(messages) && backup.messages.length > messages.length) {
                        console.warn('[visibilitychange] 检测到备份消息比当前更多，自动尝试恢复');
                        try {
                            messages = backup.messages.map(m => ({
                                ...m,
                                timestamp: new Date(m.timestamp)
                            }));
                            if (backup.settings) Object.assign(settings, backup.settings);
                            if (typeof updateUI === 'function') updateUI();
                            if (typeof throttledSaveData === 'function') throttledSaveData();
                            showNotification('已自动恢复本地临时备份内容', 'warning', 3500);
                        } catch (restoreErr) {
                            console.warn('[visibilitychange] 自动恢复失败，保留当前页面内容:', restoreErr);
                        }
                    }
                } catch (e) {
                    console.warn('[visibilitychange] 恢复备份失败:', e);
                }
            }
        });

        window.addEventListener('pagehide', () => {
            try { _backupCriticalData(); } catch (e) {}
            try {
                if (typeof saveTimeout !== 'undefined' && saveTimeout) {
                    clearTimeout(saveTimeout);
                    saveTimeout = null;
                }
                const p = saveData();
                if (p && typeof p.then === 'function') p.catch(() => {});
            } catch (e) {}
        });

        window.addEventListener('beforeunload', () => {
            try { _backupCriticalData(); } catch (e) {}
            try {
                if (typeof saveTimeout !== 'undefined' && saveTimeout) {
                    clearTimeout(saveTimeout);
                    saveTimeout = null;
                }
                const p = saveData();
                if (p && typeof p.then === 'function') p.catch(() => {});
            } catch (e) {}
        });

        setInterval(() => {
            saveData().catch(e => console.warn('[autoBackup] 定时保存失败:', e));
        }, 3 * 60 * 1000);

        (() => {
            const REMIND_KEY = 'exportReminderLastShown';
            const last = parseInt(localStorage.getItem(REMIND_KEY) || '0', 10);
            const daysSince = (Date.now() - last) / (1000 * 60 * 60 * 24);
            if (daysSince >= 7) {
                setTimeout(() => {
                    showNotification('建议定期导出备份，防止数据意外丢失', 'info', 7000);
                    localStorage.setItem(REMIND_KEY, String(Date.now()));
                }, 8000);
            }
        })();

        setTimeout(async () => {
            if ('Notification' in window && Notification.permission === 'default') {
                try {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        showNotification('已开启系统通知，收到消息时会提醒你', 'success', 3000);
                    }
                } catch(e) {
                    console.warn('通知权限请求失败:', e);
                }
            }
        }, 3000);

    } catch (err) {
        console.error('严重初始化错误:', err);
        try {
            const backup = typeof _tryRecoverFromBackup === 'function' ? _tryRecoverFromBackup() : null;
            if (backup && Array.isArray(backup.messages) && backup.messages.length > 0) {
                messages = backup.messages.map(m => ({
                    ...m,
                    timestamp: new Date(m.timestamp)
                }));
                if (backup.settings) Object.assign(settings, backup.settings);
                if (typeof updateUI === 'function') updateUI();
                showNotification('初始化异常，已使用本地紧急备份恢复', 'warning', 5000);
            }
        } catch (recoverErr) {
            console.warn('[boot] 初始化失败后的恢复也失败:', recoverErr);
        }
        updateLoader('加载遇到问题，已强制进入...', '100%');
        setTimeout(hideWelcomeScreen, 3500);
    }
});
const stickerInput = document.getElementById('sticker-file-input');
            if (stickerInput) {
                stickerInput.addEventListener('change', async (e) => {
                    const files = Array.from(e.target.files);
                    if (!files.length) return;

                    const LIMIT_GIF = 5 * 1024 * 1024;
                    const LIMIT_IMG = 2 * 1024 * 1024;
                    const getLimit = (f) => (f.type === 'image/gif' || f.type === 'image/webp') ? LIMIT_GIF : LIMIT_IMG;

                    const validFiles = [];
                    let oversizeCount = 0;
                    for (const f of files) {
                        if (f.size > getLimit(f)) { oversizeCount++; }
                        else { validFiles.push(f); }
                    }
                    if (oversizeCount > 0) {
                        showNotification(oversizeCount + ' 张超过大小限制，已跳过', 'warning');
                    }
                    if (!validFiles.length) { e.target.value = ''; return; }

                    showNotification('正在批量处理 ' + validFiles.length + ' 张...', 'info');

                    let successCount = 0;
                    let failCount = 0;

                    for (const file of validFiles) {
                        try {
                            let base64;
                            // ★ GIF / WebP 动图：直接读原图，不做 canvas 压缩，保留动画
                            if (file.type === 'image/gif' || file.type === 'image/webp') {
                                base64 = await new Promise((resolve, reject) => {
                                    const r = new FileReader();
                                    r.onload = ev => resolve(ev.target.result);
                                    r.onerror = reject;
                                    r.readAsDataURL(file);
                                });
                            } else {
                                base64 = await optimizeImage(file, 300, 0.8);
                            }
                            stickerLibrary.push(base64);
                            successCount++;
                        } catch (err) {
                            console.error(err);
                            failCount++;
                        }
                    }

                    throttledSaveData();
                    renderReplyLibrary();

                    if (failCount > 0) {
                        showNotification('上传完成：' + successCount + ' 张成功，' + failCount + ' 张失败', 'warning');
                    } else {
                        showNotification('上传成功，共 ' + successCount + ' 张', 'success');
                    }

                    e.target.value = '';
                });
            }
const myStickerQuickUpload = document.getElementById('my-sticker-quick-upload');
if (myStickerQuickUpload) {
    myStickerQuickUpload.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;

        const LIMIT_GIF = 5 * 1024 * 1024;
        const LIMIT_IMG = 2 * 1024 * 1024;
        const getLimit = (f) => (f.type === 'image/gif' || f.type === 'image/webp') ? LIMIT_GIF : LIMIT_IMG;

        const validFiles = [];
        let oversizeCount = 0;
        for (const f of files) {
            if (f.size > getLimit(f)) { oversizeCount++; }
            else { validFiles.push(f); }
        }
        if (oversizeCount > 0) showNotification(oversizeCount + ' 张超过大小限制，已跳过', 'warning');
        if (!validFiles.length) { e.target.value = ''; return; }

        showNotification('正在处理 ' + validFiles.length + ' 张...', 'info');
        let ok = 0, fail = 0;
        for (const file of validFiles) {
            try {
                let base64;
                if (file.type === 'image/gif' || file.type === 'image/webp') {
                    base64 = await new Promise((resolve, reject) => {
                        const r = new FileReader();
                        r.onload = ev => resolve(ev.target.result);
                        r.onerror = reject;
                        r.readAsDataURL(file);
                    });
                } else {
                    base64 = await optimizeImage(file, 300, 0.8);
                }
                myStickerLibrary.push(base64);
                ok++;
            } catch(err) { fail++; }
        }
        throttledSaveData();
        if (typeof renderComboContent === 'function') renderComboContent('my-sticker');
        showNotification(fail > 0 ? `上传完成：${ok} 成功 ${fail} 失败` : `✓ 已添加 ${ok} 张到我的表情库`, fail > 0 ? 'warning' : 'success');
        e.target.value = '';
    });
}
/* =========================================================
 * 网页链接预览（粘贴检测 + 分享到聊天）
 * ========================================================= */
(function () {
    'use strict';

    var CACHE_KEY = 'webPreviewCache_v1';
    var CACHE_MAX = 100;
    var cache = {};
    var currentPreviewUrl = null;
    var currentPreviewInfo = null;
    var isPreviewBarVisible = false;

    // 排除已知平台（交给 link-card.js 处理）
    var EXCLUDE = [
        /xiaohongshu\.com/i, /xhslink\.com/i,
        /douyin\.com/i, /v\.douyin\.com/i
    ];
    function isExcluded(url) {
        for (var i = 0; i < EXCLUDE.length; i++) {
            if (EXCLUDE[i].test(url)) return true;
        }
        return false;
    }

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
                keys.slice(0, keys.length - CACHE_MAX).forEach(function (k) { delete cache[k]; });
            }
            localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        } catch (e) {}
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function extractUrl(text) {
        var m = String(text || '').match(/https?:\/\/[^\s"'<>]+/i);
        if (!m) return null;
        return m[0].replace(/[)\u3002\uff0c\uff1b;!?\uff01\uff1f]+$/g, '');
    }
    function isPureUrl(text) {
        var t = String(text || '').trim();
        return /^https?:\/\/[^\s"'<>]+$/i.test(t);
    }

    // 拉取预览信息：先 microlink.io，失败后走 allorigins 代理抓 HTML 解析
    function fetchPreview(url) {
        if (cache[url] && cache[url].title) return Promise.resolve(cache[url]);

        return fetch('https://api.microlink.io/?url=' + encodeURIComponent(url))
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data && data.status === 'success' && data.data) {
                    var d = data.data;
                    var info = {
                        url: url,
                        title: d.title || '',
                        desc: d.description || '',
                        image: (d.image && (d.image.url || d.image)) || '',
                        site: d.publisher || ''
                    };
                    if (!info.site) {
                        try { info.site = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
                    }
                    cache[url] = info;
                    saveCache();
                    return info;
                }
                throw new Error('microlink failed');
            })
            .catch(function () {
                return fetch('https://api.allorigins.win/get?url=' + encodeURIComponent(url))
                    .then(function (r) { return r.json(); })
                    .then(function (data) {
                        if (!data || !data.contents) throw new Error('proxy failed');
                        var info = parseHtmlMeta(url, data.contents);
                        cache[url] = info;
                        saveCache();
                        return info;
                    })
                    .catch(function () {
                        var info = { url: url, title: url, desc: '', image: '', site: '' };
                        try { info.site = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
                        return info;
                    });
            });
    }

    function parseHtmlMeta(url, html) {
        var info = { url: url, title: '', desc: '', image: '', site: '' };
        try { info.site = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}

        function matchTag(name, attr) {
            attr = attr || 'property';
            var re1 = new RegExp('<meta[^>]*' + attr + '=["\']' + name + '["\'][^>]*content=["\']([^"\']*)["\']', 'i');
            var m = html.match(re1);
            if (m) return m[1];
            var re2 = new RegExp('<meta[^>]*content=["\']([^"\']*)["\'][^>]*' + attr + '=["\']' + name + '["\']', 'i');
            m = html.match(re2);
            return m ? m[1] : '';
        }

        var titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        info.title = matchTag('og:title') || matchTag('twitter:title') || (titleMatch ? titleMatch[1].trim() : '');
        info.desc = matchTag('og:description') || matchTag('twitter:description') || matchTag('description', 'name');
        info.image = matchTag('og:image') || matchTag('twitter:image');

        function decode(s) {
            if (!s) return s;
            var el = document.createElement('textarea');
            el.innerHTML = s;
            return el.value;
        }
        info.title = decode(info.title);
        info.desc = decode(info.desc);
        info.image = decode(info.image);

        if (info.image && !/^https?:\/\//i.test(info.image)) {
            try { info.image = new URL(info.image, url).href; } catch (e) {}
        }
        return info;
    }

    function buildCardHtml(info, isPreview) {
        if (!info) return '';
        var coverStyle = info.image
            ? 'background-image:url("' + String(info.image).replace(/"/g, '%22') + '");'
            : '';
        return '' +
            '<div class="wp-card' + (isPreview ? ' wp-preview-card' : '') + '" data-wp-url="' + escapeHtml(info.url) + '">' +
              (info.image ?
                '<div class="wp-cover" style="' + coverStyle + '"></div>' :
                '<div class="wp-cover wp-cover-empty"><i class="fas fa-globe"></i></div>'
              ) +
              '<div class="wp-info">' +
                '<div class="wp-site"><i class="fas fa-link" style="font-size:9px;margin-right:4px;"></i>' + escapeHtml(info.site || '网页') + '</div>' +
                '<div class="wp-title">' + escapeHtml(info.title || info.url) + '</div>' +
                (info.desc ? '<div class="wp-desc">' + escapeHtml(info.desc) + '</div>' : '') +
              '</div>' +
            '</div>';
    }

    // ========== 预览浮层 ==========
    var barEl = null;
    var barBodyEl = null;

    function ensureBar() {
        if (barEl) return barEl;
        var inputWrap = document.querySelector('.input-area-wrapper');
        if (!inputWrap) return null;

        barEl = document.createElement('div');
        barEl.className = 'wp-preview-bar';
        barEl.id = 'wp-preview-bar';
        barEl.style.display = 'none';
        barEl.innerHTML =
            '<div class="wp-preview-body" id="wp-preview-body"></div>' +
            '<div class="wp-preview-actions">' +
              '<button class="wp-preview-btn ghost" id="wp-preview-close" title="取消预览"><i class="fas fa-times"></i></button>' +
              '<button class="wp-preview-btn primary" id="wp-preview-send"><i class="fas fa-paper-plane" style="font-size:11px;margin-right:5px;"></i>分享到聊天</button>' +
            '</div>';

        var replyPreview = document.getElementById('reply-preview-container');
        if (replyPreview && replyPreview.parentNode === inputWrap) {
            inputWrap.insertBefore(barEl, replyPreview);
        } else {
            inputWrap.insertBefore(barEl, inputWrap.firstChild);
        }

        barBodyEl = barEl.querySelector('#wp-preview-body');

        barEl.querySelector('#wp-preview-close').addEventListener('click', function () {
            hideBar();
            currentPreviewUrl = null;
            currentPreviewInfo = null;
        });
        barEl.querySelector('#wp-preview-send').addEventListener('click', function () {
            sendToChat();
        });

        return barEl;
    }

    function showBarLoading(url) {
        var bar = ensureBar();
        if (!bar) return;
        barBodyEl.innerHTML =
            '<div class="wp-preview-loading">' +
              '<div class="wp-preview-spinner"></div>' +
              '<span>正在获取预览…</span>' +
            '</div>';
        bar.style.display = 'flex';
        isPreviewBarVisible = true;
    }

    function showBarCard(info) {
        var bar = ensureBar();
        if (!bar) return;
        barBodyEl.innerHTML = buildCardHtml(info, true);
        bar.style.display = 'flex';
        isPreviewBarVisible = true;
    }

    function hideBar() {
        if (barEl) barEl.style.display = 'none';
        isPreviewBarVisible = false;
    }

    function checkAndPreview() {
        var input = document.getElementById('message-input');
        if (!input) return;
        var val = input.value;
        if (!isPureUrl(val)) {
            hideBar();
            currentPreviewUrl = null;
            currentPreviewInfo = null;
            return;
        }
        var url = extractUrl(val);
        if (!url) { hideBar(); return; }
        if (isExcluded(url)) { hideBar(); return; }

        if (url === currentPreviewUrl && currentPreviewInfo) {
            showBarCard(currentPreviewInfo);
            return;
        }
        currentPreviewUrl = url;
        currentPreviewInfo = null;
        showBarLoading(url);
        fetchPreview(url).then(function (info) {
            if (currentPreviewUrl !== url) return;
            currentPreviewInfo = info;
            showBarCard(info);
        });
    }

    function sendToChat() {
        if (!currentPreviewInfo) return;
        var input = document.getElementById('message-input');
        if (!input) return;

        var text = input.value.trim();
        var replyToVal = (typeof currentReplyTo !== 'undefined') ? currentReplyTo : null;

        var msg = {
            id: Date.now(),
            sender: 'user',
            text: text,
            timestamp: new Date(),
            status: 'sent',
            favorited: false,
            note: null,
            replyTo: replyToVal,
            type: 'normal',
            linkPreview: {
                url: currentPreviewInfo.url,
                title: currentPreviewInfo.title,
                desc: currentPreviewInfo.desc,
                image: currentPreviewInfo.image,
                site: currentPreviewInfo.site
            }
        };

        input.value = '';
        input.style.height = '46px';
        hideBar();

        try {
            if (typeof currentReplyTo !== 'undefined') currentReplyTo = null;
            if (typeof updateReplyPreview === 'function') updateReplyPreview();
        } catch (e) {}

        if (typeof addMessage === 'function') addMessage(msg);
        if (typeof playSound === 'function') playSound('send');

        if (typeof settings !== 'undefined' && typeof simulateReply === 'function') {
            var min = settings.replyDelayMin || 3000;
            var max = settings.replyDelayMax || 7000;
            var delay = min + Math.random() * (max - min);
            if (window._pendingReplyTimer) clearTimeout(window._pendingReplyTimer);
            window._pendingReplyTimer = setTimeout(function () {
                window._pendingReplyTimer = null;
                simulateReply();
            }, delay);
        }

        currentPreviewUrl = null;
        currentPreviewInfo = null;
    }

    // ========== 事件绑定 ==========
    function bindInputEvents() {
        var input = document.getElementById('message-input');
        if (!input || input._wpBound) return;
        input._wpBound = true;

        input.addEventListener('paste', function () {
            setTimeout(checkAndPreview, 80);
        });
        input.addEventListener('input', function () {
            if (isPreviewBarVisible && !isPureUrl(input.value)) {
                hideBar();
                currentPreviewUrl = null;
                currentPreviewInfo = null;
            }
        });
    }

    document.addEventListener('click', function (e) {
        var card = e.target.closest('.wp-card');
        if (!card) return;
        if (card.classList.contains('wp-preview-card')) return;
        e.stopPropagation();
        var url = card.dataset.wpUrl;
        if (url) window.open(url, '_blank', 'noopener');
    });

    loadCache();

    function init() { bindInputEvents(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 600); });
    } else {
        setTimeout(init, 600);
    }

    window.WebPreview = {
        extractUrl: extractUrl,
        isPureUrl: isPureUrl,
        fetch: fetchPreview,
        buildCardHtml: buildCardHtml,
        getCache: function () { return cache; },
        clearCache: function () { cache = {}; saveCache(); }
    };
})();

window.addEventListener('load', function() {
    setTimeout(function() {
        try {
            if (localStorage.getItem('dailyGreetingShown') === new Date().toDateString()) return;
            try { if (typeof checkPartnerDailyMood === 'function') checkPartnerDailyMood(); } catch(e2) { console.warn('checkPartnerDailyMood error:', e2); }
            if (typeof _buildDailyGreeting === 'function') _buildDailyGreeting();
            if (window.localforage && window.APP_PREFIX) {
                localforage.getItem(window.APP_PREFIX + 'tour_seen').then(function(seen) {
                    if (seen) {
                        var modal = document.getElementById('daily-greeting-modal');
                        if (modal) modal.classList.remove('hidden');
                        localStorage.setItem('dailyGreetingShown', new Date().toDateString());
                    }
                }).catch(function() {
                    var modal = document.getElementById('daily-greeting-modal');
                    if (modal) modal.classList.remove('hidden');
                    localStorage.setItem('dailyGreetingShown', new Date().toDateString());
                });
            } else {
                var modal = document.getElementById('daily-greeting-modal');
                if (modal) modal.classList.remove('hidden');
                localStorage.setItem('dailyGreetingShown', new Date().toDateString());
            }
        } catch(e) { console.warn('Daily greeting timing error:', e); }
    }, 4500);
}, { once: true });
