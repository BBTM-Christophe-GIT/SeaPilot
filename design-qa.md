# Design QA — réorganisation du module Planning

## Sources

- Référence complète fournie : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-1e4b1bab-4fe2-4686-aa2e-50f4b76827ba.png`
- Référence ciblée du bouton `Ajouter un marin` : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-21297579-7dcf-4e48-8ce6-c7e2c60344a1.png`
- Rendu principal : `C:\Users\chris\.codex\visualizations\2026\07\16\019f6c63-0dac-7333-a091-a84d900ff495\planning-module-reorganized.png`
- Comparaison référence / rendu : `C:\Users\chris\.codex\visualizations\2026\07\16\019f6c63-0dac-7333-a091-a84d900ff495\planning-reference-implementation-comparison.jpg`
- Rendu plein écran : `C:\Users\chris\.codex\visualizations\2026\07\16\019f6c63-0dac-7333-a091-a84d900ff495\planning-fullscreen-no-side-panel.png`
- Fenêtre `Ajouter un marin` : `C:\Users\chris\.codex\visualizations\2026\07\16\019f6c63-0dac-7333-a091-a84d900ff495\planning-add-sailor-eligibility-dialog.png`

## État et viewport

- Route : `http://127.0.0.1:4174/modules/planning?preview=1`
- Viewport CSS : 2048 × 1114, identique à la référence affichée.
- État principal : vue Flotte, échelle Mois, arborescence dépliée.
- État secondaire : plein écran puis fenêtre `Ajouter un marin` pour `GOURY · Bordée 2`.
- Données : jeu de démonstration non persistant, complété avec un profil sans date de départ, un profil avec une date future, un profil avec une date passée et une ligne vide.

## Comparaison complète

La référence et la capture de l’implémentation ont été normalisées au même viewport puis ouvertes ensemble. Le calendrier, sa hiérarchie, ses couleurs, ses barres et ses contrôles restent inchangés. La modification visible est limitée à la réorganisation demandée :

- la barre d’actions occupe exactement la largeur de la carte calendrier ;
- le bandeau de diffusion occupe exactement la largeur du volet droit ;
- les deux colonnes commencent et finissent sur les mêmes axes ;
- le bandeau étroit conserve ses informations et son action de diffusion sans débordement ;
- le volet droit disparaît en plein écran, tandis que le calendrier utilise toute la largeur disponible.

## Mesures contrôlées

- Barre d’actions : `x=304`, `largeur=1385`.
- Carte calendrier : `x=304`, `largeur=1385`.
- Bandeau de diffusion : `x=1703`, `largeur=312`.
- Volet `Marins non affectés` : `x=1703`, `largeur=312`.
- Plein écran : volet droit avec `display: none`, grille calendrier sur une colonne de `1892px`.
- Ligne `Alain ANCIEN` : zéro case colorée et bouton de suppression visible.

## Validation fonctionnelle et visuelle

- La fenêtre liste `Alain ANCIEN` (date vide) et `Camille FUTURE` (date future), mais exclut `Étienne PASSÉ` (date passée).
- Un marin déjà présent est désactivé avec le libellé `Déjà présent`.
- Un marin absent dispose de l’action `Ajouter`.
- La ligne persistante vide ne comporte aucune case colorée.
- Le bouton de suppression n’est rendu que pour une ligne vide ; la protection est également appliquée dans la fonction SQL.
- Aucun log navigateur de niveau warning ou error.
- Aucun débordement horizontal détecté sur la barre, le bandeau, le calendrier ou le volet droit.

## Findings

Aucun écart P0, P1 ou P2 restant sur les états contrôlés.

## Résultat

final result: passed
