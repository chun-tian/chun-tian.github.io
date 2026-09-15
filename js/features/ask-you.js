/* =========================================================
 * ask-you.js — 「问问你」功能
 *  · 单向：我提问，Ta 回答
 *  · 支持单选 / 多选 / 问答题
 *  · 问答题的回复从字卡库随机抽取
 * ========================================================= */
(function () {
    'use strict';

    let currentMode = 'single'; // single / multi / qa
    let options = ['', ''];    // 初始两个空选项
    let modalEl = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function letter(i) {
        return String.fromCharCode(65 + i); // A, B, C...
    }

    /* ---------- 构建模态框 ---------- */
    function ensureModal() {
        if (modalEl && modalEl.dataset.built === '1') return modalEl;
        if (!modalEl) {
            modalEl = document.createElement('div');
            modalEl.id = 'ask-you-modal';
            modalEl.className = 'modal';
            modalEl.style.zIndex = '2600';
            document.body.appendChild(modalEl);
        }
        modalEl.innerHTML = `
            <div class="modal-content ay-content">
                <div class="ay-head">
                    <div class="ay-head-icon"><i class="fas fa-question"></i></div>
                    <div class="ay-head-title">问问你</div>
                    <button class="ay-head-close" id="ay-close"><i class="fas fa-times"></i></button>
                </div>

                <div class="ay-question-wrap">
                    <textarea id="ay-question" class="ay-question-input" placeholder="输入你想问的问题..." maxlength="100"></textarea>
                </div>

                <div class="ay-type-row">
                    <span class="ay-type-label">选项</span>
                    <div class="ay-type-tabs">
                        <button class="ay-type-tab active" data-type="single">单选</button>
                        <button class="ay-type-tab" data-type="multi">多选</button>
                        <button class="ay-type-tab" data-type="qa">问答题</button>
                    </div>
                </div>

                <div class="ay-options" id="ay-options"></div>

                <button class="ay-add-option" id="ay-add-option">
                    <i class="fas fa-plus"></i> 添加选项
                </button>

                <div class="ay-actions">
                    <button class="ay-cancel" id="ay-cancel">取消</button>
                    <button class="ay-send" id="ay-send">发送问题</button>
                </div>
            </div>
        `;
        modalEl.dataset.built = '1';

        modalEl.querySelector('#ay-close').addEventListener('click', closeModal);
        modalEl.querySelector('#ay-cancel').addEventListener('click', closeModal);
        modalEl.addEventListener('click', function (e) {
            if (e.target === modalEl) closeModal();
        });

        modalEl.querySelectorAll('.ay-type-tab').forEach(function (btn) {
            btn.addEventListener('click', function () {
                currentMode = btn.dataset.type;
                modalEl.querySelectorAll('.ay-type-tab').forEach(function (b) {
                    b.classList.toggle('active', b.dataset.type === currentMode);
                });
                renderOptions();
            });
        });

        modalEl.querySelector('#ay-add-option').addEventListener('click', function () {
            if (options.length >= 8) {
                if (typeof showNotification === 'function') showNotification('最多 8 个选项', 'warning', 1500);
                return;
            }
            options.push('');
            renderOptions();
        });

        modalEl.querySelector('#ay-send').addEventListener('click', sendQuestion);

        return modalEl;
    }

    /* ---------- 渲染选项 ---------- */
    function renderOptions() {
        if (!modalEl) return;
        const wrap = modalEl.querySelector('#ay-options');
        const addBtn = modalEl.querySelector('#ay-add-option');

        // 问答题：隐藏选项区
        if (currentMode === 'qa') {
            wrap.style.display = 'none';
            addBtn.style.display = 'none';
            return;
        }
        wrap.style.display = 'flex';
        addBtn.style.display = 'flex';

        wrap.innerHTML = options.map(function (val, i) {
            return `
                <div class="ay-option-item" data-index="${i}">
                    <span class="ay-option-letter">${letter(i)}</span>
                    <input type="text" class="ay-option-input" value="${esc(val)}" placeholder="输入选项内容..." maxlength="40">
                    <button class="ay-option-del" data-del="${i}"><i class="fas fa-times"></i></button>
                </div>
            `;
        }).join('');

        wrap.querySelectorAll('.ay-option-input').forEach(function (inp) {
            inp.addEventListener('input', function () {
                const idx = parseInt(inp.closest('.ay-option-item').dataset.index, 10);
                options[idx] = inp.value;
            });
        });
        wrap.querySelectorAll('.ay-option-del').forEach(function (btn) {
            btn.addEventListener('click', function () {
                if (options.length <= 2) {
                    if (typeof showNotification === 'function') showNotification('至少保留两个选项', 'warning', 1500);
                    return;
                }
                const idx = parseInt(btn.dataset.del, 10);
                options.splice(idx, 1);
                renderOptions();
            });
        });
    }

    /* ---------- 打开 / 关闭 ---------- */
    function openModal() {
        const el = ensureModal();
        currentMode = 'single';
        options = ['', ''];
        el.querySelector('#ay-question').value = '';
        el.querySelectorAll('.ay-type-tab').forEach(function (b) {
            b.classList.toggle('active', b.dataset.type === 'single');
        });
        renderOptions();
        if (typeof showModal === 'function') showModal(el);
        else el.style.display = 'flex';
        setTimeout(function () { el.querySelector('#ay-question').focus(); }, 150);
    }
    function closeModal() {
        if (!modalEl) return;
        if (typeof hideModal === 'function') hideModal(modalEl);
        else modalEl.style.display = 'none';
    }

    /* ---------- 从字卡库随机抽一句（问答题用） ---------- */
    function pickFromLibrary() {
        const pool = (typeof customReplies !== 'undefined' && Array.isArray(customReplies))
            ? customReplies.slice() : [];
        const disabled = (function () {
            try {
                const raw = localStorage.getItem('disabledReplyItems');
                return raw ? new Set(JSON.parse(raw)) : new Set();
            } catch (e) { return new Set(); }
        })();
        const groupDisabled = new Set();
        ((window.customReplyGroups) || []).forEach(function (g) {
            if (g.disabled && Array.isArray(g.items)) g.items.forEach(function (t) { groupDisabled.add(t); });
        });
        const available = pool
            .map(function (r) { return String(r || '').trim(); })
            .filter(function (r) { return r && !disabled.has(r) && !groupDisabled.has(r); });
        if (!available.length) {
            const fallbacks = [
                '嗯嗯，我也是这么想的。',
                '和你在一起的时候总是很开心。',
                '想了一会儿，还是想先听你说。',
                '这个问题有点难呢…不过我想和你一起面对。',
                '我先抱抱你可以吗？'
            ];
            return fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }
        return available[Math.floor(Math.random() * available.length)];
    }

    /* ---------- 发送 ---------- */
    function sendQuestion() {
        const questionEl = modalEl.querySelector('#ay-question');
        const question = questionEl.value.trim();
        if (!question) {
            if (typeof showNotification === 'function') showNotification('请输入问题', 'warning', 1500);
            return;
        }

        const validOptions = options.map(function (o) { return o.trim(); }).filter(Boolean);

        if (currentMode !== 'qa') {
            if (validOptions.length < 2) {
                if (typeof showNotification === 'function') showNotification('请至少填写两个选项', 'warning', 1500);
                return;
            }
        }

        const askYouData = {
            question: question,
            mode: currentMode,
            options: currentMode === 'qa' ? [] : validOptions,
            answered: false,
            answer: null
        };

        const msg = {
            id: Date.now(),
            sender: 'user',
            text: '',
            timestamp: new Date(),
            status: 'sent',
            favorited: false,
            note: null,
            replyTo: null,
            type: 'ask_you',
            askYouData: askYouData
        };

        if (typeof addMessage === 'function') addMessage(msg);
        if (typeof playSound === 'function') playSound('send');
        closeModal();

        // 1.5~3.5 秒后 Ta 回答
        const delay = 1500 + Math.random() * 2000;
        setTimeout(function () {
            let replyText = '';
            if (currentMode === 'single') {
                replyText = validOptions[Math.floor(Math.random() * validOptions.length)];
            } else if (currentMode === 'multi') {
                const count = Math.max(1, Math.min(validOptions.length, Math.floor(Math.random() * 2) + 1));
                const shuffled = validOptions.slice().sort(function () { return Math.random() - 0.5; });
                replyText = shuffled.slice(0, count).join('、');
            } else {
                replyText = pickFromLibrary();
            }

            askYouData.answered = true;
            askYouData.answer = replyText;

            const replyMsg = {
                id: Date.now() + 1,
                sender: 'partner',
                text: currentMode === 'qa'
                    ? replyText
                    : '我选了：' + replyText,
                timestamp: new Date(),
                status: 'received',
                favorited: false,
                note: null,
                replyTo: null,
                type: 'normal',
                askYouReplyFor: msg.id
            };

            if (typeof addMessage === 'function') addMessage(replyMsg);
            if (typeof playSound === 'function') playSound('message');

            if (typeof throttledSaveData === 'function') throttledSaveData();
        }, delay);
    }

    /* ---------- 入口绑定 ---------- */
    document.addEventListener('click', function (e) {
        if (e.target.closest('#ask-you-function')) {
            e.preventDefault();
            const adv = document.getElementById('advanced-modal');
            if (adv && typeof hideModal === 'function') hideModal(adv);
            setTimeout(openModal, 200);
        }
    });

    window.askYouFeature = { open: openModal, close: closeModal };
})();