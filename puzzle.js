// --- START OF FILE puzzle.js ---

// Ensure chess.js is available (assuming it's loaded globally or via modules)
if (typeof Chess === 'undefined') {
    console.error("FATAL ERROR: chess.js library not found for puzzle module.");
    throw new Error("chess.js is required for the PUZZLE module.");
}

const PUZZLE = (() => {
    // --- Lichess API Configuration ---
    const LICHESS_API_BASE = 'https://lichess.org/api';

    // --- Module State ---
    let currentPuzzle = null;
    let puzzleGame = null;
    let currentSolutionMoveIndex = 0;
    let playerColor = 'b';
    let isPlayerTurnInPuzzle = false;
    let currentDifficulty = 'normal';
    let isFetching = false;

    // --- Callbacks ---
    let onPuzzleCompleteCallback = null;
    let onIncorrectMoveCallback = null;
    let onCorrectMoveCallback = null;
    let onOpponentMoveCallback = null;
    let onPuzzleLoadErrorCallback = null;

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
        setupCallbacks: (callbacks) => {
            onPuzzleCompleteCallback = callbacks.onComplete || null;
            onIncorrectMoveCallback = callbacks.onIncorrect || null;
            onCorrectMoveCallback = callbacks.onCorrect || null;
            onOpponentMoveCallback = callbacks.onOpponent || null;
            onPuzzleLoadErrorCallback = callbacks.onLoadError || null;
        },

        setDifficulty: (difficulty) => {
            const validDifficulties = ["easiest", "easier", "normal", "harder", "hardest"];
            if (validDifficulties.includes(difficulty)) {
                currentDifficulty = difficulty;
                console.log(`Puzzle difficulty set to: ${currentDifficulty}`);
            } else {
                console.warn(`Invalid difficulty level: ${difficulty}. Using default: ${currentDifficulty}`);
            }
        },

        getCurrentDifficulty: () => currentDifficulty,

        fetchNewPuzzle: async () => {
            if (isFetching) {
                console.warn("Already fetching a puzzle. Please wait.");
                return null;
            }
            isFetching = true;
            console.log(`Requesting new puzzle with difficulty: ${currentDifficulty}...`);

            const apiUrl = `${LICHESS_API_BASE}/puzzle/next?difficulty=${currentDifficulty}`;

            try {
                const response = await fetch(apiUrl);
                if (!response.ok) {
                    throw new Error(`Lichess API error! status: ${response.status} ${response.statusText}`);
                }
                const puzzleData = await response.json();

                if (!puzzleData || !puzzleData.game || !puzzleData.puzzle || !puzzleData.puzzle.id || !puzzleData.game.pgn || !puzzleData.puzzle.solution) {
                    throw new Error("Invalid puzzle data received from Lichess API.");
                }

                console.log(`Fetched puzzle ID: ${puzzleData.puzzle.id}, Rating: ${puzzleData.puzzle.rating}`);
                isFetching = false;
                return puzzleData;

            } catch (error) {
                console.error("Could not fetch or parse puzzle from Lichess API:", error);
                isFetching = false;
                if (onPuzzleLoadErrorCallback) {
                    onPuzzleLoadErrorCallback("Failed to fetch puzzle from Lichess.");
                }
                return null;
            }
        },

        startPuzzle: (lichessPuzzleData) => {
            if (!lichessPuzzleData?.game?.pgn || !lichessPuzzleData?.puzzle?.solution || typeof lichessPuzzleData?.puzzle?.initialPly === 'undefined' || !lichessPuzzleData?.puzzle?.id) {
                console.error("Invalid Lichess puzzle data provided to startPuzzle:", lichessPuzzleData);
                if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback("Invalid puzzle data format.");
                currentPuzzle = null;
                puzzleGame = null;
                return false;
            }

            const puzzleId = lichessPuzzleData.puzzle.id;
            const initialPly = lichessPuzzleData.puzzle.initialPly;
            const pgn = lichessPuzzleData.game.pgn;
            const solutionUCI = lichessPuzzleData.puzzle.solution;

            console.log(`[Puzzle ${puzzleId}] Processing: initialPly=${initialPly}`);

            try {
                const fullGame = new Chess();
                const pgnLoaded = fullGame.load_pgn(pgn, { sloppy: true });
                if (!pgnLoaded) {
                    throw new Error(`Failed to load PGN.`);
                }

                const historyVerbose = fullGame.history({ verbose: true });
                if (historyVerbose.length < initialPly) {
                    throw new Error(`PGN history length (${historyVerbose.length}) is less than initialPly (${initialPly}).`);
                }

                puzzleGame = new Chess();
                for (let i = 0; i < initialPly; i++) {
                    const moveData = historyVerbose[i];
                    const moveInput = {
                        from: moveData.from,
                        to: moveData.to,
                        promotion: moveData.promotion
                    };
                    const moveResult = puzzleGame.move(moveInput);
                    if (moveResult === null) {
                        console.error(`[Puzzle ${puzzleId}] Failed to replay move #${i + 1}: ${JSON.stringify(moveInput)} from PGN. Current FEN: ${puzzleGame.fen()}`);
                        throw new Error(`Internal error replaying move #${i + 1} from PGN.`);
                    }
                }

                const startFen = puzzleGame.fen();
                const fenValidation = puzzleGame.validate_fen(startFen);
                if (!fenValidation.valid) {
                    console.error(`[Puzzle ${puzzleId}] Generated FEN is invalid after replaying ${initialPly} moves. FEN: ${startFen}, Error: ${fenValidation.error}`);
                    throw new Error(`Generated invalid FEN: ${fenValidation.error}`);
                }
                console.log(`[Puzzle ${puzzleId}] Successfully generated starting FEN: ${startFen}`);

                playerColor = puzzleGame.turn();

                if (!solutionUCI || solutionUCI.length === 0) {
                    throw new Error(`Solution array is empty.`);
                }
                const firstMoveUCI = solutionUCI[0];
                const firstMoveObject = _uciToMoveObject(firstMoveUCI);
                if (!firstMoveObject) {
                    throw new Error(`Invalid first move UCI in solution: ${firstMoveUCI}`);
                }

                const tempGame = new Chess(startFen);
                const firstMoveResult = tempGame.move(firstMoveObject);
                if (firstMoveResult === null) {
                    const errorMsg = `First solution move ${firstMoveUCI} is illegal on starting board FEN: ${startFen}`;
                    console.error(`[Puzzle ${puzzleId}] ${errorMsg}`);
                    throw new Error(errorMsg);
                }
                console.log(`[Puzzle ${puzzleId}] First solution move ${firstMoveUCI} (${firstMoveResult.san}) validated successfully.`);

                currentPuzzle = {
                    id: puzzleId,
                    rating: lichessPuzzleData.puzzle.rating,
                    themes: lichessPuzzleData.puzzle.themes || [],
                    fen: startFen,
                    solution: solutionUCI,
                    playerColor: playerColor,
                    initialPly: initialPly,
                    pgn: pgn
                };

                currentSolutionMoveIndex = 0;
                isPlayerTurnInPuzzle = true;

                console.log(`Starting Puzzle ${currentPuzzle.id}: Rating ${currentPuzzle.rating}, Player controls ${playerColor === 'w' ? 'White' : 'Black'}`);
                return true;

            } catch (e) {
                console.error(`[Puzzle ${puzzleId}] Failed to process puzzle data:`, e.message);
                puzzleGame = null;
                currentPuzzle = null;
                if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback(`Error processing puzzle: ${e.message}`);
                return false;
            }
        },

        getCurrentPuzzleData: () => {
            if (!currentPuzzle || !puzzleGame) return null;
            return {
                id: currentPuzzle.id,
                rating: currentPuzzle.rating,
                themes: currentPuzzle.themes,
                playerColor: playerColor,
                isPlayerTurn: isPlayerTurnInPuzzle,
                fen: puzzleGame.fen(),
                description: `Rating: ${currentPuzzle.rating} ${currentPuzzle.themes.length > 0 ? '| Themes: ' + currentPuzzle.themes.join(', ') : ''}`
            };
        },

        makePlayerMove: (fromAlg, toAlg, promotionPiece) => {
            if (!currentPuzzle || !puzzleGame || !isPlayerTurnInPuzzle) {
                console.warn("Puzzle move rejected: Not player's turn or no active puzzle.");
                return 'invalid_state';
            }
        
            // Ensure promotion piece is lowercase if provided
            const playerMoveUCI = fromAlg + toAlg + (promotionPiece ? promotionPiece.toLowerCase() : '');
        
            if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                console.error(`[Puzzle ${currentPuzzle.id}] Error: Trying to make player move but solution index (${currentSolutionMoveIndex}) is out of bounds (max ${currentPuzzle.solution.length - 1}).`);
                // Consider stopping the puzzle or triggering an error state
                PUZZLE.stopPuzzle();
                if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback("Internal puzzle error: solution index invalid.");
                return 'error';
            }
            // Compare lowercase UCI strings for robustness
            const expectedSolutionMoveUCI = currentPuzzle.solution[currentSolutionMoveIndex].toLowerCase();
        
            console.log(`[Puzzle ${currentPuzzle.id}] Player attempts: ${playerMoveUCI}, Expecting: ${expectedSolutionMoveUCI}`);
        
            if (playerMoveUCI.toLowerCase() !== expectedSolutionMoveUCI) {
                console.log(`[Puzzle ${currentPuzzle.id}] Incorrect move.`);
                if (onIncorrectMoveCallback) {
                    onIncorrectMoveCallback(fromAlg, toAlg); // Trigger callback for incorrect move
                }
                return 'incorrect'; // Return specific code for incorrect
            }
        
            // --- Move is Correct ---
            const moveObject = _uciToMoveObject(playerMoveUCI); // Use the validated playerMoveUCI
            if (!moveObject) {
                console.error(`[Puzzle ${currentPuzzle.id}] Internal error: Failed to parse correct player move UCI: ${playerMoveUCI}`);
                PUZZLE.stopPuzzle();
                if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback("Internal puzzle error: cannot parse move.");
                return 'error';
            }
        
            let moveResult = null;
            try {
                moveResult = puzzleGame.move(moveObject); // Execute the move in the puzzle's game instance
            } catch (e) {
                console.error(`[Puzzle ${currentPuzzle.id}] Error executing validated player move ${playerMoveUCI} on board FEN ${puzzleGame?.fen()}:`, e);
                moveResult = null; // Ensure moveResult is null on error
            }
        
            if (moveResult === null) {
                // This should ideally not happen if the puzzle data is correct and move was validated
                console.error(`[Puzzle ${currentPuzzle.id}] Critical Error: Correct solution move ${playerMoveUCI} was illegal on board FEN: ${puzzleGame?.fen()}. Puzzle data likely flawed.`);
                // Stop the puzzle and signal an error
                PUZZLE.stopPuzzle();
                if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback("Internal puzzle error: correct move was illegal.");
                // We might still call incorrect callback here as the player effectively can't proceed
                if (onIncorrectMoveCallback) onIncorrectMoveCallback(fromAlg, toAlg);
                return 'error';
            }
        
            // --- Move Execution Successful ---
            console.log(`[Puzzle ${currentPuzzle.id}] Correct move made by player: ${moveResult.san}`);
            currentSolutionMoveIndex++;
            isPlayerTurnInPuzzle = false; // Turn passes to opponent (or puzzle ends)
        
            // Trigger the callback for correct move UI updates (e.g., sound, highlight)
            if (onCorrectMoveCallback) {
                onCorrectMoveCallback(moveResult);
            }
        
            // Check if puzzle is now complete
            if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                console.log(`[Puzzle ${currentPuzzle.id}] Complete!`);
                if (onPuzzleCompleteCallback) {
                    onPuzzleCompleteCallback(currentPuzzle.id); // Trigger completion callback
                }
                isPlayerTurnInPuzzle = false; // Ensure turn stays off
                return 'complete'; // Return specific code for complete
            } else {
                // Puzzle continues, schedule opponent move
                console.log(`[Puzzle ${currentPuzzle.id}] Scheduling opponent move #${currentSolutionMoveIndex}...`);
                // Use a reference to the puzzle ID when scheduling to prevent race conditions if a new puzzle is loaded quickly
                const activePuzzleId = currentPuzzle.id;
                setTimeout(() => {
                    // Check if we are still on the same puzzle and it's opponent's turn
                    if (currentPuzzle && currentPuzzle.id === activePuzzleId && !isPlayerTurnInPuzzle && currentSolutionMoveIndex < currentPuzzle?.solution?.length) {
                        PUZZLE.makeOpponentMove(activePuzzleId);
                    } else {
                         console.log(`[Puzzle ${activePuzzleId}] Skipped scheduled opponent move - puzzle state changed (Current: ${currentPuzzle?.id}, Turn: ${isPlayerTurnInPuzzle}, Index: ${currentSolutionMoveIndex}).`);
                    }
                }, 500); // Delay for opponent move
                return 'correct_continue'; // Return specific code for correct move, expecting opponent
            }
        },

        makeOpponentMove: (puzzleIdCheck) => {
            // --- Pre-conditions Check ---
            if (!currentPuzzle) {
                console.warn("Opponent move skipped: No active puzzle.");
                return false;
            }
            if (currentPuzzle.id !== puzzleIdCheck) {
                console.warn(`Opponent move skipped: Puzzle ID changed (expected ${puzzleIdCheck}, current ${currentPuzzle.id}).`);
                return false;
            }
            if (isPlayerTurnInPuzzle) {
                console.warn(`[Puzzle ${currentPuzzle.id}] Opponent move skipped: It is currently the player's turn.`);
                return false;
            }
            if (!puzzleGame) {
                 console.error(`[Puzzle ${currentPuzzle.id}] Opponent move failed: puzzleGame instance is null.`);
                 PUZZLE.stopPuzzle();
                 if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback("Internal puzzle error: game instance missing.");
                 return false;
            }
             if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                 console.warn(`[Puzzle ${currentPuzzle.id}] Opponent move skipped: Solution index (${currentSolutionMoveIndex}) indicates puzzle should be complete.`);
                 // Might happen due to race condition, ensure state is correct
                 if (onPuzzleCompleteCallback) onPuzzleCompleteCallback(currentPuzzle.id);
                 isPlayerTurnInPuzzle = false; // Ensure turn stays off
                 return false;
             }
        
            // --- Get and Validate Move ---
            const opponentMoveUCI = currentPuzzle.solution[currentSolutionMoveIndex];
            const moveObject = _uciToMoveObject(opponentMoveUCI);
        
            if (!moveObject) {
                console.error(`[Puzzle ${currentPuzzle.id}] Internal error: Failed to parse opponent move UCI: ${opponentMoveUCI}`);
                PUZZLE.stopPuzzle();
                if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback("Error processing opponent move.");
                return false;
            }
        
            // --- Execute Move ---
            let moveResult = null;
            try {
                moveResult = puzzleGame.move(moveObject); // Execute opponent's move
            } catch (e) {
                console.error(`[Puzzle ${currentPuzzle.id}] Error executing opponent move ${opponentMoveUCI} on board FEN ${puzzleGame?.fen()}:`, e);
                moveResult = null; // Ensure null on error
            }
        
            if (moveResult === null) {
                console.error(`[Puzzle ${currentPuzzle.id}] Critical Error: Opponent solution move ${opponentMoveUCI} was illegal on board FEN: ${puzzleGame?.fen()}. Puzzle data likely flawed.`);
                PUZZLE.stopPuzzle();
                if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback("Puzzle data error: illegal opponent move.");
                isPlayerTurnInPuzzle = false; // Keep turn off
                return false;
            }
        
            // --- Move Execution Successful ---
            console.log(`[Puzzle ${currentPuzzle.id}] Opponent move #${currentSolutionMoveIndex} (${moveResult.san}) made.`);
            currentSolutionMoveIndex++;
            isPlayerTurnInPuzzle = true; // Turn passes back to player
        
            // Trigger callback for UI update (sound, highlight)
            if (onOpponentMoveCallback) {
                onOpponentMoveCallback(moveResult);
            }
        
            // Check if the puzzle is now complete (opponent made the last move)
            if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                console.log(`[Puzzle ${currentPuzzle.id}] Complete! (after opponent move)`);
                if (onPuzzleCompleteCallback) {
                    onPuzzleCompleteCallback(currentPuzzle.id); // Trigger completion callback
                }
                isPlayerTurnInPuzzle = false; // Turn doesn't pass back if puzzle is over
            } else {
                 console.log(`[Puzzle ${currentPuzzle.id}] Turn passes back to player.`);
            }
        
            return true;
        },

        getHint: () => {
            if (!currentPuzzle || !isPlayerTurnInPuzzle || currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                return null;
            }
            const nextMoveUCI = currentPuzzle.solution[currentSolutionMoveIndex];
            return _uciToMoveObject(nextMoveUCI);
        },

        getPuzzleBoardState: () => {
            return puzzleGame ? puzzleGame.fen() : null;
        },

        getPuzzleInstance: () => {
            return puzzleGame;
        },

        stopPuzzle: () => {
            console.log("Stopping current puzzle.");
            currentPuzzle = null;
            puzzleGame = null;
            isPlayerTurnInPuzzle = false;
            currentSolutionMoveIndex = 0;
        }
    };
})();

// Export the module
export { PUZZLE };

// --- END OF FILE puzzle.js ---