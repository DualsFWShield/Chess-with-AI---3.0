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

            const playerMoveUCI = fromAlg + toAlg + (promotionPiece ? promotionPiece.toLowerCase() : '');

            if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                console.error("Error: Trying to make player move but solution index is out of bounds.");
                return 'error';
            }
            const expectedSolutionMoveUCI = currentPuzzle.solution[currentSolutionMoveIndex];

            console.log(`Player attempts: ${playerMoveUCI}, Expecting: ${expectedSolutionMoveUCI}`);

            if (playerMoveUCI.toLowerCase() !== expectedSolutionMoveUCI.toLowerCase()) {
                console.log("Incorrect move.");
                if (onIncorrectMoveCallback) {
                    onIncorrectMoveCallback(fromAlg, toAlg);
                }
                return 'incorrect';
            }

            const moveObject = _uciToMoveObject(playerMoveUCI);
            if (!moveObject) {
                console.error("Internal error: Failed to parse player move UCI:", playerMoveUCI);
                if (onIncorrectMoveCallback) onIncorrectMoveCallback(fromAlg, toAlg);
                return 'error';
            }

            let moveResult = null;
            try {
                const gameInstance = puzzleGame;
                if (!gameInstance) throw new Error("puzzleGame is null");
                moveResult = gameInstance.move(moveObject);
            } catch (e) {
                console.error(`Error executing player move ${playerMoveUCI} on board:`, e);
                moveResult = null;
            }

            if (moveResult === null) {
                console.error(`Puzzle Error: Solution move ${playerMoveUCI} became illegal on board FEN: ${puzzleGame?.fen()} for puzzle ${currentPuzzle.id}`);
                if (onIncorrectMoveCallback) {
                    onIncorrectMoveCallback(fromAlg, toAlg);
                }
                PUZZLE.stopPuzzle();
                if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback("Internal puzzle error: illegal move found.");
                return 'error';
            }

            console.log("Correct move made by player:", moveResult.san);
            currentSolutionMoveIndex++;
            isPlayerTurnInPuzzle = false;

            if (onCorrectMoveCallback) {
                onCorrectMoveCallback(moveResult);
            }

            if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                console.log(`Puzzle ${currentPuzzle.id} Complete!`);
                if (onPuzzleCompleteCallback) {
                    onPuzzleCompleteCallback(currentPuzzle.id);
                }
                isPlayerTurnInPuzzle = false;
                return 'complete';
            } else {
                console.log("Scheduling opponent move...");
                setTimeout(() => {
                    const activePuzzleId = currentPuzzle ? currentPuzzle.id : null;
                    if (activePuzzleId && !isPlayerTurnInPuzzle && currentSolutionMoveIndex < currentPuzzle?.solution?.length) {
                        PUZZLE.makeOpponentMove(activePuzzleId);
                    } else {
                        console.log("Skipping scheduled opponent move - puzzle state changed.");
                    }
                }, 500);
                return 'correct_continue';
            }
        },

        makeOpponentMove: (puzzleIdCheck) => {
            if (!currentPuzzle || currentPuzzle.id !== puzzleIdCheck || !puzzleGame || isPlayerTurnInPuzzle || currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                console.warn("Opponent move skipped: Conditions not met (puzzle changed, not opponent's turn, puzzle complete, or no active puzzle). Current Puzzle ID:", currentPuzzle?.id, "Expected:", puzzleIdCheck);
                return false;
            }

            const opponentMoveUCI = currentPuzzle.solution[currentSolutionMoveIndex];
            const moveObject = _uciToMoveObject(opponentMoveUCI);

            if (!moveObject) {
                console.error(`Internal error: Failed to parse opponent move UCI: ${opponentMoveUCI} for puzzle ${currentPuzzle.id}`);
                currentPuzzle = null;
                if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback("Error processing opponent move.");
                return false;
            }

            let moveResult = null;
            try {
                const gameInstance = puzzleGame;
                if (!gameInstance) throw new Error("puzzleGame is null during opponent move");
                moveResult = gameInstance.move(moveObject);

                if (moveResult === null) {
                    console.error(`Puzzle Error: Opponent solution move ${opponentMoveUCI} is illegal on board FEN: ${puzzleGame?.fen()} for puzzle ${currentPuzzle.id}`);
                    isPlayerTurnInPuzzle = false;
                    currentPuzzle = null;
                    if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback("Puzzle data error: illegal opponent move.");
                    return false;
                }

                console.log("Opponent move made:", moveResult.san);
                currentSolutionMoveIndex++;
                isPlayerTurnInPuzzle = true;

                if (onOpponentMoveCallback) {
                    onOpponentMoveCallback(moveResult);
                }

                if (currentSolutionMoveIndex >= currentPuzzle.solution.length) {
                    console.log(`Puzzle ${currentPuzzle.id} Complete! (after opponent move)`);
                    if (onPuzzleCompleteCallback) {
                        onPuzzleCompleteCallback(currentPuzzle.id);
                    }
                    isPlayerTurnInPuzzle = false;
                }

                return true;

            } catch (e) {
                console.error(`Error executing opponent move ${opponentMoveUCI} for puzzle ${currentPuzzle.id}:`, e);
                isPlayerTurnInPuzzle = false;
                currentPuzzle = null;
                if (onPuzzleLoadErrorCallback) onPuzzleLoadErrorCallback("Internal error during opponent move.");
                return false;
            }
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