/* =========================================================
 * moments.js — 朋友圈
 *  · 我 / ta 均可发帖、点赞、评论
 *  · 我 / ta 均可各自更换主页封面
 *  · ta 的发帖 / 点赞 / 评论 全部从字卡库随机抽取
 * ========================================================= */
(function () {
    'use strict';

    const KEY_POSTS      = 'socialMoments_v1';
    const KEY_BG_MY      = 'socialMoments_myBg';
    const KEY_BG_PARTNER = 'socialMoments_partnerBg';
    const KEY_MY_NAME    = 'socialMoments_myName';   // 封面显示名（与聊天昵称分开，可自行修改）
    const NOTIFICATION_KEY = 'momentNotifications_v1';
    const NOTIFICATION_MAX = 200;
    let momentNotifications = [];

    let momentsPosts = [];
    let myMomentBg = null;
    let partnerMomentBg = null;
    let currentCover = 'me';   // 'me' | 'partner'
    let publishImage = null;
    let commentTargetPostId = null;
        let longPressTimer = null;
    let lpStartX = 0, lpStartY = 0;
    let lpTriggered = false;

    /* ---------- 工具 ---------- */
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function fmtTime(ts) {
        const d = new Date(ts);
        const now = Date.now();
        const diff = now - ts;
        if (diff < 60000) return '刚刚';
        if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
        if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
        if (diff < 604800000) return Math.floor(diff / 86400000) + ' 天前';
        const pad = n => String(n).padStart(2, '0');
        return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate());
    }

    function pickFromReplies() {
        const pool = (typeof customReplies !== 'undefined' && Array.isArray(customReplies))
            ? customReplies : [];
        const disabled = (function () {
            try {
                const raw = localStorage.getItem('disabledReplyItems');
                return raw ? new Set(JSON.parse(raw)) : new Set();
            } catch (e) { return new Set(); }
        })();
        const available = pool
            .map(r => String(r || '').trim())
            .filter(r => r && !disabled.has(r));
        if (!available.length) return '……';
        return available[Math.floor(Math.random() * available.length)];
    }

    /* ---------- 存储 ---------- */
    async function loadMoments() {
        try {
            const p = await localforage.getItem(KEY_POSTS);
            if (Array.isArray(p)) momentsPosts = p;
        } catch (e) {}
        try {
            const mb = await localforage.getItem(KEY_BG_MY);
            if (mb) myMomentBg = mb;
        } catch (e) {}
        try {
            const pb = await localforage.getItem(KEY_BG_PARTNER);
            if (pb) partnerMomentBg = pb;
        } catch (e) {}
        try {
            const raw = localStorage.getItem(NOTIFICATION_KEY);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) momentNotifications = arr;
            }
        } catch (e) {}
    }
    async function saveMoments() {
        try { await localforage.setItem(KEY_POSTS, momentsPosts); } catch (e) {}
        try {
            if (myMomentBg) await localforage.setItem(KEY_BG_MY, myMomentBg);
            else await localforage.removeItem(KEY_BG_MY);
        } catch (e) {}
        try {
            if (partnerMomentBg) await localforage.setItem(KEY_BG_PARTNER, partnerMomentBg);
            else await localforage.removeItem(KEY_BG_PARTNER);
        } catch (e) {}
    }

    function getMyName()      { return (typeof settings !== 'undefined' && settings.myName)      || '我'; }
    function getPartnerName() { return (typeof settings !== 'undefined' && settings.partnerName) || '梦角'; }

    /* ---------- 封面渲染 ---------- */
    function renderCover() {
        const isMe = currentCover === 'me';
        const bg = isMe ? myMomentBg : partnerMomentBg;
        const name = isMe ? getMyName() : getPartnerName();
        const avatarEl = isMe ? (DOMElements.me && DOMElements.me.avatar) : (DOMElements.partner && DOMElements.partner.avatar);
        const avatarImg = avatarEl ? avatarEl.querySelector('img') : null;

        const bgEl = document.getElementById('moments-cover-bg');
        if (bgEl) {
            if (bg) {
                bgEl.style.backgroundImage = 'url(' + bg + ')';
                bgEl.style.opacity = '1';
            } else {
                bgEl.style.backgroundImage = '';
                bgEl.style.opacity = '0';
            }
        }
        const avatarBox = document.getElementById('moments-cover-avatar');
        if (avatarBox) {
            if (avatarImg && avatarImg.src) {
                avatarBox.innerHTML = '<img src="' + avatarImg.src + '">';
            } else {
                avatarBox.innerHTML = '<i class="fas fa-user"></i>';
            }
        }
        const nameEl = document.getElementById('moments-cover-name');
        if (nameEl) nameEl.textContent = name;
        const badgeEl = document.getElementById('moments-cover-badge');
        if (badgeEl) badgeEl.textContent = isMe ? '我的主页' : (name + ' 的主页');
    }

    /* ---------- 渲染列表 ---------- */
    function renderMomentsList() {
        const list = document.getElementById('moments-list');
        if (!list) return;

        if (!momentsPosts.length) {
            list.innerHTML =
                '<div class="moments-empty">' +
                '<i class="fas fa-camera-retro"></i>' +
                '<p>还没有动态</p>' +
                '<span>点击上方按钮发表第一条吧</span>' +
                '</div>';
            return;
        }

        const sorted = [...momentsPosts].sort((a, b) => b.timestamp - a.timestamp);

        list.innerHTML = sorted.map(function (post) {
            const isMe = post.sender === 'user';
            const name = isMe ? getMyName() : getPartnerName();
            const avatarEl = isMe
                ? (DOMElements.me && DOMElements.me.avatar)
                : (DOMElements.partner && DOMElements.partner.avatar);
            const avatarImg = avatarEl ? avatarEl.querySelector('img') : null;
            const avatarHtml = (avatarImg && avatarImg.src)
                ? '<img src="' + avatarImg.src + '">'
                : '<i class="fas fa-user"></i>';

            const likedByMe = (post.likes || []).indexOf('user') !== -1;
            const likesHtml = (post.likes && post.likes.length)
                ? '<div class="moment-likes">❤️ ' +
                    post.likes.map(function (who) {
                        return esc(who === 'user' ? getMyName() : getPartnerName());
                    }).join('、') +
                  '</div>'
                : '';

            const commentsHtml = (post.comments && post.comments.length)
                ? '<div class="moment-comments">' +
                    post.comments.map(function (c) {
                        const cName = c.sender === 'user' ? getMyName() : getPartnerName();
                        return '<div class="moment-comment"><b>' + esc(cName) + '</b>：' + esc(c.text) + '</div>';
                    }).join('') +
                  '</div>'
                : '';

            const imgHtml = post.image
                ? '<div class="moment-image"><img src="' + post.image + '" loading="lazy" onclick="viewImage(\'' +
                    String(post.image).replace(/'/g, "\\'") + '\')"></div>'
                : '';

            const textHtml = post.text
                ? '<div class="moment-content">' + esc(post.text) + '</div>'
                : '';

            return '' +
                '<div class="moment-post" data-post-id="' + post.id + '">' +
                  '<div class="moment-header">' +
                    '<div class="moment-avatar">' + avatarHtml + '</div>' +
                    '<div class="moment-meta">' +
                      '<div class="moment-name">' + esc(name) + '</div>' +
                      '<div class="moment-time">' + fmtTime(post.timestamp) + '</div>' +
                    '</div>' +
                  '</div>' +
                  textHtml +
                  imgHtml +
                  '<div class="moment-actions">' +
                    '<button class="moment-like-btn' + (likedByMe ? ' liked' : '') + '" data-action="like">' +
                      (likedByMe ? '❤️' : '🤍') + ' ' + ((post.likes || []).length) +
                    '</button>' +
                    '<button class="moment-comment-btn" data-action="comment">' +
                      '<i class="fas fa-comment"></i> 评论' +
                    '</button>' +
                  '</div>' +
                  likesHtml +
                  commentsHtml +
                '</div>';
        }).join('');

        list.querySelectorAll('[data-action="like"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const pid = Number(btn.closest('.moment-post').dataset.postId);
                toggleLike(pid);
            });
        });
        list.querySelectorAll('[data-action="comment"]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const pid = Number(btn.closest('.moment-post').dataset.postId);
                openCommentDialog(pid);
            });
        });
              // 长按 / 右键 删除（仅绑定一次，事件委托到 list）
        if (!list._lpBound) {
            list._lpBound = true;

            function cancelLP() {
                if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
            }

            function triggerLP(postEl) {
                const postId = Number(postEl.dataset.postId);
                const post = momentsPosts.find(p => p.id === postId);
                if (!post) return;
                showMomentDeleteSheet(postId);
            }

            list.addEventListener('touchstart', function (e) {
                const postEl = e.target.closest('.moment-post');
                if (!postEl) return;
                const t = e.touches[0];
                lpStartX = t.clientX;
                lpStartY = t.clientY;
                lpTriggered = false;
                cancelLP();
                longPressTimer = setTimeout(function () {
                    longPressTimer = null;
                    lpTriggered = true;
                    triggerLP(postEl);
                }, 600);
            }, { passive: true });

            list.addEventListener('touchmove', function (e) {
                if (!longPressTimer) return;
                const t = e.touches[0];
                if (Math.abs(t.clientX - lpStartX) > 10 || Math.abs(t.clientY - lpStartY) > 10) {
                    cancelLP();
                }
            }, { passive: true });

            list.addEventListener('touchend', function (e) {
                cancelLP();
                if (lpTriggered) {
                    e.preventDefault();
                    lpTriggered = false;
                }
            });
            list.addEventListener('touchcancel', cancelLP);

            list.addEventListener('contextmenu', function (e) {
                const postEl = e.target.closest('.moment-post');
                if (!postEl) return;
                e.preventDefault();
                triggerLP(postEl);
            });
        }  
    }

    /* ---------- 点赞 ---------- */
    function toggleLike(postId) {
        const post = momentsPosts.find(p => p.id === postId);
        if (!post) return;
        post.likes = post.likes || [];
        const idx = post.likes.indexOf('user');
        if (idx > -1) post.likes.splice(idx, 1);
        else post.likes.push('user');
        saveMoments();
        renderMomentsList();

        // 如果是我给 ta 的动态点赞，ta 也有概率回赞 + 回评
        if (post.sender === 'partner' && idx === -1) {
            schedulePartnerReplyToMyLike(post.id);
        }
    }

    function schedulePartnerReplyToMyLike(postId) {
        const delay = 6000 + Math.random() * 12000;
        setTimeout(function () {
            const post = momentsPosts.find(p => p.id === postId);
            if (!post) return;
            post.likes = post.likes || [];
            if (post.likes.indexOf('partner') === -1) {
                post.likes.push('partner');
                addMomentNotification({
                    type: 'like',
                    sender: 'partner',
                    postId: post.id,
                    postPreview: _buildPostPreview(post)
                });
            }
            if (Math.random() < 0.7) {
                const _text = pickFromReplies();
                post.comments = post.comments || [];
                post.comments.push({
                    id: Date.now(),
                    sender: 'partner',
                    text: _text,
                    timestamp: Date.now()
                });
                addMomentNotification({
                    type: 'comment',
                    sender: 'partner',
                    postId: post.id,
                    postPreview: _buildPostPreview(post),
                    commentText: _text
                });
            }
            saveMoments();
            const modal = document.getElementById('moments-modal');
            if (modal && modal.style.display !== 'none') renderMomentsList();
        }, delay);
    }

    /* ---------- 评论 ---------- */
    function openCommentDialog(postId) {
        const modal = document.getElementById('moment-comment-modal');
        const input = document.getElementById('moment-comment-input');
        if (!modal) return;
        commentTargetPostId = postId;
        if (input) input.value = '';
        if (typeof showModal === 'function') showModal(modal, input);
    }

    document.addEventListener('click', function (e) {
        if (e.target.closest('#moment-comment-confirm')) {
            const input = document.getElementById('moment-comment-input');
            const text = input ? input.value.trim() : '';
            if (!text) return;
            const post = momentsPosts.find(p => p.id === commentTargetPostId);
            if (post) {
                post.comments = post.comments || [];
                post.comments.push({
                    id: Date.now(),
                    sender: 'user',
                    text: text,
                    timestamp: Date.now()
                });
                saveMoments();
                renderMomentsList();
                // 如果评论的是 ta 的动态，ta 回复我
                if (post.sender === 'partner') schedulePartnerReplyToComment(post.id);
            }
            const modal = document.getElementById('moment-comment-modal');
            if (modal && typeof hideModal === 'function') hideModal(modal);
        }
        if (e.target.closest('#moment-comment-cancel')) {
            const modal = document.getElementById('moment-comment-modal');
            if (modal && typeof hideModal === 'function') hideModal(modal);
        }
    });

    function schedulePartnerReplyToComment(postId) {
        const delay = 5000 + Math.random() * 10000;
        setTimeout(function () {
            const post = momentsPosts.find(p => p.id === postId);
            if (!post) return;
            const _text = pickFromReplies();
            post.comments = post.comments || [];
            post.comments.push({
                id: Date.now(),
                sender: 'partner',
                text: _text,
                timestamp: Date.now()
            });
            addMomentNotification({
                type: 'comment',
                sender: 'partner',
                postId: post.id,
                postPreview: _buildPostPreview(post),
                commentText: _text
            });
            saveMoments();
            const modal = document.getElementById('moments-modal');
            if (modal && modal.style.display !== 'none') renderMomentsList();
        }, delay);
    }

    /* ---------- 我发动态后，ta 也会来点赞/评论 ---------- */
    function schedulePartnerInteraction(myPostId) {
        const delay = 10000 + Math.random() * 20000;
        setTimeout(function () {
            const post = momentsPosts.find(p => p.id === myPostId);
            if (!post) return;
            post.likes = post.likes || [];
            if (post.likes.indexOf('partner') === -1) {
                post.likes.push('partner');
                addMomentNotification({
                    type: 'like',
                    sender: 'partner',
                    postId: post.id,
                    postPreview: _buildPostPreview(post)
                });
            }
            if (Math.random() < 0.7) {
                const _text = pickFromReplies();
                post.comments = post.comments || [];
                post.comments.push({
                    id: Date.now(),
                    sender: 'partner',
                    text: _text,
                    timestamp: Date.now()
                });
                addMomentNotification({
                    type: 'comment',
                    sender: 'partner',
                    postId: post.id,
                    postPreview: _buildPostPreview(post),
                    commentText: _text
                });
            }
            saveMoments();
            if (typeof showNotification === 'function') {
                showNotification(getPartnerName() + ' 赞了你的动态 ✦', 'info', 2500);
            }
            const modal = document.getElementById('moments-modal');
            if (modal && modal.style.display !== 'none') renderMomentsList();
        }, delay);
    }

    /* ---------- 发布我的动态 ---------- */
    function openPublishDialog() {
        const modal = document.getElementById('moments-publish-modal');
        const textarea = document.getElementById('moments-publish-text');
        const preview = document.getElementById('moments-publish-img-preview');
        const img = document.getElementById('moments-publish-img');
        if (!modal) return;
        publishImage = null;
        if (textarea) textarea.value = '';
        if (preview) preview.style.display = 'none';
        if (img) img.src = '';
        if (typeof showModal === 'function') showModal(modal, textarea);
    }

    document.addEventListener('click', function (e) {
        if (e.target.closest('#moments-publish-btn')) {
            e.preventDefault();
            openPublishDialog();
        }
        if (e.target.closest('#moments-publish-img-btn')) {
            const inp = document.getElementById('moments-publish-img-input');
            if (inp) inp.click();
        }
        if (e.target.closest('#moments-publish-img-remove')) {
            publishImage = null;
            const preview = document.getElementById('moments-publish-img-preview');
            if (preview) preview.style.display = 'none';
        }
        if (e.target.closest('#moments-publish-cancel')) {
            const modal = document.getElementById('moments-publish-modal');
            if (modal && typeof hideModal === 'function') hideModal(modal);
        }
        if (e.target.closest('#moments-publish-confirm')) {
            const textarea = document.getElementById('moments-publish-text');
            const text = textarea ? textarea.value.trim() : '';
            if (!text && !publishImage) {
                if (typeof showNotification === 'function') showNotification('写点什么或加张图片吧', 'warning');
                return;
            }
            const post = {
                id: Date.now(),
                sender: 'user',
                text: text,
                image: publishImage,
                timestamp: Date.now(),
                likes: [],
                comments: []
            };
            momentsPosts.push(post);
            saveMoments();
            renderMomentsList();
            const modal = document.getElementById('moments-publish-modal');
            if (modal && typeof hideModal === 'function') hideModal(modal);
            if (typeof showNotification === 'function') showNotification('动态已发布 ✦', 'success');
            schedulePartnerInteraction(post.id);
        }
    });

    /* ---------- 发布图片处理 ---------- */
    document.addEventListener('change', function (e) {
        if (e.target.id !== 'moments-publish-img-input') return;
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            if (typeof showNotification === 'function') showNotification('图片请小于 5MB', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = function (ev) {
            publishImage = ev.target.result;
            const preview = document.getElementById('moments-publish-img-preview');
            const img = document.getElementById('moments-publish-img');
            if (img) img.src = publishImage;
            if (preview) preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });

    /* ---------- 封面管理 ---------- */
    document.addEventListener('click', function (e) {
        if (e.target.closest('#moments-cover-switch')) {
            currentCover = currentCover === 'me' ? 'partner' : 'me';
            renderCover();
        }
        if (e.target.closest('#moments-cover-upload-btn')) {
            const inp = document.getElementById('moments-cover-input');
            if (inp) inp.click();
        }
    });

    document.addEventListener('change', function (e) {
        if (e.target.id !== 'moments-cover-input') return;
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            if (typeof showNotification === 'function') showNotification('封面请小于 5MB', 'error');
            return;
        }
        const reader = new FileReader();
        reader.onload = function (ev) {
            const data = ev.target.result;
            if (currentCover === 'me') myMomentBg = data;
            else partnerMomentBg = data;
            saveMoments();
            renderCover();
            if (typeof showNotification === 'function') {
                showNotification((currentCover === 'me' ? '我的' : (getPartnerName() + ' 的')) + '封面已更新 ✦', 'success');
            }
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });

    /* ---------- ta 随机发朋友圈 ---------- */
    function maybePartnerPost(force) {
        if (!force) {
            // 30% 概率
            if (Math.random() > 0.3) return;
        }
        // 距离上次 ta 发帖至少间隔 20 分钟
        const last = momentsPosts
            .filter(p => p.sender === 'partner')
            .sort((a, b) => b.timestamp - a.timestamp)[0];
        if (!force && last && Date.now() - last.timestamp < 20 * 60 * 1000) return;

        const text = pickFromReplies();
        const post = {
            id: Date.now(),
            sender: 'partner',
            text: text,
            image: null,
            timestamp: Date.now(),
            likes: [],
            comments: []
        };
        momentsPosts.push(post);
        saveMoments();

        // 自动带一个赞
        if (Math.random() < 0.4) post.likes.push('partner');

        if (typeof showNotification === 'function') {
            showNotification(getPartnerName() + ' 发布了新动态 ✦', 'info', 3000);
        }
        const modal = document.getElementById('moments-modal');
        if (modal && modal.style.display !== 'none') renderMomentsList();
    }

    /* ---------- 打开朋友圈 ---------- */
    function openMoments() {
        const modal = document.getElementById('moments-modal');
        if (!modal) return;
        currentCover = 'me';
        renderCover();
        renderMomentsList();
        maybePartnerPost(false);
        updateNotifBadge();
        if (typeof showModal === 'function') showModal(modal);
    }

    document.addEventListener('click', function (e) {
        if (e.target.closest('#moments-function')) {
            e.preventDefault();
            const adv = document.getElementById('advanced-modal');
            if (adv && typeof hideModal === 'function') hideModal(adv);
            setTimeout(openMoments, 260);
        }
        if (e.target.closest('#close-moments')) {
            const modal = document.getElementById('moments-modal');
            if (modal && typeof hideModal === 'function') hideModal(modal);
        }
    });

    /* ---------- 初始化 ---------- */
    async function initMoments() {
        await loadMoments();
        // 页面打开 30 秒后，ta 有概率发第一条
        setTimeout(function () { maybePartnerPost(false); }, 30000);
        // 每 25 分钟检查一次
        setInterval(function () { maybePartnerPost(false); }, 25 * 60 * 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(initMoments, 200); });
    } else {
        setTimeout(initMoments, 200);
    }

    // 暴露给调试 / 其他模块
       /* ---------- 删除确认 Action Sheet ---------- */
    function showMomentDeleteSheet(postId) {
        const post = momentsPosts.find(p => p.id === postId);
        if (!post) return;
        const isMine = post.sender === 'user';
        const who = isMine ? '我' : getPartnerName();

        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.42);' +
            'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
            'display:flex;align-items:flex-end;justify-content:center;' +
            'animation:fadeIn 0.18s ease;';
        overlay.innerHTML =
            '<div style="width:100%;max-width:520px;padding:0 12px calc(12px + env(safe-area-inset-bottom, 0px));' +
                'animation:momentSheetIn 0.28s cubic-bezier(0.32,0.72,0,1);">' +
              '<div style="background:var(--secondary-bg);border-radius:18px;overflow:hidden;' +
                   'box-shadow:0 -8px 40px rgba(0,0,0,0.24);">' +
                '<div style="padding:14px 18px 12px;text-align:center;font-size:12px;color:var(--text-secondary);' +
                     'border-bottom:1px solid var(--border-color);">' +
                  '长按目标：' + esc(who) + ' 的动态' +
                '</div>' +
                '<button id="_m_del" style="width:100%;padding:15px;background:none;border:none;cursor:pointer;' +
                        'color:#ff4757;font-size:15px;font-weight:600;font-family:var(--font-family);">' +
                  '<i class="fas fa-trash-alt" style="margin-right:6px;"></i>删除这条动态' +
                '</button>' +
                '<button id="_m_cancel" style="width:100%;padding:15px;background:none;border:none;cursor:pointer;' +
                        'color:var(--text-primary);font-size:15px;font-family:var(--font-family);' +
                        'border-top:1px solid var(--border-color);">取消</button>' +
              '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        // 注入动画
        if (!document.getElementById('_moment-sheet-style')) {
            const s = document.createElement('style');
            s.id = '_moment-sheet-style';
            s.textContent = '@keyframes momentSheetIn{from{transform:translateY(60px);opacity:0}to{transform:translateY(0);opacity:1}}';
            document.head.appendChild(s);
        }

        function close() {
            overlay.style.transition = 'opacity 0.18s ease';
            overlay.style.opacity = '0';
            setTimeout(function () { overlay.remove(); }, 180);
        }

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) close();
        });
        overlay.querySelector('#_m_cancel').addEventListener('click', close);
        overlay.querySelector('#_m_del').addEventListener('click', function () {
            momentsPosts = momentsPosts.filter(p => p.id !== postId);
            saveMoments();
            renderMomentsList();
            close();
            if (typeof showNotification === 'function') {
                showNotification('动态已删除', 'success', 1500);
            }
        });
    } 
        /* ========================================================
     * 互动记录通知（铃铛）
     * ====================================================== */
    function _buildPostPreview(post) {
        if (!post) return '';
        if (post.text) {
            const t = String(post.text).trim();
            return t.length > 30 ? t.slice(0, 30) + '…' : t;
        }
        if (post.image) return '[图片]';
        return '';
    }

    function loadMomentNotifications() {
        try {
            const raw = localStorage.getItem(NOTIFICATION_KEY);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) momentNotifications = arr;
            }
        } catch (e) {}
    }
    function saveMomentNotifications() {
        try {
            if (momentNotifications.length > NOTIFICATION_MAX) {
                momentNotifications = momentNotifications.slice(0, NOTIFICATION_MAX);
            }
            localStorage.setItem(NOTIFICATION_KEY, JSON.stringify(momentNotifications));
        } catch (e) {}
    }

    function addMomentNotification(opt) {
        const notif = {
            id: Date.now() + Math.floor(Math.random() * 10000),
            type: opt.type,
            sender: opt.sender || 'partner',
            senderName: opt.sender === 'user' ? getMyName() : getPartnerName(),
            postId: opt.postId,
            postPreview: opt.postPreview || '',
            commentText: opt.commentText || '',
            timestamp: Date.now(),
            read: false
        };
        momentNotifications.unshift(notif);
        if (momentNotifications.length > NOTIFICATION_MAX) {
            momentNotifications = momentNotifications.slice(0, NOTIFICATION_MAX);
        }
        saveMomentNotifications();
        updateNotifBadge();
        return notif;
    }

    function getUnreadCount() {
        return momentNotifications.filter(function (n) { return !n.read; }).length;
    }

    function updateNotifBadge() {
        const badge = document.getElementById('moments-notif-badge');
        if (!badge) return;
        const count = getUnreadCount();
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : String(count);
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    function markAllNotifRead() {
        let changed = false;
        momentNotifications.forEach(function (n) {
            if (!n.read) { n.read = true; changed = true; }
        });
        if (changed) saveMomentNotifications();
        updateNotifBadge();
    }

    function ensureNotifModal() {
        let modal = document.getElementById('moment-notif-modal');
        if (modal && modal.dataset.built === '1') return modal;
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'moment-notif-modal';
            modal.className = 'modal';
            modal.style.zIndex = '2600';
            document.body.appendChild(modal);
        }
        modal.innerHTML =
            '<div class="modal-content" style="max-width:420px;padding:0;display:flex;flex-direction:column;max-height:80vh;">' +
              '<div class="moment-notif-head">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                  '<div class="moment-notif-head-icon"><i class="fas fa-bell"></i></div>' +
                  '<div>' +
                    '<div style="font-size:15px;font-weight:700;color:var(--text-primary);">互动记录</div>' +
                    '<div style="font-size:11px;color:var(--text-secondary);opacity:0.75;margin-top:1px;" id="moment-notif-sub">Ta 给你的所有点赞和评论</div>' +
                  '</div>' +
                '</div>' +
                '<div style="display:flex;gap:6px;">' +
                  '<button class="moment-notif-icon-btn" id="moment-notif-clear-btn" title="清空记录"><i class="fas fa-trash"></i></button>' +
                  '<button class="moment-notif-icon-btn" id="moment-notif-close" title="关闭"><i class="fas fa-times"></i></button>' +
                '</div>' +
              '</div>' +
              '<div class="moment-notif-list" id="moment-notif-list"></div>' +
            '</div>';
        modal.dataset.built = '1';

        modal.querySelector('#moment-notif-close').addEventListener('click', function () {
            if (typeof hideModal === 'function') hideModal(modal);
            else modal.style.display = 'none';
        });
        modal.querySelector('#moment-notif-clear-btn').addEventListener('click', function () {
            if (momentNotifications.length === 0) {
                if (typeof showNotification === 'function') showNotification('暂无记录', 'info', 1500);
                return;
            }
            if (!confirm('清空所有互动记录？')) return;
            momentNotifications = [];
            saveMomentNotifications();
            renderNotifList();
            updateNotifBadge();
        });
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                if (typeof hideModal === 'function') hideModal(modal);
                else modal.style.display = 'none';
            }
        });

        return modal;
    }

    function renderNotifList() {
        const list = document.getElementById('moment-notif-list');
        if (!list) return;

        if (momentNotifications.length === 0) {
            list.innerHTML =
                '<div class="moment-notif-empty">' +
                  '<i class="fas fa-bell-slash"></i>' +
                  '<div style="font-size:13.5px;font-weight:600;color:var(--text-primary);opacity:0.55;">还没有互动记录</div>' +
                  '<div style="font-size:11.5px;opacity:0.5;margin-top:5px;">Ta 给你的动态点赞或评论后，会记录在这里</div>' +
                '</div>';
            return;
        }

        list.innerHTML = momentNotifications.map(function (n) {
            const isLike = n.type === 'like';
            const icon = isLike ? 'fa-heart' : 'fa-comment';
            const actionText = isLike ? '赞了你的动态' : '评论了你的动态';
            const timeStr = fmtTime(n.timestamp);
            const unreadCls = n.read ? '' : ' unread';
            return '' +
                '<div class="moment-notif-item' + unreadCls + '">' +
                  '<div class="moment-notif-type ' + (isLike ? 'type-like' : 'type-comment') + '">' +
                    '<i class="fas ' + icon + '"></i>' +
                  '</div>' +
                  '<div class="moment-notif-body">' +
                    '<div class="moment-notif-line">' +
                      '<b>' + esc(n.senderName) + '</b> ' + actionText +
                    '</div>' +
                    (n.commentText ? '<div class="moment-notif-comment">「' + esc(n.commentText) + '」</div>' : '') +
                    (n.postPreview ? '<div class="moment-notif-preview">' + esc(n.postPreview) + '</div>' : '') +
                    '<div class="moment-notif-time"><i class="far fa-clock" style="font-size:9px;margin-right:4px;"></i>' + timeStr + '</div>' +
                  '</div>' +
                '</div>';
        }).join('');
    }

    function openNotifPanel() {
        const modal = ensureNotifModal();
        renderNotifList();
        const sub = modal.querySelector('#moment-notif-sub');
        if (sub) {
            const total = momentNotifications.length;
            const unread = getUnreadCount();
            sub.textContent = total === 0 ? '暂无记录' : (unread > 0 ? unread + ' 条未读 · 共 ' + total + ' 条' : '共 ' + total + ' 条');
        }
        if (typeof showModal === 'function') showModal(modal);
        else modal.style.display = 'flex';
        // 延迟标记已读，让新条目保持高亮
        setTimeout(markAllNotifRead, 900);
    }

    // 点击铃铛
    document.addEventListener('click', function (e) {
        if (e.target.closest('#moments-notif-btn')) {
            e.preventDefault();
            e.stopPropagation();
            openNotifPanel();
        }
    });

        window.momentsDebug = {
        open: openMoments,
        forcePartnerPost: function () { maybePartnerPost(true); },
        clear: function () { momentsPosts = []; saveMoments(); renderMomentsList(); },
        getPosts: function () { return momentsPosts; },           // 新增
        getBgs: function () {                                     // 新增
            return { myBg: myMomentBg, partnerBg: partnerMomentBg };
        }
    };
})();