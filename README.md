# DFWS Chess

DFWS Chess est un jeu d'échecs premium avec thème clair/sombre, développé avec HTML, CSS et JavaScript. Vous pouvez jouer contre une IA avec différents niveaux de difficulté ou contre un autre humain (en alternant les tours sur le même écran). Le jeu inclut un panneau de statistiques, un historique des mouvements et des minuteries pour les deux joueurs.

## Aperçu

![Menu principal](assets/Mode-selection.png)
*Menu principal du jeu DFWS Chess*

![Échiquier](assets/board.png)
*Échiquier avec interface moderne et animations fluides*

## Fonctionnalités

- **Thèmes clair et sombre** : Basculez entre une interface élégante sombre ou claire
- **Interface moderne et réactive** : Animations fluides et retours visuels
- **Modes de jeu** :
    - Jouer contre une IA avec des niveaux de difficulté ajustables
    - Jouer contre un autre humain sur le même appareil
- **Statistiques en temps réel** : Captures, mouvements et minuteries
- **Historique des coups** : Consultez tous les mouvements joués
- **Retours visuels améliorés** : Mise en surbrillance des mouvements possibles
- **Sons immersifs** : Effets sonores pour les actions du jeu
- **Notifications** : Système de toasts pour les événements importants
- **Support multilingue** : Interface en français

## Comment jouer

1. Ouvrez le fichier `index.html` dans votre navigateur
2. Sélectionnez votre mode dans le menu principal
3. Pour le mode IA, choisissez le niveau de difficulté
4. Jouez en cliquant sur les pièces
5. Suivez les statistiques en temps réel
6. Basculez entre les thèmes via le bouton dédié
7. La partie se termine par mat ou minuterie expirée

## Installation

```bash
git clone https://github.com/dualsfwshield/chess-with-ai.git
cd chess-with-ai
```

## Structure du projet

```
├── index.html          # Interface principale
├── styles.css         # Styles et thèmes
├── scripts-v2.js      # Logique du jeu
├── assets/           # Ressources
└── README.md         # Documentation
```

## Diagramme de flux

```mermaid
flowchart TD
        A[Démarrage] --> B[Menu principal]
        B --> C{Sélection mode}
        C -->|IA| D[Mode IA]
        C -->|Humain| E[Mode 2 joueurs]
        D & E --> F[Initialisation jeu]
        F --> G[Tour joueur]
        G --> H{Fin partie?}
        H -->|Non| G
        H -->|Oui| I[Fin]
```

## Crédits
Développé par DFWS