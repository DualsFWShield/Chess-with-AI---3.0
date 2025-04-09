// filepath: c:\Users\Toyger\OneDrive\Projects51c\Chess with AI - 3.0\analysis_board.js
// Ensure chess.js is available
if (typeof Chess === 'undefined') {
    throw new Error("chess.js is required for the ANALYSIS_BOARD module.");
}

// Assume a Stockfish interface exists (you'll need to implement this)
// import { STOCKFISH_INTERFACE } from './stockfish_interface.js'; // Example import

const ANALYSIS_BOARD = (() => {
    let analysisGame = null; // chess.js instance for the analysis board
    let moveHistory = []; // Array to store moves, evaluations, best moves, accuracy
    let currentFen = '';
    let isAnalyzing = false;

    // --- Callbacks ---
    let onAnalysisUpdateCallback = null; // To update UI with evaluation, best move, accuracy
    let onBoardUpdateCallback = null; // To update the visual board
    let onHistoryUpdateCallback = null; // To update the accuracy graph/move list

    // --- Private Helper Functions ---

    // Placeholder for accuracy calculation
    // Needs actual evaluations (player move vs best move) from Stockfish
    function _calculateAccuracy(playerMoveEvalCp, bestMoveEvalCp) {
        // This is a simplified example. Real accuracy often uses centipawn loss
        // and potentially a sigmoid function for scaling.
        if (playerMoveEvalCp === undefined || bestMoveEvalCp === undefined) return 100; // Default if analysis fails
        const maxLoss = 1500; // Max centipawn loss considered (tune this)
        const loss = Math.max(0, bestMoveEvalCp - playerMoveEvalCp); // Assuming higher CP is better
        const accuracy = Math.max(0, 100 * (1 - Math.sqrt(loss / maxLoss)));
        return Math.round(accuracy);
    }

    async function _analyzePosition(fen) {
        isAnalyzing = true;
        console.log(`[Analysis Board] Analyzing FEN: ${fen}`);
        if (onAnalysisUpdateCallback) onAnalysisUpdateCallback({ analyzing: true });

        try {
            // --- Interaction with Stockfish ---
            // This part is crucial and depends on your StockfishInterface implementation
            // const analysisResult = await STOCKFISH_INTERFACE.analyze(fen, { depth: 15 }); // Example
            // Mock result for demonstration:
            await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate analysis time
            const analysisResult = {
                bestMoveUci: 'e2e4', // Example best move
                evaluationCp: 50, // Example evaluation (centipawns)
                // You might get PV (principal variation) too
            };
            // --- End of Stockfish Interaction ---

            console.log(`[Analysis Board] Analysis complete: Eval ${analysisResult.evaluationCp}, Best ${analysisResult.bestMoveUci}`);
            isAnalyzing = false;
            if (onAnalysisUpdateCallback) onAnalysisUpdateCallback({
                analyzing: false,
                evaluationCp: analysisResult.evaluationCp,
                bestMoveUci: analysisResult.bestMoveUci
            });
            return analysisResult;

        } catch (error) {
            console.error("[Analysis Board] Stockfish analysis failed:", error);
            isAnalyzing = false;
            if (onAnalysisUpdateCallback) onAnalysisUpdateCallback({ analyzing: false, error: "Analysis failed" });
            return null;
        }
    }

    // --- Public API ---
    return {
        setupCallbacks: (callbacks) => {
            onAnalysisUpdateCallback = callbacks.onAnalysisUpdate || null;
            onBoardUpdateCallback = callbacks.onBoardUpdate || null;
            onHistoryUpdateCallback = callbacks.onHistoryUpdate || null;
        },

        startAnalysisBoard: () => {
            console.log("[Analysis Board] Starting new analysis session.");
            analysisGame = new Chess();
            currentFen = analysisGame.fen();
            moveHistory = [];
            isAnalyzing = false;
            if (onBoardUpdateCallback) onBoardUpdateCallback(currentFen);
            if (onHistoryUpdateCallback) onHistoryUpdateCallback(moveHistory);
            // Initial analysis of starting position
            _analyzePosition(currentFen);
        },

        makeMove: async (fromAlg, toAlg, promotionPiece) => {
            if (!analysisGame || isAnalyzing) {
                console.warn("[Analysis Board] Cannot make move: No game active or analysis in progress.");
                return false;
            }

            const moveData = {
                from: fromAlg,
                to: toAlg,
                promotion: promotionPiece ? promotionPiece.toLowerCase() : undefined
            };

            // 1. Try making the move locally
            const moveResult = analysisGame.move(moveData);
            if (moveResult === null) {
                console.log("[Analysis Board] Illegal move attempted.");
                return false; // Indicate illegal move
            }

            currentFen = analysisGame.fen();
            if (onBoardUpdateCallback) onBoardUpdateCallback(currentFen); // Update board UI immediately

            // 2. Analyze the *previous* position to evaluate the move just made
            const previousFen = analysisGame.undo().fen(); // Get FEN before the move
            analysisGame.move(moveResult); // Redo the move
            console.log(`[Analysis Board] Analyzing previous position (${previousFen}) to evaluate move ${moveResult.san}`);
            const prevPosAnalysis = await _analyzePosition(previousFen); // Analyze position *before* the move

            // 3. Analyze the *new* position
            const currentPosAnalysis = await _analyzePosition(currentFen); // Analyze position *after* the move

            // 4. Calculate Accuracy (requires evaluation of the player's move)
            // This is complex: Stockfish gives best move eval. To get the player's move eval,
            // you might need another Stockfish call or parse the 'info' output carefully.
            // For now, we'll use a placeholder/mock calculation.
            const playerMoveEvalCp = currentPosAnalysis?.evaluationCp; // Simplification: use eval *after* move
            const bestMoveEvalCp = prevPosAnalysis?.evaluationCp; // Simplification: use eval *before* move
            const accuracy = _calculateAccuracy(playerMoveEvalCp, bestMoveEvalCp);

            // 5. Store move details
            const historyEntry = {
                moveNumber: Math.ceil(analysisGame.history().length / 2),
                color: moveResult.color,
                san: moveResult.san,
                uci: moveResult.from + moveResult.to + (moveResult.promotion || ''),
                fenBefore: previousFen,
                fenAfter: currentFen,
                playerMoveEvalCp: playerMoveEvalCp, // Needs proper calculation
                bestMoveEvalCp: bestMoveEvalCp,     // Needs proper calculation
                bestMoveUci: prevPosAnalysis?.bestMoveUci, // Best move *from previous* position
                accuracy: accuracy,
                analysis: currentPosAnalysis // Store full analysis of the resulting position
            };
            moveHistory.push(historyEntry);
            console.log(`[Analysis Board] Move ${historyEntry.san} recorded. Accuracy: ${accuracy}%`);

            // 6. Update UI (graph, move list)
            if (onHistoryUpdateCallback) onHistoryUpdateCallback(moveHistory);

            return true; // Move successful
        },

        getCurrentFen: () => currentFen,
        getGameInstance: () => analysisGame, // For UI board rendering
        getHistory: () => [...moveHistory], // Return copy

        // Add functions for undo, navigating history, etc. as needed
        undoMove: () => {
             if (!analysisGame || analysisGame.history().length === 0) return false;
             analysisGame.undo();
             currentFen = analysisGame.fen();
             moveHistory.pop(); // Remove last history entry
             if (onBoardUpdateCallback) onBoardUpdateCallback(currentFen);
             if (onHistoryUpdateCallback) onHistoryUpdateCallback(moveHistory);
             // Re-analyze the new current position
             _analyzePosition(currentFen);
             return true;
        }
    };
})();

// Export if using modules
// export { ANALYSIS_BOARD };