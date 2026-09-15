/* =========================================================
 * media-room.js — 影音室（一起听歌 / 看剧 / 看书）
 *  · 每个房间独立消息、独立背景、独立链接
 *  · 消息不进入主聊天
 * ========================================================= */
(function () {
    'use strict';

    const STORAGE_KEY = 'mediaRoom_v1';
    const ROOM_TYPES = [
        { id: 'music', icon: 'fa-music',     label: '音乐',  placeholder: '粘贴音乐链接（网易云/QQ音乐/YouTube…）' },
        { id: 'tv',    icon: 'fa-tv',        label: '影视',  placeholder: '粘贴视频链接（B站/腾讯/YouTube…）' },
        { id: 'book',  icon: 'fa-book-open', label: '阅读',  placeholder: '粘贴书籍 / 文章链接' }
    ];

    let rooms = {};
    let activeRoom = 'music';
        let replyTimers = {};
    let wishTimers = {};
    const WISHLIST_STATUS = {
        WISH: 'wish',
        INVITED: 'invited',
        AGREED: 'agreed',
        REJECTED: 'rejected',
        DONE: 'done'
    };

    function defaultRoom() {
        return { messages: [], bg: null, link: '', wishlist: [] };
    }

    async function load() {
        try {
            const saved = await localforage.getItem(STORAGE_KEY);
            if (saved && typeof saved === 'object') rooms = saved;
        } catch (e) {}
        ROOM_TYPES.forEach(function (t) {
            if (!rooms[t.id]) rooms[t.id] = defaultRoom();
            if (!Array.isArray(rooms[t.id].messages)) rooms[t.id].messages = [];
            if (rooms[t.id].bg == null) rooms[t.id].bg = null;
              if (typeof rooms[t.id].link !== 'string') rooms[t.id].link = '';
            if (!Array.isArray(rooms[t.id].wishlist)) rooms[t.id].wishlist = [];
        });
    }
    async function save() {
        try { await localforage.setItem(STORAGE_KEY, rooms); } catch (e) {}
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function fmtTime(ts) {
        const d = new Date(ts);
        const pad = function (n) { return String(n).padStart(2, '0'); };
        return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function pickReply() {
        const pool = (typeof customReplies !== 'undefined' && Array.isArray(customReplies)) ? customReplies : [];
        const disabled = (function () {
            try { const r = localStorage.getItem('disabledReplyItems'); return r ? new Set(JSON.parse(r)) : new Set(); }
            catch (e) { return new Set(); }
        })();
        const groupDisabled = new Set();
        ((window.customReplyGroups) || []).forEach(function (g) {
            if (g.disabled && Array.isArray(g.items)) g.items.forEach(function (t) { groupDisabled.add(t); });
        });
        const available = pool
            .map(function (r) { return String(r || '').trim(); })
            .filter(function (r) { return r && !disabled.has(r) && !groupDisabled.has(r); });
        if (!available.length) return '……';
        return available[Math.floor(Math.random() * available.length)];
    }

    /* ---------- 渲染 Tab 栏 ---------- */
    function renderTabs() {
        const el = document.getElementById('media-room-tabs');
        if (!el) return;
        el.innerHTML = ROOM_TYPES.map(function (t) {
            return '<button class="room-tab ' + (activeRoom === t.id ? 'active' : '') + '" data-room="' + t.id + '">' +
                   '<i class="fas ' + t.icon + '"></i>' + t.label +
                   '</button>';
        }).join('');
    }

    /* ---------- 渲染头部信息区 ---------- */
     function renderInfo() {
        const el = document.getElementById('media-room-info');
        if (!el) return;
        const room = rooms[activeRoom];
        const type = ROOM_TYPES.find(function (t) { return t.id === activeRoom; });

        el.classList.toggle('has-bg', !!room.bg);
        el.style.backgroundImage = room.bg ? 'url(' + room.bg + ')' : '';

        const hasLink = !!room.link;
        const hasLocalFile = !!room.localFile;

        let linkHtml = '';

        if (hasLink || hasLocalFile) {
            const isVideoFile = hasLocalFile && room.localFile.type === 'video';
            const isAudioFile = hasLocalFile && room.localFile.type === 'audio';
            const icon = hasLocalFile
                ? (isVideoFile ? 'fa-film' : 'fa-music')
                : 'fa-link';
            const typeLabel = hasLocalFile
                ? (isVideoFile ? '视频' : '音频')
                : '链接';
            const displayName = hasLocalFile ? room.localFile.name : room.link;

            linkHtml =
                '<div class="room-link-card">' +
                  '<div class="room-link-row">' +
                    '<i class="fas ' + icon + '" style="color:var(--accent-color);font-size:12px;flex-shrink:0;"></i>' +
                    '<span class="room-link-display" title="' + esc(displayName) + '">' + esc(displayName) + '</span>' +
                    '<span style="font-size:10px;color:var(--text-secondary);opacity:0.7;flex-shrink:0;">' + typeLabel + '</span>' +
                  '</div>' +
                  '<div style="display:flex;gap:6px;flex-wrap:wrap;">' +
                    '<button class="room-link-open" data-action="play"><i class="fas fa-play" style="font-size:10px;margin-right:4px;"></i>悬浮播放</button>' +
                    (hasLink ? '<button class="room-link-open" data-action="edit" style="background:transparent;border:1px solid var(--border-color);color:var(--text-secondary);">修改</button>' : '') +
                    '<button class="room-link-open" data-action="clear" style="background:transparent;border:1px solid rgba(255,92,92,0.3);color:#ff5e5e;">清除</button>' +
                  '</div>' +
                '</div>';
        } else {
            linkHtml =
                '<div class="room-link-card empty">' +
                  '<div class="room-info-label">导入内容</div>' +
                  '<div class="room-info-hint">' + type.placeholder + '</div>' +
                  '<div class="room-link-row">' +
                    '<input type="text" class="room-link-input" id="media-room-link-input" placeholder="https://...">' +
                    '<button class="room-link-open" data-action="save">保存</button>' +
                  '</div>' +
                  '<div style="display:flex;gap:6px;margin-top:8px;">' +
                    '<button class="room-link-open" data-action="upload-file" style="flex:1;background:transparent;border:1.5px dashed rgba(var(--accent-color-rgb),0.4);color:var(--text-secondary);">' +
                      '<i class="fas fa-upload" style="font-size:10px;margin-right:5px;"></i>导入本地文件' +
                    '</button>' +
                  '</div>' +
                  '<input type="file" id="media-room-file-input" accept="video/*,audio/*" style="display:none;">' +
                '</div>';
        }

        el.innerHTML =
            '<div class="room-info-overlay"></div>' +
            '<button class="room-bg-btn" id="media-room-bg-btn" title="更换背景"><i class="fas fa-image"></i></button>' +
            '<input type="file" id="media-room-bg-input" accept="image/*" style="display:none;">' +
            '<div class="room-info-inner">' +
              '<div class="room-info-label"><i class="fas ' + type.icon + '"></i> 一起' +
                  (activeRoom === 'music' ? '听歌' : activeRoom === 'tv' ? '看剧' : '看书') +
              '</div>' +
               linkHtml +
              '<div class="room-wishlist-entry" id="media-room-wishlist-entry">' +
                '<div class="wishlist-entry-head">' +
                  '<i class="fas fa-heart"></i> 心愿单 ' +
                  '<span class="wishlist-count" id="media-room-wishlist-count">0</span>' +
                '</div>' +
                '<div class="wishlist-entry-hint">' +
                  '添加想一起' + (activeRoom === 'music' ? '听' : activeRoom === 'tv' ? '看' : '读') + '的内容，Ta 会随机发出邀请' +
                '</div>' +
              '</div>' +
              '<div class="room-wishlist-panel" id="media-room-wishlist-panel" style="display:none;">' +
                '<div class="wishlist-panel-head">' +
                  '<span><i class="fas fa-list"></i> 心愿单</span>' +
                  '<button class="wishlist-add-btn" id="media-room-wishlist-add">+ 添加</button>' +
                '</div>' +
                '<div class="wishlist-list" id="media-room-wishlist-list"></div>' +
              '</div>' +
            '</div>';

        const bgBtn = el.querySelector('#media-room-bg-btn');
        if (bgBtn) bgBtn.addEventListener('click', function () {
            const inp = el.querySelector('#media-room-bg-input');
            if (inp) inp.click();
        });
        const bgInput = el.querySelector('#media-room-bg-input');
        if (bgInput) bgInput.addEventListener('change', handleBgUpload);

        const fileInput = el.querySelector('#media-room-file-input');
        if (fileInput) fileInput.addEventListener('change', handleLocalFileUpload);

        el.querySelectorAll('.room-link-open').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const action = btn.dataset.action;

                if (action === 'play') {
                    if (room.localFile) {
                        openPlayer(room.localFile.data, room.localFile.type, room.localFile.name);
                    } else if (room.link) {
                        const parsed = parseLinkForPlayer(room.link);
                        openPlayer(parsed.src, parsed.type, room.link);
                    }
                } else if (action === 'edit') {
                    room.link = '';
                    save();
                    renderInfo();
                    setTimeout(function () {
                        const inp = el.querySelector('#media-room-link-input');
                        if (inp) inp.focus();
                    }, 100);
                } else if (action === 'save') {
                    const inp = el.querySelector('#media-room-link-input');
                    const val = inp ? inp.value.trim() : '';
                    if (!val) return;
                    room.link = val;
                    room.localFile = null;
                    save();
                    renderInfo();
                    if (typeof showNotification === 'function') showNotification('链接已保存 ✦', 'success');
                } else if (action === 'clear') {
                    if (!confirm('清除当前影音内容？')) return;
                    room.link = '';
                    room.localFile = null;
                    save();
                    renderInfo();
                    closePlayer();
                } else if (action === 'upload-file') {
                    const inp = el.querySelector('#media-room-file-input');
                    if (inp) inp.click();
                }
            });
        });

        renderWishlist();
    }

        /* ---------- 心愿单渲染 ---------- */
    function renderWishlist() {
        const entryEl = document.getElementById('media-room-wishlist-entry');
        const panelEl = document.getElementById('media-room-wishlist-panel');
        const listEl = document.getElementById('media-room-wishlist-list');
        const countEl = document.getElementById('media-room-wishlist-count');
        if (!listEl || !entryEl || !panelEl) return;
        const room = rooms[activeRoom];
        const list = room.wishlist || [];
        const activeCount = list.filter(function (w) {
            return w.status !== WISHLIST_STATUS.DONE && w.status !== WISHLIST_STATUS.REJECTED;
        }).length;
        if (countEl) countEl.textContent = activeCount;

        if (list.length === 0) {
            listEl.innerHTML = '<div class="wishlist-empty">还没有添加心愿，点上方「+ 添加」吧 ✦</div>';
        } else {
            listEl.innerHTML = list.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }).map(function (w) {
                let statusLabel = '', statusClass = '';
                if (w.status === WISHLIST_STATUS.WISH)          { statusLabel = '待邀请'; statusClass = 'status-wish'; }
                else if (w.status === WISHLIST_STATUS.INVITED)  { statusLabel = 'Ta 邀请中'; statusClass = 'status-invited'; }
                else if (w.status === WISHLIST_STATUS.AGREED)   { statusLabel = '已约定 ' + (w.agreedTime ? fmtTime(w.agreedTime) : ''); statusClass = 'status-agreed'; }
                else if (w.status === WISHLIST_STATUS.REJECTED) { statusLabel = '已婉拒'; statusClass = 'status-rejected'; }
                else if (w.status === WISHLIST_STATUS.DONE)     { statusLabel = '已完成'; statusClass = 'status-done'; }
                return '<div class="wishlist-item" data-wid="' + w.id + '">' +
                    '<div class="wishlist-item-main">' +
                      '<div class="wishlist-item-title">' + esc(w.title) + '</div>' +
                      (w.note ? '<div class="wishlist-item-note">' + esc(w.note) + '</div>' : '') +
                    '</div>' +
                    '<div class="wishlist-item-status ' + statusClass + '">' + statusLabel + '</div>' +
                    '<button class="wishlist-item-del" data-del="' + w.id + '" title="删除">✕</button>' +
                  '</div>';
            }).join('');
        }

        entryEl.onclick = function (e) {
            if (e.target.closest('.wishlist-add-btn')) return;
            const open = panelEl.style.display !== 'none';
            panelEl.style.display = open ? 'none' : 'block';
        };
        const addBtn = document.getElementById('media-room-wishlist-add');
        if (addBtn) addBtn.onclick = function (e) { e.stopPropagation(); showAddWishDialog(); };
        listEl.querySelectorAll('[data-del]').forEach(function (btn) {
            btn.onclick = function (e) {
                e.stopPropagation();
                const wid = btn.dataset.del;
                if (!confirm('删除这个心愿？')) return;
                room.wishlist = room.wishlist.filter(function (w) { return String(w.id) !== String(wid); });
                save(); renderWishlist();
            };
        });
    }

    function showAddWishDialog() {
        const action = activeRoom === 'music' ? '听' : activeRoom === 'tv' ? '看' : '读';
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML =
            '<div style="background:var(--secondary-bg);border-radius:20px;padding:22px;width:88%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,.4);">' +
              '<div style="font-size:16px;font-weight:700;margin-bottom:14px;color:var(--text-primary);">添加心愿</div>' +
              '<input type="text" id="_wish_title" placeholder="想一起' + action + '什么？" maxlength="50" style="width:100%;box-sizing:border-box;padding:11px 14px;border:1.5px solid var(--border-color);border-radius:12px;background:var(--primary-bg);color:var(--text-primary);font-size:14px;outline:none;margin-bottom:10px;font-family:var(--font-family);">' +
              '<textarea id="_wish_note" placeholder="备注（可选）" maxlength="120" rows="3" style="width:100%;box-sizing:border-box;padding:11px 14px;border:1.5px solid var(--border-color);border-radius:12px;background:var(--primary-bg);color:var(--text-primary);font-size:13px;outline:none;resize:none;font-family:var(--font-family);"></textarea>' +
              '<div style="display:flex;gap:10px;margin-top:16px;">' +
                '<button id="_wish_cancel" style="flex:1;padding:11px;border:1.5px solid var(--border-color);border-radius:12px;background:none;color:var(--text-secondary);cursor:pointer;font-family:var(--font-family);">取消</button>' +
                '<button id="_wish_save" style="flex:2;padding:11px;border:none;border-radius:12px;background:var(--accent-color);color:#fff;font-weight:700;cursor:pointer;font-family:var(--font-family);">添加</button>' +
              '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        const titleInp = overlay.querySelector('#_wish_title');
        overlay.querySelector('#_wish_cancel').onclick = function () { overlay.remove(); };
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
        overlay.querySelector('#_wish_save').onclick = function () {
            const title = titleInp.value.trim();
            const note = overlay.querySelector('#_wish_note').value.trim();
            if (!title) { if (typeof showNotification === 'function') showNotification('请输入内容', 'warning'); return; }
            const room = rooms[activeRoom];
            room.wishlist.push({
                id: Date.now(), title: title, note: note,
                status: WISHLIST_STATUS.WISH,
                createdAt: Date.now(),
                invitedAt: null, agreedTime: null
            });
            save(); renderWishlist(); overlay.remove();
            if (typeof showNotification === 'function') showNotification('已加入心愿单 ✦', 'success');
            scheduleWishInvite();
        };
        setTimeout(function () { titleInp.focus(); }, 100);
    }

    /* ---------- ta 随机邀请 ---------- */
    function scheduleWishInvite() {
        const room = rooms[activeRoom];
        if (!room) return;
        if (wishTimers[activeRoom]) clearTimeout(wishTimers[activeRoom]);

        // 20 分钟 ~ 3 小时随机
        const delay = (20 + Math.random() * 160) * 60 * 1000;
        wishTimers[activeRoom] = setTimeout(function () {
            delete wishTimers[activeRoom];
              // 页面隐藏时跳过本次，直接安排下一轮
    if (document.hidden) {
        scheduleWishInvite();
        return;
    }  
            const curRoom = rooms[activeRoom];
            if (!curRoom) return;
            const pending = (curRoom.wishlist || []).filter(function (w) { return w.status === WISHLIST_STATUS.WISH; });
            if (pending.length === 0) { scheduleWishInvite(); return; }
            if (Math.random() > 0.5) { scheduleWishInvite(); return; }

            const target = pending[Math.floor(Math.random() * pending.length)];
            target.status = WISHLIST_STATUS.INVITED;
            target.invitedAt = Date.now();
            save();
            const verb = activeRoom === 'music' ? '听' : activeRoom === 'tv' ? '看' : '读';
            const inviteText = '🌙 今晚有空一起' + verb + '「' + target.title + '」吗？';
            curRoom.messages.push({
                id: Date.now(), sender: 'partner',
                text: inviteText,
                timestamp: Date.now(),
                wishInvite: { wishId: target.id, roomType: activeRoom }
            });
            save();
            const modal = document.getElementById('media-room-modal');
            if (modal && modal.style.display !== 'none') { renderMessages(); renderWishlist(); }
            try { if (typeof playSound === 'function') playSound('partner_message'); } catch (e) {}
            showWishInviteCard(target);
            scheduleWishInvite();
        }, delay);
    }

    function showWishInviteCard(wish) {
        const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || '对方';
        const overlay = document.createElement('div');
        overlay.className = 'wish-invite-overlay';
        overlay.innerHTML =
            '<div class="wish-invite-card">' +
              '<div class="wish-invite-header">' +
                '<i class="fas fa-heart"></i> ' + partnerName + ' 邀请你' +
              '</div>' +
              '<div class="wish-invite-body">' +
                '<div class="wish-invite-title">' + esc(wish.title) + '</div>' +
                (wish.note ? '<div class="wish-invite-note">' + esc(wish.note) + '</div>' : '') +
                '<div class="wish-invite-when" id="_wish_when_display">时间：还没定</div>' +
              '</div>' +
              '<div class="wish-invite-actions">' +
                '<button class="wish-invite-btn ghost" id="_wish_reject">婉拒</button>' +
                '<button class="wish-invite-btn ghost" id="_wish_edit">改时间</button>' +
                '<button class="wish-invite-btn primary" id="_wish_agree">同意</button>' +
              '</div>' +
              '<input type="datetime-local" id="_wish_time_input" style="display:none;width:100%;box-sizing:border-box;margin-top:10px;padding:9px 12px;border:1.5px solid var(--border-color);border-radius:10px;background:var(--primary-bg);color:var(--text-primary);font-size:13px;outline:none;font-family:var(--font-family);">' +
            '</div>';
        document.body.appendChild(overlay);
        const close = function () { overlay.remove(); };
        const timeInput = overlay.querySelector('#_wish_time_input');
        const whenDisplay = overlay.querySelector('#_wish_when_display');

        overlay.querySelector('#_wish_edit').onclick = function () {
            if (timeInput.style.display === 'none') {
                timeInput.style.display = 'block';
                const now = new Date(Date.now() + 3600 * 1000);
                const pad = function (n) { return String(n).padStart(2, '0'); };
                timeInput.value = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) + 'T' + pad(now.getHours()) + ':' + pad(now.getMinutes());
                timeInput.focus();
            } else {
                timeInput.style.display = 'none';
            }
        };
        timeInput.onchange = function () {
            if (timeInput.value) {
                const t = new Date(timeInput.value);
                whenDisplay.textContent = '时间：' + t.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
            }
        };

        overlay.querySelector('#_wish_reject').onclick = function () {
            wish.status = WISHLIST_STATUS.REJECTED;
            save(); renderWishlist(); close();
            const room = rooms[activeRoom];
            if (room) room.messages.push({ id: Date.now(), sender: 'user', text: '【婉拒】这次可能不方便，下次一定 ✦', timestamp: Date.now() });
            save();
            const modal = document.getElementById('media-room-modal');
            if (modal && modal.style.display !== 'none') renderMessages();
        };
        overlay.querySelector('#_wish_agree').onclick = function () {
            wish.status = WISHLIST_STATUS.AGREED;
            wish.agreedTime = timeInput.value ? new Date(timeInput.value).getTime() : Date.now() + 3600 * 1000;
            save(); renderWishlist(); close();
            const verb = activeRoom === 'music' ? '听' : activeRoom === 'tv' ? '看' : '读';
            const room = rooms[activeRoom];
            if (room) {
                const t = new Date(wish.agreedTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                room.messages.push({ id: Date.now(), sender: 'user', text: '【已约定】' + t + '，一起' + verb + '「' + wish.title + '」', timestamp: Date.now() });
            }
            save();
            const modal = document.getElementById('media-room-modal');
            if (modal && modal.style.display !== 'none') renderMessages();
        };
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    }

    function handleBgUpload(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            if (typeof showNotification === 'function') showNotification('背景请小于 5MB', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = function (ev) {
            rooms[activeRoom].bg = ev.target.result;
            save();
            renderInfo();
            if (typeof showNotification === 'function') showNotification('背景已更新 ✦', 'success');
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    }

    /* ---------- 渲染消息 ---------- */
    function renderMessages() {
        const el = document.getElementById('media-room-messages');
        if (!el) return;
        const msgs = rooms[activeRoom].messages;
        if (!msgs.length) {
            el.innerHTML = '<div class="room-empty">' +
                '这里是与 TA 的专属空间<br>' +
                '说说此刻想一起分享的事吧 ✦' +
                '</div>';
            return;
        }
        el.innerHTML = msgs.map(function (m) {
            return '<div class="room-msg ' + (m.sender === 'user' ? 'me' : 'ta') + '">' +
                     esc(m.text) +
                     '<div class="room-msg-time">' + fmtTime(m.timestamp) + '</div>' +
                   '</div>';
        }).join('');
        requestAnimationFrame(function () { el.scrollTop = el.scrollHeight; });
    }

    /* ---------- 发送消息 ---------- */
    function sendMessage() {
        const inp = document.getElementById('media-room-input');
        if (!inp) return;
        const text = inp.value.trim();
        if (!text) return;
        const room = rooms[activeRoom];

        room.messages.push({
            id: Date.now(),
            sender: 'user',
            text: text,
            timestamp: Date.now()
        });
        inp.value = '';
        inp.style.height = '40px';
        renderMessages();
        save();

        if (replyTimers[activeRoom]) clearTimeout(replyTimers[activeRoom]);
        const delay = 3000 + Math.random() * 4000;
        replyTimers[activeRoom] = setTimeout(function () {
            delete replyTimers[activeRoom];
            if (!rooms[activeRoom]) return;
            rooms[activeRoom].messages.push({
                id: Date.now() + 1,
                sender: 'partner',
                text: pickReply(),
                timestamp: Date.now()
            });
            save();
            const modal = document.getElementById('media-room-modal');
            if (modal && modal.style.display !== 'none') renderMessages();
            try { if (typeof playSound === 'function') playSound('message'); } catch (e) {}
        }, delay);
    }

    /* ---------- 渲染整个房间 ---------- */
    function renderAll() {
        renderTabs();
        renderInfo();
        renderMessages();
    }

    /* ---------- 事件绑定（一次性） ---------- */
    let bound = false;
    function bindEvents() {
        if (bound) return;
        bound = true;

        document.addEventListener('click', function (e) {
            // 打开影音室
            if (e.target.closest('#media-room-function')) {
                e.preventDefault();
                const adv = document.getElementById('advanced-modal');
                if (adv && typeof hideModal === 'function') hideModal(adv);
                setTimeout(openRoom, 260);
                return;
            }
            // 关闭
            if (e.target.closest('#media-room-modal .modal-content') === null &&
                e.target.id === 'media-room-modal') {
                if (typeof hideModal === 'function') hideModal(e.target);
                return;
            }
            // Tab 切换
            const tab = e.target.closest('#media-room-tabs .room-tab');
            if (tab) {
                activeRoom = tab.dataset.room;
                renderAll();
                return;
            }
            // 发送
            if (e.target.closest('#media-room-send')) {
                sendMessage();
                return;
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.target.id !== 'media-room-input') return;
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        document.addEventListener('input', function (e) {
            if (e.target.id !== 'media-room-input') return;
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
        });
    }

    async function openRoom() {
        await load();
        renderAll();
        scheduleWishInvite();
        const modal = document.getElementById('media-room-modal');
        if (modal && typeof showModal === 'function') showModal(modal);
    }

    async function init() {
        await load();
        bindEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 300); });
    } else {
        setTimeout(init, 300);
    }
    /* ---------- 链接解析：把常见视频网站链接转成可嵌入的 embed ---------- */
    function parseLinkForPlayer(url) {
        try {
            var u = new URL(url);
            var host = u.hostname.replace(/^www\./, '');

            // YouTube
            if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
                var vid = '';
                if (host === 'youtu.be') vid = u.pathname.slice(1);
                else vid = u.searchParams.get('v') || '';
                if (vid) return { type: 'iframe', src: 'https://www.youtube.com/embed/' + vid };
            }

            // B 站
            if (host === 'bilibili.com' || host === 'm.bilibili.com' || host === 'b23.tv') {
                var m = u.pathname.match(/\/video\/(BV[a-zA-Z0-9]+)/);
                if (m) return { type: 'iframe', src: 'https://player.bilibili.com/player.html?bvid=' + m[1] + '&autoplay=0&high_quality=1' };
            }

            // 直链视频
            if (/\.(mp4|webm|ogg|m4v|mov)(\?|$)/i.test(url)) {
                return { type: 'video', src: url };
            }
            // 直链音频
            if (/\.(mp3|m4a|wav|ogg|aac|flac)(\?|$)/i.test(url)) {
                return { type: 'audio', src: url };
            }

            // 兜底：直接 iframe（部分网站会拒绝，但至少能试）
            return { type: 'iframe', src: url };
        } catch (e) {
            return { type: 'iframe', src: url };
        }
    }

    /* ---------- 本地文件上传处理 ---------- */
    function handleLocalFileUpload(e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        e.target.value = '';

        var isVideo = file.type.indexOf('video/') === 0;
        var isAudio = file.type.indexOf('audio/') === 0;
        if (!isVideo && !isAudio) {
            if (typeof showNotification === 'function') showNotification('请上传视频或音频文件', 'warning');
            return;
        }

        var MAX = 20 * 1024 * 1024; // 20MB
        if (file.size > MAX) {
            if (typeof showNotification === 'function') {
                showNotification('文件过大（' + (file.size / 1024 / 1024).toFixed(1) + 'MB），请小于 20MB', 'error', 4000);
            }
            return;
        }

        if (typeof showNotification === 'function') showNotification('正在处理文件...', 'info', 1500);

        var reader = new FileReader();
        reader.onload = function (ev) {
            var room = rooms[activeRoom];
            room.localFile = {
                name: file.name,
                type: isVideo ? 'video' : 'audio',
                data: ev.target.result,
                size: file.size
            };
            room.link = '';
            save();
            renderInfo();
            openPlayer(ev.target.result, isVideo ? 'video' : 'audio', file.name);
            if (typeof showNotification === 'function') showNotification('文件已导入 ✦', 'success');
        };
        reader.onerror = function () {
            if (typeof showNotification === 'function') showNotification('文件读取失败', 'error');
        };
        reader.readAsDataURL(file);
    }

    /* ---------- 悬浮播放器 ---------- */
    function ensurePlayerDOM() {
        if (document.getElementById('media-room-player')) return;
        var el = document.createElement('div');
        el.id = 'media-room-player';
        el.innerHTML =
            '<div class="mrp-header">' +
              '<span class="mrp-title" id="mrp-title">播放中</span>' +
              '<div class="mrp-actions">' +
                '<button class="mrp-btn" data-act="minimize" title="最小化"><i class="fas fa-window-minimize"></i></button>' +
                '<button class="mrp-btn" data-act="close" title="关闭"><i class="fas fa-times"></i></button>' +
              '</div>' +
            '</div>' +
            '<div class="mrp-body" id="mrp-body"></div>';
        document.body.appendChild(el);

        el.querySelector('[data-act="close"]').addEventListener('click', function () {
            closePlayer();
        });
        el.querySelector('[data-act="minimize"]').addEventListener('click', function () {
            el.classList.toggle('minimized');
        });

        // 拖动
        var header = el.querySelector('.mrp-header');
        var dragOn = false, offX = 0, offY = 0;
        header.addEventListener('pointerdown', function (e) {
            if (e.target.closest('.mrp-btn')) return;
            e.preventDefault();
            var rect = el.getBoundingClientRect();
            offX = e.clientX - rect.left;
            offY = e.clientY - rect.top;
            dragOn = true;
            try { header.setPointerCapture(e.pointerId); } catch (_) {}
        });
        header.addEventListener('pointermove', function (e) {
            if (!dragOn) return;
            e.preventDefault();
            var w = el.offsetWidth, h = el.offsetHeight;
            var x = Math.max(0, Math.min(window.innerWidth - w, e.clientX - offX));
            var y = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - offY));
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        });
        var stopDrag = function (e) {
            if (!dragOn) return;
            dragOn = false;
            try { header.releasePointerCapture(e.pointerId); } catch (_) {}
        };
        header.addEventListener('pointerup', stopDrag);
        header.addEventListener('pointercancel', stopDrag);
    }

    function openPlayer(src, type, name) {
        ensurePlayerDOM();
        var el = document.getElementById('media-room-player');
        var body = document.getElementById('mrp-body');
        var title = document.getElementById('mrp-title');

        title.textContent = name
            ? (name.length > 32 ? name.slice(0, 32) + '…' : name)
            : '播放中';

        // 清空并停止旧内容
        body.innerHTML = '';

        if (type === 'video') {
            var v = document.createElement('video');
            v.src = src;
            v.controls = true;
            v.autoplay = true;
            v.playsInline = true;
            body.appendChild(v);
        } else if (type === 'audio') {
            var wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:16px;gap:14px;box-sizing:border-box;';
            wrap.innerHTML =
                '<div style="width:100px;height:100px;border-radius:50%;background:linear-gradient(135deg,var(--accent-color),rgba(var(--accent-color-rgb),0.6));display:flex;align-items:center;justify-content:center;color:#fff;font-size:36px;box-shadow:0 8px 24px rgba(var(--accent-color-rgb),0.4);">' +
                  '<i class="fas fa-music"></i>' +
                '</div>' +
                '<div style="font-size:12px;color:rgba(255,255,255,0.75);text-align:center;word-break:break-all;max-width:100%;">' +
                  (name ? String(name).replace(/</g, '&lt;').replace(/>/g, '&gt;') : '音频') +
                '</div>';
            body.appendChild(wrap);
            var a = document.createElement('audio');
            a.src = src;
            a.controls = true;
            a.autoplay = true;
            a.style.cssText = 'width:100%;margin-top:8px;';
            wrap.appendChild(a);
        } else if (type === 'iframe') {
            var iframe = document.createElement('iframe');
            iframe.src = src;
            iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
            iframe.setAttribute('allowfullscreen', 'true');
            iframe.style.cssText = 'width:100%;height:100%;border:none;display:block;';
            body.appendChild(iframe);
        }

        el.classList.add('visible');
        el.classList.remove('minimized');

        // 首次打开定位到右下角
        if (!el.style.left) {
            var pw = 360, ph = 240;
            if (window.innerWidth < 480) { pw = window.innerWidth - 24; ph = 220; }
            el.style.width = pw + 'px';
            el.style.height = ph + 'px';
            el.style.left = Math.max(12, window.innerWidth - pw - 24) + 'px';
            el.style.top = Math.max(12, window.innerHeight - ph - 24) + 'px';
        }
    }

    function closePlayer() {
        var el = document.getElementById('media-room-player');
        if (!el) return;
        el.classList.remove('visible');
        var body = document.getElementById('mrp-body');
        if (body) body.innerHTML = '';
    }
    window.mediaRoom = {
        open: openRoom,
        getRooms: function () { return rooms; }
    };
})();