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
    threat: 'rgba(200, 40, 40, 0.6)'      // Red for capture indication
};
const ARROW_THICKNESS = {
    played: 5,
    best: 7, // Thicker best move arrow
    pv: [5, 4, 3], // Decreasing thickness for PV
    threat: 5 // Thickness for capture arrows
};

// Interactive Play Globals
let selectedSquareAlg_Review = null; // For interactive move selection
let promotionCallback_Review = null; // Callback for interactive promotion

// --- Helper Functions (Defined Early) ---

function algToPixel(alg) {
    if (!boardRect || squareSize <= 0 || !alg || alg.length < 2) return null;
    const col = files.indexOf(alg[0]);
    const row = 8 - parseInt(alg[1]);
    if (col === -1 || isNaN(row) || row < 0 || row > 7) return null;
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
         marker.setAttribute('refX', '8'); // Position arrow tip slightly before end of line
         marker.setAttribute('refY', '5');
         marker.setAttribute('markerUnits', 'strokeWidth');
         marker.setAttribute('markerWidth', thickness * 0.8); // Make arrowhead proportional to thickness
         marker.setAttribute('markerHeight', thickness * 0.8);
         marker.setAttribute('orient', 'auto-start-reverse'); // Changed to auto-start-reverse

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
    line.setAttribute('y2', end.y);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', thickness);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', `url(#${arrowId})`); // Apply marker

    overlaySvg.appendChild(line);
}

function drawArrowWithNumber(fromAlg, toAlg, color = 'rgba(0, 0, 0, 0.5)', id = null, thickness = 6, labelNumber = 1) {
    if (!overlaySvg || !boardRect || squareSize <= 0) return;
    const start = algToPixel(fromAlg);
    const end = algToPixel(toAlg);
    if (!start || !end) {
         console.warn(`Cannot draw arrow, invalid coords: ${fromAlg} -> ${toAlg}`);
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
         marker.setAttribute('refX', '8');
         marker.setAttribute('refY', '5');
         marker.setAttribute('markerUnits', 'strokeWidth');
         marker.setAttribute('markerWidth', thickness * 0.8);
         marker.setAttribute('markerHeight', thickness * 0.8);
         marker.setAttribute('orient', 'auto-start-reverse');
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
    line.setAttribute('y2', end.y);
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', thickness);
    line.setAttribute('stroke-linecap', 'round');
    line.setAttribute('marker-end', `url(#${arrowId})`);
    overlaySvg.appendChild(line);
    // Compute midpoint for the number label
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const text = document.createElementNS(svgNs, 'text');
    text.setAttribute('x', midX);
    text.setAttribute('y', midY);
    text.setAttribute('fill', color);
    text.setAttribute('font-size', thickness * 1.5);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.textContent = labelNumber;
    overlaySvg.appendChild(text);
}

function getSquaresAttackedBy(fen, attackingColor) {
    const attacked = new Set();
    const board = new Chess(fen);
    const squares = files.flatMap(f => Array.from({length: 8}, (_, i) => f + (i + 1))); // a1, a2, ..., h8

    for (const sq of squares) {
        const piece = board.get(sq);
        if (piece && piece.color === attackingColor) {
            if(board.turn() === attackingColor) {
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
     if(bestMoveEl) bestMoveEl.textContent = "N/A";
     if(playedMoveInfoEl) playedMoveInfoEl.textContent = "";
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
        if(move && move.color && move.san) {
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
    if(analysisEntries.length !== totalMoves) {
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
     boardRect = {
         left: chessboardEl.offsetLeft,
         top: chessboardEl.offsetTop,
         width: chessboardEl.offsetWidth,
         height: chessboardEl.offsetHeight
     };

     if (boardRect.width <= 0 || boardRect.height <= 0) {
          console.warn("Board rect has zero size, cannot calculate square size.");
          setTimeout(setupBoardOverlay, 200);
          return;
     }

     squareSize = boardRect.width / 8;

     overlaySvg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
     overlaySvg.style.width = `${boardRect.width}px`;
     overlaySvg.style.height = `${boardRect.height}px`;
     overlaySvg.style.left = `0px`;
     overlaySvg.style.top = `0px`;

     console.log(`Overlay setup: Size=${boardRect.width}x${boardRect.height}, SquareSize=${squareSize}`);
     updateBoardOverlays();
}

function updateBoardOverlays() {
     if (!overlaySvg) return;
     clearOverlays();

     const analysisIndex = currentMoveIndex + 1;
     const currentAnalysis = moveAnalysisData[analysisIndex];
     const previousAnalysis = (currentMoveIndex >= 0) ? moveAnalysisData[currentMoveIndex] : null;
     const playedMove = (currentMoveIndex >= 0) ? fullGameHistory[currentMoveIndex] : null;

     if (filterPlayedEl?.checked && playedMove) {
         drawArrow(playedMove.from, playedMove.to, ARROW_COLORS.played, 'played', ARROW_THICKNESS.played);
     }

     if (filterBestEl?.checked && previousAnalysis?.best_move_before) {
           const bestUci = previousAnalysis.best_move_before;
           if (bestUci && bestUci !== '(none)' && bestUci !== '0000') {
                const from = bestUci.substring(0, 2);
                const to = bestUci.substring(2, 4);
                const playedUci = playedMove ? playedMove.from + playedMove.to + (playedMove.promotion || '') : null;
                if (bestUci !== playedUci) {
                    drawArrow(from, to, ARROW_COLORS.best, 'best', ARROW_THICKNESS.best);
                }
           }
      }

     if (filterPvEl?.checked && currentAnalysis?.pv && currentAnalysis.pv.length > 0) {
         const tempGamePV = new Chess(reviewGame.fen());
         for (let i = 0; i < Math.min(currentAnalysis.pv.length, ARROW_COLORS.pv.length); i++) {
             const uciMove = currentAnalysis.pv[i];
             const from = uciMove.substring(0, 2);
             const to = uciMove.substring(2, 4);
             const moveResult = tempGamePV.move(uciMove, { sloppy: true });
             if (moveResult) {
                  drawArrow(from, to, ARROW_COLORS.pv[i], `pv-${i}`, ARROW_THICKNESS.pv[i]);
             } else {
                  break;
             }
         }
     }

     if (filterThreatsEl?.checked) {
         const board = reviewGame.board();
         for (let r = 0; r < 8; r++) {
             for (let c = 0; c < 8; c++) {
                 const piece = board[r]?.[c];
                 if (piece) {
                     const fromAlg = files[c] + (8 - r);
                     const moves = reviewGame.moves({ square: fromAlg, verbose: true });
                     const captureMoves = moves.filter(m => m.captured);
                     if (captureMoves.length > 0) {
                         highlightSquare(fromAlg, ARROW_COLORS.threat, squareSize * 0.25);
                         captureMoves.slice(0, 4).forEach((move, index) => {
                             drawArrowWithNumber(fromAlg, move.to, ARROW_COLORS.threat, `capture-${fromAlg}-${move.to}-${index}`, ARROW_THICKNESS.threat, index + 1);
                         });
                     }
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
         if(!boardData) throw new Error("reviewGame.board() returned invalid data");
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
                     img.onerror = () => { console.warn(`Image not found: ${filename}`); img.style.display='none'; };
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
                 if(label.textContent) square.appendChild(label);
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
    } catch(e) { console.error("Error highlighting check:", e); }
     setupBoardOverlay();

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
     switch(classificationText) {
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
    let strategyText = "N/A";
    if (currentMoveIndex >= 0) {
         const analysisPrev = moveAnalysisData[currentMoveIndex];
         if (analysisPrev?.pv && analysisPrev.pv.length > 0 && analysisPrev.pv.length <= 4) {
              const tempGame = new Chess(analysisPrev.fen_after);
              const movesSAN = [];
              for (const moveUci of analysisPrev.pv) {
                  const moveObj = tempGame.move(moveUci, { sloppy: true });
                  if (!moveObj) break;
                  movesSAN.push(moveObj.san);
              }
              if (movesSAN.length > 0) {
                  strategyText = movesSAN.join(' - ');
              }
         }
    }
    strategyEl.querySelector('span').textContent = strategyText;
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
         if(currentMoveIndex >= 0) {
             if (classificationOfPrevMove) {
                 let iconHtml = '';
                 switch(classificationOfPrevMove) {
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
    if (cpl === null || cpl === undefined) return null;
    const loss = Math.max(0, cpl);
    const accuracy = 100 * Math.exp(-loss / 350);
    return Math.max(0, Math.min(100, accuracy));
}

function calculateAndDrawAccuracy() {
    if (!accuracyChart || fullGameHistory.length === 0) return;

    accuracyData = { white: [], black: [], labels: [] };
    let whiteTotalAccuracy = 0;
    let whiteMoveCount = 0;
    let blackTotalAccuracy = 0;
    let blackMoveCount = 0;

    for (let i = 0; i < fullGameHistory.length; i++) {
        const move = fullGameHistory[i];
        const analysis = moveAnalysisData[i + 1];
        const moveNumber = Math.floor(i / 2) + 1;
        const label = `${moveNumber}${move.color === 'w' ? '.' : '...'}`;
        accuracyData.labels.push(label);

        const accuracy = calculateSingleMoveAccuracy(analysis?.cpl);

        if (move.color === 'w') {
            accuracyData.white.push(accuracy);
            accuracyData.black.push(NaN);
            if (accuracy !== null) {
                whiteTotalAccuracy += accuracy;
                whiteMoveCount++;
            }
        } else {
            accuracyData.black.push(accuracy);
            accuracyData.white.push(NaN);
            if (accuracy !== null) {
                blackTotalAccuracy += accuracy;
                blackMoveCount++;
            }
        }
    }

    const avgWhiteAccuracy = whiteMoveCount > 0 ? (whiteTotalAccuracy / whiteMoveCount) : 0;
    const avgBlackAccuracy = blackMoveCount > 0 ? (blackTotalAccuracy / blackMoveCount) : 0;

    if (accuracyWhiteEl) accuracyWhiteEl.textContent = `Blanc: ${avgWhiteAccuracy.toFixed(1)}%`;
    if (accuracyBlackEl) accuracyBlackEl.textContent = `Noir: ${avgBlackAccuracy.toFixed(1)}%`;

    accuracyChart.data.labels = accuracyData.labels;
    accuracyChart.data.datasets[0].data = accuracyData.white;
    accuracyChart.data.datasets[1].data = accuracyData.black;
    accuracyChart.update();

    console.log(`Accuracy calculated: White Avg ${avgWhiteAccuracy.toFixed(1)}%, Black Avg ${avgBlackAccuracy.toFixed(1)}%`);
}

function initAccuracyChart() {
    if (!accuracyChartCanvas) {
        console.error("Accuracy chart canvas not found.");
        return;
    }
    const ctx = accuracyChartCanvas.getContext('2d');
    accuracyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Précision Blanc',
                    data: [],
                    borderColor: 'rgba(230, 230, 230, 0.8)',
                    backgroundColor: 'rgba(230, 230, 230, 0.1)',
                    borderWidth: 2,
                    tension: 0.1,
                    spanGaps: true,
                    pointRadius: 3,
                    pointHoverRadius: 5
                },
                {
                    label: 'Précision Noir',
                    data: [],
                    borderColor: 'rgba(60, 60, 60, 0.8)',
                    backgroundColor: 'rgba(60, 60, 60, 0.1)',
                    borderWidth: 2,
                    tension: 0.1,
                    spanGaps: true,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Précision (%)' },
                    ticks: { color: '#aaa' },
                    grid: { color: 'rgba(170, 170, 170, 0.2)' }
                },
                x: {
                    title: { display: true, text: 'Coup' },
                    ticks: {
                         color: '#aaa',
                         maxRotation: 0,
                         autoSkip: true,
                         maxTicksLimit: 15
                    },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#ccc' }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null && !isNaN(context.parsed.y)) {
                                label += context.parsed.y.toFixed(1) + '%';
                            } else {
                                label = '';
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
    console.log("Accuracy chart initialized.");
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
             calculateAndDrawAccuracy();
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

    console.log(`Requesting analysis: Idx=${currentAnalysisJob.analysisDataIndex}, Depth=${currentAnalysisJob.depth}, Fen=${currentAnalysisJob.fen.substring(0,20)}...`);

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
         if(dataEntry) {
             if(currentEval !== null) dataEntry.eval_before_temp = currentEval;
             if(currentBestMove !== null) dataEntry.best_move_before_temp = currentBestMove;
             if(currentPv !== null) dataEntry.pv_temp = currentPv;
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
        calculateAndDrawAccuracy();
    }
    if(accuracyWhiteEl) accuracyWhiteEl.textContent = "Blanc: N/A%";
    if(accuracyBlackEl) accuracyBlackEl.textContent = "Noir: N/A%";

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

    [filterPlayedEl, filterBestEl, filterPvEl, filterThreatsEl].forEach(el => {
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
                calculateAndDrawAccuracy();
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
        calculateAndDrawAccuracy();
    }
     setTimeout(setupBoardOverlay, 150);
     window.addEventListener('resize', setupBoardOverlay);
});

console.log("Review page script (Interactive Play Enabled) loaded.");