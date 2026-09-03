# Design QA — Création client assistée v3.23.2 (2026-08-30)

## Cibles et état comparés

- Source visuelle : `C:/CODEX/SeaPilot/docs/design/client-postal-location-reference.png` (1 072 × 1 042 px, capture à densité estimée 1,5).
- Source normalisée : `C:/CODEX/SeaPilot/docs/design/client-postal-location-reference-normalized.png` (710 × 690 px).
- Implémentation navigateur : `C:/CODEX/SeaPilot/docs/design/client-postal-location-implementation-final.jpg` (viewport 1 265 × 712 CSS px, densité 1).
- Région d’implémentation normalisée : `C:/CODEX/SeaPilot/docs/design/client-postal-location-implementation-crop.png` (710 × 676 px).
- Comparaison côte à côte ouverte et inspectée : `C:/CODEX/SeaPilot/docs/design/client-postal-location-comparison.png`.
- État : préversion Admin, `Nouveau projet` ouvert, puis `Créer un client`, nom et adresse renseignés, code postal `50340`, liste de 14 communes chargée et `Les Pieux` présélectionnée.

## Findings

Aucun écart P0, P1 ou P2 ne subsiste sur le périmètre demandé.

- Typographie : la famille, les graisses, tailles, interlignages et hiérarchie du dialogue de référence sont conservés.
- Espacement et rythme : la grille à deux colonnes, le champ Adresse pleine largeur, les hauteurs de contrôles, le bloc représentant et le pied de dialogue restent alignés sur la référence.
- Couleurs et tokens : fonds, bordures, texte, focus et case active utilisent exclusivement les tokens SeaPilot existants.
- Images et actifs : aucun nouvel actif raster, pictogramme approximatif ou dessin CSS n’est introduit ; la croix existante est conservée.
- Copie et contenu : `Pays` disparaît du formulaire ; `Code postal` occupe sa place et `Ville` devient une liste déroulante. Le pays détecté reste invisible.
- Responsive : aucun débordement horizontal au viewport contrôlé. Le léger ascenseur interne visible à 712 px de hauteur provient du conteneur de dialogue global ; tous les champs et actions restent visibles et accessibles (P3 accepté).

## Comparaison et historique

La comparaison complète normalisée est suffisamment lisible pour vérifier les libellés, contrôles, espacements et actions ; aucun recadrage ciblé supplémentaire n’était nécessaire.

1. Première passe : le message d’aide postal ajoutait une ligne visible et repoussait `Client actif` sous le pli (P2).
2. Correctif : le message dynamique est conservé pour les lecteurs d’écran mais retiré du flux visuel.
3. Preuve après correctif : `client-postal-location-implementation-final.jpg` montre `Client actif`, le code postal, la liste de villes et les deux actions dans la même vue.

## Interactions et exécution

- Ouverture depuis `Nouveau projet > Ajouter un client ou affréteur`.
- Saisie de `50340`, chargement réel de 14 communes depuis le référentiel officiel et présélection de `Les Pieux`.
- Sélection de `Le Rozel`, enregistrement dans le jeu de préversion puis présélection automatique du nouveau client dans le projet.
- Option `Autre ville…` présente pour la saisie libre et les adresses étrangères.
- Aucun `vite-error-overlay`, aucun débordement horizontal et aucune interaction rejetée pendant la recette.

final result: passed
