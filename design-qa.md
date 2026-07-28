# Design QA — planification d’un projet depuis la ligne du navire

## Sources et état comparé

- Vérité visuelle — catalogue : `C:\Users\chris\.codex\generated_images\019fa953-63a6-7f91-84b6-ea428dd20cfa\call_7cy6M0IJ08NfykY82bLX1btG.png`
- Vérité visuelle — création : `C:\Users\chris\.codex\generated_images\019fa953-63a6-7f91-84b6-ea428dd20cfa\call_g5nBPolFRpxOukQOSrPVmyCa.png`
- Capture navigateur — catalogue : `C:\CODEX\SeaPilot\.design-qa\planning-project-catalog-1280.png`
- Capture navigateur — création : `C:\CODEX\SeaPilot\.design-qa\planning-project-identification-1280.png`
- Comparaison focalisée — catalogue : `C:\CODEX\SeaPilot\.design-qa\planning-project-catalog-comparison-final.png`
- Comparaison focalisée — création : `C:\CODEX\SeaPilot\.design-qa\planning-project-identification-comparison-final.png`
- Route locale : `http://127.0.0.1:4173/modules/planning?preview=1`
- État : profil Admin, ligne navire GOURY, mode modification, premier projet sélectionné dans le catalogue puis carte Identification dépliée.

Les visuels source mesurent `1672 × 941` pixels à densité 1. Le navigateur a été contrôlé à `1672 × 941` CSS px pour la composition générale, puis capturé à `1280 × 720` CSS px pour obtenir les fenêtres complètes sans mosaïque du moteur de capture. Les comparaisons focalisées normalisent les fenêtres elles-mêmes : référence catalogue `926 × 637`, implémentation `920 × 594`; référence création `976 × 760`, implémentation responsive `920 × 680`. Aucun écart signalé ci-dessous ne provient de la densité, du chrome navigateur ou du recadrage.

## Comparaison complète

La composition générale correspond à la cible validée : fond Planning obscurci, fenêtre centrée, en-tête marine, informations navire/date, recherche et action primaire au même niveau, liste de projets, puis pied de fenêtre persistant. L’état de création remplace bien le catalogue par une seule carte « 1 Identification » et conserve les actions en bas.

Les données de prévisualisation contiennent deux projets réalistes au lieu des quatre exemples de la maquette. Cet écart est volontaire et dynamique ; il produit davantage d’espace blanc dans le catalogue mais ne modifie ni la structure, ni la densité d’une ligne, ni les interactions.

## Comparaisons focalisées

Deux comparaisons ciblées étaient nécessaires pour lire précisément les contrôles, bordures, icônes, libellés et états :

- le catalogue confirme la même hauteur de recherche, le même bouton de création, les mêmes cartes sélectionnables, statuts, chevrons et action « Ajouter au planning » ;
- la création confirme la même hiérarchie de titre, la poignée de carte, le numéro d’étape, le code automatique, le nom obligatoire, le client, le statut, la description et les trois actions de pied de fenêtre ;
- la carte se replie et se redéplie sans perdre les valeurs saisies ;
- la fenêtre courte garde désormais son pied d’action entièrement visible et rend le contenu central défilable.

## Surfaces de fidélité

- **Polices et typographie** : famille sans-serif existante de SeaPilot conservée ; hiérarchie, poids, tailles, hauteurs de ligne, troncature et densité correspondent à la cible. Les données dynamiques restent lisibles sans rupture.
- **Espacement et rythme** : fenêtre de 920 px, en-tête de 84 px, grille à deux colonnes, marges, rayons, séparateurs et pied persistant alignés avec le visuel validé. En mode étroit, la grille passe sur une colonne.
- **Couleurs et tokens** : bleu marine, bleu d’action, fonds blanc/gris clair, bordures, états vert/ambre et voile d’arrière-plan reprennent les tokens SeaPilot et la cible.
- **Images et ressources** : la cible ne contient aucune image raster dans le composant. Toutes les icônes utilisent Lucide, déjà présent dans le produit ; aucun SVG artisanal, dessin CSS, emoji ou substitut n’a été ajouté.
- **Copie et contenu** : les libellés français sont cohérents avec la maquette et le domaine : recherche par mot-clé, projet/client/durée/statut, code automatique et action de planification.

## Interactions et accessibilité

- Double-clic sur une cellule de ligne navire testé.
- Recherche « Atlantique », sélection et ajout d’un projet existant testés.
- Création d’un projet, choix du client, description et ajout sur la ligne navire testés.
- Réduction et extension de la carte Identification testées.
- Actions de mutation désactivées en lecture seule couvertes par test automatisé.
- Boutons de cellules navire nommés avec le navire et la date ; fenêtre exposée comme dialogue.
- Vue étroite `390 × 844` contrôlée, ainsi qu’une fenêtre courte `1280 × 720`.
- Aucun log navigateur de niveau `error`.

## Historique de comparaison

### Itération 1 — bloquée

- [P2] À `1280 × 720`, le pied de la création était partiellement masqué par le contenu intrinsèque du formulaire.
- Correction : la fenêtre et le formulaire utilisent désormais des lignes CSS `minmax(0, 1fr)` avec un pied `auto`, ce qui garde les actions visibles et déplace le défilement dans la zone Identification.
- Preuve post-correction : `planning-project-identification-1280.png` montre le pied complet, avec `footer.bottom = 699` pour un viewport haut de 720 px.

### Itération 2 — passée

Aucun écart P0, P1 ou P2 restant. Les différences de codes, noms, dates et volume de projets sont des données dynamiques attendues. L’espace blanc supplémentaire du catalogue de démonstration reste un écart P3 acceptable.

## Vérifications automatisées

- `npm test -- --run` : 76 fichiers, 519 tests réussis.
- `npm run lint` : réussi.
- `npm run build` : réussi.

final result: passed
