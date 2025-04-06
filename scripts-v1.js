// --- START OF FILE scripts-v3.js ---

// Ensure chess.js is loaded
if (typeof Chess === 'undefined') {
    alert("FATAL ERROR: chess.js library not found. Please include it in your HTML.");
    throw new Error("chess.js library not found.");
}

const chessboard = document.getElementById('chessboard');
const pieces = { // For rendering (chess.js uses different format internally)
    'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟', // black ascii
    'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙'  // white ascii
};
const pieceValues = { 'p': 1, 'n': 3, 'b': 3, 'r': 5, 'q': 9, 'k': Infinity };
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const K_FACTOR = 32;

// --- Game Instance (using chess.js) ---
let game = new Chess(); // The core game logic handler

// --- Game State Variables (Managed Externally or UI-Related) ---
let pieceRenderMode = 'png'; // 'png' or 'ascii'
let whiteTime = 600;
let blackTime = 600;
let timerInterval;
let moveHistoryUI = []; // Array of simple move notations for display { moveNumber, white, black }
let moveHistoryInternal = []; // Stores { fenBefore, moveSAN } for undo
let selectedSquareAlg = null; // Algebraic notation of selected square (e.g., 'e2')
let lastMoveHighlight = null; // { from: 'e2', to: 'e4' } algebraic notation
let isGameOver = false;
let gameMode = ''; // "human", "ai", "ai-vs-ai"
let aiDifficulty = '';
let aiDifficultyWhite = '';
let aiDifficultyBlack = '';
let capturedWhite = []; // Store piece chars ('P', 'N', etc.) captured BY BLACK
let capturedBlack = []; // Store piece chars ('p', 'n', etc.) captured BY WHITE
let promotionCallback = null; // Stores the callback for promotion choice

// --- Statistics & Ratings ---
let gamesPlayed = 0, wins = 0, losses = 0, draws = 0;
let playerRating = 1200;
let aiRating = 1200;

// --- Stockfish Worker ---
let stockfish;
let isStockfishReady = false;
let isStockfishThinking = false;
let aiDelayEnabled = true; // Active ou désactive le délai pour l'IA
const AI_DELAY_TIME = 1500; // Délai en millisecondes (1,5 s)

// --- UI Elements (Cache them) ---
const whiteTimeEl = document.getElementById('white-time');
const blackTimeEl = document.getElementById('black-time');
const gameStatusEl = document.getElementById('game-status');
const capturedWhiteEl = document.getElementById('captured-white');
const capturedBlackEl = document.getElementById('captured-black');
const whiteProgressEl = document.getElementById('white-progress');
const blackProgressEl = document.getElementById('black-progress');
const scoreAdvantageEl = document.getElementById('score-advantage');
const player1RatingEl = document.querySelector('.player-1-rating');
const player2RatingEl = document.querySelector('.player-2-rating');
const player1NameEl = document.querySelector('.player-1-name');
const player2NameEl = document.querySelector('.player-2-name');
const moveListEl = document.getElementById('move-list');
const undoButton = document.getElementById('undo-button');
const resignButton = document.getElementById('resign-button');
const playerInfoWhiteEl = document.querySelector('.player-info-white');
const playerInfoBlackEl = document.querySelector('.player-info-black');
const promotionModal = document.getElementById('promotion-modal');
const promotionOptionsContainer = promotionModal ? promotionModal.querySelector('.promotion-options') : null;
const gameEndModal = document.getElementById('game-end-modal');
const gameEndMessageEl = document.getElementById('game-end-message');
const playAgainButton = document.getElementById('play-again');
const themeToggleButton = document.getElementById('theme-toggle');
const soundToggleButton = document.getElementById('sound-toggle');
const modeAiButton = document.getElementById('mode-ai');
const modeHumanButton = document.getElementById('mode-human');
const modeAiAiButton = document.getElementById('mode-ai-ai');
const mainMenuEl = document.getElementById('main-menu');
const difficultySelectionEl = document.getElementById('difficulty-selection');
const aiVsAiDifficultySelectionEl = document.getElementById('ai-vs-ai-difficulty-selection');
const pieceRenderToggle = document.getElementById('piece-render-toggle');
const aiDelayToggle = document.getElementById('ai-delay-toggle');


// --- Helper Functions ---
function coordToAlg(row, col) {
    return files[col] + (8 - row);
}

function algToCoord(alg) {
    if (!alg || alg.length < 2) return null;
    const col = files.indexOf(alg[0]);
    const row = 8 - parseInt(alg[1]);
    if (col === -1 || isNaN(row) || row < 0 || row > 7) return null;
    return [row, col];
}

// Converts chess.js piece { type: 'p', color: 'w' } to our format 'P'
function chessjsPieceToMyFormat(pieceInfo) {
    if (!pieceInfo) return '';
    return pieceInfo.color === 'w' ? pieceInfo.type.toUpperCase() : pieceInfo.type.toLowerCase();
}

// Converts my format 'P' to chess.js format { type: 'p', color: 'w' } (less common need)
// function myFormatToChessjsPiece(myPiece) {
//     if (!myPiece) return null;
//     const type = myPiece.toLowerCase();
//     const color = (myPiece === myPiece.toUpperCase()) ? 'w' : 'b';
//     return { type, color };
// }

function preloadAllSounds() {
    const soundNames = ['move', 'move2', 'capture', 'castle', 'check', 'click', 
        'promote', 'illegal', 'start', 'win', 'lose', 'draw', 'end', 'tenseconds'];
    soundNames.forEach(name => loadSound(name, getSoundPath(name)));
}

function getSoundPath(name) {
    const soundPaths = {
        move: 'sounds/move-self.mp3', move2: 'sounds/move-opponent.mp3', capture: 'sounds/capture.mp3',
        castle: 'sounds/castle.mp3', check: 'sounds/move-check.mp3', click: 'sounds/click.mp3',
        promote: 'sounds/promote.mp3', illegal: 'sounds/illegal.mp3', start: 'sounds/game-start.mp3',
        win: 'sounds/game-win.mp3', lose: 'sounds/game-lose.mp3', draw: 'sounds/game-draw.mp3',
        end: 'sounds/game-end.mp3', tenseconds: 'sounds/tenseconds.mp3'
    };
    return soundPaths[name] || '';
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initStockfish();
    setupMenusAndButtons();
    loadSavedSettings();
    updateStatistics();
    updateRatingDisplay();
    preloadAllSounds();
    if (gameStatusEl) gameStatusEl.textContent = "Choisissez un mode de jeu.";
    else console.error("Element with ID 'game-status' not found.");

    if (!mainMenuEl || !difficultySelectionEl || !aiVsAiDifficultySelectionEl || !gameEndModal || !promotionModal || !promotionOptionsContainer) {
        console.error("One or more essential menu/modal elements are missing from the HTML.");
    }
    if (!chessboard) console.error("Element with ID 'chessboard' not found.");
    if (!playerInfoWhiteEl || !playerInfoBlackEl) console.error("Player info elements not found.");

    if (pieceRenderToggle) pieceRenderToggle.addEventListener('click', togglePieceRenderMode);
    else console.warn("Piece render toggle button not found.");

    if (aiDelayToggle) {
        aiDelayToggle.addEventListener('click', toggleAIDelay);
        aiDelayToggle.textContent = aiDelayEnabled ? "ON" : "OFF"; // Initial state
    } else console.warn("Bouton 'ai-delay-toggle' non trouvé.");
});

// --- Setup Functions ---
function setupMenusAndButtons() {
    // Main Menu
    if (modeAiButton) modeAiButton.addEventListener('click', () => setupGameMode('ai'));
    else console.warn("Button 'mode-ai' not found.");
    if (modeHumanButton) modeHumanButton.addEventListener('click', () => setupGameMode('human'));
    else console.warn("Button 'mode-human' not found.");
    if (modeAiAiButton) modeAiAiButton.addEventListener('click', () => setupGameMode('ai-vs-ai'));
    else console.warn("Button 'mode-ai-ai' not found.");

    // Difficulty Selections
    if (difficultySelectionEl) {
        difficultySelectionEl.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', () => {
                aiDifficulty = button.dataset.difficulty;
                difficultySelectionEl.style.display = 'none';
                startGame();
            });
        });
    }
    if (aiVsAiDifficultySelectionEl) {
        aiVsAiDifficultySelectionEl.querySelectorAll('.difficulty-button').forEach(button => {
            button.addEventListener('click', () => handleAiVsAiDifficultySelection(button));
        });
    }

    // Modals & Controls
    if (playAgainButton) playAgainButton.onclick = returnToMainMenu;
    else console.warn("Button 'play-again' not found.");
    if (themeToggleButton) themeToggleButton.addEventListener('click', toggleTheme);
    else console.warn("Button 'theme-toggle' not found.");
    if (soundToggleButton) soundToggleButton.addEventListener('click', toggleSound);
    else console.warn("Button 'sound-toggle' not found.");
    if (undoButton) undoButton.addEventListener('click', undoMove);
    else console.warn("Button 'undo-button' not found.");
    if (resignButton) resignButton.addEventListener('click', resignGame);
    else console.warn("Button 'resign-button' not found.");

    // Promotion Modal Buttons (assuming they are set up in HTML with data-type)
    if (promotionOptionsContainer) {
        promotionOptionsContainer.querySelectorAll('.promotion-piece').forEach(btn => {
            btn.onclick = () => {
                if (promotionCallback) {
                    promotionCallback(btn.dataset.type); // e.g., 'q', 'r', 'n', 'b'
                    promotionCallback = null; // Clear callback
                }
                if (promotionModal) promotionModal.style.display = 'none';
            };
        });
        // Add a close/cancel button listener if you have one
        const cancelBtn = promotionModal.querySelector('.cancel-promotion'); // Example selector
        if(cancelBtn) {
            cancelBtn.onclick = () => {
                 if (promotionModal) promotionModal.style.display = 'none';
                 if (promotionCallback) {
                     promotionCallback(null); // Indicate cancellation
                     promotionCallback = null;
                 }
            }
        }
    } else {
        console.error("Promotion options container not found for setting up clicks.");
    }
}

function setupGameMode(mode) {
    gameMode = mode;
    if (mainMenuEl) mainMenuEl.style.display = 'none';
    if (mode === 'ai' && difficultySelectionEl) {
        difficultySelectionEl.style.display = 'block';
    } else if (mode === 'human') {
        startGame();
    } else if (mode === 'ai-vs-ai' && aiVsAiDifficultySelectionEl) {
        aiVsAiDifficultySelectionEl.style.display = 'block';
        aiDifficultyWhite = '';
        aiDifficultyBlack = '';
        aiVsAiDifficultySelectionEl.querySelectorAll('button.selected').forEach(b => b.classList.remove('selected'));
    }
}

function handleAiVsAiDifficultySelection(button) {
    if (!aiVsAiDifficultySelectionEl) return;
    const color = button.dataset.color;
    const difficulty = button.dataset.difficulty;
    const columnButtons = aiVsAiDifficultySelectionEl.querySelectorAll(`button[data-color="${color}"]`);

    columnButtons.forEach(b => b.classList.remove('selected'));
    button.classList.add('selected');

    if (color === 'white') aiDifficultyWhite = difficulty;
    else if (color === 'black') aiDifficultyBlack = difficulty;

    if (aiDifficultyWhite && aiDifficultyBlack) {
        aiVsAiDifficultySelectionEl.style.display = 'none';
        startGame();
    }
}

function returnToMainMenu() {
    if (gameEndModal) gameEndModal.style.display = 'none';
    if (mainMenuEl) mainMenuEl.style.display = 'block';
    if (difficultySelectionEl) difficultySelectionEl.style.display = 'none';
    if (aiVsAiDifficultySelectionEl) aiVsAiDifficultySelectionEl.style.display = 'none';
    if (chessboard) chessboard.innerHTML = '';
    if (moveListEl) moveListEl.innerHTML = '';
    resetTimer();
    updateTimerDisplay();
    isGameOver = true; // Set game over flag
    clearInterval(timerInterval);
    if (gameStatusEl) gameStatusEl.textContent = "Choisissez un mode de jeu.";
    updateRatingDisplay();
    resetBoardState(); // Full reset
    game = new Chess(); // Crucial: Reset chess.js instance
}

function resetBoardState() {
    game = new Chess(); // Reset the game state using chess.js default start position
    // Reset UI/external state
    moveHistoryUI = [];
    moveHistoryInternal = [];
    selectedSquareAlg = null;
    lastMoveHighlight = null;
    isGameOver = false;
    capturedWhite.length = 0;
    capturedBlack.length = 0;
    isStockfishThinking = false;
    promotionCallback = null;

    if (moveListEl) moveListEl.innerHTML = '';
    updateGameStatus("Nouvelle partie ! Les blancs jouent.");
    updateControlsState();
    updateAllUI();
    updatePlayerTurnIndicator();
}

function loadSavedSettings() {
    // Theme
    const savedTheme = localStorage.getItem('chess-theme');
    const body = document.body;
    const themeIcon = themeToggleButton ? themeToggleButton.querySelector('i') : null;
    body.classList.toggle('light-theme', savedTheme === 'light');
    if (themeIcon) {
        themeIcon.className = savedTheme === 'light' ? 'fas fa-sun' : 'fas fa-moon';
    }

    // Sound
    const soundSetting = localStorage.getItem('chess-sound');
    const soundIcon = soundToggleButton ? soundToggleButton.querySelector('i') : null;
    soundEnabled = (soundSetting !== 'off');
    if (soundIcon) {
        soundIcon.className = soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
    }

    // AI Delay
    const delaySetting = localStorage.getItem('chess-ai-delay');
    aiDelayEnabled = (delaySetting !== 'off');
    if (aiDelayToggle) {
        aiDelayToggle.textContent = aiDelayEnabled ? "ON" : "OFF";
    }
}

function togglePieceRenderMode() {
    pieceRenderMode = (pieceRenderMode === 'ascii') ? 'png' : 'ascii';
    createBoard(); // Redraw board with new mode
    console.log(`Piece render mode switched to: ${pieceRenderMode}`);
}

function toggleAIDelay() {
    aiDelayEnabled = !aiDelayEnabled;
    console.log(`AI Delay ${aiDelayEnabled ? 'Activé' : 'Désactivé'}`);
    if (aiDelayToggle) aiDelayToggle.textContent = aiDelayEnabled ? "ON" : "OFF";
    localStorage.setItem('chess-ai-delay', aiDelayEnabled ? 'on' : 'off');
}

// --- Game Flow & Control ---
function startGame() {
    console.log("Starting game in mode:", gameMode);
    resetBoardState(); // Ensure clean state with new Chess() instance
    resetTimer();
    createBoard(); // Draw the board
    updateAllUI(); // Update captured, progress, timers, ratings
    startTimer();
    playSound('start');

    if (gameMode === 'ai-vs-ai') {
        if (!aiDifficultyWhite || !aiDifficultyBlack) {
            console.error("AI vs AI mode but difficulties not set.");
            updateGameStatus("Erreur: Difficultés IA non définies.");
            return;
        }
        setTimeout(() => {
            if (isStockfishReady && game.turn() === 'w') requestAiMove(); // Check turn explicitly
            else console.log("AI vs AI start delayed, waiting for Stockfish or Black's turn.");
        }, 500);
    } else {
        updateGameStatus("Les blancs commencent.");
    }
    updateControlsState();
    updatePlayerTurnIndicator();
}

// No switchPlayer needed, chess.js handles turn internally via game.turn()

function updatePlayerTurnIndicator() {
    if (!playerInfoWhiteEl || !playerInfoBlackEl) return;
    const currentTurn = game.turn(); // 'w' or 'b'
    playerInfoWhiteEl.classList.toggle('active-player', currentTurn === 'w');
    playerInfoBlackEl.classList.toggle('active-player', currentTurn === 'b');
}

function endGame(winner, reason) {
    if (isGameOver) return; // Prevent multiple calls
    isGameOver = true;
    clearInterval(timerInterval);
    isStockfishThinking = false; // Stop any thinking process

    gamesPlayed++;
    let message = '';
    let sound = 'end';
    let playerWon = null; // null for draw, true for white win, false for black win

    if (winner === 'draw') {
        draws++;
        message = `Partie terminée. Match nul (${reason}).`;
        sound = 'draw';
    } else {
        const winnerColorText = winner === 'white' ? 'Blancs' : 'Noirs';
        message = `Partie terminée. Victoire des ${winnerColorText} (${reason}).`;
        if (gameMode === 'ai') {
            playerWon = (winner === 'white'); // Assuming player is white
            if (playerWon) { wins++; sound = 'win'; showConfetti(); }
            else { losses++; sound = 'lose'; }
            updateRatings(playerWon);
        } else if (gameMode === 'human') {
            sound = (winner === 'white') ? 'win' : 'lose';
            if (winner === 'white') showConfetti();
        } else { // AI vs AI or other modes
             sound = 'end'; // Or maybe a specific sound?
        }
    }

    updateStatistics();
    updateRatingDisplay();
    showGameEndModal(message);
    playSound(sound);
    updateControlsState();
    // Clear active player highlight on game end
    if (playerInfoWhiteEl) playerInfoWhiteEl.classList.remove('active-player');
    if (playerInfoBlackEl) playerInfoBlackEl.classList.remove('active-player');
}

function resignGame() {
    if (isGameOver || gameMode === 'ai-vs-ai') return;
    const loserColor = game.turn() === 'w' ? 'white' : 'black';
    const winnerColor = (loserColor === 'white' ? 'black' : 'white');
    updateGameStatus(`Les ${loserColor === 'white' ? 'Blancs' : 'Noirs'} abandonnent.`);
    endGame(winnerColor, 'abandon');
}

function updateControlsState() {
    // Use moveHistoryInternal for undo check
    const canUndo = moveHistoryInternal.length > 0 && !isGameOver && !isStockfishThinking && gameMode !== 'ai-vs-ai';
    const canResign = !isGameOver && gameMode !== 'ai-vs-ai'; // Prevent resigning in AI vs AI
    if (undoButton) undoButton.disabled = !canUndo;
    if (resignButton) resignButton.disabled = !canResign;
}


// --- Move History & Notation (UI specific) ---
function updateMoveListUI(moveNumber, moveSAN, turn) {
    if (!moveListEl) return;
    const moveIndex = moveHistoryInternal.length - 1; // Correlates with internal history for potential future features

    if (turn === 'w') { // White moved
        const listItem = document.createElement('li');
        listItem.dataset.moveIndex = moveIndex; // Link to internal history index
        listItem.innerHTML = `<span class="move-number">${moveNumber}.</span> <span class="move-white">${moveSAN}</span>`;
        moveListEl.appendChild(listItem);
    } else { // Black moved
        let lastItem = moveListEl.lastElementChild;
        if (lastItem && lastItem.querySelectorAll('.move-black').length === 0) {
            const blackMoveSpan = document.createElement('span');
            blackMoveSpan.className = 'move-black';
            blackMoveSpan.textContent = moveSAN;
            lastItem.appendChild(document.createTextNode(' ')); // Add space
            lastItem.appendChild(blackMoveSpan);
        } else {
            // Should not happen in standard chess flow if white always moves first in a turn number
            const listItem = document.createElement('li');
            listItem.dataset.moveIndex = moveIndex;
            listItem.innerHTML = `<span class="move-number">${moveNumber}...</span> <span class="move-black">${moveSAN}</span>`;
            moveListEl.appendChild(listItem);
        }
    }
    moveListEl.scrollTop = moveListEl.scrollHeight;
}

// --- Undo Logic ---
function undoMove() {
    if (moveHistoryInternal.length === 0 || isGameOver || isStockfishThinking || gameMode === 'ai-vs-ai') {
        playSound('illegal');
        return;
    }

    let movesToUndo = 1;
    // If AI just moved (meaning it's human's turn now in AI mode), undo AI move AND human move
    if (gameMode === 'ai' && game.turn() === 'w' && moveHistoryInternal.length >= 2) {
        movesToUndo = 2;
    }

    let lastUndoneMoveData = null;
    for (let i = 0; i < movesToUndo; i++) {
        if (moveHistoryInternal.length === 0) break;

        // Undo in chess.js first
        const undoneMove = game.undo(); // This reverts the board state in the `game` object

        if (!undoneMove) {
            console.error("chess.js undo failed! History might be corrupted.");
            // Attempt to recover? Difficult. Maybe reset?
            return;
        }

        // Remove from our internal history tracker
        lastUndoneMoveData = moveHistoryInternal.pop();

        // Restore captured pieces list
        if (undoneMove.captured) {
            // Determine which capture list to modify
            const capturedPieceFormatted = undoneMove.color === 'w'
                ? undoneMove.captured.toLowerCase() // White captured a black piece (add to capturedBlack list)
                : undoneMove.captured.toUpperCase(); // Black captured a white piece (add to capturedWhite list)

            const targetArray = undoneMove.color === 'w' ? capturedBlack : capturedWhite;

            // Find and remove the *last* instance of the captured piece type
            // (More robust if multiple identical pieces captured)
            const index = targetArray.lastIndexOf(capturedPieceFormatted);
            if (index > -1) {
                targetArray.splice(index, 1);
            } else {
                console.warn(`Undo: Could not find captured piece '${capturedPieceFormatted}' in corresponding capture list.`);
            }
        }
    }

     // --- Update UI After Undo ---
    lastMoveHighlight = moveHistoryInternal.length > 0
        ? game.history({verbose: true}).slice(-1)[0] // Get last move info from chess.js history
        : null;
    if (lastMoveHighlight) {
        lastMoveHighlight = {from: lastMoveHighlight.from, to: lastMoveHighlight.to}; // Keep only needed info
    }


    createBoard(); // Redraw based on restored game state
    updateAllUI(); // Update captured, progress, timers, ratings, turn indicator
    const currentTurnColor = game.turn() === 'w' ? 'Blancs' : 'Noirs';
    updateGameStatus(`Tour(s) précédent(s) annulé(s). Au tour des ${currentTurnColor}.`);
    updateControlsState();
    checkAndUpdateKingStatus(); // Update check highlight

    // Remove the last move(s) from the UI list
    if (moveListEl) {
        for (let i = 0; i < movesToUndo; i++) {
            let lastItem = moveListEl.lastElementChild;
            if (lastItem) {
                let blackMoveSpan = lastItem.querySelector('.move-black');
                if (blackMoveSpan && lastItem.querySelectorAll('.move-white').length > 0) {
                    // If black move exists and white move also exists in the same LI, remove only black
                    blackMoveSpan.previousSibling?.remove(); // Remove space if exists
                    blackMoveSpan.remove();
                } else {
                    // Otherwise, remove the whole list item
                    lastItem.remove();
                }
            }
        }
         moveListEl.scrollTop = moveListEl.scrollHeight; // Scroll after removing
    }

    playSound('click');
}


// --- FEN Parsing & Generation (Simplified using chess.js) ---
// No custom parseFEN or boardToFEN needed. Use game.load(fen) and game.fen().

// --- Game End Condition Checks ---
function checkGameEndConditions() {
    if (isGameOver) return true; // Already ended

    if (game.game_over()) {  // Correct: game.game_over() au lieu de game.isGameOver()
        let reason = "inconnue";
        let winner = 'draw'; // Default to draw unless checkmate

        if (game.in_checkmate()) {  // Remplace game.isCheckmate()
            // Le joueur qui a l'initiative est échec et mat donc son adversaire gagne
            winner = game.turn() === 'b' ? 'white' : 'black';
            reason = "échec et mat";
        } else if (game.in_stalemate()) {  // Remplace game.isStalemate()
            reason = "pat";
        } else if (game.in_threefold_repetition()) {  // Remplace game.isThreefoldRepetition()
            reason = "répétition";
        } else if (game.insufficient_material()) {  // Remplace game.isInsufficientMaterial()
            reason = "matériel insuffisant";
        } else if (game.in_draw()) {  // Remplace game.isDraw()
            reason = "règle des 50 coups";
        }
        endGame(winner, reason);
        return true;
    }
    return false; // Game is not over
}

// --- AI Logic (Stockfish Interaction) ---
function initStockfish() {
    try {
        stockfish = new Worker('stockfish.wasm.js'); // Ensure stockfish.js is accessible
        stockfish.postMessage('uci');
        stockfish.onmessage = handleStockfishMessage;
        stockfish.onerror = (e) => { console.error("Stockfish Error:", e); updateGameStatus("Erreur IA."); isStockfishReady = false; };
    } catch (e) {
        console.error("Failed to init Stockfish Worker:", e);
        updateGameStatus("Erreur: Worker IA non supporté.");
        isStockfishReady = false;
        if (modeAiButton) modeAiButton.disabled = true;
        if (modeAiAiButton) modeAiAiButton.disabled = true;
    }
}

function handleStockfishMessage(event) {
    const message = event.data;
    console.log("Stockfish:", message); // Log all messages for debugging

    if (message === 'uciok') {
        stockfish.postMessage('isready');
    } else if (message === 'readyok') {
        isStockfishReady = true;
        console.log("Stockfish ready.");
        // If AI vs AI and it's AI's turn to start, request move
        if (gameMode === 'ai-vs-ai' && !isGameOver && game.turn() === 'w' && aiDifficultyWhite && aiDifficultyBlack && !isStockfishThinking) {
             requestAiMove();
        } else if (gameMode === 'ai' && !isGameOver && game.turn() === 'b' && !isStockfishThinking) {
            // If AI mode and it's already black's turn (e.g. page reload/state recovery - less likely now)
            // requestAiMove(); // Usually AI move is triggered *after* white moves
        }
    } else if (message.startsWith('bestmove')) {
        isStockfishThinking = false;
        updateControlsState();
        const bestmoveUCI = message.split(' ')[1];

        if (bestmoveUCI && bestmoveUCI !== '(none)') {
            // Directly use the UCI move provided by Stockfish
            handleAiMoveResponse(bestmoveUCI);
        } else {
             console.error("Stockfish returned no valid move or '(none)'.");
             updateGameStatus(`Erreur IA (${game.turn() === 'w' ? 'Blanc' : 'Noir'}) : aucun coup valide.`);
             if (gameMode === 'ai-vs-ai') endGame('draw', 'erreur IA');
        }
    }
    // Ignore other info lines for now (like evaluation)
}

function requestStockfishMove(fen, depth) { // Callback is handled by onmessage
    if (!isStockfishReady) { console.error("Stockfish not ready."); updateGameStatus("IA non prête..."); return; }
    if (isStockfishThinking) { console.warn("Stockfish already thinking."); return; }
    if (isGameOver) return;

    isStockfishThinking = true;
    updateControlsState();
    stockfish.postMessage(`position fen ${fen}`);
    stockfish.postMessage(`go depth ${depth}`);
}

function requestAiMove() {
    if (isGameOver || !isStockfishReady || isStockfishThinking) return;

    const currentTurn = game.turn(); // 'w' or 'b'
    let difficulty, color;

    if (gameMode === 'ai' && currentTurn === 'b') {
        difficulty = aiDifficulty;
        color = 'Noir';
    } else if (gameMode === 'ai-vs-ai') {
        if (currentTurn === 'w') {
            difficulty = aiDifficultyWhite;
            color = 'Blanc';
        } else {
            difficulty = aiDifficultyBlack;
            color = 'Noir';
        }
    } else {
        return; // Not AI's turn or wrong mode
    }

    if (!difficulty) {
        console.error(`AI difficulty not set for ${color}`);
        updateGameStatus(`Erreur: Difficulté IA (${color}) non définie.`);
        if (gameMode === 'ai-vs-ai') endGame('draw', 'erreur config IA');
        return;
    }

    const fen = game.fen(); // Get current FEN from chess.js
    const depth = getAiSearchDepth(difficulty);
    updateGameStatus(`IA (${color} - ${difficulty}) réfléchit (Prof ${depth})...`);
    requestStockfishMove(fen, depth);
}

function getAiSearchDepth(difficulty) {
    const diffLower = difficulty.toLowerCase();
    let searchDepth;
    if (diffLower === 'noob') searchDepth = 1;
    else if (diffLower === 'easy') searchDepth = 2;
    else if (diffLower === 'regular') searchDepth = 3;
    else if (diffLower === 'hard') searchDepth = 4;
    else if (diffLower === 'very hard') searchDepth = 6;
    else if (diffLower === 'super hard') searchDepth = 8;
    else if (diffLower === 'magnus carlsen') searchDepth = 12;
    else if (diffLower === 'unbeatable') searchDepth = 15;
    else if (diffLower === 'adaptative') {
        const ratingDiff = aiRating - playerRating;
        if (ratingDiff < -300) searchDepth = 1;
        else if (ratingDiff < -100) searchDepth = 2;
        else if (ratingDiff < 100) searchDepth = 3;
        else if (ratingDiff < 300) searchDepth = 4;
        else searchDepth = 5;
    }
    else searchDepth = 2; // Default
    return Math.max(1, searchDepth); // Ensure depth is at least 1
}

function handleAiMoveResponse(uciMove) {
    if (isGameOver) {
        isStockfishThinking = false; // Ensure flag is reset
        updateControlsState();
        return;
    }

    console.log(`Stockfish (${game.turn() === 'w' ? 'Blanc' : 'Noir'}) proposed move: ${uciMove}`);

    const fromAlg = uciMove.substring(0, 2);
    const toAlg = uciMove.substring(2, 4);
    const promotion = uciMove.length === 5 ? uciMove.substring(4) : null;

    // --- Optional: Anti-Repetition Cheat (Simpler with chess.js) ---
    let moveChosen = uciMove;
    if (gameMode === 'ai-vs-ai') {
        const tempGame = new Chess(game.fen()); // Create a temporary copy
        const hypotheticalMove = tempGame.move({ from: fromAlg, to: toAlg, promotion: promotion });

        if (hypotheticalMove && tempGame.in_threefold_repetition()) {
            console.warn(`CHEAT: ${game.turn() === 'w' ? 'Blanc' : 'Noir'} allait répéter la position avec ${uciMove}. Cherche alternative...`);
            const legalMoves = game.moves({ verbose: true });
            const alternatives = legalMoves.filter(m => m.san !== hypotheticalMove.san); // Filter out the repeating move SAN

            if (alternatives.length > 0) {
                const randomAlt = alternatives[Math.floor(Math.random() * alternatives.length)];
                moveChosen = randomAlt.from + randomAlt.to + (randomAlt.promotion || '');
                console.log(`CHEAT: Alternative choisie: ${moveChosen} (${randomAlt.san})`);
                updateGameStatus(`IA (${game.turn() === 'w' ? 'Blanc' : 'Noir'}) évite la répétition avec ${randomAlt.san}`);
            } else {
                console.log(`CHEAT: Répétition inévitable avec ${uciMove}, aucune alternative légale.`);
            }
        }
    }
    // --- End Anti-Repetition Cheat ---

    // Parse the potentially modified move
    const finalFromAlg = moveChosen.substring(0, 2);
    const finalToAlg = moveChosen.substring(2, 4);
    const finalPromotion = moveChosen.length === 5 ? moveChosen.substring(4) : null;

    // Execute the chosen move
    const success = makeMove(finalFromAlg, finalToAlg, finalPromotion);

    if (success && !isGameOver) {
         // If AI vs AI, trigger the next AI move after a delay
        if (gameMode === 'ai-vs-ai') {
            setTimeout(requestAiMove, aiDelayEnabled ? AI_DELAY_TIME : 50); // Short delay even if disabled
        }
        // If AI vs Human, control returns to human (no immediate requestAiMove needed here)
    } else if (!success) {
        console.error(`AI (${game.turn()}) tried illegal move: ${moveChosen}. This shouldn't happen with Stockfish.`);
        // Handle error, maybe end game as draw?
        updateGameStatus(`Erreur critique IA: coup illégal ${moveChosen}`);
        if(gameMode === 'ai-vs-ai') endGame('draw', 'erreur critique IA');
         isStockfishThinking = false; // Reset flag on failure too
         updateControlsState();
    }
}

// --- Core Move Execution Logic (using chess.js) ---
function makeMove(fromAlg, toAlg, promotionChoice = null) {
    if (isGameOver) return false;

    // Get current FEN *before* the move for history/undo
    const fenBefore = game.fen();
    const currentTurn = game.turn(); // 'w' or 'b'
    const moveNumber = Math.ceil((game.history().length + 1) / 2);

    // Prepare move object for chess.js
    const moveData = {
        from: fromAlg,
        to: toAlg
    };
    // Add promotion ONLY if it's a valid promotion choice
    if (promotionChoice && ['q', 'r', 'n', 'b'].includes(promotionChoice.toLowerCase())) {
        moveData.promotion = promotionChoice.toLowerCase();
    } else {
        // Check if chess.js thinks it *should* be a promotion
        // This is slightly complex, better to rely on the promotion modal check
        // or ensure AI provides the promotion piece correctly.
        // Let chess.js handle the error if promotion is required but not provided.
    }

    // Attempt the move using chess.js
    const moveResult = game.move(moveData);

    // --- Handle Move Result ---
    if (moveResult === null) {
        // Illegal move according to chess.js
        console.warn(`makeMove: Illegal move attempt: ${fromAlg}-${toAlg} (Promotion: ${promotionChoice})`);
        playSound('illegal');
        // If a piece was selected by human, deselect it
        if (selectedSquareAlg) {
             const selCoord = algToCoord(selectedSquareAlg);
             const squareEl = chessboard.querySelector(`.square[data-row="${selCoord[0]}"][data-col="${selCoord[1]}"]`);
             if (squareEl) squareEl.classList.remove('selected');
             selectedSquareAlg = null;
             highlightMoves([]);
        }
        return false; // Indicate failure
    }

    // --- Move Successful ---

    // 1. Update last move highlight info
    lastMoveHighlight = { from: moveResult.from, to: moveResult.to };

    // 2. Update captured pieces list
    if (moveResult.captured) {
        const capturedPieceType = moveResult.captured.toUpperCase(); // e.g., 'P', 'N'
        if (moveResult.color === 'w') { // White moved and captured a black piece
             capturedBlack.push(moveResult.captured.toLowerCase()); // Store as 'p', 'n' etc.
        } else { // Black moved and captured a white piece
             capturedWhite.push(moveResult.captured.toUpperCase()); // Store as 'P', 'N' etc.
        }
        // Sort captured arrays (optional, for consistent display)
        capturedWhite.sort((a, b) => (pieceValues[b.toLowerCase()] || 0) - (pieceValues[a.toLowerCase()] || 0));
        capturedBlack.sort((a, b) => (pieceValues[b.toLowerCase()] || 0) - (pieceValues[a.toLowerCase()] || 0));
    }

    // 3. Record move for internal history (for undo)
    // We store FEN before the move, and the SAN notation from the result
    moveHistoryInternal.push({ fenBefore: fenBefore, moveSAN: moveResult.san });

    // 4. Update UI move list
    const currentMoveNumber = (currentTurn === 'w') ? moveNumber : moveNumber; // Use number before increment if black moved
    updateMoveListUI(currentMoveNumber, moveResult.san, currentTurn);

    // 5. Play sound based on move flags
    let soundToPlay = 'move';
    if (moveResult.flags.includes('c')) soundToPlay = 'capture'; // Capture
    else if (moveResult.flags.includes('p')) soundToPlay = 'promote'; // Promotion
    else if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) soundToPlay = 'castle'; // Castling
    else if (game.in_check()) soundToPlay = 'check'; // Check (check *after* move)

    // Adjust sound for opponent in Human vs Human?
    if(gameMode === 'human' && soundToPlay === 'move') {
        soundToPlay = currentTurn === 'w' ? 'move' : 'move2';
    }

    playSound(soundToPlay);

    // --- Post-Move Tasks ---
    // No need to switch player - chess.js did it
    createBoard(); // Redraw board with new state from game object
    updateAllUI(); // Update timers, captured pieces, progress bar, ratings, turn indicator
    checkAndUpdateKingStatus(); // Highlight king if needed FOR THE NEW PLAYER

    // Check if the game ended due to this move
    if (!checkGameEndConditions()) {
        // Game continues, update status text
        const nextTurnColor = game.turn() === 'w' ? 'Blancs' : 'Noirs';
        if (game.in_check()) {
            updateGameStatus(`Échec au roi ${nextTurnColor === 'Blancs' ? 'blanc' : 'noir'} !`);
            // Check sound already played above based on game.in_check() after move
        } else {
            updateGameStatus(`Au tour des ${nextTurnColor}.`);
        }
    } else {
        // Game ended, endGame function handles status messages and sounds
    }

    updateControlsState(); // Update button states (e.g., undo)

    return true; // Move was successful
}


// --- User Interaction (Click Handler) ---
function handleSquareClick(event) {
    if (isGameOver || isStockfishThinking || promotionCallback) return; // Ignore clicks if game over, AI thinking, or waiting for promotion

    const currentTurn = game.turn(); // 'w' or 'b'
    const isHumanTurn = (gameMode === 'human' || (gameMode === 'ai' && currentTurn === 'w'));

    if (!isHumanTurn && gameMode !== 'ai-vs-ai') { // Allow clicks to deselect in ai-vs-ai for debugging? No.
         return; // Ignore clicks when not human's turn
    }
     if(gameMode === 'ai-vs-ai') return; // Don't allow any clicks in AI vs AI mode

    const square = event.currentTarget;
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const clickedAlg = coordToAlg(row, col); // Algebraic notation of clicked square

    const pieceOnSquare = game.get(clickedAlg); // { type: 'p', color: 'w' } or null

    if (selectedSquareAlg) {
        // --- Piece Already Selected ---
        const fromAlg = selectedSquareAlg;
        const pieceToMove = game.get(fromAlg); // Get piece info again just in case

        // Case 1: Clicked the same square again - Deselect
        if (clickedAlg === fromAlg) {
            square.classList.remove('selected');
            selectedSquareAlg = null;
            highlightMoves([]);
            playSound('click');
            return;
        }

        // Case 2: Clicked a potential destination square
        // Get legal moves *for the selected piece*
        const legalMovesForPiece = game.moves({ square: fromAlg, verbose: true });
        const isValidTarget = legalMovesForPiece.some(move => move.to === clickedAlg);

        if (isValidTarget) {
            const move = legalMovesForPiece.find(m => m.to === clickedAlg); // Get the specific move details
            let promotionPiece = null;

            // Check for promotion (using flags from chess.js move object)
            if (move && move.flags.includes('p')) {
                 // Need to ask user for promotion choice
                 const playerColor = game.turn() === 'w' ? 'white' : 'black';
                 showPromotionModal(playerColor, (promoChoice) => {
                     if (!promoChoice) { // User cancelled promotion
                         console.log("Promotion cancelled.");
                         // Keep piece selected? Or deselect? Let's deselect for simplicity.
                         selectedSquareAlg = null;
                         highlightMoves([]);
                         const fromSquareEl = chessboard.querySelector(`.square[data-row="${algToCoord(fromAlg)[0]}"][data-col="${algToCoord(fromAlg)[1]}"]`);
                          if(fromSquareEl) fromSquareEl.classList.remove('selected');

                         return;
                     }
                     // Promotion choice made, execute the move
                     const success = makeMove(fromAlg, clickedAlg, promoChoice);
                     if (success && gameMode === 'ai' && game.turn() === 'b') { // Check turn AFTER move
                         setTimeout(requestAiMove, aiDelayEnabled ? AI_DELAY_TIME : 50);
                     }
                 });
                 // Exit handleSquareClick, wait for modal callback

                 // Visually deselect the starting square immediately while modal is up
                 const fromSquareEl = chessboard.querySelector(`.square[data-row="${algToCoord(fromAlg)[0]}"][data-col="${algToCoord(fromAlg)[1]}"]`);
                 if (fromSquareEl) fromSquareEl.classList.remove('selected');
                 highlightMoves([]); // Clear move highlights

                 return; // Stop further processing, wait for modal

            } else {
                // Not a promotion, make the move directly
                 selectedSquareAlg = null; // Deselect logically
                 highlightMoves([]); // Clear highlights
                 const fromSquareEl = chessboard.querySelector(`.square[data-row="${algToCoord(fromAlg)[0]}"][data-col="${algToCoord(fromAlg)[1]}"]`);
                 if (fromSquareEl) fromSquareEl.classList.remove('selected');


                const success = makeMove(fromAlg, clickedAlg); // promotionChoice is null here
                 if (success && gameMode === 'ai' && game.turn() === 'b') { // Check turn AFTER move
                     setTimeout(requestAiMove, aiDelayEnabled ? AI_DELAY_TIME : 50);
                 }
            }

        } else {
             // Case 3: Clicked an invalid destination square
             if (pieceOnSquare && pieceOnSquare.color === currentTurn) {
                 // Clicked another piece of the player's own color - switch selection
                 // Deselect old
                 const oldCoord = algToCoord(selectedSquareAlg);
                 const oldSquareEl = chessboard.querySelector(`.square[data-row="${oldCoord[0]}"][data-col="${oldCoord[1]}"]`);
                 if (oldSquareEl) oldSquareEl.classList.remove('selected');

                 // Select new
                 selectedSquareAlg = clickedAlg;
                 square.classList.add('selected');
                 const newMoves = game.moves({ square: clickedAlg, verbose: true });
                 highlightMoves(newMoves);
                 playSound('click');
             } else {
                 // Clicked empty square or opponent piece - deselect current piece
                 playSound('illegal');
                 const oldCoord = algToCoord(selectedSquareAlg);
                 const oldSquareEl = chessboard.querySelector(`.square[data-row="${oldCoord[0]}"][data-col="${oldCoord[1]}"]`);
                 if (oldSquareEl) oldSquareEl.classList.remove('selected');
                 selectedSquareAlg = null;
                 highlightMoves([]);
             }
         }

    } else if (pieceOnSquare && pieceOnSquare.color === currentTurn) {
        // --- No Piece Selected, Clicked Own Piece --- Select it
        playSound('click');
        selectedSquareAlg = clickedAlg;
        square.classList.add('selected');
        const moves = game.moves({ square: clickedAlg, verbose: true });
        highlightMoves(moves);
    }
    // --- Clicked Empty Square or Opponent Piece without Selection --- Do nothing.
}

// --- Rendering & UI Updates ---
function createBoard() {
    if (!chessboard) return;
    chessboard.innerHTML = '';
    const boardFragment = document.createDocumentFragment();
    const boardData = game.board(); // Get the 8x8 array from chess.js

    for (let rowIndex = 0; rowIndex < 8; rowIndex++) {
        for (let colIndex = 0; colIndex < 8; colIndex++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((rowIndex + colIndex) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = rowIndex;
            square.dataset.col = colIndex;
            const alg = coordToAlg(rowIndex, colIndex); // Get algebraic notation for this square

            // Add labels (optional, can be styled with CSS :before/:after)
            const label = document.createElement('span');
            label.className = 'square-label';
            if (colIndex === 0) label.textContent += (8 - rowIndex); // Rank number on a-file
            if (rowIndex === 7) label.textContent += files[colIndex]; // File letter on 1st rank
            if (label.textContent) square.appendChild(label);


            const pieceInfo = boardData[rowIndex][colIndex]; // { type: 'p', color: 'w' } or null
            if (pieceInfo) {
                const myPieceFormat = chessjsPieceToMyFormat(pieceInfo); // 'P', 'p', etc.
                if (pieceRenderMode === 'ascii') {
                    const pieceElement = document.createElement('span');
                    pieceElement.className = 'piece';
                    pieceElement.textContent = pieces[myPieceFormat]; // Use our lookup for ASCII
                    pieceElement.classList.add(pieceInfo.color === 'w' ? 'white-piece' : 'black-piece');
                    square.appendChild(pieceElement);
                } else if (pieceRenderMode === 'png') {
                    const img = document.createElement('img');
                    let filename = "";
                    // Logic to map myPieceFormat to filename (reuse existing logic)
                    if (myPieceFormat === 'K') filename = "wk.png";
                    else if (myPieceFormat === 'Q') filename = "wq.png";
                    else if (myPieceFormat === 'R') filename = "wr.png";
                    else if (myPieceFormat === 'B') filename = "wb.png";
                    else if (myPieceFormat === 'N') filename = "wkn.png"; // Assuming 'wkn.png' is Knight
                    else if (myPieceFormat === 'P') filename = "wp.png";
                    else if (myPieceFormat === 'k') filename = "bk.png";
                    else if (myPieceFormat === 'q') filename = "bq.png";
                    else if (myPieceFormat === 'r') filename = "br.png";
                    else if (myPieceFormat === 'b') filename = "bb.png";
                    else if (myPieceFormat === 'n') filename = "bkn.png"; // Assuming 'bkn.png' is Knight
                    else if (myPieceFormat === 'p') filename = "bp.png";

                    if (filename) {
                         img.src = `pieces/${filename}`;
                         img.alt = myPieceFormat;
                         img.classList.add("piece");
                         square.appendChild(img);
                    } else {
                        console.warn("Could not find image for piece:", myPieceFormat);
                    }
                }
            }

            // Add click listener
            square.addEventListener('click', handleSquareClick);
             // Update cursor based on game state and turn
             const currentTurn = game.turn();
             const isHumanTurn = gameMode === 'human' || (gameMode === 'ai' && currentTurn === 'w');
             square.style.cursor = (isGameOver || isStockfishThinking || promotionCallback || !isHumanTurn) ? 'default' : 'pointer';


            // Apply last move highlight
            if (lastMoveHighlight && (alg === lastMoveHighlight.from || alg === lastMoveHighlight.to)) {
                square.classList.add('last-move');
            }

            // Apply selection highlight (re-applied after clearing innerHTML)
            if (selectedSquareAlg === alg) {
                square.classList.add('selected');
            }

            boardFragment.appendChild(square);
        }
    }
    chessboard.appendChild(boardFragment);

    // Apply check highlight after board is built
    checkAndUpdateKingStatus();
}

function highlightMoves(moves) { // Expects array of chess.js move objects
    if (!chessboard) return;
    // Clear previous highlights
    chessboard.querySelectorAll('.square.highlight, .square.capture, .square.en-passant-target').forEach(sq => {
        sq.classList.remove('highlight', 'capture', 'en-passant-target');
    });

    moves.forEach(move => {
        const toCoord = algToCoord(move.to);
        if (!toCoord) return;
        const [r, c] = toCoord;
        const square = chessboard.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
        if (square) {
            if (move.flags.includes('c')) { // Capture
                square.classList.add('capture');
                if (move.flags.includes('e')) { // En passant is a capture
                    square.classList.add('en-passant-target'); // Specific style for EP capture target
                }
            } else { // Normal move
                square.classList.add('highlight');
            }
        }
    });
}

function updateAllUI() {
    updateTimerDisplay();
    updateCapturedPieces();
    updateProgressBar();
    updateRatingDisplay();
    updatePlayerTurnIndicator();
    // Move list UI is updated incrementally in makeMove
}

function updateGameStatus(statusText) {
    if (gameStatusEl) gameStatusEl.textContent = statusText;
}

function updateCapturedPieces() {
    // capturedWhite has uppercase chars ('P', 'N') - captured by Black
    // capturedBlack has lowercase chars ('p', 'n') - captured by White
    if (capturedWhiteEl) capturedWhiteEl.innerHTML = capturedBlack.sort((a, b) => (pieceValues[b] || 0) - (pieceValues[a] || 0)).map(p => pieces[p]).join(''); // Render black pieces captured by white
    if (capturedBlackEl) capturedBlackEl.innerHTML = capturedWhite.sort((a, b) => (pieceValues[b.toLowerCase()] || 0) - (pieceValues[a.toLowerCase()] || 0)).map(p => pieces[p]).join(''); // Render white pieces captured by black
}


function updateProgressBar() {
    if (!whiteProgressEl || !blackProgressEl || !scoreAdvantageEl) return;

    // capturedWhite = white pieces captured BY BLACK -> Black's material gain
    // capturedBlack = black pieces captured BY WHITE -> White's material gain
    const whiteMaterialGain = capturedBlack.reduce((sum, pieceChar) => sum + (pieceValues[pieceChar.toLowerCase()] || 0), 0);
    const blackMaterialGain = capturedWhite.reduce((sum, pieceChar) => sum + (pieceValues[pieceChar.toLowerCase()] || 0), 0);
    const diff = whiteMaterialGain - blackMaterialGain; // Positive = White advantage

    const maxAdvantage = 10; // Cap visual difference at +/- 10 points
    const scaledDiff = Math.max(-maxAdvantage, Math.min(maxAdvantage, diff));
    let whitePerc = 50 + (scaledDiff / maxAdvantage) * 50;
    whitePerc = Math.max(0, Math.min(100, whitePerc)); // Clamp 0-100

    whiteProgressEl.style.width = `${whitePerc}%`;
    blackProgressEl.style.width = `${100 - whitePerc}%`;

    if (diff > 0) scoreAdvantageEl.textContent = `+${diff}`;
    else if (diff < 0) scoreAdvantageEl.textContent = `${diff}`; // Already negative
    else scoreAdvantageEl.textContent = '';
    scoreAdvantageEl.className = diff > 0 ? 'score-white' : (diff < 0 ? 'score-black' : '');
}

function checkAndUpdateKingStatus() {
    // Remove previous check highlights first
    chessboard.querySelectorAll('.square.in-check').forEach(sq => sq.classList.remove('in-check'));

    if (isGameOver) return; // No check highlight if game over

    if (game.in_check()) {
        const kingColor = game.turn(); // The king *in check* is the one whose turn it is
        const kingSymbol = kingColor === 'w' ? 'K' : 'k';
        highlightKingin_check(kingSymbol, true);
        // Check sound is played in makeMove now
    }
}

function highlightKingin_check(kingPieceChar, in_check) { // kingPieceChar is 'K' or 'k'
    const boardData = game.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const pieceInfo = boardData[r][c];
            if (pieceInfo && chessjsPieceToMyFormat(pieceInfo) === kingPieceChar) {
                const kingSquare = chessboard.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
                if (kingSquare) {
                    kingSquare.classList.toggle('in-check', in_check);
                }
                return; // Found the king
            }
        }
    }
}

// No findPieceSquareElement needed, integrated into highlightKingin_check

function showPromotionModal(color, callback) {
    if (!promotionModal || !promotionOptionsContainer) {
        console.error("Promotion modal elements not found!");
        callback('q'); // Default to queen if modal fails
        return;
    }

    promotionCallback = callback; // Store the callback

    // Update pieces based on color
    promotionOptionsContainer.innerHTML = ''; // Clear previous
    ['q', 'r', 'n', 'b'].forEach(type => {
        const pieceSymbol = (color === 'white') ? type.toUpperCase() : type.toLowerCase();
        const div = document.createElement('div');
        div.className = 'promotion-piece'; // Assign class for styling/selection
        div.dataset.type = type; // Store 'q', 'r', 'n', 'b'
        // Render using selected mode
         if (pieceRenderMode === 'ascii') {
             div.textContent = pieces[pieceSymbol];
         } else {
             const img = document.createElement('img');
             let filename = "";
             if (color === 'white') {
                 if (type === 'q') filename = "wq.png";
                 else if (type === 'r') filename = "wr.png";
                 else if (type === 'n') filename = "wkn.png";
                 else if (type === 'b') filename = "wb.png";
             } else {
                 if (type === 'q') filename = "bq.png";
                 else if (type === 'r') filename = "br.png";
                 else if (type === 'n') filename = "bkn.png";
                 else if (type === 'b') filename = "bb.png";
             }
             img.src = `pieces/${filename}`;
             img.alt = pieceSymbol;
             img.style.width = '80%'; // Example sizing
             img.style.height = '80%';
             div.appendChild(img);
         }

         // Add click listener directly here or rely on setupMenusAndButtons
         div.onclick = () => {
             if (promotionCallback) {
                 promotionCallback(type); // Pass 'q', 'r', etc.
                 promotionCallback = null;
             }
             promotionModal.style.display = 'none';
         };
        promotionOptionsContainer.appendChild(div);
    });

    promotionModal.style.display = 'block';
}

function showGameEndModal(message) {
    if (!gameEndModal || !gameEndMessageEl) return;
    gameEndMessageEl.textContent = message;
    gameEndModal.style.display = 'block';
}

// --- Timer, Ratings, Sound, Theme, Effects (mostly unchanged) ---
function startTimer() {
    clearInterval(timerInterval);
    if (isGameOver) return;
    timerInterval = setInterval(() => {
        if (isGameOver) { clearInterval(timerInterval); return; }
        const currentTurn = game.turn(); // Check whose turn it is

        if (currentTurn === 'w') {
            whiteTime--;
            if (whiteTime <= 0) { whiteTime = 0; updateTimerDisplay(); endGame('black', 'temps écoulé'); }
        } else {
            blackTime--;
            if (blackTime <= 0) { blackTime = 0; updateTimerDisplay(); endGame('white', 'temps écoulé'); }
        }
        if (!isGameOver) updateTimerDisplay(); // Avoid updating after game ended

        // Play tenseconds sound based on time remaining for the *active* player
         if (!isGameOver && ((currentTurn === 'w' && whiteTime === 10) || (currentTurn === 'b' && blackTime === 10))) {
            playSound('tenseconds');
        }
    }, 1000);
}
function resetTimer() { clearInterval(timerInterval); whiteTime = 600; blackTime = 600; }
function formatTime(s) { const m = Math.floor(s / 60); const sec = s % 60; return `${m}:${sec < 10 ? '0' : ''}${sec}`; }
function updateTimerDisplay() {
    if (!whiteTimeEl || !blackTimeEl) return;
    whiteTimeEl.textContent = formatTime(whiteTime);
    blackTimeEl.textContent = formatTime(blackTime);
    // Highlight if time is low and it's that player's turn (or game just ended maybe?)
    whiteTimeEl.classList.toggle('urgent', whiteTime <= 30 && whiteTime > 0 && !isGameOver );
    blackTimeEl.classList.toggle('urgent', blackTime <= 30 && blackTime > 0 && !isGameOver );
}

function updateStatistics() {
    const gamesPlayedEl = document.getElementById('games-played');
    const winsEl = document.getElementById('wins');
    const lossesEl = document.getElementById('losses');
    const drawsEl = document.getElementById('draws');
    if (gamesPlayedEl) gamesPlayedEl.textContent = gamesPlayed;
    if (winsEl) winsEl.textContent = wins;
    if (lossesEl) lossesEl.textContent = losses;
    if (drawsEl) drawsEl.textContent = draws;
}
function updateRatings(playerWon) { // playerWon: true if White won, false if Black won, null if draw
    if (gameMode !== 'ai') return; // Only update for Player vs AI
    const expectedScore = 1 / (1 + Math.pow(10, (aiRating - playerRating) / 400));
    const actualScore = playerWon === true ? 1 : (playerWon === false ? 0 : 0.5);
    const ratingChange = Math.round(K_FACTOR * (actualScore - expectedScore));
    playerRating += ratingChange;
    aiRating -= ratingChange; // AI rating changes inversely
    // Clamp ratings? (e.g., min 100)
    playerRating = Math.max(100, playerRating);
    aiRating = Math.max(100, aiRating);
    console.log(`Rating change: ${ratingChange}. New Player: ${playerRating}, AI: ${aiRating}`);
    // updateRatingDisplay() is usually called by endGame
}
function updateRatingDisplay() {
    if (!player1RatingEl || !player2RatingEl || !player1NameEl || !player2NameEl) return;
    if (gameMode === 'ai') {
        player1NameEl.textContent = "Joueur"; player2NameEl.textContent = `IA (${aiDifficulty || '?'})`;
        player1RatingEl.textContent = playerRating; player2RatingEl.textContent = aiRating;
    } else if (gameMode === 'human') {
        player1NameEl.textContent = "Joueur 1 (Blanc)"; player2NameEl.textContent = "Joueur 2 (Noir)";
        player1RatingEl.textContent = "----"; player2RatingEl.textContent = "----";
    } else if (gameMode === 'ai-vs-ai') {
        player1NameEl.textContent = `IA Blanc (${aiDifficultyWhite || '?'})`; player2NameEl.textContent = `IA Noir (${aiDifficultyBlack || '?'})`;
        player1RatingEl.textContent = "----"; player2RatingEl.textContent = "----";
    } else { // Default / Main Menu
        player1NameEl.textContent = "Joueur 1"; player2NameEl.textContent = "Joueur 2";
        player1RatingEl.textContent = "----"; player2RatingEl.textContent = "----";
    }
}

function toggleTheme() {
    const body = document.body;
    const icon = themeToggleButton ? themeToggleButton.querySelector('i') : null;
    body.classList.toggle('light-theme');
    const isLight = body.classList.contains('light-theme');
    if (icon) icon.className = isLight ? 'fas fa-sun' : 'fas fa-moon';
    localStorage.setItem('chess-theme', isLight ? 'light' : 'dark');
}

let soundEnabled = true;
const sounds = {}; // Cache Audio objects
function loadSound(name, path) {
    if (!sounds[name]) {
        try {
            sounds[name] = new Audio(path);
            // Optional: Handle loading errors more gracefully
            sounds[name].onerror = () => {
                console.error(`Failed to load sound: ${path}`);
                sounds[name] = null; // Mark as failed
            }
            // sounds[name].oncanplaythrough = () => { console.log(`Sound loaded: ${name}`); }; // Debug loading
        }
        catch (e) { console.error(`Failed to create Audio for ${name}:`, e); sounds[name] = null; }
    }
    return sounds[name];
}
function playSound(soundName) {
    if (!soundEnabled) return;
    const soundPaths = {
        move: 'sounds/move-self.mp3', move2: 'sounds/move-opponent.mp3', capture: 'sounds/capture.mp3',
        castle: 'sounds/castle.mp3', check: 'sounds/move-check.mp3', click: 'sounds/click.mp3',
        promote: 'sounds/promote.mp3', illegal: 'sounds/illegal.mp3', start: 'sounds/game-start.mp3',
        win: 'sounds/game-win.mp3', lose: 'sounds/game-lose.mp3', draw: 'sounds/game-draw.mp3',
        end: 'sounds/game-end.mp3', tenseconds: 'sounds/tenseconds.mp3'
    };
    if (!soundPaths[soundName]) {
        console.warn("Unknown sound name:", soundName);
        return;
    }
    const audio = loadSound(soundName, soundPaths[soundName]);
    if (audio && audio.readyState >= 2) { // Check if ready enough to play
         audio.currentTime = 0; // Rewind
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                 // Autoplay was prevented. This often happens on first load without user interaction.
                 // console.warn(`Sound play failed for ${soundName}:`, error);
                 // You might want to enable sounds only after the first user click.
            });
        }
    } else if (audio) {
        // If not ready, maybe try again shortly? Or just log it.
        // console.warn(`Sound ${soundName} not ready, state: ${audio.readyState}`);
        // Attempt to play anyway, browser might buffer
         audio.currentTime = 0;
         audio.play().catch(e => {/* ignore */});
    }
}
function toggleSound() {
    soundEnabled = !soundEnabled;
    const icon = soundToggleButton ? soundToggleButton.querySelector('i') : null;
    if (icon) icon.className = soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
    localStorage.setItem('chess-sound', soundEnabled ? 'on' : 'off');
    if (soundEnabled) {
        // Preload common sounds after enabling? Or play a confirmation sound.
        playSound('click');
    } else {
        // Stop any currently playing sounds? (More complex)
    }
}

function showToast(message, iconClass = 'fa-info-circle', duration = 3000) {
    const container = document.querySelector('.toast-container');
    if (!container) {
        console.warn("Toast container not found in HTML.");
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas ${iconClass}"></i><span>${message}</span>`;
    container.appendChild(toast);

    // Force reflow to enable animation
    void toast.offsetWidth;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        // Remove from DOM after fade out animation completes
        toast.addEventListener('transitionend', () => {
            if (toast.parentElement) { // Check if still attached
                toast.remove();
            }
        });
         // Fallback removal if transitionend doesn't fire (e.g., display:none)
         setTimeout(() => { if (toast.parentElement) toast.remove(); }, 500); // 500ms should be longer than transition

    }, duration);
}

function showConfetti() {
    // Basic CSS Confetti - Ensure .confetti-container and .confetti CSS exists
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container);
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4CAF50', '#ffeb3b', '#ffc107', '#ff9800'];
    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = `${Math.random() * 100}vw`;
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = `${Math.random() * 2}s`;
        confetti.style.animationDuration = `${3 + Math.random() * 2}s`;
        container.appendChild(confetti);
    }
    setTimeout(() => { container.remove(); }, 5000); // Remove after animations likely finish
}

// --- Functions Removed (Now Handled by chess.js or Refactored) ---
// getPossibleMovesWithoutCheck
// isSquareAttacked
// isKingin_check (use game.in_check())
// wouldKingBein_check
// getPossibleMoves (use game.moves())
// getAllLegalMoves (use game.moves())
// updateCastlingRights
// updateCastlingRightsIfRookCaptured
// canCastle
// boardToFEN (use game.fen())
// parseFEN (use game.load())
// checkThreefoldRepetition (use game.isThreefoldRepetition())
// checkInsufficientMaterial (use game.isInsufficientMaterial())
// getAlgebraicNotation (use moveResult.san from game.move())
// recordMove (integrated logic into makeMove, using moveHistoryInternal)
// getResultanteFenKeyAfterMove (removed anti-repetition cheat or simplified it)
// boardToSimpleFENKey
// moveToUCI

console.log("scripts-v3.js (using chess.js) loaded.");
// --- END OF FILE scripts-v3.js ---