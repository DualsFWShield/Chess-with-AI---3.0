// --- review.js (Advanced Analysis Version) ---

import { Chess } from './chess.js';

// --- Constants and Globals ---
const chessboardEl = document.getElementById('chessboard');
const moveListEl = document.getElementById('review-move-list');
const statusEl = document.getElementById('review-status');
const scoreEl = document.getElementById('review-score');
const bestMoveEl = document.getElementById('review-best-move')?.querySelector('span');
const playedMoveInfoEl = document.getElementById('played-move-info');
const whiteProgressEl = document.getElementById('review-white-progress');
const blackProgressEl = document.getElementById('review-black-progress');
const btnFirst = document.getElementById('btn-first');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnLast = document.getElementById('btn-last');
const analysisProgressText = document.getElementById('analysis-progress-text');
const overlaySvg = document.getElementById('board-overlay');
const pgnHeadersDisplayEl = document.getElementById('pgn-headers-display');
const goodStrategyEl = document.getElementById('review-good-strategy')?.querySelector('span');
const accuracyWhiteEl = document.getElementById('accuracy-white');
const accuracyBlackEl = document.getElementById('accuracy-black');
const accuracyChartCanvas = document.getElementById('accuracy-chart');
const pgnInputArea = document.getElementById('pgn-input-area');
const loadPgnButton = document.getElementById('load-pgn-button');

// Filters
const filterPlayedEl = document.getElementById('filter-played');
const filterBestEl = document.getElementById('filter-best');
const filterPvEl = document.getElementById('filter-pv');
const filterThreatsEl = document.getElementById('filter-threats');
const filterMatEl = document.getElementById('filter-mat'); // Added

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const pieceRenderMode = localStorage.getItem('chess-render-mode') || 'png';
const pieces = {
    'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
    'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙'
};

let reviewGame = new Chess(); // Instance for displaying the current position
let fullGameHistory = []; // [{ san: 'e4', from: 'e2', ..., fen_before: '...', fen_after: '...' }, ...]
let moveAnalysisData = []; // Parallel array for analysis results { fen_before, fen_after, played_move, eval_before, best_move_before, pv, eval_after_played, classification, analysis_depth, pass1_complete, pass2_complete, cpl }
let currentMoveIndex = -1; // -1 = initial position

let stockfish;
let isStockfishReady = false;
let stockfishQueue = [];
let currentAnalysisJob = null;
let isProcessingQueue = false;
let analysisComplete = false; // Flag to track if all analysis passes are done

// Accuracy Chart
let accuracyChart = null;
let accuracyData = { white: [], black: [], labels: [] }; // Store calculated accuracy data

// Configurable Analysis Depths & Thresholds
const DEPTH_PASS_1 = 12;
const DEPTH_PASS_2 = 16; // Increase for deeper analysis (slower)
const THRESHOLD_BLUNDER = 200; // Centipawns
const THRESHOLD_MISTAKE = 90;
const THRESHOLD_INACCURACY = 40;

// Overlay State
let boardRect = null;
let squareSize = 0;

// Arrow Style Defaults
const ARROW_COLORS = {
    played: 'rgba(60, 100, 180, 0.75)', // Blueish
    best: 'rgba(40, 160, 40, 0.85)',     // Green
    pv: ['rgba(255, 165, 0, 0.7)', 'rgba(255, 140, 0, 0.6)', 'rgba(255, 115, 0, 0.5)'], // Oranges
    threat: 'rgba(200, 40, 40, 0.6)',      // Red for capture indication
    mate: ['rgba(180, 0, 180, 0.8)', 'rgba(160, 0, 160, 0.7)', 'rgba(140, 0, 140, 0.6)', 'rgba(120, 0, 120, 0.5)'] // Purples for mate sequence
};
const ARROW_THICKNESS = {
    played: 5,
    best: 7, // Thicker best move arrow
    pv: [5, 4, 3], // Decreasing thickness for PV
    threat: 5, // Thickness for capture arrows
    mate: [8, 7, 6, 5] // Decreasing thickness for mate sequence
};

// Interactive Play Globals
let selectedSquareAlg_Review = null; // For interactive move selection
let promotionCallback_Review = null; // Callback for interactive promotion

// --- Helper Functions (Defined Early) ---

function algToPixel(alg) {
    // Ensure boardRect and squareSize are valid before calculation
    if (!boardRect || squareSize <= 0 || !alg || alg.length < 2) {
        // console.warn(`algToPixel: Invalid input or board state. alg=${alg}, squareSize=${squareSize}`);
        return null;
    }
    const col = files.indexOf(alg[0]);
    const row = 8 - parseInt(alg[1]);
    if (col === -1 || isNaN(row) || row < 0 || row > 7) {
        // console.warn(`algToPixel: Invalid alg conversion. alg=${alg}`);
        return null;
    }
    // Center of the square
    const x = col * squareSize + squareSize / 2;
    const y = row * squareSize + squareSize / 2;
    return { x, y };
}

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

function clearOverlays() {
    if (overlaySvg) {
        // Keep <defs> but remove lines, circles etc.
        const children = Array.from(overlaySvg.children);
        children.forEach(child => {
            if (child.tagName.toLowerCase() !== 'defs') {
                overlaySvg.removeChild(child);
            }
        });
    }
}

function highlightSquare(alg, color = 'rgba(255, 0, 0, 0.3)', radius = squareSize * 0.2) {
    if (!overlaySvg || !boardRect || squareSize <= 0) return;
    const center = algToPixel(alg);
    if (!center) return;

    const svgNs = "http://www.w3.org/2000/svg";
    const circle = document.createElementNS(svgNs, 'circle');
    circle.setAttribute('cx', center.x);
    circle.setAttribute('cy', center.y);
    circle.setAttribute('r', radius);
    circle.setAttribute('fill', color);
    overlaySvg.appendChild(circle);
}

function drawArrow(fromAlg, toAlg, color = 'rgba(0, 0, 0, 0.5)', id = null, thickness = 6) {
    // Add validation for board state and coordinates
    if (!overlaySvg || !boardRect || squareSize <= 0) return;
    const start = algToPixel(fromAlg);
    const end = algToPixel(toAlg);
    if (!start || !end) {
        console.warn(`Cannot draw arrow, invalid coords: ${fromAlg} -> ${toAlg}`);
        return;
    }

    const svgNs = "http://www.w3.org/2000/svg";
    const arrowId = `arrow-marker-${id || color.replace(/[^a-zA-Z0-9]/g, '')}`; // Unique ID for marker

    // Define marker (arrowhead) if not already defined
    let marker = overlaySvg.querySelector(`marker#${arrowId}`);
    if (!marker) {
        marker = document.createElementNS(svgNs, 'marker');
        marker.setAttribute('id', arrowId);
        marker.setAttribute('viewBox', '0 0 10 10');
        // Adjust refX to position arrowhead closer to the line end
        marker.setAttribute('refX', '9'); // Changed from 8
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerUnits', 'strokeWidth');
        marker.setAttribute('markerWidth', thickness * 0.8); // Make arrowhead proportional to thickness
        marker.setAttribute('markerHeight', thickness * 0.8);
        marker.setAttribute('orient', 'auto-start-reverse'); // Keep this orientation

        const path = document.createElementNS(svgNs, 'path');
        path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z'); // Triangle shape
        path.setAttribute('fill', color);
        marker.appendChild(path);

        // Add marker definition to SVG <defs> (create if needed)
        let defs = overlaySvg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS(svgNs, 'defs');
            overlaySvg.insertBefore(defs, overlaySvg.firstChild);
        }
        defs.appendChild(marker);
    }


    // Arrow Line
    const line = document.createElementNS(svgNs, 'line');
    line.setAttribute('x1', start.x);
    line.setAttribute('y1', start.y);
    line.setAttribute('x2', end.x);
    // Adjust end point slightly to account for arrowhead marker if needed (optional)
    // Example: Calculate vector and shorten line slightly - complex, try adjusting refX first.
    line.setAttribute('y2', end.y); // Keep original end point for now
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', thickness);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', `url(#${arrowId})`); // Apply marker

    overlaySvg.appendChild(line);
}

function drawArrowWithNumber(fromAlg, toAlg, color = 'rgba(0, 0, 0, 0.5)', id = null, thickness = 6, labelNumber = 1) {
    // Add validation for board state and coordinates
    if (!overlaySvg || !boardRect || squareSize <= 0) return;
    const start = algToPixel(fromAlg);
    const end = algToPixel(toAlg);
    if (!start || !end) {
        console.warn(`Cannot draw numbered arrow, invalid coords: ${fromAlg} -> ${toAlg}`);
        return;
    }
    const svgNs = "http://www.w3.org/2000/svg";
    const arrowId = `arrow-marker-${id || color.replace(/[^a-zA-Z0-9]/g, '')}`;

    // Create marker if needed
    let marker = overlaySvg.querySelector(`marker#${arrowId}`);
    if (!marker) {
        marker = document.createElementNS(svgNs, 'marker');
        marker.setAttribute('id', arrowId);
        marker.setAttribute('viewBox', '0 0 10 10');
        // Adjust refX to position arrowhead closer to the line end
        marker.setAttribute('refX', '9'); // Changed from 8
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerUnits', 'strokeWidth');
        marker.setAttribute('markerWidth', thickness * 0.8);
        marker.setAttribute('markerHeight', thickness * 0.8);
        marker.setAttribute('orient', 'auto-start-reverse'); // Keep this orientation
        const path = document.createElementNS(svgNs, 'path');
        path.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        path.setAttribute('fill', color);
        marker.appendChild(path);
        let defs = overlaySvg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS(svgNs, 'defs');
            overlaySvg.insertBefore(defs, overlaySvg.firstChild);
        }
        defs.appendChild(marker);
    }
    // Draw the arrow line
    const line = document.createElementNS(svgNs, 'line');
    line.setAttribute('x1', start.x);
    line.setAttribute('y1', start.y);
    line.setAttribute('x2', end.x);
    line.setAttribute('y2', end.y); // Keep original end point for now
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', thickness);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', `url(#${arrowId})`);
    overlaySvg.appendChild(line);
    // Compute midpoint for the number label
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    // Offset the number slightly perpendicular to the arrow direction (optional, complex)
    const text = document.createElementNS(svgNs, 'text');
    text.setAttribute('x', midX);
    text.setAttribute('y', midY);
    text.setAttribute('fill', 'white'); // Use white for better contrast on colored arrows
    text.setAttribute('stroke', 'black'); // Add a black outline
    text.setAttribute('stroke-width', '0.5');
    text.setAttribute('font-size', thickness * 1.5);
    text.setAttribute('font-weight', 'bold');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = labelNumber;
    overlaySvg.appendChild(text);
}

function getSquaresAttackedBy(fen, attackingColor) {
    const attacked = new Set();
    const board = new Chess(fen);
    const squares = files.flatMap(f => Array.from({ length: 8 }, (_, i) => f + (i + 1))); // a1, a2, ..., h8

    for (const sq of squares) {
        const piece = board.get(sq);
        if (piece && piece.color === attackingColor) {
            if (board.turn() === attackingColor) {
                const legalMoves = board.moves({ square: sq, verbose: true });
                legalMoves.forEach(move => attacked.add(move.to));
            }
            if (piece.type === 'p') {
                const colIndex = files.indexOf(sq[0]);
                const rowIndex = 8 - parseInt(sq[1]);
                const attackOffsets = (attackingColor === 'w') ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
                attackOffsets.forEach(offset => {
                    const targetRow = rowIndex + offset[0];
                    const targetCol = colIndex + offset[1];
                    if (targetRow >= 0 && targetRow < 8 && targetCol >= 0 && targetCol < 8) {
                        const targetAlg = files[targetCol] + (8 - targetRow);
                        attacked.add(targetAlg);
                    }
                });
            }
        }
    }
    return attacked;
}

function clearAnalysisUI() {
    scoreEl.textContent = "N/A";
    if (bestMoveEl) bestMoveEl.textContent = "N/A";
    if (playedMoveInfoEl) playedMoveInfoEl.textContent = "";
    if (whiteProgressEl) whiteProgressEl.style.width = `50%`;
    if (blackProgressEl) blackProgressEl.style.width = `50%`;
}

function updateNavButtons() {
    if (!btnFirst) return; // Ensure buttons exist
    const numMoves = fullGameHistory.length;
    btnFirst.disabled = currentMoveIndex <= -1;
    btnPrev.disabled = currentMoveIndex <= -1;
    btnNext.disabled = currentMoveIndex >= numMoves - 1;
    btnLast.disabled = currentMoveIndex >= numMoves - 1;
}

function updateStatus() {
    let statusText = "";
    if (currentMoveIndex === -1) {
        statusText = "Position initiale";
    } else if (currentMoveIndex < fullGameHistory.length) {
        const move = fullGameHistory[currentMoveIndex];
        if (move && move.color && move.san) {
            const moveNumber = Math.floor(currentMoveIndex / 2) + 1;
            const turnIndicator = move.color === 'w' ? "." : "...";
            statusText = `Après ${moveNumber}${turnIndicator} ${move.san}`;
        } else {
            statusText = `Coup ${currentMoveIndex + 1} (Données invalides)`;
            console.warn("Invalid move data at index", currentMoveIndex);
        }
    } else {
        statusText = "Fin de partie";
    }
    statusEl.textContent = statusText;
}

function getOverallAnalysisProgress() {
    const totalMoves = fullGameHistory.length;
    if (totalMoves === 0) return "";

    const analysisEntries = moveAnalysisData.slice(1);
    if (analysisEntries.length !== totalMoves) {
        console.warn("Analysis data length mismatch!");
    }

    const pass1DoneCount = analysisEntries.filter(d => d && d.pass1_complete).length;
    const pass2DoneCount = analysisEntries.filter(d => d && d.pass2_complete).length;

    if (pass2DoneCount === totalMoves) return "Analyse Profonde Terminée";
    if (pass1DoneCount === totalMoves) return `Analyse Rapide Terminée, Profonde: ${pass2DoneCount}/${totalMoves}`;
    if (isProcessingQueue && currentAnalysisJob) {
        const currentJobDisplayIndex = currentAnalysisJob.moveIndex + 1;
        const passNum = currentAnalysisJob.isPass1 ? 1 : 2;
        return `Analyse (P${passNum}): ${currentJobDisplayIndex}/${totalMoves}...`;
    }
    return `Analyse Rapide: ${pass1DoneCount}/${totalMoves}`;
}

// --- Board Overlay & Filters ---

function setupBoardOverlay() {
    if (!chessboardEl || !overlaySvg) return;

    // Use getBoundingClientRect for more accurate dimensions and position relative to viewport
    const rect = chessboardEl.getBoundingClientRect();
    const parentRect = chessboardEl.offsetParent ? chessboardEl.offsetParent.getBoundingClientRect() : { top: 0, left: 0 };

    // Calculate position relative to the offset parent, which is usually what absolute positioning uses
    boardRect = {
        left: rect.left - parentRect.left,
        top: rect.top - parentRect.top,
        width: rect.width,
        height: rect.height
    };

    // Check for valid dimensions immediately after calculation
    if (boardRect.width <= 0 || boardRect.height <= 0) {
        console.warn("Board rect has zero or negative size, retrying overlay setup.", boardRect);
        // Retry after a short delay to allow layout reflow
        setTimeout(setupBoardOverlay, 250);
        return;
    }

    squareSize = boardRect.width / 8;

    // Ensure squareSize is valid
    if (squareSize <= 0) {
         console.warn("Calculated square size is invalid, retrying overlay setup.", squareSize);
         setTimeout(setupBoardOverlay, 250);
         return;
    }

    overlaySvg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
    // Set SVG size explicitly
    overlaySvg.style.width = `${boardRect.width}px`;
    overlaySvg.style.height = `${boardRect.height}px`;
    // Position SVG absolutely relative to its container (should be the chessboard div or similar)
    overlaySvg.style.position = 'absolute'; // Ensure position is absolute
    overlaySvg.style.left = `0px`; // Position relative to container
    overlaySvg.style.top = `0px`;  // Position relative to container
    overlaySvg.style.pointerEvents = 'none'; // Make sure it doesn't interfere with clicks

    console.log(`Overlay setup: Size=${boardRect.width}x${boardRect.height}, SquareSize=${squareSize}, Pos=${boardRect.top},${boardRect.left}`);
    // Update overlays immediately after setup
    updateBoardOverlays();
}

function updateBoardOverlays() {
    if (!overlaySvg) return;
    clearOverlays();

    // Ensure board dimensions are valid before drawing
    if (!boardRect || squareSize <= 0) {
        console.warn("updateBoardOverlays: Invalid board dimensions, skipping draw.");
        return;
    }

    const analysisIndex = currentMoveIndex + 1;
    // Ensure analysisIndex is within bounds
    if (analysisIndex < 0 || analysisIndex >= moveAnalysisData.length) {
        // console.log("updateBoardOverlays: No analysis data for current index.");
        return;
    }
    const currentAnalysis = moveAnalysisData[analysisIndex];
    const previousAnalysis = (currentMoveIndex >= 0 && currentMoveIndex < moveAnalysisData.length) ? moveAnalysisData[currentMoveIndex] : null;
    const playedMove = (currentMoveIndex >= 0 && currentMoveIndex < fullGameHistory.length) ? fullGameHistory[currentMoveIndex] : null;

    // Filter: Played Move
    if (filterPlayedEl?.checked && playedMove) {
        // Validate move coordinates before drawing
        if (algToPixel(playedMove.from) && algToPixel(playedMove.to)) {
            drawArrow(playedMove.from, playedMove.to, ARROW_COLORS.played, 'played', ARROW_THICKNESS.played);
        } else {
            console.warn(`Skipping played move arrow: Invalid coords ${playedMove.from}->${playedMove.to}`);
        }
    }

    // Filter: Best Move (from previous position's analysis)
    if (filterBestEl?.checked && previousAnalysis?.best_move_before) {
        const bestUci = previousAnalysis.best_move_before;
        if (bestUci && bestUci !== '(none)' && bestUci !== '0000') {
            const from = bestUci.substring(0, 2);
            const to = bestUci.substring(2, 4);
            const playedUci = playedMove ? playedMove.from + playedMove.to + (playedMove.promotion || '') : null;
            // Only draw if best move is different from played move and coords are valid
            if (bestUci !== playedUci && algToPixel(from) && algToPixel(to)) {
                drawArrow(from, to, ARROW_COLORS.best, 'best', ARROW_THICKNESS.best);
            } else if (!algToPixel(from) || !algToPixel(to)) {
                 console.warn(`Skipping best move arrow: Invalid coords ${from}->${to}`);
            }
        }
    }

    // Filter: Principal Variation (from current position's analysis)
    if (filterPvEl?.checked && currentAnalysis?.pv && currentAnalysis.pv.length > 0) {
        // Use a temporary board based on the *current* reviewGame state
        const tempGamePV = new Chess(reviewGame.fen());
        for (let i = 0; i < Math.min(currentAnalysis.pv.length, ARROW_COLORS.pv.length); i++) {
            const uciMove = currentAnalysis.pv[i];
            const from = uciMove.substring(0, 2);
            const to = uciMove.substring(2, 4);
            // Validate coordinates before attempting move/draw
            if (!algToPixel(from) || !algToPixel(to)) {
                 console.warn(`Skipping PV arrow ${i}: Invalid coords ${from}->${to}`);
                 break; // Stop drawing PV if coords are bad
            }
            // Attempt the move on the temporary board
            const moveResult = tempGamePV.move(uciMove, { sloppy: true });
            if (moveResult) {
                // Draw arrow only if the move was legal on the temp board
                drawArrow(from, to, ARROW_COLORS.pv[i], `pv-${i}`, ARROW_THICKNESS.pv[i]);
            } else {
                // Stop drawing PV sequence if an illegal move is encountered
                console.warn(`PV drawing stopped: Invalid move ${uciMove} at step ${i} from FEN ${reviewGame.fen()}`);
                break;
            }
        }
    }

    // Filter: Threats (Legal Captures from current position)
    if (filterThreatsEl?.checked) {
        const board = reviewGame.board();
        let threatCounter = 0; // Counter for unique arrow IDs if needed
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r]?.[c];
                if (piece && piece.color === reviewGame.turn()) { // Only show threats for the current player
                    const fromAlg = files[c] + (8 - r);
                    // Get only legal moves for the piece
                    const moves = reviewGame.moves({ square: fromAlg, verbose: true });
                    const captureMoves = moves.filter(m => m.captured);

                    if (captureMoves.length > 0) {
                        // Highlight the attacking piece's square
                        highlightSquare(fromAlg, ARROW_COLORS.threat, squareSize * 0.25);
                        // Draw arrows for each legal capture
                        captureMoves.slice(0, 4).forEach((move, index) => {
                            // Validate coordinates before drawing
                            if (algToPixel(fromAlg) && algToPixel(move.to)) {
                                drawArrowWithNumber(fromAlg, move.to, ARROW_COLORS.threat, `capture-${fromAlg}-${move.to}-${threatCounter++}`, ARROW_THICKNESS.threat, index + 1);
                            } else {
                                 console.warn(`Skipping threat arrow: Invalid coords ${fromAlg}->${move.to}`);
                            }
                        });
                    }
                }
            }
        }
    }

    // Filter: Mate Sequence (from current position's analysis)
    if (filterMatEl?.checked && currentAnalysis?.eval_before && typeof currentAnalysis.eval_before === 'string' && currentAnalysis.eval_before.startsWith('M')) {
        const mateIn = parseInt(currentAnalysis.eval_before.substring(1));
        // Check if the mate is for the player whose turn it is
        const isMateForCurrentPlayer = (reviewGame.turn() === 'w' && mateIn > 0) || (reviewGame.turn() === 'b' && mateIn < 0);

        // Only draw if it's a mate for the current player, within reasonable length, and PV exists
        if (isMateForCurrentPlayer && Math.abs(mateIn) <= ARROW_COLORS.mate.length && currentAnalysis.pv && currentAnalysis.pv.length >= Math.abs(mateIn)) {
            // Use a temporary board based on the *current* reviewGame state
            const tempGameMate = new Chess(reviewGame.fen());
            for (let i = 0; i < Math.abs(mateIn); i++) {
                const uciMove = currentAnalysis.pv[i];
                const from = uciMove.substring(0, 2);
                const to = uciMove.substring(2, 4);
                 // Validate coordinates before attempting move/draw
                if (!algToPixel(from) || !algToPixel(to)) {
                    console.warn(`Skipping Mate arrow ${i}: Invalid coords ${from}->${to}`);
                    break; // Stop drawing sequence if coords are bad
                }
                // Attempt the move on the temporary board
                const moveResult = tempGameMate.move(uciMove, { sloppy: true });
                if (moveResult) {
                    // Draw arrow only if the move was legal on the temp board
                    const colorIndex = Math.min(i, ARROW_COLORS.mate.length - 1);
                    const thicknessIndex = Math.min(i, ARROW_THICKNESS.mate.length - 1);
                    drawArrowWithNumber(from, to, ARROW_COLORS.mate[colorIndex], `mate-${i}`, ARROW_THICKNESS.mate[thicknessIndex], i + 1);
                } else {
                    // Stop drawing sequence if an illegal move is encountered
                    console.warn(`Mate sequence drawing stopped: Invalid move ${uciMove} at step ${i} from FEN ${reviewGame.fen()}`);
                    break;
                }
            }
        }
    }
}

// --- Board Rendering (Review Specific) ---
function createBoard_Review() {
    if (!chessboardEl) {
        console.error("createBoard_Review: chessboardEl not found!");
        return;
    }
    if (!reviewGame || typeof reviewGame.board !== 'function') {
        console.error("createBoard_Review: reviewGame object is invalid.");
        chessboardEl.innerHTML = '<p style="color: red; padding: 20px;">Erreur: État du jeu invalide</p>';
        return;
    }
    console.log("createBoard_Review: Rendering board...");
    chessboardEl.innerHTML = '';
    const boardFragment = document.createDocumentFragment();
    let boardData;
    try {
        boardData = reviewGame.board();
        if (!boardData) throw new Error("reviewGame.board() returned invalid data");
    } catch (e) {
        console.error("createBoard_Review: Error getting board data:", e);
        chessboardEl.innerHTML = '<p style="color: red; padding: 20px;">Erreur: Données du plateau invalides</p>';
        return;
    }

    for (let rowIndex = 0; rowIndex < 8; rowIndex++) {
        for (let colIndex = 0; colIndex < 8; colIndex++) {
            const square = document.createElement('div');
            square.classList.add('square');
            square.classList.add((rowIndex + colIndex) % 2 === 0 ? 'light' : 'dark');
            square.dataset.row = rowIndex;
            square.dataset.col = colIndex;
            const alg = files[colIndex] + (8 - rowIndex);

            const pieceInfo = boardData[rowIndex]?.[colIndex];
            if (pieceInfo) {
                const myPieceFormat = pieceInfo.color === 'w' ? pieceInfo.type.toUpperCase() : pieceInfo.type.toLowerCase();
                if (pieceRenderMode === 'ascii') {
                    const pieceElement = document.createElement('span');
                    pieceElement.className = 'piece';
                    pieceElement.textContent = pieces[myPieceFormat];
                    pieceElement.classList.add(pieceInfo.color === 'w' ? 'white-piece' : 'black-piece');
                    square.appendChild(pieceElement);
                } else {
                    const img = document.createElement('img');
                    const colorPrefix = pieceInfo.color === 'w' ? 'w' : 'b';
                    const pieceCode = pieceInfo.type;
                    const filename = `pieces/${colorPrefix}${pieceCode}.png`;
                    img.src = filename;
                    img.alt = myPieceFormat;
                    img.classList.add("piece");
                    img.draggable = false;
                    img.onerror = () => { console.warn(`Image not found: ${filename}`); img.style.display = 'none'; };
                    square.appendChild(img);
                }
            }

            if (currentMoveIndex >= 0) {
                const lastMovePlayed = fullGameHistory[currentMoveIndex];
                if (lastMovePlayed && (alg === lastMovePlayed.from || alg === lastMovePlayed.to)) {
                    square.classList.add('last-move');
                }
            }

            if (colIndex === 0 || rowIndex === 7) {
                const label = document.createElement('span');
                label.className = 'square-label';
                if (colIndex === 0) label.textContent = `${8 - rowIndex}`;
                if (rowIndex === 7) label.textContent += files[colIndex];
                if (colIndex === 0 && rowIndex === 7) label.textContent = `${files[colIndex]}${8 - rowIndex}`;
                if (label.textContent) square.appendChild(label);
            }

            square.addEventListener('click', handleSquareClick_Review);
            square.style.cursor = 'pointer';

            boardFragment.appendChild(square);
        }
    }
    chessboardEl.appendChild(boardFragment);
    console.log("createBoard_Review: Board rendered.");

    try {
        if (reviewGame.in_check()) {
            const kingColor = reviewGame.turn();
            const boardState = reviewGame.board();
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = boardState[r]?.[c];
                    if (piece && piece.type === 'k' && piece.color === kingColor) {
                        const kingSquareEl = chessboardEl.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
                        if (kingSquareEl) kingSquareEl.classList.add('in-check');
                        break;
                    }
                }
            }
        }
    } catch (e) { console.error("Error highlighting check:", e); }

    // Call setupBoardOverlay *after* the board is fully in the DOM and rendered.
    // Using a small timeout can help ensure layout calculations are complete.
    setTimeout(setupBoardOverlay, 50); // Increased timeout slightly

    if (selectedSquareAlg_Review) {
        const moves = reviewGame.moves({ square: selectedSquareAlg_Review, verbose: true });
        highlightMoves_Review(moves);
    }
}

// --- Interactive Move Handling ---
function handleSquareClick_Review(event) {
    const square = event.currentTarget;
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const clickedAlg = coordToAlg(row, col);

    if (promotionCallback_Review) return;

    const pieceOnSquare = reviewGame.get(clickedAlg);

    if (selectedSquareAlg_Review) {
        const fromAlg = selectedSquareAlg_Review;
        const fromSquareEl = chessboardEl.querySelector(`.square[data-row="${algToCoord(fromAlg)[0]}"][data-col="${algToCoord(fromAlg)[1]}"]`);

        if (clickedAlg === fromAlg) {
            if (fromSquareEl) fromSquareEl.classList.remove('selected');
            selectedSquareAlg_Review = null;
            highlightMoves_Review([]);
            return;
        }

        const legalMoves = reviewGame.moves({ square: fromAlg, verbose: true });
        const targetMove = legalMoves.find(move => move.to === clickedAlg);

        if (targetMove) {
            if (fromSquareEl) fromSquareEl.classList.remove('selected');
            highlightMoves_Review([]);
            selectedSquareAlg_Review = null;

            if (targetMove.flags.includes('p')) {
                showPromotionModal_Review(reviewGame.turn() === 'w' ? 'white' : 'black', (promoChoice) => {
                    if (promoChoice) {
                        makeInteractiveMove(fromAlg, clickedAlg, promoChoice);
                    }
                });
            } else {
                makeInteractiveMove(fromAlg, clickedAlg);
            }
        } else {
            if (fromSquareEl) fromSquareEl.classList.remove('selected');
            highlightMoves_Review([]);
            selectedSquareAlg_Review = null;

            if (pieceOnSquare && pieceOnSquare.color === reviewGame.turn()) {
                selectedSquareAlg_Review = clickedAlg;
                square.classList.add('selected');
                const newMoves = reviewGame.moves({ square: clickedAlg, verbose: true });
                highlightMoves_Review(newMoves);
            }
        }
    } else if (pieceOnSquare && pieceOnSquare.color === reviewGame.turn()) {
        selectedSquareAlg_Review = clickedAlg;
        square.classList.add('selected');
        const moves = reviewGame.moves({ square: clickedAlg, verbose: true });
        highlightMoves_Review(moves);
    }
}

function makeInteractiveMove(fromAlg, toAlg, promotionChoice = null) {
    const fenBefore = reviewGame.fen();
    const moveData = { from: fromAlg, to: toAlg };
    if (promotionChoice) {
        moveData.promotion = promotionChoice.toLowerCase();
    }

    const moveResult = reviewGame.move(moveData);

    if (moveResult === null) {
        return false;
    }

    if (currentMoveIndex < fullGameHistory.length - 1) {
        fullGameHistory = fullGameHistory.slice(0, currentMoveIndex + 1);
        moveAnalysisData = moveAnalysisData.slice(0, currentMoveIndex + 2);
    }

    fullGameHistory.push({ ...moveResult, fen_before: fenBefore, fen_after: reviewGame.fen() });

    moveAnalysisData.push({
        fen_before: fenBefore, fen_after: reviewGame.fen(),
        played_move: { san: moveResult.san, uci: fromAlg + toAlg + (promotionChoice || '') },
        eval_before: null, best_move_before: null, pv: null,
        eval_after_played: null, classification: null, analysis_depth: 0,
        pass1_complete: false, pass2_complete: false, cpl: null
    });

    currentMoveIndex = fullGameHistory.length - 1;

    createBoard_Review();
    buildMoveListUI();
    updateStatus();
    updateNavButtons();
    updateAnalysisDisplayForCurrentMove();
    updateBoardOverlays();

    analyzeCurrentPosition();

    return true;
}

function analyzeCurrentPosition() {
    if (!isStockfishReady) {
        return;
    }
    if (isProcessingQueue) {
        return;
    }

    const analysisIndexToRun = currentMoveIndex + 1;
    if (analysisIndexToRun < 0 || analysisIndexToRun >= moveAnalysisData.length) {
        return;
    }

    const analysisEntry = moveAnalysisData[analysisIndexToRun];
    if (!analysisEntry || analysisEntry.pass1_complete) {
        return;
    }

    stockfishQueue.push({
        analysisDataIndex: analysisIndexToRun,
        fen: analysisEntry.fen_after,
        depth: DEPTH_PASS_1,
        purpose: 'eval_position',
        isPass1: true
    });

    if (!isProcessingQueue) {
        processStockfishQueue();
    }
}

function showPromotionModal_Review(color, callback) {
    const choice = prompt(`Promote pawn to (q, r, n, b)?`, 'q') || 'q';
    callback(choice.toLowerCase());
}

function highlightMoves_Review(moves) {
    if (!chessboardEl) return;
    chessboardEl.querySelectorAll('.square.highlight, .square.capture').forEach(sq => {
        sq.classList.remove('highlight', 'capture');
    });

    moves.forEach(move => {
        const toCoord = algToCoord(move.to);
        if (!toCoord) return;
        const [r, c] = toCoord;
        const square = chessboardEl.querySelector(`.square[data-row="${r}"][data-col="${c}"]`);
        if (square) {
            square.classList.add(move.flags.includes('c') ? 'capture' : 'highlight');
        }
    });
}

// --- Move List UI ---

function buildMoveListUI() {
    if (!moveListEl) return;
    moveListEl.innerHTML = '';
    let moveNumber = 1;
    let currentLi = null;

    const initialLi = document.createElement('li');
    initialLi.dataset.moveIndex = -1;
    initialLi.innerHTML = `<span class="move-number">0.</span><span>Position initiale</span>`;
    initialLi.addEventListener('click', () => goToMove(-1));
    moveListEl.appendChild(initialLi);

    if (fullGameHistory.length === 0) return;

    for (let i = 0; i < fullGameHistory.length; i++) {
        const move = fullGameHistory[i];
        if (!move || !move.color || !move.san) {
            console.warn(`Skipping invalid move data at index ${i}`);
            continue;
        }

        if (move.color === 'w') {
            currentLi = document.createElement('li');
            currentLi.dataset.moveIndex = i;
            const numSpan = `<span class="move-number">${moveNumber}.</span>`;
            const whiteSpan = document.createElement('span');
            whiteSpan.className = 'move-white';
            whiteSpan.textContent = move.san;
            whiteSpan.addEventListener('click', (e) => { e.stopPropagation(); goToMove(i); });

            const classificationSpan = `<span class="move-classification white-class" title=""></span>`;
            currentLi.innerHTML = numSpan;
            currentLi.appendChild(whiteSpan);
            currentLi.innerHTML += classificationSpan;
            moveListEl.appendChild(currentLi);
        } else {
            if (currentLi) {
                const blackSpan = document.createElement('span');
                blackSpan.className = 'move-black';
                blackSpan.textContent = move.san;
                blackSpan.addEventListener('click', (e) => { e.stopPropagation(); goToMove(i); });

                const classificationSpan = `<span class="move-classification black-class" title=""></span>`;

                currentLi.appendChild(document.createTextNode(' '));
                currentLi.appendChild(blackSpan);
                currentLi.innerHTML += classificationSpan;

                currentLi.dataset.moveIndexBlack = i;
            } else {
                console.warn("Black moved first? PGN Issue?");
            }
            moveNumber++;
        }

        if (currentLi) {
            currentLi.addEventListener('click', () => {
                goToMove(parseInt(currentLi.dataset.moveIndex));
            });
        }
    }
}

function updateMoveListHighlight() {
    moveListEl?.querySelectorAll('li').forEach(li => {
        li.classList.remove('current-move');
        const liIndex = parseInt(li.dataset.moveIndex);

        if (liIndex === currentMoveIndex) {
            li.classList.add('current-move');
            li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        const blackIndexStr = li.dataset.moveIndexBlack;
        if (blackIndexStr) {
            const liIndexBlack = parseInt(blackIndexStr);
            if (liIndexBlack === currentMoveIndex) {
                li.classList.add('current-move');
                li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    });
}

function updateMoveListClassification(moveIndex, classificationText) {
    if (!moveListEl || moveIndex < 0 || moveIndex >= fullGameHistory.length) return;

    const move = fullGameHistory[moveIndex];
    if (!move) return;

    const liIndex = Math.floor(moveIndex / 2) * 2;
    const liElement = moveListEl.querySelector(`li[data-move-index="${liIndex}"]`);
    if (!liElement) return;

    const targetClass = (move.color === 'w') ? '.white-class' : '.black-class';
    const spanElement = liElement.querySelector(targetClass);
    if (!spanElement) return;

    let iconHtml = '';
    switch (classificationText) {
        case "Meilleur": iconHtml = '<i class="fas fa-star" style="color: #FFD700;"></i>'; break;
        case "Excellent": iconHtml = '<i class="fas fa-check-double" style="color: #76FF03;"></i>'; break;
        case "Bon": iconHtml = '<i class="fas fa-check" style="color: #B0BEC5;"></i>'; break;
        case "Imprécision": iconHtml = '<i class="fas fa-exclamation-circle" style="color: #FFC107;"></i>'; break;
        case "Erreur": iconHtml = '<i class="fas fa-times" style="color: #FF7043;"></i>'; break;
        case "Gaffe": iconHtml = '<i class="fas fa-bomb" style="color: #D32F2F;"></i>'; break;
        default: iconHtml = '';
    }
    spanElement.innerHTML = iconHtml;
    spanElement.title = classificationText || '';
}

// --- Analysis Display Update ---

function updateGoodStrategyDisplay() {
    const strategyEl = document.getElementById('review-good-strategy');
    if (!strategyEl) return;
    const strategySpan = strategyEl.querySelector('span');
    if (!strategySpan) return; // Ensure the span exists

    let strategyText = "N/A";
    const MAX_MOVES_TO_SHOW = 5; // Limit the number of moves displayed

    // Get analysis data for the current position (index = currentMoveIndex + 1)
    // Ensure index is valid
    const analysisIndex = currentMoveIndex + 1;
    if (analysisIndex < 0 || analysisIndex >= moveAnalysisData.length) {
        strategySpan.textContent = "N/A"; // Or "Analyse requise"
        return;
    }
    const analysisCurrent = moveAnalysisData[analysisIndex];

    if (analysisCurrent?.pv && analysisCurrent.pv.length > 0) {
        // Use the FEN of the current board state to simulate the PV
        const fenForPV = reviewGame.fen();
        const tempGame = new Chess(fenForPV); // Create new instance for simulation
        let mateFound = false;
        const movesSAN = [];

        // Iterate through the PV, respecting the MAX_MOVES_TO_SHOW limit
        for (let i = 0; i < Math.min(analysisCurrent.pv.length, MAX_MOVES_TO_SHOW); i++) {
            const moveUci = analysisCurrent.pv[i];
            // Validate move format before attempting
            if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(moveUci)) {
                 console.warn(`Invalid UCI format in PV: ${moveUci}`);
                 break;
            }
            const moveObj = tempGame.move(moveUci, { sloppy: true });

            if (!moveObj) {
                // Stop if an invalid move is encountered in the PV
                console.warn(`Invalid move in PV: ${moveUci} at step ${i} from FEN ${fenForPV}`);
                break; // Stop processing PV
            }
            movesSAN.push(moveObj.san);

            // Check if the current move results in checkmate *after* the move is made
            if (tempGame.in_checkmate()) {
                mateFound = true;
                // Add '#' to the last move SAN if it's checkmate
                if (movesSAN.length > 0) {
                    movesSAN[movesSAN.length - 1] += '#';
                }
                break; // Stop processing PV if mate is found
            }
        }
        // ... (rest of the function remains the same) ...
        // Format the strategy text based on findings
        if (mateFound) {
            strategyText = `Mat forcé: ${movesSAN.join(' ')}`;
        } else if (movesSAN.length > 0) {
            strategyText = movesSAN.join(' ');
            // Indicate if the PV was longer than the display limit
            if (analysisCurrent.pv.length > MAX_MOVES_TO_SHOW) {
                strategyText += ' ...';
            }
        } else {
            // Handle cases where PV exists but no valid moves could be processed
             strategyText = "Ligne principale non calculable."; // More specific message
        }
    } else if (analysisCurrent && (analysisCurrent.pass1_complete || analysisCurrent.pass2_complete) && !analysisCurrent.pv) {
         // If analysis is done but no PV (e.g., mate in 0 or error), indicate calculation status
         strategyText = "Calcul...";
    } else if (!analysisCurrent || (!analysisCurrent.pass1_complete && !analysisCurrent.pass2_complete)) {
        // If analysis hasn't run or completed for this position
        strategyText = "Analyse requise";
    }


    strategySpan.textContent = strategyText;
}

function updateAnalysisDisplayForCurrentMove() {
    const displayIndex = currentMoveIndex + 1;
    if (displayIndex < 0 || displayIndex >= moveAnalysisData.length) {
        console.warn("Analysis display update requested for invalid index:", displayIndex);
        clearAnalysisUI();
        return;
    }

    const analysisResult = moveAnalysisData[displayIndex];
    if (!analysisResult) {
        console.warn("No analysis data found for index:", displayIndex);
        clearAnalysisUI();
        return;
    }

    const evalToShow = analysisResult.eval_before;
    const bestMoveToShow = analysisResult.best_move_before;
    const pvToShow = analysisResult.pv;
    const classificationOfPrevMove = analysisResult.classification;

    let scoreText = "N/A";
    let whitePerc = 50;
    const turn = reviewGame.turn();

    if (evalToShow !== null) {
        if (typeof evalToShow === 'number') {
            scoreText = (evalToShow > 0 ? '+' : '') + evalToShow.toFixed(2);
            const advantage = Math.max(-8, Math.min(8, evalToShow));
            whitePerc = 50 + (advantage * 6);
            whitePerc = Math.max(2, Math.min(98, whitePerc));
        } else if (typeof evalToShow === 'string' && evalToShow.startsWith('M')) {
            const mateIn = parseInt(evalToShow.substring(1));
            if ((turn === 'w' && mateIn > 0) || (turn === 'b' && mateIn < 0)) {
                scoreText = `#${Math.abs(mateIn)}`;
                whitePerc = (turn === 'w') ? 100 : 0;
            } else {
                scoreText = `#-${Math.abs(mateIn)}`;
                whitePerc = (turn === 'w') ? 0 : 100;
            }
        }
    } else if (analysisResult.pass1_complete || analysisResult.pass2_complete) {
        scoreText = "Calcul...";
    }

    scoreEl.textContent = scoreText;
    if (whiteProgressEl) whiteProgressEl.style.width = `${whitePerc}%`;
    if (blackProgressEl) blackProgressEl.style.width = `${100 - whitePerc}%`;

    if (bestMoveEl) {
        if (bestMoveToShow && bestMoveToShow !== '(none)' && bestMoveToShow !== '0000') {
            try {
                const tempGame = new Chess(reviewGame.fen());
                const moveObj = tempGame.move(bestMoveToShow, { sloppy: true });
                bestMoveEl.textContent = moveObj ? moveObj.san : bestMoveToShow;
            } catch (e) { bestMoveEl.textContent = bestMoveToShow; }
        } else {
            bestMoveEl.textContent = (evalToShow === null && (analysisResult.pass1_complete || analysisResult.pass2_complete)) ? "..." : "N/A";
        }
    }

    if (playedMoveInfoEl) {
        if (currentMoveIndex >= 0) {
            if (classificationOfPrevMove) {
                let iconHtml = '';
                switch (classificationOfPrevMove) {
                    case "Meilleur": iconHtml = '<i class="fas fa-star" style="color: #FFD700;"></i> '; break;
                    case "Excellent": iconHtml = '<i class="fas fa-check-double" style="color: #76FF03;"></i> '; break;
                    case "Bon": iconHtml = '<i class="fas fa-check" style="color: #B0BEC5;"></i> '; break;
                    case "Imprécision": iconHtml = '<i class="fas fa-exclamation-circle" style="color: #FFC107;"></i> '; break;
                    case "Erreur": iconHtml = '<i class="fas fa-times" style="color: #FF7043;"></i> '; break;
                    case "Gaffe": iconHtml = '<i class="fas fa-bomb" style="color: #D32F2F;"></i> '; break;
                }
                playedMoveInfoEl.innerHTML = `Coup Joué: ${iconHtml}${classificationOfPrevMove}`;
            } else if (analysisResult.pass1_complete || analysisResult.pass2_complete) {
                playedMoveInfoEl.textContent = "Coup Joué: Classification...";
            } else {
                playedMoveInfoEl.textContent = "";
            }
        } else {
            playedMoveInfoEl.textContent = "";
        }
    }

    updateGoodStrategyDisplay();
}

// --- Navigation ---
function goToMove(index) {
    index = Math.max(-1, Math.min(index, fullGameHistory.length - 1));

    if (index === currentMoveIndex) return;

    console.log(`Navigating to move index: ${index}`);
    currentMoveIndex = index;

    const targetFen = (index === -1)
        ? moveAnalysisData[0]?.fen_after
        : moveAnalysisData[index + 1]?.fen_after;

    if (!targetFen) {
        console.error(`goToMove: Could not find target FEN for index ${index}`);
        statusEl.textContent = "Erreur: Impossible de charger la position.";
        if (chessboardEl) chessboardEl.innerHTML = '<p style="color: red; padding: 20px;">Erreur chargement FEN</p>';
        return;
    }

    console.log(`goToMove: Loading FEN: ${targetFen}`);
    try {
        const loadedOk = reviewGame.load(targetFen);
        if (!loadedOk) {
            throw new Error(`chess.js load returned false for FEN: ${targetFen}`);
        }
        console.log("goToMove: FEN loaded successfully.");
    } catch (e) {
        console.error(`goToMove: Error loading FEN: ${e.message}`, e);
        statusEl.textContent = "Erreur critique: FEN invalide.";
        if (chessboardEl) chessboardEl.innerHTML = '<p style="color: red; padding: 20px;">Erreur chargement FEN critique</p>';
        return;
    }

    createBoard_Review();
    updateStatus();
    updateMoveListHighlight();
    updateNavButtons();
    updateAnalysisDisplayForCurrentMove();
    updateBoardOverlays();
}

// --- Accuracy Calculation and Chart ---

function calculateSingleMoveAccuracy(cpl) {
    // Calculates accuracy percentage based on centipawn loss (CPL).
    // Formula inspired by common practices, adjustable.
    if (cpl === null || cpl === undefined || isNaN(cpl)) return null;
    const loss = Math.max(0, cpl); // Accuracy doesn't increase for negative CPL
    // Sigmoid-like function: 103.1668 * Math.exp(-0.04354 * loss) - 3.1668 (Chess.com approximation)
    // Simpler exponential decay: 100 * Math.exp(-loss / X) where X controls sensitivity
    const accuracy = 100 * Math.exp(-loss / 300); // Adjust 300 to tune sensitivity
    return Math.max(0, Math.min(100, accuracy));
}

function getEvaluationForPlotting(evaluation, turn) {
    // Converts Stockfish eval (cp or mate) into a numerical value for plotting.
    // Clamps extreme values for better visualization.
    const MATE_SCORE = 1500; // Value to represent mate on the chart (in centipawns)
    const MAX_CP = 1000;    // Max centipawn value to display (avoid huge spikes)

    if (evaluation === null || evaluation === undefined) return null;

    if (typeof evaluation === 'string' && evaluation.startsWith('M')) {
        const mateIn = parseInt(evaluation.substring(1));
        // Positive M means advantage for the side whose turn it ISN'T in the FEN
        // But the chart usually shows advantage from White's perspective.
        // Let's adjust based on whose move led to this eval.
        // If eval is M5 (mate in 5 for white), score is +MATE_SCORE
        // If eval is M-3 (mate in 3 for black), score is -MATE_SCORE
        return mateIn > 0 ? MATE_SCORE : -MATE_SCORE;
    } else if (typeof evaluation === 'number') {
        // Clamp centipawn scores
        return Math.max(-MAX_CP, Math.min(MAX_CP, evaluation * 100));
    }
    return null; // Invalid format
}

function updateAccuracyChartAndStats() {
    if (!accuracyChart) return;

    const whiteAccuracyData = [];
    const blackAccuracyData = [];
    const chartLabels = [];

    let whiteTotalAccuracy = 0;
    let whiteMoveCount = 0;
    let blackTotalAccuracy = 0;
    let blackMoveCount = 0;

    // Start from the first move (index 0 in fullGameHistory)
    for (let i = 0; i < fullGameHistory.length; i++) {
        const move = fullGameHistory[i];
        const analysis = moveAnalysisData[i + 1]; // Analysis data corresponds to the state *after* the move
        const moveNumber = Math.floor(i / 2) + 1;
        const label = `${moveNumber}${move.color === 'w' ? '.' : '...'}`;
        chartLabels.push(label);

        const moveAccuracy = calculateSingleMoveAccuracy(analysis?.cpl);

        if (move.color === 'w') {
            whiteAccuracyData.push(moveAccuracy);
            blackAccuracyData.push(NaN); // Use NaN for the other player's turn
            if (moveAccuracy !== null) {
                whiteTotalAccuracy += moveAccuracy;
                whiteMoveCount++;
            }
        } else { // Black's move
            blackAccuracyData.push(moveAccuracy);
            whiteAccuracyData.push(NaN); // Use NaN for the other player's turn
            if (moveAccuracy !== null) {
                blackTotalAccuracy += moveAccuracy;
                blackMoveCount++;
            }
        }
    }

    // Calculate average accuracies
    const avgWhiteAccuracy = whiteMoveCount > 0 ? (whiteTotalAccuracy / whiteMoveCount) : null;
    const avgBlackAccuracy = blackMoveCount > 0 ? (blackTotalAccuracy / blackMoveCount) : null;

    if (accuracyWhiteEl) accuracyWhiteEl.textContent = `Blanc: ${avgWhiteAccuracy !== null ? avgWhiteAccuracy.toFixed(1) + '%' : 'N/A'}`;
    if (accuracyBlackEl) accuracyBlackEl.textContent = `Noir: ${avgBlackAccuracy !== null ? avgBlackAccuracy.toFixed(1) + '%' : 'N/A'}`;

    // Update chart data and refresh
    accuracyChart.data.labels = chartLabels;
    accuracyChart.data.datasets[0].data = whiteAccuracyData;
    accuracyChart.data.datasets[1].data = blackAccuracyData;

    accuracyChart.update();

    console.log(`Accuracy chart updated. White Avg ${avgWhiteAccuracy?.toFixed(1) ?? 'N/A'}%, Black Avg ${avgBlackAccuracy?.toFixed(1) ?? 'N/A'}%`);
}


function initAccuracyChart() {
    if (!accuracyChartCanvas) {
        console.error("Accuracy chart canvas not found.");
        return;
    }
    const ctx = accuracyChartCanvas.getContext('2d');

    if (accuracyChart) {
        accuracyChart.destroy(); // Ensure clean slate
        accuracyChart = null;
    }

    accuracyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [], // Populated by updateAccuracyChartAndStats
            datasets: [
                {
                    label: 'Précision Blanc (%)',
                    data: [], // Populated by updateAccuracyChartAndStats
                    borderColor: 'rgba(230, 230, 230, 0.8)', // Lighter color for White
                    backgroundColor: 'rgba(230, 230, 230, 0.1)',
                    borderWidth: 2,
                    tension: 0.1,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    spanGaps: false, // Don't connect gaps for accuracy
                    pointBackgroundColor: 'rgba(230, 230, 230, 0.8)',
                },
                {
                    label: 'Précision Noir (%)',
                    data: [], // Populated by updateAccuracyChartAndStats
                    borderColor: 'rgba(60, 60, 60, 0.8)', // Darker color for Black
                    backgroundColor: 'rgba(60, 60, 60, 0.1)',
                    borderWidth: 2,
                    tension: 0.1,
                    pointRadius: 2,
                    pointHoverRadius: 4,
                    spanGaps: false, // Don't connect gaps for accuracy
                    pointBackgroundColor: 'rgba(60, 60, 60, 0.8)',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: 0,
                    max: 100,
                    title: { display: true, text: 'Précision (%)', color: '#ccc' },
                    ticks: {
                        color: '#aaa',
                        stepSize: 10,
                        callback: function(value) {
                            return value + '%';
                        }
                    },
                    grid: {
                        color: 'rgba(170, 170, 170, 0.2)',
                        drawBorder: false,
                    },
                },
                x: {
                    title: { display: true, text: 'Coup', color: '#ccc' },
                    ticks: {
                        color: '#aaa',
                        maxRotation: 0,
                        autoSkip: false, // Changed from true to false
                        maxTicksLimit: 20 // Limit number of labels shown
                    },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: '#ccc',
                        usePointStyle: true,
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(30, 30, 30, 0.9)',
                    titleColor: '#eee',
                    bodyColor: '#ddd',
                    callbacks: {
                        title: function(tooltipItems) {
                            // Show move number and SAN from the label
                            return tooltipItems[0]?.label || '';
                        },
                        label: function(context) {
                            const datasetLabel = context.dataset.label || '';
                            const value = context.parsed.y;
                            if (value === null || isNaN(value)) {
                                return null; // Don't show tooltip for NaN values
                            }
                            let label = `${datasetLabel}: ${value.toFixed(1)}%`;

                            // Add Classification if available
                            const index = context.dataIndex;
                            const analysis = moveAnalysisData[index + 1]; // Analysis after the move
                            if (analysis?.classification) {
                                label += ` (${analysis.classification})`;
                            }
                            return label;
                        }
                    }
                }
            },
            interaction: { // Ensure tooltips appear even over NaN points
                mode: 'index',
                intersect: false,
            },
        }
    });
    console.log("Accuracy chart initialized (autoSkip disabled).");
}

// --- Move Classification ---
function classifyMove(moveIndex) {
    if (moveIndex < 0 || moveIndex >= fullGameHistory.length) return;

    const dataIndexBefore = moveIndex;
    const dataIndexAfter = moveIndex + 1;

    const analysisBefore = moveAnalysisData[dataIndexBefore];
    const analysisAfter = moveAnalysisData[dataIndexAfter];
    const playedMove = fullGameHistory[moveIndex];

    const evalBeforeMove = analysisBefore?.eval_before;
    const evalAfterPlayed = analysisAfter?.eval_before;

    if (evalBeforeMove === null || evalAfterPlayed === null) {
        console.log(`Classification deferred for move ${moveIndex + 1}: missing eval data.`);
        if (moveAnalysisData[dataIndexAfter]) {
            moveAnalysisData[dataIndexAfter].classification = null;
            moveAnalysisData[dataIndexAfter].cpl = null;
        }
        return;
    }

    const cpEquivalentMate = 10000;
    let cpBefore = 0;
    let cpAfterPlayed = 0;
    const turnMultiplier = (playedMove.color === 'w') ? 1 : -1;

    if (typeof evalBeforeMove === 'string' && evalBeforeMove.startsWith('M')) {
        const mateVal = parseInt(evalBeforeMove.substring(1));
        cpBefore = (mateVal > 0 ? cpEquivalentMate : -cpEquivalentMate);
    } else {
        cpBefore = evalBeforeMove * 100;
    }

    if (typeof evalAfterPlayed === 'string' && evalAfterPlayed.startsWith('M')) {
        const mateVal = parseInt(evalAfterPlayed.substring(1));
        cpAfterPlayed = (mateVal > 0 ? cpEquivalentMate : -cpEquivalentMate);
    } else {
        cpAfterPlayed = evalAfterPlayed * 100;
    }

    const centipawnLoss = Math.round((cpBefore * turnMultiplier) - (cpAfterPlayed * turnMultiplier));

    if (moveAnalysisData[dataIndexAfter]) {
        moveAnalysisData[dataIndexAfter].cpl = centipawnLoss;
    }

    let classification = "Bon";

    const bestMoveBefore = analysisBefore.best_move_before;
    const playedMoveUCI = playedMove.from + playedMove.to + (playedMove.promotion || '');

    if (centipawnLoss >= THRESHOLD_BLUNDER) {
        classification = "Gaffe";
    } else if (centipawnLoss >= THRESHOLD_MISTAKE) {
        classification = "Erreur";
    } else if (centipawnLoss >= THRESHOLD_INACCURACY) {
        classification = "Imprécision";
    } else if (bestMoveBefore && playedMoveUCI === bestMoveBefore) {
        classification = "Meilleur";
    } else if (centipawnLoss <= 5) {
        classification = "Excellent";
    }

    if (moveAnalysisData[dataIndexAfter]) {
        moveAnalysisData[dataIndexAfter].classification = classification;
    } else {
        console.error("Cannot store classification, data entry missing for index", dataIndexAfter);
        return;
    }

    updateMoveListClassification(moveIndex, classification);

    console.log(`Classified move ${moveIndex + 1} (${playedMove.san}): ${classification} (CPL: ${centipawnLoss})`);
}

// --- Stockfish Analysis Orchestration ---

function processStockfishQueue() {
    if (stockfishQueue.length === 0) {
        console.log("Stockfish queue empty.");
        isProcessingQueue = false;
        analysisProgressText.textContent = getOverallAnalysisProgress();

        const allPass1Done = moveAnalysisData.slice(1).every(d => d && d.pass1_complete);
        if (allPass1Done && !analysisComplete) {
            console.log("Analysis Pass 1 complete. Calculating accuracy...");
            analysisComplete = true;
            updateAccuracyChartAndStats();
            analysisProgressText.textContent = "Analyse Terminée.";
        }
        return;
    }

    if (isProcessingQueue) {
        console.log("Still processing previous job, queue will continue.");
        return;
    }

    isProcessingQueue = true;
    currentAnalysisJob = stockfishQueue.shift();

    const totalJobs = moveAnalysisData.length;
    const currentJobNum = totalJobs - stockfishQueue.length;
    const passNum = currentAnalysisJob.isPass1 ? 1 : 2;
    analysisProgressText.textContent = `Analyse (P${passNum}): Position ${currentJobNum}/${totalJobs} (Prof ${currentAnalysisJob.depth})...`;

    console.log(`Requesting analysis: Idx=${currentAnalysisJob.analysisDataIndex}, Depth=${currentAnalysisJob.depth}, Fen=${currentAnalysisJob.fen.substring(0, 20)}...`);

    stockfish.postMessage('stop');
    stockfish.postMessage('ucinewgame');
    stockfish.postMessage(`position fen ${currentAnalysisJob.fen}`);
    stockfish.postMessage(`go depth ${currentAnalysisJob.depth}`);
}

function handleStockfishMessage_Review(event) {
    const message = event.data;

    if (message === 'uciok') {
        console.log("Review UCI OK");
        stockfish.postMessage('isready');
        return;
    }
    if (message === 'readyok') {
        isStockfishReady = true;
        console.log("Review Stockfish ready.");
        analysisProgressText.textContent = "Moteur Prêt.";
        if (!isProcessingQueue && stockfishQueue.length > 0) {
            processStockfishQueue();
        }
        return;
    }

    if (!currentAnalysisJob) return;

    let currentEval = null;
    let currentBestMove = null;
    let currentPv = null;

    if (message.startsWith('info')) {
        const cpMatch = message.match(/score cp (-?\d+)/);
        const mateMatch = message.match(/score mate (-?\d+)/);
        const pvMatch = message.match(/ pv (.+)/);

        if (mateMatch) {
            currentEval = `M${mateMatch[1]}`;
        } else if (cpMatch) {
            currentEval = parseFloat((parseInt(cpMatch[1], 10) / 100.0).toFixed(2));
        }

        if (pvMatch) {
            currentPv = pvMatch[1].split(' ');
            if (currentPv.length > 0) {
                currentBestMove = currentPv[0];
            }
        }
        const dataEntry = moveAnalysisData[currentAnalysisJob.analysisDataIndex];
        if (dataEntry) {
            if (currentEval !== null) dataEntry.eval_before_temp = currentEval;
            if (currentBestMove !== null) dataEntry.best_move_before_temp = currentBestMove;
            if (currentPv !== null) dataEntry.pv_temp = currentPv;
        }


    } else if (message.startsWith('bestmove')) {
        const finalBestMove = message.split(' ')[1];
        const analysisIndex = currentAnalysisJob.analysisDataIndex;

        console.log(`Analysis complete for index ${analysisIndex} (Depth ${currentAnalysisJob.depth}): Best=${finalBestMove}, Eval=${currentEval ?? 'N/A'}`);

        const dataEntry = moveAnalysisData[analysisIndex];
        if (dataEntry) {
            dataEntry.eval_before = dataEntry.eval_before_temp ?? currentEval ?? null;
            dataEntry.best_move_before = dataEntry.best_move_before_temp ?? finalBestMove;
            dataEntry.pv = dataEntry.pv_temp ?? (finalBestMove && finalBestMove !== '(none)' ? [finalBestMove] : null);
            dataEntry.analysis_depth = currentAnalysisJob.depth;

            if (currentAnalysisJob.isPass1) dataEntry.pass1_complete = true;
            else dataEntry.pass2_complete = true;

            delete dataEntry.eval_before_temp;
            delete dataEntry.best_move_before_temp;
            delete dataEntry.pv_temp;

            const moveIndexToClassify = analysisIndex - 1;
            if (moveIndexToClassify >= 0) {
                classifyMove(moveIndexToClassify);
            }

            if (currentMoveIndex === moveIndexToClassify) {
                updateAnalysisDisplayForCurrentMove();
                updateBoardOverlays();
            } else if (currentMoveIndex === -1 && analysisIndex === 0) {
                updateAnalysisDisplayForCurrentMove();
                updateBoardOverlays();
            }
        } else {
            console.error(`Data entry not found for analysis index ${analysisIndex}`);
        }

        currentAnalysisJob = null;
        isProcessingQueue = false;
        processStockfishQueue();
    }
}

function startFullGameAnalysis() {
    if (!isStockfishReady) {
        console.warn("Stockfish not ready, delaying analysis start.");
        analysisProgressText.textContent = "Moteur en attente...";
        setTimeout(startFullGameAnalysis, 1000);
        return;
    }
    if (isProcessingQueue || stockfishQueue.length > 0) {
        console.log("Analysis already in progress or queued.");
        return;
    }
    console.log("Starting full game analysis...");
    analysisProgressText.textContent = "Préparation de l'analyse...";
    stockfishQueue = [];

    for (let i = 0; i < moveAnalysisData.length; i++) {
        const analysisEntry = moveAnalysisData[i];
        if (analysisEntry && !analysisEntry.pass1_complete) {
            stockfishQueue.push({
                analysisDataIndex: i,
                fen: analysisEntry.fen_after,
                depth: DEPTH_PASS_1,
                purpose: 'eval_position',
                isPass1: true
            });
        }
    }

    if (!isProcessingQueue) {
        processStockfishQueue();
    } else {
        console.log("Queue populated, waiting for current job to finish.");
    }
}

// --- Stockfish Initialization ---
function initStockfish_Review() {
    try {
        stockfish = new Worker('./stockfish.wasm.js');
        stockfish.onmessage = handleStockfishMessage_Review;
        stockfish.onerror = (e) => {
            console.error("Review Stockfish Error:", e);
            statusEl.textContent = "Erreur Moteur Analyse.";
            analysisProgressText.textContent = "Moteur Indisponible";
            isStockfishReady = false;
        };
        setTimeout(() => {
            stockfish.postMessage('uci');
            stockfish.postMessage('setoption name Hash value 64');
        }, 50);

        console.log("Review Stockfish worker initializing...");
    } catch (e) {
        console.error("Failed to init Review Stockfish Worker:", e);
        statusEl.textContent = "Erreur: Worker IA non supporté.";
        analysisProgressText.textContent = "Moteur Indisponible";
        isStockfishReady = false;
    }
}

// --- Game Loading and State Management ---

function loadGameAndPrepareHistory(pgnString = null) {
    const pgn = pgnString || localStorage.getItem('reviewGamePGN');
    if (!pgn) {
        if (pgnString === null) {
            console.log("No PGN in localStorage, preparing for Analysis Board mode or PGN paste.");
        } else {
            statusEl.textContent = "Erreur: PGN fourni est vide.";
            console.error("Empty PGN provided for review.");
        }
        fullGameHistory = [];
        moveAnalysisData = [];
        return false;
    }

    const tempGame = new Chess();
    let pgnHeaders = {};
    try {
        const loaded = tempGame.load_pgn(pgn, { sloppy: true });
        if (!loaded) throw new Error("chess.js couldn't load PGN.");

        pgnHeaders = tempGame.header();
        const historyVerbose = tempGame.history({ verbose: true });
        if (historyVerbose.length === 0) throw new Error("No moves in PGN");

        fullGameHistory = [];
        moveAnalysisData = [];
        const fenGame = new Chess();

        const initialFen = fenGame.fen();
        moveAnalysisData.push({
            fen_before: null, fen_after: initialFen, played_move: null,
            eval_before: null, best_move_before: null, pv: null,
            eval_after_played: null, classification: null, analysis_depth: 0,
            pass1_complete: false, pass2_complete: false, cpl: null
        });

        for (const move of historyVerbose) {
            const fen_before = fenGame.fen();
            const moveResult = fenGame.move(move.san);
            if (!moveResult) {
                console.warn(`Skipping invalid move in PGN: ${move.san} at FEN ${fen_before}`);
                continue;
            }
            const fen_after = fenGame.fen();

            fullGameHistory.push({ ...move, fen_before, fen_after });
            moveAnalysisData.push({
                fen_before: fen_before, fen_after: fen_after,
                played_move: { san: move.san, uci: move.from + move.to + (move.promotion || '') },
                eval_before: null, best_move_before: null, pv: null,
                eval_after_played: null, classification: null, analysis_depth: 0,
                pass1_complete: false, pass2_complete: false, cpl: null
            });
        }
        console.log(`Prepared history with ${fullGameHistory.length} moves.`);

        if (pgnHeadersDisplayEl) {
            let headerText = '';
            for (const key in pgnHeaders) {
                if (pgnHeaders.hasOwnProperty(key)) {
                    headerText += `[${key} "${pgnHeaders[key]}"]\n`;
                }
            }
            pgnHeadersDisplayEl.textContent = headerText || "Aucun en-tête PGN trouvé.";
        }
        return true;

    } catch (error) {
        statusEl.textContent = `Erreur lecture PGN: ${error.message}`;
        console.error("Error loading/parsing PGN:", error);
        fullGameHistory = [];
        moveAnalysisData = [];
        if (pgnHeadersDisplayEl) pgnHeadersDisplayEl.textContent = "Erreur chargement PGN.";
        return false;
    }
}

function resetAnalysisState() {
    console.log("Resetting analysis state...");
    if (stockfish) {
        stockfish.postMessage('stop');
    }
    stockfishQueue = [];
    currentAnalysisJob = null;
    isProcessingQueue = false;
    analysisComplete = false;

    reviewGame = new Chess();
    fullGameHistory = [];
    moveAnalysisData = [];
    currentMoveIndex = -1;

    const initialFen = reviewGame.fen();
    moveAnalysisData.push({
        fen_before: null, fen_after: initialFen, played_move: null,
        eval_before: null, best_move_before: null, pv: null,
        eval_after_played: null, classification: null, analysis_depth: 0,
        pass1_complete: false, pass2_complete: false, cpl: null
    });

    if (moveListEl) buildMoveListUI();
    if (pgnHeadersDisplayEl) pgnHeadersDisplayEl.textContent = 'N/A';
    statusEl.textContent = "Position initiale.";
    analysisProgressText.textContent = "";
    clearAnalysisUI();
    clearOverlays();
    if (accuracyChart) {
        updateAccuracyChartAndStats();
    }
    if (accuracyWhiteEl) accuracyWhiteEl.textContent = "Blanc: N/A%";
    if (accuracyBlackEl) accuracyBlackEl.textContent = "Noir: N/A%";

    createBoard_Review();
    updateNavButtons();
    updateAnalysisDisplayForCurrentMove();
}

// --- UI Setup ---

function setupUI() {
    btnFirst.onclick = () => goToMove(-1);
    btnPrev.onclick = () => goToMove(currentMoveIndex - 1);
    btnNext.onclick = () => goToMove(currentMoveIndex + 1);
    btnLast.onclick = () => goToMove(fullGameHistory.length - 1);

    buildMoveListUI();

    [filterPlayedEl, filterBestEl, filterPvEl, filterThreatsEl, filterMatEl].forEach(el => { // Added filterMatEl
        if (el) el.addEventListener('change', updateBoardOverlays);
        else console.warn("A filter element is missing");
    });

    if (loadPgnButton && pgnInputArea) {
        loadPgnButton.onclick = () => {
            const pgnText = pgnInputArea.value.trim();
            if (!pgnText) {
                console.log("Resetting to initial position via Load button (empty PGN).");
                statusEl.textContent = "Réinitialisation à la position initiale...";
                resetAnalysisState();
                startFullGameAnalysis();
                return;
            }
            console.log("Load PGN button clicked.");
            statusEl.textContent = "Chargement du PGN...";
            resetAnalysisState();

            const loadedOK = loadGameAndPrepareHistory(pgnText);

            if (loadedOK && fullGameHistory.length > 0) {
                statusEl.textContent = "PGN chargé. Préparation de l'analyse...";
                buildMoveListUI();
                updateAccuracyChartAndStats();
                goToMove(-1);
                startFullGameAnalysis();
            } else if (!loadedOK) {
                resetAnalysisState();
                statusEl.textContent = "Erreur chargement PGN. Affichage position initiale.";
                startFullGameAnalysis();
            } else {
                resetAnalysisState();
                statusEl.textContent = "PGN chargé, mais aucun coup trouvé. Affichage position initiale.";
                startFullGameAnalysis();
            }
        };
    } else {
        console.warn("PGN input area or load button not found.");
    }
}

// --- Theme Application ---
function applyTheme() {
    const theme = localStorage.getItem('theme') || 'default';
    document.body.className = theme;
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initStockfish_Review();
    const loadedFromStorage = loadGameAndPrepareHistory();
    setupUI();
    initAccuracyChart();
    applyTheme();

    if (loadedFromStorage && fullGameHistory.length > 0) {
        console.log("Game loaded from localStorage for review.");
        statusEl.textContent = "Partie chargée depuis la session précédente.";
        updateAccuracyChartAndStats();
        goToMove(fullGameHistory.length - 1);
        startFullGameAnalysis();
    } else if (!loadedFromStorage && !pgnInputArea.value.trim()) {
        console.log("Starting in Analysis Board mode (initial position).");
        resetAnalysisState();
        statusEl.textContent = "Échiquier d'Analyse. Collez un PGN ou analysez la position initiale.";
        if (moveAnalysisData.length > 0 && moveAnalysisData[0].fen_after) {
            startFullGameAnalysis();
        } else {
            console.warn("Could not start analysis for initial position, data missing.");
        }
    } else {
        statusEl.textContent = "Prêt. Collez un PGN pour commencer l'analyse.";
        updateNavButtons();
        clearAnalysisUI();
        updateAccuracyChartAndStats();
    }
    setTimeout(setupBoardOverlay, 150);
    window.addEventListener('resize', () => {
        // Use a debounce mechanism if resize events fire too rapidly
        clearTimeout(window.resizeTimer);
        window.resizeTimer = setTimeout(setupBoardOverlay, 200); // Recalculate on resize end
    });
    initAccuracyChart(); // Ensure chart is initialized
});

console.log("Review page script (Interactive Play Enabled) loaded.");