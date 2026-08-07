# Design QA - Daily Progress Report v3.7.8

## Comparison targets

### Menu ribbon

- Source visual truth: `C:/CODEX/SeaPilot/tmp/design/planning-menu-reference.png`
- Implementation screenshot: `C:/CODEX/SeaPilot/tmp/design/dpr-menu-implementation.png`
- Viewport and state: same in-app browser tab, 1265 x 712 capture, desktop preview dataset, no modal open.
- Comparison evidence: both captures were opened together in the same visual comparison input.

### Generated PDF

- Source visual truth: `C:/CODEX/SeaPilot/tmp/pdfs/goury-january-reference/page.png`
- Implementation render: `C:/CODEX/SeaPilot/tmp/pdfs/dpr-1071-reference-layout.png`
- Rasterization: Poppler at 72 dpi, one portrait page measuring 1896 x 2667.12 points.
- Comparison evidence: both full-page renders were opened together in the same visual comparison input.

## Findings

No actionable P0, P1 or P2 mismatch remains.

- The DPR menu uses the same ribbon component classes, two-row command grid, group separators, icon sizing, badges,
  active state, borders, radius and horizontal overflow behavior as the Planning menu.
- `Saisir un DPR` is the first command in the `DPR` group. `Production` and `Outils` preserve the same visual grammar.
- The PDF reproduces the supplied report frame: BBTM logo, oversized portrait canvas, project/date header, grey mission
  and QHSE section bars, two-column mission content, leading indicators, incident categories and italic footer.
- The exact source logo extracted from the user-provided PDF is reused. Interface icons remain from the project's
  Lucide library.
- Dynamic report values use the selected DPR payload; the filename repeats its DPR number, vessel and date.
- PDF and ZIP generation remain browser-local and create no Supabase object or PDF metadata.

## Interaction verification

- `Saisir un DPR` opens the six-step DPR dialog and the close action restores the workspace.
- Selecting the `P902` project group selects two reports and prepares the matching `DPR-1062 - 01/08/2026` preview.
- Production actions are disabled without a selection and become available from the selected group.
- Browser console errors: none.

## PDF verification

- One page, portrait, 1896 x 2667.12 points.
- Stable filename: `DPR-1071 - GOURY - 29-07-2026.pdf` for the fixture.
- Final Poppler PNG inspection: no clipping, overlap, missing asset, broken glyph or off-page content.

final result: passed

---

# Design QA — Suivi du Temps de Travail v3.12.13

## Cibles de comparaison

- Référence utilisateur : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-bbf54d38-a41a-4189-bc1b-0fa97e04880e.png`.
- Capture 15 pouces : `C:/Users/chris/AppData/Local/Temp/working-time-timeline-v3-12-13-1366x768.png`.
- Capture 32 pouces 4K : `C:/Users/chris/AppData/Local/Temp/working-time-v3-12-13-3840x2160.png`.
- La référence et la capture 1366 × 768 ont été ouvertes ensemble dans la même
  comparaison visuelle.

## Résultat visuel

- Le doublon de période visible dans la référence est remplacé par une seule carte
  par marin, qualifiée par le mois affiché et son statut.
- La recherche par nom ou fonction est placée directement au-dessus du catalogue.
- La frise est prioritaire dans la carte de saisie ; elle affiche les 24 repères de
  00 h à 23 h, les 48 demi-heures et le repère terminal 24 h.
- À 1366 × 768, la frise mesure 613 px de large, son `scrollWidth` reste égal à son
  `clientWidth` et aucun libellé horaire ne se chevauche.
- À 3840 × 2160, la page utilise une surface centrale de 1800 px ; la frise mesure
  1085 px et conserve la même hiérarchie sans étirement excessif.
- Les indicateurs sont placés sous la frise. Les signatures passent en disposition
  verticale avant que la zone de saisie ne devienne trop étroite.
- Aucun défaut P0, P1 ou P2 ne reste visible.

## Vérification des interactions

- Deux glisser-déposer disjoints ont produit `05:00–07:00` et `18:00–20:00`, puis le
  bouton unique a affiché « Enregistrer la sélection · 2 périodes ».
- La recherche `Luc` a réduit le catalogue à la seule carte `Luc MARTIN`.
- La navigation ouvre directement le mois courant et les 31 jours restent
  accessibles dans le bandeau horizontal des jours.
- L'onglet Notifications affiche une alerte critique de temps de travail et de repos
  avec les valeurs 24 h et 7 jours.
- Après ajout des RPC de prévisualisation en lecture seule, le rechargement de la
  page ne produit aucune erreur ni aucun avertissement dans la console.

final result: passed

---

# Design QA - Suivi du Temps de Travail v3.12.12

## Cible et comparaison PDF

- Référence maritime fournie : `C:/Users/chris/AppData/Local/Temp/codex-clipboard-0d8e6851-6dfa-48a2-a8a0-7ff046bb7668.png`.
- Rendu SeaPilot : `C:/CODEX/SeaPilot/tmp/pdfs/working-time-register-1.png`.
- Comparaison côte à côte : `C:/CODEX/SeaPilot/tmp/pdfs/working-time-reference-comparison.png`.
- Rasterisation : Poppler à 150 dpi, registre A4 paysage sur la première page et synthèse A4 portrait sur la seconde.

## Résultat

- La première page reprend la structure de la référence : 24 heures divisées en demi-heures, 31 lignes journalières,
  repos sur 24 heures, commentaires, contrôles sur 24 heures et 7 jours et rappel « À ne pas remplir par le marin ».
- Les données disponibles complètent l’en-tête : marin, fonction, mois, navire, OMI, pavillon, validateur et statut.
- Les phases travaillées, les non-conformités et les cumuls sont lisibles sans chevauchement ni texte tronqué.
- La seconde page conserve les commentaires structurés, l’approbation XLSM ou les signatures figées et le journal d’audit.
- Aucun défaut P0, P1 ou P2 n’est visible sur le rendu final.

## Vérification de l’interface

- Vue locale contrôlée à 1920 x 1080 : la frise affiche les 24 heures sans défilement horizontal.
- La croix de retrait est visible en haut à droite de chaque carte `Brouillon` et porte un libellé ARIA nominatif.
- La sélection directe, les indicateurs et le panneau titulaire restent alignés dans la largeur utile.
- Le dialogue de confirmation est déclenché avant tout retrait ; le RPC et le rafraîchissement sont couverts par les tests automatisés.
- Erreurs de console observées pendant le chargement et la vérification : aucune.

final result: passed
