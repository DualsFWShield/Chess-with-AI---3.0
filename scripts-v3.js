// --- START OF FILE scripts-v1.js ---

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
const TIME_SETTINGS = { // Time in seconds
    standard: 600, // 10 minutes
    blitz: 180,    // 3 minutes
    unlimited: 999999 // Effectively unlimited (used as flag)
};

import { PUZZLE } from './puzzle.js';

// --- Game Instance (using chess.js) ---
let game = new Chess(); // The core game logic handler

// --- Game State Variables (Managed Externally or UI-Related) ---
let pieceRenderMode = 'png'; // 'png' or 'ascii'
let whiteTime = TIME_SETTINGS.standard; // Default time
let blackTime = TIME_SETTINGS.standard;
let timerInterval;
let moveHistoryUI = []; // Array of simple move notations for display { moveNumber, white, black }
let moveHistoryInternal = []; // Stores { fenBefore, moveSAN } for undo
let selectedSquareAlg = null; // Algebraic notation of selected square (e.g., 'e2')
let lastMoveHighlight = null; // { from: 'e2', to: 'e4' } algebraic notation
let isGameOver = false;
let gameMode = ''; // "human", "ai", "ai-vs-ai"
let selectedTimeMode = 'standard'; // 'standard', 'blitz', 'unlimited'
let aiDifficulty = '';
let aiDifficultyWhite = '';
let aiDifficultyBlack = '';
let capturedWhite = []; // Store piece chars ('P', 'N', etc.) captured BY BLACK
let capturedBlack = []; // Store piece chars ('p', 'n', etc.) captured BY WHITE
let promotionCallback = null; // Stores the callback for promotion choice
let isReviewing = false; // Flag for game review state
let autoFlipEnabled = true; // Default to auto-flipping in H vs H mode

// --- Statistics & Ratings ---
let gamesPlayed = 0, wins = 0, losses = 0, draws = 0;
let playerRating = 1200;
let aiRating = 1200; // Generic AI rating, could be specific per difficulty later

// --- Stockfish Worker ---
let stockfish;
let isStockfishReady = false;
let isStockfishThinking = false;
let aiDelayEnabled = true; // Active ou désactive le délai pour l'IA
const AI_DELAY_TIME = 1000; // Délai en millisecondes (1s) - Reduced slightly

// --- UI Elements (Cache them) ---
const whiteTimeEl = document.getElementById('white-time');
const blackTimeEl = document.getElementById('black-time');
const gameStatusEl = document.getElementById('game-status');
const capturedWhiteEl = document.getElementById('captured-white');
const capturedBlackEl = document.getElementById('captured-black');
const whiteProgressEl = document.getElementById('white-progress');
const blackProgressEl = document.getElementById('black-progress');
const scoreAdvantageEl = document.getElementById('score-advantage');
const playerInfoWhiteEl = document.querySelector('.player-info-white');
const playerInfoBlackEl = document.querySelector('.player-info-black');
const player1RatingEl = playerInfoWhiteEl?.querySelector('.player-rating'); // More specific selectors
const player2RatingEl = playerInfoBlackEl?.querySelector('.player-rating');
const player1NameEl = playerInfoWhiteEl?.querySelector('.player-name');
const player2NameEl = playerInfoBlackEl?.querySelector('.player-name');
const moveListEl = document.getElementById('move-list');
const undoButton = document.getElementById('undo-button');
const resignButton = document.getElementById('resign-button');
const analyzeButton = document.getElementById('analyze-button'); // New analyze button
const exportButton = document.getElementById('export-button'); // New export button
const promotionModal = document.getElementById('promotion-modal');
const promotionOptionsContainer = promotionModal ? promotionModal.querySelector('.promotion-options') : null;
const gameEndModal = document.getElementById('game-end-modal');
const gameEndMessageEl = document.getElementById('game-end-message');
const playAgainButton = document.getElementById('play-again'); // Replay with same settings
const mainMenuButton = document.getElementById('main-menu-button'); // Go back to main menu
const analyzeGameModalButton = document.getElementById('analyze-game-modal-button'); // Analyze from modal
const themeToggleButton = document.getElementById('theme-toggle');
const soundToggleButton = document.getElementById('sound-toggle');
const pieceRenderToggle = document.getElementById('piece-render-toggle');
const aiDelayToggle = document.getElementById('ai-delay-toggle');
const mainMenuEl = document.getElementById('main-menu');
const timeSelectionEl = document.getElementById('time-selection'); // New time selection menu
const difficultySelectionEl = document.getElementById('difficulty-selection');
const aiVsAiDifficultySelectionEl = document.getElementById('ai-vs-ai-difficulty-selection');
const gameLayoutEl = document.querySelector('.game-layout'); // Main game area container
const statsContainerEl = document.getElementById('statistics'); // Stats container

// Back buttons
const backToModeButton = document.getElementById('back-to-mode');
const backToModeAivsAiButton = document.getElementById('back-to-mode-aivsai');
const backToTimeButton = document.getElementById('back-to-time');

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

function chessjsPieceToMyFormat(pieceInfo) {
    if (!pieceInfo) return '';
    return pieceInfo.color === 'w' ? pieceInfo.type.toUpperCase() : pieceInfo.type.toLowerCase();
}

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
    // Cache essential elements early
    const flipBoardToggle = document.getElementById('flip-board-toggle'); // Cache here

    initStockfish();
    setupMenusAndButtons();
    loadSavedSettings(); // Now flipBoardToggle exists when this calls updateFlipButtonVisualState
    updateStatistics(); // Load potentially saved stats
    updateRatingDisplay(); // Initial display based on defaults
    preloadAllSounds();
    if (gameStatusEl) gameStatusEl.textContent = "Choisissez un mode de jeu.";
    else console.error("Element with ID 'game-status' not found.");

    // Check essential elements
    const essentialElements = {
        mainMenuEl, timeSelectionEl, difficultySelectionEl, aiVsAiDifficultySelectionEl,
        gameEndModal, promotionModal, promotionOptionsContainer, chessboard,
        playerInfoWhiteEl, playerInfoBlackEl, gameLayoutEl, statsContainerEl,
        analyzeButton, exportButton, analyzeGameModalButton, mainMenuButton
    };
    for (const key in essentialElements) {
        if (!essentialElements[key]) console.error(`Essential element missing: ${key}`);
    }

    if (pieceRenderToggle) pieceRenderToggle.addEventListener('click', togglePieceRenderMode);
    else console.warn("Piece render toggle button not found.");

    if (aiDelayToggle) {
        aiDelayToggle.addEventListener('click', toggleAIDelay);
        aiDelayToggle.innerHTML = `<i class="fas fa-clock"></i> ${aiDelayEnabled ? 'ON' : 'OFF'}`; // Initial state with icon
    } else console.warn("Bouton 'ai-delay-toggle' non trouvé.");

    // Event listener setup for flipBoardToggle (no need to re-assign here)
    if (flipBoardToggle) {
        flipBoardToggle.addEventListener('click', toggleAutoFlip);
        // updateFlipButtonVisualState(); // This is called within loadSavedSettings now
    } else console.warn("Button 'flip-board-toggle' not found.");

    // Hide game layout initially
    if (gameLayoutEl) gameLayoutEl.style.display = 'none';
    if (statsContainerEl) statsContainerEl.style.display = 'none';
});

// --- Setup Functions ---
function setupMenusAndButtons() {
    // Main Menu Mode Buttons
    const modeButtons = [
        { id: 'mode-ai', mode: 'ai' },
        { id: 'mode-human', mode: 'human' },
        { id: 'mode-ai-ai', mode: 'ai-vs-ai' }
    ];
    modeButtons.forEach(({ id, mode }) => {
        const button = document.getElementById(id);
        if (button) button.addEventListener('click', () => setupGameMode(mode));
        else console.warn(`Button '${id}' not found.`);
    });

    // Add analysis board button event listener
    const analysisButton = document.getElementById('mode-analysis-board');
    if (analysisButton) {
        analysisButton.addEventListener('click', () => {
            // Reset the main game state before navigating
            returnToMainMenu();
            // Clear any previously saved game intended for review
            localStorage.removeItem('reviewGamePGN');
            // Navigate to the review page (analysis board)
            window.location.href = 'review.html';
        });
    } else {
        console.warn("Button 'mode-analysis-board' not found.");
    }

    // Puzzle Mode Button
    const puzzleModeButton = document.getElementById('mode-puzzle');
    if (puzzleModeButton) puzzleModeButton.addEventListener('click', () => setupGameMode('puzzle'));
    else console.warn("Button 'mode-puzzle' not found.");

    // Add listeners for puzzle buttons
    const hintButton = document.getElementById('hint-button');
    if (hintButton) hintButton.addEventListener('click', showHint);
    else console.warn("Button 'hint-button' not found.");

    const nextPuzzleButton = document.getElementById('next-puzzle-button');
    if (nextPuzzleButton) nextPuzzleButton.addEventListener('click', startPuzzleSession);
    else console.warn("Button 'next-puzzle-button' not found.");

    const exitPuzzleButton = document.getElementById('exit-puzzle-button');
    if (exitPuzzleButton) exitPuzzleButton.addEventListener('click', returnToMainMenu);
    else console.warn("Button 'exit-puzzle-button' not found.");

    // Time Selection Buttons
    if (timeSelectionEl) {
        timeSelectionEl.querySelectorAll('.time-button').forEach(button => {
            button.addEventListener('click', () => {
                selectedTimeMode = button.dataset.time;
                timeSelectionEl.style.display = 'none';
                // Proceed based on the stored gameMode (set in setupGameMode)
                if (gameMode === 'ai') {
                    if (difficultySelectionEl) difficultySelectionEl.style.display = 'block';
                } else if (gameMode === 'human') {
                    startGame(); // Start human vs human directly after time selection
                }
            });
        });
    } else console.error("Time selection element not found.");

    // Difficulty Selections (Player vs AI)
    if (difficultySelectionEl) {
        difficultySelectionEl.querySelectorAll('.difficulty-button').forEach(button => {
            button.addEventListener('click', () => {
                aiDifficulty = button.dataset.difficulty;
                difficultySelectionEl.style.display = 'none';
                startGame(); // Start game after difficulty selection
            });
        });
    }

    // Difficulty Selections (AI vs AI)
    if (aiVsAiDifficultySelectionEl) {
        aiVsAiDifficultySelectionEl.querySelectorAll('.difficulty-button').forEach(button => {
            button.addEventListener('click', () => handleAiVsAiDifficultySelection(button));
        });
    }

     // Back Buttons
     if (backToModeButton) backToModeButton.addEventListener('click', () => showScreen(mainMenuEl, [timeSelectionEl]));
     if (backToModeAivsAiButton) backToModeAivsAiButton.addEventListener('click', () => showScreen(mainMenuEl, [aiVsAiDifficultySelectionEl]));
     if (backToTimeButton) backToTimeButton.addEventListener('click', () => showScreen(timeSelectionEl, [difficultySelectionEl]));

    // In-Game Controls
    if (undoButton) undoButton.addEventListener('click', undoMove);
    else console.warn("Button 'undo-button' not found.");
    if (resignButton) resignButton.addEventListener('click', resignGame);
    else console.warn("Button 'resign-button' not found.");
    if (analyzeButton) analyzeButton.addEventListener('click', initiateGameReview); // Connect analyze button
    else console.warn("Button 'analyze-button' not found.");
    if (exportButton) exportButton.addEventListener('click', exportGamePGN); // Connect export button
    else console.warn("Button 'export-button' not found.");

    // Modals & Controls
    if (playAgainButton) playAgainButton.onclick = startGame; // Replay same settings
    else console.warn("Button 'play-again' not found.");
    if (mainMenuButton) mainMenuButton.onclick = returnToMainMenu; // Back to main menu
    else console.warn("Button 'main-menu-button' not found.");
    if (analyzeGameModalButton) analyzeGameModalButton.onclick = initiateGameReview; // Analyze from modal
    else console.warn("Button 'analyze-game-modal-button' not found.");

    if (themeToggleButton) themeToggleButton.addEventListener('click', toggleTheme);
    else console.warn("Button 'theme-toggle' not found.");
    if (soundToggleButton) soundToggleButton.addEventListener('click', toggleSound);
    else console.warn("Button 'sound-toggle' not found.");

    // Promotion Modal Setup (Assuming HTML structure exists)
    setupPromotionModal();
}

function toggleAutoFlip() {
    autoFlipEnabled = !autoFlipEnabled;
    console.log(`Auto-flip board set to: ${autoFlipEnabled}`);
    localStorage.setItem('chess-auto-flip', autoFlipEnabled ? 'on' : 'off');
    updateFlipButtonVisualState();
    playSound('click');

    // Redraw the board immediately if in a human vs human game
    if (gameMode === 'human' && !isGameOver && !isReviewing) {
        createBoard(); // Redraw with the current player's perspective based on the new setting
    }
}

function updateFlipButtonVisualState() {
    const flipBoardToggle = document.getElementById('flip-board-toggle'); // Re-get element or ensure it's passed/available globally
    if (!flipBoardToggle) return;
    // Example: Add/remove an 'active' class or change icon opacity/color
    flipBoardToggle.classList.toggle('active', autoFlipEnabled);
    // Or change the icon itself:
    // const icon = flipBoardToggle.querySelector('i');
    // if (icon) icon.className = autoFlipEnabled ? 'fas fa-sync-alt active' : 'fas fa-sync-alt';
}

// Helper to switch between menu/game screens
function showScreen(screenToShow, screensToHide = []) {
    const allScreens = [
        mainMenuEl, timeSelectionEl, difficultySelectionEl,
        aiVsAiDifficultySelectionEl, gameLayoutEl, statsContainerEl
    ];
    allScreens.forEach(screen => {
        if (screen) screen.style.display = 'none';
    });
    screensToHide.forEach(screen => {
        if (screen) screen.style.display = 'none';
    });
    if (screenToShow) screenToShow.style.display = screenToShow.classList.contains('menu-container') ? 'block' : 'grid'; // Use grid for game layout

     // Show stats container only when game layout is shown and mode is AI
     if (screenToShow === gameLayoutEl && gameMode === 'ai' && statsContainerEl) {
         statsContainerEl.style.display = 'block';
     } else if (statsContainerEl) {
         statsContainerEl.style.display = 'none';
     }
}


function setupGameMode(mode) {
    gameMode = mode;
    console.log("Selected game mode:", mode);
    showScreen(null, [mainMenuEl, timeSelectionEl, difficultySelectionEl, aiVsAiDifficultySelectionEl]); // Hide all menus

    if (mode === 'ai' || mode === 'human') {
         if (timeSelectionEl) timeSelectionEl.style.display = 'block';
         else console.error("Time selection screen not found!");
    } else if (mode === 'ai-vs-ai') {
         if (aiVsAiDifficultySelectionEl) {
            selectedTimeMode = 'unlimited';
            aiVsAiDifficultySelectionEl.style.display = 'block';
            aiDifficultyWhite = ''; aiDifficultyBlack = '';
            aiVsAiDifficultySelectionEl.querySelectorAll('button.selected').forEach(b => b.classList.remove('selected'));
         } else console.error("AI vs AI difficulty screen not found!");
    } else if (mode === 'puzzle') {
        // Directly start the puzzle session
        startPuzzleSession();
    }
}

function setupPromotionModal() {
    // This function assumes the HTML for pieces is added dynamically by showPromotionModal
    // It sets up the container interaction if needed, but click logic is now per-piece in showPromotionModal
    if (!promotionModal) return;
    // Close modal if clicking outside the content?
    promotionModal.addEventListener('click', (event) => {
        if (event.target === promotionModal) { // Clicked on backdrop
             if (promotionCallback) {
                 promotionCallback(null); // Indicate cancellation
                 promotionCallback = null;
             }
             promotionModal.classList.remove('show');
             // Re-enable board interaction if needed
        }
    });
}


function handleAiVsAiDifficultySelection(button) {
    if (!aiVsAiDifficultySelectionEl) return;
    const color = button.dataset.color;
    const difficulty = button.dataset.difficulty;
    const group = button.closest('.ai-diff-group');
    if (!group) return;

    // Deselect others in the same group
    group.querySelectorAll('.difficulty-button').forEach(b => b.classList.remove('selected'));
    button.classList.add('selected');

    if (color === 'white') aiDifficultyWhite = difficulty;
    else if (color === 'black') aiDifficultyBlack = difficulty;

    // Check if both are selected
    if (aiDifficultyWhite && aiDifficultyBlack) {
        aiVsAiDifficultySelectionEl.style.display = 'none';
        startGame(); // Start AI vs AI game
    }
}

function returnToMainMenu() {
    showGameEndModal(false);
    document.body.classList.remove('puzzle-mode-active'); // Remove puzzle class
    showScreen(mainMenuEl);
    resetTimer();
    isGameOver = true; // Mark any active game/puzzle as finished
    clearInterval(timerInterval);
    if (gameStatusEl) gameStatusEl.textContent = "Choisissez un mode de jeu.";
    updateRatingDisplay();
    resetBoardState(); // Full main game reset
    game = new Chess(); // Reset main chess instance

    showScreen(mainMenuEl);
    document.body.classList.remove('game-active', 'puzzle-mode-active'); // Remove specific mode classes

    // Stop the puzzle if it's running
    if (gameMode === 'puzzle') {
        PUZZLE.stopPuzzle(); // Call the stop method from the PUZZLE module
    }

    // Reset progress bar visibility if it was hidden
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.visibility = 'visible';

    // Reset puzzle-specific button visibility (handled by showScreen usually, but belt-and-suspenders)
    if (hintButton) hintButton.style.display = 'none';
    if (nextPuzzleButton) nextPuzzleButton.style.display = 'none';
     if (exitPuzzleButton) exitPuzzleButton.style.display = 'none';

    // Ensure standard controls are potentially visible again (updateControlsState will refine)
    if (undoButton) undoButton.style.display = 'flex';
    if (resignButton) resignButton.style.display = 'flex';
     // etc. for analyze/export
}


function resetBoardState() {
    game = new Chess(); // Reset the game state using chess.js default start position
    moveHistoryUI = [];
    moveHistoryInternal = [];
    selectedSquareAlg = null;
    lastMoveHighlight = null;
    isGameOver = false;
    capturedWhite.length = 0;
    capturedBlack.length = 0;
    isStockfishThinking = false;
    isReviewing = false;
    promotionCallback = null;

    if (moveListEl) moveListEl.innerHTML = '';
    updateGameStatus("Nouvelle partie !");
    if(chessboard) chessboard.innerHTML = ''; // Clear board visually
    updateCapturedPieces();
    updateProgressBar();
    updateTimerDisplay(); // Reset display
    updateControlsState();
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
         aiDelayToggle.innerHTML = `${aiDelayEnabled ? 'ON' : 'OFF'}`;
    }

    // Piece Render Mode
    const renderSetting = localStorage.getItem('chess-render-mode');
    pieceRenderMode = (renderSetting === 'ascii') ? 'ascii' : 'png'; // Default to png
    // Update button icon?
    const renderIcon = pieceRenderToggle?.querySelector('i');
    if (renderIcon) {
         // Maybe change icon based on mode? e.g., fa-font vs fa-image
         renderIcon.className = pieceRenderMode === 'ascii' ? 'fas fa-font' : 'fas fa-chess-pawn';
    }

     // Load stats (simple example, only player rating for now)
     const savedRating = localStorage.getItem('chess-player-rating');
     if (savedRating) {
         playerRating = parseInt(savedRating, 10) || 1200;
     }
     // Could load gamesPlayed, wins etc. similarly

    const flipSetting = localStorage.getItem('chess-auto-flip');
    // Default to 'on' if not set or invalid
    autoFlipEnabled = (flipSetting === 'off') ? false : true;
    updateFlipButtonVisualState();
}

function togglePieceRenderMode() {
    pieceRenderMode = (pieceRenderMode === 'ascii') ? 'png' : 'ascii';
    localStorage.setItem('chess-render-mode', pieceRenderMode);
    const renderIcon = pieceRenderToggle?.querySelector('i');
     if (renderIcon) {
         renderIcon.className = pieceRenderMode === 'ascii' ? 'fas fa-font' : 'fas fa-chess-pawn';
     }
    createBoard(); // Redraw board with new mode
    console.log(`Piece render mode switched to: ${pieceRenderMode}`);
}

function toggleAIDelay() {
    aiDelayEnabled = !aiDelayEnabled;
    console.log(`AI Delay ${aiDelayEnabled ? 'Activé' : 'Désactivé'}`);
    if (aiDelayToggle) {
         aiDelayToggle.innerHTML = `<i class="fas fa-clock"></i> ${aiDelayEnabled ? 'ON' : 'OFF'}`;
    }
    localStorage.setItem('chess-ai-delay', aiDelayEnabled ? 'on' : 'off');
}

// --- Game Flow & Control ---
function startGame() {
    console.log(`Starting game: Mode=${gameMode}, Time=${selectedTimeMode}, AI=${aiDifficulty || (aiDifficultyWhite + '/' + aiDifficultyBlack)}`);
    showGameEndModal(false); // Ensure end modal is hidden
    resetBoardState(); // Clean state

    // Set initial time based on selection
    whiteTime = TIME_SETTINGS[selectedTimeMode] || TIME_SETTINGS.standard;
    blackTime = TIME_SETTINGS[selectedTimeMode] || TIME_SETTINGS.standard;
    updateTimerDisplay(); // Show initial time

    showScreen(gameLayoutEl); // Show the main game layout

    createBoard(); // Draw the initial board
    updateAllUI(); // Update captured, progress, timers, ratings
    startTimer();
    playSound('start');

    if (gameMode === 'ai-vs-ai') {
        if (!aiDifficultyWhite || !aiDifficultyBlack) {
            console.error("AI vs AI mode but difficulties not set.");
            updateGameStatus("Erreur: Difficultés IA non définies.");
            returnToMainMenu(); // Go back if config error
            return;
        }
        // AI vs AI starts immediately (or after short delay) if Stockfish ready
        setTimeout(() => {
            if (!isGameOver && isStockfishReady && game.turn() === 'w') requestAiMove();
        }, 500);
    } else if (gameMode === 'ai' && game.turn() === 'b') {
         // Should not happen on fresh start, but handle just in case
         setTimeout(() => {
            if (!isGameOver && isStockfishReady) requestAiMove();
        }, 500);
    } else {
        updateGameStatus("Les blancs commencent.");
    }
    updateControlsState(); // Set initial button states
    updatePlayerTurnIndicator();
    updateRatingDisplay(); // Update names/ratings based on mode
}

function updatePlayerTurnIndicator(puzzlePlayerTurnColor = null) {
    if (!playerInfoWhiteEl || !playerInfoBlackEl) return;

    let whiteActive = false;
    let blackActive = false;

    if (gameMode === 'puzzle') {
        // Highlight based on the puzzle's player turn, passed in
        const puzzleInfo = PUZZLE.getCurrentPuzzleData();
        if (puzzleInfo?.isPlayerTurn) {
             if (puzzleInfo.playerColor === 'w') whiteActive = true;
             else blackActive = true;
        }
    } else if (!isGameOver) {
        // Original logic for AI/Human modes
        const currentTurn = game.turn();
        whiteActive = currentTurn === 'w';
        blackActive = currentTurn === 'b';
    }

    playerInfoWhiteEl.classList.toggle('active-player', whiteActive);
    playerInfoBlackEl.classList.toggle('active-player', blackActive);
}

function endGame(winner, reason) {
    if (isGameOver) return; // Prevent multiple calls
    isGameOver = true;
    clearInterval(timerInterval);
    if (isStockfishThinking && stockfish) {
        stockfish.postMessage('stop'); // Try to stop Stockfish if it was thinking
        isStockfishThinking = false;
    }

    gamesPlayed++;
    let message = '';
    let sound = 'end';
    let playerWonVsAI = null; // null for draw, true for player win, false for AI win

    if (winner === 'draw') {
        draws++;
        message = `Match nul (${reason}).`;
        sound = 'draw';
        playerWonVsAI = null;
    } else {
        const winnerColorText = winner === 'white' ? 'Blancs' : 'Noirs';
        message = `Victoire des ${winnerColorText} (${reason}).`;
        if (gameMode === 'ai') {
            // Assuming player is always White vs AI for rating purposes
            if (winner === 'white') {
                wins++;
                sound = 'win';
                showConfetti();
                playerWonVsAI = true;
            } else {
                losses++;
                sound = 'lose';
                playerWonVsAI = false;
            }
            updateRatings(playerWonVsAI); // Update Elo based on result vs AI
        } else if (gameMode === 'human') {
            sound = (winner === 'white') ? 'win' : 'lose'; // Simple win/lose sounds
             if (winner === 'white') showConfetti(); // Confetti for white win
        } else { // AI vs AI
             sound = 'end';
        }
    }

    updateStatistics(); // Update stats display
    updateRatingDisplay(); // Display potentially changed Elo
    updateGameStatus(message); // Show final status on board wrapper
    showGameEndModal(true, message); // Show the modal with the result
    playSound(sound);
    updateControlsState(); // Disable undo/resign, enable analyze/export
    updatePlayerTurnIndicator(); // Clear active player highlight
}

function resignGame() {
    if (isGameOver || gameMode === 'ai-vs-ai' || isReviewing) return; // Cannot resign AIvAI or during review
    const loserColor = game.turn() === 'w' ? 'Blancs' : 'Noirs';
    const winner = game.turn() === 'w' ? 'black' : 'white';
    updateGameStatus(`Les ${loserColor} abandonnent.`);
    endGame(winner, 'abandon');
}

function updateControlsState() {
    const historyExists = moveHistoryInternal.length > 0;
    const canUndo = historyExists && !isGameOver && !isStockfishThinking && !isReviewing && gameMode !== 'ai-vs-ai';
    // Allow resign unless game over, AIvAI, or reviewing
    const canResign = !isGameOver && !isReviewing && gameMode !== 'ai-vs-ai';
    // Allow analyze only when game is over and not already reviewing
    const canAnalyze = isGameOver && !isReviewing && historyExists;
     // Allow export if history exists and not reviewing (allow during game)
    const canExport = historyExists && !isReviewing;

    if (undoButton) undoButton.disabled = !canUndo;
    if (resignButton) resignButton.disabled = !canResign;
    if (analyzeButton) analyzeButton.disabled = !canAnalyze; // Button in game controls is for post-game analysis now
    if (exportButton) exportButton.disabled = !canExport;

    // Also update modal analyze button state
    if (analyzeGameModalButton) analyzeGameModalButton.disabled = !canAnalyze;
}


// --- Move History & Notation (UI specific) ---
function updateMoveListUI(moveNumber, moveSAN, turn) {
    if (!moveListEl) return;
    const moveIndex = moveHistoryInternal.length - 1; // Correlates with internal history index

    if (turn === 'w') { // White moved
        const listItem = document.createElement('li');
        listItem.dataset.moveIndex = moveIndex;
        listItem.innerHTML = `<span class="move-number">${moveNumber}.</span> <span class="move-white">${moveSAN}</span>`;
        moveListEl.appendChild(listItem);
    } else { // Black moved
        let lastItem = moveListEl.lastElementChild;
        // Ensure we are adding to the correct move number item
        if (lastItem && lastItem.dataset.moveIndex == moveIndex -1 && lastItem.querySelectorAll('.move-black').length === 0) {
            const blackMoveSpan = document.createElement('span');
            blackMoveSpan.className = 'move-black';
            blackMoveSpan.textContent = moveSAN;
            lastItem.appendChild(document.createTextNode(' ')); // Add space
            lastItem.appendChild(blackMoveSpan);
        } else {
            // If white didn't move first (e.g., loaded FEN?) or issue, create new item
            const listItem = document.createElement('li');
            listItem.dataset.moveIndex = moveIndex;
             // Use '...' if black moved first in the number pair technically
            listItem.innerHTML = `<span class="move-number">${moveNumber}. ...</span> <span class="move-black">${moveSAN}</span>`;
            moveListEl.appendChild(listItem);
        }
    }
    moveListEl.scrollTop = moveListEl.scrollHeight; // Auto-scroll
}

// --- Undo Logic ---
function undoMove() {
     // Allow undo only if not game over, not AI thinking/reviewing, not AIvsAI, and history exists
    if (isGameOver || isStockfishThinking || isReviewing || gameMode === 'ai-vs-ai' || moveHistoryInternal.length === 0) {
        playSound('illegal');
        return;
    }

    let movesToUndo = 1;
    // In Player vs AI mode, if it's currently Player's turn (meaning AI just moved), undo both moves.
    if (gameMode === 'ai' && game.turn() === 'w' && moveHistoryInternal.length >= 2) {
        movesToUndo = 2;
    }

    console.log(`Attempting to undo ${movesToUndo} move(s).`);

    for (let i = 0; i < movesToUndo; i++) {
        if (moveHistoryInternal.length === 0) break;

        const undoneMoveChessjs = game.undo(); // Undo in chess.js

        if (!undoneMoveChessjs) {
            console.error("chess.js undo failed! History might be corrupted.");
            showToast("Erreur lors de l'annulation.", 'fa-times-circle', 4000);
            return; // Stop undo process
        }

        // Remove from our internal history tracker
        moveHistoryInternal.pop();

        // Restore captured pieces list based on chess.js undo info
        if (undoneMoveChessjs.captured) {
            // Piece color determines who captured: if white moved (undoneMoveChessjs.color === 'w'), they captured a black piece.
            const capturedPieceFormatted = undoneMoveChessjs.color === 'w'
                ? undoneMoveChessjs.captured.toLowerCase() // White captured black piece ('p'), remove from capturedBlack
                : undoneMoveChessjs.captured.toUpperCase(); // Black captured white piece ('P'), remove from capturedWhite

            const targetArray = undoneMoveChessjs.color === 'w' ? capturedBlack : capturedWhite;

            const index = targetArray.lastIndexOf(capturedPieceFormatted);
            if (index > -1) {
                targetArray.splice(index, 1);
                console.log(`Undo: Restored captured piece '${capturedPieceFormatted}' from list.`);
            } else {
                console.warn(`Undo: Could not find captured piece '${capturedPieceFormatted}' in corresponding capture list.`);
            }
        }
    }

    // --- Update UI After Undo ---
    // Get the last move from chess.js history *after* undo
    const lastMoveVerbose = game.history({ verbose: true });
    lastMoveHighlight = lastMoveVerbose.length > 0
        ? { from: lastMoveVerbose[lastMoveVerbose.length - 1].from, to: lastMoveVerbose[lastMoveVerbose.length - 1].to }
        : null;

    createBoard(); // Redraw based on restored game state
    updateAllUI(); // Update captured, progress, timers, ratings, turn indicator
    const currentTurnColor = game.turn() === 'w' ? 'Blancs' : 'Noirs';
    updateGameStatus(`Coup(s) annulé(s). Au tour des ${currentTurnColor}.`);
    updateControlsState();
    checkAndUpdateKingStatus(); // Update check highlight

    // Remove the last move(s) from the UI list
    if (moveListEl) {
        for (let i = 0; i < movesToUndo; i++) {
             if(moveListEl.lastElementChild) {
                 // Check if the last element contains both white and black moves
                 const lastLi = moveListEl.lastElementChild;
                 const hasWhiteMove = lastLi.querySelector('.move-white');
                 const hasBlackMove = lastLi.querySelector('.move-black');

                 // If we are undoing black's move (movesToUndo=1 and last move was black, or movesToUndo=2 and this is the second undo)
                 // and the LI contains both white and black, just remove black.
                 // This logic is tricky. Easier: always remove the last element if undoing white,
                 // or remove the black span if undoing black from a combined LI.
                 if (i === 0 && movesToUndo === 1 && game.turn() === 'b') { // Undoing White's move
                      if(lastLi) lastLi.remove();
                 } else if (i === 0 && movesToUndo === 2 && game.turn() === 'w') { // Undoing Black's move (first of two)
                     if(hasBlackMove) {
                          hasBlackMove.previousSibling?.remove(); // Remove space before black move
                          hasBlackMove.remove();
                     } else if (lastLi) {
                          lastLi.remove(); // Should not happen normally if black moved last
                     }
                 } else if (i === 1 && movesToUndo === 2 && game.turn() === 'b') { // Undoing White's move (second of two)
                     if(lastLi) lastLi.remove();
                 }
                 else { // Fallback or simpler logic: just remove the last LI element per undo
                     if(lastLi) lastLi.remove();
                 }
             }
        }
         moveListEl.scrollTop = moveListEl.scrollHeight; // Scroll after removing
    }

    playSound('click');
    console.log("Undo complete. Current FEN:", game.fen());
}


// --- PGN Export ---
function exportGamePGN() {
    if (game.history().length === 0) {
        showToast("Aucun coup joué à exporter.", 'fa-info-circle');
        return;
    }
    if (isReviewing) {
         showToast("Veuillez attendre la fin de l'analyse.", 'fa-hourglass-half');
        return;
    }

    try {
        // Add standard PGN headers
        const pgnHeaders = {
            Event: "Partie locale",
            Site: "DFWS Chess App",
            Date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
            Round: gamesPlayed.toString(), // Or move number?
            White: player1NameEl?.textContent || "Joueur Blanc",
            Black: player2NameEl?.textContent || "Joueur Noir",
            Result: isGameOver ? gameResultToPGN(game) : "*" // Determine result if game is over
            // Add TimeControl if needed: e.g., '180+0' for blitz, '600+0' for standard
        };
         if (selectedTimeMode !== 'unlimited' && gameMode !== 'ai-vs-ai') {
             pgnHeaders.TimeControl = `${TIME_SETTINGS[selectedTimeMode]}+0`;
         }
         if (gameMode === 'ai') {
            pgnHeaders.WhiteElo = playerRating.toString();
            pgnHeaders.BlackElo = aiRating.toString(); // Use generic AI rating or difficulty-based
         }


        const pgn = game.pgn({ headers: pgnHeaders });
        const blob = new Blob([pgn], { type: 'application/x-chess-pgn;charset=utf-8' }); // Correct MIME type
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        // Suggest filename
        const dateStr = new Date().toISOString().replace(/[:\-]/g, '').slice(0, 8);
        const filenameSafeWhite = (pgnHeaders.White || 'White').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const filenameSafeBlack = (pgnHeaders.Black || 'Black').replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `dfws_chess_${filenameSafeWhite}_vs_${filenameSafeBlack}_${dateStr}.pgn`;

        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast("Partie exportée en PGN.", 'fa-download');

    } catch (error) {
        console.error("Failed to generate PGN:", error);
        showToast("Erreur lors de l'exportation PGN.", 'fa-times-circle');
    }
}

// Helper to get PGN result string
function gameResultToPGN(gameInstance) {
    if (!gameInstance.game_over()) return "*";
    if (gameInstance.in_checkmate()) {
        return gameInstance.turn() === 'b' ? "1-0" : "0-1"; // Winner is opposite of whose turn it is
    }
    if (gameInstance.in_draw() || gameInstance.in_stalemate() || gameInstance.in_threefold_repetition() || gameInstance.insufficient_material()) {
        return "1/2-1/2";
    }
    // Add cases for specific draw types if needed
    return "*"; // Default if somehow game_over but no specific condition met
}

const difficultyRatings = { 
    'Learn': 600, 
    'Noob': 800, 
    'Easy': 1000, 
    'Regular': 1200, 
    'Hard': 1400, 
    'Very Hard': 1600, 
    'Super Hard': 1800, 
    'Magnus Carlsen': 2850, 
    'Unbeatable': 3000, 
    'Adaptative': aiRating,
    'AI100': 100,
    'AI200': 200
};

// --- Game Review (Analysis) --- MODIFIED ---
function initiateGameReview() {
    // Vérifier que l'analyse est possible
    if (isReviewing) {
        showToast("Analyse déjà en cours.", 'fa-hourglass-half');
        return;
    }
    if (!isGameOver) {
        showToast("L'analyse est disponible après la fin de la partie.", 'fa-info-circle');
        return;
    }
    if (game.history().length === 0) {
        showToast("Aucun coup à analyser.", 'fa-info-circle');
        return;
    }
    if (!isStockfishReady) {
        showToast("Moteur d'analyse non prêt.", 'fa-cog');
    }

    console.log("--- Initiating Game Review ---");
    showGameEndModal(false); // Masquer le modal de fin

    const difficultyRatings = {
        'Learn': 600,
        'Noob': 800,
        'Easy': 1000,
        'Regular': 1200,
        'Hard': 1400,
        'Very Hard': 1600,
        'Super Hard': 1800,
        'Magnus Carlsen': 2850,
        'Unbeatable': 3000,
        'Adaptative': aiRating,
        'AI100': 100,
        'AI200': 200
    };

    const pgnHeaders = {
        Event: "Partie locale analysée",
        Site: "DFWS Chess App",
        Date: new Date().toISOString().split('T')[0],
        Round: gamesPlayed.toString(),
        White: player1NameEl?.textContent || "Joueur Blanc",
        Black: player2NameEl?.textContent || "Joueur Noir",
        Result: gameResultToPGN(game),
        ...(gameMode === 'ai' && { WhiteElo: playerRating.toString() }),
        ...(gameMode === 'ai' && { BlackElo: (difficultyRatings[aiDifficulty] || aiRating).toString() }),
        ...(selectedTimeMode !== 'unlimited' && { TimeControl: `${TIME_SETTINGS[selectedTimeMode]}+0` })
    };

    try {
        const pgn = game.pgn({ headers: pgnHeaders });
        localStorage.setItem('reviewGamePGN', pgn);
        console.log("PGN stored for review.");
        window.location.href = 'review.html';
    } catch (error) {
        console.error("Failed to generate PGN for review:", error);
        showToast("Erreur lors de la préparation de l'analyse.", 'fa-times-circle');
        isReviewing = false;
        updateControlsState();
    }
}


// --- FEN Parsing & Generation (Simplified using chess.js) ---
// No custom parseFEN or boardToFEN needed. Use game.load(fen) and game.fen().

// --- Game End Condition Checks ---
function checkGameEndConditions() {
    if (isGameOver) return true;

    if (game.game_over()) {
        let reason = "inconnue";
        let winner = 'draw'; // Default to draw

        if (game.in_checkmate()) {
            winner = game.turn() === 'b' ? 'white' : 'black'; // Opposite turn wins
            reason = "échec et mat";
        } else if (game.in_stalemate()) {
            reason = "pat";
        } else if (game.in_threefold_repetition()) {
            reason = "répétition";
        } else if (game.insufficient_material()) {
            reason = "matériel insuffisant";
        } else if (game.in_draw()) { // Catches 50-move rule implicitly sometimes
             reason = "match nul (règle)"; // More generic draw reason
             // Could check game.history().length and fiftyMoveCounter if needed for specific 50-move message
        }
        endGame(winner, reason);
        return true;
    }
    return false;
}

// --- AI Logic (Stockfish Interaction) ---
function initStockfish() {
    try {
        // Ensure path is correct relative to the HTML file or served correctly
        stockfish = new Worker('./stockfish.wasm.js');
        stockfish.postMessage('uci');
        stockfish.onmessage = handleStockfishMessage;
        stockfish.onerror = (e) => {
             console.error("Stockfish Worker Error:", e);
             updateGameStatus("Erreur Moteur IA.");
             isStockfishReady = false;
             // Disable AI modes if worker fails hard
              const aiButtons = [document.getElementById('mode-ai'), document.getElementById('mode-ai-ai')];
              aiButtons.forEach(btn => { if(btn) { btn.disabled = true; btn.style.opacity = 0.5; btn.title = "Moteur IA indisponible"; }});
              showToast("Impossible de charger le moteur d'échecs.", 'fa-times-circle', 5000);
        };
         console.log("Stockfish worker initializing...");
    } catch (e) {
        console.error("Failed to init Stockfish Worker:", e);
        updateGameStatus("Erreur: Worker IA non supporté.");
        isStockfishReady = false;
         const aiButtons = [document.getElementById('mode-ai'), document.getElementById('mode-ai-ai')];
         aiButtons.forEach(btn => { if(btn) { btn.disabled = true; btn.style.opacity = 0.5; btn.title = "Moteur IA indisponible";}});
         showToast("Votre navigateur ne supporte pas le moteur d'échecs.", 'fa-times-circle', 5000);
    }
}

function handleStockfishMessage(event) {
    const message = event.data;
    // console.log("Stockfish:", message); // Verbose: Log all messages for debugging

    if (message === 'uciok') {
        console.log("Stockfish UCI OK");
        // Set options like hash size, threads, contempt? (Optional)
        // stockfish.postMessage("setoption name Hash value 128");
        stockfish.postMessage('isready');
    } else if (message === 'readyok') {
        isStockfishReady = true;
        console.log("Stockfish ready.");
        showToast("Moteur IA prêt.", 'fa-check-circle', 1500);
        // If game started while stockfish was loading, and it's AI's turn, make move.
        if (!isGameOver && !isStockfishThinking && !isReviewing) {
            const currentTurn = game.turn();
            if (gameMode === 'ai' && currentTurn === 'b') {
                console.log("Stockfish ready, requesting AI move for Black.");
                requestAiMove();
            } else if (gameMode === 'ai-vs-ai' && (currentTurn === 'w' || currentTurn === 'b')) {
                console.log(`Stockfish ready, requesting AI move for ${currentTurn === 'w' ? 'White' : 'Black'}.`);
                requestAiMove();
            }
        }
    } else if (message.startsWith('bestmove')) {
        if (!isStockfishThinking) {
            // Ignore late bestmove if we already stopped thinking (e.g., game ended)
            console.log("Ignoring late bestmove:", message);
            return;
        }
        isStockfishThinking = false; // Stop thinking *before* processing move
        updateControlsState(); // Re-enable buttons

        const bestmoveUCI = message.split(' ')[1];

        if (bestmoveUCI && bestmoveUCI !== '(none)' && bestmoveUCI !== '0000') {
            handleAiMoveResponse(bestmoveUCI);
        } else {
            console.error("Stockfish returned no valid move or '(none)'. FEN:", game.fen());
            updateGameStatus(`Erreur IA (${game.turn() === 'w' ? 'Blanc' : 'Noir'}) : aucun coup valide.`);
            // Decide what to do - maybe declare draw in AI vs AI?
            if (gameMode === 'ai-vs-ai') {
                endGame('draw', 'erreur IA');
            } else {
                // In Player vs AI, maybe let player win? Or just stop?
                // For now, just log error and stop. Player needs to decide?
            }
        }
    } else if (message.startsWith('info') && isReviewing) {
        // Parse 'info' messages during review analysis
        const tokens = message.split(' ');
        const infoData = {};
        for (let i = 0; i < tokens.length; i++) {
            switch (tokens[i]) {
                case "depth":
                    infoData.depth = tokens[i + 1];
                    i++;
                    break;
                case "score":
                    if (tokens[i + 1] === "cp") {
                        infoData.scoreCp = tokens[i + 2];
                        i += 2;
                    } else if (tokens[i + 1] === "mate") {
                        infoData.scoreMate = tokens[i + 2];
                        i += 2;
                    }
                    break;
                case "pv":
                    infoData.pv = tokens.slice(i + 1).join(' ');
                    i = tokens.length; // Exit loop as pv is the rest of the message
                    break;
                default:
                    break;
            }
        }
        console.log("Review Info:", infoData);
        // Optionally, update the review UI with infoData here.
    }
}

function requestStockfishMove(fen, depth, movetime = null) {
    if (!isStockfishReady) { console.error("Stockfish not ready."); updateGameStatus("IA non prête..."); return; }
    if (isStockfishThinking) { console.warn("Stockfish already thinking."); return; }
    if (isGameOver || isReviewing) return;

    isStockfishThinking = true;
    updateControlsState(); // Disable buttons while thinking
    stockfish.postMessage(`position fen ${fen}`);
    let goCommand = `go depth ${depth}`;
    if(movetime) {
        goCommand = `go movetime ${movetime}`; // Use movetime if provided (e.g., for blitz?)
    }
    console.log(`Sending to Stockfish: ${goCommand} (FEN: ${fen})`);
    stockfish.postMessage(goCommand);
}

function requestAiMove() {
    if (isGameOver || !isStockfishReady || isStockfishThinking || isReviewing) return;

    const currentTurn = game.turn(); // 'w' or 'b'
    let difficulty, colorText;

    if (gameMode === 'ai' && currentTurn === 'b') {
        difficulty = aiDifficulty;
        colorText = 'Noir';
    } else if (gameMode === 'ai-vs-ai') {
        difficulty = (currentTurn === 'w') ? aiDifficultyWhite : aiDifficultyBlack;
        colorText = (currentTurn === 'w') ? 'Blanc' : 'Noir';
    } else {
        return; // Not AI's turn or wrong mode
    }

    if (!difficulty) {
        console.error(`AI difficulty not set for ${colorText}`);
        updateGameStatus(`Erreur: Difficulté IA (${colorText}) non définie.`);
        if (gameMode === 'ai-vs-ai') endGame('draw', 'erreur config IA');
        return;
    }

    const fen = game.fen();
    const depth = getAiSearchDepth(difficulty);
    // Maybe adjust movetime based on remaining time in blitz? For now, just use depth.
    // const movetime = (selectedTimeMode === 'blitz') ? 500 : null; // Example: 0.5s movetime for blitz

    updateGameStatus(`IA ${colorText} (${difficulty}) réfléchit (Prof ${depth})...`);
    requestStockfishMove(fen, depth); // Pass movetime here if needed
}


function getAiSearchDepth(difficulty) {
    const diffLower = difficulty ? difficulty.toLowerCase() : 'regular'; // Handle null/undefined difficulty
    let searchDepth;
    if (diffLower === 'learn') searchDepth = 1; // Learn to play
    else if (diffLower === 'noob') searchDepth = 1; // Increased from 0
    else if (diffLower === 'easy') searchDepth = 2;
    else if (diffLower === 'regular') searchDepth = 3;
    else if (diffLower === 'hard') searchDepth = 4;
    else if (diffLower === 'very hard') searchDepth = 6;
    else if (diffLower === 'super hard') searchDepth = 8;
    else if (diffLower === 'magnus carlsen') searchDepth = 12;
    else if (diffLower === 'unbeatable') searchDepth = 15;
    else if (diffLower === 'adaptative') {
        const ratingDiff = aiRating - playerRating;
        if (ratingDiff < -400) searchDepth = 1; // Further adjustment
        else if (ratingDiff < -150) searchDepth = 2;
        else if (ratingDiff < 150) searchDepth = 3;
        else if (ratingDiff < 400) searchDepth = 4;
        else searchDepth = 5;
    }
    else searchDepth = 3; // Default to Regular if unknown string
    return Math.max(1, searchDepth); // Ensure depth is at least 1
}

function handleAiMoveResponse(uciMove) {
    if (isGameOver || isReviewing) {
        isStockfishThinking = false; // Ensure flag is reset
        updateControlsState();
        return;
    }

    const aiColor = game.turn() === 'w' ? 'Blanc' : 'Noir';
    console.log(`Stockfish (${aiColor}) proposed move: ${uciMove}`);

    // --- Anti-Repetition (Optional, can make AI seem less 'dumb' in AIvsAI) ---
    let finalUCIMove = uciMove;
    if (gameMode === 'ai-vs-ai') {
        const tempGame = new Chess(game.fen());
        const potentialMove = tempGame.move(uciMove, { sloppy: true }); // Use sloppy for UCI
        if (potentialMove && tempGame.in_threefold_repetition()) {
             console.warn(`AI (${aiColor}) might repeat with ${uciMove}. Checking alternatives...`);
             const legalMoves = game.moves({ verbose: true });
             const nonRepeatingMoves = legalMoves.filter(m => {
                 const tempGame2 = new Chess(game.fen());
                 tempGame2.move(m.san); // Check SAN move result
                 return !tempGame2.in_threefold_repetition();
             });

             if (nonRepeatingMoves.length > 0) {
                 const randomAlt = nonRepeatingMoves[Math.floor(Math.random() * nonRepeatingMoves.length)];
                 finalUCIMove = randomAlt.from + randomAlt.to + (randomAlt.promotion || '');
                 console.log(`AI (${aiColor}) avoids repetition, chose alternative: ${finalUCIMove} (${randomAlt.san})`);
                 updateGameStatus(`IA (${aiColor}) évite répétition: ${randomAlt.san}`);
             } else {
                 console.log(`AI (${aiColor}) cannot avoid repetition with ${uciMove}.`);
                 // Proceed with the original move if no alternative
             }
         }
    }
    // --- End Anti-Repetition ---

    // Use the potentially modified move
    const fromAlg = finalUCIMove.substring(0, 2);
    const toAlg = finalUCIMove.substring(2, 4);
    const promotion = finalUCIMove.length === 5 ? finalUCIMove.substring(4) : null;

    // --- Execute the move ---
    const success = makeMove(fromAlg, toAlg, promotion);

    if (success && !isGameOver) {
        // If AI vs AI, and game not over, trigger the *next* AI move after a delay
        if (gameMode === 'ai-vs-ai') {
             // Use delay only if enabled
            const delay = aiDelayEnabled ? AI_DELAY_TIME : 50; // 50ms minimal delay
            setTimeout(requestAiMove, delay);
        }
        // If Player vs AI, control returns to the player, no immediate AI move needed here.
    } else if (!success) {
        console.error(`AI (${aiColor}) tried illegal move: ${finalUCIMove}. FEN: ${game.fen()}. This should not happen.`);
        updateGameStatus(`Erreur critique IA: coup illégal ${finalUCIMove}`);
        if (gameMode === 'ai-vs-ai') endGame('draw', 'erreur critique IA');
         isStockfishThinking = false; // Reset flag on failure
         updateControlsState();
    }
    // isStockfishThinking flag is reset at the start of this function or on error
}


// --- Core Move Execution Logic (using chess.js) ---
function makeMove(fromAlg, toAlg, promotionChoice = null) {
    if (isGameOver || isReviewing) return false;

    const fenBefore = game.fen();
    const currentTurn = game.turn(); // 'w' or 'b'
    const moveNumber = Math.floor(game.history().length / 2) + 1; // Correct move number calculation

    // Prepare move object for chess.js
    const moveData = {
        from: fromAlg,
        to: toAlg
    };
    // Ensure promotion choice is valid if provided
    if (promotionChoice && ['q', 'r', 'n', 'b'].includes(promotionChoice.toLowerCase())) {
        moveData.promotion = promotionChoice.toLowerCase();
    }

    // Attempt the move using chess.js
    const moveResult = game.move(moveData);

    // --- Handle Move Result ---
    if (moveResult === null) {
        console.warn(`makeMove: Illegal move attempt by ${currentTurn}: ${fromAlg}-${toAlg} (Promo: ${promotionChoice}) FEN: ${fenBefore}`);
        playSound('illegal');
        // If a piece was selected by human, deselect it visually
        if (selectedSquareAlg === fromAlg) {
             const selCoord = algToCoord(selectedSquareAlg);
             const squareEl = chessboard.querySelector(`.square[data-row="${selCoord[0]}"][data-col="${selCoord[1]}"]`);
             if (squareEl) squareEl.classList.remove('selected');
             selectedSquareAlg = null;
             highlightMoves([]); // Clear highlights
        } else if (selectedSquareAlg) {
            // If a different square was selected, just deselect that one
             const selCoord = algToCoord(selectedSquareAlg);
             const squareEl = chessboard.querySelector(`.square[data-row="${selCoord[0]}"][data-col="${selCoord[1]}"]`);
             if (squareEl) squareEl.classList.remove('selected');
             selectedSquareAlg = null;
             highlightMoves([]);
        }
        return false; // Indicate failure
    }

    // --- Move Successful ---
    console.log(`Move ${moveNumber}${currentTurn === 'w' ? '.' : '...'} ${moveResult.san} successful. New FEN: ${game.fen()}`);

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
        // Sort captured arrays by piece value (descending) for consistent display
        capturedWhite.sort((a, b) => (pieceValues[b.toLowerCase()] || 0) - (pieceValues[a.toLowerCase()] || 0));
        capturedBlack.sort((a, b) => (pieceValues[b] || 0) - (pieceValues[a] || 0));
    }

    // 3. Record move for internal history (for undo)
    moveHistoryInternal.push({ fenBefore: fenBefore, moveSAN: moveResult.san });

    // 4. Update UI move list
    updateMoveListUI(moveNumber, moveResult.san, currentTurn);

    // 5. Play sound based on move flags
    let soundToPlay = 'move';
    if (game.in_checkmate()) { // Checkmate sound takes precedence
        soundToPlay = (currentTurn === 'w') ? 'win' : 'lose'; // Assuming standard win/lose sounds map
    } else if (game.in_check()) { // Check sound if not checkmate
        soundToPlay = 'check';
    } else if (moveResult.flags.includes('c')) { // Capture
        soundToPlay = 'capture';
    } else if (moveResult.flags.includes('p')) { // Promotion
        soundToPlay = 'promote';
    } else if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) { // Castling
        soundToPlay = 'castle';
    } else { // Normal move
         // Differentiate player/opponent sounds?
         if (gameMode === 'human') {
             soundToPlay = currentTurn === 'w' ? 'move' : 'move2';
         } else if (gameMode === 'ai') {
             soundToPlay = currentTurn === 'w' ? 'move' : 'move2'; // Player (w) vs AI (b) sounds
         } else { // AI vs AI
              soundToPlay = currentTurn === 'w' ? 'move' : 'move2'; // Differentiate AI sounds?
         }
    }
    playSound(soundToPlay);

    // --- Post-Move Tasks ---
    // No need to switch player - chess.js did it

    // Clear selection and highlights before redrawing
    selectedSquareAlg = null;
    highlightMoves([]);

    createBoard(); // Redraw board with new state from game object
    updateAllUI(); // Update timers, captured pieces, progress bar, ratings, turn indicator
    checkAndUpdateKingStatus(); // Highlight king if needed FOR THE NEW PLAYER whose turn it is

    // Affichage de la réaction textuelle de l'IA après coup du joueur (Blanc en mode IA)
    if (gameMode === 'ai' && currentTurn === 'w' && !isGameOver) {
        showAIReaction(moveResult.san);
    }

    // Check if the game ended due to this move
    if (!checkGameEndConditions()) {
        // Game continues, update status text
        const nextTurnColor = game.turn() === 'w' ? 'Blancs' : 'Noirs';
        if (game.in_check()) {
            updateGameStatus(`Échec au roi ${nextTurnColor === 'Blancs' ? 'blanc' : 'noir'} !`);
        } else {
            updateGameStatus(`Au tour des ${nextTurnColor}.`);
        }
    }
    // else: Game ended, endGame function handles status messages and sounds

    updateControlsState(); // Update button states (e.g., undo, export)

    return true; // Move was successful
}

// Nouvelle fonction pour afficher la réaction textuelle de l'IA
function showAIReaction(playerMoveSAN) {
    const reactions = [
        "Intéressant coup !",
        "Pas mal, mais tu peux mieux faire.",
        "Hmm, je m'attendais à autre chose...",
        "Erreur flagrante !",
        "Bien joué... pour un débutant ?",
        "Je vais te battre maintenant !"
    ];
    const reaction = reactions[Math.floor(Math.random() * reactions.length)];
    const bubble = document.getElementById('black-chat-bubble');
    if (bubble) {
        bubble.textContent = reaction;
        bubble.style.display = 'block';
        setTimeout(() => {
            bubble.style.display = 'none';
        }, 3000); // Afficher pendant 3 secondes
    }
}

// --- User Interaction (Click Handler) ---
function handleSquareClick(event) {
    const square = event.target.closest('.square'); // Get the square element
    if (!square) return; // Clicked outside a square?

    const coord = square.getAttribute('data-coord'); // e.g. "2,3"
    if (!coord) {
        console.error('data-coord attribute is missing.');
        return;
    }
    const parts = coord.split(',');
    if (parts.length < 2) {
        console.error('Invalid coordinate format:', coord);
        return;
    }
    const row = parseInt(parts[0], 10);
    const col = parseInt(parts[1], 10);
    const clickedAlg = coordToAlg(row, col); // Define clickedAlg here

    // --- Puzzle Mode Logic ---
    if (gameMode === 'puzzle') {
         const puzzleInfo = PUZZLE.getCurrentPuzzleData();
         if (!puzzleInfo || !puzzleInfo.isPlayerTurn) {
             // console.log("Ignoring puzzle click: Not player's turn");
             return; // Not player's turn in puzzle
         }

         if (selectedSquareAlg) {
            // Piece already selected, try to make move
            const fromAlg = selectedSquareAlg;
             selectedSquareAlg = null; // Deselect logically first

             // Visually deselect and clear highlights
             const fromCoord = algToCoord(fromAlg); // Get coords for querySelector
             if (fromCoord) {
                 const fromSquareEl = chessboard.querySelector(`.square[data-row="${fromCoord[0]}"][data-col="${fromCoord[1]}"]`);
                 if (fromSquareEl) fromSquareEl.classList.remove('selected');
             }
             highlightMoves([]);

             // Check for promotion (simplified: assume promotion if pawn reaches last rank)
             const piece = PUZZLE.getPuzzleInstance().get(fromAlg);
             const isPawn = piece && piece.type === 'p';
             // Use the clicked row for last rank check
             const isLastRank = (piece.color === 'w' && row === 0) || (piece.color === 'b' && row === 7);

             if (isPawn && isLastRank) {
                 // Need to show promotion modal specific to puzzle
                 showPromotionModal(piece.color, (promoChoice) => {
                      if (promoChoice) {
                          // Use clickedAlg as the destination
                          const result = PUZZLE.makePlayerMove(fromAlg, clickedAlg, promoChoice);
                          // Callbacks handle UI updates based on result ('correct_continue', 'complete', 'incorrect')
                      } else {
                           // Promotion cancelled, maybe do nothing or reset selection?
                            updateGameStatus("Promotion annulée. Sélectionnez une pièce.");
                      }
                  });
             } else {
                 // Not a promotion, make the move directly
                 // Use clickedAlg as the destination
                 const result = PUZZLE.makePlayerMove(fromAlg, clickedAlg, null);
                 // Callbacks handle UI updates
             }

         } else {
             // No piece selected, check if clicking own piece
             const pieceOnSquare = PUZZLE.getPuzzleInstance().get(clickedAlg);
             if (pieceOnSquare && pieceOnSquare.color === puzzleInfo.playerColor) {
                 // Select the piece
                 playSound('click');
                 selectedSquareAlg = clickedAlg;
                 square.classList.add('selected');
                 // Get and highlight VALID moves for the puzzle context
                 const moves = PUZZLE.getPuzzleInstance().moves({ square: clickedAlg, verbose: true });
                 highlightMoves(moves);
             } else {
                  // Clicked empty or opponent piece without selection - do nothing
             }
         }
         return; // End puzzle logic here
    }

     // --- Original Game Mode Logic (AI/Human) ---
    if (isGameOver || isStockfishThinking || isReviewing || promotionCallback) return;

    const currentTurn = game.turn(); // Use main game instance
    const isHumanTurn = (gameMode === 'human' || (gameMode === 'ai' && currentTurn === 'w'));

    if (!isHumanTurn) return;

     const pieceOnSquare = game.get(clickedAlg); // Use main game instance

     if (selectedSquareAlg) {
        // --- Piece Already Selected --- (Main Game)
        const fromAlg = selectedSquareAlg;
        const fromCoord = algToCoord(fromAlg); // Get coords for querySelector

        // Case 1: Clicked the same square again - Deselect
        if (clickedAlg === fromAlg) {
            square.classList.remove('selected');
            selectedSquareAlg = null;
            highlightMoves([]);
            playSound('click');
            return;
        }

         // Case 2: Clicked a potential destination square (Main Game)
        const legalMovesForPiece = game.moves({ square: fromAlg, verbose: true });
        const targetMove = legalMovesForPiece.find(move => move.to === clickedAlg);

         if (targetMove) {
            // --- Valid Move Target --- (Main Game)
            if (fromCoord) {
                const fromSquareEl = chessboard.querySelector(`.square[data-row="${fromCoord[0]}"][data-col="${fromCoord[1]}"]`);
                if(fromSquareEl) fromSquareEl.classList.remove('selected');
            }
            highlightMoves([]);

             if (targetMove.flags.includes('p')) {
                // --- Promotion Move --- (Main Game)
                showPromotionModal(currentTurn === 'w' ? 'white' : 'black', (promoChoice) => {
                    if (!promoChoice) { console.log("Promotion cancelled."); selectedSquareAlg = null; return; }
                    const success = makeMove(fromAlg, clickedAlg, promoChoice);
                    if (success && gameMode === 'ai' && game.turn() === 'b' && !isGameOver) {
                        const delay = aiDelayEnabled ? AI_DELAY_TIME : 50;
                        setTimeout(requestAiMove, delay);
                    }
                });
                selectedSquareAlg = null; // Deselect logically while modal is up
                return;
            } else {
                // --- Normal Move (Not Promotion) --- (Main Game)
                selectedSquareAlg = null;
                const success = makeMove(fromAlg, clickedAlg);
                if (success && gameMode === 'ai' && game.turn() === 'b' && !isGameOver) {
                    const delay = aiDelayEnabled ? AI_DELAY_TIME : 50;
                    setTimeout(requestAiMove, delay);
                }
            }
        } else {
            // Case 3: Clicked an invalid destination or another own piece (Main Game)
            if (fromCoord) {
                const oldSquareEl = chessboard.querySelector(`.square[data-row="${fromCoord[0]}"][data-col="${fromCoord[1]}"]`);
                if(oldSquareEl) oldSquareEl.classList.remove('selected');
            }

            if (pieceOnSquare && pieceOnSquare.color === currentTurn) {
                // Clicked another piece - switch selection
                selectedSquareAlg = clickedAlg;
                square.classList.add('selected');
                const newMoves = game.moves({ square: clickedAlg, verbose: true });
                highlightMoves(newMoves);
                playSound('click');
            } else {
                // Clicked invalid target - deselect
                playSound('illegal');
                selectedSquareAlg = null;
                highlightMoves([]);
            }
        }
    } else if (pieceOnSquare && pieceOnSquare.color === currentTurn) {
        // --- No Piece Selected, Clicked Own Piece --- Select it (Main Game)
        playSound('click');
        selectedSquareAlg = clickedAlg;
        square.classList.add('selected');
        const moves = game.moves({ square: clickedAlg, verbose: true });
        highlightMoves(moves);
    }
}

// --- Rendering & UI Updates ---
function createBoard(gameInstance = game, playerPovColor = 'w') { // Default POV is white
    if (!chessboard) return;

    // Determine POV based on mode and setting
    let finalPovColor = 'w'; // Default to white POV
    if (gameMode === 'human' && autoFlipEnabled && !isGameOver && !isReviewing) {
        finalPovColor = gameInstance.turn(); // Flip based on current turn in Human vs Human auto-flip mode
    } else if (gameMode === 'puzzle') {
        const puzzleInfo = PUZZLE.getCurrentPuzzleData();
        if (puzzleInfo) finalPovColor = puzzleInfo.playerColor; // Use puzzle's player color POV
    }
    // For AI mode and AI vs AI, default 'w' is used

    chessboard.innerHTML = '';
    const boardFragment = document.createDocumentFragment();
    const boardData = gameInstance.board();
    const isFlipped = finalPovColor === 'b'; // Flip if POV is black

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            // Adjust indices based on flip
            const rowIndex = isFlipped ? 7 - row : row;
            const colIndex = isFlipped ? 7 - col : col;

            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = rowIndex; // Store logical row/col
            square.dataset.col = colIndex;
            square.dataset.coord = `${rowIndex},${colIndex}`; // Combined coordinate attribute
            const alg = coordToAlg(rowIndex, colIndex);

            // Add Rank/File labels (adjusted for flip)
            const showRank = isFlipped ? (col === 7) : (col === 0); // Rank label on file h for flipped, on file a otherwise
            const showFile = isFlipped ? (row === 0) : (row === 7); // File label on rank 1 for flipped, on rank 8 otherwise
            if (showRank || showFile) {
                const label = document.createElement('span');
                label.className = 'square-label';
                let labelText = '';
                if (showRank) labelText += `${8 - rowIndex}`; // Logical rank number
                if (showFile) labelText += files[colIndex];    // Logical file letter
                label.textContent = labelText;
                square.appendChild(label);
            }

            // Add piece if present (using logical indices)
            const pieceInfo = boardData[rowIndex][colIndex];
            if (pieceInfo) {
                const myPieceFormat = chessjsPieceToMyFormat(pieceInfo);
                if (pieceRenderMode === 'ascii') {
                    const pieceElement = document.createElement('span');
                    pieceElement.className = 'piece';
                    pieceElement.textContent = pieces[myPieceFormat];
                    pieceElement.classList.add(pieceInfo.color === 'w' ? 'white-piece' : 'black-piece');
                    square.appendChild(pieceElement);
                } else {
                    const img = document.createElement('img');
                    const colorPrefix = pieceInfo.color === 'w' ? 'w' : 'b';
                    let pieceCode = pieceInfo.type;
                    if (pieceCode === 'n') pieceCode = 'n';
                    const filename = `${colorPrefix}${pieceCode}.png`;
                    img.src = `pieces/${filename}`;
                    img.alt = myPieceFormat;
                    img.classList.add("piece");
                    img.draggable = false;
                    square.appendChild(img);
                }
            }

            // Add click listener to handle user interaction
            square.addEventListener('click', handleSquareClick);

            // Determine cursor based on active mode and turn
            let isInteractable = false;
            if (gameMode === 'puzzle') {
                const puzzleInfo = PUZZLE.getCurrentPuzzleData();
                isInteractable = puzzleInfo && puzzleInfo.isPlayerTurn;
            } else { // For AI or Human mode
                const currentTurn = gameInstance.turn();
                isInteractable = !isGameOver && !isStockfishThinking && !isReviewing && !promotionCallback &&
                                 (gameMode === 'human' || (gameMode === 'ai' && currentTurn === 'w'));
            }
            square.style.cursor = isInteractable ? 'pointer' : 'default';

            // Re-apply highlights if applicable
            if (lastMoveHighlight && (alg === lastMoveHighlight.from || alg === lastMoveHighlight.to)) {
                square.classList.add('last-move');
            }
            if (selectedSquareAlg === alg) {
                square.classList.add('selected');
            }

            boardFragment.appendChild(square);
        }
    }
    chessboard.appendChild(boardFragment);

    // Re-apply move highlights if a square is selected
    if (selectedSquareAlg) {
        const moves = gameInstance.moves({ square: selectedSquareAlg, verbose: true });
        highlightMoves(moves); // Uses algToCoord to handle logical coordinates
    }

    checkAndUpdateKingStatus(gameInstance); // Update king's status (e.g., in-check highlight) on the current board
}

function highlightMoves(moves) { // Expects array of chess.js move objects [{ from:'e2', to:'e4', flags:'b', piece:'p', san:'e4' }, ...]
    if (!chessboard) return;
    // Clear previous highlights (move, capture, selected - keep last-move and check)
    chessboard.querySelectorAll('.square.highlight, .square.capture, .square.en-passant-target').forEach(sq => {
        sq.classList.remove('highlight', 'capture', 'en-passant-target');
    });

    moves.forEach(move => {
        const toCoord = algToCoord(move.to);
        if (!toCoord) return;
        const [r, c] = toCoord;
        const square = chessboard.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
        if (square) {
            if (move.flags.includes('c')) { // Capture (including en passant)
                square.classList.add('capture');
                // Optional: specific style for en passant capture target?
                 if (move.flags.includes('e')) {
                     square.classList.add('en-passant-target');
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
    updateRatingDisplay(); // Ensures names/ratings correct for mode
    updatePlayerTurnIndicator();
    // Move list UI is updated incrementally in makeMove/undoMove
    // Controls state updated separately where needed (makeMove, undo, endGame, etc.)
}

function updateGameStatus(statusText) {
    if (gameStatusEl) gameStatusEl.textContent = statusText;
}

function updateCapturedPieces() {
    // capturedWhite has uppercase ('P', 'N') - white pieces captured by Black
    // capturedBlack has lowercase ('p', 'n') - black pieces captured by White

    const renderCaptured = (piecesArray) => {
         // Sort by value (desc) then alphabetically as tie-breaker
         return piecesArray
            .sort((a, b) => {
                const valA = pieceValues[a.toLowerCase()] || 0;
                const valB = pieceValues[b.toLowerCase()] || 0;
                if (valB !== valA) return valB - valA;
                return a.localeCompare(b); // Sort alphabetically if value is same (e.g., N vs B)
             })
             .map(p => {
                 if (pieceRenderMode === 'ascii') {
                     return pieces[p]; // Get ASCII representation
                 } else {
                     // Generate img tag for PNG
                     const colorPrefix = (p === p.toUpperCase()) ? 'w' : 'b';
                     let pieceCode = p.toLowerCase();
                     if (pieceCode === 'n') pieceCode = 'n'; // Or 'kn' based on your filenames
                     const filename = `${colorPrefix}${pieceCode}.png`;
                     return `<img src="pieces/${filename}" alt="${p}" style="width: 1em; height: 1em; vertical-align: middle;">`; // Inline style for simple sizing
                 }
             })
             .join(''); // Join into a single string
    };

    if (capturedWhiteEl) capturedWhiteEl.innerHTML = renderCaptured(capturedBlack); // Show black pieces captured BY White
    if (capturedBlackEl) capturedBlackEl.innerHTML = renderCaptured(capturedWhite); // Show white pieces captured BY Black
}


function updateProgressBar() {
    if (!whiteProgressEl || !blackProgressEl || !scoreAdvantageEl) return;

    // capturedWhite = white pieces ('P') captured BY BLACK -> Black's material gain
    // capturedBlack = black pieces ('p') captured BY WHITE -> White's material gain
    const whiteMaterialGain = capturedBlack.reduce((sum, pieceChar) => sum + (pieceValues[pieceChar.toLowerCase()] || 0), 0);
    const blackMaterialGain = capturedWhite.reduce((sum, pieceChar) => sum + (pieceValues[pieceChar.toLowerCase()] || 0), 0);
    const diff = whiteMaterialGain - blackMaterialGain; // Positive = White material advantage

    // Simple linear scale, capped at +/- 9 points for visual effect
    const maxVisualAdvantage = 9;
    const scaledDiff = Math.max(-maxVisualAdvantage, Math.min(maxVisualAdvantage, diff));

    // Base 50%, shift by scaled difference. Max shift is +/- 45% (gives range 5% to 95%)
    let whitePerc = 50 + (scaledDiff / maxVisualAdvantage) * 45;
    whitePerc = Math.max(5, Math.min(95, whitePerc)); // Clamp 5-95% to prevent full bar collapse

    whiteProgressEl.style.width = `${whitePerc}%`;
    blackProgressEl.style.width = `${100 - whitePerc}%`;

    // Display advantage score
    if (diff !== 0) {
        scoreAdvantageEl.textContent = `${diff > 0 ? '+' : ''}${diff}`;
        scoreAdvantageEl.className = diff > 0 ? 'score-white' : 'score-black';
    } else {
        scoreAdvantageEl.textContent = '';
        scoreAdvantageEl.className = '';
    }
}

function checkAndUpdateKingStatus(gameInstance = game) { // Default to main game
    chessboard.querySelectorAll('.square.in-check').forEach(sq => sq.classList.remove('in-check'));

    // No check highlight if game over (main game) or puzzle mode? (Decide behavior)
    // Let's allow check highlight in puzzles for clarity.
    // if (isGameOver && gameMode !== 'puzzle') return;

    if (gameInstance.in_check()) {
         const kingColor = gameInstance.turn();
         const boardData = gameInstance.board();
         for (let r = 0; r < 8; r++) {
             for (let c = 0; c < 8; c++) {
                 const pieceInfo = boardData[r][c];
                 if (pieceInfo && pieceInfo.type === 'k' && pieceInfo.color === kingColor) {
                     const kingSquareEl = chessboard.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
                     if (kingSquareEl) {
                         kingSquareEl.classList.add('in-check');
                     }
                     return;
                 }
             }
         }
     }
}

function showPromotionModal(color, callback) {
    if (!promotionModal || !promotionOptionsContainer) {
        console.error("Promotion modal elements not found!");
        callback('q'); // Default to queen if modal fails
        return;
    }

    promotionCallback = callback; // Store the callback

    // Populate options
    promotionOptionsContainer.innerHTML = ''; // Clear previous
    ['q', 'r', 'n', 'b'].forEach(type => {
        const pieceSymbol = (color === 'white') ? type.toUpperCase() : type.toLowerCase();
        const div = document.createElement('div');
        div.className = 'promotion-piece';
        div.dataset.type = type; // Store 'q', 'r', 'n', 'b'

        // Render piece using selected mode
         if (pieceRenderMode === 'ascii') {
             div.textContent = pieces[pieceSymbol];
              div.classList.add(color === 'white' ? 'white-piece' : 'black-piece'); // Add color class for ASCII
         } else { // PNG mode
             const img = document.createElement('img');
             const colorPrefix = (color === 'white') ? 'w' : 'b';
             let pieceCode = type;
             if (pieceCode === 'n') pieceCode = 'n'; // Adjust if needed for knight filename
             const filename = `${colorPrefix}${pieceCode}.png`;
             img.src = `pieces/${filename}`;
             img.alt = pieceSymbol;
             div.appendChild(img);
         }

         // Add click listener to each piece option
         div.onclick = () => {
             if (promotionCallback) {
                 promotionCallback(type); // Pass 'q', 'r', etc.
                 promotionCallback = null; // Clear callback once chosen
             }
             promotionModal.classList.remove('show'); // Hide modal
         };
        promotionOptionsContainer.appendChild(div);
    });

    promotionModal.classList.add('show'); // Show modal using class
}

function showGameEndModal(show, message = "") {
    if (!gameEndModal) return;
    if (show) {
        if (gameEndMessageEl) gameEndMessageEl.textContent = message;
        updateControlsState(); // Ensure analyze button state is correct
        gameEndModal.classList.add('show');
    } else {
        gameEndModal.classList.remove('show');
    }
}

// --- Timer, Ratings, Sound, Theme, Effects ---
function startTimer() {
    clearInterval(timerInterval);
    if (isGameOver || selectedTimeMode === 'unlimited') {
        // Don't start timer if game already over or time is unlimited
         if(selectedTimeMode === 'unlimited') {
            updateTimerDisplay(); // Show '--:--' for unlimited
        }
        return;
    }

    console.log(`Starting timer: W=${whiteTime}s, B=${blackTime}s`);
    timerInterval = setInterval(() => {
        if (isGameOver) { clearInterval(timerInterval); return; }

        const currentTurn = game.turn();

        if (currentTurn === 'w') {
            whiteTime--;
            if (whiteTime <= 0) {
                whiteTime = 0;
                updateTimerDisplay();
                endGame('black', 'temps écoulé');
                clearInterval(timerInterval); // Stop timer immediately
            }
        } else {
            blackTime--;
            if (blackTime <= 0) {
                blackTime = 0;
                updateTimerDisplay();
                endGame('white', 'temps écoulé');
                clearInterval(timerInterval); // Stop timer immediately
            }
        }

        if (!isGameOver) {
            updateTimerDisplay(); // Update display every second

            // Play tenseconds sound for the active player
            if ((currentTurn === 'w' && whiteTime === 10) || (currentTurn === 'b' && blackTime === 10)) {
                playSound('tenseconds');
            }
        }
    }, 1000);
}
function resetTimer() {
     clearInterval(timerInterval);
     // Set time based on selected mode for the *next* game
     whiteTime = TIME_SETTINGS[selectedTimeMode] || TIME_SETTINGS.standard;
     blackTime = TIME_SETTINGS[selectedTimeMode] || TIME_SETTINGS.standard;
     // Don't update display here, startGame or returnToMainMenu will handle it
 }

function formatTime(seconds) {
    if (seconds >= TIME_SETTINGS.unlimited - 1) return '--:--'; // Display for unlimited
    if (seconds < 0) seconds = 0; // Prevent negative display
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}
function updateTimerDisplay() {
    if (!whiteTimeEl || !blackTimeEl) return;
    whiteTimeEl.textContent = formatTime(whiteTime);
    blackTimeEl.textContent = formatTime(blackTime);

    // Highlight if time is low (e.g., under 30s) and it's that player's turn and time is not unlimited
    const isUrgentW = whiteTime <= 30 && whiteTime > 0 && selectedTimeMode !== 'unlimited' && !isGameOver;
    const isUrgentB = blackTime <= 30 && blackTime > 0 && selectedTimeMode !== 'unlimited' && !isGameOver;
    whiteTimeEl.classList.toggle('urgent', isUrgentW );
    blackTimeEl.classList.toggle('urgent', isUrgentB );
}

function updateStatistics() {
    const gamesPlayedEl = document.getElementById('games-played');
    const winsEl = document.getElementById('wins');
    const lossesEl = document.getElementById('losses');
    const drawsEl = document.getElementById('draws');
    const playerEloStatsEl = document.getElementById('player-elo-stats');

    if (gamesPlayedEl) gamesPlayedEl.textContent = gamesPlayed;
    if (winsEl) winsEl.textContent = wins;
    if (lossesEl) lossesEl.textContent = losses;
    if (drawsEl) drawsEl.textContent = draws;
    if (playerEloStatsEl) playerEloStatsEl.textContent = playerRating; // Show current player Elo

     // Save updated rating to localStorage
     localStorage.setItem('chess-player-rating', playerRating.toString());
     // Could save other stats too if desired
}

function updateRatings(playerWonVsAI) { // playerWonVsAI: true (player win), false (AI win), null (draw)
    if (gameMode !== 'ai') return; // Only update Elo for Player vs AI

    // Find AI rating based on difficulty (could be more sophisticated)
    const difficultyRatings = { // Approximate ELOs
        'Learn': 600, 'Noob': 800, 'Easy': 1000, 'Regular': 1200, 'Hard': 1400,
        'Very Hard': 1600, 'Super Hard': 1800, 'Magnus Carlsen': 2850, 'Unbeatable': 3000, 'Adaptative': aiRating, 'AI100': 100, 'AI200': 200
    };
    // Use a default if difficulty string is weird, or use the stored aiRating for adaptive
     const currentAIRating = difficultyRatings[aiDifficulty] || 1200; // Fallback to 1200


    const expectedScore = 1 / (1 + Math.pow(10, (currentAIRating - playerRating) / 400));
    const actualScore = playerWonVsAI === true ? 1 : (playerWonVsAI === false ? 0 : 0.5);
    const ratingChange = Math.round(K_FACTOR * (actualScore - expectedScore));

    playerRating += ratingChange;
    // If AI is adaptive, update its rating too
    if (aiDifficulty === 'Adaptative') {
         aiRating -= ratingChange; // AI rating changes inversely only if adaptive
         aiRating = Math.max(600, aiRating); // Clamp AI adaptive rating floor?
    }

    // Clamp player rating? (e.g., min 400)
    playerRating = Math.max(400, playerRating);

    console.log(`Rating Change: ${ratingChange}. New Player Elo: ${playerRating}. AI (${aiDifficulty}) used Elo: ${currentAIRating}`);
    // updateStatistics() will save the new playerRating
}

function updateRatingDisplay() {
    const playerEloStatsEl = document.getElementById('player-elo-stats');
     if (playerEloStatsEl && statsContainerEl && statsContainerEl.style.display !== 'none') {
        playerEloStatsEl.textContent = playerRating;
    }

    if (!player1RatingEl || !player2RatingEl || !player1NameEl || !player2NameEl) {
        console.warn("Player info elements missing, cannot update display.");
        return;
    }

    // Define ratings map here as well for consistency
    const difficultyRatings = {
        'Learn': 600, 'Noob': 800, 'Easy': 1000, 'Regular': 1200, 'Hard': 1400,
        'Very Hard': 1600, 'Super Hard': 1800, 'Magnus Carlsen': 2850, 'Unbeatable': 3000,
        'Adaptative': aiRating, // Use current adaptive rating
        'AI100': 100, 'AI200': 200
    };

    let p1Name = "Joueur 1"; let p1Elo = "----";
    let p2Name = "Joueur 2"; let p2Elo = "----";

    if (gameMode === 'ai') {
        p1Name = "Joueur"; p1Elo = playerRating.toString();
        const displayAIRating = difficultyRatings[aiDifficulty] || "?"; // Get rating from map
        // Use a shorter name for the AI display if possible
        const aiDisplayName = aiDifficulty.replace("Very Hard", "T.Difficile").replace("Super Hard", "Expert").replace("Magnus Carlsen", "Carlsen").replace("Unbeatable", "Invincible").replace("Adaptative", "Adaptatif");
        p2Name = `IA (${aiDisplayName || '?'})`;
        p2Elo = displayAIRating.toString();
    } else if (gameMode === 'human') {
        p1Name = "Joueur 1 (Blanc)";
        p2Name = "Joueur 2 (Noir)";
        // Could potentially show Elo if players were logged in/had profiles
    } else if (gameMode === 'ai-vs-ai') {
        const whiteAiDisplayName = aiDifficultyWhite.replace("Very Hard", "T.Difficile").replace("Super Hard", "Expert").replace("Magnus Carlsen", "Carlsen").replace("Unbeatable", "Invincible").replace("Adaptative", "Adaptatif");
        const blackAiDisplayName = aiDifficultyBlack.replace("Very Hard", "T.Difficile").replace("Super Hard", "Expert").replace("Magnus Carlsen", "Carlsen").replace("Unbeatable", "Invincible").replace("Adaptative", "Adaptatif");
        p1Name = `IA Blanc (${whiteAiDisplayName || '?'})`;
        p2Name = `IA Noir (${blackAiDisplayName || '?'})`;
        p1Elo = (difficultyRatings[aiDifficultyWhite] || '????').toString();
        p2Elo = (difficultyRatings[aiDifficultyBlack] || '????').toString();
    } else if (gameMode === 'puzzle') {
        const puzzleInfo = PUZZLE.getCurrentPuzzleData();
        if (puzzleInfo) {
             p1Name = puzzleInfo.playerColor === 'w' ? "Joueur" : "Puzzle";
             p1Elo = `(${puzzleInfo.rating || '????'})`; // Show puzzle rating
             p2Name = puzzleInfo.playerColor === 'b' ? "Joueur" : "Puzzle";
             p2Elo = `(ID: ${puzzleInfo.id || 'N/A'})`; // Show ID for black in puzzle mode?
        } else {
             p1Name = "Puzzle"; p1Elo = "(?)";
             p2Name = "Puzzle"; p2Elo = "(?)";
        }
    } else { // Default / Main Menu state
        p1Name = "Joueur Blanc";
        p2Name = "Joueur Noir";
    }

    player1NameEl.textContent = p1Name; player1RatingEl.textContent = p1Elo;
    player2NameEl.textContent = p2Name; player2RatingEl.textContent = p2Elo;
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
            const audio = new Audio(path);
             audio.preload = 'auto'; // Hint browser to load metadata or full file
             audio.addEventListener('error', () => {
                  console.error(`Failed to load sound: ${path}`);
                  sounds[name] = null; // Mark as failed
             });
            sounds[name] = audio;
             // audio.load(); // Explicitly start loading (optional)
        }
        catch (e) { console.error(`Failed to create Audio for ${name}:`, e); sounds[name] = null; }
    }
    return sounds[name];
}
function playSound(soundName) {
    if (!soundEnabled) return;
    const soundPaths = { // Keep this map updated
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
    if (audio) {
         // Don't wait for readyState, play immediately if possible.
         // Browser handles buffering. Reset time and play.
         audio.currentTime = 0;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                 // Common issue: Autoplay was prevented until user interaction.
                 // console.warn(`Sound play failed for ${soundName}: ${error.message}. Needs user interaction first.`);
                 // Maybe disable sound temporarily until first click?
                 // soundEnabled = false; updateSoundButtonIcon(); // Example handling
            });
        }
    } else {
         // console.warn(`Sound ${soundName} is null (failed to load?).`);
    }
}
function toggleSound() {
    soundEnabled = !soundEnabled;
    updateSoundButtonIcon();
    localStorage.setItem('chess-sound', soundEnabled ? 'on' : 'off');
    if (soundEnabled) {
        playSound('click'); // Confirmation sound
    } else {
        // Optional: Stop any currently playing sounds
         Object.values(sounds).forEach(sound => {
            if (sound && !sound.paused) {
                sound.pause();
                sound.currentTime = 0;
            }
        });
    }
}
function updateSoundButtonIcon() {
    const icon = soundToggleButton ? soundToggleButton.querySelector('i') : null;
    if (icon) icon.className = soundEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
}

function showToast(message, iconClass = 'fa-info-circle', duration = 3000) {
    const container = document.querySelector('.toast-container');
    if (!container) {
        console.warn("Toast container not found in HTML.");
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    // Use innerHTML carefully, ensure message content is safe if dynamic
    toast.innerHTML = `<i class="fas ${iconClass}"></i><span>${message}</span>`;
    container.appendChild(toast);

    // Force reflow to enable animation
    void toast.offsetWidth;
    toast.classList.add('show');

    // Set timeout to remove 'show' class for fade-out animation
    setTimeout(() => {
        toast.classList.remove('show');
        // Remove element from DOM after transition ends
        toast.addEventListener('transitionend', () => {
            if (toast.parentElement === container) { // Check parent still exists
                container.removeChild(toast);
            }
        }, { once: true }); // Use {once: true} for cleanup
         // Fallback removal just in case transitionend doesn't fire reliably
         setTimeout(() => { if (toast.parentElement === container) container.removeChild(toast); }, duration + 500); // duration + animation time
    }, duration);
}

function showConfetti() {
    const container = document.createElement('div');
    container.className = 'confetti-container';
    document.body.appendChild(container); // Append directly to body to overlay everything
    const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4CAF50', '#ffeb3b', '#ffc107', '#ff9800'];
    const numConfetti = 100; // Number of confetti pieces

    for (let i = 0; i < numConfetti; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = `${Math.random() * 100}vw`; // Start horizontal position
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = `${Math.random() * 0.5}s`; // Slight delay variation
        confetti.style.animationDuration = `${3 + Math.random() * 2}s`; // Duration variation
        // Add horizontal drift variation (optional)
         const drift = (Math.random() - 0.5) * 200; // +/- 100px drift
         confetti.style.setProperty('--drift', `${drift}px`); // Pass drift to CSS variable if using complex animation
        container.appendChild(confetti);
    }

    // Remove container after a set time (longer than longest animation)
    setTimeout(() => {
         if (container.parentElement) {
             container.remove();
         }
    }, 6000); // Adjust time (e.g., 5000ms = 5s)
}

// --- PUZZLE ---
// --- PUZZLE ---
const hintButton = document.getElementById('hint-button');
const nextPuzzleButton = document.getElementById('next-puzzle-button');
const exitPuzzleButton = document.getElementById('exit-puzzle-button');

// Function to handle puzzle loading errors
function handlePuzzleLoadError(errorMessage) {
    console.error("Puzzle Load Error:", errorMessage);
    updateGameStatus(`Erreur: ${errorMessage}`);
    showToast(`Erreur de puzzle: ${errorMessage}`, 'fa-exclamation-triangle', 5000);
    // Optionally force return to main menu or disable puzzle mode
    returnToMainMenu(); // Ensure this cleans up puzzle state if needed
}

// Modify startPuzzleSession to be async
async function startPuzzleSession() { // Add async keyword
    console.log("Starting new puzzle session...");
    gameMode = 'puzzle';
    isGameOver = false;
    isReviewing = false;
    clearInterval(timerInterval);
    resetBoardStateForPuzzle(); // Reset UI elements

    // Setup callbacks *before* fetching, including the error handler
    PUZZLE.setupCallbacks({
        onComplete: handlePuzzleComplete,
        onIncorrect: handlePuzzleIncorrectMove,
        onCorrect: handlePuzzleCorrectMove,
        onOpponentMove: handlePuzzleOpponentMove,
        onLoadError: handlePuzzleLoadError // Add the error callback
    });

    // Fetch a new puzzle from the API
    updateGameStatus("Chargement du puzzle..."); // Indicate loading
    const puzzleData = await PUZZLE.fetchNewPuzzle(); // Use fetchNewPuzzle

    // fetchNewPuzzle returns null on failure and triggers onLoadError callback
    if (!puzzleData) {
        // Error handling is now done within handlePuzzleLoadError
        // We might still need a generic message if fetch returns null without specific error callback trigger
        console.log("Failed to fetch puzzle data (null returned).");
        // handlePuzzleLoadError might have already been called by fetchNewPuzzle
        // If not, call it here or show a generic message
        // updateGameStatus("Erreur: Impossible de charger un nouveau puzzle.");
        // showToast("Impossible de récupérer un puzzle.", 'fa-times-circle', 5000);
        // returnToMainMenu(); // Ensure cleanup
        return; // Exit if no puzzle data
    }

    // Try to start the fetched puzzle
    if (!PUZZLE.startPuzzle(puzzleData)) {
        // Error handling is now done within handlePuzzleLoadError (called by startPuzzle on failure)
        console.log("Failed to start puzzle (startPuzzle returned false).");
        // handlePuzzleLoadError might have already been called by startPuzzle
        // returnToMainMenu(); // Ensure cleanup
        return; // Exit if puzzle couldn't be started
    }

    // Puzzle started successfully, update UI
    document.body.classList.add('puzzle-mode-active');
    showScreen(gameLayoutEl);
    updatePuzzleUI(); // Initial UI setup for the loaded puzzle
}

// Reset function specific to starting a puzzle (UI cleanup)
function resetBoardStateForPuzzle() {
    selectedSquareAlg = null;
    lastMoveHighlight = null;
    if (moveListEl) moveListEl.innerHTML = ''; // Clear move history display
    if (capturedWhiteEl) capturedWhiteEl.innerHTML = ''; // Clear captures
    if (capturedBlackEl) capturedBlackEl.innerHTML = '';
    if (scoreAdvantageEl) scoreAdvantageEl.textContent = ''; // Clear score
    if (chessboard) chessboard.innerHTML = ''; // Clear board visually
    // Reset button states (will be updated by updatePuzzleUI)
    if (hintButton) hintButton.style.display = 'none';
    if (nextPuzzleButton) nextPuzzleButton.style.display = 'none';
    if (exitPuzzleButton) exitPuzzleButton.style.display = 'none';
    document.body.classList.remove('puzzle-mode-active'); // Remove class on reset
}

// Update UI based on current puzzle state from PUZZLE module
function updatePuzzleUI() {
    const puzzleInfo = PUZZLE.getCurrentPuzzleData();
    if (!puzzleInfo) {
        console.warn("updatePuzzleUI called but no current puzzle data found.");
        // Maybe reset to a default state or show an error?
        // For now, just return to avoid errors.
        return;
    }

    updateGameStatus(`${puzzleInfo.playerColor === 'w' ? 'Blancs' : 'Noirs'} jouent : ${puzzleInfo.description}`);
    // Ensure createBoard can handle the chess.js instance and player color
    createBoard(PUZZLE.getPuzzleInstance(), puzzleInfo.playerColor);
    updatePlayerTurnIndicator(puzzleInfo.isPlayerTurn ? puzzleInfo.playerColor : null);
    updatePuzzleControls(false); // Puzzle is ongoing initially

    // Update side panel info
    if(whiteTimeEl) whiteTimeEl.textContent = "Puzzle";
    if(blackTimeEl) blackTimeEl.textContent = `ID: ${puzzleInfo.id || 'N/A'}`; // Show puzzle ID

    if(player1NameEl) player1NameEl.textContent = puzzleInfo.playerColor === 'w' ? "Joueur" : "Puzzle";
    if(player1RatingEl) player1RatingEl.textContent = `(${puzzleInfo.rating || '????'})`; // Show puzzle rating
    if(player2NameEl) player2NameEl.textContent = puzzleInfo.playerColor === 'b' ? "Joueur" : "Puzzle";
    if(player2RatingEl) player2RatingEl.textContent = `(${puzzleInfo.rating || '????'})`; // Show puzzle rating

    // Hide progress bar if it exists
    const progressBar = document.getElementById('progress-bar');
    if (progressBar) progressBar.style.visibility = 'hidden';

    // Apply last move highlight if available (after createBoard)
    if (lastMoveHighlight) {
        highlightLastMove(lastMoveHighlight.from, lastMoveHighlight.to);
    }
    // Apply check highlight if needed (after createBoard)
    checkAndUpdateKingStatus(PUZZLE.getPuzzleInstance());
}

// Update visibility and state of puzzle control buttons
function updatePuzzleControls(isComplete) {
    const puzzleData = PUZZLE.getCurrentPuzzleData();
    const isPlayerTurn = puzzleData ? puzzleData.isPlayerTurn : false;

    if (hintButton) {
        hintButton.style.display = 'flex';
        // Disable hint if puzzle is complete OR it's not the player's turn
        hintButton.disabled = isComplete || !isPlayerTurn;
    }
    if (nextPuzzleButton) {
        nextPuzzleButton.style.display = 'flex';
        // Enable 'Next' only when the current puzzle is complete
        nextPuzzleButton.disabled = !isComplete;
    }
    if (exitPuzzleButton) {
        exitPuzzleButton.style.display = 'flex';
        exitPuzzleButton.disabled = false; // Exit should always be available
    }
}

// --- Puzzle Event Handlers (Called by PUZZLE module callbacks) ---

function handlePuzzleComplete(puzzleId) {
    showToast(`Puzzle ${puzzleId} résolu !`, 'fa-check-circle', 2000);
    playSound('win'); // Or a specific puzzle success sound
    updateGameStatus("Puzzle résolu ! Cliquez sur 'Suivant'.");
    updatePuzzleControls(true); // Enable Next button, disable Hint
}

function handlePuzzleIncorrectMove() {
    showToast("Mauvais coup. Essayez encore.", 'fa-times-circle', 1500);
    playSound('illegal');
    updateGameStatus("Mauvais coup. Réessayez !");
    // Deselect piece visually if one was selected
    if (selectedSquareAlg) {
        const selCoord = algToCoord(selectedSquareAlg);
        if (selCoord) {
            const squareEl = chessboard.querySelector(`.square[data-row="${selCoord[0]}"][data-col="${selCoord[1]}"]`);
            if (squareEl) squareEl.classList.remove('selected');
        }
        highlightMoves([]); // Clear highlights
        selectedSquareAlg = null;
    }
    // Board state doesn't change in PUZZLE module, so no redraw needed
    updatePuzzleControls(false); // Ensure hint is enabled (since it's still player's turn)
}

function handlePuzzleCorrectMove(moveResult) {
    showToast("Correct !", 'fa-thumbs-up', 1000);
    // Determine sound based on move flags (capture, check, etc.)
    let sound = 'move';
    if (moveResult.flags.includes('c')) sound = 'capture';
    if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) sound = 'castle'; // If using standard flags
    if (moveResult.san.includes('+') || moveResult.san.includes('#')) sound = 'check';
    playSound(sound);

    lastMoveHighlight = { from: moveResult.from, to: moveResult.to };
    // PUZZLE module updated its internal board, now update UI
    updatePuzzleUI(); // Redraw board, update status, check king, update controls
    updateGameStatus("Correct ! Au tour de l'adversaire..."); // Update status message
    // updatePuzzleControls(false) is called within updatePuzzleUI
}

function handlePuzzleOpponentMove(moveResult) {
     // Determine sound based on move flags
    let sound = 'move2'; // Opponent move sound
    if (moveResult.flags.includes('c')) sound = 'capture';
    if (moveResult.flags.includes('k') || moveResult.flags.includes('q')) sound = 'castle';
    if (moveResult.san.includes('+') || moveResult.san.includes('#')) sound = 'check';
    playSound(sound);

    lastMoveHighlight = { from: moveResult.from, to: moveResult.to };
    // PUZZLE module updated its internal board, now update UI
    updatePuzzleUI(); // Redraw board, update status, check king, update controls
    updateGameStatus("Votre tour."); // Update status message
    // updatePuzzleControls(false) is called within updatePuzzleUI
}

// --- Puzzle Actions ---

function showHint() {
    if (gameMode !== 'puzzle') return;
    const hint = PUZZLE.getHint(); // Gets { from, to, promotion? }
    if (hint) {
        // Highlight the 'from' square strongly
        highlightHintSquare(hint.from, 'hint-from');
        // Highlight the 'to' square subtly
        highlightHintSquare(hint.to, 'hint-to');

        showToast(`Indice : Jouez depuis ${hint.from}`, 'fa-lightbulb', 2000);
        playSound('click'); // Sound for getting a hint
    } else {
        showToast("Aucun indice disponible.", 'fa-info-circle');
    }
}

// Helper to highlight hint squares temporarily
function highlightHintSquare(alg, className) {
    const coord = algToCoord(alg);
    if (!coord) return;
    const squareEl = chessboard.querySelector(`.square[data-row="${coord[0]}"][data-col="${coord[1]}"]`);
    if (squareEl) {
        squareEl.classList.add(className);
        setTimeout(() => squareEl.classList.remove(className), 1500); // Remove after 1.5s
    }
}
console.log("scripts-v3.js (with PUZZLE integration) loaded.");
// --- END OF MODIFIED PUZZLE SECTION ---