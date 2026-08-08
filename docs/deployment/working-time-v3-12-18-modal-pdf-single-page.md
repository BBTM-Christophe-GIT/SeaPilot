# Temps de travail v3.12.18 — fenêtres métier et PDF une page

## Contenu

- renommage du filtre « Personnel sorti » en « Personnel ancien » ;
- retrait des commandes « Cockpit métier P1.3 », « Registres » et « Historique » ;
- ouverture de l’import XLSM, de l’exposition HSE / IMCA et des contrôles travail/repos dans des fenêtres modales accessibles depuis la barre de commandes ;
- maintien de l’import strictement réservé au rôle `admin` ;
- export mensuel réduit à une page paysage, avec les deux cases de signature au-dessus de la grille et sans nom de produit.

## Vérifications attendues

1. Un administrateur voit les trois nouvelles commandes et peut ouvrir puis fermer chaque fenêtre avec la croix, la touche Échap ou un clic sur l’arrière-plan.
2. Un marin ne voit pas les commandes Import et HSE / IMCA ; il conserve l’accès autorisé aux contrôles travail/repos.
3. Le filtre affiche « Personnel en poste » et « Personnel ancien ».
4. Le PDF généré contient exactement une page et les deux signatures sont visibles sur cette page.
5. Tests, lint et build de production doivent réussir avant déploiement.
