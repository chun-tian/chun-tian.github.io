/* =========================================================
 * companion-hub.js — 陪伴空间 Hub（整合入口 + 设置中心）
 *  · 顶部壁纸 banner + 开屏动画
 *  · 整合影音室 / 陪伴空间 / 心晴手账 / 重要日 / 信封
 *  · 设置：壁纸、互动速度、已读不回、评论拼接、表情包
 * ========================================================= */
(function () {
    'use strict';

    var KEY = 'companionHubSettings_v1';
    var DEFAULTS = {
        bg: null,
        speed: 5,
        noReplyChance: 0.2,
        commentEnabled: false,
        commentChance: 0.15,
        emojiEnabled: true
    };
    var PHOTO_KEY = 'companionHubPhotos_v1';
    var PHOTO_MAX = 24;
    var hub = Object.assign({}, DEFAULTS);
    var hubPhotos = [];
    var _splashTimer = null;

    function load() {
        try {
            var raw = localStorage.getItem(KEY);
            if (raw) Object.assign(hub, JSON.parse(raw));
        } catch (e) {}
        try {
            var praw = localStorage.getItem(PHOTO_KEY);
            if (praw) {
                var arr = JSON.parse(praw);
                if (Array.isArray(arr)) hubPhotos = arr.filter(function (x) { return typeof x === 'string'; });
            }
        } catch (e) {}
    }
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(hub)); } catch (e) {}
    }
    function savePhotos() {
        try { localStorage.setItem(PHOTO_KEY, JSON.stringify(hubPhotos)); } catch (e) {
            if (typeof showNotification === 'function') showNotification('照片空间已满，请删除部分照片', 'warning', 3000);
        }
    }
    function getGreeting() {
        var h = new Date().getHours();
        if (h < 6)  return { txt: '深夜好', en: 'LATE NIGHT' };
        if (h < 12) return { txt: '早上好', en: 'GOOD MORNING' };
        if (h < 18) return { txt: '下午好', en: 'GOOD AFTERNOON' };
        return { txt: '晚上好', en: 'GOOD EVENING' };
    }
    function applyToApp() {
        if (typeof settings === 'undefined') return;
        var s = hub.speed;
        settings.replyDelayMin = Math.round(800 + (s - 1) * 580);
        settings.replyDelayMax = Math.round(2500 + (s - 1) * 1400);
        settings.readNoReplyChance = hub.noReplyChance;
        if (typeof throttledSaveData === 'function') throttledSaveData();
    }

    /* ---------- 构建 DOM ---------- */
    function ensureDOM() {
        var modal = document.getElementById('companion-hub-modal');
        if (!modal || modal.dataset.built === '1') return modal;

        modal.innerHTML =
            '<div class="ch-wrap">' +
              '<div class="ch-splash" id="ch-splash">' +
                '<div class="ch-splash-icon"><i class="fas fa-heart"></i></div>' +
'<div class="ch-splash-title">陪 伴 时 光</div>' +
'<div class="ch-splash-sub">SOFT COMPANION</div>' +
                '<div class="ch-splash-dots"><span></span><span></span><span></span></div>' +
              '</div>' +

              '<div class="ch-topbar">' +
                '<button class="ch-topbar-btn" id="ch-close"><i class="fas fa-times"></i></button>' +
                '<div class="ch-topbar-title" id="ch-topbar-title">陪伴空间</div>' +
                '<button class="ch-topbar-btn" id="ch-settings-btn"><i class="fas fa-sliders-h"></i></button>' +
              '</div>' +

              '<div class="ch-banner" id="ch-banner">' +
                '<div class="ch-banner-info">' +
                  '<div class="ch-banner-greeting" id="ch-greeting">GOOD EVENING</div>' +
                  '<div class="ch-banner-main" id="ch-main">晚上好</div>' +
                  '<div class="ch-banner-time" id="ch-time"></div>' +
                '</div>' +
              '</div>' +

              '<div class="ch-body">' +
                /* 首页：横滑双页 */
                '<div class="ch-view active" id="ch-view-home">' +

                  /* 第 1 页：照片墙 */
                  '<div class="ch-page ch-page-photos">' +
                    '<div class="ch-photo-page-head">' +
                      '<div class="ch-photo-page-title">✦ 我们的照片墙</div>' +
                      '<div class="ch-photo-page-sub" id="ch-photo-count">0 / 24</div>' +
                    '</div>' +
                    '<div class="ch-photo-grid" id="ch-photo-grid"></div>' +
                    '<div class="ch-photo-hint">点 + 添加照片 · 长按删除 · 左滑进入小世界 →</div>' +
                    '<input type="file" id="ch-photo-input" accept="image/*" multiple style="display:none;">' +
                  '</div>' +

                  /* 第 2 页：功能卡片 */
                  '<div class="ch-page ch-page-functions">' +
                    '<div class="ch-section-title">✦ 我们的小世界</div>' +
                    '<div class="ch-cards">' +
                      '<div class="ch-card" data-target="mediaRoom"><div class="ch-card-icon c1"><i class="fas fa-tv"></i></div><div class="ch-card-title">影音室</div><div class="ch-card-desc">一起听歌 · 看剧 · 读书</div></div>' +
                      '<div class="ch-card" data-target="companion"><div class="ch-card-icon c2"><i class="fas fa-hourglass-half"></i></div><div class="ch-card-title">陪伴空间</div><div class="ch-card-desc">一起学习 · 工作 · 睡觉</div></div>' +
                      '<div class="ch-card" data-target="mood"><div class="ch-card-icon c3"><i class="fas fa-book-open"></i></div><div class="ch-card-title">心晴手账</div><div class="ch-card-desc">记录每天的心情天气</div></div>' +
                      '<div class="ch-card" data-target="anniversary"><div class="ch-card-icon c4"><i class="fas fa-heart"></i></div><div class="ch-card-title">重要日</div><div class="ch-card-desc">纪念日 · 倒计时</div></div>' +
                      '<div class="ch-card" data-target="envelope"><div class="ch-card-icon c5"><i class="fas fa-envelope"></i></div><div class="ch-card-title">信封投递</div><div class="ch-card-desc">写一封信给 Ta</div></div>' +
                      '<div class="ch-card" data-target="avatarLib"><div class="ch-card-icon c6"><i class="fas fa-user-circle"></i></div><div class="ch-card-title">头像库</div><div class="ch-card-desc">Ta 会挑头像邀请你换</div></div>' +
                    '</div>' +
                  '<div class="ch-photo-hint">← 右滑回到照片墙</div>' +
                  '</div>' +

                  /* 第 3 页：小游戏 */
                  '<div class="ch-page ch-page-games">' +
                    '<div class="ch-section-title">✦ 我们的小游戏</div>' +
                    '<div id="ch-games-content"></div>' +
                  '</div>' +

                '</div>' +

                /* 设置视图 */
                '<div class="ch-view" id="ch-view-settings">' +
                  '<div class="ch-section-title">✦ 空间壁纸</div>' +
                  '<div class="ch-setting-group">' +
                    '<div class="ch-setting-row" style="flex-direction:column; align-items:stretch; gap:0;">' +
                      '<div class="ch-bg-preview" id="ch-bg-preview"><span>暂无自定义壁纸</span></div>' +
                      '<div class="ch-btn-row">' +
                        '<button class="ch-btn primary" id="ch-bg-upload"><i class="fas fa-image"></i> 上传壁纸</button>' +
                        '<button class="ch-btn ghost" id="ch-bg-clear"><i class="fas fa-times"></i> 清除</button>' +
                      '</div>' +
                      '<input type="file" id="ch-bg-input" accept="image/*" style="display:none;">' +
                    '</div>' +
                  '</div>' +

                  '<div class="ch-section-title">✦ 互动节奏</div>' +
                  '<div class="ch-setting-group">' +
                    '<div class="ch-slider-row">' +
                      '<div class="ch-slider-head"><span class="ch-slider-label">回复速度</span><span class="ch-slider-val" id="ch-speed-val">中</span></div>' +
                      '<input type="range" min="1" max="10" step="1" value="5" class="ch-slider" id="ch-speed">' +
                    '</div>' +
                    '<div class="ch-slider-row">' +
                      '<div class="ch-slider-head"><span class="ch-slider-label">已读不回概率</span><span class="ch-slider-val" id="ch-noreply-val">20%</span></div>' +
                      '<input type="range" min="0" max="80" step="5" value="20" class="ch-slider" id="ch-noreply">' +
                    '</div>' +
                  '</div>' +

                  '<div class="ch-section-title">✦ 消息增强</div>' +
                  '<div class="ch-setting-group">' +
                    '<div class="ch-setting-row">' +
                      '<div class="ch-setting-icon"><i class="fas fa-quote-right"></i></div>' +
                      '<div class="ch-setting-info"><div class="ch-setting-label">评论拼接</div><div class="ch-setting-desc">Ta 偶尔会在回复后拼接一句小评论</div></div>' +
                      '<div class="ch-setting-switch" id="ch-comment-switch"></div>' +
                    '</div>' +
                    '<div class="ch-slider-row" id="ch-comment-slider-row">' +
                      '<div class="ch-slider-head"><span class="ch-slider-label">拼接概率</span><span class="ch-slider-val" id="ch-comment-val">15%</span></div>' +
                      '<input type="range" min="0" max="50" step="5" value="15" class="ch-slider" id="ch-comment">' +
                    '</div>' +
                    '<div class="ch-setting-row">' +
                      '<div class="ch-setting-icon"><i class="fas fa-smile"></i></div>' +
                      '<div class="ch-setting-info"><div class="ch-setting-label">表情包 / Emoji</div><div class="ch-setting-desc">允许 Ta 发送表情包和 Emoji</div></div>' +
                      '<div class="ch-setting-switch" id="ch-emoji-switch"></div>' +
                    '</div>' +
                  '</div>' +

                  '<div class="ch-btn-row" style="margin-top:20px;">' +
                    '<button class="ch-btn ghost" id="ch-reset"><i class="fas fa-undo"></i> 恢复默认</button>' +
                    '<button class="ch-btn primary" id="ch-save"><i class="fas fa-check"></i> 保存</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>';

        modal.dataset.built = '1';
        bindEvents(modal);
        return modal;
    }

    /* ---------- 渲染 ---------- */
    function renderHome() {
        var g = getGreeting();
        var en = document.getElementById('ch-greeting');
        var main = document.getElementById('ch-main');
        var time = document.getElementById('ch-time');
        var banner = document.getElementById('ch-banner');
        var partnerName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';

        if (en) en.textContent = g.en;
        if (main) main.textContent = g.txt + '，' + partnerName;
        if (time) {
            var d = new Date();
            var weekdays = ['日','一','二','三','四','五','六'];
            time.textContent = d.getFullYear() + ' · ' + (d.getMonth()+1) + '月' + d.getDate() + '日 · 星期' + weekdays[d.getDay()];
        }
        if (banner) {
            if (hub.bg) {
                banner.style.backgroundImage = 'url(' + hub.bg + ')';
                banner.classList.add('has-img');
            } else {
                banner.style.backgroundImage = '';
                banner.classList.remove('has-img');
            }
        }
        renderPhotos();
        var gamesEl = document.getElementById('ch-games-content');
        if (gamesEl && window.gameCenter && typeof window.gameCenter.render === 'function') {
            try { window.gameCenter.render(gamesEl); } catch (e) { console.warn('[hub] 游戏渲染失败', e); }
        }
    }

    /* ---------- 照片墙渲染 ---------- */
    function renderPhotos() {
        var grid = document.getElementById('ch-photo-grid');
        if (!grid) return;
        var countEl = document.getElementById('ch-photo-count');

        var html = '';
        hubPhotos.forEach(function (p, i) {
            html += '<div class="ch-photo-item" data-index="' + i + '" style="background-image:url(' + p + ');">' +
                      '<div class="ch-photo-del" data-del="' + i + '"><i class="fas fa-times"></i></div>' +
                    '</div>';
        });
        if (hubPhotos.length < PHOTO_MAX) {
            html += '<div class="ch-photo-add" id="ch-photo-add"><i class="fas fa-plus"></i><span>添加</span></div>';
        }
        grid.innerHTML = html;
        if (countEl) countEl.textContent = hubPhotos.length + ' / ' + PHOTO_MAX;

        grid.querySelectorAll('.ch-photo-item').forEach(function (item) {
            item.addEventListener('click', function (e) {
                if (e.target.closest('.ch-photo-del')) return;
                openPhotoViewer(parseInt(item.dataset.index, 10));
            });
            var lpTimer = null;
            item.addEventListener('pointerdown', function () {
                lpTimer = setTimeout(function () {
                    lpTimer = null;
                    var idx = parseInt(item.dataset.index, 10);
                    if (isNaN(idx)) return;
                    if (confirm('删除这张照片？')) {
                        hubPhotos.splice(idx, 1);
                        savePhotos();
                        renderPhotos();
                    }
                }, 700);
            });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (evt) {
                item.addEventListener(evt, function () {
                    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
                });
            });
        });

        grid.querySelectorAll('.ch-photo-del').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var idx = parseInt(btn.dataset.del, 10);
                if (isNaN(idx)) return;
                hubPhotos.splice(idx, 1);
                savePhotos();
                renderPhotos();
            });
        });

        var addBtn = grid.querySelector('#ch-photo-add');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                var inp = document.getElementById('ch-photo-input');
                if (inp) inp.click();
            });
        }
    }

    /* ---------- 照片上传 ---------- */
    function handlePhotoUpload(e) {
        var files = Array.prototype.slice.call(e.target.files || []);
        if (!files.length) return;
        e.target.value = '';

        var remaining = PHOTO_MAX - hubPhotos.length;
        if (remaining <= 0) {
            if (typeof showNotification === 'function') showNotification('照片墙已满（最多 ' + PHOTO_MAX + ' 张）', 'warning');
            return;
        }

        var toLoad = files.slice(0, remaining);
        if (toLoad.length < files.length && typeof showNotification === 'function') {
            showNotification('只能再添加 ' + remaining + ' 张，多余的已跳过', 'warning', 2500);
        }

        var loaded = 0;
        var failed = 0;
        toLoad.forEach(function (file) {
            if (file.size > 3 * 1024 * 1024) {
                failed++;
                if (loaded + failed === toLoad.length) {
                    savePhotos();
                    renderPhotos();
                    if (typeof showNotification === 'function') showNotification('有 ' + failed + ' 张超过 3MB，已跳过', 'warning', 3000);
                }
                return;
            }
            var reader = new FileReader();
            reader.onload = function (ev) {
                hubPhotos.push(ev.target.result);
                loaded++;
                if (loaded + failed === toLoad.length) {
                    savePhotos();
                    renderPhotos();
                    if (typeof showNotification === 'function') showNotification('已添加 ' + loaded + ' 张 ✦', 'success', 1800);
                }
            };
            reader.onerror = function () {
                failed++;
                if (loaded + failed === toLoad.length) {
                    savePhotos();
                    renderPhotos();
                }
            };
            reader.readAsDataURL(file);
        });
    }

    /* ---------- 照片大图预览 ---------- */
    function openPhotoViewer(index) {
        var existing = document.getElementById('ch-photo-viewer');
        if (existing) existing.remove();
        if (!hubPhotos[index]) return;

        var viewer = document.createElement('div');
        viewer.id = 'ch-photo-viewer';
        viewer.className = 'ch-photo-viewer';
        viewer.innerHTML =
            '<div class="ch-photo-viewer-img" style="background-image:url(' + hubPhotos[index] + ');"></div>' +
            '<button class="ch-photo-viewer-close"><i class="fas fa-times"></i></button>';
        document.body.appendChild(viewer);

        viewer.querySelector('.ch-photo-viewer-close').addEventListener('click', function () {
            viewer.remove();
        });
        viewer.addEventListener('click', function (e) {
            if (e.target === viewer || e.target.classList.contains('ch-photo-viewer-img')) {
                viewer.remove();
            }
        });
    }

    function renderSettings() {
        var bgPreview = document.getElementById('ch-bg-preview');
        if (bgPreview) {
            if (hub.bg) {
                bgPreview.style.backgroundImage = 'url(' + hub.bg + ')';
                bgPreview.innerHTML = '';
            } else {
                bgPreview.style.backgroundImage = '';
                bgPreview.innerHTML = '<span>暂无自定义壁纸</span>';
            }
        }
        var speed = document.getElementById('ch-speed');
        var speedVal = document.getElementById('ch-speed-val');
        if (speed) speed.value = hub.speed;
        if (speedVal) {
            var labels = { 1:'瞬间', 2:'很快', 3:'较快', 4:'略快', 5:'中等', 6:'略慢', 7:'较慢', 8:'慢', 9:'很慢', 10:'悠长' };
            speedVal.textContent = labels[hub.speed] || '中等';
        }
        var nr = document.getElementById('ch-noreply');
        var nrVal = document.getElementById('ch-noreply-val');
        if (nr) nr.value = Math.round(hub.noReplyChance * 100);
        if (nrVal) nrVal.textContent = Math.round(hub.noReplyChance * 100) + '%';

        var cs = document.getElementById('ch-comment-switch');
        if (cs) cs.classList.toggle('on', !!hub.commentEnabled);
        var csr = document.getElementById('ch-comment-slider-row');
        if (csr) csr.style.display = hub.commentEnabled ? '' : 'none';
        var cc = document.getElementById('ch-comment');
        var ccVal = document.getElementById('ch-comment-val');
        if (cc) cc.value = Math.round(hub.commentChance * 100);
        if (ccVal) ccVal.textContent = Math.round(hub.commentChance * 100) + '%';

        var es = document.getElementById('ch-emoji-switch');
        if (es) es.classList.toggle('on', !!hub.emojiEnabled);
    }

    function showView(name) {
        document.querySelectorAll('#companion-hub-modal .ch-view').forEach(function (v) {
            v.classList.remove('active');
        });
        var target = document.getElementById('ch-view-' + name);
        if (target) target.classList.add('active');
        var title = document.getElementById('ch-topbar-title');
        if (title) title.textContent = name === 'settings' ? '空间设置' : '陪伴空间';
        var sBtn = document.getElementById('ch-settings-btn');
        if (sBtn) sBtn.innerHTML = name === 'settings' ? '<i class="fas fa-arrow-left"></i>' : '<i class="fas fa-sliders-h"></i>';
        if (name === 'settings') renderSettings();
        else renderHome();
        // 切回首页时也刷新游戏区
        if (name === 'home') {
            var gamesEl2 = document.getElementById('ch-games-content');
            if (gamesEl2 && window.gameCenter && typeof window.gameCenter.render === 'function') {
                try { window.gameCenter.render(gamesEl2); } catch (e) {}
            }
        }
    }

    /* ---------- 打开 / 关闭 ---------- */
    function openHub() {
        var modal = ensureDOM();
        if (!modal) return;
        load();
        showView('home');

        if (typeof showModal === 'function') showModal(modal);
        else { modal.style.display = 'flex'; }

        // 开屏动画
        var splash = document.getElementById('ch-splash');
        if (splash) {
            splash.style.display = '';
            splash.classList.remove('fade-out');
            clearTimeout(_splashTimer);
            _splashTimer = setTimeout(function () {
                splash.classList.add('fade-out');
                setTimeout(function () { splash.style.display = 'none'; }, 700);
            }, 1300);
        }
    }

    function closeHub() {
        var modal = document.getElementById('companion-hub-modal');
        if (!modal) return;
        clearTimeout(_splashTimer);
        if (typeof hideModal === 'function') hideModal(modal);
        else modal.style.display = 'none';
    }

    /* ---------- 打开子功能（保留返回路径） ---------- */
    var _openedFromHub = null;
    var _subCloseObserver = null;

    var SUB_MODAL_ID = {
        mediaRoom:  'media-room-modal',
        companion:  'companion-modal',
        mood:       'mood-modal',
        anniversary:'anniversary-modal',
        envelope:   'envelope-modal',
        avatarLib:  'avatar-lib-modal'
    };

    function openSub(target) {
        var hubModal = document.getElementById('companion-hub-modal');
        if (hubModal) hubModal.style.display = 'none';
        _openedFromHub = target;

        setTimeout(function () {
            if (target === 'mediaRoom') {
                if (window.mediaRoom && typeof window.mediaRoom.open === 'function') window.mediaRoom.open();
            } else if (target === 'companion') {
                if (window.companion && typeof window.companion.open === 'function') window.companion.open();
            } else if (target === 'mood') {
                if (typeof window.updateDynamicNames === 'function') window.updateDynamicNames();
                if (typeof renderMoodCalendar === 'function') renderMoodCalendar();
                var m = document.getElementById('mood-modal');
                if (m && typeof showModal === 'function') showModal(m);
            } else if (target === 'anniversary') {
                if (typeof renderAnniversariesList === 'function') renderAnniversariesList();
                var a = document.getElementById('anniversary-modal');
                if (a && typeof showModal === 'function') showModal(a);
            } else if (target === 'envelope') {
                (async function () {
                    try { if (typeof loadEnvelopeData === 'function') await loadEnvelopeData(); } catch (e) {}
                    try { if (typeof checkEnvelopeStatus === 'function') await checkEnvelopeStatus(); } catch (e) {}
                    var e2 = document.getElementById('envelope-modal');
                    if (e2 && typeof showModal === 'function') showModal(e2);
                    try { if (typeof switchEnvTab === 'function') switchEnvTab('outbox'); } catch (e) {}
                })();
            } else if (target === 'avatarLib') {
                if (window.avatarLibrary && typeof window.avatarLibrary.open === 'function') {
                    window.avatarLibrary.open();
                }
            }

            // 等子功能完全打开后，监听它的关闭
            setTimeout(function () { watchSubClose(target); }, 400);
        }, 60);
    }

    function watchSubClose(target) {
        if (_subCloseObserver) { _subCloseObserver.disconnect(); _subCloseObserver = null; }
        var id = SUB_MODAL_ID[target];
        if (!id) return;
        var el = document.getElementById(id);
        if (!el) return;

        _subCloseObserver = new MutationObserver(function () {
            var visible = (el.style.display === 'flex' || el.style.display === 'block');
            if (!visible) {
                _subCloseObserver.disconnect();
                _subCloseObserver = null;
                _openedFromHub = null;
                // 等子功能关闭动画走完，再恢复 Hub
                setTimeout(function () {
                    var hub = document.getElementById('companion-hub-modal');
                    if (hub) {
                        hub.style.display = 'flex';
                        hub.style.opacity = '';
                    }
                }, 80);
            }
        });
        _subCloseObserver.observe(el, { attributes: true, attributeFilter: ['style'] });
    }

    /* ---------- 事件绑定 ---------- */
    function bindEvents(modal) {
        // 关闭
        modal.querySelector('#ch-close').addEventListener('click', closeHub);

        // 设置面板切换
        modal.querySelector('#ch-settings-btn').addEventListener('click', function () {
            var sView = document.getElementById('ch-view-settings');
            if (sView && sView.classList.contains('active')) showView('home');
            else showView('settings');
        });

        // 卡片
        modal.querySelectorAll('.ch-card').forEach(function (card) {
            card.addEventListener('click', function () {
                openSub(card.dataset.target);
            });
        });

        // 照片上传
        var photoInput = modal.querySelector('#ch-photo-input');
        if (photoInput) photoInput.addEventListener('change', handlePhotoUpload);

        // 壁纸
        modal.querySelector('#ch-bg-upload').addEventListener('click', function () {
            modal.querySelector('#ch-bg-input').click();
        });
        modal.querySelector('#ch-bg-input').addEventListener('change', function (e) {
            var f = e.target.files && e.target.files[0];
            if (!f) return;
            if (f.size > 4 * 1024 * 1024) {
                if (typeof showNotification === 'function') showNotification('壁纸请小于 4MB', 'error');
                return;
            }
            var reader = new FileReader();
            reader.onload = function (ev) {
                hub.bg = ev.target.result;
                renderSettings();
                renderHome();
                save();
            };
            reader.readAsDataURL(f);
            e.target.value = '';
        });
        modal.querySelector('#ch-bg-clear').addEventListener('click', function () {
            hub.bg = null;
            renderSettings();
            renderHome();
            save();
        });

        // 滑块
        modal.querySelector('#ch-speed').addEventListener('input', function (e) {
            hub.speed = parseInt(e.target.value, 10);
            renderSettings();
        });
        modal.querySelector('#ch-noreply').addEventListener('input', function (e) {
            hub.noReplyChance = parseInt(e.target.value, 10) / 100;
            renderSettings();
        });
        modal.querySelector('#ch-comment').addEventListener('input', function (e) {
            hub.commentChance = parseInt(e.target.value, 10) / 100;
            renderSettings();
        });

        // 开关
        modal.querySelector('#ch-comment-switch').addEventListener('click', function () {
            hub.commentEnabled = !hub.commentEnabled;
            renderSettings();
        });
        modal.querySelector('#ch-emoji-switch').addEventListener('click', function () {
            hub.emojiEnabled = !hub.emojiEnabled;
            renderSettings();
        });

        // 保存 / 重置
        modal.querySelector('#ch-save').addEventListener('click', function () {
            save();
            applyToApp();
            if (typeof showNotification === 'function') showNotification('设置已保存 ✦', 'success');
            showView('home');
        });
        modal.querySelector('#ch-reset').addEventListener('click', function () {
            if (!confirm('恢复所有空间设置为默认值？')) return;
            hub = Object.assign({}, DEFAULTS);
            renderSettings();
            renderHome();
            save();
            applyToApp();
        });
    }

    /* ---------- 入口绑定 ---------- */
    document.addEventListener('click', function (e) {
        if (e.target.closest('#companion-hub-function')) {
            e.preventDefault();
            var adv = document.getElementById('advanced-modal');
            if (adv && typeof hideModal === 'function') hideModal(adv);
            setTimeout(openHub, 200);
        }
    });

    /* ---------- 初始化 ---------- */
    function init() {
        load();
        applyToApp();
        ensureDOM();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 400); });
    } else {
        setTimeout(init, 400);
    }

    window.companionHub = { open: openHub, close: closeHub };
})();