/* =========================================================
 * avatar-library.js — 头像库
 *  · 分组导入：Ta 的头像候选 / 我的头像候选
 *  · Ta 随机邀请我换头像（同意 / 不同意 / 强制）
 *  · Ta 随机自己换头像
 * ========================================================= */
(function () {
    'use strict';

    var MY_KEY = 'avatarLib_my_v1';
    var PARTNER_KEY = 'avatarLib_partner_v1';
    var MAX_PER_GROUP = 30;
    var MAX_FILE_SIZE = 3 * 1024 * 1024;

    var myAvatars = [];
    var partnerAvatars = [];
    var currentTab = 'my';
    var partnerSwapTimer = null;
    var inviteTimer = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function load() {
        try {
            var m = JSON.parse(localStorage.getItem(MY_KEY) || '[]');
            if (Array.isArray(m)) myAvatars = m;
        } catch (e) {}
        try {
            var p = JSON.parse(localStorage.getItem(PARTNER_KEY) || '[]');
            if (Array.isArray(p)) partnerAvatars = p;
        } catch (e) {}
    }
    function saveMy() {
        try { localStorage.setItem(MY_KEY, JSON.stringify(myAvatars)); } catch (e) { warnFull(); }
    }
    function savePartner() {
        try { localStorage.setItem(PARTNER_KEY, JSON.stringify(partnerAvatars)); } catch (e) { warnFull(); }
    }
    function warnFull() {
        if (typeof showNotification === 'function') showNotification('头像库已满，请删除部分', 'warning');
    }

    function getMyName() { return (typeof settings !== 'undefined' && settings.myName) || '我'; }
    function getPartnerName() { return (typeof settings !== 'undefined' && settings.partnerName) || '梦角'; }

    /* ---------- 应用头像 ---------- */
    function applyMyAvatar(src) {
        var el = document.getElementById('my-avatar');
        if (el) el.innerHTML = '<img src="' + src + '" alt="avatar">';
        try { if (typeof throttledSaveData === 'function') throttledSaveData(); } catch (e) {}
    }
    function applyPartnerAvatar(src) {
        var el = document.getElementById('partner-avatar');
        if (el) el.innerHTML = '<img src="' + src + '" alt="avatar">';
        try { if (typeof throttledSaveData === 'function') throttledSaveData(); } catch (e) {}
    }

    /* ========================================================
     * 头像库面板
     * ====================================================== */
    function ensurePanel() {
        var el = document.getElementById('avatar-lib-modal');
        if (el && el.dataset.built === '1') return el;
        if (!el) {
            el = document.createElement('div');
            el.id = 'avatar-lib-modal';
            el.className = 'modal';
            el.style.zIndex = '9700';
            document.body.appendChild(el);
        }
        el.innerHTML =
            '<div class="modal-content avatar-lib-content">' +
              '<div class="avatar-lib-head">' +
                '<div class="avatar-lib-head-left">' +
                  '<div class="avatar-lib-icon"><i class="fas fa-user-circle"></i></div>' +
                  '<div>' +
                    '<div class="avatar-lib-title">头像库</div>' +
                    '<div class="avatar-lib-sub">Ta 会从这里挑头像邀请你换</div>' +
                  '</div>' +
                '</div>' +
                '<button class="avatar-lib-close" id="al-close"><i class="fas fa-times"></i></button>' +
              '</div>' +

              '<div class="avatar-lib-tabs">' +
                '<button class="avatar-lib-tab active" data-tab="my">' +
                  '<i class="fas fa-user"></i> 我的头像候选 <span class="avatar-lib-count" id="al-count-my">0</span>' +
                '</button>' +
                '<button class="avatar-lib-tab" data-tab="partner">' +
                  '<i class="fas fa-heart"></i> Ta 的头像候选 <span class="avatar-lib-count" id="al-count-partner">0</span>' +
                '</button>' +
              '</div>' +

              '<div class="avatar-lib-body">' +
                '<div class="avatar-lib-grid" id="al-grid"></div>' +
                '<input type="file" id="al-file-input" accept="image/*" multiple style="display:none;">' +
                '<div class="avatar-lib-hint" id="al-hint"></div>' +
              '</div>' +

              '<div class="avatar-lib-foot">' +
                '<button class="modal-btn modal-btn-secondary" id="al-close-foot">关闭</button>' +
              '</div>' +
            '</div>';
        el.dataset.built = '1';

        el.querySelector('#al-close').addEventListener('click', closePanel);
        el.querySelector('#al-close-foot').addEventListener('click', closePanel);
        el.addEventListener('click', function (e) {
            if (e.target === el) closePanel();
        });

        el.querySelectorAll('.avatar-lib-tab').forEach(function (btn) {
            btn.addEventListener('click', function () {
                currentTab = btn.dataset.tab;
                el.querySelectorAll('.avatar-lib-tab').forEach(function (b) {
                    b.classList.toggle('active', b.dataset.tab === currentTab);
                });
                renderGrid();
            });
        });

        el.querySelector('#al-file-input').addEventListener('change', handleFileUpload);

        return el;
    }

    function renderGrid() {
        var el = document.getElementById('avatar-lib-modal');
        if (!el) return;
        var grid = el.querySelector('#al-grid');
        var hint = el.querySelector('#al-hint');
        var list = currentTab === 'my' ? myAvatars : partnerAvatars;

        el.querySelector('#al-count-my').textContent = myAvatars.length;
        el.querySelector('#al-count-partner').textContent = partnerAvatars.length;

        var html = '';
        list.forEach(function (src, i) {
            html +=
                '<div class="avatar-lib-item" data-index="' + i + '">' +
                  '<img src="' + src + '" loading="lazy" onerror="this.style.opacity=\'0.3\';this.style.filter=\'grayscale(1)\';">' +
                  '<button class="avatar-lib-del" data-del="' + i + '" title="删除"><i class="fas fa-times"></i></button>' +
                '</div>';
        });
        if (list.length < MAX_PER_GROUP) {
            html +=
                '<div class="avatar-lib-add" id="al-add">' +
                  '<i class="fas fa-plus"></i><span>添加</span>' +
                '</div>';
        }
        grid.innerHTML = html;

        var total = list.length;
        if (total === 0) {
            hint.textContent = currentTab === 'my'
                ? '导入几张照片，Ta 会随机邀请你从中换头像'
                : '导入几张照片，Ta 会随机挑选换成自己的头像';
        } else if (currentTab === 'my') {
            hint.textContent = 'Ta 每隔一段时间可能会邀请你换头像（可同意 / 拒绝 / 强制）';
        } else {
            hint.textContent = 'Ta 每隔一段时间可能会自己换头像';
        }

        grid.querySelectorAll('.avatar-lib-item').forEach(function (item) {
            item.addEventListener('click', function (e) {
                if (e.target.closest('.avatar-lib-del')) return;
                var idx = parseInt(item.dataset.index, 10);
                var src = list[idx];
                if (!src) return;
                if (currentTab === 'my') applyMyAvatar(src);
                else applyPartnerAvatar(src);
                if (typeof showNotification === 'function') {
                    showNotification(currentTab === 'my' ? '已切换我的头像 ✦' : '已切换 Ta 的头像 ✦', 'success', 1500);
                }
            });
        });

        grid.querySelectorAll('.avatar-lib-del').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var idx = parseInt(btn.dataset.del, 10);
                if (isNaN(idx)) return;
                if (!confirm('删除这张头像？')) return;
                if (currentTab === 'my') { myAvatars.splice(idx, 1); saveMy(); }
                else { partnerAvatars.splice(idx, 1); savePartner(); }
                renderGrid();
            });
        });

        var addBtn = grid.querySelector('#al-add');
        if (addBtn) {
            addBtn.addEventListener('click', function () {
                el.querySelector('#al-file-input').click();
            });
        }
    }

    function handleFileUpload(e) {
        var files = Array.prototype.slice.call(e.target.files || []);
        if (!files.length) return;
        e.target.value = '';

        var list = currentTab === 'my' ? myAvatars : partnerAvatars;
        var remaining = MAX_PER_GROUP - list.length;
        if (remaining <= 0) {
            warnFull();
            return;
        }
        var toLoad = files.slice(0, remaining);
        if (toLoad.length < files.length && typeof showNotification === 'function') {
            showNotification('只能再添加 ' + remaining + ' 张，多余的已跳过', 'warning', 2500);
        }

        var loaded = 0, failed = 0;
        toLoad.forEach(function (file) {
            if (file.size > MAX_FILE_SIZE) {
                failed++;
                if (loaded + failed === toLoad.length) {
                    saveMy(); savePartner();
                    renderGrid();
                    if (typeof showNotification === 'function') {
                        showNotification('有 ' + failed + ' 张超过 3MB，已跳过', 'warning', 3000);
                    }
                }
                return;
            }
            var reader = new FileReader();
            reader.onload = function (ev) {
                list.push(ev.target.result);
                loaded++;
                if (loaded + failed === toLoad.length) {
                    saveMy(); savePartner();
                    renderGrid();
                    if (typeof showNotification === 'function') {
                        showNotification('已添加 ' + loaded + ' 张 ✦', 'success', 1800);
                    }
                }
            };
            reader.onerror = function () {
                failed++;
                if (loaded + failed === toLoad.length) {
                    saveMy(); savePartner();
                    renderGrid();
                }
            };
            reader.readAsDataURL(file);
        });
    }

    function openPanel() {
        var el = ensurePanel();
        currentTab = 'my';
        el.querySelectorAll('.avatar-lib-tab').forEach(function (b) {
            b.classList.toggle('active', b.dataset.tab === 'my');
        });
        renderGrid();
        if (typeof showModal === 'function') showModal(el);
        else el.style.display = 'flex';
    }
    function closePanel() {
        var el = document.getElementById('avatar-lib-modal');
        if (!el) return;
        if (typeof hideModal === 'function') hideModal(el);
        else el.style.display = 'none';
    }

    /* ========================================================
     * Ta 主动换自己的头像
     * ====================================================== */
    function schedulePartnerSwap() {
        if (partnerSwapTimer) clearTimeout(partnerSwapTimer);
        var delay = (8 + Math.random() * 22) * 60 * 1000; // 8~30 分钟
        partnerSwapTimer = setTimeout(function () {
            if (document.hidden) { schedulePartnerSwap(); return; }
            if (partnerAvatars.length === 0) { schedulePartnerSwap(); return; }
            if (Math.random() > 0.15) { schedulePartnerSwap(); return; }

            var src = partnerAvatars[Math.floor(Math.random() * partnerAvatars.length)];
            applyPartnerAvatar(src);
            try { if (typeof playSound === 'function') playSound('message'); } catch (e) {}
            if (typeof showNotification === 'function') {
                showNotification(getPartnerName() + ' 换了新头像 ✦', 'info', 3000);
            }
            schedulePartnerSwap();
        }, delay);
    }

    /* ========================================================
     * Ta 邀请我换头像
     * ====================================================== */
    function scheduleInvite() {
        if (inviteTimer) clearTimeout(inviteTimer);
        var delay = (15 + Math.random() * 25) * 60 * 1000; // 15~40 分钟
        inviteTimer = setTimeout(function () {
            if (document.hidden) { scheduleInvite(); return; }
            if (myAvatars.length === 0) { scheduleInvite(); return; }
            if (document.getElementById('avatar-lib-invite-popup')) { scheduleInvite(); return; }
            if (Math.random() > 0.25) { scheduleInvite(); return; }

            var src = myAvatars[Math.floor(Math.random() * myAvatars.length)];
            var forced = Math.random() < 0.2; // 20% 强制
            if (forced) {
                applyMyAvatar(src);
                showForcedPopup(src);
            } else {
                showInvitePopup(src);
            }
            scheduleInvite();
        }, delay);
    }

    function showInvitePopup(src) {
        var popup = document.createElement('div');
        popup.id = 'avatar-lib-invite-popup';
        popup.className = 'avatar-invite-popup';
        popup.innerHTML =
            '<div class="avatar-invite-head">' +
              '<div class="avatar-invite-avatar"><img src="' + src + '"></div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div class="avatar-invite-title">' + esc(getPartnerName()) + ' 想让你换个头像</div>' +
                '<div class="avatar-invite-sub">Ta 觉得这张很适合你</div>' +
              '</div>' +
            '</div>' +
            '<div class="avatar-invite-preview"><img src="' + src + '"></div>' +
            '<div class="avatar-invite-actions">' +
              '<button class="avatar-invite-btn ghost" data-act="reject">不同意</button>' +
              '<button class="avatar-invite-btn primary" data-act="accept">同意</button>' +
            '</div>';
        document.body.appendChild(popup);

        popup.querySelector('[data-act="reject"]').addEventListener('click', function () {
            popup.remove();
            if (typeof showNotification === 'function') {
                var replies = [
                    '好吧…那下次再说~',
                    '真的不要嘛…',
                    '哼，那我自己留着看',
                    '有点小可惜呢'
                ];
                showNotification(getPartnerName() + '：' + replies[Math.floor(Math.random() * replies.length)], 'info', 2500);
            }
        });
        popup.querySelector('[data-act="accept"]').addEventListener('click', function () {
            applyMyAvatar(src);
            popup.remove();
            if (typeof showNotification === 'function') showNotification('头像已换成 Ta 选的那张 ✦', 'success', 2000);
            try { if (typeof playSound === 'function') playSound('favorite'); } catch (e) {}
        });

        setTimeout(function () { if (popup.parentNode) popup.remove(); }, 25000);
    }

    function showForcedPopup(src) {
        var popup = document.createElement('div');
        popup.id = 'avatar-lib-invite-popup';
        popup.className = 'avatar-invite-popup forced';
        popup.innerHTML =
            '<div class="avatar-invite-head">' +
              '<div class="avatar-invite-avatar"><img src="' + src + '"></div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div class="avatar-invite-title">' + esc(getPartnerName()) + ' 帮你换了头像</div>' +
                '<div class="avatar-invite-sub">"就这张吧，我觉得好看"</div>' +
              '</div>' +
            '</div>' +
            '<div class="avatar-invite-preview"><img src="' + src + '"></div>' +
            '<div class="avatar-invite-actions">' +
              '<button class="avatar-invite-btn primary" data-act="ok">知道了</button>' +
            '</div>';
        document.body.appendChild(popup);

        popup.querySelector('[data-act="ok"]').addEventListener('click', function () {
            popup.remove();
        });

        try { if (typeof playSound === 'function') playSound('favorite'); } catch (e) {}

        setTimeout(function () { if (popup.parentNode) popup.remove(); }, 8000);
    }

    /* ========================================================
     * 初始化
     * ====================================================== */
    function init() {
        load();
        // 延迟一点开始，避免和其他初始化冲突
        setTimeout(function () {
            schedulePartnerSwap();
            scheduleInvite();
        }, 3000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 800); });
    } else {
        setTimeout(init, 800);
    }

    window.avatarLibrary = {
        open: openPanel,
        close: closePanel,
        getMy: function () { return myAvatars; },
        getPartner: function () { return partnerAvatars; }
    };
})();