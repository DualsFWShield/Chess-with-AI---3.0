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
let moveAnalysisData = []; // Parallel array for analysis results { fen_before, fen_after, played_move, eval_before, best_move_before, pv, eval_after_played, classification, analysis_depth, pass1_complete, pass2_complete }
let currentMoveIndex = -1; // -1 = initial position


let stockfish;
let isStockfishReady = false;
let stockfishQueue = [];
let currentAnalysisJob = null;
let isProcessingQueue = false;

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

// NEW: Draw an arrow with a numbered label near its midpoint
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

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initStockfish_Review();
    loadGameAndPrepareHistory();
    setupUI();
    applyTheme();
    if (fullGameHistory.length > 0) {
        goToMove(fullGameHistory.length - 1); // Go to end to trigger analysis from start
        startFullGameAnalysis();
    } else {
        statusEl.textContent = "Aucune partie chargée ou aucun coup trouvé.";
        updateNavButtons();
        clearAnalysisUI();
    }
     // Setup overlay sizing after initial layout
     setTimeout(setupBoardOverlay, 150);
     window.addEventListener('resize', setupBoardOverlay); // Handle resize
});

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
         // Send UCI commands after worker confirms listener setup (slight delay)
         setTimeout(() => {
             stockfish.postMessage('uci');
             // You can set options here if desired, e.g.:
             // stockfish.postMessage('setoption name Threads value 2'); // Example
             stockfish.postMessage('setoption name Hash value 64'); // Example
         }, 50);

        console.log("Review Stockfish worker initializing...");
    } catch (e) {
        console.error("Failed to init Review Stockfish Worker:", e);
        statusEl.textContent = "Erreur: Worker IA non supporté.";
        analysisProgressText.textContent = "Moteur Indisponible";
        isStockfishReady = false;
    }
}

function loadGameAndPrepareHistory() {
    const pgn = localStorage.getItem('reviewGamePGN');
    if (!pgn) {
        statusEl.textContent = "Erreur: Aucune partie trouvée pour l'analyse.";
        console.error("No PGN found in localStorage for review.");
        return;
    }

    const tempGame = new Chess();
    let pgnHeaders = {};
    try {
        // Load PGN with header parsing enabled
        const loaded = tempGame.load_pgn(pgn, { sloppy: true }); // Allow slightly malformed PGNs
        if (!loaded) throw new Error("chess.js couldn't load PGN.");

        pgnHeaders = tempGame.header(); // Get headers AFTER loading
        const historyVerbose = tempGame.history({ verbose: true });
        if (historyVerbose.length === 0) throw new Error("No moves in PGN");

        // --- Populate History and Analysis Data ---
        fullGameHistory = [];
        moveAnalysisData = [];
        const fenGame = new Chess(); // Instance for generating FENs

        // Initial Position (Index 0 in moveAnalysisData, corresponds to moveIndex -1)
        const initialFen = fenGame.fen();
        moveAnalysisData.push({
            fen_before: null, fen_after: initialFen, played_move: null,
            eval_before: null, best_move_before: null, pv: null,
            eval_after_played: null, classification: null, analysis_depth: 0,
            pass1_complete: false, pass2_complete: false
        });

        // Process each move
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
                pass1_complete: false, pass2_complete: false
            });
        }
        console.log(`Prepared history with ${fullGameHistory.length} moves.`);

         // Display PGN Headers
         if (pgnHeadersDisplayEl) {
            let headerText = '';
            for (const key in pgnHeaders) {
                if (pgnHeaders.hasOwnProperty(key)) {
                     headerText += `[${key} "${pgnHeaders[key]}"]\n`;
                }
            }
            pgnHeadersDisplayEl.textContent = headerText || "Aucun en-tête PGN trouvé.";
         }

    } catch (error) {
        statusEl.textContent = `Erreur lecture PGN: ${error.message}`;
        console.error("Error loading/parsing PGN:", error);
        fullGameHistory = [];
         if (pgnHeadersDisplayEl) pgnHeadersDisplayEl.textContent = "Erreur chargement PGN.";
    }
}


function setupUI() {
    // Setup buttons
    btnFirst.onclick = () => goToMove(-1);
    btnPrev.onclick = () => goToMove(currentMoveIndex - 1);
    btnNext.onclick = () => goToMove(currentMoveIndex + 1);
    btnLast.onclick = () => goToMove(fullGameHistory.length - 1);

    // Build move list
    buildMoveListUI();

    // Add filter listeners
    [filterPlayedEl, filterBestEl, filterPvEl, filterThreatsEl].forEach(el => {
        if (el) el.addEventListener('change', updateBoardOverlays);
        else console.warn("A filter element is missing");
    });
}

function buildMoveListUI() {
     if (!moveListEl) return;
     moveListEl.innerHTML = '';
     let moveNumber = 1;
     let currentLi = null;

     // Initial Position Row
     const initialLi = document.createElement('li');
     initialLi.dataset.moveIndex = -1;
     initialLi.innerHTML = `<span class="move-number">0.</span><span>Position initiale</span>`;
     initialLi.addEventListener('click', () => goToMove(-1));
     moveListEl.appendChild(initialLi);

     // Game Moves
     if (fullGameHistory.length === 0) return; // Exit if no moves

     for (let i = 0; i < fullGameHistory.length; i++) {
         const move = fullGameHistory[i];
         // Ensure move is valid before processing
         if (!move || !move.color || !move.san) {
              console.warn(`Skipping invalid move data at index ${i}`);
              continue;
         }

         if (move.color === 'w') {
             currentLi = document.createElement('li');
             currentLi.dataset.moveIndex = i; // Index of White's move
             const numSpan = `<span class="move-number">${moveNumber}.</span>`;
             const whiteSpan = document.createElement('span');
             whiteSpan.className = 'move-white';
             whiteSpan.textContent = move.san;
             whiteSpan.addEventListener('click', (e) => { e.stopPropagation(); goToMove(i); }); // Click white SAN goes to this move

             const classificationSpan = `<span class="move-classification white-class" title=""></span>`;
             currentLi.innerHTML = numSpan; // Start with number
             currentLi.appendChild(whiteSpan); // Add white move span
             currentLi.innerHTML += classificationSpan; // Add classification span
             moveListEl.appendChild(currentLi);
         } else { // Black's move
             if (currentLi) { // Add to the existing li for this move number
                 const blackSpan = document.createElement('span');
                 blackSpan.className = 'move-black';
                 blackSpan.textContent = move.san;
                 blackSpan.addEventListener('click', (e) => { e.stopPropagation(); goToMove(i); }); // Click black SAN goes to this move

                 const classificationSpan = `<span class="move-classification black-class" title=""></span>`;

                 // Append black move and its classification span
                 currentLi.appendChild(document.createTextNode(' ')); // Add space
                 currentLi.appendChild(blackSpan);
                 currentLi.innerHTML += classificationSpan;

                 currentLi.dataset.moveIndexBlack = i; // Store black's move index if needed
             } else {
                  console.warn("Black moved first? PGN Issue?");
                  // Handle error case if necessary
             }
             moveNumber++; // Increment move number after black moves
         }

         // Add click listener to the list item itself (goes to White's move index)
         if (currentLi) {
             currentLi.addEventListener('click', () => {
                 goToMove(parseInt(currentLi.dataset.moveIndex)); // Default LI click goes to white move
             });
         }
     }
}

function applyTheme() {
    const savedTheme = localStorage.getItem('chess-theme');
    document.body.classList.toggle('light-theme', savedTheme === 'light');
}


// --- Navigation ---
function goToMove(index) {
    // Bounds checking
    index = Math.max(-1, Math.min(index, fullGameHistory.length - 1));

    if (index === currentMoveIndex) return; // No change

    console.log(`Navigating to move index: ${index}`);
    currentMoveIndex = index;

    // Determine the FEN to load based on the index
    const targetFen = (index === -1)
        ? moveAnalysisData[0]?.fen_after // Initial FEN
        : moveAnalysisData[index + 1]?.fen_after; // FEN *after* the move at 'index'

    if (!targetFen) {
        console.error(`goToMove: Could not find target FEN for index ${index}`);
        statusEl.textContent = "Erreur: Impossible de charger la position.";
        if (chessboardEl) chessboardEl.innerHTML = '<p style="color: red; padding: 20px;">Erreur chargement FEN</p>';
        return;
    }

    console.log(`goToMove: Loading FEN: ${targetFen}`);
    try {
        // Use load instead of load_pgn for FEN strings
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

    // Update all UI components for the new state
    createBoard_Review(); // Redraw board is crucial
    updateStatus();
    updateMoveListHighlight();
    updateNavButtons();
    updateAnalysisDisplayForCurrentMove();
    updateBoardOverlays(); // Update arrows/highlights
}


function updateStatus() {
    let statusText = "";
     if (currentMoveIndex === -1) {
         statusText = "Position initiale";
     } else if (currentMoveIndex < fullGameHistory.length) {
        const move = fullGameHistory[currentMoveIndex];
        // Ensure move object is valid
        if(move && move.color && move.san) {
            const moveNumber = Math.floor(currentMoveIndex / 2) + 1;
            const turnIndicator = move.color === 'w' ? "." : "...";
            statusText = `Après ${moveNumber}${turnIndicator} ${move.san}`;
        } else {
             statusText = `Coup ${currentMoveIndex + 1} (Données invalides)`;
             console.warn("Invalid move data at index", currentMoveIndex);
        }
     } else {
         statusText = "Fin de partie"; // Should technically be covered by index check
     }
    statusEl.textContent = statusText;
}

function getOverallAnalysisProgress() {
    const totalMoves = fullGameHistory.length;
    if (totalMoves === 0) return ""; // No analysis needed

    // Count analysis progress based on the state *after* the move (indices 1 to totalMoves+1)
    const analysisEntries = moveAnalysisData.slice(1); // Exclude initial pos data for move count
    if(analysisEntries.length !== totalMoves) {
        console.warn("Analysis data length mismatch!");
        // return "Erreur Analyse";
    }

    const pass1DoneCount = analysisEntries.filter(d => d && d.pass1_complete).length;
    const pass2DoneCount = analysisEntries.filter(d => d && d.pass2_complete).length;

    if (pass2DoneCount === totalMoves) return "Analyse Profonde Terminée";
    if (pass1DoneCount === totalMoves) return `Analyse Rapide Terminée, Profonde: ${pass2DoneCount}/${totalMoves}`;
    if (isProcessingQueue && currentAnalysisJob) {
         const currentJobDisplayIndex = currentAnalysisJob.moveIndex + 1; // Index being worked on
         const passNum = currentAnalysisJob.isPass1 ? 1 : 2;
         return `Analyse (P${passNum}): ${currentJobDisplayIndex}/${totalMoves}...`;
    }
    return `Analyse Rapide: ${pass1DoneCount}/${totalMoves}`;
}


function updateMoveListHighlight() {
    moveListEl?.querySelectorAll('li').forEach(li => {
         li.classList.remove('current-move');
         const liIndex = parseInt(li.dataset.moveIndex); // Index of white move or -1 for initial

         if (liIndex === currentMoveIndex) {
              li.classList.add('current-move');
              li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
         }
         // Highlight black move span if that's the current index
         const blackIndexStr = li.dataset.moveIndexBlack;
         if (blackIndexStr) {
             const liIndexBlack = parseInt(blackIndexStr);
              if (liIndexBlack === currentMoveIndex) {
                  li.classList.add('current-move'); // Highlight the whole LI
                  li.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
         }
    });
}

function updateNavButtons() {
    if (!btnFirst) return; // Ensure buttons exist
    const numMoves = fullGameHistory.length;
    btnFirst.disabled = currentMoveIndex <= -1;
    btnPrev.disabled = currentMoveIndex <= -1;
    btnNext.disabled = currentMoveIndex >= numMoves - 1;
    btnLast.disabled = currentMoveIndex >= numMoves - 1;
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
    chessboardEl.innerHTML = ''; // Clear previous board
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
                } else { // png mode
                    const img = document.createElement('img');
                    const colorPrefix = pieceInfo.color === 'w' ? 'w' : 'b';
                    const pieceCode = pieceInfo.type; // Use 'p', 'n', 'b', etc. directly
                    const filename = `pieces/${colorPrefix}${pieceCode}.png`;
                    img.src = filename;
                    img.alt = myPieceFormat;
                    img.classList.add("piece");
                    img.draggable = false;
                     img.onerror = () => { console.warn(`Image not found: ${filename}`); img.style.display='none'; }; // Handle missing images
                    square.appendChild(img);
                }
            }

             // Highlight the move that LED to this position
             if (currentMoveIndex >= 0) {
                 const lastMovePlayed = fullGameHistory[currentMoveIndex];
                 if (lastMovePlayed && (alg === lastMovePlayed.from || alg === lastMovePlayed.to)) {
                     square.classList.add('last-move');
                 }
             }

            // Add labels
             if (colIndex === 0 || rowIndex === 7) {
                 const label = document.createElement('span');
                 label.className = 'square-label';
                 if (colIndex === 0) label.textContent = `${8 - rowIndex}`;
                 if (rowIndex === 7) label.textContent += files[colIndex];
                 if (colIndex === 0 && rowIndex === 7) label.textContent = `${files[colIndex]}${8 - rowIndex}`;
                 if(label.textContent) square.appendChild(label);
             }

            boardFragment.appendChild(square);
        }
    }
    chessboardEl.appendChild(boardFragment);
    console.log("createBoard_Review: Board rendered.");

    // Highlight king in check
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
    // Setup overlay AFTER board DOM is complete
     setupBoardOverlay();
}

// --- Stockfish Analysis Orchestration ---

function startFullGameAnalysis() {
    if (!isStockfishReady) {
        console.warn("Stockfish not ready, delaying analysis start.");
        analysisProgressText.textContent = "Moteur en attente...";
        setTimeout(startFullGameAnalysis, 1000);
        return;
    }
     if (isProcessingQueue || stockfishQueue.length > 0) {
         console.log("Analysis already in progress or queued.");
         return; // Avoid restarting if already running
     }
    console.log("Starting full game analysis...");
    analysisProgressText.textContent = "Préparation de l'analyse...";
    stockfishQueue = []; // Clear queue

    // Queue Pass 1 jobs (evaluate position BEFORE each move)
    for (let i = 0; i < moveAnalysisData.length; i++) { // Analyze all positions (incl. initial)
        const analysisEntry = moveAnalysisData[i];
        if (analysisEntry && !analysisEntry.pass1_complete) {
            stockfishQueue.push({
                analysisDataIndex: i, // Index in moveAnalysisData
                fen: analysisEntry.fen_after, // FEN of the position to evaluate
                depth: DEPTH_PASS_1,
                purpose: 'eval_position', // Evaluate this position
                isPass1: true
            });
        }
    }

     // Queue Pass 2 jobs (optional, can be interleaved or done after Pass 1)
     // For simplicity, let's focus on getting Pass 1 working reliably first.
     // Pass 2 would re-queue similar jobs with DEPTH_PASS_2.

    if (!isProcessingQueue) {
        processStockfishQueue();
    } else {
        console.log("Queue populated, waiting for current job to finish.");
    }
}


function processStockfishQueue() {
    if (stockfishQueue.length === 0) {
        console.log("Stockfish queue empty.");
        isProcessingQueue = false;
         analysisProgressText.textContent = getOverallAnalysisProgress(); // Update final status
         // Optionally start Pass 2 here if needed
        return;
    }

     if (isProcessingQueue) {
          console.log("Still processing previous job, queue will continue.");
          return; // Don't start a new job if one is running
     }

    isProcessingQueue = true;
    currentAnalysisJob = stockfishQueue.shift();

    // Update progress text
    const totalJobs = moveAnalysisData.length; // Total positions to analyze
    const currentJobNum = totalJobs - stockfishQueue.length;
    const passNum = currentAnalysisJob.isPass1 ? 1 : 2;
    analysisProgressText.textContent = `Analyse (P${passNum}): Position ${currentJobNum}/${totalJobs} (Prof ${currentAnalysisJob.depth})...`;

    console.log(`Requesting analysis: Idx=${currentAnalysisJob.analysisDataIndex}, Depth=${currentAnalysisJob.depth}, Fen=${currentAnalysisJob.fen.substring(0,20)}...`);

    // Ensure Stockfish is stopped and ready for a new command
    stockfish.postMessage('stop');
    stockfish.postMessage('ucinewgame'); // Reset state for safety
    stockfish.postMessage(`position fen ${currentAnalysisJob.fen}`);
    stockfish.postMessage(`go depth ${currentAnalysisJob.depth}`);
}

function handleStockfishMessage_Review(event) {
    const message = event.data;

    // --- UCI Handshake ---
    if (message === 'uciok') {
        console.log("Review UCI OK");
        stockfish.postMessage('isready');
        return;
    }
    if (message === 'readyok') {
        isStockfishReady = true;
        console.log("Review Stockfish ready.");
        analysisProgressText.textContent = "Moteur Prêt.";
        // If analysis was queued while waiting, start it now
        if (!isProcessingQueue && stockfishQueue.length > 0) {
            processStockfishQueue();
        }
        return;
    }

    // --- Analysis Results ---
    if (!currentAnalysisJob) return; // Ignore messages if no job is active

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
        // Store temporary results (optional, for progressive updates)
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
            // Finalize analysis data using last info line or bestmove command
            dataEntry.eval_before = dataEntry.eval_before_temp ?? currentEval ?? null;
            dataEntry.best_move_before = dataEntry.best_move_before_temp ?? finalBestMove;
             // Ensure PV is stored, even if only the best move if PV wasn't in last info
            dataEntry.pv = dataEntry.pv_temp ?? (finalBestMove && finalBestMove !== '(none)' ? [finalBestMove] : null);
            dataEntry.analysis_depth = currentAnalysisJob.depth;

            if (currentAnalysisJob.isPass1) dataEntry.pass1_complete = true;
            else dataEntry.pass2_complete = true;

            // Clean up temporary fields
            delete dataEntry.eval_before_temp;
            delete dataEntry.best_move_before_temp;
            delete dataEntry.pv_temp;

            // --- Classify the PREVIOUS move (the one that LED to this analyzed position) ---
            const moveIndexToClassify = analysisIndex - 1;
            if (moveIndexToClassify >= 0) {
                classifyMove(moveIndexToClassify);
            }

            // Update UI if the user is currently viewing this move/position
            if (currentMoveIndex === moveIndexToClassify) {
                 updateAnalysisDisplayForCurrentMove();
                 updateBoardOverlays(); // Update arrows reflecting this new analysis
            } else if (currentMoveIndex === -1 && analysisIndex === 0) {
                 // Update display if viewing initial position and its analysis finished
                 updateAnalysisDisplayForCurrentMove();
                 updateBoardOverlays();
            }
        } else {
            console.error(`Data entry not found for analysis index ${analysisIndex}`);
        }

        // --- Continue Queue ---
        currentAnalysisJob = null;
        isProcessingQueue = false;
        processStockfishQueue(); // Process next item
    }
}

// --- Move Classification ---
function classifyMove(moveIndex) {
    if (moveIndex < 0 || moveIndex >= fullGameHistory.length) return;

    const dataIndexBefore = moveIndex;     // Analysis data for the position *before* the move
    const dataIndexAfter = moveIndex + 1; // Analysis data for the position *after* the move

    const analysisBefore = moveAnalysisData[dataIndexBefore];
    const analysisAfter = moveAnalysisData[dataIndexAfter];
    const playedMove = fullGameHistory[moveIndex];

    // Ensure we have the evaluations needed
    const evalBeforeMove = analysisBefore?.eval_before; // Eval of position BEFORE playing move 'moveIndex'
    const evalAfterPlayed = analysisAfter?.eval_before; // Eval of position AFTER playing move 'moveIndex'

    if (evalBeforeMove === null || evalAfterPlayed === null) {
        console.log(`Classification deferred for move ${moveIndex + 1}: missing eval data.`);
         // Ensure classification is marked as null if data missing
         if (moveAnalysisData[dataIndexAfter]) moveAnalysisData[dataIndexAfter].classification = null;
        return;
    }

    const cpEquivalentMate = 10000;
    let cpBefore = 0;
    let cpAfterPlayed = 0;
    const turnMultiplier = (playedMove.color === 'w') ? 1 : -1;

    // Convert evalBeforeMove to centipawns from the player's perspective
    if (typeof evalBeforeMove === 'string' && evalBeforeMove.startsWith('M')) {
        const mateVal = parseInt(evalBeforeMove.substring(1));
        cpBefore = (mateVal > 0 ? cpEquivalentMate : -cpEquivalentMate); // Mate score is absolute
    } else {
        cpBefore = evalBeforeMove * 100; // Already in pawn units
    }

    // Convert evalAfterPlayed to centipawns from the player's perspective
     if (typeof evalAfterPlayed === 'string' && evalAfterPlayed.startsWith('M')) {
        const mateVal = parseInt(evalAfterPlayed.substring(1));
        cpAfterPlayed = (mateVal > 0 ? cpEquivalentMate : -cpEquivalentMate);
    } else {
        cpAfterPlayed = evalAfterPlayed * 100;
    }

    // Calculate centipawn loss relative to the player who moved
    const centipawnLoss = Math.round((cpBefore * turnMultiplier) - (cpAfterPlayed * turnMultiplier));

    let classification = "Bon"; // Default

    // Refined Classification Logic
    const bestMoveBefore = analysisBefore.best_move_before;
    const playedMoveUCI = playedMove.from + playedMove.to + (playedMove.promotion || '');

    // Check for Blunder/Mistake/Inaccuracy based on CPL
    if (centipawnLoss >= THRESHOLD_BLUNDER) {
        classification = "Gaffe";
    } else if (centipawnLoss >= THRESHOLD_MISTAKE) {
        classification = "Erreur";
    } else if (centipawnLoss >= THRESHOLD_INACCURACY) {
        classification = "Imprécision";
    } else if (bestMoveBefore && playedMoveUCI === bestMoveBefore) {
         // If CPL is low AND it matches the engine's top choice
         classification = "Meilleur";
     } else if (centipawnLoss <= 5) {
          // If CPL is very low, but maybe not the absolute best found, still good.
          classification = "Excellent"; // Could refine this further
     }
      // Note: Identifying "Brilliant" requires much more complex logic (e.g., checking sacrifices)


    // Store the classification on the state *after* the move was made
    if (moveAnalysisData[dataIndexAfter]) {
         moveAnalysisData[dataIndexAfter].classification = classification;
    } else {
         console.error("Cannot store classification, data entry missing for index", dataIndexAfter);
         return; // Exit if cannot store
    }

    // Update the classification icon in the move list UI
    updateMoveListClassification(moveIndex, classification);

    console.log(`Classified move ${moveIndex + 1} (${playedMove.san}): ${classification} (CPL: ${centipawnLoss})`);
}


// --- UI Update Functions ---

function updateMoveListClassification(moveIndex, classificationText) {
     if (!moveListEl || moveIndex < 0 || moveIndex >= fullGameHistory.length) return;

     const move = fullGameHistory[moveIndex];
     if (!move) return;

     // Find the LI containing this move (can be white or black)
     // White moves define the LI index
     const liIndex = Math.floor(moveIndex / 2) * 2;
     const liElement = moveListEl.querySelector(`li[data-move-index="${liIndex}"]`);
     if (!liElement) return;

     // Find the correct classification span (white or black)
     const targetClass = (move.color === 'w') ? '.white-class' : '.black-class';
     const spanElement = liElement.querySelector(targetClass);
     if (!spanElement) return;

     // Set icon based on classification text
     let iconHtml = '';
     switch(classificationText) {
         case "Meilleur": iconHtml = '<i class="fas fa-star" style="color: #FFD700;"></i>'; break; // Gold
         case "Excellent": iconHtml = '<i class="fas fa-check-double" style="color: #76FF03;"></i>'; break; // Bright Green
         case "Bon": iconHtml = '<i class="fas fa-check" style="color: #B0BEC5;"></i>'; break; // Grey check
         case "Imprécision": iconHtml = '<i class="fas fa-exclamation-circle" style="color: #FFC107;"></i>'; break; // Amber/Orange
         case "Erreur": iconHtml = '<i class="fas fa-times" style="color: #FF7043;"></i>'; break; // Orange-Red cross
         case "Gaffe": iconHtml = '<i class="fas fa-bomb" style="color: #D32F2F;"></i>'; break; // Dark Red bomb
         default: iconHtml = ''; // No icon if null or unknown
     }
     spanElement.innerHTML = iconHtml;
     spanElement.title = classificationText || ''; // Set tooltip text
}

function updateGoodStrategyDisplay() {
    const strategyEl = document.getElementById('review-good-strategy');
    if (!strategyEl) return;
    let strategyText = "N/A";
    // Use the analysis from the position BEFORE the last move if available
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
    const classificationOfPrevMove = analysisResult.classification; // Classification is stored *after* the move

    // --- Update Score Text & Bar ---
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

    // --- Update Best Move Display ---
    if (bestMoveEl) {
        if (bestMoveToShow && bestMoveToShow !== '(none)' && bestMoveToShow !== '0000') {
            try {
                const tempGame = new Chess(reviewGame.fen()); // Use current FEN
                const moveObj = tempGame.move(bestMoveToShow, { sloppy: true });
                bestMoveEl.textContent = moveObj ? moveObj.san : bestMoveToShow;
            } catch (e) { bestMoveEl.textContent = bestMoveToShow; }
        } else {
            bestMoveEl.textContent = (evalToShow === null && (analysisResult.pass1_complete || analysisResult.pass2_complete)) ? "..." : "N/A";
        }
    }

    // --- Update Played Move Info (Classification of the move that LED here) ---
     if (playedMoveInfoEl) {
         if(currentMoveIndex >= 0) { // Only show if not initial position
             if (classificationOfPrevMove) {
                 // Find the icon HTML again for consistency
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
                  playedMoveInfoEl.textContent = ""; // Analysis not run yet
             }
         } else {
              playedMoveInfoEl.textContent = ""; // Initial position
         }
     }

    // --- Update Good Strategy Display ---
    updateGoodStrategyDisplay();
}


function clearAnalysisUI() {
     scoreEl.textContent = "N/A";
     if(bestMoveEl) bestMoveEl.textContent = "N/A";
     if(playedMoveInfoEl) playedMoveInfoEl.textContent = "";
     if (whiteProgressEl) whiteProgressEl.style.width = `50%`;
     if (blackProgressEl) blackProgressEl.style.width = `50%`;
}

// --- Board Overlay & Filters ---

function setupBoardOverlay() {
     if (!chessboardEl || !overlaySvg) return;
     // Use offsetWidth/offsetHeight as they include borders/padding if box-sizing is border-box
     boardRect = {
         left: chessboardEl.offsetLeft,
         top: chessboardEl.offsetTop,
         width: chessboardEl.offsetWidth,
         height: chessboardEl.offsetHeight
     };

     if (boardRect.width <= 0 || boardRect.height <= 0) {
          console.warn("Board rect has zero size, cannot calculate square size.");
          // Try again later?
          setTimeout(setupBoardOverlay, 200);
          return;
     }

     squareSize = boardRect.width / 8;

     // Position and size the SVG overlay precisely over the board grid
     // Assumes board-wrapper padding was handled in HTML/CSS overlay style
     overlaySvg.setAttribute('viewBox', `0 0 ${boardRect.width} ${boardRect.height}`);
     overlaySvg.style.width = `${boardRect.width}px`;
     overlaySvg.style.height = `${boardRect.height}px`;
     // Reset position just in case it wasn't set correctly by CSS
     overlaySvg.style.left = `0px`; // Relative to board-wrapper
     overlaySvg.style.top = `0px`; // Relative to board-wrapper

     console.log(`Overlay setup: Size=${boardRect.width}x${boardRect.height}, SquareSize=${squareSize}`);
     updateBoardOverlays(); // Redraw overlays after resize/setup
}

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

// Draws an arrow on the SVG overlay
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
     // circle.setAttribute('stroke', 'rgba(0,0,0,0.1)'); // Optional border
     // circle.setAttribute('stroke-width', '1');
     overlaySvg.appendChild(circle);
}

// --- Update Overlays Based on Filters ---
function updateBoardOverlays() {
     if (!overlaySvg) return; // Don't try to draw if SVG not ready
     clearOverlays();

     const analysisIndex = currentMoveIndex + 1;
     const currentAnalysis = moveAnalysisData[analysisIndex]; // Analysis of the *current* position
     const previousAnalysis = (currentMoveIndex >= 0) ? moveAnalysisData[currentMoveIndex] : null; // Analysis of pos *before* last played move
     const playedMove = (currentMoveIndex >= 0) ? fullGameHistory[currentMoveIndex] : null; // Last played move

     // 1. Played Move Arrow
     if (filterPlayedEl?.checked && playedMove) {
         drawArrow(playedMove.from, playedMove.to, ARROW_COLORS.played, 'played', ARROW_THICKNESS.played);
     }

     // 2. Best Move Arrow (Best move FROM the position BEFORE the last played move)
      if (filterBestEl?.checked && previousAnalysis?.best_move_before) {
           const bestUci = previousAnalysis.best_move_before;
           if (bestUci && bestUci !== '(none)' && bestUci !== '0000') {
                const from = bestUci.substring(0, 2);
                const to = bestUci.substring(2, 4);
                // Don't draw if it's the same as the played move
                const playedUci = playedMove ? playedMove.from + playedMove.to + (playedMove.promotion || '') : null;
                if (bestUci !== playedUci) {
                    drawArrow(from, to, ARROW_COLORS.best, 'best', ARROW_THICKNESS.best);
                }
           }
      }

     // 3. Principal Variation (PV) Arrows (from CURRENT position)
     if (filterPvEl?.checked && currentAnalysis?.pv && currentAnalysis.pv.length > 0) {
         const tempGamePV = new Chess(reviewGame.fen()); // Start from current position
         for (let i = 0; i < Math.min(currentAnalysis.pv.length, ARROW_COLORS.pv.length); i++) {
             const uciMove = currentAnalysis.pv[i];
             const from = uciMove.substring(0, 2);
             const to = uciMove.substring(2, 4);
             const moveResult = tempGamePV.move(uciMove, { sloppy: true });
             if (moveResult) {
                  drawArrow(from, to, ARROW_COLORS.pv[i], `pv-${i}`, ARROW_THICKNESS.pv[i]);
             } else {
                  break; // Stop if PV is invalid
             }
         }
     }

     // 4. Capture Moves ("Piece en prise")
     if (filterThreatsEl?.checked) {
         // Instead of generating attacked squares, iterate over the board
         const board = reviewGame.board();
         for (let r = 0; r < 8; r++) {
             for (let c = 0; c < 8; c++) {
                 const piece = board[r]?.[c];
                 if (piece) {
                     const fromAlg = files[c] + (8 - r);
                     // Get capturing moves for the piece
                     const moves = reviewGame.moves({ square: fromAlg, verbose: true });
                     const captureMoves = moves.filter(m => m.captured);
                     if (captureMoves.length > 0) {
                         // Highlight the piece that can capture
                         highlightSquare(fromAlg, ARROW_COLORS.threat, squareSize * 0.25);
                         // Draw numbered arrows for up to 4 capture moves
                         captureMoves.slice(0, 4).forEach((move, index) => {
                             drawArrowWithNumber(fromAlg, move.to, ARROW_COLORS.threat, `capture-${fromAlg}-${move.to}-${index}`, ARROW_THICKNESS.threat, index + 1);
                         });
                     }
                 }
             }
         }
     }
}

// Helper to get attacked squares (simplified)
function getSquaresAttackedBy(fen, attackingColor) {
    const attacked = new Set();
    const board = new Chess(fen);
    const squares = files.flatMap(f => Array.from({length: 8}, (_, i) => f + (i + 1))); // a1, a2, ..., h8

    for (const sq of squares) {
        const piece = board.get(sq);
        if (piece && piece.color === attackingColor) {
            // Generate legal moves for the piece from this square
            // NOTE: board.moves() is the only reliable public way, but it only gives
            // moves for the *current* player according to the FEN's turn field.
            // This is a limitation. A true attack map needs internal logic or a modified chess.js.
            // Workaround: Temporarily flip the turn in the FEN for calculation? Risky.
            // Best available public method: use board.moves if it's the attacker's turn.
            if(board.turn() === attackingColor) {
                 const legalMoves = board.moves({ square: sq, verbose: true });
                 legalMoves.forEach(move => attacked.add(move.to));
            }
             // Even if not attacker's turn, pawns still attack diagonally.
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
             // For other pieces, we ideally need a function like `isAttacked(square, attackerColor)`
             // which chess.js doesn't directly expose easily for *all* squares.
             // This 'threats' filter will be incomplete without modifying chess.js or using a different library.
        }
    }
    return attacked;
}


console.log("Review page script (Advanced V2) loaded.");