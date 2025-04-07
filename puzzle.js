// --- START OF FILE puzzle.js ---

// Ensure chess.js is available (assuming it's loaded globally or via modules)
if (typeof Chess === 'undefined') {
    console.error("FATAL ERROR: chess.js library not found for puzzle module.");
    // Consider throwing an error or using a more robust mechanism
    // to halt execution or disable puzzle functionality.
    throw new Error("chess.js is required for the PUZZLE module.");
}

const PUZZLE = (() => {
    // --- Private Puzzle Data ---
    let allPuzzles = []; // Holds the raw loaded puzzle data {problemid, first, type, fen, moves}
    let puzzlesLoaded = false; // Flag to track loading
    let usedPuzzleIds = new Set(); // Track used puzzle IDs in the current session

    // --- Load puzzles from JSON ---
    async function loadPuzzles() {
        if (puzzlesLoaded) return true; // Don't reload
        try {
            const response = await fetch('puzzles_data.json'); // Ensure this path is correct
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            // Validate the structure
            if (!data || !Array.isArray(data.problems)) {
                throw new Error("Invalid JSON format: 'problems' array not found.");
            }
            allPuzzles = data.problems; // Store the array under 'problems'
            puzzlesLoaded = true;
            console.log(`Loaded ${allPuzzles.length} puzzles.`);
            // Basic validation of first puzzle (optional)
            if (allPuzzles.length > 0 && !allPuzzles[0].fen) {
                 console.warn("First puzzle seems malformed. Check JSON structure.");
            }
            return true;
        } catch (error) {
            console.error("Could not load or parse puzzles:", error);
            allPuzzles = []; // Ensure puzzles is empty on failure
            puzzlesLoaded = false;
            return false;
        }
    }

    // --- Module State ---
    let currentPuzzle = null; // Holds processed data for the active puzzle
                               // { id, description, fen, solution (array), playerColor }
    let puzzleGame = null; // Separate Chess instance for the puzzle
    let currentSolutionMoveIndex = 0; // Index within the puzzle's solution array
    let playerColor = 'w'; // Which color the human player controls in the puzzle ('w' or 'b')
    let isPlayerTurnInPuzzle = false; // Is it the player's turn within the solution sequence?
    let onPuzzleCompleteCallback = null;
    let onIncorrectMoveCallback = null;
    let onCorrectMoveCallback = null;
    let onOpponentMoveCallback = null;

    // --- Private Helper Functions ---

    // Converts UCI string like "e2e4" or "a7a8q" to a move object {from, to, promotion?}
    function _uciToMoveObject(uciMove) {
        if (!uciMove || uciMove.length < 4) return null;
        return {
            from: uciMove.substring(0, 2),
            to: uciMove.substring(2, 4),
            promotion: uciMove.length === 5 ? uciMove.substring(4).toLowerCase() : undefined
        };
    }

    // Parses the "moves" string (e.g., "f6-g7" or "e4-e5 d7-d5") into an array of UCI moves (e.g., ["f6g7"] or ["e4e5", "d7d5"])
    function _parseMovesString(movesStr) {
        if (!movesStr || typeof movesStr !== 'string') return [];
        const movePairs = movesStr.trim().split(/\s+/); // Split by space
        return movePairs.map(pair => pair.replace('-', '')); // Remove hyphen
    }

    // --- Public API ---
    return {
        // Ensure puzzles are loaded before accessing them
        ensureLoaded: loadPuzzles,

        // Setup callbacks from the main script
        setupCallbacks: (callbacks) => {
            onPuzzleCompleteCallback = callbacks.onComplete || null;
            onIncorrectMoveCallback = callbacks.onIncorrect || null;
            onCorrectMoveCallback = callbacks.onCorrect || null;
            onOpponentMoveCallback = callbacks.onOpponentMove || null;
        },

        // Get the next available puzzle data
        getNextPuzzle: async () => {
            const loaded = await loadPuzzles(); // Ensure loaded
            if (!loaded || allPuzzles.length === 0) {
                console.log("Puzzle data not available.");
                return null; // Return null if no puzzles loaded
            }
            if (usedPuzzleIds.size >= allPuzzles.length) {
                console.log("All puzzles completed in this session!");
                return null; // Return null if all used up
            }

            // Find puzzles whose problemid hasn't been used
            let availablePuzzles = allPuzzles.filter(p => !usedPuzzleIds.has(p.problemid));

            if (availablePuzzles.length === 0) {
                // This case should ideally be covered by the size check above,
                // but it's good practice to handle it.
                console.log("No more available puzzles (filtered). Resetting session might be needed.");
                return null;
            }

            const randomIndex = Math.floor(Math.random() * availablePuzzles.length);
            const puzzleRawData = availablePuzzles[randomIndex];

            // Add the chosen puzzle's ID to the used set *before* returning
            usedPuzzleIds.add(puzzleRawData.problemid);

            // Return the raw puzzle data object as defined in the JSON
            return puzzleRawData;
        },

        // Reset the set of used puzzle IDs for the current session
        resetSession: () => {
            usedPuzzleIds.clear();
            console.log("Puzzle session reset. All puzzles are available again.");
        },

        // Start a specific puzzle, processing the raw data
        startPuzzle: (puzzleRawData) => {
            // Validate essential fields from the raw data
            if (!puzzleRawData || !puzzleRawData.fen || !puzzleRawData.moves || !puzzleRawData.first || typeof puzzleRawData.problemid === 'undefined') {
                console.error("Invalid puzzle data provided to startPuzzle:", puzzleRawData);
                currentPuzzle = null;
                puzzleGame = null;
                return false;
            }

            try {
                // 1. Initialize chess.js with the FEN
                puzzleGame = new Chess(puzzleRawData.fen);

                // 2. Parse the solution moves string into an array of UCI moves
                const solutionUCI = _parseMovesString(puzzleRawData.moves);
                if (solutionUCI.length === 0) {
                    console.error(`Puzzle ${puzzleRawData.problemid} has no valid moves in 'moves' string: ${puzzleRawData.moves}`);
                    currentPuzzle = null;
                    puzzleGame = null;
                    return false;
                }

                // 3. Determine player's color based on the 'first' field
                let determinedPlayerColor;
                if (puzzleRawData.first === "White to Move") {
                    determinedPlayerColor = 'w';
                } else if (puzzleRawData.first === "Black to Move") {
                    determinedPlayerColor = 'b';
                } else {
                    console.error(`Puzzle ${puzzleRawData.problemid} has invalid 'first' field: ${puzzleRawData.first}. Assuming White.`);
                    determinedPlayerColor = 'w'; // Default fallback, might be wrong
                }

                // 4. Store processed puzzle data internally
                currentPuzzle = {
                    id: puzzleRawData.problemid,
                    description: puzzleRawData.type || `Puzzle ${puzzleRawData.problemid}`, // Use 'type' as description
                    fen: puzzleRawData.fen,
                    solution: solutionUCI, // Store the parsed array
                    playerColor: determinedPlayerColor
                };

                // 5. Reset puzzle state variables
                currentSolutionMoveIndex = 0;
                playerColor = currentPuzzle.playerColor; // Set the module's playerColor

                // 6. Determine if it's the player's turn *right now* based on FEN and playerColor
                isPlayerTurnInPuzzle = (puzzleGame.turn() === playerColor);

                console.log(`Starting Puzzle ${currentPuzzle.id}: ${currentPuzzle.description}. Player controls ${playerColor}. Board turn: ${puzzleGame.turn()}`);
                console.log("Parsed Solution (UCI):", currentPuzzle.solution);

                // 7. If the puzzle setup indicates it's NOT the player's turn initially,
                //    make the first opponent move immediately.
                if (!isPlayerTurnInPuzzle && currentPuzzle.solution.length > 0) {
                    console.log("Puzzle starts with an opponent move.");
                    // Use setTimeout to allow the UI to potentially update before the opponent moves
                    setTimeout(() => {
                        // Check if the puzzle wasn't stopped/changed during the timeout
                        if (currentPuzzle && currentPuzzle.id === puzzleRawData.problemid && !isPlayerTurnInPuzzle) {
                             PUZZLE.makeOpponentMove();
                        }
                    }, 500); // 500ms delay, adjust as needed
                }

                return true; // Puzzle started successfully

            } catch (e) {
                console.error(`Failed to load puzzle FEN or process data for puzzle ${puzzleRawData.problemid}:`, puzzleRawData.fen, e);
                puzzleGame = null;
                currentPuzzle = null;
                return false;
            }
        },

        // Get current puzzle info for UI update
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

        // Attempt to make the player's move
        makePlayerMove: (fromAlg, toAlg, promotionPiece) => {
            if (!currentPuzzle || !puzzleGame || !isPlayerTurnInPuzzle) {
                console.warn("Puzzle move rejected: Not player's turn or no active puzzle.");
                return 'invalid_state'; // Indicate why it failed
            }

            // Construct the player's move in UCI format
            const playerMoveUCI = fromAlg + toAlg + (promotionPiece ? promotionPiece.toLowerCase() : '');

            // Get the expected move from the solution array
            if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                 console.error("Error: Trying to make player move but solution index is out of bounds.");
                 return 'error';
            }
            const expectedSolutionMoveUCI = currentPuzzle.solution[currentSolutionMoveIndex];

            console.log(`Player attempts: ${playerMoveUCI}, Expecting: ${expectedSolutionMoveUCI}`);

            // 1. Check if the *intended* move matches the solution move for the current step
            if (playerMoveUCI.toLowerCase() !== expectedSolutionMoveUCI.toLowerCase()) {
                console.log("Incorrect move.");
                if (onIncorrectMoveCallback) {
                    onIncorrectMoveCallback(fromAlg, toAlg); // Notify UI
                }
                return 'incorrect'; // Player made the wrong move
            }

            // 2. Try making the move on the internal chess board
            const moveObject = _uciToMoveObject(playerMoveUCI);
            if (!moveObject) {
                // Should not happen if UCI is well-formed, but good to check
                console.error("Internal error: Failed to parse player move UCI:", playerMoveUCI);
                 if (onIncorrectMoveCallback) onIncorrectMoveCallback(fromAlg, toAlg);
                return 'error';
            }

            let moveResult = null;
            try {
                 moveResult = puzzleGame.move(moveObject);
            } catch (e) {
                 // Catch potential errors from chess.js move execution
                 console.error(`Error executing player move ${playerMoveUCI} on board:`, e);
                 moveResult = null;
            }


            if (moveResult === null) {
                // This indicates the move, although matching the solution string,
                // was illegal on the board. This points to a flaw in the puzzle data (FEN/solution mismatch).
                console.error(`Puzzle Error: Solution move ${playerMoveUCI} is illegal on board FEN: ${puzzleGame.fen()} for puzzle ${currentPuzzle.id}`);
                if (onIncorrectMoveCallback) {
                    onIncorrectMoveCallback(fromAlg, toAlg); // Treat as incorrect from user perspective
                }
                 // Consider stopping the puzzle or marking it as broken
                return 'error'; // Indicates an internal/data error
            }

            // --- Move is Correct and Legal ---
            console.log("Correct move made by player:", moveResult.san);
            currentSolutionMoveIndex++;
            isPlayerTurnInPuzzle = false; // Switch turn: Opponent's turn next (or puzzle complete)

            // Notify the main script/UI about the correct move
            if (onCorrectMoveCallback) {
                onCorrectMoveCallback(moveResult); // Pass the move result object
            }

            // Check if the puzzle is now complete
            if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                console.log(`Puzzle ${currentPuzzle.id} Complete!`);
                if (onPuzzleCompleteCallback) {
                    onPuzzleCompleteCallback(currentPuzzle.id);
                }
                // Ensure no further moves can be made accidentally
                currentPuzzle = null; // Or set a specific 'completed' state
                return 'complete'; // Puzzle finished successfully
            } else {
                // Puzzle continues, opponent needs to move
                console.log("Scheduling opponent move...");
                // Schedule opponent move after a short delay for visual feedback
                setTimeout(() => {
                     // Check if the puzzle context is still valid before making the move
                     if (currentPuzzle && !isPlayerTurnInPuzzle && currentSolutionMoveIndex < currentPuzzle.solution.length) {
                          PUZZLE.makeOpponentMove();
                     }
                }, 500); // Delay before opponent replies (adjust as needed)
                return 'correct_continue'; // Move was correct, puzzle continues
            }
        },

        // Make the opponent's move based on the solution array
        makeOpponentMove: () => {
            // Validate state before proceeding
            if (!currentPuzzle || !puzzleGame || isPlayerTurnInPuzzle || currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                console.warn("Opponent move skipped: Conditions not met (not opponent's turn, puzzle complete, or no active puzzle).");
                return false; // Indicate that the move wasn't made
            }

            const opponentMoveUCI = currentPuzzle.solution[currentSolutionMoveIndex];
            const moveObject = _uciToMoveObject(opponentMoveUCI);

            if (!moveObject) {
                console.error(`Internal error: Failed to parse opponent move UCI: ${opponentMoveUCI} for puzzle ${currentPuzzle.id}`);
                // Consider stopping the puzzle
                return false;
            }

            let moveResult = null;
            try {
                moveResult = puzzleGame.move(moveObject);

                if (moveResult === null) {
                    // Indicates the opponent's move from the solution is illegal. Puzzle data error.
                    console.error(`Puzzle Error: Opponent solution move ${opponentMoveUCI} is illegal on board FEN: ${puzzleGame.fen()} for puzzle ${currentPuzzle.id}`);
                    // Stop processing this puzzle to prevent potential infinite loops or crashes
                    isPlayerTurnInPuzzle = false; // Prevent further player moves
                    currentPuzzle = null; // Invalidate current puzzle state
                    return false; // Signal error
                }

                console.log("Opponent move made:", moveResult.san);
                currentSolutionMoveIndex++;
                isPlayerTurnInPuzzle = true; // Switch turn: Now player's turn again

                // Notify the main script/UI about the opponent's move
                if (onOpponentMoveCallback) {
                    onOpponentMoveCallback(moveResult); // Pass the move result
                }

                // Check if puzzle is complete AFTER the opponent's move
                // (e.g., player delivers check, opponent has only one move which gets mated)
                 if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                    console.log(`Puzzle ${currentPuzzle.id} Complete! (after opponent move)`);
                     if (onPuzzleCompleteCallback) {
                         onPuzzleCompleteCallback(currentPuzzle.id);
                     }
                     // Ensure no further moves
                     isPlayerTurnInPuzzle = false;
                     currentPuzzle = null;
                 }

                return true; // Opponent move successfully made

            } catch (e) {
                // Catch unexpected errors during move execution
                console.error(`Error executing opponent move ${opponentMoveUCI} for puzzle ${currentPuzzle.id}:`, e);
                isPlayerTurnInPuzzle = false; // Stop the puzzle on error
                currentPuzzle = null;
                return false; // Signal error
            }
        },

        // Provide a hint (the next correct move for the player)
        getHint: () => {
            if (!currentPuzzle || !isPlayerTurnInPuzzle || currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                return null; // No hint available in the current state
            }
            // Get the next move from the solution array (which should be the player's move)
            const nextMoveUCI = currentPuzzle.solution[currentSolutionMoveIndex];
            // Convert it to the { from, to, promotion? } format for easy use
            return _uciToMoveObject(nextMoveUCI);
        },

        // Provide the current FEN state of the puzzle board
        getPuzzleBoardState: () => {
            return puzzleGame ? puzzleGame.fen() : null;
        },

        // Provide the chess.js instance for the puzzle (e.g., for board rendering)
        getPuzzleInstance: () => {
            return puzzleGame;
        }
    };
})();

// Export the module
export { PUZZLE };

// Optional: Trigger loading when the script is imported/run.
// Note: Using await here might require this script to be part of an async context or module.
// Consider calling PUZZLE.ensureLoaded() explicitly from your main application logic
// after the DOM is ready or when puzzle mode is initiated.
// (async () => {
//     await PUZZLE.ensureLoaded();
// })();

// --- END OF FILE puzzle.js ---