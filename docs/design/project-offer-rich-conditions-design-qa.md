# Revue visuelle — conditions de l’offre commerciale

## Sources

- Référence utilisateur : `docs/design/project-offer-rich-conditions-source.png` (753 × 928 px).
- Implémentation : `docs/design/project-offer-rich-conditions-implementation.jpg` (1 265 × 710 px).
- Variante libre : `docs/design/project-offer-free-conditions-implementation.jpg` (1 265 × 710 px).
- Sélecteur de langue : `docs/design/project-offer-language-dialog.jpg` (1 265 × 710 px).
- Comparaison combinée : `docs/design/project-offer-rich-conditions-comparison.png`.

## État vérifié

- URL locale : `http://127.0.0.1:4180/modules/projects?preview=1`.
- Profil de démonstration : Administrateur.
- Projet : P901, converti temporairement en Offre Commerciale dans l’éditeur sans enregistrer.
- Étape : Offre Commerciale.
- Largeur de fenêtre : 1 265 px ; hauteur : 710 px.

## Comparaison et contrôle

La hiérarchie tarifaire de la référence est conservée : montant suivi de sa description, puis mobilisation, démobilisation et devise. Les zones de description deviennent des éditeurs enrichis clairement identifiés ; Aptos est la police sélectionnée par défaut. Le nouveau choix de présentation précède les conditions et explique que les données masquées restent conservées. La variante libre remplace proprement la grille tarifaire par un éditeur ample et une zone d’annexes, sans modifier la navigation ni les actions de sauvegarde.

Les espacements, bordures, rayons, couleurs et états sélectionnés reprennent les composants existants de SeaPilot. Aucun contenu n’est rogné dans la zone de saisie ; la barre d’outils revient sur deux lignes dans la colonne étroite sans chevauchement. L’aperçu contractuel se met à jour lors du basculement de mode et affiche le contenu libre.

## Interactions contrôlées

- bascule Conditions détaillées / Description libre et annexes ;
- conservation visuelle du parcours Projet et de l’aperçu ;
- saisie d’un exemple dans le champ libre ;
- présence de l’ajout de fichiers ;
- retour au mode détaillé et présence des trois éditeurs Aptos ;
- ouverture de la fenêtre d’émission et sélection English ;
- rendu du PDF anglais de recette en A4 (une page), puis inspection visuelle de l’image Poppler à 150 dpi : aucun chevauchement, texte tronqué ou saut de page parasite ;
- journal navigateur sans erreur, uniquement les messages de développement Vite/React.

## Point d’exploitation

Le poste de recette ne possède pas Aptos (`document.fonts.check("16px Aptos") === false`). L’interface sélectionne bien Aptos par défaut, mais la génération PDF réelle est volontairement bloquée sur un poste ne disposant pas de la police afin d’éviter une substitution silencieuse. Les tests PDF utilisent le rendu enrichi simulé pour contrôler le document complet ; le moteur réel force Aptos sur tous les descendants du contenu enrichi. La recette de production doit être menée sur un poste Microsoft 365 où Aptos est installée.

final result: passed
