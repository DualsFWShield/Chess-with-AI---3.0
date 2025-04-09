// --- User Interaction (Click Handler) ---
// REWRITTEN to fix algToCoord calls and logic flow
function handleSquareClick(event) {
    const square = event.currentTarget;
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const clickedAlg = coordToAlg(row, col);

    // --- Puzzle Mode Logic ---
    if (gameMode === 'puzzle') {
        const puzzleInfo = PUZZLE.getCurrentPuzzleData();
        // Ignore clicks if no puzzle, or not player's turn, or puzzle complete/error
        if (!puzzleInfo || !puzzleInfo.isPlayerTurn) {
            // console.log("Ignoring puzzle click: Not player's turn or inactive.");
            return;
        }

        const puzzleInstance = PUZZLE.getPuzzleInstance();
        if (!puzzleInstance) {
            console.error("Puzzle instance is missing in handleSquareClick");
            return; // Should not happen if puzzleInfo exists
        }

        if (selectedSquareAlg) {
            // --- Piece Already Selected (Puzzle Mode) ---
            const fromAlg = selectedSquareAlg;
            selectedSquareAlg = null; // Deselect logically first

            // Visually deselect and clear highlights
            const fromCoords = algToCoord(fromAlg);
            if (fromCoords) {
                const fromSquareEl = chessboard.querySelector(`.square[data-row="${fromCoords[0]}"][data-col="${fromCoords[1]}"]`);
                if (fromSquareEl) fromSquareEl.classList.remove('selected');
            }
            highlightMoves([]); // Clear visual move hints

            // Check for promotion
            const piece = puzzleInstance.get(fromAlg);
            const isPawn = piece && piece.type === 'p';
            // Promotion rank depends on player color for the puzzle!
            const promotionRank = (puzzleInfo.playerColor === 'w') ? 0 : 7;
            const isPromotionSquare = (row === promotionRank);

            if (isPawn && isPromotionSquare) {
                // Show promotion modal specific to puzzle
                showPromotionModal(puzzleInfo.playerColor === 'w' ? 'white' : 'black', (promoChoice) => {
                    if (promoChoice) {
                        // PUZZLE module handles internal logic and triggers callbacks
                        PUZZLE.makePlayerMove(fromAlg, clickedAlg, promoChoice);
                    } else {
                        updateGameStatus("Promotion annulée. Sélectionnez une pièce.");
                        // Player needs to re-select the pawn or another piece
                    }
                });
            } else {
                // Not a promotion, make the move directly in the puzzle module
                PUZZLE.makePlayerMove(fromAlg, clickedAlg, null);
                // Callbacks handle UI updates based on result ('correct_continue', 'complete', 'incorrect')
            }

        } else {
            // --- No Piece Selected (Puzzle Mode) ---
            const pieceOnSquare = puzzleInstance.get(clickedAlg);
            // Allow selection only if it's the player's piece
            if (pieceOnSquare && pieceOnSquare.color === puzzleInfo.playerColor) {
                playSound('click');
                selectedSquareAlg = clickedAlg;
                square.classList.add('selected');
                // Get and highlight VALID moves from the puzzle's perspective
                const moves = puzzleInstance.moves({ square: clickedAlg, verbose: true });
                highlightMoves(moves); // Show allowed moves
            } else {
                // Clicked empty or opponent piece without selection - do nothing
                // console.log("Puzzle click ignored: Not player's piece.");
            }
        }
        return; // End puzzle logic here
    }

    // --- Original Game Mode Logic (AI/Human) ---
    if (isGameOver || isStockfishThinking || isReviewing || promotionCallback) return;

    const currentTurn = game.turn(); // Use main game instance
    const isHumanTurn = (gameMode === 'human' || (gameMode === 'ai' && currentTurn === 'w'));

    if (!isHumanTurn) return;

    const pieceOnSquare = game.get(clickedAlg);

    if (selectedSquareAlg) {
        // --- Piece Already Selected --- (Main Game)
        const fromAlg = selectedSquareAlg;
        const fromCoords = algToCoord(fromAlg); // Get coords for querySelector

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
            if (fromCoords) { // Ensure coords are valid before querySelector
                const fromSquareEl = chessboard.querySelector(`.square[data-row="${fromCoords[0]}"][data-col="${fromCoords[1]}"]`);
                if (fromSquareEl) fromSquareEl.classList.remove('selected');
            }
            highlightMoves([]); // Clear highlights before making move

            if (targetMove.flags.includes('p')) {
                // --- Promotion Move --- (Main Game)
                selectedSquareAlg = null; // Deselect logically while modal is up
                showPromotionModal(currentTurn === 'w' ? 'white' : 'black', (promoChoice) => {
                    if (!promoChoice) {
                        console.log("Promotion cancelled.");
                        // Player needs to re-select
                        return;
                    }
                    const success = makeMove(fromAlg, clickedAlg, promoChoice);
                    // Trigger AI only if move was successful, game not over, and it's AI's turn
                    if (success && !isGameOver && gameMode === 'ai' && game.turn() === 'b') {
                        const delay = aiDelayEnabled ? AI_DELAY_TIME : 50;
                        setTimeout(requestAiMove, delay);
                    }
                });
            } else {
                // --- Normal Move (Not Promotion) --- (Main Game)
                selectedSquareAlg = null; // Deselect logically
                const success = makeMove(fromAlg, clickedAlg);
                 // Trigger AI only if move was successful, game not over, and it's AI's turn
                 if (success && !isGameOver && gameMode === 'ai' && game.turn() === 'b') {
                    const delay = aiDelayEnabled ? AI_DELAY_TIME : 50;
                    setTimeout(requestAiMove, delay);
                }
            }
        } else {
            // Case 3: Clicked an invalid destination or another own piece (Main Game)
             if (fromCoords) { // Ensure coords are valid before querySelector
                const oldSquareEl = chessboard.querySelector(`.square[data-row="${fromCoords[0]}"][data-col="${fromCoords[1]}"]`);
                if (oldSquareEl) oldSquareEl.classList.remove('selected');
             }

            if (pieceOnSquare && pieceOnSquare.color === currentTurn) {
                // Clicked another piece of the same color - switch selection
                selectedSquareAlg = clickedAlg;
                square.classList.add('selected');
                const newMoves = game.moves({ square: clickedAlg, verbose: true });
                highlightMoves(newMoves); // Highlight new moves
                playSound('click');
            } else {
                // Clicked invalid target (empty or opponent) - deselect
                playSound('illegal');
                selectedSquareAlg = null;
                highlightMoves([]); // Clear old highlights
            }
        }
    } else if (pieceOnSquare && pieceOnSquare.color === currentTurn) {
        // --- No Piece Selected, Clicked Own Piece --- Select it (Main Game)
        playSound('click');
        selectedSquareAlg = clickedAlg;
        square.classList.add('selected');
        const moves = game.moves({ square: clickedAlg, verbose: true });
        highlightMoves(moves); // Show legal moves
    }
    // Else: Clicked empty or opponent piece without selection - do nothing
}

// --- Undo Logic ---
// REWRITTEN to fix captured piece restoration and simplify UI update
function undoMove() {
    if (isGameOver || isStockfishThinking || isReviewing || gameMode === 'ai-vs-ai' || moveHistoryInternal.length === 0) {
        playSound('illegal');
        showToast("Annulation impossible pour le moment.", 'fa-times-circle', 2000);
        return;
    }

    let movesToUndo = 1;
    // In Player vs AI mode, if it's currently Player's turn (meaning AI just moved), undo both moves.
    if (gameMode === 'ai' && game.turn() === 'w' && moveHistoryInternal.length >= 2) {
        movesToUndo = 2;
    }

    console.log(`Attempting to undo ${movesToUndo} move(s).`);
    let undoSuccess = true;

    for (let i = 0; i < movesToUndo; i++) {
        if (moveHistoryInternal.length === 0) {
            undoSuccess = false; // Should not happen if logic is correct, but safe check
            break;
        }

        const undoneMoveChessjs = game.undo(); // Undo in chess.js

        if (!undoneMoveChessjs) {
            console.error("chess.js undo failed! History might be corrupted.");
            showToast("Erreur lors de l'annulation.", 'fa-times-circle', 4000);
            undoSuccess = false;
            break; // Stop undo process
        }

        // Remove from our internal history tracker
        moveHistoryInternal.pop();

        // Restore captured pieces list based on chess.js undo info
        if (undoneMoveChessjs.captured) {
            // Piece color determines who captured:
            // If white moved (undoneMoveChessjs.color === 'w'), they captured a black piece. Restore to capturedBlack.
            // If black moved (undoneMoveChessjs.color === 'b'), they captured a white piece. Restore to capturedWhite.
            const pieceToRestore = undoneMoveChessjs.captured; // e.g., 'p', 'N'
            let targetArray;
            let formattedPiece;

            if (undoneMoveChessjs.color === 'w') { // White made the move, captured black piece
                targetArray = capturedBlack; // Black pieces captured BY WHITE
                formattedPiece = pieceToRestore.toLowerCase(); // Store as 'p', 'n', etc.
            } else { // Black made the move, captured white piece
                targetArray = capturedWhite; // White pieces captured BY BLACK
                formattedPiece = pieceToRestore.toUpperCase(); // Store as 'P', 'N', etc.
            }

            const index = targetArray.lastIndexOf(formattedPiece); // Find the *last* instance
            if (index > -1) {
                targetArray.splice(index, 1);
                console.log(`Undo: Removed captured piece '${formattedPiece}' from list (restoring).`);
            } else {
                console.warn(`Undo: Could not find captured piece '${formattedPiece}' in corresponding capture list.`);
                // This might happen if capture lists are somehow desynced.
            }
        }
    }

    // --- Update UI After Undo ---
    if (undoSuccess) {
        const verboseHistory = game.history({ verbose: true });
        lastMoveHighlight = verboseHistory.length > 0
            ? { from: verboseHistory[verboseHistory.length - 1].from, to: verboseHistory[verboseHistory.length - 1].to }
            : null;

        createBoard(); // Redraw based on restored game state
        updateAllUI(); // Update captured, progress, timers, ratings, turn indicator
        const currentTurnColor = game.turn() === 'w' ? 'Blancs' : 'Noirs';
        updateGameStatus(`Coup(s) annulé(s). Au tour des ${currentTurnColor}.`);
        checkAndUpdateKingStatus(); // Update check highlight

        // Remove the last move(s) from the UI list (Simpler logic)
        if (moveListEl) {
            for (let i = 0; i < movesToUndo; i++) {
                if (moveListEl.lastElementChild) {
                    const lastLi = moveListEl.lastElementChild;
                    const whiteMoveSpan = lastLi.querySelector('.move-white');
                    const blackMoveSpan = lastLi.querySelector('.move-black');

                    // If undoing Black's move and the li has both, remove only Black's span
                    if (blackMoveSpan && ((movesToUndo === 1 && game.turn() === 'w') || (movesToUndo === 2 && i === 0)) ) {
                        if (blackMoveSpan.previousSibling && blackMoveSpan.previousSibling.nodeType === Node.TEXT_NODE) {
                             blackMoveSpan.previousSibling.remove(); // Remove space before span
                        }
                        blackMoveSpan.remove();
                    }
                    // Otherwise (undoing White's move OR undoing Black's move from a Black-only li), remove the whole li
                    else {
                        lastLi.remove();
                    }
                }
            }
            moveListEl.scrollTop = moveListEl.scrollHeight; // Scroll after removing
        }

        playSound('click');
        console.log("Undo complete. Current FEN:", game.fen());
    }
    // Else: error already shown

    updateControlsState(); // Update button states regardless of success/failure
}


// --- Rendering & UI Updates ---
// REWRITTEN to fix algToCoord calls and add flip POV logic stub
function createBoard(gameInstance = game, playerPovColor = 'w') { // Default to main game, white POV
    if (!chessboard) return;
    chessboard.innerHTML = '';
    const boardFragment = document.createDocumentFragment();
    let boardData;
    try {
        boardData = gameInstance.board(); // Get 2D array representation
        if (!boardData) throw new Error("Board data is null/undefined");
    } catch (e) {
        console.error("Error getting board data from game instance:", e);
        chessboard.innerHTML = `<div style="color:red; padding:20px;">Erreur plateau!</div>`;
        return;
    }

    // TODO: Implement actual flipping based on a state variable toggled by the button
    const isFlipped = false; // Hardcoded for now, link to flip-board-toggle state later

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            // Adjust index based on flip
            const rowIndex = isFlipped ? 7 - row : row;
            const colIndex = isFlipped ? 7 - col : col;

            const square = document.createElement('div');
            square.classList.add('square');
            // Color based on *visual* row/col, not logical after flip
            square.classList.add((row + col) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = rowIndex; // Store logical row/col
            square.dataset.col = colIndex;
            const alg = coordToAlg(rowIndex, colIndex);

            // Add Rank/File labels (adjust for flip) - Simplified logic
            const isBottomRank = isFlipped ? (row === 0) : (row === 7);
            const isLeftmostFile = isFlipped ? (col === 7) : (col === 0);

            if (isBottomRank || isLeftmostFile) {
                const label = document.createElement('span');
                label.className = 'square-label';
                let labelText = '';
                if (isBottomRank) labelText += files[colIndex];      // File letter on bottom rank
                if (isLeftmostFile) labelText += `${8 - rowIndex}`; // Rank number on left file
                // Ensure labels are not duplicated on corner square a1/h8 etc.
                if (isBottomRank && isLeftmostFile) {
                     labelText = files[colIndex] + `${8 - rowIndex}`;
                }
                label.textContent = labelText;
                square.appendChild(label);
            }


            // Add piece if present (using logical indices)
            const pieceInfo = boardData[rowIndex]?.[colIndex]; // Use optional chaining
            if (pieceInfo) {
                 const pieceElement = document.createElement('div'); // Container for img or text
                 pieceElement.className = 'piece';

                if (pieceRenderMode === 'ascii') {
                    const pieceSymbol = pieces[pieceInfo.color === 'w' ? pieceInfo.type.toUpperCase() : pieceInfo.type.toLowerCase()];
                    pieceElement.textContent = pieceSymbol || '?';
                    pieceElement.classList.add(pieceInfo.color === 'w' ? 'white-piece' : 'black-piece');
                } else { // PNG mode
                    const img = document.createElement('img');
                    const colorPrefix = pieceInfo.color === 'w' ? 'w' : 'b';
                    const pieceCode = pieceInfo.type.toLowerCase(); // n, p, k, etc.
                    const filename = `pieces/${colorPrefix}${pieceCode}.png`;
                    img.src = filename;
                    img.alt = pieceInfo.color === 'w' ? pieceInfo.type.toUpperCase() : pieceInfo.type.toLowerCase();
                    img.classList.add("piece-img"); // Add specific class for images if needed
                    img.draggable = false;
                    img.onerror = () => { // Fallback for missing images
                        console.warn(`Image not found: ${filename}, using ASCII fallback.`);
                        img.remove(); // Remove broken image element
                        const pieceSymbol = pieces[img.alt]; // Get symbol from alt
                         pieceElement.textContent = pieceSymbol || '?';
                         pieceElement.classList.add(pieceInfo.color === 'w' ? 'white-piece' : 'black-piece');
                    };
                    pieceElement.appendChild(img); // Add image to the container
                }
                 square.appendChild(pieceElement); // Add piece container to square
            }

            // Add click listener (handleSquareClick decides if interaction is allowed)
            square.addEventListener('click', handleSquareClick);

            // Determine cursor based on active mode and turn
            let isInteractable = false;
            if (gameMode === 'puzzle') {
                const puzzleInfo = PUZZLE.getCurrentPuzzleData();
                isInteractable = puzzleInfo && puzzleInfo.isPlayerTurn;
            } else { // AI or Human mode
                const currentTurn = gameInstance.turn(); // Use the instance passed in
                isInteractable = !isGameOver && !isStockfishThinking && !isReviewing && !promotionCallback &&
                                 (gameMode === 'human' || (gameMode === 'ai' && currentTurn === 'w'));
            }
            square.style.cursor = isInteractable ? 'pointer' : 'default';

            // Re-apply visual state highlights (use logical alg)
            if (lastMoveHighlight && (alg === lastMoveHighlight.from || alg === lastMoveHighlight.to)) {
                square.classList.add('last-move');
            }
            if (selectedSquareAlg === alg) {
                square.classList.add('selected');
            }
            // Check highlight is applied later by checkAndUpdateKingStatus

            boardFragment.appendChild(square);
        }
    }
    chessboard.appendChild(boardFragment);

    // Re-apply possible move highlights if selected (use logical alg)
    if (selectedSquareAlg && !isGameOver) {
        const moves = gameInstance.moves({ square: selectedSquareAlg, verbose: true });
        highlightMoves(moves); // HighlightMoves uses algToCoord, works with logical coords
    }

    checkAndUpdateKingStatus(gameInstance); // Check status on the current board
}


// REWRITTEN to ensure consistent use of toLowerCase() for piece values
function updateCapturedPieces() {
    if (!capturedWhiteEl || !capturedBlackEl) return;

    // capturedWhite has uppercase ('P', 'N') - white pieces captured BY BLACK
    // capturedBlack has lowercase ('p', 'n') - black pieces captured BY WHITE

    const renderCaptured = (piecesArray) => {
        return piecesArray
            .sort((a, b) => {
                // Always compare lowercase for value lookup
                const valA = pieceValues[a.toLowerCase()] || 0;
                const valB = pieceValues[b.toLowerCase()] || 0;
                if (valB !== valA) return valB - valA; // Sort descending by value
                // Tie-break alphabetically (e.g., 'N' before 'R' if both captured)
                // Use localeCompare on the original case string for consistent sorting
                return a.localeCompare(b);
            })
            .map(p => { // p is 'P', 'N', 'p', 'n' etc.
                if (pieceRenderMode === 'ascii') {
                    return pieces[p] || '?'; // Get ASCII representation
                } else {
                    // Generate img tag for PNG
                    const colorPrefix = (p === p.toUpperCase()) ? 'w' : 'b';
                    const pieceCode = p.toLowerCase(); // 'p', 'n', 'b', 'r', 'q', 'k'
                    const filename = `pieces/${colorPrefix}${pieceCode}.png`;
                    // Use inline style for simplicity, or dedicated CSS class
                    return `<img src="${filename}" alt="${p}" style="width: 1em; height: 1em; vertical-align: middle; object-fit: contain;" onerror="this.style.display='none'; const span=document.createElement('span'); span.textContent='${pieces[p] || '?'}'; this.parentNode.insertBefore(span, this);">`; // Add basic error handling
                }
            })
            .join(' '); // Join with space for slight separation
    };

    // Show black pieces captured BY White player
    capturedWhiteEl.innerHTML = renderCaptured(capturedBlack);
    // Show white pieces captured BY Black player
    capturedBlackEl.innerHTML = renderCaptured(capturedWhite);
}

// REWRITTEN to correctly map difficulty to rating for PGN header
function initiateGameReview() {
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
        // Don't proceed if engine isn't ready
        return;
    }

    console.log("--- Initiating Game Review ---");
    showGameEndModal(false); // Hide end modal if shown

    // Use the SAME map as updateRatingDisplay for consistency
    const difficultyRatings = {
        'Learn': 600, 'Noob': 800, 'Easy': 1000, 'Regular': 1200, 'Hard': 1400,
        'Very Hard': 1600, 'Super Hard': 1800, 'Magnus Carlsen': 2850, 'Unbeatable': 3000,
        'Adaptative': aiRating, // Use current adaptive rating if that was the mode
        'AI100': 100, 'AI200': 200
    };

    const pgnHeaders = {
        Event: "Partie locale analysée",
        Site: "DFWS Chess App",
        Date: new Date().toISOString().split('T')[0],
        Round: gamesPlayed.toString(), // Or some other round info
        White: player1NameEl?.textContent || "Joueur Blanc",
        Black: player2NameEl?.textContent || "Joueur Noir",
        Result: gameResultToPGN(game)
    };

    // Add Elo headers only if playing against AI
    if (gameMode === 'ai') {
        pgnHeaders.WhiteElo = playerRating.toString();
        // Get AI Elo based on selected difficulty
        const opponentElo = difficultyRatings[aiDifficulty] || aiRating; // Fallback to aiRating (esp. for adaptive)
        pgnHeaders.BlackElo = opponentElo.toString();
    }

    // Add TimeControl if applicable
    if (selectedTimeMode !== 'unlimited' && TIME_SETTINGS[selectedTimeMode]) {
        pgnHeaders.TimeControl = `${TIME_SETTINGS[selectedTimeMode]}+0`; // Assuming no increment
    }

    try {
        // Generate PGN with headers
        const pgn = game.pgn({ headers: pgnHeaders });
        // Store PGN in localStorage for review.html to pick up
        localStorage.setItem('reviewGamePGN', pgn);
        console.log("PGN stored for review. Navigating...");
        // Navigate to the review page
        window.location.href = 'review.html';
    } catch (error) {
        console.error("Failed to generate PGN for review:", error);
        showToast("Erreur lors de la préparation de l'analyse.", 'fa-times-circle');
        // Reset state if needed
        // isReviewing = false; // Should already be false
        // updateControlsState();
    }
}

// REWRITTEN to display correct AI names in AI vs AI mode
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
             p1Elo = `(${puzzleInfo.rating || '????'})`;
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

// --- END OF scripts-v3.js Corrections ---
// REWRITTEN makePlayerMove with safer comparison and error handling
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
}

// REWRITTEN makeOpponentMove with safer checks and error handling
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
}