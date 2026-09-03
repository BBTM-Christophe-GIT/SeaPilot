# Déploiement pièces jointes et bibliothèque — v3.28.8

## Résultat

- Les procédures et certificats liés à une note ouvrent directement leur fichier publié dans un nouvel onglet.
- Le menu de téléchargement propose la note PDF seule, les pièces jointes seules, ou une archive ZIP complète.
- Après diffusion depuis l'éditeur, la bibliothèque revient sur `Diffusées`, efface les filtres et sélectionne la nouvelle note.
- La note de production `NS 07-26 — Mise à jour du DUP de KROKDUR` a été contrôlée : elle est publiée, classée sous KROKDUR et possède quatre destinataires ainsi qu'une procédure PDF liée.

## Vérifications attendues

- Tests unitaires des URL signées, du téléchargement original et des archives ZIP.
- Test rendu du clic sur une procédure liée sans navigation vers le module Procédures.
- Test rendu du retour automatique vers la bibliothèque après diffusion.
- Validation ESLint, suite Vitest complète, build de production et contrôle Playwright bureau/mobile.
