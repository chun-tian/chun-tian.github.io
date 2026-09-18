/* =========================================================
 * personas.js — 多角色系统（第 1 步：角色管理基础设施）
 *  · 每个角色绑定一个独立 sessionId
 *  · 复用现有 session 机制，不做核心改造
 * ========================================================= */
(function () {
    'use strict';

    const PERSONA_LIST_KEY = 'personaList';

    let personaList = [];
    let editingPersonaId = null;

    /* ---------- 存储 ---------- */
    async function loadPersonas() {
        try {
            const saved = await localforage.getItem(PERSONA_LIST_KEY);
            if (Array.isArray(saved)) personaList = saved;
        } catch (e) {}
        await syncWithSessions();
    }
    async function savePersonas() {
        try { await localforage.setItem(PERSONA_LIST_KEY, personaList); } catch (e) {}
    }

    /**
     * 把现存 sessionList 里还没有对应角色的会话，自动补一条 persona
     */
    async function syncWithSessions() {
        if (typeof sessionList === 'undefined' || !Array.isArray(sessionList)) return;
        const knownSessionIds = new Set(personaList.map(p => p.sessionId));
        let changed = false;
        for (const sess of sessionList) {
            if (!knownSessionIds.has(sess.id)) {
                personaList.push({
                    id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    name: sess.name || '未命名角色',
                    avatar: null,
                    sessionId: sess.id,
                    createdAt: sess.createdAt || Date.now()
                });
                changed = true;
            }
        }
        if (changed) await savePersonas();
    }

    /* ---------- 渲染列表 ---------- */
    function renderPersonaList() {
        const listEl = document.getElementById('persona-list');
        if (!listEl) return;

        if (personaList.length === 0) {
            listEl.innerHTML = '<div class="persona-empty">还没有角色，点上方「+ 新建角色」吧 ✦</div>';
            return;
        }

        listEl.innerHTML = personaList.map(function (p) {
            const isCurrent = (typeof SESSION_ID !== 'undefined' && p.sessionId === SESSION_ID);
            const avatarHtml = p.avatar
                ? '<img src="' + p.avatar + '" alt="">'
                : '<i class="fas fa-user"></i>';
            return '' +
                '<div class="persona-card ' + (isCurrent ? 'current' : '') + '" data-pid="' + p.id + '">' +
                  '<div class="persona-avatar">' + avatarHtml + '</div>' +
                  '<div class="persona-info">' +
                    '<div class="persona-name">' + esc(p.name) + (isCurrent ? ' <span class="persona-current-badge">当前</span>' : '') + '</div>' +
                    '<div class="persona-meta">创建于 ' + new Date(p.createdAt).toLocaleDateString('zh-CN') + '</div>' +
                  '</div>' +
                  '<div class="persona-actions">' +
                    '<button class="persona-icon-btn" data-act="edit" title="编辑"><i class="fas fa-pen"></i></button>' +
                    '<button class="persona-icon-btn danger" data-act="del" title="删除"><i class="fas fa-trash"></i></button>' +
                  '</div>' +
                '</div>';
        }).join('');

            // 点击卡片切换角色
        listEl.querySelectorAll('.persona-card').forEach(function (card) {
            card.style.cursor = 'pointer';
            card.onclick = function (e) {
                if (e.target.closest('.persona-icon-btn')) return;
                const pid = card.dataset.pid;
                switchToPersona(pid);
            };
        });

        // 编辑按钮
        listEl.querySelectorAll('[data-act="edit"]').forEach(function (btn) {
            btn.onclick = function (e) {
                e.stopPropagation();
                const pid = btn.closest('[data-pid]').dataset.pid;
                openPersonaEditor(pid);
            };
        });
        // 删除按钮
        listEl.querySelectorAll('[data-act="del"]').forEach(function (btn) {
            btn.onclick = function (e) {
                e.stopPropagation();
                const pid = btn.closest('[data-pid]').dataset.pid;
                deletePersona(pid);
            };
        });
    }

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    /* ---------- 切换到指定角色 ---------- */
async function switchToPersona(personaId) {
    const persona = personaList.find(x => x.id === personaId);
    if (!persona) return;

    if (typeof SESSION_ID !== 'undefined' && persona.sessionId === SESSION_ID) {
        if (typeof showNotification === 'function') showNotification('已经在这个角色了', 'info', 1500);
        return;
    }

    if (!confirm('切换到「' + persona.name + '」？\n\n当前角色的聊天记录会自动保存，两个角色的数据完全独立。')) return;

    // 1. 保存当前角色的所有数据（此时 messages 还是完整的）
    try {
        if (typeof saveData === 'function') await saveData();
    } catch (e) {
        console.error('[personas] 切换前保存失败', e);
    }

    // 2. 设置跳过标志：让 reload 前的 pagehide / beforeunload 不再写库
    try { window._skipBackup = true; } catch (e) {}
    try { window._skipSave = true; } catch (e) {}

    // 3. 清除 localStorage 里的紧急备份
    try { localStorage.removeItem('BACKUP_V1_critical'); } catch (e) {}
    try { localStorage.removeItem('BACKUP_V1_timestamp'); } catch (e) {}

    // 4. 注意：这里不再清空 messages！否则 pagehide 的 saveData 会把空数组写回旧角色

    // 5. 写入"待切换标记"，reload 后 initializeSession 会优先读它
    try {
        localStorage.setItem('__PENDING_SESSION_SWITCH__', persona.sessionId);
    } catch (e) {}

    // 6. 写 lastSessionId + 保证目标 session 在 sessionList 里
    try {
        const prefix = window.APP_PREFIX || 'CHAT_APP_V3_';
        await localforage.setItem(prefix + 'lastSessionId', persona.sessionId);

        if (typeof sessionList !== 'undefined' && Array.isArray(sessionList)) {
            if (!sessionList.some(s => s.id === persona.sessionId)) {
                sessionList.push({
                    id: persona.sessionId,
                    name: persona.name || '新会话',
                    createdAt: Date.now()
                });
                await localforage.setItem(prefix + 'sessionList', sessionList);
            }
        }
    } catch (e) {}

    // 7. reload，新的 initializeSession 会切到目标会话
    window.location.hash = persona.sessionId;
    window.location.reload();
}

    /* ---------- 打开角色管理面板 ---------- */
async function openPersonaManager() {
    try {
        await loadPersonas();
    } catch (e) {
        console.error('[personas] 打开面板时加载失败:', e);
    }
    renderPersonaList();
    const modal = document.getElementById('persona-manager-modal');
    if (modal && typeof showModal === 'function') {
        showModal(modal);
    } else {
        console.warn('[personas] 面板元素不存在或 showModal 未定义');
        if (typeof showNotification === 'function') {
            showNotification('角色管理面板加载失败，请刷新页面', 'error');
        }
    }
}

    /* ---------- 新建 / 编辑角色 ---------- */
    function openPersonaEditor(pid) {
        editingPersonaId = pid || null;
        const modal = document.getElementById('persona-editor-modal');
        if (!modal) return;

        const titleEl = modal.querySelector('#persona-editor-title');
        const nameInput = modal.querySelector('#persona-editor-name');
        const avatarBox = modal.querySelector('#persona-editor-avatar');

        if (pid) {
            const p = personaList.find(x => x.id === pid);
            if (!p) return;
            if (titleEl) titleEl.textContent = '编辑角色';
            if (nameInput) nameInput.value = p.name;
            if (avatarBox) {
                avatarBox.innerHTML = p.avatar
                    ? '<img src="' + p.avatar + '" alt="">'
                    : '<i class="fas fa-camera"></i>';
            }
        } else {
            if (titleEl) titleEl.textContent = '新建角色';
            if (nameInput) nameInput.value = '';
            if (avatarBox) avatarBox.innerHTML = '<i class="fas fa-camera"></i>';
        }

        if (typeof showModal === 'function') showModal(modal);
        if (nameInput) setTimeout(function () { nameInput.focus(); }, 150);
    }

    function readEditorData() {
        const modal = document.getElementById('persona-editor-modal');
        if (!modal) return { name: '', avatar: null };
        const nameInput = modal.querySelector('#persona-editor-name');
        const avatarBox = modal.querySelector('#persona-editor-avatar');
        const img = avatarBox ? avatarBox.querySelector('img') : null;
        return {
            name: nameInput ? nameInput.value.trim() : '',
            avatar: img ? img.src : null
        };
    }

    async function savePersonaEditor() {
        const { name, avatar } = readEditorData();
        if (!name) {
            if (typeof showNotification === 'function') showNotification('请输入角色名字', 'warning');
            return;
        }

        if (editingPersonaId) {
            // 编辑
            const p = personaList.find(x => x.id === editingPersonaId);
            if (p) {
                p.name = name;
                p.avatar = avatar;
                await savePersonas();

                // 如果编辑的是当前角色，同步更新顶部显示
                if (typeof SESSION_ID !== 'undefined' && p.sessionId === SESSION_ID) {
                    if (typeof settings !== 'undefined') {
                        settings.partnerName = name;
                        if (typeof throttledSaveData === 'function') throttledSaveData();
                    }
                    if (typeof updateUI === 'function') updateUI();
                }
                if (typeof showNotification === 'function') showNotification('角色已更新 ✦', 'success');
            }
        } else {
            // 新建 —— 需要新建会话
            const newId = await createNewPersonaSession();
            if (!newId) {
                if (typeof showNotification === 'function') showNotification('创建会话失败', 'error');
                return;
            }
            personaList.push({
                id: 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                name: name,
                avatar: avatar,
                sessionId: newId,
                createdAt: Date.now()
            });
            await savePersonas();
            if (typeof showNotification === 'function') showNotification('角色已创建，可切换到该角色开始聊天 ✦', 'success');
        }

        const modal = document.getElementById('persona-editor-modal');
        if (modal && typeof hideModal === 'function') hideModal(modal);
        renderPersonaList();
    }

    /**
     * 新建一个独立 session（不刷新页面）
     */
    async function createNewPersonaSession() {
        try {
            const newId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
            const newSession = {
                id: newId,
                name: '新会话 ' + new Date().toLocaleDateString('zh-CN'),
                createdAt: Date.now()
            };
            // 更新全局 sessionList
            if (typeof sessionList !== 'undefined' && Array.isArray(sessionList)) {
                sessionList.push(newSession);
                await localforage.setItem(
                    (window.APP_PREFIX || 'CHAT_APP_V3_') + 'sessionList',
                    sessionList
                );
            }
            return newId;
        } catch (e) {
            console.error('[personas] 创建会话失败', e);
            return null;
        }
    }

    /* ---------- 删除角色 ---------- */
    async function deletePersona(pid) {
        const p = personaList.find(x => x.id === pid);
        if (!p) return;
        if (personaList.length <= 1) {
            if (typeof showNotification === 'function') showNotification('至少保留一个角色', 'warning');
            return;
        }
        if (!confirm('确定要删除角色「' + p.name + '」吗？\n\n该角色的聊天记录、设置、字卡也会一并清除，且不可恢复。')) return;

        // 从 personaList 移除
        personaList = personaList.filter(x => x.id !== pid);
        await savePersonas();

        // 从 sessionList 移除
        if (typeof sessionList !== 'undefined' && Array.isArray(sessionList)) {
            const sessionIdToDelete = p.sessionId;
            sessionList = sessionList.filter(s => s.id !== sessionIdToDelete);
            await localforage.setItem(
                (window.APP_PREFIX || 'CHAT_APP_V3_') + 'sessionList',
                sessionList
            );

            // 清理该会话的数据
            const prefix = (window.APP_PREFIX || 'CHAT_APP_V3_') + sessionIdToDelete + '_';
            try {
                const keys = await localforage.keys();
                for (const k of keys) {
                    if (k.startsWith(prefix)) {
                        await localforage.removeItem(k);
                    }
                }
            } catch (e) {}
        }

        if (typeof showNotification === 'function') showNotification('角色已删除', 'success');
        renderPersonaList();
    }

    /* ---------- 头像上传 ---------- */
    function bindAvatarUpload() {
        const modal = document.getElementById('persona-editor-modal');
        if (!modal || modal._avatarBound) return;
        modal._avatarBound = true;

        const avatarBox = modal.querySelector('#persona-editor-avatar');
        const fileInput = modal.querySelector('#persona-editor-avatar-input');
        if (avatarBox && fileInput) {
            avatarBox.onclick = function () { fileInput.click(); };
            fileInput.onchange = function (e) {
                const file = e.target.files && e.target.files[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                    if (typeof showNotification === 'function') showNotification('头像请小于 2MB', 'error');
                    return;
                }
                const reader = new FileReader();
                reader.onload = function (ev) {
                    avatarBox.innerHTML = '<img src="' + ev.target.result + '" alt="">';
                };
                reader.readAsDataURL(file);
                e.target.value = '';
            };
        }
    }

    /* ---------- 全局事件绑定 ---------- */
    let bound = false;
    function bindEvents() {
        if (bound) return;
        bound = true;

        document.addEventListener('click', function (e) {
            // 打开角色管理
            if (e.target.closest('#persona-manager-function')) {
                e.preventDefault();
                const adv = document.getElementById('advanced-modal');
                if (adv && typeof hideModal === 'function') hideModal(adv);
                setTimeout(openPersonaManager, 260);
                return;
            }
            // 关闭角色管理
            if (e.target.closest('#close-persona-manager')) {
                const modal = document.getElementById('persona-manager-modal');
                if (modal && typeof hideModal === 'function') hideModal(modal);
                return;
            }
            // 打开新建
            if (e.target.closest('#persona-add-btn')) {
                e.preventDefault();
                openPersonaEditor(null);
                return;
            }
            // 编辑器内保存
            if (e.target.closest('#persona-editor-save')) {
                e.preventDefault();
                savePersonaEditor();
                return;
            }
            // 编辑器内取消
            if (e.target.closest('#persona-editor-cancel')) {
                const modal = document.getElementById('persona-editor-modal');
                if (modal && typeof hideModal === 'function') hideModal(modal);
                return;
            }
        });
    }

    /* ---------- 初始化 ---------- */
async function init() {
    // 先绑定事件，保证点击一定可用
    bindAvatarUpload();
    bindEvents();
    // 再加载数据，出错也不影响点击
    try {
        await loadPersonas();
    } catch (e) {
        console.error('[personas] loadPersonas 失败:', e);
    }
}
   /**
 * 等待 sessionList 就绪后再初始化
 * sessionList 由 core.js 的 initializeSession 从 localforage 恢复，
 * 数据量大时可能耗时 1~3 秒。这里用轮询等待，最多 15 秒。
 */
function waitForSessionListAndInit() {
    var waited = 0;
    var INTERVAL = 200;
    var MAX_WAIT = 15000;

    function check() {
        var ready = typeof sessionList !== 'undefined'
            && Array.isArray(sessionList)
            && sessionList.length > 0;

        if (ready) {
            init();
            return;
        }

        waited += INTERVAL;
        if (waited >= MAX_WAIT) {
            console.warn('[personas] 等待 sessionList 超时，仍尝试初始化');
            init();
            return;
        }

        setTimeout(check, INTERVAL);
    }

    check();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForSessionListAndInit);
} else {
    waitForSessionListAndInit();
}

    window.personaFeature = {
        open: openPersonaManager,
        getList: function () { return personaList; },
        reload: loadPersonas
    };
})();