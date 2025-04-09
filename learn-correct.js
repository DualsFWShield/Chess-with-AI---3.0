// REWRITTEN handleSquareClick_Learn with clarified logic
function handleSquareClick_Learn(event) {
    if (isGuidedMode || lessonState === 'guided') {
        handleGuidedMove(event); // Delegate to guided mode logic
        return;
    }

    const lesson = lessons[currentLessonIndex];
    // Ignore clicks if lesson isn't interactive, or already completed/error state
    if (!lesson || !lesson.interactive || lessonState === 'completed' || lessonState === 'error' || lessonState === 'ended') {
        return;
    }

    const square = event.currentTarget;
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const clickedAlg = files[col] + (8 - row);
    const pieceOnSquare = learnGame.get(clickedAlg);
    const currentTurn = learnGame.turn();

    clearFeedback(); // Clear previous feedback messages

    if (selectedSquareAlg) {
        // --- Piece Already Selected ---
        const fromAlg = selectedSquareAlg;

        // Case 1: Clicking the same square again = Deselect
        if (clickedAlg === fromAlg) {
            selectedSquareAlg = null;
            highlightMoves_Learn([]);
            createBoard_Learn(); // Redraw to remove 'selected' class
            return;
        }

        // Case 2: Attempting a move (from selectedSquareAlg to clickedAlg)
        try {
            // Find if the move is legal according to chess rules
            const legalMoves = learnGame.moves({ square: fromAlg, verbose: true });
            const targetMoveObject = legalMoves.find(move => move.to === clickedAlg);

            if (targetMoveObject) {
                // --- Move is Legal by Chess Rules ---
                let isCorrectForLesson = false;

                // Check if this legal move matches the lesson objective
                if (lesson.allowedMoves && lesson.allowedMoves.includes(targetMoveObject.san)) {
                    isCorrectForLesson = true; // Matches the specific allowed SAN
                } else if (!lesson.allowedMoves && lesson.highlightSquares?.target?.includes(clickedAlg)) {
                    // If no specific allowedMoves, check if it matches a target square highlight
                    // This provides flexibility: specify SAN or just target squares.
                    isCorrectForLesson = true;
                } else if (!lesson.allowedMoves && !lesson.highlightSquares?.target?.length) {
                    // If no allowedMoves AND no target squares defined, *any* legal move might be considered correct
                    // (This depends on how you define lessons - maybe some just require *any* valid move)
                    // For current lessons, we usually have allowedMoves or target. Let's assume this case means incorrect for now.
                    // console.log("Move is legal, but no specific objective match found.");
                } // else: Legal but doesn't match allowedMoves or target squares.

                // --- Execute the Move ONLY IF IT'S CORRECT for the lesson ---
                if (isCorrectForLesson) {
                    const moveResult = learnGame.move(targetMoveObject); // Use the validated move object
                    if (moveResult) {
                        lastMoveHighlight = { from: moveResult.from, to: moveResult.to };
                        selectedSquareAlg = null; // Deselect
                        createBoard_Learn(); // Redraw board *after* the move
                        completeLessonStep(); // Mark lesson step as complete
                    } else {
                        // This *shouldn't* happen if targetMoveObject was valid
                        console.error(`Failed to execute validated legal move: ${targetMoveObject.san}`);
                        showFeedback("Erreur interne lors du déplacement.", 'error');
                        selectedSquareAlg = null;
                        highlightMoves_Learn([]);
                        createBoard_Learn();
                    }
                } else {
                    // --- Move is Legal BUT NOT Correct for Lesson Objective ---
                    showFeedback("C'est un coup valide, mais pas celui attendu pour cet objectif. Essayez autre chose.", 'error');
                    // Do NOT make the move. Keep piece selected.
                    // Maybe flash the target square(s) briefly?
                     if (lesson.highlightSquares?.target) {
                         lesson.highlightSquares.target.forEach(targetAlg => {
                             const targetCoords = algToCoord(targetAlg);
                             const targetSquareEl = chessboardEl.querySelector(`.square[data-row="${targetCoords[0]}"][data-col="${targetCoords[1]}"]`);
                             if (targetSquareEl) {
                                 targetSquareEl.classList.add('flash-error');
                                 setTimeout(() => targetSquareEl.classList.remove('flash-error'), 500);
                             }
                         });
                     }
                }
            } else {
                // --- Clicked Square is NOT a Legal Destination ---
                // Check if clicking another piece of the same color to switch selection
                if (pieceOnSquare && pieceOnSquare.color === currentTurn) {
                     // Check if switching selection is allowed (e.g., not restricted to one piece)
                     if (lesson.showOnlyLegalMovesFor && lesson.showOnlyLegalMovesFor !== clickedAlg) {
                         showFeedback(`Pour cette leçon, concentrez-vous sur la pièce en ${lesson.showOnlyLegalMovesFor}.`, 'error');
                         // Keep original piece selected
                     } else {
                         // Switch selection
                         selectedSquareAlg = clickedAlg;
                         highlightMoves_Learn([]); // Clear old highlights
                         const newMoves = learnGame.moves({ square: clickedAlg, verbose: true });
                         createBoard_Learn(); // Redraw (updates 'selected' class)
                         highlightMoves_Learn(newMoves); // Show new highlights
                     }
                } else {
                    // Clicked empty square or opponent piece (invalid destination)
                    showFeedback("Ce n'est pas une destination valide pour cette pièce.", 'error');
                    // Keep the original piece selected
                }
            }
        } catch (e) {
            console.error("Error during move attempt in lesson:", e);
            showFeedback("Une erreur s'est produite.", 'error');
            selectedSquareAlg = null;
            highlightMoves_Learn([]);
            createBoard_Learn();
        }

    } else if (pieceOnSquare && pieceOnSquare.color === currentTurn) {
        // --- No Piece Selected, Clicking Own Piece ---
        // Check if interaction is restricted to a specific piece
        if (lesson.showOnlyLegalMovesFor && lesson.showOnlyLegalMovesFor !== clickedAlg) {
            showFeedback(`Pour cette leçon, vous devez jouer avec la pièce en ${lesson.showOnlyLegalMovesFor}.`, 'error');
            return; // Prevent selecting the wrong piece
        }

        // Select the piece
        selectedSquareAlg = clickedAlg;
        const moves = learnGame.moves({ square: clickedAlg, verbose: true });
        createBoard_Learn(); // Redraw to show selection
        highlightMoves_Learn(moves); // Show its legal moves

    }
    // Else: Clicked empty square or opponent piece without selection - do nothing
}

// Add a CSS class for flashing effect (optional, add to styles-v2.css)
/*
@keyframes flash {
  0%, 100% { background-color: inherit; }
  50% { background-color: rgba(255, 80, 80, 0.6); } // Red flash
}
.square.flash-error {
  animation: flash 0.5s ease-in-out;
}
*/

// --- END OF learn.js Corrections ---