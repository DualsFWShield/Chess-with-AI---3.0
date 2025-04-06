// --- START OF FILE puzzle.js ---

// Ensure chess.js is available (assuming it's loaded globally or via modules)
if (typeof Chess === 'undefined') {
    console.error("FATAL ERROR: chess.js library not found for puzzle module.");
    // You might want a more robust way to handle this, maybe disable puzzle mode
}

const PUZZLE = (() => {
    // --- Private Puzzle Data ---
    let puzzles = []; // Initialize as empty array
    let puzzlesLoaded = false; // Flag to track loading
    let usedPuzzleIds = new Set(); // Track used puzzles in the current session

    // --- Load puzzles from JSON ---
    async function loadPuzzles() {
        if (puzzlesLoaded) return true; // Don't reload
        try {
            const response = await fetch('puzzles_data.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            puzzles = await response.json();
            puzzlesLoaded = true;
            console.log(`Loaded ${puzzles.length} puzzles.`);
            return true;
        } catch (error) {
            console.error("Could not load puzzles:", error);
            puzzles = []; // Ensure puzzles is empty on failure
            puzzlesLoaded = false;
            return false;
        }
    }

    // --- Module State ---
    let currentPuzzle = null;
    let puzzleGame = null; // Separate Chess instance for the puzzle
    let currentSolutionMoveIndex = 0; // Index within the puzzle's solution array
    let playerColor = 'w'; // Which color the human player controls in the puzzle
    let isPlayerTurnInPuzzle = false; // Is it the player's turn within the solution sequence?
    let onPuzzleCompleteCallback = null;
    let onIncorrectMoveCallback = null;
    let onCorrectMoveCallback = null;
    let onOpponentMoveCallback = null;

    // --- Private Helper Functions ---
    function _uciToMoveObject(uciMove) {
        if (!uciMove || uciMove.length < 4) return null;
        return {
            from: uciMove.substring(0, 2),
            to: uciMove.substring(2, 4),
            promotion: uciMove.length === 5 ? uciMove.substring(4).toLowerCase() : undefined
        };
    }

    // --- Public API ---
    return {
        // Ensure puzzles are loaded before accessing them
        ensureLoaded: loadPuzzles, // Expose loading function if needed externally

        // Setup callbacks from the main script
        setupCallbacks: (callbacks) => {
            onPuzzleCompleteCallback = callbacks.onComplete;
            onIncorrectMoveCallback = callbacks.onIncorrect;
            onCorrectMoveCallback = callbacks.onCorrect;
            onOpponentMoveCallback = callbacks.onOpponentMove;
        },

        // Modified getNextPuzzle to work with async loading
        getNextPuzzle: async () => {
            const loaded = await loadPuzzles(); // Ensure loaded
            if (!loaded || puzzles.length === 0) {
                console.log("Puzzle data not available.");
                return null;
            }
            if (usedPuzzleIds.size >= puzzles.length) {
                console.log("All puzzles completed in this session!");
                return null;
            }
            let availablePuzzles = puzzles.filter(p => !usedPuzzleIds.has(p.id));
            if (availablePuzzles.length === 0) {
                console.log("No more available puzzles (filtered).");
                return null;
            }
            const randomIndex = Math.floor(Math.random() * availablePuzzles.length);
            const puzzle = availablePuzzles[randomIndex];
            usedPuzzleIds.add(puzzle.id);
            return puzzle;
        },

        resetSession: () => {
            usedPuzzleIds.clear();
            console.log("Puzzle session reset.");
        },

        // Start a specific puzzle
        startPuzzle: (puzzleData) => {
            if (!puzzleData || !puzzleData.fen || !puzzleData.solution || !puzzleData.playerColor) {
                console.error("Invalid puzzle data provided:", puzzleData);
                return false;
            }
            currentPuzzle = puzzleData;
            try {
                puzzleGame = new Chess(currentPuzzle.fen); // Load the puzzle position
                currentSolutionMoveIndex = 0;
                playerColor = currentPuzzle.playerColor;
                // Determine if it's the player's turn based on FEN and playerColor
                isPlayerTurnInPuzzle = (puzzleGame.turn() === playerColor);

                console.log(`Starting Puzzle ${currentPuzzle.id}: ${currentPuzzle.description}. Player is ${playerColor}. Turn: ${puzzleGame.turn()}`);
                console.log("Solution:", currentPuzzle.solution);

                // If the first move is NOT the player's, make the first opponent move immediately
                if (!isPlayerTurnInPuzzle && currentPuzzle.solution.length > 0) {
                    console.log("Puzzle starts with opponent move.");
                    // Delay slightly to allow UI update?
                    setTimeout(() => {
                        PUZZLE.makeOpponentMove();
                    }, 500); // 500ms delay
                }

                return true;
            } catch (e) {
                console.error("Failed to load puzzle FEN:", currentPuzzle.fen, e);
                puzzleGame = null;
                currentPuzzle = null;
                return false;
            }
        },

        // Get current puzzle info for UI
        getCurrentPuzzleData: () => {
            if (!currentPuzzle || !puzzleGame) return null;
            return {
                id: currentPuzzle.id,
                description: currentPuzzle.description,
                playerColor: playerColor,
                isPlayerTurn: isPlayerTurnInPuzzle,
                fen: puzzleGame.fen() // Current FEN of the puzzle board
            };
        },

        // Attempt player's move
        makePlayerMove: (fromAlg, toAlg, promotion) => {
            if (!currentPuzzle || !puzzleGame || !isPlayerTurnInPuzzle) {
                console.warn("Puzzle move rejected: Not player's turn or no active puzzle.");
                return 'invalid_state';
            }

            const expectedSolutionMoveUCI = currentPuzzle.solution[currentSolutionMoveIndex];
            const playerMoveUCI = fromAlg + toAlg + (promotion || '');

            console.log(`Player attempts: ${playerMoveUCI}, Expecting: ${expectedSolutionMoveUCI}`);

            // 1. Check if the *intended* move matches the solution
            if (playerMoveUCI.toLowerCase() !== expectedSolutionMoveUCI.toLowerCase()) {
                console.log("Incorrect move.");
                if (onIncorrectMoveCallback) onIncorrectMoveCallback(fromAlg, toAlg);
                return 'incorrect';
            }

            // 2. Try making the move on the board
            const moveObject = _uciToMoveObject(playerMoveUCI);
            if (!moveObject) {
                console.error("Internal error: Failed to parse player move UCI:", playerMoveUCI);
                if (onIncorrectMoveCallback) onIncorrectMoveCallback(fromAlg, toAlg); // Treat as incorrect
                return 'error';
            }

            const moveResult = puzzleGame.move(moveObject);

            if (moveResult === null) {
                // This SHOULD NOT happen if the solution is valid, but check anyway
                console.error(`Puzzle Error: Solution move ${playerMoveUCI} is illegal on board FEN: ${puzzleGame.fen()}`);
                if (onIncorrectMoveCallback) onIncorrectMoveCallback(fromAlg, toAlg);
                // Maybe mark puzzle as broken?
                return 'error';
            }

            // --- Move is Correct and Legal ---
            console.log("Correct move made by player:", moveResult.san);
            currentSolutionMoveIndex++;
            isPlayerTurnInPuzzle = false; // Now opponent's turn (or puzzle complete)

            // Play sound, update UI via callback
            if (onCorrectMoveCallback) onCorrectMoveCallback(moveResult);

            // Check if puzzle is complete
            if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                console.log("Puzzle Complete!");
                if (onPuzzleCompleteCallback) onPuzzleCompleteCallback(currentPuzzle.id);
                return 'complete';
            } else {
                // Puzzle continues, opponent needs to move
                // Schedule opponent move after a short delay for visual feedback
                console.log("Scheduling opponent move...");
                setTimeout(() => {
                    PUZZLE.makeOpponentMove();
                }, 500); // Delay before opponent replies
                return 'correct_continue';
            }
        },

        // Make the opponent's move based on the solution
        makeOpponentMove: () => {
            if (!currentPuzzle || !puzzleGame || isPlayerTurnInPuzzle || currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                console.warn("Opponent move skipped: Not opponent's turn, puzzle complete, or no active puzzle.");
                return false;
            }

            const opponentMoveUCI = currentPuzzle.solution[currentSolutionMoveIndex];
            const moveObject = _uciToMoveObject(opponentMoveUCI);

            if (!moveObject) {
                console.error("Internal error: Failed to parse opponent move UCI:", opponentMoveUCI);
                return false; // Signal error?
            }

            // Add a try-catch block for extra safety with potentially bad puzzle data
            try {
                const moveResult = puzzleGame.move(moveObject);

                if (moveResult === null) {
                    console.error(`Puzzle Error: Opponent solution move ${opponentMoveUCI} is illegal on board FEN: ${puzzleGame.fen()}`);
                    // What to do here? Maybe skip puzzle?
                    // For now, log error and stop processing this puzzle.
                    isPlayerTurnInPuzzle = false; // Prevent further moves
                    return false;
                }

                console.log("Opponent move made:", moveResult.san);
                currentSolutionMoveIndex++;
                isPlayerTurnInPuzzle = true; // Now player's turn again

                if (onOpponentMoveCallback) onOpponentMoveCallback(moveResult);

                // Check if puzzle is complete AFTER opponent move (unlikely for well-formed puzzles, but possible)
                if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                    console.log("Puzzle Complete (after opponent move)!");
                    if (onPuzzleCompleteCallback) onPuzzleCompleteCallback(currentPuzzle.id);
                    isPlayerTurnInPuzzle = false; // Ensure player can't move more
                }

                return true;
            } catch (e) {
                console.error(`Error executing opponent move ${opponentMoveUCI}:`, e);
                isPlayerTurnInPuzzle = false; // Stop the puzzle on error
                return false;
            }
        },

        // Provide a hint (e.g., the next move)
        getHint: () => {
            if (!currentPuzzle || !isPlayerTurnInPuzzle || currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                return null;
            }
            const nextMoveUCI = currentPuzzle.solution[currentSolutionMoveIndex];
            return _uciToMoveObject(nextMoveUCI); // Return { from, to, promotion? }
        },

        // Expose the internal game state if needed (use carefully)
        getPuzzleBoardState: () => {
            return puzzleGame ? puzzleGame.fen() : null;
        },
        getPuzzleInstance: () => { // Useful for drawing the board
            return puzzleGame;
        }
    };
})();

// Optional: Preload puzzles when the script loads
// PUZZLE.ensureLoaded();

// --- END OF FILE puzzle.js ---