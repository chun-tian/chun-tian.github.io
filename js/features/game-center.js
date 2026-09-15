/* =========================================================
 * game-center.js — 小游戏中心（五子棋 / 飞行棋）
 *  · 内置两个小游戏，可单独与 Ta 对局
 *  · 双方互相邀请，正在对局时不会收到新邀请
 *  · 游玩记录：对手名 + 输赢结果
 * ========================================================= */
(function () {
    'use strict';

    var HISTORY_KEY = 'gameHistory_v1';
    var SESSION_LOCK_KEY = 'gameSessionLock_v1';
    var MAX_HISTORY = 100;
    var INVITE_MIN = 8 * 60 * 1000;
    var INVITE_MAX = 30 * 60 * 1000;

    var GAMES = [
        { id: 'gomoku', name: '五子棋', icon: 'fa-th', gradient: 'linear-gradient(135deg,#4A90E2,#3576C8)', desc: '五子连珠 · 先者为胜' },
        { id: 'flight', name: '飞行棋', icon: 'fa-plane', gradient: 'linear-gradient(135deg,#FF9A8B,#FF6B6B)', desc: '掷骰前进 · 先到终点' }
    ];

    var history = [];
    var currentGame = null;
    var inviteTimer = null;
    var gomoku = null;
    var flight = null;
    var overlayEl = null;

    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function getPartnerName() {
        return (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
    }
    function fmtTime(ts) {
        var d = new Date(ts);
        var pad = function (n) { return String(n).padStart(2, '0'); };
        return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    function fmtDur(sec) {
        var m = Math.floor(sec / 60);
        if (m < 1) return sec + '秒';
        if (m < 60) return m + '分钟';
        return Math.floor(m / 60) + '小时' + (m % 60 ? (m % 60) + '分' : '');
    }

    /* ---------- 存储 ---------- */
    function loadHistory() {
        try {
            var raw = localStorage.getItem(HISTORY_KEY);
            if (raw) {
                var arr = JSON.parse(raw);
                if (Array.isArray(arr)) history = arr;
            }
        } catch (e) { history = []; }
    }
    function saveHistory() {
        try {
            if (history.length > MAX_HISTORY) history = history.slice(0, MAX_HISTORY);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch (e) {}
    }
    function addHistory(entry) {
        history.unshift(entry);
        saveHistory();
    }

    function hasActiveSession() {
        try { return localStorage.getItem(SESSION_LOCK_KEY) === '1'; } catch (e) { return false; }
    }
    function lockSession() {
        try { localStorage.setItem(SESSION_LOCK_KEY, '1'); } catch (e) {}
    }
    function unlockSession() {
        try { localStorage.removeItem(SESSION_LOCK_KEY); } catch (e) {}
    }

    /* ========================================================
     * 五子棋
     * ====================================================== */
    function gomokuNew() {
        var SIZE = 15;
        var board = [];
        for (var i = 0; i < SIZE; i++) {
            board[i] = [];
            for (var j = 0; j < SIZE; j++) board[i][j] = 0;
        }
        return {
            size: SIZE,
            board: board,
            myTurn: true, // true=我走，false=Ta走
            over: false,
            winner: null, // 'me' | 'partner' | 'draw'
            startedAt: Date.now(),
            lastMove: null
        };
    }

    function gomokuCheckWin(board, x, y, color) {
        var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        for (var d = 0; d < 4; d++) {
            var c = 1;
            for (var k = 1; k < 5; k++) {
                var nx = x + dirs[d][0] * k, ny = y + dirs[d][1] * k;
                if (nx < 0 || ny < 0 || nx >= 15 || ny >= 15 || board[nx][ny] !== color) break;
                c++;
            }
            for (var k2 = 1; k2 < 5; k2++) {
                var nx2 = x - dirs[d][0] * k2, ny2 = y - dirs[d][1] * k2;
                if (nx2 < 0 || ny2 < 0 || nx2 >= 15 || ny2 >= 15 || board[nx2][ny2] !== color) break;
                c++;
            }
            if (c >= 5) return true;
        }
        return false;
    }

    function gomokuEvaluatePoint(board, x, y, color) {
        var dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
        var score = 0;
        for (var d = 0; d < 4; d++) {
            var count = 1;
            var block = 0;
            for (var k = 1; k < 5; k++) {
                var nx = x + dirs[d][0] * k, ny = y + dirs[d][1] * k;
                if (nx < 0 || ny < 0 || nx >= 15 || ny >= 15) { block++; break; }
                if (board[nx][ny] === color) count++;
                else if (board[nx][ny] === 0) break;
                else { block++; break; }
            }
            for (var k2 = 1; k2 < 5; k2++) {
                var nx2 = x - dirs[d][0] * k2, ny2 = y - dirs[d][1] * k2;
                if (nx2 < 0 || ny2 < 0 || nx2 >= 15 || ny2 >= 15) { block++; break; }
                if (board[nx2][ny2] === color) count++;
                else if (board[nx2][ny2] === 0) break;
                else { block++; break; }
            }
            if (count >= 5) score += 100000;
            else if (count === 4) score += block === 0 ? 10000 : (block === 1 ? 1000 : 0);
            else if (count === 3) score += block === 0 ? 1000 : (block === 1 ? 100 : 0);
            else if (count === 2) score += block === 0 ? 100 : (block === 1 ? 10 : 0);
        }
        return score;
    }

    function gomokuAI(state) {
        var board = state.board;
        var best = null;
        var bestScore = -Infinity;
        // 第一步：下中心
        var hasPiece = false;
        for (var i = 0; i < 15; i++) for (var j = 0; j < 15; j++) if (board[i][j] !== 0) hasPiece = true;
        if (!hasPiece) return { x: 7, y: 7 };

        for (var i = 0; i < 15; i++) {
            for (var j = 0; j < 15; j++) {
                if (board[i][j] !== 0) continue;
                // 邻域内无子则跳过，加速
                var near = false;
                for (var dx = -2; dx <= 2; dx++) {
                    for (var dy = -2; dy <= 2; dy++) {
                        var nx = i + dx, ny = j + dy;
                        if (nx < 0 || ny < 0 || nx >= 15 || ny >= 15) continue;
                        if (board[nx][ny] !== 0) { near = true; break; }
                    }
                    if (near) break;
                }
                if (!near) continue;

                var aiScore = gomokuEvaluatePoint(board, i, j, 2); // 2 = Ta
                var humanScore = gomokuEvaluatePoint(board, i, j, 1); // 1 = 我
                var total = aiScore * 1.1 + humanScore;
                if (total > bestScore) {
                    bestScore = total;
                    best = { x: i, y: j };
                }
            }
        }
        return best || { x: 7, y: 7 };
    }

    function renderGomoku() {
        if (!gomoku || !overlayEl) return;
        var wrap = overlayEl.querySelector('#gc-body');
        var status = overlayEl.querySelector('#gc-status');
        var s = gomoku;

        // 状态文本
        if (s.over) {
            if (s.winner === 'me') status.innerHTML = '<span style="color:#4caf50;">你赢了 ✦</span>';
            else if (s.winner === 'partner') status.innerHTML = '<span style="color:#e05555;">' + esc(getPartnerName()) + ' 赢了</span>';
            else status.textContent = '平局';
        } else {
            status.textContent = s.myTurn ? '轮到你了 ●' : esc(getPartnerName()) + ' 正在思考…';
        }

        // 棋盘（15x15 网格，用 CSS Grid 渲染）
        var cellSize = 'calc(100% / 15)';
        var html = '<div class="gc-gomoku-board">';
        for (var i = 0; i < 15; i++) {
            for (var j = 0; j < 15; j++) {
                var v = s.board[i][j];
                var cls = 'gc-gm-cell';
                if (v === 1) cls += ' gm-me';
                else if (v === 2) cls += ' gm-ai';
                html += '<div class="' + cls + '" data-x="' + i + '" data-y="' + j + '"></div>';
            }
        }
        html += '</div>';
        wrap.innerHTML = html;

        if (s.over) return;

        wrap.querySelectorAll('.gc-gm-cell').forEach(function (cell) {
            cell.addEventListener('click', function () {
                if (!gomoku.myTurn || gomoku.over) return;
                var x = parseInt(cell.dataset.x, 10);
                var y = parseInt(cell.dataset.y, 10);
                if (gomoku.board[x][y] !== 0) return;

                // 我走
                gomoku.board[x][y] = 1;
                gomoku.lastMove = { x: x, y: y };
                renderGomoku();
                try { if (typeof playSound === 'function') playSound('send'); } catch (e) {}

                if (gomokuCheckWin(gomoku.board, x, y, 1)) {
                    gomoku.over = true;
                    gomoku.winner = 'me';
                    renderGomoku();
                    finishGame('me');
                    return;
                }
                if (isBoardFull(gomoku.board)) {
                    gomoku.over = true;
                    gomoku.winner = 'draw';
                    renderGomoku();
                    finishGame('draw');
                    return;
                }

                gomoku.myTurn = false;
                renderGomoku();

                // AI 走
                setTimeout(function () {
                    if (gomoku.over) return;
                    var mv = gomokuAI(gomoku);
                    if (!mv) return;
                    gomoku.board[mv.x][mv.y] = 2;
                    gomoku.lastMove = mv;
                    renderGomoku();
                    try { if (typeof playSound === 'function') playSound('partner_message'); } catch (e) {}

                    if (gomokuCheckWin(gomoku.board, mv.x, mv.y, 2)) {
                        gomoku.over = true;
                        gomoku.winner = 'partner';
                        renderGomoku();
                        finishGame('partner');
                        return;
                    }
                    if (isBoardFull(gomoku.board)) {
                        gomoku.over = true;
                        gomoku.winner = 'draw';
                        renderGomoku();
                        finishGame('draw');
                        return;
                    }
                    gomoku.myTurn = true;
                    renderGomoku();
                }, 500 + Math.random() * 600);
            });
        });
    }

    function isBoardFull(board) {
        for (var i = 0; i < 15; i++) for (var j = 0; j < 15; j++) if (board[i][j] === 0) return false;
        return true;
    }

    /* ========================================================
     * 飞行棋（简化：30 格跑道 + 骰子）
     * ====================================================== */
    var FLIGHT_LEN = 30;
    // 特殊格：5,12,20,27 幸运 +3；8,16,24 倒霉 -2；10,19 再走一次
    function flightNew() {
        return {
            myPos: 0,
            aiPos: 0,
            myTurn: true,
            over: false,
            winner: null,
            startedAt: Date.now(),
            log: [],
            rolling: false
        };
    }

    function flightSpecial(pos) {
        if ([5, 12, 20, 27].indexOf(pos) >= 0) return { type: 'lucky', delta: 3, label: '幸运 +3' };
        if ([8, 16, 24].indexOf(pos) >= 0) return { type: 'bad', delta: -2, label: '倒霉 -2' };
        if ([10, 19].indexOf(pos) >= 0) return { type: 'again', delta: 0, label: '再走一次' };
        return null;
    }

    function renderFlight() {
        if (!flight || !overlayEl) return;
        var wrap = overlayEl.querySelector('#gc-body');
        var status = overlayEl.querySelector('#gc-status');
        var s = flight;

        if (s.over) {
            if (s.winner === 'me') status.innerHTML = '<span style="color:#4caf50;">你赢了 ✦</span>';
            else if (s.winner === 'partner') status.innerHTML = '<span style="color:#e05555;">' + esc(getPartnerName()) + ' 赢了</span>';
            else status.textContent = '平局';
        } else {
            status.textContent = s.myTurn ? '轮到你掷骰子 🎲' : esc(getPartnerName()) + ' 正在掷…';
        }

        var cellPct = 100 / FLIGHT_LEN;
        var html = '<div class="gc-flight-track">';
        for (var i = 0; i < FLIGHT_LEN; i++) {
            var cls = 'gc-flight-cell';
            var sp = flightSpecial(i);
            if (sp) cls += ' ' + sp.type;
            if (i === FLIGHT_LEN - 1) cls += ' finish';
            var label = i + 1;
            if (sp) label = sp.type === 'lucky' ? '✦' : sp.type === 'bad' ? '⚠' : '↻';
            if (i === FLIGHT_LEN - 1) label = '🏁';
            html += '<div class="' + cls + '" title="' + (sp ? sp.label : '第 ' + (i + 1) + ' 格') + '">' + label + '</div>';
        }
        html += '<div class="gc-flight-marker gc-mk-me" style="left:calc(' + (s.myPos * cellPct) + '% + ' + (cellPct / 2) + '%);"></div>';
        html += '<div class="gc-flight-marker gc-mk-ai" style="left:calc(' + (s.aiPos * cellPct) + '% + ' + (cellPct / 2) + '%);"></div>';
        html += '</div>';

        // 骰子按钮
        if (!s.over) {
            html += '<div class="gc-flight-controls">';
            html += '<button class="gc-dice-btn" id="gc-roll-btn"' + (s.myTurn && !s.rolling ? '' : ' disabled') + '>🎲 掷骰子</button>';
            html += '</div>';
        }

        // 日志
        if (s.log.length) {
            html += '<div class="gc-flight-log">';
            s.log.slice(-5).forEach(function (l) { html += '<div>' + esc(l) + '</div>'; });
            html += '</div>';
        }

        wrap.innerHTML = html;

        var rollBtn = wrap.querySelector('#gc-roll-btn');
        if (rollBtn) rollBtn.addEventListener('click', flightRoll);
    }

    function flightRoll() {
        if (!flight || flight.over || !flight.myTurn || flight.rolling) return;
        flight.rolling = true;
        var dice = Math.floor(Math.random() * 6) + 1;
        flight.log.push('你掷出 ' + dice);
        var newPos = Math.min(FLIGHT_LEN - 1, flight.myPos + dice);
        flight.myPos = newPos;
        // 特殊格
        var sp = flightSpecial(newPos);
        if (sp && newPos < FLIGHT_LEN - 1) {
            if (sp.type === 'lucky') { flight.myPos = Math.min(FLIGHT_LEN - 1, newPos + sp.delta); flight.log.push('✦ 幸运格，前进 ' + sp.delta); }
            else if (sp.type === 'bad') { flight.myPos = Math.max(0, newPos + sp.delta); flight.log.push('⚠ 倒霉格，后退 ' + Math.abs(sp.delta)); }
            else { flight.log.push('↻ 再走一次'); }
        }
        renderFlight();
        try { if (typeof playSound === 'function') playSound('send'); } catch (e) {}

        if (flight.myPos >= FLIGHT_LEN - 1) {
            flight.over = true;
            flight.winner = 'me';
            renderFlight();
            finishGame('me');
            return;
        }

        // 再走一次
        if (sp && sp.type === 'again') {
            flight.rolling = false;
            renderFlight();
            return;
        }

        // AI 回合
        setTimeout(function () {
            if (flight.over) return;
            flight.myTurn = false;
            renderFlight();
            setTimeout(function () {
                if (flight.over) return;
                var d = Math.floor(Math.random() * 6) + 1;
                flight.log.push(getPartnerName() + ' 掷出 ' + d);
                var aiPos = Math.min(FLIGHT_LEN - 1, flight.aiPos + d);
                flight.aiPos = aiPos;
                var sp2 = flightSpecial(aiPos);
                if (sp2 && aiPos < FLIGHT_LEN - 1) {
                    if (sp2.type === 'lucky') { flight.aiPos = Math.min(FLIGHT_LEN - 1, aiPos + sp2.delta); flight.log.push('✦ ' + getPartnerName() + ' 幸运前进 ' + sp2.delta); }
                    else if (sp2.type === 'bad') { flight.aiPos = Math.max(0, aiPos + sp2.delta); flight.log.push('⚠ ' + getPartnerName() + ' 倒霉后退 ' + Math.abs(sp2.delta)); }
                    else { flight.log.push('↻ ' + getPartnerName() + ' 再走一次'); }
                }
                renderFlight();
                try { if (typeof playSound === 'function') playSound('partner_message'); } catch (e) {}

                if (flight.aiPos >= FLIGHT_LEN - 1) {
                    flight.over = true;
                    flight.winner = 'partner';
                    renderFlight();
                    finishGame('partner');
                    return;
                }

                if (sp2 && sp2.type === 'again') {
                    // AI 再走一次
                    flight.myTurn = false;
                    flight.rolling = false;
                    renderFlight();
                    setTimeout(flightRoll.bind(null), 100); // 递归模拟
                    // 但 flightRoll 里第一行会检查 myTurn
                    // 这里直接下一轮
                    return;
                }

                flight.myTurn = true;
                flight.rolling = false;
                renderFlight();
            }, 600 + Math.random() * 800);
        }, 400);
    }

    /* ========================================================
     * 通用：开始 / 结束对局
     * ====================================================== */
    function startGame(gameId) {
        if (hasActiveSession()) {
            if (typeof showNotification === 'function') showNotification('当前有对局进行中', 'warning');
            return;
        }
        var meta = GAMES.find(function (g) { return g.id === gameId; });
        if (!meta) return;

        lockSession();
        currentGame = { type: gameId, partnerName: getPartnerName(), startedAt: Date.now() };

        if (gameId === 'gomoku') gomoku = gomokuNew();
        else if (gameId === 'flight') flight = flightNew();

        openGameOverlay(meta);
    }

    function finishGame(result) {
        if (!currentGame) return;
        var dur = Math.floor((Date.now() - currentGame.startedAt) / 1000);
        addHistory({
            id: Date.now(),
            gameType: currentGame.type,
            gameName: (GAMES.find(function (g) { return g.id === currentGame.type; }) || {}).name || currentGame.type,
            partnerName: currentGame.partnerName,
            result: result, // 'me' | 'partner' | 'draw'
            duration: dur,
            timestamp: Date.now()
        });
        unlockSession();
        currentGame = null;
        // 通知
        var rText = result === 'me' ? '你赢了' : result === 'partner' ? getPartnerName() + ' 赢了' : '平局';
        if (typeof showNotification === 'function') {
            showNotification('对局结束 · ' + rText + ' · 用时 ' + fmtDur(dur), result === 'me' ? 'success' : 'info', 3500);
        }
        // 刷新历史区
        var histEl = document.getElementById('gc-history-list');
        if (histEl) renderHistoryList(histEl);
    }

    function exitCurrentGame() {
        if (!currentGame) { closeOverlay(); return; }
        if (!confirm('确定退出对局？本次对局不会记入历史。')) return;
        unlockSession();
        currentGame = null;
        gomoku = null;
        flight = null;
        closeOverlay();
    }

    /* ========================================================
     * 覆盖层：对局界面
     * ====================================================== */
    function ensureOverlay() {
        if (overlayEl) return overlayEl;
        overlayEl = document.createElement('div');
        overlayEl.id = 'gc-overlay';
        overlayEl.className = 'gc-overlay';
        overlayEl.style.display = 'none';
        overlayEl.innerHTML =
            '<div class="gc-overlay-inner">' +
              '<div class="gc-overlay-head">' +
                '<button class="gc-head-btn" id="gc-exit-btn" title="退出对局"><i class="fas fa-arrow-left"></i></button>' +
                '<div class="gc-head-info">' +
                  '<div class="gc-head-title" id="gc-title">对局</div>' +
                  '<div class="gc-head-sub" id="gc-status">准备中…</div>' +
                '</div>' +
                '<div class="gc-head-actions">' +
                  '<button class="gc-head-btn" id="gc-restart-btn" title="重开"><i class="fas fa-redo"></i></button>' +
                '</div>' +
              '</div>' +
              '<div class="gc-body" id="gc-body"></div>' +
            '</div>';
        document.body.appendChild(overlayEl);

        overlayEl.querySelector('#gc-exit-btn').addEventListener('click', exitCurrentGame);
        overlayEl.querySelector('#gc-restart-btn').addEventListener('click', function () {
            if (!currentGame) return;
            if (!confirm('重开这一局？当前进度将丢失。')) return;
            if (currentGame.type === 'gomoku') gomoku = gomokuNew();
            else if (currentGame.type === 'flight') flight = flightNew();
            currentGame.startedAt = Date.now();
            renderCurrentGame();
        });
        return overlayEl;
    }

    function openGameOverlay(meta) {
        var el = ensureOverlay();
        el.querySelector('#gc-title').textContent = meta.name;
        el.style.display = 'flex';
        el.classList.add('visible');
        renderCurrentGame();
    }

    function renderCurrentGame() {
        if (!currentGame) return;
        if (currentGame.type === 'gomoku') renderGomoku();
        else if (currentGame.type === 'flight') renderFlight();
    }

    function closeOverlay() {
        if (overlayEl) {
            overlayEl.style.display = 'none';
            overlayEl.classList.remove('visible');
        }
    }

    /* ========================================================
     * 游戏中心列表
     * ====================================================== */
    function renderGameCenter(container) {
        if (!container) return;
        var locked = hasActiveSession();

        var gamesHtml = GAMES.map(function (g) {
            return '' +
                '<div class="gc-game-card" data-game-id="' + g.id + '">' +
                  '<div class="gc-game-icon" style="background:' + g.gradient + ';">' +
                    '<i class="fas ' + g.icon + '"></i>' +
                  '</div>' +
                  '<div class="gc-game-info">' +
                    '<div class="gc-game-name">' + esc(g.name) + '</div>' +
                    '<div class="gc-game-desc">' + esc(g.desc) + '</div>' +
                  '</div>' +
                  '<button class="gc-play-btn"' + (locked ? ' disabled' : '') + '>' +
                    '<i class="fas fa-play"></i> 开始' +
                  '</button>' +
                '</div>';
        }).join('');

        var historyHtml = '';
        if (history.length === 0) {
            historyHtml = '<div class="gc-history-empty">还没有对局记录<br>赢了 Ta 或输了都会被记下 ✦</div>';
        } else {
            historyHtml = history.slice(0, 30).map(function (h) {
                var resultText = h.result === 'me' ? '胜' : h.result === 'partner' ? '负' : '平';
                var resultCls = h.result === 'me' ? 'gc-res-win' : h.result === 'partner' ? 'gc-res-lose' : 'gc-res-draw';
                return '' +
                    '<div class="gc-history-item">' +
                      '<div class="gc-history-result ' + resultCls + '">' + resultText + '</div>' +
                      '<div class="gc-history-info">' +
                        '<div class="gc-history-game">' + esc(h.gameName) + '</div>' +
                        '<div class="gc-history-meta">对手：' + esc(h.partnerName) + ' · ' + fmtDur(h.duration) + '</div>' +
                      '</div>' +
                      '<div class="gc-history-time">' + fmtTime(h.timestamp) + '</div>' +
                    '</div>';
            }).join('');
        }

        container.innerHTML =
            '<div class="gc-section-title">✦ 小游戏</div>' +
            '<div class="gc-games-list">' + gamesHtml + '</div>' +
            '<div class="gc-section-title" style="margin-top:18px;">✦ 对局记录</div>' +
            '<div class="gc-history-list" id="gc-history-list">' + historyHtml + '</div>';

        container.querySelectorAll('.gc-game-card').forEach(function (card) {
            var btn = card.querySelector('.gc-play-btn');
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (btn.disabled) {
                    if (typeof showNotification === 'function') showNotification('当前有对局进行中', 'warning');
                    return;
                }
                startGame(card.dataset.gameId);
            });
        });
    }

    function renderHistoryList(el) {
        if (!el) return;
        if (history.length === 0) {
            el.innerHTML = '<div class="gc-history-empty">还没有对局记录</div>';
            return;
        }
        el.innerHTML = history.slice(0, 30).map(function (h) {
            var resultText = h.result === 'me' ? '胜' : h.result === 'partner' ? '负' : '平';
            var resultCls = h.result === 'me' ? 'gc-res-win' : h.result === 'partner' ? 'gc-res-lose' : 'gc-res-draw';
            return '' +
                '<div class="gc-history-item">' +
                  '<div class="gc-history-result ' + resultCls + '">' + resultText + '</div>' +
                  '<div class="gc-history-info">' +
                    '<div class="gc-history-game">' + esc(h.gameName) + '</div>' +
                    '<div class="gc-history-meta">对手：' + esc(h.partnerName) + ' · ' + fmtDur(h.duration) + '</div>' +
                  '</div>' +
                  '<div class="gc-history-time">' + fmtTime(h.timestamp) + '</div>' +
                '</div>';
        }).join('');
    }

    /* ========================================================
     * Ta 邀请我玩
     * ====================================================== */
    function schedulePartnerInvite() {
        if (inviteTimer) clearTimeout(inviteTimer);
        var delay = INVITE_MIN + Math.random() * (INVITE_MAX - INVITE_MIN);
        inviteTimer = setTimeout(function () {
            if (document.hidden) { schedulePartnerInvite(); return; }
            // 已有对局进行中 → 跳过
            if (hasActiveSession()) { schedulePartnerInvite(); return; }
            // 20% 概率发起邀请
            if (Math.random() > 0.2) { schedulePartnerInvite(); return; }
            showInvitePopup();
            schedulePartnerInvite();
        }, delay);
    }

    function showInvitePopup() {
        if (document.getElementById('gc-invite-popup')) return;
        var game = GAMES[Math.floor(Math.random() * GAMES.length)];
        var partnerName = getPartnerName();
        var popup = document.createElement('div');
        popup.id = 'gc-invite-popup';
        popup.className = 'gc-invite-popup';
        popup.innerHTML =
            '<div class="gc-invite-head">' +
              '<div class="gc-invite-icon" style="background:' + game.gradient + ';">' +
                '<i class="fas ' + game.icon + '"></i>' +
              '</div>' +
              '<div style="flex:1;min-width:0;">' +
                '<div class="gc-invite-title">' + esc(partnerName) + ' 邀请你玩「' + esc(game.name) + '」</div>' +
                '<div class="gc-invite-sub">' + esc(game.desc) + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="gc-invite-actions">' +
              '<button class="gc-invite-btn ghost" data-act="reject">婉拒</button>' +
              '<button class="gc-invite-btn primary" data-act="accept">接受</button>' +
            '</div>';
        document.body.appendChild(popup);

        popup.querySelector('[data-act="reject"]').addEventListener('click', function () {
            popup.remove();
            if (typeof showNotification === 'function') showNotification('已婉拒邀请', 'info', 1800);
        });
        popup.querySelector('[data-act="accept"]').addEventListener('click', function () {
            popup.remove();
            startGame(game.id);
        });

        setTimeout(function () { if (popup.parentNode) popup.remove(); }, 20000);
    }

    /* ========================================================
     * 初始化
     * ====================================================== */
    function init() {
        loadHistory();
        schedulePartnerInvite();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 800); });
    } else {
        setTimeout(init, 800);
    }

    window.gameCenter = {
        render: renderGameCenter,
        start: startGame,
        hasActiveSession: hasActiveSession,
        getHistory: function () { return history; }
    };
})();