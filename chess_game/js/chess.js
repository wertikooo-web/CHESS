// Chess game implementation
let board = [];
let currentPlayer = 'white';
let selectedPiece = null;
let moveHistory = [];
let capturedWhite = [];
let capturedBlack = [];
let isAiEnabled = true; // AI plays as black
let aiDifficulty = 2; // 1 = Легкий, 2 = Средний, 3 = Сложный

// Minimax constants
const MAX_DEPTH = {
    1: 1,   // Easy - almost no search
    2: 2,   // Medium
    3: 3    // Hard - deeper search (may be slow)
};

// Piece representations
const pieces = {
    'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘', 'P': '♙',
    'k': '♚', 'q': '♛', 'r': '♜', 'b': '♝', 'n': '♞', 'p': '♟'
};

// Initial board setup (FEN-like, but array)
function initBoard() {
    board = [
        ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
    ];
    currentPlayer = 'white';
    moveHistory = [];
    capturedWhite = [];
    capturedBlack = [];
}

function renderBoard() {
    const boardEl = document.getElementById('board');
    boardEl.innerHTML = '';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.row = row;
            square.dataset.col = col;
            
            // Color the square
            if ((row + col) % 2 === 0) {
                square.classList.add('light');
            } else {
                square.classList.add('dark');
            }
            
            const piece = board[row][col];
            if (piece) {
                square.innerHTML = pieces[piece];
                square.dataset.piece = piece;
            }
            
            square.addEventListener('click', handleSquareClick);
            boardEl.appendChild(square);
        }
    }
    
    highlightKingInCheck();
    updateStatus();
    updateCaptured();
}

function handleSquareClick(e) {
    const row = parseInt(e.currentTarget.dataset.row);
    const col = parseInt(e.currentTarget.dataset.col);
    const piece = board[row][col];
    
    if (selectedPiece) {
        // Try to move
        if (isValidMove(selectedPiece.row, selectedPiece.col, row, col)) {
            makeMove(selectedPiece.row, selectedPiece.col, row, col);
        } else {
            // Deselect if clicking invalid
            clearHighlights();
            selectedPiece = null;
            if (piece && getPieceColor(piece) === currentPlayer) {
                selectPiece(row, col);
            }
        }
    } else {
        if (piece && getPieceColor(piece) === currentPlayer) {
            selectPiece(row, col);
        }
    }
}

function selectPiece(row, col) {
    selectedPiece = { row, col };
    clearHighlights();
    const square = getSquareElement(row, col);
    square.classList.add('selected');
    
    // Highlight possible moves
    highlightPossibleMoves(row, col);
}

function clearHighlights() {
    document.querySelectorAll('.square').forEach(sq => {
        sq.classList.remove('highlight', 'selected', 'capture', 'in-check');
    });
}

function highlightKingInCheck() {
    // Remove previous highlights
    document.querySelectorAll('.in-check').forEach(el => el.classList.remove('in-check'));
    
    const opponentColor = currentPlayer === 'white' ? 'black' : 'white';
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && getPieceColor(piece) === opponentColor && piece.toLowerCase() === 'k') {
                if (isKingInCheck(opponentColor)) {
                    const square = getSquareElement(row, col);
                    if (square) square.classList.add('in-check');
                }
                return;
            }
        }
    }
}

function highlightPossibleMoves(row, col) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (isValidMove(row, col, r, c)) {
                const sq = getSquareElement(r, c);
                if (board[r][c]) {
                    sq.classList.add('capture');
                } else {
                    sq.classList.add('highlight');
                }
            }
        }
    }
}

function getSquareElement(row, col) {
    return document.querySelector(`.square[data-row="${row}"][data-col="${col}"]`);
}

function getPieceColor(piece) {
    return piece === piece.toUpperCase() ? 'white' : 'black';
}

function isValidMove(fromRow, fromCol, toRow, toCol) {
    if (fromRow === toRow && fromCol === toCol) return false;
    
    const piece = board[fromRow][fromCol];
    if (!piece) return false;
    
    const target = board[toRow][toCol];
    if (target && getPieceColor(piece) === getPieceColor(target)) return false;
    
    // Basic movement rules
    const type = piece.toLowerCase();
    const color = getPieceColor(piece);
    const dr = toRow - fromRow;
    const dc = toCol - fromCol;
    
    switch (type) {
        case 'p': // Pawn
            return validatePawnMove(fromRow, fromCol, toRow, toCol, color);
        case 'r': // Rook
            return validateRookMove(fromRow, fromCol, toRow, toCol);
        case 'n': // Knight
            return validateKnightMove(dr, dc);
        case 'b': // Bishop
            return validateBishopMove(fromRow, fromCol, toRow, toCol);
        case 'q': // Queen
            return validateQueenMove(fromRow, fromCol, toRow, toCol);
        case 'k': // King
            return validateKingMove(fromRow, fromCol, toRow, toCol, color);
        default:
            return false;
    }
}

function validatePawnMove(fromRow, fromCol, toRow, toCol, color) {
    const direction = color === 'white' ? -1 : 1;
    const startRow = color === 'white' ? 6 : 1;
    
    const dr = toRow - fromRow;
    const dc = toCol - fromCol;
    
    // Forward move
    if (dc === 0 && !board[toRow][toCol]) {
        if (dr === direction) return true;
        if (fromRow === startRow && dr === 2 * direction && !board[fromRow + direction][fromCol]) return true;
    }
    
    // Capture
    if (Math.abs(dc) === 1 && dr === direction) {
        return !!board[toRow][toCol];
    }
    
    // TODO: En passant, promotion
    return false;
}

function validateRookMove(fromRow, fromCol, toRow, toCol) {
    if (fromRow !== toRow && fromCol !== toCol) return false;
    return isPathClear(fromRow, fromCol, toRow, toCol);
}

function validateKnightMove(dr, dc) {
    return (Math.abs(dr) === 2 && Math.abs(dc) === 1) || (Math.abs(dr) === 1 && Math.abs(dc) === 2);
}

function validateBishopMove(fromRow, fromCol, toRow, toCol) {
    if (Math.abs(fromRow - toRow) !== Math.abs(fromCol - toCol)) return false;
    return isPathClear(fromRow, fromCol, toRow, toCol);
}

function validateQueenMove(fromRow, fromCol, toRow, toCol) {
    return validateRookMove(fromRow, fromCol, toRow, toCol) || validateBishopMove(fromRow, fromCol, toRow, toCol);
}

function validateKingMove(fromRow, fromCol, toRow, toCol, color) {
    const dr = Math.abs(toRow - fromRow);
    const dc = Math.abs(toCol - fromCol);
    if (dr <= 1 && dc <= 1) return true;
    
    // TODO: Castling
    return false;
}

function isPathClear(fromRow, fromCol, toRow, toCol) {
    const dr = Math.sign(toRow - fromRow);
    const dc = Math.sign(toCol - fromCol);
    let r = fromRow + dr;
    let c = fromCol + dc;
    
    while (r !== toRow || c !== toCol) {
        if (board[r][c]) return false;
        r += dr;
        c += dc;
    }
    return true;
}

function makeMove(fromRow, fromCol, toRow, toCol) {
    const piece = board[fromRow][fromCol];
    const captured = board[toRow][toCol];
    
    // Record move
    moveHistory.push({
        fromRow, fromCol, toRow, toCol,
        piece, captured
    });
    
    if (captured) {
        if (getPieceColor(captured) === 'white') {
            capturedWhite.push(captured);
        } else {
            capturedBlack.push(captured);
        }
    }
    
    // Move piece
    board[toRow][toCol] = piece;
    board[fromRow][fromCol] = '';
    
    // TODO: Promotion, etc.
    
    clearHighlights();
    selectedPiece = null;
    
    currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
    
    renderBoard();
    
    // Check for game end
    checkGameStatus();
}

function updateStatus() {
    const statusEl = document.getElementById('status');
    statusEl.textContent = currentPlayer === 'white' ? 'Ход белых' : 'Ход чёрных';
}

function updateCaptured() {
    document.getElementById('captured-white').innerHTML = capturedWhite.map(p => pieces[p]).join('');
    document.getElementById('captured-black').innerHTML = capturedBlack.map(p => pieces[p]).join('');
}

function checkGameStatus() {
    const opponent = currentPlayer === 'white' ? 'black' : 'white';
    
    if (isKingInCheck(opponent)) {
        if (isCheckmate(opponent)) {
            const winner = currentPlayer === 'white' ? 'Белые' : 'Чёрные';
            setTimeout(() => {
                alert(`Шах и мат! Победитель: ${winner}`);
            }, 100);
        } else {
            const statusEl = document.getElementById('status');
            statusEl.textContent = (opponent === 'white' ? 'Белым' : 'Чёрным') + ' — ШАХ!';
        }
    } else if (isStalemate(opponent)) {
        setTimeout(() => {
            alert('Пат! Ничья.');
        }, 100);
    }
}

// Check if king of given color is under attack
function isKingInCheck(color) {
    let kingRow = -1, kingCol = -1;
    
    // Find king
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && getPieceColor(piece) === color && piece.toLowerCase() === 'k') {
                kingRow = row;
                kingCol = col;
                break;
            }
        }
        if (kingRow !== -1) break;
    }
    
    if (kingRow === -1) return true; // King captured (should not happen)
    
    // Check if any opponent piece can attack the king
    const opponent = color === 'white' ? 'black' : 'white';
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && getPieceColor(piece) === opponent) {
                if (isValidMove(row, col, kingRow, kingCol)) {
                    return true;
                }
            }
        }
    }
    return false;
}

// Check for checkmate
function isCheckmate(color) {
    if (!isKingInCheck(color)) return false;
    
    // Try all possible moves for the player in check
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && getPieceColor(piece) === color) {
                for (let toRow = 0; toRow < 8; toRow++) {
                    for (let toCol = 0; toCol < 8; toCol++) {
                        if (isValidMove(row, col, toRow, toCol)) {
                            // Simulate move
                            const captured = board[toRow][toCol];
                            const originalPiece = board[row][col];
                            
                            board[toRow][toCol] = originalPiece;
                            board[row][col] = '';
                            
                            const stillInCheck = isKingInCheck(color);
                            
                            // Undo
                            board[row][col] = originalPiece;
                            board[toRow][toCol] = captured;
                            
                            if (!stillInCheck) {
                                return false; // There is at least one legal move
                            }
                        }
                    }
                }
            }
        }
    }
    return true; // No legal moves — checkmate
}

function isStalemate(color) {
    if (isKingInCheck(color)) return false;
    
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && getPieceColor(piece) === color) {
                for (let toRow = 0; toRow < 8; toRow++) {
                    for (let toCol = 0; toCol < 8; toCol++) {
                        if (isValidMove(row, col, toRow, toCol)) {
                            return false;
                        }
                    }
                }
            }
        }
    }
    return true;
}

function newGame() {
    initBoard();
    renderBoard();
}

function undoMove() {
    if (moveHistory.length === 0) return;
    
    const lastMove = moveHistory.pop();
    board[lastMove.fromRow][lastMove.fromCol] = lastMove.piece;
    board[lastMove.toRow][lastMove.toCol] = lastMove.captured || '';
    
    if (lastMove.captured) {
        // Restore captured
        const color = getPieceColor(lastMove.captured);
        if (color === 'white') {
            capturedWhite.pop();
        } else {
            capturedBlack.pop();
        }
    }
    
    currentPlayer = currentPlayer === 'white' ? 'black' : 'white';
    renderBoard();
}

// Simple AI for Black (greedy + random with basic evaluation)
function evaluateBoard() {
    const pieceValues = {
        'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': 100,
        'P': 1, 'N': 3, 'B': 3, 'R': 5, 'Q': 9, 'K': 100
    };
    
    let score = 0;
    
    // Material balance
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece) {
                let value = pieceValues[piece.toLowerCase()] || 0;
                if (piece === piece.toUpperCase()) { // White
                    score -= value;
                } else { // Black
                    score += value;
                }
            }
        }
    }
    
    // Positional evaluation
    score += evaluateCenterControl();
    score += evaluateKingSafety();
    score += evaluatePawnStructure();
    score += evaluatePieceActivity();
    
    return score;
}

// Center control (d4, d5, e4, e5)
function evaluateCenterControl() {
    let score = 0;
    const centerSquares = [[3,3], [3,4], [4,3], [4,4]];
    
    for (let [row, col] of centerSquares) {
        const piece = board[row][col];
        if (piece) {
            const bonus = getPieceColor(piece) === 'black' ? 8 : -8;
            score += bonus;
        }
    }
    return score;
}

// King safety (closer to corners better for now)
function evaluateKingSafety() {
    let score = 0;
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && piece.toLowerCase() === 'k') {
                const color = getPieceColor(piece);
                const safety = (row === 0 || row === 7) && (col === 0 || col === 7) ? 15 : 5;
                score += color === 'black' ? safety : -safety;
            }
        }
    }
    return score;
}

// Simple pawn structure
function evaluatePawnStructure() {
    let score = 0;
    for (let col = 0; col < 8; col++) {
        let whitePawns = 0, blackPawns = 0;
        for (let row = 0; row < 8; row++) {
            if (board[row][col] === 'P') whitePawns++;
            if (board[row][col] === 'p') blackPawns++;
        }
        if (blackPawns > 1) score += 3; // Doubled pawns bad for opponent? Wait, bonus for us
        if (whitePawns > 1) score -= 3;
    }
    return score;
}

// Piece activity (more central = better)
function evaluatePieceActivity() {
    let score = 0;
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && piece.toLowerCase() !== 'p' && piece.toLowerCase() !== 'k') {
                const centrality = 3 - Math.abs(3.5 - row) - Math.abs(3.5 - col);
                if (getPieceColor(piece) === 'black') {
                    score += centrality * 2;
                } else {
                    score -= centrality * 2;
                }
            }
        }
    }
    return score;
}

function getAllPossibleMoves(color) {
    const moves = [];
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = board[row][col];
            if (piece && getPieceColor(piece) === color) {
                for (let toRow = 0; toRow < 8; toRow++) {
                    for (let toCol = 0; toCol < 8; toCol++) {
                        if (isValidMove(row, col, toRow, toCol)) {
                            moves.push({ fromRow: row, fromCol: col, toRow, toCol });
                        }
                    }
                }
            }
        }
    }
    return moves;
}

function makeAIMove() {
    if (currentPlayer !== 'black' || !isAiEnabled) return;
    
    const moves = getAllPossibleMoves('black');
    if (moves.length === 0) {
        alert("Чёрные не имеют ходов! Игра окончена.");
        return;
    }
    
    let bestMove = null;
    const depth = MAX_DEPTH[aiDifficulty] || 2;
    
    if (aiDifficulty === 1) {
        // Easy: random with minimal search
        bestMove = moves[Math.floor(Math.random() * moves.length)];
    } else {
        // Medium & Hard: Minimax
        bestMove = getBestMinimaxMove(moves, depth);
    }
    
    if (!bestMove) {
        bestMove = moves[Math.floor(Math.random() * moves.length)];
    }
    
    // Execute best move
    makeMove(bestMove.fromRow, bestMove.fromCol, bestMove.toRow, bestMove.toCol);
}

// Minimax with Alpha-Beta Pruning
function minimax(depth, alpha, beta, maximizingPlayer) {
    if (depth === 0) {
        return evaluateBoard();
    }
    
    const color = maximizingPlayer ? 'black' : 'white';
    const moves = getAllPossibleMoves(color);
    
    if (moves.length === 0) {
        return evaluateBoard(); // Terminal position
    }
    
    if (maximizingPlayer) {
        let maxEval = -Infinity;
        for (let move of moves) {
            const piece = board[move.fromRow][move.fromCol];
            const captured = board[move.toRow][move.toCol];
            
            board[move.toRow][move.toCol] = piece;
            board[move.fromRow][move.fromCol] = '';
            
            const evalScore = minimax(depth - 1, alpha, beta, false);
            
            board[move.fromRow][move.fromCol] = piece;
            board[move.toRow][move.toCol] = captured;
            
            maxEval = Math.max(maxEval, evalScore);
            alpha = Math.max(alpha, evalScore);
            if (beta <= alpha) break;
        }
        return maxEval;
    } else {
        let minEval = Infinity;
        for (let move of moves) {
            const piece = board[move.fromRow][move.fromCol];
            const captured = board[move.toRow][move.toCol];
            
            board[move.toRow][move.toCol] = piece;
            board[move.fromRow][move.fromCol] = '';
            
            const evalScore = minimax(depth - 1, alpha, beta, true);
            
            board[move.fromRow][move.fromCol] = piece;
            board[move.toRow][move.toCol] = captured;
            
            minEval = Math.min(minEval, evalScore);
            beta = Math.min(beta, evalScore);
            if (beta <= alpha) break;
        }
        return minEval;
    }
}

function getBestMinimaxMove(moves, depth) {
    let bestScore = -Infinity;
    let bestMoves = [];
    
    for (let move of moves) {
        const piece = board[move.fromRow][move.fromCol];
        const captured = board[move.toRow][move.toCol];
        
        // Simulate move
        board[move.toRow][move.toCol] = piece;
        board[move.fromRow][move.fromCol] = '';
        
        const score = minimax(depth - 1, -Infinity, Infinity, false); // Opponent minimizes
        
        // Undo
        board[move.fromRow][move.fromCol] = piece;
        board[move.toRow][move.toCol] = captured;
        
        if (score > bestScore) {
            bestScore = score;
            bestMoves = [move];
        } else if (score === bestScore) {
            bestMoves.push(move);
        }
    }
    
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// Call AI after player move
const originalMakeMove = makeMove;
makeMove = function(fromRow, fromCol, toRow, toCol) {
    originalMakeMove.call(this, fromRow, fromCol, toRow, toCol);
    // Small delay for AI turn
    setTimeout(() => {
        if (currentPlayer === 'black') {
            makeAIMove();
        }
    }, 300);
};

// Update newGame to reset AI
const originalNewGame = newGame;
newGame = function() {
    originalNewGame.call(this);
    // Reset difficulty UI
    setDifficulty(aiDifficulty);
};

function toggleAI() {
    isAiEnabled = !isAiEnabled;
    document.getElementById('ai-status').textContent = isAiEnabled ? 'Вкл' : 'Выкл';
    if (!isAiEnabled && currentPlayer === 'black') {
        // If AI disabled during black's turn, do nothing extra
    }
}

function setDifficulty(level) {
    aiDifficulty = level;
    // Update active button
    for (let i = 1; i <= 3; i++) {
        const btn = document.getElementById(`diff-${i}`);
        if (btn) {
            btn.classList.toggle('active', i === level);
        }
    }
}

// Initialize
initBoard();
window.onload = () => {
    renderBoard();
};