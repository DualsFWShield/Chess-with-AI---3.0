import { Chess } from './chess.js'; // Assurez-vous que le chemin est correct

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
// Lire le mode de rendu préféré (ou utiliser PNG par défaut)
const pieceRenderMode = localStorage.getItem('chess-render-mode') || 'png';
const pieces = { // Pour le rendu ASCII
    'r': '♜', 'n': '♞', 'b': '♝', 'q': '♛', 'k': '♚', 'p': '♟', // noir
    'R': '♖', 'N': '♘', 'B': '♗', 'Q': '♕', 'K': '♔', 'P': '♙'  // blanc
};

let learnGame = new Chess(); // Instance de chess.js pour les leçons
let currentLessonIndex = 0;
let lessons = []; // Sera rempli par defineLessons()
let selectedSquareAlg = null; // Case sélectionnée (ex: 'e2')
let lessonState = 'waiting'; // 'waiting', 'completed'
let highlightedSquares = { piece: [], target: [], allowed: [] }; // Pour les highlights spécifiques à la leçon
let lastMoveHighlight = null; // Pour highlight le dernier coup { from: 'e2', to: 'e4' }
let isGuidedMode = false; // Pour le mode pratique après les leçons

// --- Feedback System ---
function showFeedback(message, type = 'info') {
    if (!lessonFeedbackEl) {
        console.error("Feedback element not found!");
        return;
    }

    // Retirer les anciennes classes de type
    lessonFeedbackEl.classList.remove('success', 'error', 'info');

    // Ajouter la nouvelle classe de type
    if (type) lessonFeedbackEl.classList.add(type);

    lessonFeedbackEl.textContent = message;

    // Rendre visible (via classe CSS)
    lessonFeedbackEl.classList.add('visible');

    // Optionnel: Cacher automatiquement après un délai pour succès/info
    if (type === 'success' || type === 'info') {
        setTimeout(() => {
            // Vérifier si le message est toujours le même avant de cacher
            if (lessonFeedbackEl.textContent === message) {
                clearFeedback();
            }
        }, 3000);
    }
}

function clearFeedback() {
    if (!lessonFeedbackEl) return;
    lessonFeedbackEl.classList.remove('visible');
    // Optionnel : retirer le texte immédiatement ou laisser l'animation faire
    // lessonFeedbackEl.textContent = '';
    // Retirer les classes de type après l'animation (ou immédiatement)
    lessonFeedbackEl.classList.remove('success', 'error', 'info');
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    lessons = defineLessons(); // Charger la définition des leçons
    if (!lessons || lessons.length === 0) {
        showFeedback("Erreur: Aucune leçon définie.", "error");
        return;
    }
    setupLessonUI(); // Configurer les boutons etc.
    applyTheme(); // Appliquer le thème (minimaliste)
    loadLesson(currentLessonIndex); // Charger la première leçon
});

// Fonction applyTheme (placeholder - adaptez si vous avez un système de thème)
function applyTheme() {
    // Lire le thème depuis localStorage et l'appliquer au body si nécessaire
    const savedTheme = localStorage.getItem('chess-theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme'); // Default is dark or based on styles-v2.css
    }
    console.log(`Theme applied: ${savedTheme || 'default'}`);
    // Si vous changez les couleurs via JS, faites-le ici
    // createBoard_Learn() // Pourrait être nécessaire si les couleurs des cases changent dynamiquement
}

// Configure les écouteurs d'événements pour les boutons
function setupLessonUI() {
    if (!prevLessonBtn || !nextLessonBtn || !resetExerciseBtn) {
        console.error("One or more navigation buttons not found!");
        return;
    }
    prevLessonBtn.onclick = () => loadLesson(currentLessonIndex - 1);
    nextLessonBtn.onclick = () => {
        if (lessonState === 'completed' || !lessons[currentLessonIndex]?.interactive) {
            loadLesson(currentLessonIndex + 1);
        } else {
            showFeedback("Terminez l'objectif actuel avant de passer à la suite.", "info");
        }
    };
    resetExerciseBtn.onclick = () => {
        if (isGuidedMode) {
            startGuidedMode(); // Réinitialise la partie guidée
        } else {
            loadLesson(currentLessonIndex); // Recharge la leçon courante
        }
    };
}

// Définition de toutes les leçons
function defineLessons() {
    return [
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
            highlightSquares: { piece: ['e2'], target: ['e4'], allowed: ['e3','e4'] }, // Montre e3 et e4 comme permis
            allowedMoves: ['e4'], // Seul coup SAN autorisé pour VALIDER la leçon
            showOnlyLegalMovesFor: 'e2', // Ne montrer que les coups pour ce pion
        },
        // 2: Le Pion (Avancer - 1 case)
        {
            title: "Le Pion - Avancer (Suite)",
            objective: "Déplacez le pion blanc en e4 d'une case vers e5.",
            explanation: "Après son premier coup, le pion ne peut avancer que d'une seule case tout droit. Il ne peut jamais reculer.",
            interactive: true,
            setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', // Après 1. e3 ou 1.e4 (FEN après 1.e4 fourni initialement est bon: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1)
            highlightSquares: { piece: ['e4'], target: ['e5'], allowed: ['e5'] },
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
            highlightSquares: { piece: ['e4'], target: ['d5'], allowed: ['e5', 'd5'] }, // Montre avance et capture
            allowedMoves: ['exd5'], // Notation de capture pour valider
            showOnlyLegalMovesFor: 'e4',
        },
        // 4: La Tour
        {
            title: "La Tour",
            objective: "Déplacez la tour blanche de a1 vers a5.",
            explanation: "La tour se déplace horizontalement ou verticalement, d'autant de cases libres qu'elle le souhaite. Elle ne peut pas sauter par-dessus d'autres pièces.",
            interactive: true,
            setupFen: '8/8/8/8/8/8/8/R3K2R w KQ - 0 1', // Position modifiée pour isoler la tour
            highlightSquares: { piece: ['a1'], target: ['a5'], allowed: ['a2','a3','a4','a5','a6','a7','a8', 'b1', 'c1', 'd1'] }, // Toutes cases libres
            allowedMoves: ['Ra5'],
            showOnlyLegalMovesFor: 'a1',
        },
        // 5: Le Fou
        {
            title: "Le Fou",
            objective: "Déplacez le fou blanc de f1 vers c4.", // Objectif corrigé et cohérent
            explanation: "Le fou se déplace en diagonale, d'autant de cases libres qu'il le souhaite. Un fou reste toujours sur les cases de sa couleur initiale (fou de cases blanches ou fou de cases noires). Il ne peut pas sauter par-dessus d'autres pièces.",
            interactive: true,
            setupFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1', // Après 1.e4 - Fou f1 peut bouger
            highlightSquares: { piece: ['f1'], target: ['c4'], allowed: ['e2', 'd3', 'c4', 'b5', 'a6'] }, // Cases libres diagonales
            allowedMoves: ['Bc4'], // Utilisation de la notation SAN standard pour valider
            showOnlyLegalMovesFor: 'f1',
        },
        // 6: Le Cavalier
        {
            title: "Le Cavalier",
            objective: "Déplacez le cavalier blanc de g1 vers f3.",
            explanation: "Le cavalier a un déplacement unique en 'L' : deux cases dans une direction (horizontale ou verticale), puis une case perpendiculairement. C'est la seule pièce qui peut sauter par-dessus d'autres pièces.",
            interactive: true,
            setupFen: 'start',
            highlightSquares: { piece: ['g1'], target: ['f3'], allowed: ['f3', 'h3'] }, // Montre les cibles possibles
            allowedMoves: ['Nf3'], // Objectif spécifique
            showOnlyLegalMovesFor: 'g1',
        },
        // 7: La Dame
        {
            title: "La Dame (Reine)",
            objective: "Déplacez la Dame blanche de d1 vers h5.",
            explanation: "La Dame est la pièce la plus puissante. Elle combine les déplacements de la Tour ET du Fou : elle peut se déplacer horizontalement, verticalement ou en diagonale d'autant de cases libres qu'elle le souhaite.",
            interactive: true,
            setupFen: 'rnbqkbnr/pppp1ppp/8/4p3/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 2', // Après 1.d4 e5 - Ouvre un peu
            highlightSquares: { piece: ['d1'], target: ['h5'], allowed: ['d2','d3','e2','f3','g4','h5'] }, // Cases libres
            allowedMoves: ['Qh5'], // Valide avec ce coup
            showOnlyLegalMovesFor: 'd1',
        },
        // 8: Le Roi
        {
            title: "Le Roi",
            objective: "Déplacez le Roi blanc de e1 vers f1.",
            explanation: "Le Roi est la pièce la plus importante, mais il est lent. Il peut se déplacer d'une seule case dans n'importe quelle direction (horizontale, verticale ou diagonale). Il ne peut jamais se déplacer sur une case attaquée par une pièce adverse.",
            interactive: true,
            setupFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQK2R w KQkq - 0 1', // Roi et tour h1 seulement
            highlightSquares: { piece: ['e1'], target: ['f1'], allowed: ['d1','d2','e2','f1','f2'] }, // Cases libres et non attaquées
            allowedMoves: ['Kf1'], // Objectif simple
            showOnlyLegalMovesFor: 'e1',
        },
        // 9: Roque
        {
            title: "Le Roque",
            objective: "Effectuez un petit roque (côté roi). Cliquez sur le roi (e1) puis sur sa case d'arrivée (g1).",
            explanation: "Le roque est un coup spécial impliquant le roi et une tour. Conditions : ni le roi ni la tour concernée ne doivent avoir bougé ; les cases entre eux doivent être libres ; le roi ne doit pas être en échec, ni traverser une case attaquée, ni atterrir sur une case attaquée. Ici, le roi (e1) va en g1 et la tour (h1) va en f1.",
            interactive: true,
            setupFen: 'rnbq1bnr/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQ - 0 1', // Position pour roque des deux côtés
            highlightSquares: { piece: ['e1'], target: ['g1'], allowed: ['d1','d2','e2','f1','f2', 'c1', 'g1'] }, // Montre aussi les cases de roque c1 et g1
            allowedMoves: ['O-O'], // Roque côté roi (petit roque) pour valider
            showOnlyLegalMovesFor: 'e1', // Montre le roque comme coup possible du roi
        },
        // 10: En Passant
        {
            title: "La Prise en Passant",
            objective: "Capturez le pion noir en e5 'en passant' avec votre pion d5. Cliquez sur d5 puis sur e6.",
            explanation: "La prise 'en passant' est une règle spéciale pour les pions. Si un pion adverse avance de deux cases depuis sa position initiale et atterrit juste à côté de votre pion, votre pion peut le capturer comme s'il n'avait avancé que d'une case (sur la case e6 dans cet exemple). Cette capture doit être effectuée immédiatement au coup suivant.",
            interactive: true,
            setupFen: 'rnbqkbnr/pp1p1ppp/8/2ppP3/8/8/PPP1PPPP/RNBQKBNR w KQkq d6 0 1',
            highlightSquares: { piece: ['e5'], target: ['d6'], allowed: ['e6', 'd6'] }, // Montre avance et capture en passant
            allowedMoves: ['exd6'], // Capture en passant pour valider
            showOnlyLegalMovesFor: 'e5',
        },
        // 11: Pat
        {
            title: "Le Pat",
            objective: "Jouez un coup avec la Dame qui met le roi noir en situation de Pat (partie nulle).",
            explanation: "Le Pat est une cause de partie nulle. C'est une situation où le joueur dont c'est le tour n'a aucun coup légal à jouer, MAIS son roi n'est PAS en échec. Trouvez le coup de Dame qui bloque toutes les cases du roi noir sans le mettre en échec.",
            interactive: true,
             // Position où la Dame blanche peut forcer le Pat. Roi noir en h8, Dame blanche en f7. Roi blanc ailleurs.
            setupFen: '7k/5Q2/8/8/8/8/8/4K3 w - - 0 1',
            highlightSquares: { piece: ['f7'], target: ['g6'], allowed: ['f8','f6','f5','f4','f3','f2','f1', 'e8','d7','c6','b5','a4', 'e7','d7','c7','b7','a7', 'g7','h7','g8','h8','g6','h5'] }, // Montre toutes cases + la case cible du Pat
            allowedMoves: ['Qg6'], // Ce coup crée le Pat et valide
            showOnlyLegalMovesFor: 'f7',
        },
        // 14: Conclusion
        {
            title: "Bravo !",
            objective: "Vous avez appris les bases du déplacement des pièces et quelques règles spéciales.",
            explanation: "C'est un excellent début ! Le meilleur moyen de progresser est de jouer et d'analyser vos parties. Vous pouvez utiliser le mode 'Pratique Guidée' (si activé après) ou retourner au jeu principal. Continuez à pratiquer !",
            interactive: false,
        }
    ];
}

// Charge une leçon spécifique par son index
function loadLesson(index) {
    if (index < 0 || index >= lessons.length) {
        console.warn(`Lesson index ${index} out of bounds.`);
        // Gérer: rester sur la leçon actuelle ou aller au menu ?
        if (index >= lessons.length) {
             currentLessonIndex = lessons.length - 1; // Bloquer à la dernière leçon
             nextLessonBtn.disabled = true;
        } else {
            currentLessonIndex = 0; // Retourner à la première
            prevLessonBtn.disabled = true;
        }
        return;
    }

    currentLessonIndex = index;
    const lesson = lessons[currentLessonIndex];
    if (!lesson) {
        console.error(`Lesson at index ${index} is undefined.`);
        return;
    }

    // Réinitialiser l'état pour la nouvelle leçon
    selectedSquareAlg = null;
    lessonState = 'waiting'; // Important pour réactiver l'interactivité
    lastMoveHighlight = null;
    isGuidedMode = false; // Sortir du mode guidé si on navigue dans les leçons

    // Mettre à jour l'interface utilisateur textuelle
    lessonTitleEl.textContent = lesson.title || "Titre manquant";
    lessonObjectiveEl.textContent = lesson.objective || "Objectif manquant";
    lessonExplanationEl.textContent = lesson.explanation || "Explication manquante";

    // Configurer les highlights spécifiques à la leçon
    highlightedSquares = lesson.highlightSquares || { piece: [], target: [], allowed: [] };

    // Configurer le plateau d'échecs (via FEN)
    try {
        if (lesson.setupFen === 'start' || !lesson.setupFen) {
            learnGame.reset();
        } else {
            const loaded = learnGame.load(lesson.setupFen);
            if (!loaded) {
                throw new Error(`Invalid FEN string: ${lesson.setupFen}`);
            }
        }
        console.log(`Lesson ${index} loaded. FEN: ${learnGame.fen()}`);
    } catch (e) {
        console.error(`Failed to load FEN for lesson ${index}: "${lesson.setupFen}"`, e);
        showFeedback(`Erreur de chargement de la leçon (FEN invalide).`, 'error');
        // Empêcher l'interaction sur cette leçon?
         lessonState = 'error';
        chessboardEl.innerHTML = `<div style="color: red; padding: 20px; text-align: center;">Erreur FEN</div>`;
        return; // Ne pas continuer si FEN invalide
    }

    // Mettre à jour l'état des boutons de navigation
    prevLessonBtn.disabled = currentLessonIndex <= 0;
    nextLessonBtn.disabled = currentLessonIndex >= lessons.length - 1;
     // Activer "Suivant" si la leçon n'est pas interactive ou déjà complétée (pour navigation facile)
    if (!lesson.interactive || lessonState === 'completed') {
         // Pas besoin d'activer spécifiquement ici, la logique du bouton le gère
    }

    resetExerciseBtn.disabled = !lesson.interactive; // Désactiver Réessayer pour les leçons non interactives
    resetExerciseBtn.innerHTML = '<i class="fas fa-undo"></i> Réessayer'; // Texte standard

    clearFeedback(); // Effacer le feedback précédent
    createBoard_Learn(); // Dessiner le plateau pour la leçon
}

// Appelé quand le joueur réussit l'objectif de la leçon interactive
function completeLessonStep() {
    if (!lessons[currentLessonIndex] || lessonState === 'completed') return; // Evite double appel

    lessonState = 'completed';
    showFeedback("Excellent ! Objectif atteint.", 'success');

    // Enlever les highlights spécifiques à la leçon après succès? Optionnel.
     highlightedSquares = { piece: [], target: [], allowed: [] }; // Reset highlights
     createBoard_Learn(); // Redessine sans les highlights de leçon mais garde le last move

    // Activer le bouton suivant
    nextLessonBtn.disabled = currentLessonIndex >= lessons.length - 1;

    // Passer automatiquement à la leçon suivante après un court délai
    setTimeout(() => {
        // Vérifier si on est toujours sur la même leçon avant de passer
        if (lessonState === 'completed' && currentLessonIndex < lessons.length - 1) {
            loadLesson(currentLessonIndex + 1);
        } else if (currentLessonIndex >= lessons.length - 1) {
            // Peut-être démarrer le mode guidé ici si souhaité
             // startGuidedMode();
             showFeedback("Bravo, vous avez terminé toutes les leçons !", "success");
             nextLessonBtn.disabled = true; // Assurer que Suivant est désactivé
        }
    }, 1500); // 1.5 secondes
}

// --- Fonctions pour le Mode Guidé (Post-Leçons) ---
function startGuidedMode() {
    console.log("Starting Guided Mode");
    isGuidedMode = true;
    learnGame.reset(); // Nouvelle partie standard

    lessonTitleEl.textContent = "Mode Pratique Guidée";
    lessonObjectiveEl.textContent = "Jouez une partie complète. Cliquez sur une pièce pour voir ses coups.";
    lessonExplanationEl.textContent = "Utilisez ce que vous avez appris. Faites des coups, l'ordinateur répondra (si configuré).";

    // Adapter les contrôles
    nextLessonBtn.style.display = 'none';
    prevLessonBtn.style.display = 'none';
    resetExerciseBtn.innerHTML = '<i class="fas fa-redo"></i> Nouvelle Partie'; // Changer texte bouton reset
    resetExerciseBtn.disabled = false;

     // Réinitialiser highlights, état, etc.
     highlightedSquares = { piece: [], target: [], allowed: [] };
     selectedSquareAlg = null;
     lastMoveHighlight = null;
     lessonState = 'guided'; // Nouvel état

    createBoard_Learn(); // Dessiner le plateau initial
    showFeedback("Mode pratique activé! Les blancs commencent.", 'info');
}

// Gestion des clics en mode guidé (simplifié)
function handleGuidedMove(event) {
    if (lessonState !== 'guided' || learnGame.game_over()) return;

    const square = event.currentTarget;
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const clickedAlg = files[col] + (8 - row);
    const pieceOnSquare = learnGame.get(clickedAlg);
    const currentTurn = learnGame.turn();

    clearFeedback(); // Efface l'ancien feedback

    if (selectedSquareAlg) {
        // --- Piece déjà sélectionnée ---
        if (clickedAlg === selectedSquareAlg) { // Clic sur la même case = Désélectionner
            selectedSquareAlg = null;
            highlightMoves_Learn([]); // Utilise la fonction standard de highlight
            createBoard_Learn(); // Redessine pour enlever 'selected'
            return;
        }

        // Tentative de coup
        try {
            const fromAlg = selectedSquareAlg;
            const fromPiece = learnGame.get(fromAlg);
            const isPawnPromotion = fromPiece &&
                fromPiece.type === 'p' &&
                ((fromPiece.color === 'w' && row === 0) || (fromPiece.color === 'b' && row === 7));

            let moveOptions = {
                from: fromAlg,
                to: clickedAlg
            };
            if (isPawnPromotion) {
                moveOptions.promotion = 'q';
            } else if (targetMoveObject && targetMoveObject.flags.includes('p')) {
                moveOptions.promotion = 'q';
            }

            const move = learnGame.move(moveOptions);

            if (move) { // Coup réussi
                lastMoveHighlight = { from: move.from, to: move.to };
                selectedSquareAlg = null;
                createBoard_Learn(); // Redessine le plateau
                checkGameEndState_Learn(); // Vérifie si la partie est finie

                if (!learnGame.game_over()) {
                    showFeedback(`Coup joué: ${move.san}. Au tour des ${learnGame.turn() === 'w' ? 'Blancs' : 'Noirs'}.`, 'info');
                }

            } else { // Coup illégal selon chess.js
                showFeedback("Coup invalide.", 'error');
            }
        } catch (e) { // Erreur inattendue de chess.js
            console.error("Error making move in guided mode:", e);
            showFeedback("Erreur lors du déplacement.", 'error');
            selectedSquareAlg = null; // Désélectionner en cas d'erreur grave
            highlightMoves_Learn([]);
            createBoard_Learn();
        }

    } else if (pieceOnSquare && pieceOnSquare.color === currentTurn) {
        // --- Sélection d'une pièce ---
        selectedSquareAlg = clickedAlg;
        const legalMoves = learnGame.moves({ square: clickedAlg, verbose: true });
        createBoard_Learn(); // Redessine pour montrer 'selected' et highlights
        highlightMoves_Learn(legalMoves); // Montre les coups légaux
    } else {
        // Clic invalide (case vide ou pièce adverse sans sélection)
        selectedSquareAlg = null;
        highlightMoves_Learn([]);
        createBoard_Learn();
    }
}

// Vérifie l'état de fin de partie en mode guidé
function checkGameEndState_Learn() {
    if (!learnGame.game_over()) return;

    let endMessage = "Partie terminée.";
    if (learnGame.in_checkmate()) {
        endMessage = `Échec et Mat! ${learnGame.turn() === 'b' ? 'Les Blancs' : 'Les Noirs'} gagnent.`;
    } else if (learnGame.in_stalemate()) {
        endMessage = "Pat! Partie nulle.";
    } else if (learnGame.in_draw()) {
        endMessage = "Partie Nulle (Règle des 50 coups, répétition ou matériel insuffisant).";
    }
    showFeedback(endMessage, "info");
    lessonState = 'ended'; // Marquer comme terminée
}

// --- Board Interaction (Lesson Specific) ---
function handleSquareClick_Learn(event) {
    // Si en mode guidé, utiliser la fonction dédiée
    if (isGuidedMode || lessonState === 'guided') {
        handleGuidedMove(event);
        return;
    }

    // Logique pour les leçons interactives
    const lesson = lessons[currentLessonIndex];
    // Ignorer si leçon non interactive, terminée, ou erreur
    if (!lesson || !lesson.interactive || lessonState === 'completed' || lessonState === 'error') return;

    const square = event.currentTarget;
    const row = parseInt(square.dataset.row);
    const col = parseInt(square.dataset.col);
    const clickedAlg = files[col] + (8 - row);
    const pieceOnSquare = learnGame.get(clickedAlg);
    const currentTurn = learnGame.turn(); // 'w' ou 'b'

    clearFeedback(); // Effacer l'ancien feedback

    if (selectedSquareAlg) {
        // --- Pièce déjà sélectionnée ---
        const fromAlg = selectedSquareAlg;
        const fromPiece = learnGame.get(fromAlg);
        const isPawnPromotion = fromPiece &&
            fromPiece.type === 'p' &&
            ((fromPiece.color === 'w' && row === 0) || (fromPiece.color === 'b' && row === 7));

        const isClickingSameSquare = (clickedAlg === fromAlg);

        // Si on clique sur la même case, on désélectionne
        if (isClickingSameSquare) {
            selectedSquareAlg = null;
            highlightMoves_Learn([]); // Efface les highlights de coups
            createBoard_Learn(); // Redessine pour enlever le 'selected'
            return;
        }

        // Tenter de jouer le coup (fromAlg -> clickedAlg)
        let targetMoveObject = null;
        try {
            // Vérifier si le coup est légal D'ABORD
            const legalMovesForPiece = learnGame.moves({ square: fromAlg, verbose: true });
            targetMoveObject = legalMovesForPiece.find(move => move.to === clickedAlg);

            if (targetMoveObject) {
                // Le coup est légal selon les règles des échecs.
                // Maintenant, vérifier s'il correspond à l'objectif de la leçon.
                let isValidForLesson = false;
                if (lesson.allowedMoves) {
                    // Vérifier si le SAN du coup légal est dans la liste des coups autorisés par la leçon
                    isValidForLesson = lesson.allowedMoves.includes(targetMoveObject.san);
                } else {
                    // Si pas de allowedMoves, on considère tout coup légal comme valide pour la leçon (moins strict)
                    // Ou on pourrait avoir une fonction lesson.validateMove(targetMoveObject) ici
                    isValidForLesson = true; // Par défaut, si légal, c'est ok pour la leçon
                }

                // Exécuter le coup dans chess.js
                let moveOptions = {
                    from: fromAlg,
                    to: clickedAlg
                };
                if (isPawnPromotion) {
                    moveOptions.promotion = 'q';
                } else if (targetMoveObject && targetMoveObject.flags.includes('p')) {
                    moveOptions.promotion = 'q';
                }

                const moveResult = learnGame.move(moveOptions);

                if (moveResult) {
                    // Coup réussi dans chess.js
                    lastMoveHighlight = { from: moveResult.from, to: moveResult.to };
                    selectedSquareAlg = null; // Désélectionner logiquement
                    createBoard_Learn(); // Redessiner le plateau après le coup

                    if (isValidForLesson) {
                        completeLessonStep(); // Le coup est légal ET correspond à l'objectif
                    } else {
                        // Le coup était légal mais pas celui attendu pour la leçon
                        showFeedback("C'est un coup légal, mais ce n'est pas l'objectif de cette leçon. Essayez autre chose.", 'error');
                        // Annuler le coup pour permettre à l'utilisateur de réessayer
                        learnGame.undo();
                        lastMoveHighlight = null; // Effacer le highlight du coup annulé
                        createBoard_Learn(); // Redessiner pour revenir à l'état précédent
                    }
                } else {
                    // Devrait être impossible si targetMoveObject a été trouvé, mais sécurité
                    showFeedback("Erreur inattendue lors de la tentative de coup.", 'error');
                    selectedSquareAlg = null;
                    highlightMoves_Learn([]);
                    createBoard_Learn();
                }

            } else {
                // Le coup fromAlg -> clickedAlg n'est pas légal.
                // Vérifier si on a cliqué sur une autre pièce de la même couleur.
                 if (pieceOnSquare && pieceOnSquare.color === currentTurn) {
                     // Oui, changer la sélection vers cette nouvelle pièce
                     selectedSquareAlg = clickedAlg;
                     highlightMoves_Learn([]); // Effacer anciens highlights
                     const newMoves = learnGame.moves({ square: clickedAlg, verbose: true });
                     createBoard_Learn(); // Redessiner (enlève ancienne sélection, ajoute nouvelle)
                     highlightMoves_Learn(newMoves); // Afficher nouveaux coups
                 } else {
                     // Non, cliqué sur case vide ou pièce adverse (destination illégale)
                     showFeedback("Ce coup n'est pas autorisé.", 'error');
                 }
            }

        } catch (e) {
            console.error("Error during move attempt:", e);
            showFeedback("Une erreur s'est produite.", 'error');
            selectedSquareAlg = null;
            highlightMoves_Learn([]);
            createBoard_Learn();
        }

    } else if (pieceOnSquare && pieceOnSquare.color === currentTurn) {
        // --- Aucune pièce sélectionnée, clic sur une pièce valide ---
        // Vérifier si c'est la pièce imposée par la leçon (si applicable)
        if (lesson.showOnlyLegalMovesFor && lesson.showOnlyLegalMovesFor !== clickedAlg) {
            showFeedback(`Pour cette leçon, vous devez interagir avec la pièce en ${lesson.showOnlyLegalMovesFor}.`, 'error');
            return; // Ne pas sélectionner la mauvaise pièce
        }

        // Sélectionner la pièce
        selectedSquareAlg = clickedAlg;
        let moves = learnGame.moves({ square: clickedAlg, verbose: true });

        createBoard_Learn(); // Redessine pour montrer la sélection
        highlightMoves_Learn(moves); // Montre les coups légaux de la pièce sélectionnée

    } else {
        // Clic sur case vide ou pièce adverse sans sélection préalable : ne rien faire
        selectedSquareAlg = null;
        highlightMoves_Learn([]);
        createBoard_Learn();
    }
}


// --- Board Rendering & Highlighting (Learn Specific) ---
function createBoard_Learn() {
    if (!chessboardEl) {
        console.error("Chessboard element (#chessboard) not found!");
        return;
    }
    chessboardEl.innerHTML = ''; // Vider l'ancien plateau
    const boardFragment = document.createDocumentFragment(); // Pour la performance

    let boardData;
    try {
        boardData = learnGame.board(); // Récupère l'état 2D du plateau depuis chess.js
    } catch (e) {
        console.error("Error getting board data from learnGame instance:", e);
        chessboardEl.innerHTML = `<div style="color: red; padding: 20px; text-align: center;">Erreur interne du jeu</div>`;
        return;
    }

    // Récupérer les highlights de la leçon courante (important de le faire ici avant la boucle)
    const currentLesson = lessons[currentLessonIndex];
    let currentHighlights = { piece: [], target: [], allowed: [] }; // Default empty
     if (currentLesson && currentLesson.highlightSquares && (lessonState === 'waiting' || lessonState === 'guided')) { // N'applique les highlights de leçon que si elle n'est pas complétée ou en mode guidé
         currentHighlights = {
             piece: currentLesson.highlightSquares.piece || [],
             target: currentLesson.highlightSquares.target || [],
             allowed: currentLesson.highlightSquares.allowed || [],
         };
     }

    const isBoardFlipped = false; // TODO: Ajouter logique si on veut retourner le plateau pour les noirs

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const rowIndex = isBoardFlipped ? 7 - r : r;
            const colIndex = isBoardFlipped ? 7 - c : c;

            const square = document.createElement('div');
            square.classList.add('square');
            // Couleur de la case
            square.classList.add((rowIndex + colIndex) % 2 === 0 ? 'light' : 'dark');
            // Stocker les coordonnées pour référence
            square.dataset.row = rowIndex; // Stocke la vraie coordonnée (0-7)
            square.dataset.col = colIndex;
            const alg = files[colIndex] + (8 - rowIndex); // Notation algébrique (ex: e4)

            // --- Ajout de la Pièce ---
            const pieceInfo = boardData[rowIndex]?.[colIndex]; // Peut être null
            if (pieceInfo) {
                const pieceElement = document.createElement('div'); // Utiliser div pour contenir img ou texte
                 pieceElement.className = 'piece'; // Classe pour le style de base

                if (pieceRenderMode === 'ascii') {
                    const pieceSymbol = pieces[pieceInfo.color === 'w' ? pieceInfo.type.toUpperCase() : pieceInfo.type.toLowerCase()];
                    pieceElement.textContent = pieceSymbol || '?';
                    pieceElement.classList.add(pieceInfo.color === 'w' ? 'white-piece' : 'black-piece');
                } else { // Mode PNG (par défaut)
                    const img = document.createElement('img');
                    const colorPrefix = pieceInfo.color === 'w' ? 'w' : 'b';
                    const pieceCode = pieceInfo.type.toLowerCase(); // ex: p, n, b, r, q, k
                    const filename = `pieces/${colorPrefix}${pieceCode}.png`; // ex: wp.png, bn.png
                    img.src = filename;
                    img.alt = pieceInfo.color === 'w' ? pieceInfo.type.toUpperCase() : pieceInfo.type.toLowerCase(); // ex: P, n
                    img.draggable = false; // Empêcher le drag natif
                     img.onerror = () => { // En cas d'image manquante
                         console.warn(`Image not found: ${filename}`);
                         img.alt = `(${img.alt})`; // Montrer le alt text
                         // Remplacer par ASCII si l'image manque?
                          const pieceSymbol = pieces[img.alt];
                          img.remove(); // Retire l'image cassée
                          pieceElement.textContent = pieceSymbol || '?';
                           pieceElement.classList.add(pieceInfo.color === 'w' ? 'white-piece' : 'black-piece');
                     };
                     pieceElement.appendChild(img);
                }
                 square.appendChild(pieceElement);
            }

            // --- Application des Highlights ---

            // 1. Highlights spécifiques à la leçon (uniquement si leçon en cours)
            if (lessonState !== 'completed' && lessonState !== 'ended') {
                if (currentHighlights.piece.includes(alg)) {
                    square.classList.add('highlight-lesson-piece');
                }
                if (currentHighlights.target.includes(alg)) {
                    square.classList.add('highlight-lesson-target');
                }
                if (currentHighlights.allowed.includes(alg)) {
                    // Ne pas ajouter 'highlight-lesson-allowed' directement si on veut utiliser
                    // les points/cercles standards pour les coups permis.
                    // On les ajoutera via highlightMoves_Learn si la pièce est sélectionnée.
                    // Sinon, si on veut un fond différent:
                    // square.classList.add('highlight-lesson-allowed');
                }
            }

            // 2. Highlight du dernier coup joué
            if (lastMoveHighlight && (alg === lastMoveHighlight.from || alg === lastMoveHighlight.to)) {
                square.classList.add('last-move');
            }

            // 3. Highlight de la case sélectionnée
            if (selectedSquareAlg === alg) {
                square.classList.add('selected');
            }

            // 4. Highlight du roi en échec (si applicable)
             if (learnGame.in_check()) {
                 const kingColor = learnGame.turn(); // Roi en échec est celui dont c'est le tour
                 const kingSquare = findKingSquare(kingColor);
                 if (alg === kingSquare) {
                     square.classList.add('in-check');
                 }
             }


            // Ajouter l'écouteur de clic (uniquement si leçon interactive ou mode guidé et partie non finie)
            if ((currentLesson?.interactive && lessonState !== 'completed' && lessonState !== 'error') || (isGuidedMode && lessonState !== 'ended')) {
                square.addEventListener('click', handleSquareClick_Learn);
                square.style.cursor = 'pointer';
            } else {
                square.style.cursor = 'default';
            }

            boardFragment.appendChild(square);
        }
    }
    chessboardEl.appendChild(boardFragment);

    // Ré-appliquer les highlights de coups possibles si une pièce est sélectionnée
    if (selectedSquareAlg) {
        const movesToShow = learnGame.moves({ square: selectedSquareAlg, verbose: true });
         // Optionnel : Filtrer les coups montrés selon la leçon
         let filteredMoves = movesToShow;
          if (currentLesson?.interactive && lessonState !== 'completed') {
              // Si la leçon spécifie allowedMoves, ne montre que ceux là
             if (currentLesson.allowedMoves) {
                 filteredMoves = movesToShow.filter(m => currentLesson.allowedMoves.includes(m.san));
             }
             // Si la leçon spécifie des target squares, ne montre que les coups vers ces cases
             else if (currentHighlights.target.length > 0) {
                  filteredMoves = movesToShow.filter(m => currentHighlights.target.includes(m.to));
             }
              // Si la leçon spécifie des allowed squares, montre les coups vers ces cases
              // (Note: 'allowed' dans highlightSquares est un peu ambigu, s'il signifie juste 'cases où on peut aller'
              // alors ce filtrage est pertinent)
              else if (currentHighlights.allowed.length > 0) {
                  filteredMoves = movesToShow.filter(m => currentHighlights.allowed.includes(m.to));
              }
          }
        highlightMoves_Learn(filteredMoves);
    }
}


// Met en surbrillance les cases de destination possibles pour une pièce sélectionnée
function highlightMoves_Learn(moves) {
    if (!chessboardEl) return;
    // Effacer les highlights de coups précédents (laisse les highlights de leçon/selection/lastmove)
    chessboardEl.querySelectorAll('.square.highlight, .square.capture, .square.en-passant-target').forEach(sq => {
        sq.classList.remove('highlight', 'capture', 'en-passant-target');
    });

    moves.forEach(move => {
        const coord = algToCoord(move.to);
        if (!coord) return;
        const square = chessboardEl.querySelector(`.square[data-row="${coord[0]}"][data-col="${coord[1]}"]`);
        if (square) {
            // Utiliser les classes CSS standards 'highlight' (pour coup normal) et 'capture'
            square.classList.add(move.flags.includes('c') ? 'capture' : 'highlight');
             // Style spécial pour la cible en passant?
             if (move.flags.includes('e')) {
                 square.classList.add('en-passant-target'); // Ajoute classe spécifique si besoin
             }
        }
    });
}

// --- Helpers ---
// Convertit la notation algébrique (ex: 'e4') en coordonnées [row, col] (ex: [4, 4])
function algToCoord(alg) {
    if (!alg || alg.length < 2) return null;
    const col = files.indexOf(alg[0]);
    const row = 8 - parseInt(alg[1]);
    if (col === -1 || isNaN(row) || row < 0 || row > 7) {
        console.warn(`Invalid algebraic notation: ${alg}`);
        return null;
    }
    return [row, col];
}

// Trouve la case du roi d'une couleur donnée
function findKingSquare(color) { // color = 'w' or 'b'
     const kingType = color === 'w' ? 'k' : 'k'; // Cherche 'k' dans tous les cas
     const board = learnGame.board();
     for (let r = 0; r < 8; r++) {
         for (let c = 0; c < 8; c++) {
             const piece = board[r][c];
             if (piece && piece.type === 'k' && piece.color === color) {
                 return files[c] + (8 - r); // Retourne la notation alg
             }
         }
     }
     return null; // Roi non trouvé (ne devrait pas arriver dans une partie normale)
 }


console.log("Learn page script (learn.js) loaded and executed.");