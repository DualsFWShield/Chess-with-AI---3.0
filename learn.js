import { Chess } from './chess.js';

// --- DOM Elements ---
const chessboardEl = document.getElementById('chessboard');
const lessonTitleEl = document.getElementById('lesson-title');
const lessonObjectiveEl = document.getElementById('lesson-objective');
const lessonExplanationEl = document.getElementById('lesson-explanation');
const lessonFeedbackEl = document.getElementById('lesson-feedback');
const prevLessonBtn = document.getElementById('prev-lesson');
const nextLessonBtn = document.getElementById('next-lesson');
const resetExerciseBtn = document.getElementById('reset-exercise');

// --- Constants and State ---
const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const pieceRenderMode = localStorage.getItem('chess-render-mode') || 'png';
const pieces = {
    'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟',
    'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙'
};

let learnGame = new Chess();
let currentLessonIndex = 0;
let lessons = [];
let selectedSquareAlg = null;
let lessonState = 'waiting';
let highlightedSquares = { piece: [], target: [], allowed: [] };
let lastMoveHighlight = null;
let isGuidedMode = false;

// --- Feedback System ---
function showFeedback(message, type = 'info') {
    if (!lessonFeedbackEl) return;

    // Remove all previous feedback classes
    lessonFeedbackEl.classList.remove('success', 'error', 'info');

    // Add new feedback class
    lessonFeedbackEl.classList.add(type);
    lessonFeedbackEl.textContent = message;

    // Make visible
    lessonFeedbackEl.classList.add('visible');

    // Optional: Auto-hide after a delay for success/info messages
    if (type !== 'error') {
        setTimeout(() => {
            clearFeedback();
        }, 3000);
    }
}

function clearFeedback() {
    if (!lessonFeedbackEl) return;
    lessonFeedbackEl.classList.remove('visible', 'success', 'error', 'info');
    lessonFeedbackEl.textContent = '';
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    lessons = defineLessons(); // ASSIGNER LES LEÇONS à la variable globale
    setupLessonUI();
    loadLesson(currentLessonIndex);
    applyTheme();
});

// Si vous n'avez pas encore défini la fonction applyTheme, ajoutez-la comme suit :
function applyTheme() {
    // Implémentation minimaliste ou aucun changement de thème
    console.log("applyTheme() called - aucun thème spécifique n'est appliqué.");
}

function setupLessonUI() {
    prevLessonBtn.onclick = () => loadLesson(currentLessonIndex - 1);
    nextLessonBtn.onclick = () => loadLesson(currentLessonIndex + 1);
    resetExerciseBtn.onclick = () => {
        if (isGuidedMode) {
            startGuidedMode(); // Réinitialise la partie guidée
        } else {
            loadLesson(currentLessonIndex); // Recharge la leçon courante
        }
    };
}

function defineLessons() {
    // Déclare 'lessons' avec 'const' pour qu'elle soit locale à la fonction
    // et retourne le tableau à la fin.
    const lessons = [
        // 0: Introduction
        {
            title: "Bienvenue !",
            objective: "Comprendre le plateau et l'objectif du jeu.",
            explanation: "Le jeu d'échecs se joue sur un plateau de 8x8 cases, alternant couleurs claires et foncées. Chaque joueur commence avec 16 pièces. L'objectif est de mettre le roi adverse en 'Échec et Mat', une situation où il est attaqué et ne peut pas s'échapper.",
            interactive: false,
            setupFen: 'start', // Position de départ standard
        },
        // 1: Le Pion (Avancer)
        {
            title: "Le Pion - Avancer",
            objective: "Déplacez le pion blanc en e2 de deux cases vers e4.",
            explanation: "Le pion est la pièce la plus nombreuse. Lors de son tout premier coup, un pion peut avancer d'une OU de deux cases tout droit. Ensuite, il ne peut avancer que d'une case à la fois.",
            interactive: true,
            setupFen: 'start', // Position de départ
            highlightSquares: { piece: ['e2'], target: ['e4'] },
            allowedMoves: ['e4'], // Seul coup SAN autorisé (notation simplifiée pour pion)
            showOnlyLegalMovesFor: 'e2', // Ne montrer que les coups pour ce pion
        },
        // 2: Le Pion (Avancer - 1 case)
        {
            title: "Le Pion - Avancer (Suite)",
            objective: "Déplacez le pion blanc en e4 d'une case vers e5.",
            explanation: "Après son premier coup, le pion ne peut avancer que d'une seule case tout droit. Il ne peut jamais reculer.",
            interactive: true,
            setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', // Après 1. e4
            highlightSquares: { piece: ['e4'], target: ['e5'] },
            allowedMoves: ['e5'],
            showOnlyLegalMovesFor: 'e4',
        },
        // 3: Le Pion (Capture)
        {
            title: "Le Pion - Capture",
            objective: "Capturez le pion noir en d5 avec votre pion e4.",
            explanation: "Le pion capture différemment de son déplacement : il capture en diagonale, d'une case vers l'avant. Il ne peut pas capturer tout droit.",
            interactive: true,
            setupFen: 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', // Après 1.e4 d5
            highlightSquares: { piece: ['e4'], target: ['d5'] },
            allowedMoves: ['exd5'], // Notation de capture
            showOnlyLegalMovesFor: 'e4',
        },
        // 4: La Tour
        {
            title: "La Tour",
            objective: "Déplacez la tour blanche de a1 vers a5.",
            explanation: "La tour se déplace horizontalement ou verticalement, d'autant de cases libres qu'elle le souhaite. Elle ne peut pas sauter par-dessus d'autres pièces.",
            interactive: true,
            setupFen: '8/8/8/8/8/8/8/R3K2R w KQ - 0 1', // Position modifiée pour isoler la tour
            highlightSquares: { piece: ['a1'], target: ['a5'] },
            allowedMoves: ['Ra5'],
            showOnlyLegalMovesFor: 'a1',
        },
        // 5: Le Fou
        {
            // CORRECTION : L'objectif initial (c1->f4) était impossible dans la FEN fournie (bloqué par e2)
            // et incohérent avec highlightSquares et validateMove (qui pointaient vers f1->c4).
            // J'ai corrigé l'objectif pour correspondre à un coup possible et aux autres paramètres.
            title: "Le Fou",
            objective: "Déplacez le fou blanc de f1 vers c4.", // Objectif corrigé
            explanation: "Le fou se déplace en diagonale, d'autant de cases libres qu'il le souhaite. Un fou reste toujours sur les cases de sa couleur initiale (fou de cases blanches ou fou de cases noires). Il ne peut pas sauter par-dessus d'autres pièces.",
            interactive: true,
            // FEN après 1.e4 - Le fou f1 peut bouger, c1 est bloqué.
            setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1',
            highlightSquares: { piece: ['f1'], target: ['c4'] },
            // Remplacé validateMove par allowedMoves pour la cohérence avec d'autres leçons simples
            allowedMoves: ['Bc4'], // Utilisation de la notation SAN standard
            showOnlyLegalMovesFor: 'f1',
        },
        // 6: Le Cavalier
        {
            title: "Le Cavalier",
            objective: "Déplacez le cavalier blanc de g1 vers f3.",
            explanation: "Le cavalier a un déplacement unique en 'L' : deux cases dans une direction (horizontale ou verticale), puis une case perpendiculairement. C'est la seule pièce qui peut sauter par-dessus d'autres pièces.",
            interactive: true,
            setupFen: 'start',
            highlightSquares: { piece: ['g1'], target: ['f3', 'h3'] }, // Montre les cibles possibles
            allowedMoves: ['Nf3'], // Objectif spécifique
            showOnlyLegalMovesFor: 'g1',
        },
        // 7: La Dame
        {
            title: "La Dame (Reine)",
            objective: "Déplacez la Dame blanche de d1 vers h5.",
            explanation: "La Dame est la pièce la plus puissante. Elle combine les déplacements de la Tour ET du Fou : elle peut se déplacer horizontalement, verticalement ou en diagonale d'autant de cases libres qu'elle le souhaite.",
            interactive: true,
            // FEN après 1.d4 e5 - Ouvre la diagonale pour la Dame
             setupFen: 'rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 2',
            highlightSquares: { piece: ['d1'], target: ['h5'] },
            // Remplacé validateMove par allowedMoves pour la cohérence
            allowedMoves: ['Qh5'],
            showOnlyLegalMovesFor: 'd1',
        },
        // 8: Le Roi
        {
            title: "Le Roi",
            objective: "Déplacez le Roi blanc de e1 vers f1.",
            explanation: "Le Roi est la pièce la plus importante, mais il est lent. Il peut se déplacer d'une seule case dans n'importe quelle direction (horizontale, verticale ou diagonale). Il ne peut jamais se déplacer sur une case attaquée par une pièce adverse.",
            interactive: true,
             // FEN modifiée pour que le roi ait quelques coups, mais pas trop. e.g., après 1.e4
            setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PP3PPP/RNB1K1NR w KQkq - 0 1',
            // Highlight uniquement les cases légales (f1, e2). d1 est bloqué, d2 est bloqué
            highlightSquares: { piece: ['e1'], target: ['f1', 'e2'] },
            allowedMoves: ['Kf1'], // Objectif simple
            showOnlyLegalMovesFor: 'e1',
        },
        // 9: Roque
        {
            title: "Le Roque",
            objective: "Effectuez un petit roque (côté roi).", // Précision
            explanation: "Le roque est un coup spécial impliquant le roi et une tour. Conditions : ni le roi ni la tour concernée ne doivent avoir bougé ; les cases entre eux doivent être libres ; le roi ne doit pas être en échec, ni traverser une case attaquée, ni atterrir sur une case attaquée. Ici, le roi (e1) va en g1 et la tour (h1) va en f1.",
            interactive: true,
            setupFen: 'rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQ - 0 1', // Position pour roque des deux côtés
            highlightSquares: { piece: ['e1'], target: ['g1'] }, // Montre la case d'arrivée du roi
            allowedMoves: ['O-O'], // Roque côté roi (petit roque)
            showOnlyLegalMovesFor: 'e1', // Montre le roque comme coup possible du roi
        },
        // 10: En Passant
        {
            title: "La Prise en Passant", // Nom plus courant
            objective: "Capturez le pion noir en e5 'en passant' avec votre pion d5.", // Objectif plus précis
            explanation: "La prise 'en passant' est une règle spéciale pour les pions. Si un pion adverse avance de deux cases depuis sa position initiale et atterrit juste à côté de votre pion, votre pion peut le capturer comme s'il n'avait avancé que d'une case. Cette capture doit être effectuée immédiatement au coup suivant.",
            interactive: true,
             // FEN où le pion blanc en d5 peut prendre le pion noir en e5 (qui vient de jouer e7-e5) en passant sur e6.
            setupFen: 'rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP1PPPP/RNBQKBNR w KQkq e6 0 3', // Après 1.d4 d5 2.e4 e5 (le coup qui vient d'être joué est e5, donc e6 est la case 'en passant') -> Il faut une FEN correcte pour ça.
            // FEN correcte pour une prise en passant pour Blanc sur e6 :
            setupFen: 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3', // Exemple après 1.e4 f5 2.e5 d5? 3.f4... Non, plus simple:
            // Position où Blanc a un pion en d5, Noir vient de jouer ...e7-e5. Blanc peut jouer dxe6.
            setupFen: '4k3/8/8/3pP3/8/8/8/4K3 w - e6 0 1', // Pion blanc d5, pion noir vient de jouer e7-e5 -> 'en passant' possible sur e6.
            highlightSquares: { piece: ['d5'], target: ['e6'] }, // La capture se fait sur la case "traversée"
            allowedMoves: ['dxe6'], // Notation de la capture en passant
            showOnlyLegalMovesFor: 'd5',
            // validateMove est bien ici car il vérifie le flag spécifique 'e' (en passant)
            validateMove: (m) => m.flags.includes('e') && m.from === 'd5' && m.to === 'e6'
        },
        // 11: Promotion
        {
            title: "La Promotion",
            objective: "Avancez votre pion en a8 et promouvez-le en Dame.", // Objectif plus précis
            explanation: "Lorsqu'un pion atteint la dernière rangée (la 8e pour les Blancs, la 1ère pour les Noirs), il DOIT être immédiatement remplacé ('promu') par une autre pièce de sa couleur : Dame, Tour, Fou ou Cavalier (pas un autre pion ni un Roi). La Dame est le choix le plus fréquent car c'est la pièce la plus puissante.",
            interactive: true,
            setupFen: '8/P7/k7/8/8/8/8/K7 w - - 0 1', // Pion prêt à promouvoir, rois présents pour éviter FEN invalide
            highlightSquares: { piece: ['a7'], target: ['a8'] },
            allowedMoves: ['a8=Q'], // Promotion en Dame (Q = Queen)
            showOnlyLegalMovesFor: 'a7',
             // validateMove est bien ici car il vérifie le flag 'p' (promotion) et le type de pièce
            validateMove: (m) => m.flags.includes('p') && m.promotion === 'q' && m.from === 'a7' && m.to === 'a8'
        },
        // 12: Échec et Mat
        {
            title: "L'Échec et Mat",
            objective: "Mettez le roi noir en échec et mat en un coup.",
            explanation: "L'échec et mat termine la partie. Le roi est 'en échec' (attaqué) et il n'existe aucun coup légal pour parer cet échec (ni bouger le roi sur une case sûre, ni interposer une pièce, ni capturer la pièce qui attaque).",
            interactive: true,
            // Position simple : Dame blanche vs Roi noir seul.
            setupFen: '4k3/Q7/8/8/8/8/8/4K3 w - - 0 1', // Dame en a7, Roi noir en e8.
            highlightSquares: { piece: ['a7'], target: ['e7'] }, // Coup Qe7#
            allowedMoves: ['Qe7#'], // Échec et mat (notation avec #)
            showOnlyLegalMovesFor: 'a7',
        },
        // 13: Pat
        {
            title: "Le Pat",
            objective: "Jouez un coup qui met le roi noir en situation de Pat.",
            explanation: "Le Pat est une cause de partie nulle. C'est une situation où le joueur dont c'est le tour n'a aucun coup légal à jouer, MAIS son roi n'est PAS en échec. Si c'est le seul coup possible qui mène au Pat, il faut le jouer.",
            interactive: true,
            // Position où la Dame blanche peut forcer le Pat. Roi noir en h8, Dame blanche en f7.
             setupFen: '7k/5Q2/8/8/8/8/8/4K3 w - - 0 1',
            highlightSquares: { piece: ['f7'], target: ['g6'] }, // Jouer Qg6 laisse le roi noir sans coup légal et non en échec.
            allowedMoves: ['Qg6'], // Ce coup crée le Pat
            showOnlyLegalMovesFor: 'f7',
        },
        // 14: Conclusion
        {
            title: "Bravo !", // Singulier est peut-être plus courant
            objective: "Vous avez appris les bases du déplacement des pièces et quelques règles spéciales.", // Phrase complétée
            explanation: "C'est un excellent début ! Le meilleur moyen de progresser est de jouer et d'analyser vos parties. Continuez à pratiquer !",
            interactive: false,
        }
    ];

    // Retourne le tableau de leçons
    return lessons;
}

function loadLesson(index) {
    if (index < 0 || index >= lessons.length) {
        console.warn(`Lesson index ${index} out of bounds.`);
        return;
    }

    currentLessonIndex = index;
    const lesson = lessons[currentLessonIndex];
    
    // Réinitialiser l'état
    selectedSquareAlg = null;
    lessonState = 'waiting';
    lastMoveHighlight = null;
    
    // Mettre à jour l'interface
    lessonTitleEl.textContent = lesson.title;
    lessonObjectiveEl.textContent = lesson.objective;
    lessonExplanationEl.textContent = lesson.explanation;

    // Configurer les highlights
    highlightedSquares = lesson.highlightSquares || { piece: [], target: [], allowed: [] };

    // Configurer le plateau
    if (lesson.setupFen === 'start' || !lesson.setupFen) {
        learnGame.reset();
    } else {
        try {
            const loaded = learnGame.load(lesson.setupFen);
            if (!loaded) throw new Error("Failed to load FEN");
        } catch (e) {
            console.error(`Failed to load FEN "${lesson.setupFen}"`, e);
            return;
        }
    }

    // Mettre à jour les boutons
    prevLessonBtn.disabled = currentLessonIndex <= 0;
    nextLessonBtn.disabled = currentLessonIndex >= lessons.length - 1;
    resetExerciseBtn.disabled = false;

    clearFeedback();
    createBoard_Learn();
}

function completeLessonStep() {
    if (!lessons[currentLessonIndex]) return;
    
    lessonState = 'completed';
    showFeedback("Excellent !", 'success');
    
    setTimeout(() => {
        if (currentLessonIndex < lessons.length - 1) {
            loadLesson(currentLessonIndex + 1);
        } else {
            startGuidedMode();
        }
    }, 1500);
}

function startGuidedMode() {
    isGuidedMode = true;
    learnGame.reset();

    lessonTitleEl.textContent = "Mode Pratique Guidée";
    lessonObjectiveEl.textContent = "Jouez librement avec les conseils du coach";
    lessonExplanationEl.textContent = "Utilisez ce que vous avez appris. Faites des coups et recevez des suggestions.";

    nextLessonBtn.style.display = 'none';
    prevLessonBtn.style.display = 'none';
    resetExerciseBtn.textContent = 'Nouvelle Partie';

    createBoard_Learn();
    showFeedback("Mode pratique activé! Les blancs commencent.", 'info');
}

function handleGuidedMove(event) {
    const square = event.currentTarget;
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const clickedAlg = files[col] + (8 - row);
    const pieceOnSquare = learnGame.get(clickedAlg);

    if (selectedSquareAlg) {
        try {
            const move = learnGame.move({
                from: selectedSquareAlg,
                to: clickedAlg,
                promotion: 'q'
            });

            if (move) {
                lastMoveHighlight = { from: move.from, to: move.to };
                selectedSquareAlg = null;
                createBoard_Learn();
                provideMoveAdvice();
            }
        } catch (e) {
            showFeedback("Coup invalide", 'error');
        }
        selectedSquareAlg = null;
        highlightMoves_Learn([]);
    } else if (pieceOnSquare && pieceOnSquare.color === learnGame.turn()) {
        selectedSquareAlg = clickedAlg;
        const legalMoves = learnGame.moves({ square: clickedAlg, verbose: true });
        highlightMoves_Learn(legalMoves);
    }
}

function provideMoveAdvice() {
    let advice = "";
    if (learnGame.in_check()) {
        advice = "Attention, vous êtes en échec! Protégez votre roi.";
    } else if (learnGame.moves().length < 5) {
        advice = "Attention aux pièces menacées!";
    } else if (learnGame.turn() === 'w') {
        advice = "Les blancs jouent. Pensez à développer vos pièces.";
    } else {
        advice = "Les noirs jouent. Contrôlez le centre.";
    }
    showFeedback(advice, 'info');
}

// --- Board Interaction (Lesson Specific) ---

function handleSquareClick_Learn(event) {
    const lesson = lessons[currentLessonIndex];
    if (!lesson || !lesson.interactive || lessonState === 'completed') return;

    const square = event.currentTarget;
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const clickedAlg = files[col] + (8 - row);
    const pieceOnSquare = learnGame.get(clickedAlg);

    if (selectedSquareAlg) {
        const fromAlg = selectedSquareAlg;
        const fromPiece = learnGame.get(fromAlg);

        // Désélection si on clique sur la même case
        if (clickedAlg === fromAlg) {
            square.classList.remove('selected');
            selectedSquareAlg = null;
            highlightMoves_Learn([]);
            return;
        }

        try {
            // Détecter les coups spéciaux
            const isPawnPromotion = fromPiece && 
                fromPiece.type === 'p' && 
                ((fromPiece.color === 'w' && row === 0) || 
                 (fromPiece.color === 'b' && row === 7));

            const isRoque = fromPiece && 
                fromPiece.type === 'k' && 
                Math.abs(col - files.indexOf(fromAlg[0])) === 2;

            // Essayer de jouer le coup
            let move;
            let moveOptions = {
                from: fromAlg,
                to: clickedAlg
            };

            // Ajouter la promotion si nécessaire
            if (isPawnPromotion) {
                moveOptions.promotion = 'q';
            }

            move = learnGame.move(moveOptions);

            if (move) {
                // Gestion des highlights spéciaux
                if (move.flags.includes('e')) {
                    // En passant
                    lastMoveHighlight = {
                        from: move.from,
                        to: move.to,
                        captured: move.to.charAt(0) + move.from.charAt(1)
                    };
                } else if (move.flags.includes('k') || move.flags.includes('q')) {
                    // Roque
                    const isKingside = move.flags.includes('k');
                    lastMoveHighlight = {
                        from: move.from,
                        to: move.to,
                        rook_from: isKingside ? 'h1' : 'a1',
                        rook_to: isKingside ? 'f1' : 'd1'
                    };
                } else {
                    // Coup normal
                    lastMoveHighlight = { from: move.from, to: move.to };
                }

                // Vérifier si le coup est valide pour la leçon
                let isValidForLesson = false;
                if (lesson.allowedMoves) {
                    isValidForLesson = lesson.allowedMoves.includes(move.san);
                } else if (lesson.validateMove) {
                    isValidForLesson = lesson.validateMove(move);
                } else {
                    isValidForLesson = true;
                }

                selectedSquareAlg = null;
                createBoard_Learn();

                if (isValidForLesson) {
                    completeLessonStep();
                } else {
                    showFeedback("Ce n'est pas le coup attendu pour cette leçon.", 'error');
                    learnGame.undo();
                    createBoard_Learn();
                }
            }
        } catch(e) {
            console.error('Erreur de coup:', e);
            showFeedback("Coup invalide", 'error');
        }

        selectedSquareAlg = null;
        highlightMoves_Learn([]);

    } else if (pieceOnSquare && pieceOnSquare.color === learnGame.turn()) {
        // Vérifier si c'est la pièce autorisée par la leçon
        if (lesson.showOnlyLegalMovesFor && lesson.showOnlyLegalMovesFor !== clickedAlg) {
            showFeedback(`Pour cette leçon, vous devez bouger la pièce en ${lesson.showOnlyLegalMovesFor}.`, 'error');
            return;
        }

        // Sélectionner la pièce
        selectedSquareAlg = clickedAlg;
        chessboardEl.querySelectorAll('.square.selected').forEach(el => el.classList.remove('selected'));
        square.classList.add('selected');

        // Afficher les coups légaux
        let possibleMoves = learnGame.moves({ square: clickedAlg, verbose: true });
        let allowedMoves = possibleMoves;

        // Filtrer les coups selon les contraintes de la leçon
        if (lesson.allowedMoves) {
            allowedMoves = possibleMoves.filter(m => lesson.allowedMoves.includes(m.san));
        } else if (lesson.validateMove) {
            allowedMoves = possibleMoves.filter(m => lesson.validateMove(m));
        } else if (highlightedSquares.target.length > 0) {
            allowedMoves = possibleMoves.filter(m => highlightedSquares.target.includes(m.to));
        }

        highlightMoves_Learn(allowedMoves);
    } else {
        // Clic sur case vide ou pièce adverse
        selectedSquareAlg = null;
        chessboardEl.querySelectorAll('.square.selected').forEach(el => el.classList.remove('selected'));
        highlightMoves_Learn([]);
    }
}


// --- Board Rendering & Highlighting (Learn Specific) ---
function createBoard_Learn() {
    if (!chessboardEl) {
        console.error("Chessboard element not found!");
        return;
    }
    chessboardEl.innerHTML = ''; // Clear previous board
    const boardFragment = document.createDocumentFragment();
    let boardData;
    try {
        boardData = learnGame.board();
    } catch (e) {
        console.error("Error getting board data from learnGame:", e);
        return;
    }

    // Vider les highlights précédents au cas où
    highlightedSquares.piece = [];
    highlightedSquares.target = [];
    highlightedSquares.allowed = [];
    const currentLesson = lessons[currentLessonIndex];
    if (currentLesson && currentLesson.highlightSquares) {
        highlightedSquares = {
            piece: currentLesson.highlightSquares.piece || [],
            target: currentLesson.highlightSquares.target || [],
            allowed: currentLesson.highlightSquares.allowed || [], // Cases où l'on peut aller
        };
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
                // --- Piece Rendering ---
                const myPieceFormat = pieceInfo.color === 'w' ? pieceInfo.type.toUpperCase() : pieceInfo.type.toLowerCase();
                if (pieceRenderMode === 'ascii' && pieces && pieces[myPieceFormat]) {
                    const pieceElement = document.createElement('span');
                    pieceElement.className = 'piece';
                    pieceElement.textContent = pieces[myPieceFormat];
                    pieceElement.classList.add(pieceInfo.color === 'w' ? 'white-piece' : 'black-piece');
                    square.appendChild(pieceElement);
                } else { // png mode
                    const img = document.createElement('img');
                    const colorPrefix = pieceInfo.color === 'w' ? 'w' : 'b';
                    const pieceCode = pieceInfo.type;
                    const filename = `pieces/${colorPrefix}${pieceCode}.png`;
                    img.src = filename;
                    img.alt = myPieceFormat;
                    img.classList.add("piece");
                    img.draggable = false;
                    img.onerror = () => { img.style.display = 'none'; };
                    square.appendChild(img);
                }
            }

            // --- Lesson Highlighting ---
            if (highlightedSquares.piece.includes(alg)) {
                square.classList.add('highlight-lesson-piece');
            }
            if (highlightedSquares.target.includes(alg)) {
                square.classList.add('highlight-lesson-target');
            }
            if (highlightedSquares.allowed.includes(alg)) {
                square.classList.add('highlight-lesson-allowed');
            }

            // --- Standard Highlighting ---
            if (lastMoveHighlight && (alg === lastMoveHighlight.from || alg === lastMoveHighlight.to)) {
                square.classList.add('last-move');
            }
            if (selectedSquareAlg === alg) {
                square.classList.add('selected');
            }

            // Add click listener only if lesson is interactive and not completed
            if (currentLesson && currentLesson.interactive && lessonState !== 'completed') {
                square.addEventListener('click', handleSquareClick_Learn);
                square.style.cursor = 'pointer';
            } else {
                square.style.cursor = 'default';
            }


            boardFragment.appendChild(square);
        }
    }
    chessboardEl.appendChild(boardFragment);

    // Re-apply legal move highlights if a piece is selected
    if (selectedSquareAlg) {
        const lesson = lessons[currentLessonIndex];
        let movesToShow = learnGame.moves({ square: selectedSquareAlg, verbose: true });
        // Filter moves based on lesson constraints
        if (lesson.allowedMoves) {
            movesToShow = movesToShow.filter(m => lesson.allowedMoves.includes(m.san));
        } else if (lesson.validateMove) {
            movesToShow = movesToShow.filter(m => lesson.validateMove(m));
        } else if (highlightedSquares.target.length > 0) {
            // If specific targets highlighted, only show moves to those targets
            movesToShow = movesToShow.filter(m => highlightedSquares.target.includes(m.to));
        }
        highlightMoves_Learn(movesToShow);
    }
}

function highlightMoves_Learn(moves) {
    // Clear previous move/capture highlights (keep lesson highlights)
    chessboardEl.querySelectorAll('.square.highlight, .square.capture').forEach(sq => {
        sq.classList.remove('highlight', 'capture');
    });

    moves.forEach(move => {
        const coord = algToCoord(move.to);
        if (!coord) return;
        const square = chessboardEl.querySelector(`.square[data-row="${coord[0]}"][data-col="${coord[1]}"]`);
        if (square) {
            // Utiliser les styles standard 'highlight' et 'capture'
            square.classList.add(move.flags.includes('c') ? 'capture' : 'highlight');
        }
    });
}


// --- Helpers ---
function algToCoord(alg) {
    if (!alg || alg.length < 2) return null;
    const col = files.indexOf(alg[0]);
    const row = 8 - parseInt(alg[1]);
    if (col === -1 || isNaN(row) || row < 0 || row > 7) return null;
    return [row, col];
}


console.log("Learn page script loaded.");