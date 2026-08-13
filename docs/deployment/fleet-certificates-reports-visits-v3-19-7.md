# Certificats flotte — rapports et visites guidés (v3.19.7)

La version `3.19.7` rend la génération des rapports et la programmation des visites indépendantes de la sélection courante dans l’espace documentaire.

## Rapports

Le bouton « Générer un rapport » ouvre une fenêtre de sélection dédiée. Cinq périmètres sont disponibles :

- toute la flotte ;
- un navire ;
- une catégorie sur l’ensemble de la flotte ;
- un document ;
- un écart.

Les champs Navire, Catégorie, Document et Écart sont affichés selon le périmètre retenu. Un récapitulatif indique avant génération le nombre de navires, de documents et d’écarts inclus.

## Visites prestataires

- Le choix du document suit désormais l’arborescence Navire → Catégorie → Document.
- Chaque document de la bibliothèque propose une action directe « Programmer une visite » à gauche de sa ligne.
- La fenêtre de programmation est structurée en trois étapes : visite, prestataires et créneaux, puis planning et documents.
- La recherche de port, les créneaux multiples et l’export du planning restent disponibles.

## Interface

Le ruban du module a été ramené à environ la moitié de sa hauteur précédente. Les trois commandes restent sur une seule ligne avec leur groupe clairement identifié.

## Validation

- Tests des cinq périmètres de rapport et de la sélection hiérarchique des visites.
- Vérification du bouton de programmation attaché à chaque document.
- TypeScript, lint, tests automatisés et build de production.
- Recette visuelle sur ordinateur et mobile avant déploiement Vercel.
