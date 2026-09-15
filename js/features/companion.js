/* =========================================================
 * companion.js — 陪伴空间（一起学习 / 工作 / 睡觉）
 *  · 每房间独立消息、独立背景
 *  · 每房间独立倒计时 + 待办清单
 * ========================================================= */
(function () {
    'use strict';

    const STORAGE_KEY = 'companion_v1';
    const ROOM_TYPES = [
        { id: 'study', icon: 'fa-book',         label: '学习',  presets: [15, 25, 45, 60],  defaultMin: 25 },
        { id: 'work',  icon: 'fa-briefcase',    label: '工作',  presets: [25, 45, 60, 90],  defaultMin: 45 },
        { id: 'sleep', icon: 'fa-moon',         label: '睡觉',  presets: [30, 60, 480, 540], defaultMin: 480 }
    ];

    let rooms = {};
    let activeRoom = 'study';
    let tickInterval = null;
    let replyTimers = {};

    function defaultRoom(type) {
        const t = ROOM_TYPES.find(function (x) { return x.id === type; }) || ROOM_TYPES[0];
        return {
            messages: [],
            bg: null,
            todos: [],
            diary: [],
            customMin: null,
            timer: {
                total: t.defaultMin * 60,
                remaining: t.defaultMin * 60,
                endAt: null,
                running: false
            }
        };
    }

    async function load() {
        try {
            const saved = await localforage.getItem(STORAGE_KEY);
            if (saved && typeof saved === 'object') rooms = saved;
        } catch (e) {}
        ROOM_TYPES.forEach(function (t) {
            if (!rooms[t.id]) rooms[t.id] = defaultRoom(t.id);
            const r = rooms[t.id];
            if (!Array.isArray(r.messages)) r.messages = [];
            if (!Array.isArray(r.todos)) r.todos = [];
            if (!Array.isArray(r.diary)) r.diary = [];
            if (r.customMin === undefined) r.customMin = null;
            if (r.bg == null) r.bg = null;
            if (!r.timer) r.timer = defaultRoom(t.id).timer;
            if (typeof r.timer.total !== 'number') r.timer.total = t.defaultMin * 60;
            if (typeof r.timer.remaining !== 'number') r.timer.remaining = r.timer.total;
            if (typeof r.timer.running !== 'boolean') r.timer.running = false;
            if (r.timer.endAt == null) r.timer.endAt = null;
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
    function fmtClock(sec) {
        if (sec < 0) sec = 0;
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        const pad = function (n) { return String(n).padStart(2, '0'); };
        if (h > 0) return pad(h) + ':' + pad(m) + ':' + pad(s);
        return pad(m) + ':' + pad(s);
    }
    function fmtTime(ts) {
        const d = new Date(ts);
        const pad = function (n) { return String(n).padStart(2, '0'); };
        return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function fmtMin(min) {
        if (min >= 60 && min % 60 === 0) return (min / 60) + 'h';
        return min + 'm';
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

    /* ---------- 倒计时核心 ---------- */
    function getRemaining(room) {
        const t = room.timer;
        if (t.running && t.endAt) {
            return Math.max(0, Math.ceil((t.endAt - Date.now()) / 1000));
        }
        return Math.max(0, t.remaining);
    }

    function tick() {
        const room = rooms[activeRoom];
        if (!room) return;
        const t = room.timer;
        if (t.running) {
            const rem = getRemaining(room);
            if (rem <= 0) {
                t.running = false;
                t.endAt = null;
                t.remaining = 0;
                save();
                onTimerFinish();
                renderInfo();
                return;
            }
            const displayEl = document.getElementById('companion-timer-display');
            if (displayEl) {
                displayEl.textContent = fmtClock(rem);
                displayEl.classList.toggle('ending', rem <= 60);
            }
        }
    }

    function startTick() {
        if (tickInterval) clearInterval(tickInterval);
        tickInterval = setInterval(tick, 1000);
    }

    function onTimerFinish() {
        const room = rooms[activeRoom];
        const type = ROOM_TYPES.find(function (t) { return t.id === activeRoom; });
        const finishText = pickReply();
        const prefix = activeRoom === 'sleep' ? '🌙 晚安好梦 · ' :
                       activeRoom === 'work'  ? '💼 辛苦了 · ' :
                                                '📚 完成啦 · ';
        room.messages.push({
            id: Date.now(),
            sender: 'partner',
            text: prefix + finishText,
            timestamp: Date.now()
        });

        // ── 写入陪伴日记 ──
        const durSec = room.timer.total;
        const entry = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            roomType: activeRoom,
            roomLabel: type ? type.label : '陪伴',
            roomIcon: type ? type.icon : 'fa-hourglass-half',
            duration: durSec,
            endTime: Date.now(),
            startTime: Date.now() - durSec * 1000,
            myComment: '',
            partnerComment: '',
            myCommentAt: null,
            partnerCommentAt: null,
            createdAt: Date.now()
        };
        room.diary.push(entry);
        // 最多保留 200 条
        if (room.diary.length > 200) room.diary = room.diary.slice(-200);

        save();
        renderMessages();
        try { if (typeof playSound === 'function') playSound('message'); } catch (e) {}
        if (typeof showNotification === 'function') {
            showNotification((type ? type.label : '') + '倒计时结束 · 已记入陪伴日记 ✦', 'success', 3200);
        }

        // 安排 Ta 稍后评论
        schedulePartnerDiaryComment(activeRoom, entry.id);
    }

    /* ---------- Tab 栏 ---------- */
    function renderTabs() {
        const el = document.getElementById('companion-tabs');
        if (!el) return;
        el.innerHTML = ROOM_TYPES.map(function (t) {
            return '<button class="room-tab ' + (activeRoom === t.id ? 'active' : '') + '" data-room="' + t.id + '">' +
                   '<i class="fas ' + t.icon + '"></i>' + t.label +
                   '</button>';
        }).join('');
    }

    /* ---------- 信息区（背景 + 倒计时 + 清单） ---------- */
    function renderInfo() {
        const el = document.getElementById('companion-info');
        if (!el) return;
        const room = rooms[activeRoom];
        const type = ROOM_TYPES.find(function (t) { return t.id === activeRoom; });
        const t = room.timer;
        const rem = getRemaining(room);
        const displayTime = fmtClock(rem);
        const isEnding = rem <= 60 && t.running;

        el.classList.toggle('has-bg', !!room.bg);
        el.style.backgroundImage = room.bg ? 'url(' + room.bg + ')' : '';

        const presetHtml = type.presets.map(function (min) {
            const active = Math.abs(t.total - min * 60) < 2 ? ' active' : '';
            return '<button class="room-timer-preset' + active + '" data-preset-min="' + min + '">' + fmtMin(min) + '</button>';
        }).join('') +
        '<button class="room-timer-preset room-timer-custom-btn" id="companion-timer-custom">' +
          '<i class="fas fa-pen" style="font-size:9px;margin-right:3px;"></i>自定义' +
        '</button>';

        const customMin = room.customMin || Math.round(t.total / 60);

        const todoHtml = room.todos.length
            ? room.todos.map(function (todo) {
                return '<div class="room-todo-item ' + (todo.done ? 'done' : '') + '" data-todo-id="' + todo.id + '">' +
                         '<div class="room-todo-check" data-action="toggle"><i class="fas fa-check"></i></div>' +
                         '<div class="room-todo-text">' + esc(todo.text) + '</div>' +
                         '<button class="room-todo-del" data-action="del"><i class="fas fa-times"></i></button>' +
                       '</div>';
              }).join('')
            : '<div style="font-size:11.5px;color:var(--text-secondary);text-align:center;padding:8px;opacity:0.6;">还没有清单，添加一条吧 ✦</div>';

        el.innerHTML =
            '<div class="room-info-overlay"></div>' +
            '<button class="room-bg-btn" id="companion-bg-btn" title="更换背景"><i class="fas fa-image"></i></button>' +
            '<input type="file" id="companion-bg-input" accept="image/*" style="display:none;">' +
            '<div class="room-info-inner">' +
              '<div class="room-info-label"><i class="fas ' + type.icon + '"></i> 一起' + type.label + '</div>' +
              '<div class="room-timer">' +
                '<div class="room-timer-display' + (isEnding ? ' ending' : '') + '" id="companion-timer-display">' + displayTime + '</div>' +
                '<div class="room-timer-presets">' + presetHtml + '</div>' +
                '<div class="room-timer-custom-row" id="companion-timer-custom-row" style="display:none;">' +
                  '<input type="number" id="companion-timer-custom-input" min="1" max="999" placeholder="分钟" value="' + customMin + '">' +
                  '<button id="companion-timer-custom-ok">设定</button>' +
                '</div>' +
                '<div class="room-timer-actions">' +
                  '<button class="room-timer-btn" id="companion-timer-toggle">' + (t.running ? '暂停' : '开始') + '</button>' +
                  '<button class="room-timer-btn ghost" id="companion-timer-reset">重置</button>' +
                '</div>' +
              '</div>' +
              '<div class="room-diary-entry" id="companion-diary-entry">' +
                '<div class="room-diary-entry-icon"><i class="fas fa-book"></i></div>' +
                '<div class="room-diary-entry-info">' +
                  '<div class="room-diary-entry-title">陪伴日记</div>' +
                  '<div class="room-diary-entry-sub">已记录 ' + (room.diary.length || 0) + ' 次陪伴</div>' +
                '</div>' +
                '<i class="fas fa-chevron-right" style="opacity:0.4;font-size:11px;"></i>' +
              '</div>' +
              '<div class="room-todo-toggle" id="companion-todo-toggle">' +
                '<span><i class="fas fa-list-check"></i> 待办清单（' + room.todos.filter(function (x) { return !x.done; }).length + '/' + room.todos.length + '）</span>' +
                '<i class="fas fa-chevron-right arrow"></i>' +
              '</div>' +
              '<div class="room-todo-panel" id="companion-todo-panel">' +
                '<div>' + todoHtml + '</div>' +
                '<div class="room-todo-add">' +
                  '<input type="text" id="companion-todo-input" placeholder="添加一项待办...">' +
                  '<button id="companion-todo-add-btn">添加</button>' +
                '</div>' +
              '</div>' +
            '</div>';

        bindInfoEvents();
    }

    function bindInfoEvents() {
        const el = document.getElementById('companion-info');
        if (!el) return;
        const room = rooms[activeRoom];

        const bgBtn = el.querySelector('#companion-bg-btn');
        if (bgBtn) bgBtn.addEventListener('click', function () {
            const inp = el.querySelector('#companion-bg-input');
            if (inp) inp.click();
        });
        const bgInput = el.querySelector('#companion-bg-input');
        if (bgInput) bgInput.addEventListener('change', handleBgUpload);

        el.querySelectorAll('.room-timer-preset[data-preset-min]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const min = parseInt(btn.dataset.presetMin, 10);
                room.customMin = null;
                room.timer.total = min * 60;
                room.timer.remaining = min * 60;
                room.timer.running = false;
                room.timer.endAt = null;
                save();
                renderInfo();
            });
        });

        // ── 自定义时间 ──
        const customBtn = el.querySelector('#companion-timer-custom');
        const customRow = el.querySelector('#companion-timer-custom-row');
        const customInput = el.querySelector('#companion-timer-custom-input');
        const customOk = el.querySelector('#companion-timer-custom-ok');
        if (customBtn && customRow) {
            customBtn.addEventListener('click', function () {
                const isOpen = customRow.style.display !== 'none';
                customRow.style.display = isOpen ? 'none' : 'flex';
                if (!isOpen && customInput) {
                    customInput.value = room.customMin || Math.round(room.timer.total / 60);
                    setTimeout(function () { customInput.focus(); customInput.select(); }, 50);
                }
            });
        }
        function applyCustomTime() {
            if (!customInput) return;
            let min = parseInt(customInput.value, 10);
            if (!min || min < 1) min = 1;
            if (min > 999) min = 999;
            room.customMin = min;
            room.timer.total = min * 60;
            room.timer.remaining = min * 60;
            room.timer.running = false;
            room.timer.endAt = null;
            save();
            renderInfo();
            if (typeof showNotification === 'function') showNotification('已设为 ' + min + ' 分钟 ✦', 'success', 1500);
        }
        if (customOk) customOk.addEventListener('click', applyCustomTime);
        if (customInput) {
            customInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); applyCustomTime(); }
            });
        }

        // ── 打开陪伴日记 ──
        const diaryEntry = el.querySelector('#companion-diary-entry');
        if (diaryEntry) {
            diaryEntry.addEventListener('click', function () {
                openDiaryPanel(activeRoom);
            });
        }

        const toggleBtn = el.querySelector('#companion-timer-toggle');
        if (toggleBtn) toggleBtn.addEventListener('click', function () {
            const t = room.timer;
            if (t.running) {
                // 暂停：把剩余时间存进 remaining
                t.remaining = getRemaining(room);
                t.running = false;
                t.endAt = null;
            } else {
                if (t.remaining <= 0) t.remaining = t.total;
                t.endAt = Date.now() + t.remaining * 1000;
                t.running = true;
            }
            save();
            renderInfo();
        });

        const resetBtn = el.querySelector('#companion-timer-reset');
        if (resetBtn) resetBtn.addEventListener('click', function () {
            room.timer.running = false;
            room.timer.endAt = null;
            room.timer.remaining = room.timer.total;
            save();
            renderInfo();
        });

        const todoToggle = el.querySelector('#companion-todo-toggle');
        const todoPanel = el.querySelector('#companion-todo-panel');
        if (todoToggle && todoPanel) {
            if (room._todoOpen) {
                todoPanel.classList.add('open');
                todoToggle.classList.add('open');
            }
            todoToggle.addEventListener('click', function () {
                room._todoOpen = !room._todoOpen;
                todoPanel.classList.toggle('open', room._todoOpen);
                todoToggle.classList.toggle('open', room._todoOpen);
            });
        }

        el.querySelectorAll('.room-todo-item').forEach(function (item) {
            const id = Number(item.dataset.todoId);
            const toggle = item.querySelector('[data-action="toggle"]');
            const del = item.querySelector('[data-action="del"]');
            if (toggle) toggle.addEventListener('click', function () {
                const todo = room.todos.find(function (x) { return x.id === id; });
                if (todo) {
                    todo.done = !todo.done;
                    save();
                    renderInfo();
                }
            });
            if (del) del.addEventListener('click', function () {
                room.todos = room.todos.filter(function (x) { return x.id !== id; });
                save();
                renderInfo();
            });
        });

        const addBtn = el.querySelector('#companion-todo-add-btn');
        const addInput = el.querySelector('#companion-todo-input');
        if (addBtn && addInput) {
            const addTodo = function () {
                const text = addInput.value.trim();
                if (!text) return;
                room.todos.push({ id: Date.now(), text: text, done: false });
                addInput.value = '';
                save();
                renderInfo();
                setTimeout(function () {
                    const panel = document.getElementById('companion-todo-panel');
                    if (panel && !panel.classList.contains('open')) {
                        room._todoOpen = true;
                        panel.classList.add('open');
                    }
                }, 20);
            };
            addBtn.addEventListener('click', addTodo);
            addInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); addTodo(); }
            });
        }
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

    /* ---------- 消息 ---------- */
    function renderMessages() {
        const el = document.getElementById('companion-messages');
        if (!el) return;
        const msgs = rooms[activeRoom].messages;
        if (!msgs.length) {
            el.innerHTML = '<div class="room-empty">' +
                '这里是与 TA 的专属陪伴空间<br>' +
                '开始你们共同的时光吧 ✦' +
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

    function sendMessage() {
        const inp = document.getElementById('companion-input');
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
            const modal = document.getElementById('companion-modal');
            if (modal && modal.style.display !== 'none') renderMessages();
            try { if (typeof playSound === 'function') playSound('message'); } catch (e) {}
        }, delay);
    }

    /* ---------- 渲染总入口 ---------- */
    function renderAll() {
        renderTabs();
        renderInfo();
        renderMessages();
    }

    /* ---------- 事件绑定 ---------- */
    let bound = false;
    function bindEvents() {
        if (bound) return;
        bound = true;

        document.addEventListener('click', function (e) {
            if (e.target.closest('#companion-function')) {
                e.preventDefault();
                const adv = document.getElementById('advanced-modal');
                if (adv && typeof hideModal === 'function') hideModal(adv);
                setTimeout(openRoom, 260);
                return;
            }
            if (e.target.id === 'companion-modal') {
                if (typeof hideModal === 'function') hideModal(e.target);
                return;
            }
            const tab = e.target.closest('#companion-tabs .room-tab');
            if (tab) {
                activeRoom = tab.dataset.room;
                renderAll();
                startTick();
                return;
            }
            if (e.target.closest('#companion-send')) {
                sendMessage();
                return;
            }
        });

        document.addEventListener('keydown', function (e) {
            if (e.target.id !== 'companion-input') return;
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        document.addEventListener('input', function (e) {
            if (e.target.id !== 'companion-input') return;
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
        });
    }

    async function openRoom() {
        await load();
        renderAll();
        startTick();
        const modal = document.getElementById('companion-modal');
        if (modal && typeof showModal === 'function') showModal(modal);
    }
    /* ---------- 陪伴日记：渲染 & 评论 ---------- */
    function fmtDiaryTime(ts) {
        const d = new Date(ts);
        const pad = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) +
               ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function fmtDuration(sec) {
        if (sec < 60) return sec + '秒';
        const m = Math.floor(sec / 60);
        const h = Math.floor(m / 60);
        if (h > 0) {
            const rm = m % 60;
            return h + '小时' + (rm > 0 ? rm + '分钟' : '');
        }
        return m + '分钟';
    }

    function openDiaryPanel(roomId) {
        activeRoom = roomId || activeRoom;
        renderDiaryList();
        const modal = document.getElementById('companion-diary-modal');
        if (modal && typeof showModal === 'function') showModal(modal);
    }

    function renderDiaryList() {
        const list = document.getElementById('companion-diary-list');
        const empty = document.getElementById('companion-diary-empty');
        if (!list) return;
        const room = rooms[activeRoom];
        const diary = (room.diary || []).slice().sort(function (a, b) { return b.endTime - a.endTime; });

        if (diary.length === 0) {
            list.innerHTML = '';
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';

        const myName = (typeof settings !== 'undefined' && settings.myName) || '我';
        const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || '梦角';

        list.innerHTML = diary.map(function (d) {
            const myCommentHtml = d.myComment
                ? '<div class="diary-comment-text">' + esc(d.myComment) + '</div>'
                : '<div class="diary-comment-empty">点此写下你的感想…</div>';
            const partnerCommentHtml = d.partnerComment
                ? '<div class="diary-comment-text">' + esc(d.partnerComment) + '</div>'
                : '<div class="diary-comment-empty">等 Ta 说点什么…</div>';

            return '' +
                '<div class="diary-card" data-diary-id="' + d.id + '">' +
                  '<div class="diary-card-head">' +
                    '<div class="diary-card-icon"><i class="fas ' + (d.roomIcon || 'fa-hourglass-half') + '"></i></div>' +
                    '<div class="diary-card-meta">' +
                      '<div class="diary-card-title">一起' + d.roomLabel + '</div>' +
                      '<div class="diary-card-sub">' +
                        '<span><i class="far fa-clock" style="margin-right:3px;"></i>' + fmtDuration(d.duration) + '</span>' +
                        '<span style="margin-left:10px;">' + fmtDiaryTime(d.endTime) + '</span>' +
                      '</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="diary-comments">' +
                    '<div class="diary-comment-row">' +
                      '<span class="diary-comment-who mine">' + esc(myName) + '</span>' +
                      '<div class="diary-comment-body" data-role="my-comment">' + myCommentHtml + '</div>' +
                    '</div>' +
                    '<div class="diary-comment-row">' +
                      '<span class="diary-comment-who partner">' + esc(partnerName) + '</span>' +
                      '<div class="diary-comment-body">' + partnerCommentHtml + '</div>' +
                    '</div>' +
                  '</div>' +
                  '<div class="diary-input-row" data-diary-id="' + d.id + '">' +
                    '<input type="text" placeholder="写下你的感想…" maxlength="80" value="' + esc(d.myComment || '') + '">' +
                    '<button class="diary-send-btn">发送</button>' +
                  '</div>' +
                '</div>';
        }).join('');

        // 绑定评论输入
        list.querySelectorAll('.diary-input-row').forEach(function (row) {
            const id = Number(row.dataset.diaryId);
            const input = row.querySelector('input');
            const btn = row.querySelector('.diary-send-btn');
            function submit() {
                const text = input.value.trim();
                if (!text) return;
                saveDiaryComment(id, 'me', text);
                input.value = '';
                renderDiaryList();
            }
            btn.addEventListener('click', submit);
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') { e.preventDefault(); submit(); }
            });
        });
    }

    function saveDiaryComment(entryId, who, text) {
        const room = rooms[activeRoom];
        const entry = (room.diary || []).find(function (d) { return d.id === entryId; });
        if (!entry) return;
        if (who === 'me') {
            entry.myComment = text;
            entry.myCommentAt = Date.now();
        } else {
            entry.partnerComment = text;
            entry.partnerCommentAt = Date.now();
        }
        save();
    }

    /* ---------- Ta 自动评论日记 ---------- */
    function schedulePartnerDiaryComment(roomId, entryId) {
        // 30 秒 ~ 5 分钟内随机
        const delay = 30000 + Math.random() * (5 * 60 * 1000 - 30000);
        setTimeout(function () {
            // 页面隐藏时跳过本次
            if (document.hidden) return;
            const room = rooms[roomId];
            if (!room) return;
            const entry = (room.diary || []).find(function (d) { return d.id === entryId; });
            if (!entry) return;
            if (entry.partnerComment) return;

            let comment = pickReply();
            if (!comment || comment === '……') {
                const fallbacks = [
                    '这段时间很安心。',
                    '下次还要一起。',
                    '有点舍不得结束呢。',
                    '刚刚好像什么都没想，只是很放松。',
                    '你在我身边就好。'
                ];
                comment = fallbacks[Math.floor(Math.random() * fallbacks.length)];
            }
            entry.partnerComment = comment;
            entry.partnerCommentAt = Date.now();
            save();

            // 当前 modal 打开着日记面板则刷新
            const diaryModal = document.getElementById('companion-diary-modal');
            if (diaryModal && diaryModal.style.display !== 'none' && diaryModal.style.display !== '') {
                renderDiaryList();
            }

            // 弹窗提醒
            showDiaryCommentPopup(entry, comment);
        }, delay);
    }

    function showDiaryCommentPopup(entry, comment) {
        const existing = document.getElementById('diary-comment-popup');
        if (existing) existing.remove();

        const partnerName = (typeof settings !== 'undefined' && settings.partnerName) || '梦角';
        const popup = document.createElement('div');
        popup.id = 'diary-comment-popup';
        popup.className = 'diary-comment-popup';
        popup.innerHTML =
            '<div class="diary-popup-head">' +
              '<div class="diary-popup-icon"><i class="fas fa-book"></i></div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div class="diary-popup-title">' + esc(partnerName) + ' 给你的陪伴日记留言了</div>' +
                '<div class="diary-popup-sub">一起' + esc(entry.roomLabel) + ' · ' + fmtDuration(entry.duration) + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="diary-popup-comment">「' + esc(comment) + '」</div>' +
            '<div class="diary-popup-actions">' +
              '<button class="diary-popup-btn ghost" data-act="later">稍后</button>' +
              '<button class="diary-popup-btn primary" data-act="view">查看日记</button>' +
            '</div>';

        document.body.appendChild(popup);

        popup.querySelector('[data-act="later"]').addEventListener('click', function () {
            popup.remove();
        });
        popup.querySelector('[data-act="view"]').addEventListener('click', function () {
            popup.remove();
            // 打开陪伴空间 + 日记面板
            if (window.companion && typeof window.companion.open === 'function') {
                window.companion.open();
                setTimeout(function () {
                    openDiaryPanel(entry.roomType);
                }, 500);
            }
        });

        // 12 秒后自动消失
        setTimeout(function () {
            if (popup.parentNode) popup.remove();
        }, 12000);
    }

    /* ---------- 日记面板关闭 ---------- */
    document.addEventListener('click', function (e) {
        if (e.target.id === 'close-companion-diary') {
            const modal = document.getElementById('companion-diary-modal');
            if (modal && typeof hideModal === 'function') hideModal(modal);
        }
        if (e.target.id === 'companion-diary-modal') {
            if (typeof hideModal === 'function') hideModal(e.target);
        }
    });

    async function init() {
        await load();
        bindEvents();
        startTick();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 300); });
    } else {
        setTimeout(init, 300);
    }

    window.companion = {
        open: openRoom,
        getRooms: function () { return rooms; }
    };
})();