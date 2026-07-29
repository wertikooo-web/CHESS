// ==================== STATE ====================
let board = [];
let currentPlayer = 'white';
let selected = null;
let moveHistory = [];
let capturedWhite = [];
let capturedBlack = [];
let gameMode = 'ai';          // 'ai' | 'pvp'
let playerColor = 'white';
let aiDifficulty = 2;
let hintsEnabled = true;
let soundEnabled = true;
let coordsEnabled = true;
let timerEnabled = true;
let animEnabled = true;
let coachEnabled = false;
let gameOver = false;
let lastMove = null; // {fr,fc,tr,tc}
let viewIndex = null; // null = live, number = history index (0-based after that move)
let isAnimating = false;

// Timer
let timeWhite = 600; // 10 min
let timeBlack = 600;
let timerInterval = null;
let lastTick = Date.now();

// Castling & en-passant flags
let castling = { whiteK: true, whiteQ: true, blackK: true, blackQ: true };
let enPassant = null; // {row, col} or null

const PIECES = {
    K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙',
    k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟'
};
const FILES = 'abcdefgh';

// Compact SVG chess pieces (stable cross-OS)
function createPieceEl(piece) {
    const isWhite = piece === piece.toUpperCase();
    // Always use filled "white" Unicode glyphs — color comes from CSS
    // (black glyphs often render as outlines on Windows and look tiny/ugly)
    const glyphs = {
        k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
        K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟'
    };
    const el = document.createElement('span');
    el.className = 'piece ' + (isWhite ? 'piece-white' : 'piece-black');
    el.textContent = glyphs[piece.toLowerCase()] || glyphs[piece] || piece;
    return el;
}

const MAX_DEPTH = { 1: 1, 2: 3, 3: 4, 4: 5 };

// Piece-square tables (from white's perspective, row 0 = rank 8)
const PST = {
  p: [
    [0,0,0,0,0,0,0,0],
    [50,50,50,50,50,50,50,50],
    [10,10,20,30,30,20,10,10],
    [5,5,10,25,25,10,5,5],
    [0,0,0,20,20,0,0,0],
    [5,-5,-10,0,0,-10,-5,5],
    [5,10,10,-20,-20,10,10,5],
    [0,0,0,0,0,0,0,0]
  ],
  n: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,0,0,0,0,-20,-40],
    [-30,0,10,15,15,10,0,-30],
    [-30,5,15,20,20,15,5,-30],
    [-30,0,15,20,20,15,0,-30],
    [-30,5,10,15,15,10,5,-30],
    [-40,-20,0,5,5,0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50]
  ],
  b: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,0,0,0,0,0,0,-10],
    [-10,0,10,10,10,10,0,-10],
    [-10,5,5,10,10,5,5,-10],
    [-10,0,5,10,10,5,0,-10],
    [-10,5,5,5,5,5,5,-10],
    [-10,0,5,0,0,5,0,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20]
  ],
  r: [
    [0,0,0,0,0,0,0,0],
    [5,10,10,10,10,10,10,5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [0,0,0,5,5,0,0,0]
  ],
  q: [
    [-20,-10,-10,-5,-5,-10,-10,-20],
    [-10,0,0,0,0,0,0,-10],
    [-10,0,5,5,5,5,0,-10],
    [-5,0,5,5,5,5,0,-5],
    [0,0,5,5,5,5,0,-5],
    [-10,5,5,5,5,5,0,-10],
    [-10,0,5,0,0,0,0,-10],
    [-20,-10,-10,-5,-5,-10,-10,-20]
  ],
  k: [
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-30,-40,-40,-50,-50,-40,-40,-30],
    [-20,-30,-30,-40,-40,-30,-30,-20],
    [-10,-20,-20,-20,-20,-20,-20,-10],
    [20,20,0,0,0,0,20,20],
    [20,30,10,0,0,10,30,20]
  ]
};
const PIECE_VAL = { p:100, n:320, b:330, r:500, q:900, k:20000 };

// ==================== AUDIO (Web Audio API) ====================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, duration, type='sine', vol=0.15) {
    if (!soundEnabled) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
}

function soundMove() { playTone(440, 0.08, 'triangle', 0.1); }
function soundCapture() { playTone(220, 0.15, 'square', 0.12); playTone(330, 0.1, 'square', 0.08); }
function soundCheck() { playTone(660, 0.12); setTimeout(() => playTone(880, 0.15), 100); }
function soundMate() {
    if (!soundEnabled) return;
    // Victory fanfare ~8 seconds (Web Audio, no external files)
    try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
    const t0 = audioCtx.currentTime;
    // Melody inspired by a short triumphant fanfare (C major-ish)
    // format: [freq Hz, start sec, duration sec, type, volume]
    const notes = [
        [523.25, 0.00, 0.35, 'sine', 0.18],   // C5
        [659.25, 0.30, 0.35, 'sine', 0.18],   // E5
        [783.99, 0.60, 0.40, 'sine', 0.20],   // G5
        [1046.5, 1.00, 0.55, 'sine', 0.22],   // C6
        [783.99, 1.55, 0.25, 'triangle', 0.16],
        [880.00, 1.80, 0.25, 'triangle', 0.16],
        [987.77, 2.05, 0.30, 'triangle', 0.18],
        [1046.5, 2.35, 0.50, 'sine', 0.22],
        [1318.5, 2.85, 0.45, 'sine', 0.20],   // E6
        [1046.5, 3.30, 0.35, 'sine', 0.18],
        [1174.7, 3.65, 0.35, 'sine', 0.18],
        [1318.5, 4.00, 0.55, 'sine', 0.22],
        [1568.0, 4.55, 0.60, 'sine', 0.20],   // G6
        [1318.5, 5.15, 0.30, 'triangle', 0.16],
        [1174.7, 5.45, 0.30, 'triangle', 0.16],
        [1046.5, 5.75, 0.70, 'sine', 0.24],   // hold C6
        [783.99, 6.40, 0.40, 'sine', 0.16],
        [659.25, 6.75, 0.40, 'sine', 0.14],
        [523.25, 7.10, 0.85, 'sine', 0.20],   // final C5
    ];
    notes.forEach(([freq, start, dur, type, vol]) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        const s = t0 + start;
        gain.gain.setValueAtTime(0.001, s);
        gain.gain.linearRampToValueAtTime(vol, s + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, s + dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(s);
        osc.stop(s + dur + 0.05);
    });
    // Soft chord pad underneath
    [[261.63, 0.15], [329.63, 0.12], [392.00, 0.12]].forEach(([freq, vol], i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.001, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + 0.5);
        gain.gain.setValueAtTime(vol, t0 + 6.5);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 8.0);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(t0);
        osc.stop(t0 + 8.1);
    });
}

function getWinMessage(winningColor) {
    // winningColor = side that delivered mate (opposite of currentPlayer in checkmate)
    if (gameMode === 'ai') {
        if (winningColor === playerColor) {
            return '🎉 Поздравляю, ты выиграл!';
        }
        return '🤖 ИИ выиграл!';
    }
    // Two players
    if (winningColor === 'white') return '🎉 Победа белых!';
    return '🎉 Победа чёрных!';
}
function soundPromote() { playTone(523, 0.1); setTimeout(() => playTone(784, 0.15), 80); }

// ==================== INIT ====================
function initBoard() {
    board = [
        ['r','n','b','q','k','b','n','r'],
        ['p','p','p','p','p','p','p','p'],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['','','','','','','',''],
        ['P','P','P','P','P','P','P','P'],
        ['R','N','B','Q','K','B','N','R']
    ];
    currentPlayer = 'white';
    selected = null;
    moveHistory = [];
    capturedWhite = [];
    capturedBlack = [];
    castling = { whiteK: true, whiteQ: true, blackK: true, blackQ: true };
    enPassant = null;
    gameOver = false;
    lastMove = null;
    viewIndex = null;
    timeWhite = 600;
    timeBlack = 600;
    const coach = document.getElementById('coach');
    if (coach) { coach.textContent = ''; coach.className = 'coach'; }
    const btn = document.getElementById('btn-live');
    if (btn) btn.style.display = 'none';
    const an = document.getElementById('analysis');
    if (an) an.innerHTML = 'Нажмите «Анализ» после партии';
    updateTimers();
    stopTimer();
    if (timerEnabled) startTimer();
}

// ==================== RENDER ====================
function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    const flipped = playerColor === 'black';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const row = flipped ? 7 - r : r;
            const col = flipped ? 7 - c : c;
            const sq = document.createElement('div');
            sq.className = 'square ' + ((row + col) % 2 === 0 ? 'light' : 'dark');
            sq.dataset.row = row;
            sq.dataset.col = col;

            const piece = board[row][col];
            if (piece) {
                sq.appendChild(createPieceEl(piece));
            }
            // last move highlight
            if (lastMove) {
                if (row === lastMove.fr && col === lastMove.fc) sq.classList.add('last-from');
                if (row === lastMove.tr && col === lastMove.tc) sq.classList.add('last-to');
            }
            sq.addEventListener('click', onSquareClick);
            sq.addEventListener('touchstart', onSquareTouch, { passive: false });
            boardEl.appendChild(sq);
        }
    }
    highlightKingInCheck();
    updateStatus();
    updateCaptured();
    updateMoveHistory();
    updateCoords();
}

function updateCoords() {
    const top = document.getElementById('coords-top');
    const bottom = document.getElementById('coords-bottom');
    const left = document.getElementById('coords-left');
    const right = document.getElementById('coords-right');
    const flipped = playerColor === 'black';
    const files = flipped ? 'hgfedcba' : 'abcdefgh';
    const ranks = flipped ? '12345678' : '87654321';

    [top, bottom].forEach(el => {
        el.innerHTML = '';
        el.classList.toggle('coords-hidden', !coordsEnabled);
        for (let f of files) {
            const s = document.createElement('span');
            s.textContent = f;
            el.appendChild(s);
        }
    });
    [left, right].forEach(el => {
        el.innerHTML = '';
        el.classList.toggle('coords-hidden', !coordsEnabled);
        for (let r of ranks) {
            const s = document.createElement('span');
            s.textContent = r;
            el.appendChild(s);
        }
    });
}

function getSquareEl(row, col) {
    return document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
}

function clearHighlights() {
    document.querySelectorAll('.square').forEach(s => {
        s.classList.remove('selected', 'highlight', 'capture', 'hint');
    });
}

function highlightKingInCheck() {
    document.querySelectorAll('.in-check').forEach(e => e.classList.remove('in-check'));
    const color = currentPlayer === 'white' ? 'black' : 'white'; // last mover checked opponent
    // Actually highlight the side that is now to move if in check
    if (isKingInCheck(currentPlayer)) {
        const pos = findKing(currentPlayer);
        if (pos) {
            const el = getSquareEl(pos.row, pos.col);
            if (el) el.classList.add('in-check');
        }
    }
}

// ==================== INTERACTION ====================
let lastTouchTime = 0;

function onSquareClick(e) {
    // Ignore synthetic click after touch (300ms)
    if (Date.now() - lastTouchTime < 400) return;
    if (gameOver) return;
    const row = +e.currentTarget.dataset.row;
    const col = +e.currentTarget.dataset.col;
    handleClick(row, col);
}

function onSquareTouch(e) {
    e.preventDefault();
    lastTouchTime = Date.now();
    if (gameOver) return;
    const row = +e.currentTarget.dataset.row;
    const col = +e.currentTarget.dataset.col;
    handleClick(row, col);
}

function handleClick(row, col) {
    if (viewIndex !== null) {
        alert('Сейчас просмотр истории. Нажмите «К партии» чтобы продолжить.');
        return;
    }
    if (isAnimating) return;
    // If AI turn and mode ai — ignore
    if (gameMode === 'ai' && currentPlayer !== playerColor) return;

    const piece = board[row][col];

    if (selected) {
        if (isValidMove(selected.row, selected.col, row, col) && !leavesKingInCheck(selected.row, selected.col, row, col)) {
            doMove(selected.row, selected.col, row, col);
        } else {
            clearHighlights();
            selected = null;
            if (piece && getColor(piece) === currentPlayer) selectPiece(row, col);
        }
    } else {
        if (piece && getColor(piece) === currentPlayer) selectPiece(row, col);
    }
}

function selectPiece(row, col) {
    selected = { row, col };
    clearHighlights();
    getSquareEl(row, col)?.classList.add('selected');
    if (hintsEnabled) {
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if (isValidMove(row, col, r, c) && !leavesKingInCheck(row, col, r, c)) {
                    const el = getSquareEl(r, c);
                    if (el) el.classList.add(board[r][c] ? 'capture' : 'highlight');
                }
            }
        }
    }
}

// ==================== RULES ====================
function getColor(p) { return p === p.toUpperCase() ? 'white' : 'black'; }

function isPathClear(fr, fc, tr, tc) {
    const dr = Math.sign(tr - fr), dc = Math.sign(tc - fc);
    let r = fr + dr, c = fc + dc;
    while (r !== tr || c !== tc) {
        if (board[r][c]) return false;
        r += dr; c += dc;
    }
    return true;
}

function isValidMove(fr, fc, tr, tc) {
    if (fr === tr && fc === tc) return false;
    const piece = board[fr][fc];
    if (!piece) return false;
    const target = board[tr][tc];
    if (target && getColor(piece) === getColor(target)) return false;

    const type = piece.toLowerCase();
    const color = getColor(piece);
    const dr = tr - fr, dc = tc - fc;

    switch (type) {
        case 'p': return validatePawn(fr, fc, tr, tc, color);
        case 'r': return (fr === tr || fc === tc) && isPathClear(fr, fc, tr, tc);
        case 'n': return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2);
        case 'b': return Math.abs(dr) === Math.abs(dc) && isPathClear(fr, fc, tr, tc);
        case 'q': return ((fr === tr || fc === tc) || Math.abs(dr) === Math.abs(dc)) && isPathClear(fr, fc, tr, tc);
        case 'k': return validateKing(fr, fc, tr, tc, color);
        default: return false;
    }
}

function validatePawn(fr, fc, tr, tc, color) {
    const dir = color === 'white' ? -1 : 1;
    const start = color === 'white' ? 6 : 1;
    const dr = tr - fr, dc = tc - fc;

    if (dc === 0 && !board[tr][tc]) {
        if (dr === dir) return true;
        if (fr === start && dr === 2 * dir && !board[fr + dir][fc]) return true;
    }
    if (Math.abs(dc) === 1 && dr === dir) {
        if (board[tr][tc]) return true;
        // En passant
        if (enPassant && enPassant.row === tr && enPassant.col === tc) return true;
    }
    return false;
}

function validateKing(fr, fc, tr, tc, color) {
    const dr = Math.abs(tr - fr), dc = Math.abs(tc - fc);
    if (dr <= 1 && dc <= 1) return true;

    // Castling
    if (dr === 0 && dc === 2) {
        const isWhite = color === 'white';
        const row = isWhite ? 7 : 0;
        if (fr !== row || fc !== 4) return false;
        if (isKingInCheck(color)) return false;

        if (tc === 6) { // kingside
            if (!(isWhite ? castling.whiteK : castling.blackK)) return false;
            if (board[row][5] || board[row][6]) return false;
            if (squareAttacked(row, 5, color) || squareAttacked(row, 6, color)) return false;
            return true;
        }
        if (tc === 2) { // queenside
            if (!(isWhite ? castling.whiteQ : castling.blackQ)) return false;
            if (board[row][1] || board[row][2] || board[row][3]) return false;
            if (squareAttacked(row, 2, color) || squareAttacked(row, 3, color)) return false;
            return true;
        }
    }
    return false;
}

function squareAttacked(row, col, byColor) {
    const enemy = byColor === 'white' ? 'black' : 'white';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && getColor(p) === enemy && isValidMove(r, c, row, col)) return true;
        }
    }
    return false;
}

function findKing(color) {
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && getColor(p) === color && p.toLowerCase() === 'k') return { row: r, col: c };
        }
    return null;
}

function isKingInCheck(color) {
    const k = findKing(color);
    if (!k) return true;
    return squareAttacked(k.row, k.col, color);
}

function leavesKingInCheck(fr, fc, tr, tc) {
    const piece = board[fr][fc];
    const captured = board[tr][tc];
    // Handle en passant capture for check test
    let epCaptured = null, epRow = -1;
    if (piece.toLowerCase() === 'p' && !captured && enPassant && tr === enPassant.row && tc === enPassant.col) {
        epRow = piece === 'P' ? tr + 1 : tr - 1;
        epCaptured = board[epRow][tc];
        board[epRow][tc] = '';
    }
    board[tr][tc] = piece;
    board[fr][fc] = '';
    // Castling rook move for check test
    let rookFrom = null, rookTo = null, rookPiece = null;
    if (piece.toLowerCase() === 'k' && Math.abs(tc - fc) === 2) {
        const row = fr;
        if (tc === 6) { rookFrom = 7; rookTo = 5; }
        else { rookFrom = 0; rookTo = 3; }
        rookPiece = board[row][rookFrom];
        board[row][rookTo] = rookPiece;
        board[row][rookFrom] = '';
    }

    const inCheck = isKingInCheck(getColor(piece));

    // Undo
    board[fr][fc] = piece;
    board[tr][tc] = captured;
    if (epCaptured) board[epRow][tc] = epCaptured;
    if (rookFrom !== null) {
        board[fr][rookFrom] = rookPiece;
        board[fr][rookTo] = '';
    }
    return inCheck;
}

function isCheckmate(color) {
    if (!isKingInCheck(color)) return false;
    return !hasLegalMoves(color);
}

function isStalemate(color) {
    if (isKingInCheck(color)) return false;
    return !hasLegalMoves(color);
}

function hasLegalMoves(color) {
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && getColor(p) === color) {
                for (let tr = 0; tr < 8; tr++)
                    for (let tc = 0; tc < 8; tc++) {
                        if (isValidMove(r, c, tr, tc) && !leavesKingInCheck(r, c, tr, tc))
                            return true;
                    }
            }
        }
    return false;
}

// ==================== MOVE ====================
function doMove(fr, fc, tr, tc, isAI = false) {
    const piece = board[fr][fc];
    let captured = board[tr][tc];
    let special = null;

    // En passant capture
    if (piece.toLowerCase() === 'p' && !captured && enPassant && tr === enPassant.row && tc === enPassant.col) {
        const epRow = piece === 'P' ? tr + 1 : tr - 1;
        captured = board[epRow][tc];
        board[epRow][tc] = '';
        special = 'ep';
    }

    // Castling
    if (piece.toLowerCase() === 'k' && Math.abs(tc - fc) === 2) {
        const row = fr;
        if (tc === 6) {
            board[row][5] = board[row][7];
            board[row][7] = '';
            special = 'O-O';
        } else {
            board[row][3] = board[row][0];
            board[row][0] = '';
            special = 'O-O-O';
        }
    }

    // Update castling rights
    if (piece === 'K') { castling.whiteK = false; castling.whiteQ = false; }
    if (piece === 'k') { castling.blackK = false; castling.blackQ = false; }
    if (piece === 'R' && fr === 7 && fc === 0) castling.whiteQ = false;
    if (piece === 'R' && fr === 7 && fc === 7) castling.whiteK = false;
    if (piece === 'r' && fr === 0 && fc === 0) castling.blackQ = false;
    if (piece === 'r' && fr === 0 && fc === 7) castling.blackK = false;
    if (captured === 'R' && tr === 7 && tc === 0) castling.whiteQ = false;
    if (captured === 'R' && tr === 7 && tc === 7) castling.whiteK = false;
    if (captured === 'r' && tr === 0 && tc === 0) castling.blackQ = false;
    if (captured === 'r' && tr === 0 && tc === 7) castling.blackK = false;

    // En passant target
    enPassant = null;
    if (piece.toLowerCase() === 'p' && Math.abs(tr - fr) === 2) {
        enPassant = { row: (fr + tr) / 2, col: fc };
    }

    // Promotion
    let promoted = false;
    if (piece.toLowerCase() === 'p' && (tr === 0 || tr === 7)) {
        board[tr][tc] = piece === 'P' ? 'Q' : 'q';
        promoted = true;
        soundPromote();
    } else {
        board[tr][tc] = piece;
    }
    board[fr][fc] = '';

    if (captured) {
        if (getColor(captured) === 'white') capturedWhite.push(captured);
        else capturedBlack.push(captured);
        soundCapture();
    } else if (!promoted) {
        soundMove();
    }

    const notation = toNotation(fr, fc, tr, tc, piece, captured, special, promoted);
    moveHistory.push({
        fr, fc, tr, tc, piece, captured, special, promoted,
        notation, castling: { ...castling }, enPassant: enPassant ? { ...enPassant } : null
    });

    selected = null;
    clearHighlights();
    lastMove = { fr, fc, tr, tc };
    viewIndex = null;
    currentPlayer = currentPlayer === 'white' ? 'black' : 'white';

    const finish = () => {
        renderBoard();
        checkGameStatus();
        if (!isAI && coachEnabled && !gameOver) {
            setTimeout(() => showCoachTip(fr, fc, tr, tc, piece, captured), 50);
        }
        if (!gameOver && gameMode === 'ai' && currentPlayer !== playerColor) {
            setTimeout(makeAIMove, animEnabled ? 400 : 250);
        }
    };

    if (animEnabled && !isAI) {
        animateMove(fr, fc, tr, tc, piece, finish);
    } else {
        finish();
    }
}

function animateMove(fr, fc, tr, tc, piece, cb) {
    const boardEl = document.getElementById('board');
    if (!boardEl) { cb(); return; }
    const fromEl = getSquareEl(fr, fc);
    const toEl = getSquareEl(tr, tc);
    // board already updated — temporarily hide destination piece and fly ghost
    isAnimating = true;
    const br = boardEl.getBoundingClientRect();
    const sq = br.width / 8;
    const flipped = playerColor === 'black';
    const visFromR = flipped ? 7 - fr : fr;
    const visFromC = flipped ? 7 - fc : fc;
    const visToR = flipped ? 7 - tr : tr;
    const visToC = flipped ? 7 - tc : tc;

    const ghost = document.createElement('div');
    ghost.className = 'anim-piece';
    ghost.style.width = sq + 'px';
    ghost.style.height = sq + 'px';
    ghost.style.left = (visFromC * sq) + 'px';
    ghost.style.top = (visFromR * sq) + 'px';
    ghost.appendChild(createPieceEl(piece));
    boardEl.appendChild(ghost);

    // hide piece on target during anim
    const targetPiece = toEl && toEl.querySelector('.piece');
    if (targetPiece) targetPiece.style.opacity = '0';

    requestAnimationFrame(() => {
        ghost.style.left = (visToC * sq) + 'px';
        ghost.style.top = (visToR * sq) + 'px';
    });
    setTimeout(() => {
        ghost.remove();
        isAnimating = false;
        cb();
    }, 300);
}

function showCoachTip(fr, fc, tr, tc, piece, captured) {
    const el = document.getElementById('coach');
    if (!el) return;
    const tips = [];
    const type = piece.toLowerCase();
    const color = getColor(piece);

    // Capture
    if (captured) tips.push({ t: 'Взятие: хороший обмен проверяйте по ценности фигур', c: 'tip' });

    // Center
    if ([3,4].includes(tr) && [3,4].includes(tc)) tips.push({ t: 'Центр: контроль центральных полей усиливает позицию', c: 'tip' });

    // Development (minor piece leave back rank)
    if ((type === 'n' || type === 'b') && (fr === 0 || fr === 7)) tips.push({ t: 'Развитие: фигура вышла с начальной горизонтали', c: 'tip' });

    // King safety early castle missed - soft tip
    if (type === 'k' && Math.abs(tc - fc) === 2) tips.push({ t: 'Рокировка: король в безопасности', c: 'tip' });

    // Hanging: did we leave a piece attacked and undefended?
    const hang = findHangingPiece(color);
    if (hang) tips.push({ t: 'Внимание: фигура на ' + FILES[hang.col] + (8-hang.row) + ' под боем без защиты', c: 'warn' });

    // Opponent hanging
    const opp = color === 'white' ? 'black' : 'white';
    const oh = findHangingPiece(opp);
    if (oh) tips.push({ t: 'Можно взять: у соперника висит фигура на ' + FILES[oh.col] + (8-oh.row), c: 'tip' });

    if (!tips.length) {
        el.textContent = '';
        el.className = 'coach';
        return;
    }
    const tip = tips[0];
    el.textContent = tip.t;
    el.className = 'coach ' + tip.c;
}

function findHangingPiece(color) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p || getColor(p) !== color || p.toLowerCase() === 'k') continue;
            if (squareAttacked(r, c, color) && !isDefended(r, c, color)) {
                return { row: r, col: c, piece: p };
            }
        }
    }
    return null;
}

function isDefended(row, col, color) {
    // Is any friendly piece attacking this square?
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p || getColor(p) !== color) continue;
            if (r === row && c === col) continue;
            if (isValidMove(r, c, row, col)) return true;
        }
    }
    return false;
}

function toNotation(fr, fc, tr, tc, piece, captured, special, promoted) {
    if (special === 'O-O') return 'O-O';
    if (special === 'O-O-O') return 'O-O-O';
    const from = FILES[fc] + (8 - fr);
    const to = FILES[tc] + (8 - tr);
    let n = piece.toUpperCase() === 'P' ? '' : piece.toUpperCase();
    if (captured) n += (piece.toUpperCase() === 'P' ? FILES[fc] : '') + 'x';
    n += to;
    if (promoted) n += '=Q';
    return n || (from + to);
}

// ==================== AI ====================
function evaluateBoard() {
    // Positive = good for WHITE
    let score = 0;
    let whiteMob = 0, blackMob = 0;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (!p) continue;
            const t = p.toLowerCase();
            const isWhite = p === p.toUpperCase();
            const val = PIECE_VAL[t] || 0;
            const pstRow = isWhite ? r : 7 - r;
            const pst = (PST[t] && PST[t][pstRow]) ? PST[t][pstRow][c] : 0;
            if (isWhite) score += val + pst;
            else score -= val + pst;
        }
    }
    // Small mobility bonus (expensive if full, so skip full calc for speed)
    return score;
}

function orderMoves(moves) {
    // MVV-LVA style: captures first, higher value victims first
    return moves.slice().sort((a, b) => {
        const capA = board[a.tr][a.tc];
        const capB = board[b.tr][b.tc];
        const scoreA = capA ? (PIECE_VAL[capA.toLowerCase()] || 0) * 10 - (PIECE_VAL[(board[a.fr][a.fc] || 'p').toLowerCase()] || 0) : 0;
        const scoreB = capB ? (PIECE_VAL[capB.toLowerCase()] || 0) * 10 - (PIECE_VAL[(board[b.fr][b.fc] || 'p').toLowerCase()] || 0) : 0;
        return scoreB - scoreA;
    });
}

function getAllMoves(color) {
    const moves = [];
    for (let r = 0; r < 8; r++)
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && getColor(p) === color) {
                for (let tr = 0; tr < 8; tr++)
                    for (let tc = 0; tc < 8; tc++) {
                        if (isValidMove(r, c, tr, tc) && !leavesKingInCheck(r, c, tr, tc))
                            moves.push({ fr: r, fc: c, tr, tc });
                    }
            }
        }
    return moves;
}

function getCaptureMoves(color) {
    return getAllMoves(color).filter(m => board[m.tr][m.tc]);
}

function quiescence(alpha, beta, maximizing) {
    const standPat = evaluateBoard();
    if (maximizing) {
        if (standPat >= beta) return beta;
        if (alpha < standPat) alpha = standPat;
    } else {
        if (standPat <= alpha) return alpha;
        if (beta > standPat) beta = standPat;
    }
    const color = maximizing ? 'white' : 'black';
    let moves = getCaptureMoves(color);
    moves = orderMoves(moves);
    // Limit quiescence branching
    if (moves.length > 12) moves = moves.slice(0, 12);

    for (const m of moves) {
        const p = board[m.fr][m.fc], cap = board[m.tr][m.tc];
        board[m.tr][m.tc] = p; board[m.fr][m.fc] = '';
        const score = quiescence(alpha, beta, !maximizing);
        board[m.fr][m.fc] = p; board[m.tr][m.tc] = cap;
        if (maximizing) {
            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        } else {
            if (score <= alpha) return alpha;
            if (score < beta) beta = score;
        }
    }
    return maximizing ? alpha : beta;
}

function minimax(depth, alpha, beta, maximizing) {
    if (depth === 0) return quiescence(alpha, beta, maximizing);

    const color = maximizing ? 'white' : 'black';
    let moves = getAllMoves(color);
    if (!moves.length) {
        // Checkmate or stalemate
        if (isKingInCheck(color)) return maximizing ? -100000 - depth : 100000 + depth;
        return 0; // stalemate
    }
    moves = orderMoves(moves);

    if (maximizing) {
        let maxE = -Infinity;
        for (const m of moves) {
            const p = board[m.fr][m.fc], cap = board[m.tr][m.tc];
            board[m.tr][m.tc] = p; board[m.fr][m.fc] = '';
            const e = minimax(depth - 1, alpha, beta, false);
            board[m.fr][m.fc] = p; board[m.tr][m.tc] = cap;
            if (e > maxE) maxE = e;
            if (e > alpha) alpha = e;
            if (beta <= alpha) break;
        }
        return maxE;
    } else {
        let minE = Infinity;
        for (const m of moves) {
            const p = board[m.fr][m.fc], cap = board[m.tr][m.tc];
            board[m.tr][m.tc] = p; board[m.fr][m.fc] = '';
            const e = minimax(depth - 1, alpha, beta, true);
            board[m.fr][m.fc] = p; board[m.tr][m.tc] = cap;
            if (e < minE) minE = e;
            if (e < beta) beta = e;
            if (beta <= alpha) break;
        }
        return minE;
    }
}

function makeAIMove() {
    if (gameOver || currentPlayer === playerColor) return;
    const moves = getAllMoves(currentPlayer);
    if (!moves.length) return;

    const statusEl = document.getElementById('status');
    const prevStatus = statusEl ? statusEl.textContent : '';
    if (aiDifficulty >= 3 && statusEl) statusEl.textContent = 'ИИ думает...';

    let best = null;
    // Defer heavy search so UI can paint "thinking"
    const run = () => {
    if (aiDifficulty === 1) {
        // Easy: random among top 40% by shallow eval
        const scored = moves.map(m => {
            const p = board[m.fr][m.fc], cap = board[m.tr][m.tc];
            board[m.tr][m.tc] = p; board[m.fr][m.fc] = '';
            const s = evaluateBoard();
            board[m.fr][m.fc] = p; board[m.tr][m.tc] = cap;
            return { m, s: currentPlayer === 'white' ? s : -s };
        });
        scored.sort((a, b) => b.s - a.s);
        const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * 0.4)));
        best = top[Math.floor(Math.random() * top.length)].m;
    } else {
        const depth = MAX_DEPTH[aiDifficulty] || 3;
        const maximizing = currentPlayer === 'white'; // white maximizes positive score
        let bestScore = maximizing ? -Infinity : Infinity;
        const candidates = [];
        const ordered = orderMoves(moves);

        for (const m of ordered) {
            const p = board[m.fr][m.fc], cap = board[m.tr][m.tc];
            board[m.tr][m.tc] = p; board[m.fr][m.fc] = '';
            const score = minimax(depth - 1, -Infinity, Infinity, !maximizing);
            board[m.fr][m.fc] = p; board[m.tr][m.tc] = cap;

            if (maximizing) {
                if (score > bestScore) { bestScore = score; candidates.length = 0; candidates.push(m); }
                else if (score === bestScore) candidates.push(m);
            } else {
                if (score < bestScore) { bestScore = score; candidates.length = 0; candidates.push(m); }
                else if (score === bestScore) candidates.push(m);
            }
        }
        best = candidates[Math.floor(Math.random() * candidates.length)];
    }
    if (best) doMove(best.fr, best.fc, best.tr, best.tc, true);
    else if (statusEl) statusEl.textContent = prevStatus;
    };
    if (aiDifficulty >= 3) setTimeout(run, 30);
    else run();
}

function hintBestMove() {
    if (gameOver) return;
    if (gameMode === 'ai' && currentPlayer !== playerColor) {
        alert('Сейчас ход компьютера — подсказка только для вашего хода.');
        return;
    }
    const moves = getAllMoves(currentPlayer);
    if (!moves.length) return;

    const statusEl = document.getElementById('status');
    const prev = statusEl ? statusEl.textContent : '';
    if (statusEl) statusEl.textContent = 'Ищем лучший ход...';

    // Use strong search (depth 3 + quiescence), all legal moves
    setTimeout(() => {
        const maximizing = currentPlayer === 'white';
        let best = moves[0], bestScore = maximizing ? -Infinity : Infinity;
        const ordered = orderMoves(moves);
        for (const m of ordered) {
            const p = board[m.fr][m.fc], cap = board[m.tr][m.tc];
            board[m.tr][m.tc] = p; board[m.fr][m.fc] = '';
            const score = minimax(3, -Infinity, Infinity, !maximizing);
            board[m.fr][m.fc] = p; board[m.tr][m.tc] = cap;
            if ((maximizing && score > bestScore) || (!maximizing && score < bestScore)) {
                bestScore = score; best = m;
            }
        }
        clearHighlights();
        getSquareEl(best.fr, best.fc)?.classList.add('hint');
        getSquareEl(best.tr, best.tc)?.classList.add('hint');
        if (statusEl) {
            const from = FILES[best.fc] + (8 - best.fr);
            const to = FILES[best.tc] + (8 - best.tr);
            statusEl.textContent = 'Лучший ход: ' + from + ' → ' + to;
        }
        setTimeout(() => {
            clearHighlights();
            if (statusEl && statusEl.textContent.startsWith('Лучший ход')) statusEl.textContent = prev;
        }, 4000);
    }, 20);
}

// ==================== GAME STATUS ====================
function checkGameStatus() {
    if (isKingInCheck(currentPlayer)) {
        if (isCheckmate(currentPlayer)) {
            // currentPlayer is the one who is mated; winner is the other side
            const winningColor = currentPlayer === 'white' ? 'black' : 'white';
            const msg = getWinMessage(winningColor);
            soundMate();
            launchConfetti();
            showGameOver(`Шах и мат!<br>${msg}`);
            gameOver = true;
            stopTimer();
            return;
        }
        soundCheck();
        document.getElementById('status').textContent =
            (currentPlayer === 'white' ? 'Белым' : 'Чёрным') + ' — ШАХ!';
    } else if (isStalemate(currentPlayer)) {
        showGameOver('Пат!<br>Ничья');
        gameOver = true;
        stopTimer();
    }
}

function updateStatus() {
    if (gameOver) return;
    const el = document.getElementById('status');
    if (!isKingInCheck(currentPlayer)) {
        el.textContent = currentPlayer === 'white' ? 'Ход белых' : 'Ход чёрных';
    }
}

function updateCaptured() {
    document.getElementById('captured-white').textContent = capturedWhite.map(p => PIECES[p]).join('');
    document.getElementById('captured-black').textContent = capturedBlack.map(p => PIECES[p]).join('');
}

function updateMoveHistory() {
    const el = document.getElementById('move-history');
    if (!el) return;
    el.innerHTML = '';
    for (let i = 0; i < moveHistory.length; i += 2) {
        const pair = document.createElement('div');
        pair.className = 'move-pair';
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = (i / 2 + 1) + '.';
        pair.appendChild(num);
        const m1 = document.createElement('span');
        m1.className = 'move' + (viewIndex === i ? ' active' : '');
        m1.textContent = moveHistory[i].notation;
        m1.onclick = () => jumpToMove(i);
        pair.appendChild(m1);
        if (moveHistory[i + 1]) {
            const m2 = document.createElement('span');
            m2.className = 'move' + (viewIndex === i + 1 ? ' active' : '');
            m2.textContent = moveHistory[i + 1].notation;
            m2.onclick = () => jumpToMove(i + 1);
            pair.appendChild(m2);
        }
        el.appendChild(pair);
    }
    el.scrollTop = el.scrollHeight;
}

function jumpToMove(index) {
    viewIndex = index;
    const hist = moveHistory.slice(0, index + 1);
    // rebuild position without changing stored history
    const savedHist = [...moveHistory];
    const savedLast = lastMove;
    const savedPlayer = currentPlayer;
    const savedGameOver = gameOver;
    initBoard();
    moveHistory = [];
    gameOver = false;
    for (const m of hist) {
        doMoveSilent(m.fr, m.fc, m.tr, m.tc, m);
        lastMove = { fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc };
    }
    moveHistory = savedHist;
    gameOver = savedGameOver;
    // currentPlayer after hist.length moves
    currentPlayer = hist.length % 2 === 0 ? 'white' : 'black';
    renderBoard();
    const btn = document.getElementById('btn-live');
    if (btn) btn.style.display = 'inline-block';
    const st = document.getElementById('status');
    if (st) st.textContent = 'Просмотр хода ' + (index + 1) + ' · ' + moveHistory[index].notation;
}

function returnToLive() {
    viewIndex = null;
    const savedHist = [...moveHistory];
    initBoard();
    moveHistory = [];
    for (const m of savedHist) {
        doMoveSilent(m.fr, m.fc, m.tr, m.tc, m);
        lastMove = { fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc };
    }
    moveHistory = savedHist;
    currentPlayer = savedHist.length % 2 === 0 ? 'white' : 'black';
    // restore game over if needed - simple: check status
    gameOver = false;
    checkGameStatus();
    renderBoard();
    const btn = document.getElementById('btn-live');
    if (btn) btn.style.display = 'none';
}

// ==================== UNDO ====================
function undoMove() {
    if (!moveHistory.length || gameOver) return;
    // Undo last move (and AI response if needed)
    const last = moveHistory.pop();
    // Simple restore by replaying all remaining moves
    replayFromHistory();
}

function undoMultiple() {
    if (!moveHistory.length) return;
    const count = Math.min(3, moveHistory.length);
    for (let i = 0; i < count; i++) moveHistory.pop();
    replayFromHistory();
}

function replayFromHistory() {
    const hist = [...moveHistory];
    initBoard();
    moveHistory = [];
    for (const m of hist) {
        // Simplified: just apply position without full flags for speed
        doMoveSilent(m.fr, m.fc, m.tr, m.tc, m);
    }
    gameOver = false;
    hideGameOver();
    renderBoard();
    if (timerEnabled) startTimer();
}

function doMoveSilent(fr, fc, tr, tc, m) {
    // Minimal silent apply for undo/replay
    const piece = board[fr][fc];
    let captured = board[tr][tc];
    if (m.special === 'ep') {
        const epRow = piece === 'P' ? tr + 1 : tr - 1;
        captured = board[epRow][tc];
        board[epRow][tc] = '';
    }
    if (m.special === 'O-O') {
        board[fr][5] = board[fr][7]; board[fr][7] = '';
    } else if (m.special === 'O-O-O') {
        board[fr][3] = board[fr][0]; board[fr][0] = '';
    }
    if (m.promoted) board[tr][tc] = piece === 'P' ? 'Q' : 'q';
    else board[tr][tc] = piece;
    board[fr][fc] = '';
    if (captured) {
        if (getColor(captured) === 'white') capturedWhite.push(captured);
        else capturedBlack.push(captured);
    }
    // Restore flags from move record approximately
    moveHistory.push(m);
    currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
}

// ==================== TIMER ====================
function startTimer() {
    stopTimer();
    lastTick = Date.now();
    timerInterval = setInterval(() => {
        if (gameOver) return;
        const now = Date.now();
        const delta = (now - lastTick) / 1000;
        lastTick = now;
        if (currentPlayer === 'white') {
            timeWhite = Math.max(0, timeWhite - delta);
            if (timeWhite <= 0) { timeWhite = 0; onTimeOut('white'); }
        } else {
            timeBlack = Math.max(0, timeBlack - delta);
            if (timeBlack <= 0) { timeBlack = 0; onTimeOut('black'); }
        }
        updateTimers();
    }, 200);
}

function stopTimer() {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
}

function updateTimers() {
    const fmt = t => {
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
    };
    document.getElementById('time-white').textContent = fmt(timeWhite);
    document.getElementById('time-black').textContent = fmt(timeBlack);
    document.getElementById('timer-white').classList.toggle('active', currentPlayer === 'white' && !gameOver);
    document.getElementById('timer-black').classList.toggle('active', currentPlayer === 'black' && !gameOver);
    document.getElementById('timer-white').classList.toggle('low', timeWhite < 30);
    document.getElementById('timer-black').classList.toggle('low', timeBlack < 30);
}

function onTimeOut(color) {
    gameOver = true;
    stopTimer();
    const winningColor = color === 'white' ? 'black' : 'white';
    const msg = getWinMessage(winningColor);
    soundMate();
    launchConfetti();
    showGameOver(`Время вышло!<br>${msg}`);
}

// ==================== UI CONTROLS ====================
function newGame() {
    hideGameOver();
    initBoard();
    renderBoard();
    if (gameMode === 'ai' && playerColor === 'black') {
        setTimeout(makeAIMove, 400);
    }
}

function setMode(mode) {
    gameMode = mode;
    document.getElementById('mode-ai').classList.toggle('active', mode === 'ai');
    document.getElementById('mode-pvp').classList.toggle('active', mode === 'pvp');
    document.getElementById('ai-controls').style.display = mode === 'ai' ? 'block' : 'none';
    newGame();
}

function setDifficulty(d) {
    aiDifficulty = d;
    for (let i = 1; i <= 4; i++) {
        document.getElementById('diff-' + i)?.classList.toggle('active', i === d);
    }
    const st = document.getElementById('status');
    if (st && d === 4) {
        // mild notice once
    }
}

function setPlayerColor(color) {
    playerColor = color;
    document.getElementById('color-white').classList.toggle('active', color === 'white');
    document.getElementById('color-black').classList.toggle('active', color === 'black');
    newGame();
}

function setTheme(theme) {
    document.body.className = 'theme-' + theme;
}

function toggleHints() { hintsEnabled = document.getElementById('toggle-hints').checked; }
function toggleSound() { soundEnabled = document.getElementById('toggle-sound').checked; }
function toggleCoords() {
    coordsEnabled = document.getElementById('toggle-coords').checked;
    updateCoords();
}
function toggleTimer() {
    timerEnabled = document.getElementById('toggle-timer').checked;
    if (timerEnabled) startTimer();
    else stopTimer();
    document.querySelector('.timers').style.display = timerEnabled ? 'flex' : 'none';
}
function toggleAnim() { animEnabled = document.getElementById('toggle-anim').checked; }
function toggleCoach() {
    coachEnabled = document.getElementById('toggle-coach').checked;
    if (!coachEnabled) {
        const el = document.getElementById('coach');
        if (el) { el.textContent = ''; el.className = 'coach'; }
    }
}
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.() || document.body.requestFullscreen?.();
    } else {
        document.exitFullscreen?.();
    }
}

function runPostGameAnalysis() {
    const box = document.getElementById('analysis');
    if (!box) return;
    if (!moveHistory.length) {
        box.innerHTML = 'Нет ходов для анализа';
        return;
    }
    box.innerHTML = 'Анализ...';
    setTimeout(() => {
        const lines = [];
        // Replay and compare eval before/after each player move (for white perspective then flip)
        let tmpBoard = null;
        // Use silent replay
        const full = [...moveHistory];
        initBoard();
        moveHistory = [];
        let prevEval = evaluateBoard();
        for (let i = 0; i < full.length; i++) {
            const m = full[i];
            const side = i % 2 === 0 ? 'white' : 'black';
            doMoveSilent(m.fr, m.fc, m.tr, m.tc, m);
            const ev = evaluateBoard(); // + = white better
            const delta = side === 'white' ? (ev - prevEval) : (prevEval - ev);
            // delta: positive = side improved
            let tag = 'ok', label = 'нормально';
            // For side to move, loss of ~100cp is mistake, 300 blunder
            const loss = -delta;
            if (loss >= 280) { tag = 'blunder'; label = 'зевок'; }
            else if (loss >= 120) { tag = 'mistake'; label = 'ошибка'; }
            else if (loss >= 50) { tag = 'mistake'; label = 'неточность'; }
            const n = Math.floor(i / 2) + 1;
            const prefix = (i % 2 === 0 ? n + '. ' : n + '... ');
            if (tag !== 'ok') {
                lines.push('<div class="' + tag + '">' + prefix + m.notation + ' — ' + label + ' (' + (loss > 0 ? '−' : '+') + Math.round(Math.abs(loss)) + ')</div>');
            }
            prevEval = ev;
        }
        moveHistory = full;
        // restore live board
        returnToLive();
        if (!lines.length) box.innerHTML = '<div class="ok">Грубых ошибок не найдено (по оценке движка)</div>';
        else box.innerHTML = lines.join('');
    }, 30);
}

function showGameOver(msg) {
    document.getElementById('game-result').innerHTML = msg;
    document.getElementById('game-over').classList.add('show');
}
function hideGameOver() {
    document.getElementById('game-over').classList.remove('show');
}

// ==================== SAVE / LOAD ====================
function saveGame() {
    const data = {
        board, currentPlayer, moveHistory, capturedWhite, capturedBlack,
        castling, enPassant, gameMode, playerColor, aiDifficulty,
        timeWhite, timeBlack, gameOver
    };
    localStorage.setItem('chessSave', JSON.stringify(data));
    alert('Партия сохранена!');
}

function loadGame() {
    const raw = localStorage.getItem('chessSave');
    if (!raw) { alert('Нет сохранённой партии'); return; }
    try {
        const data = JSON.parse(raw);
        board = data.board;
        currentPlayer = data.currentPlayer;
        moveHistory = data.moveHistory || [];
        capturedWhite = data.capturedWhite || [];
        capturedBlack = data.capturedBlack || [];
        castling = data.castling || { whiteK:true, whiteQ:true, blackK:true, blackQ:true };
        enPassant = data.enPassant;
        gameMode = data.gameMode || 'ai';
        playerColor = data.playerColor || 'white';
        aiDifficulty = data.aiDifficulty || 2;
        timeWhite = data.timeWhite ?? 600;
        timeBlack = data.timeBlack ?? 600;
        gameOver = data.gameOver || false;
        setMode(gameMode);
        setDifficulty(aiDifficulty);
        setPlayerColor(playerColor);
        renderBoard();
        updateTimers();
        if (timerEnabled && !gameOver) startTimer();
        alert('Партия загружена!');
    } catch (e) {
        alert('Ошибка загрузки');
    }
}

// ==================== CONFETTI ====================
function launchConfetti() {
    const canvas = document.getElementById('confetti');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const particles = [];
    const colors = ['#fbbf24','#34d399','#60a5fa','#f472b6','#a78bfa','#f87171','#fff','#fb923c'];
    // More confetti, longer fall (~8 seconds at 60fps ≈ 480 frames)
    for (let i = 0; i < 220; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            r: Math.random() * 7 + 3,
            color: colors[Math.floor(Math.random() * colors.length)],
            vx: Math.random() * 5 - 2.5,
            vy: Math.random() * 3 + 2,
            rot: Math.random() * 360,
            vr: Math.random() * 8 - 4,
            w: Math.random() * 8 + 4,
            h: Math.random() * 5 + 2
        });
    }
    let frames = 0;
    const maxFrames = 480; // ~8 sec
    function anim() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.04;
            p.rot += p.vr;
            if (p.y > canvas.height + 20) {
                p.y = -20;
                p.x = Math.random() * canvas.width;
                p.vy = Math.random() * 3 + 2;
            }
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot * Math.PI / 180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
        });
        frames++;
        if (frames < maxFrames) requestAnimationFrame(anim);
        else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    anim();
}

// ==================== START ====================
window.onload = () => {
    setTheme('classic');
    initBoard();
    renderBoard();
    window.addEventListener('resize', () => {
        // re-render so animation sizes match new square size
        if (!isAnimating) renderBoard();
    });
    window.addEventListener('orientationchange', () => {
        setTimeout(() => { if (!isAnimating) renderBoard(); }, 150);
    });
};
