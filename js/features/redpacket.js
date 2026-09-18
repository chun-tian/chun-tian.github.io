/* =========================================================
 * redpacket.js — 红包功能
 *  · 双方互发红包，金额不限
 *  · ta 发出特殊数字（520/1314 等）概率较高
 *  · 红包封面可在「外观设置 → 红包封面」中修改
 * ========================================================= */
(function () {
    'use strict';

    const COVER_KEY = 'redpacketCover';
    const SPECIAL_AMOUNTS = [520, 1314, 521, 999, 666, 888, 2013, 2014, 99, 188, 233, 3344];
    const SPECIAL_WEIGHT = 0.4;

    let currentCover = null;

    async function loadCover() {
        try {
            const saved = await localforage.getItem(COVER_KEY);
            if (saved) currentCover = saved;
        } catch (e) {}
    }

    function randomAmount() {
        if (Math.random() < SPECIAL_WEIGHT) {
            return SPECIAL_AMOUNTS[Math.floor(Math.random() * SPECIAL_AMOUNTS.length)];
        }
        if (Math.random() < 0.7) return Math.floor(Math.random() * 200) + 1;
        return Math.floor(Math.random() * 800) + 200;
    }

    /* ---------- 渲染红包气泡（供 core.js 调用） ---------- */
    window._renderRedpacketBubble = function (msg) {
        const rp = msg.redpacket || {};
        const isOpened = rp.opened;
        const coverStyle = rp.cover
            ? 'background-image:url(' + rp.cover + ');background-size:cover;background-position:center;'
            : '';
        const bgClass = rp.cover ? 'has-cover' : '';
        const safeMsg = String(rp.message || '恭喜发财，大吉大利').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return '' +
            '<div class="redpacket-bubble ' + (isOpened ? 'opened' : '') + '" data-rp-id="' + msg.id + '">' +
              '<div class="rp-icon-wrap ' + bgClass + '" style="' + coverStyle + '">' +
                '<i class="fas fa-envelope-open-text rp-icon"></i>' +
              '</div>' +
              '<div class="rp-content">' +
                '<div class="rp-message">' + safeMsg + '</div>' +
                '<div class="rp-status">' + (isOpened ? '已领取' : '点击拆红包') + '</div>' +
              '</div>' +
            '</div>';
    };

    /* ---------- 点击拆红包 ---------- */
    document.addEventListener('click', function (e) {
        const bubble = e.target.closest('.redpacket-bubble');
        if (!bubble) return;
        e.stopPropagation();
        const id = bubble.dataset.rpId;
        const msg = (typeof messages !== 'undefined' ? messages : []).find(function (m) {
            return String(m.id) === String(id);
        });
        if (!msg || !msg.redpacket) return;
        if (msg.redpacket.opened) {
            if (typeof showNotification === 'function') {
                showNotification('这个红包已经领取过了', 'info', 1500);
            }
            return;
        }
        showOpenAnimation(msg);
    });

    function showOpenAnimation(msg) {
        const overlay = document.createElement('div');
        overlay.className = 'redpacket-open-overlay';
        const senderName = msg.sender === 'user'
            ? ((typeof settings !== 'undefined' && settings.myName) || '我')
            : ((typeof settings !== 'undefined' && settings.partnerName) || '对方');
        const coverStyle = msg.redpacket.cover
            ? 'background-image:url(' + msg.redpacket.cover + ');background-size:cover;background-position:center;'
            : '';
        overlay.innerHTML = '' +
            '<div class="rp-open-card">' +
              '<div class="rp-open-header" style="' + coverStyle + '">' +
                '<div class="rp-open-from">' + senderName + ' 的红包</div>' +
              '</div>' +
              '<div class="rp-open-body">' +
                '<div class="rp-open-message">' +
                  String(msg.redpacket.message || '恭喜发财，大吉大利').replace(/</g, '&lt;') +
                '</div>' +
                '<button class="rp-open-btn" type="button">開</button>' +
              '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        const btn = overlay.querySelector('.rp-open-btn');
        btn.addEventListener('click', function () {
            btn.classList.add('spinning');
            setTimeout(function () { showAmount(overlay, msg); }, 800);
        });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay && !msg.redpacket.opened) overlay.remove();
        });
    }

    function showAmount(overlay, msg) {
        const amount = msg.redpacket.amount;
        const card = overlay.querySelector('.rp-open-card');
        card.innerHTML =
            '<div class="rp-result">' +
              '<div class="rp-result-label">¥</div>' +
              '<div class="rp-result-amount">' + amount + '</div>' +
              '<div class="rp-result-hint">已存入零钱</div>' +
            '</div>';

        msg.redpacket.opened = true;
        msg.redpacket.openedTime = Date.now();
        if (typeof throttledSaveData === 'function') throttledSaveData();
        try { if (typeof playSound === 'function') playSound('favorite'); } catch (e) {}

        setTimeout(function () {
            overlay.classList.add('fade-out');
            setTimeout(function () {
                overlay.remove();
                if (typeof renderMessages === 'function') renderMessages(true);
            }, 300);
        }, 2200);
    }

    /* ---------- 我发红包 ---------- */
    window.openSendRedpacketDialog = function () {
        const overlay = document.createElement('div');
        overlay.className = 'redpacket-send-overlay';
        overlay.innerHTML = '' +
            '<div class="rp-send-card">' +
              '<div class="rp-send-header">' +
                '<span>发红包</span>' +
                '<button class="rp-send-close" type="button">✕</button>' +
              '</div>' +
              '<div class="rp-send-cover" id="_rp_cover_preview">' +
                (currentCover ? '<img src="' + currentCover + '">' : '<i class="fas fa-envelope-open-text"></i>') +
              '</div>' +
              '<div class="rp-send-body">' +
                '<label>金额</label>' +
                '<input type="number" class="rp-send-amount" placeholder="输入金额（不限）" min="0.01" step="0.01" inputmode="decimal">' +
                '<label>留言</label>' +
                '<input type="text" class="rp-send-msg" placeholder="恭喜发财，大吉大利" maxlength="30">' +
                '<div class="rp-send-quick">' +
                  '<button type="button" data-amt="52">52</button>' +
                  '<button type="button" data-amt="88">88</button>' +
                  '<button type="button" data-amt="188">188</button>' +
                  '<button type="button" data-amt="520">520</button>' +
                  '<button type="button" data-amt="1314">1314</button>' +
                '</div>' +
              '</div>' +
              '<div class="rp-send-footer">' +
                '<button class="rp-send-cancel" type="button">取消</button>' +
                '<button class="rp-send-confirm" type="button">塞钱进红包</button>' +
              '</div>' +
            '</div>';
        document.body.appendChild(overlay);

        const amountInput = overlay.querySelector('.rp-send-amount');
        const msgInput = overlay.querySelector('.rp-send-msg');

        overlay.querySelectorAll('.rp-send-quick button').forEach(function (btn) {
            btn.onclick = function () { amountInput.value = btn.dataset.amt; amountInput.focus(); };
        });
        overlay.querySelector('.rp-send-close').onclick = function () { overlay.remove(); };
        overlay.querySelector('.rp-send-cancel').onclick = function () { overlay.remove(); };
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });
        overlay.querySelector('.rp-send-confirm').onclick = function () {
            const amount = parseFloat(amountInput.value);
            const text = msgInput.value.trim() || '恭喜发财，大吉大利';
            if (!amount || amount <= 0) {
                if (typeof showNotification === 'function') showNotification('请输入有效金额', 'warning');
                return;
            }
            sendRedpacket(amount, text);
            overlay.remove();
        };
        setTimeout(function () { amountInput.focus(); }, 100);
    };

    function sendRedpacket(amount, message) {
        const msg = {
            id: Date.now(),
            sender: 'user',
            text: '',
            timestamp: new Date(),
            status: 'sent',
            favorited: false,
            type: 'redpacket',
            redpacket: {
                amount: amount,
                message: message,
                cover: currentCover,
                opened: false
            }
        };
        if (typeof addMessage === 'function') addMessage(msg);
        try { if (typeof playSound === 'function') playSound('send'); } catch (e) {}

        // ta 3~8 秒后拆红包，30% 概率回发
        setTimeout(function () {
            const m = (typeof messages !== 'undefined' ? messages : []).find(function (x) {
                return String(x.id) === String(msg.id);
            });
            if (!m || !m.redpacket || m.redpacket.opened) return;
            m.redpacket.opened = true;
            m.redpacket.openedTime = Date.now();
            if (typeof throttledSaveData === 'function') throttledSaveData();
            if (typeof renderMessages === 'function') renderMessages(true);

            if (Math.random() < 0.3) {
                setTimeout(function () {
                    const backMsg = {
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        sender: 'partner',
                        text: '',
                        timestamp: new Date(),
                        status: 'received',
                        type: 'redpacket',
                        redpacket: {
                            amount: randomAmount(),
                            message: pickBackMessage(),
                            cover: currentCover,
                            opened: false
                        }
                    };
                    if (typeof addMessage === 'function') addMessage(backMsg);
                    try { if (typeof playSound === 'function') playSound('partner_message'); } catch (e) {}
                }, 2000 + Math.random() * 3000);
            }
        }, 3000 + Math.random() * 5000);
    }

    function pickBackMessage() {
        const arr = [
            '回你一个小红包 ♡',
            '这是给你的心意',
            '也想给你一点甜',
            '收下吧，么么',
            '礼尚往来呀',
            '你也要开心哦'
        ];
        return arr[Math.floor(Math.random() * arr.length)];
    }

    /* ---------- ta 主动发红包 ---------- */
    function schedulePartnerRedpacket() {
        const delay = (60 + Math.random() * 240) * 60 * 1000; // 1~5 小时
        setTimeout(function () {
                    // 页面隐藏时跳过本次，直接安排下一轮
        if (document.hidden) {
            schedulePartnerRedpacket();
            return;
        }
            if (Math.random() < 0.25) {
                const msg = {
                    id: Date.now(),
                    sender: 'partner',
                    text: '',
                    timestamp: new Date(),
                    status: 'received',
                    type: 'redpacket',
                    redpacket: {
                        amount: randomAmount(),
                        message: pickBackMessage(),
                        cover: currentCover,
                        opened: false
                    }
                };
                if (typeof addMessage === 'function') addMessage(msg);
                try { if (typeof playSound === 'function') playSound('partner_message'); } catch (e) {}
            }
            schedulePartnerRedpacket();
        }, delay);
    }

    async function init() {
        await loadCover();
        setTimeout(schedulePartnerRedpacket, 30000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 500); });
    } else {
        setTimeout(init, 500);
    }

    window.redpacketFeature = {
        getCover: function () { return currentCover; },
        setCover: async function (data) {
            currentCover = data || null;
            try {
                if (data) await localforage.setItem(COVER_KEY, data);
                else await localforage.removeItem(COVER_KEY);
            } catch (e) {}
        },
        send: sendRedpacket
    };
})();