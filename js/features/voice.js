/* =========================================================
 * voice.js — 语音条消息模拟
 * 发送语音条 → 语音条下方自动浮现"对方的话"（从字卡库随机抽取）
 * ========================================================= */
(function () {
    'use strict';

    let recTimer = null;
    let recSeconds = 0;
    let isRecording = false;

    function fmtSec(s) {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    }

    /* ---------- 从字卡库随机抽一句（作为"他回复的话"）---------- */
    function pickTranscript() {
        const pool = (typeof customReplies !== 'undefined' && Array.isArray(customReplies))
            ? customReplies : [];
        const disabled = (function () {
            try {
                const raw = localStorage.getItem('disabledReplyItems');
                return raw ? new Set(JSON.parse(raw)) : new Set();
            } catch (e) { return new Set(); }
        })();
        const groupDisabled = new Set();
        ((window.customReplyGroups) || []).forEach(function (g) {
            if (g.disabled && Array.isArray(g.items)) {
                g.items.forEach(function (t) { groupDisabled.add(t); });
            }
        });
        const available = pool
            .map(function (r) { return String(r || '').trim(); })
            .filter(function (r) { return r && !disabled.has(r) && !groupDisabled.has(r); });
        if (!available.length) return '……（ta 轻轻地"嗯"了一声）';
        return available[Math.floor(Math.random() * available.length)];
    }

    /* ---------- 渲染语音条（供 core.js 调用）---------- */
    window._renderVoiceBubble = function (msg) {
        const dur = Math.max(1, Math.min(60, (msg.voice && msg.voice.duration) || 5));
        const bars = 5;
        let barsHtml = '';
        for (let i = 0; i < bars; i++) {
            const h = (6 + Math.random() * 12).toFixed(1);
            barsHtml += '<span class="voice-wave-bar" style="height:' + h + 'px;"></span>';
        }
        return '<div class="voice-bubble" data-voice-id="' + msg.id + '">' +
               '<i class="fas fa-play voice-play-icon"></i>' +
               '<div class="voice-waves">' + barsHtml + '</div>' +
               '<span class="voice-duration">' + dur + '\u2033</span>' +
               '</div>';
    };

    /* ---------- 点击播放（模拟）---------- */
    document.addEventListener('click', function (e) {
        const bubble = e.target.closest('.voice-bubble');
        if (!bubble) return;
        e.stopPropagation();
        if (bubble.classList.contains('playing')) return;

        bubble.classList.add('playing');
        const icon = bubble.querySelector('.voice-play-icon');
        if (icon) icon.className = 'fas fa-pause voice-play-icon';
        try { if (typeof playSound === 'function') playSound('message'); } catch (err) {}

        const wrapper = bubble.closest('.message-content-wrapper');
        if (wrapper) {
            const tr = wrapper.querySelector('.voice-transcript[data-hidden-transcript="1"]');
            if (tr) {
                tr.style.display = '';
                delete tr.dataset.hiddenTranscript;
                tr.style.animation = 'none';
                void tr.offsetWidth;
                tr.style.animation = '';
            }
        }

        const durEl = bubble.querySelector('.voice-duration');
        const dur = durEl ? (parseFloat(durEl.textContent) || 3) : 3;
        setTimeout(function () {
            bubble.classList.remove('playing');
            if (icon) icon.className = 'fas fa-play voice-play-icon';
        }, Math.min(dur * 1000, 4500));
    });

    /* ---------- 打开录音面板 ---------- */
    function openVoiceRecorder() {
        const modal = document.getElementById('voice-record-modal');
        if (!modal) return;
        const timerEl = document.getElementById('voice-rec-timer');
        const recBtn = document.getElementById('voice-rec-btn');
        recSeconds = 0;
        isRecording = false;
        if (timerEl) timerEl.textContent = '00:00';
        if (recBtn) {
            recBtn.classList.remove('recording');
            recBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        }
        if (typeof showModal === 'function') showModal(modal);
    }

    document.addEventListener('click', function (e) {
        if (e.target.closest('#voice-btn')) {
            e.preventDefault();
            openVoiceRecorder();
        }
    });

    /* ---------- 录音开始 / 停止 ---------- */
    document.addEventListener('click', function (e) {
        if (!e.target.closest('#voice-rec-btn')) return;
        const recBtn = document.getElementById('voice-rec-btn');
        const timerEl = document.getElementById('voice-rec-timer');

        if (!isRecording) {
            isRecording = true;
            recSeconds = 0;
            if (recBtn) {
                recBtn.classList.add('recording');
                recBtn.innerHTML = '<i class="fas fa-stop"></i>';
            }
            if (timerEl) timerEl.textContent = '00:00';
            recTimer = setInterval(function () {
                recSeconds++;
                if (timerEl) timerEl.textContent = fmtSec(recSeconds);
                if (recSeconds >= 60) stopAndSend();
            }, 1000);
        } else {
            stopAndSend();
        }
    });

    document.addEventListener('click', function (e) {
        if (e.target.closest('#voice-cancel-btn')) {
            if (recTimer) { clearInterval(recTimer); recTimer = null; }
            isRecording = false;
            const modal = document.getElementById('voice-record-modal');
            if (modal && typeof hideModal === 'function') hideModal(modal);
        }
    });

    /* ---------- 停止并发送 ---------- */
    function stopAndSend() {
        if (recTimer) { clearInterval(recTimer); recTimer = null; }
        isRecording = false;

        const recBtn = document.getElementById('voice-rec-btn');
        if (recBtn) {
            recBtn.classList.remove('recording');
            recBtn.innerHTML = '<i class="fas fa-microphone"></i>';
        }

        // 录音太短（<1 秒）视为随机一个合理时长
        let dur = recSeconds;
        if (dur < 1) dur = Math.floor(Math.random() * 8) + 3;

        const transcript = pickTranscript();   // ← "他回复的话" 从字卡库抽
        const modal = document.getElementById('voice-record-modal');
        if (modal && typeof hideModal === 'function') hideModal(modal);

        setTimeout(function () { sendVoiceMessage(dur, transcript); }, 220);
    }

    /* ---------- 发送语音条消息 ---------- */
    function sendVoiceMessage(duration, transcript) {
        if (typeof addMessage !== 'function') return;

        const msg = {
            id: Date.now(),
            sender: 'user',
            text: '',
            timestamp: new Date(),
            status: 'sent',
            favorited: false,
            type: 'voice',
            voice: {
                duration: duration,
                transcript: ''   // 先空着，稍后浮现
            }
        };
        addMessage(msg);
        try { if (typeof playSound === 'function') playSound('send'); } catch (e) {}

        // 1 秒后，让文字"浮现"出来（既作为转写，也作为他对这段语音的回应）
        setTimeout(function () {
            const target = document.querySelector('[data-msg-id="' + msg.id + '"]');
            if (!target) return;
            const cw = target.querySelector('.message-content-wrapper');
            if (!cw) return;
            if (cw.querySelector('.voice-transcript')) return;

            const tr = document.createElement('div');
            tr.className = 'voice-transcript';
            tr.textContent = transcript;
            const messageEl = cw.querySelector('.message');
            const metaEl = cw.querySelector('.message-meta');

            if (messageEl && metaEl) {
                cw.insertBefore(tr, metaEl);
            } else if (messageEl) {
                if (messageEl.nextSibling) cw.insertBefore(tr, messageEl.nextSibling);
                else cw.appendChild(tr);
            } else {
                cw.appendChild(tr);
            }

            // 同步写入数据层
            try {
                const m = (typeof messages !== 'undefined' ? messages : []).find(function (x) {
                    return String(x.id) === String(msg.id);
                });
                if (m && m.voice) m.voice.transcript = transcript;
                if (typeof throttledSaveData === 'function') throttledSaveData();
            } catch (e) {}

            try { if (typeof playSound === 'function') playSound('message'); } catch (e) {}
        }, 1000);
    }

    window._sendVoiceMessage = sendVoiceMessage;
})();