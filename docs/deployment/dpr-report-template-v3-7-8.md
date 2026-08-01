# SeaPilot v3.7.8 - Ruban et gabarit DPR

Date de livraison : 1er août 2026.

## Changements livrés

- Le menu Daily Progress Report reprend le ruban du module Planning : commandes à icônes sur deux rangées,
  regroupements et badges homogènes.
- L'action `Saisir un DPR` est intégrée au premier groupe du ruban.
- Les groupes `DPR`, `Production` et `Outils` rassemblent la saisie, les filtres rapides, la prévisualisation,
  les téléchargements et les commandes techniques.
- Le PDF DPR adopte le gabarit de la pièce `GOURY - DPR - Janvier 2026.pdf` : format portrait
  1896 x 2667,12 points, logo BBTM, en-tête projet/date, blocs mission et QHSE, et pied de page auteur/date.

## Invariant de stockage

La version 3.7.8 ne modifie pas l'invariant introduit en 3.7.7 : les PDF et les ZIP sont générés en mémoire à la
demande, puis proposés au navigateur. Aucun PDF n'est envoyé dans Supabase Storage et aucune métadonnée PDF n'est
créée dans `dpr_files`. Les photos et pièces jointes restent les seuls fichiers persistés par le module.

## Recette de production

1. Ouvrir le module DPR et confirmer que `Saisir un DPR` apparaît dans le ruban.
2. Comparer visuellement le ruban DPR avec celui du Planning.
3. Sélectionner un DPR puis vérifier que la prévisualisation reprend son numéro, sa date, son navire et son projet.
4. Télécharger le PDF et contrôler le format sur une page, le logo, les rubriques `Informations Missions` et
   `Indicateurs QHSE`, puis le pied de page.
5. Sélectionner plusieurs DPR et vérifier que le ZIP contient un PDF distinct par DPR.
6. Confirmer qu'aucun objet PDF n'apparaît dans Supabase après la recette.

Cette évolution ne nécessite aucune migration Supabase supplémentaire.
