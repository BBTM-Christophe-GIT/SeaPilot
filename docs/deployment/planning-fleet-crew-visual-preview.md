# Preview — harmonisation visuelle Flotte / Équipages

## Objectif

La vue Flotte reprend la densité et le langage visuel de la vue Équipages sans modifier son arborescence navire → bordée → marin ni ses règles métier.

## Changements visibles

- lignes navire, bordée et marin plus compactes ;
- accent vert d’eau commun à la vue Équipages ;
- compteurs, chevrons et actions contextuelles harmonisés ;
- barres de projet fines, centrées et dotées des mêmes poignées discrètes que les affectations ;
- affectations quotidiennes rendues comme une barre continue de 23 px, sans séparation visuelle entre les jours de même statut/commentaire ;
- nom du navire centré sur la barre lorsqu’aucun commentaire quotidien visible ne doit prendre sa place ;
- boutons quotidiens conservés au-dessus de la barre pour l’édition d’un jour ou du groupe ;
- états de survol, sélection et dépôt rendus plus légers.

## Interactions conservées

- clic gauche : sélection d’une barre ou d’une case ;
- clic droit : ouverture du statut et du commentaire sur les affectations de la grille ;
- double-clic : ouverture du formulaire complet ;
- glisser-déposer : déplacement d’un projet ou affectation d’un marin ;
- poignées gauche et droite : redimensionnement des périodes.

## Déploiement

Le changement ne nécessite ni migration Supabase ni nouvelle variable d’environnement. Il doit rester sur un déploiement Vercel Preview jusqu’à validation explicite du rendu par l’utilisateur ; aucun déploiement de production ne doit être lancé avant cette validation.

## Contrôles de preview

1. Ouvrir `/modules/planning` en mode preview avec la vue Flotte active.
2. Comparer la densité des lignes et des barres avec la vue Équipages.
3. Vérifier que les cases vertes forment une barre fine et continue, sans séparation entre les jours de même statut/commentaire.
4. Vérifier que le navire est centré lorsque la barre ne contient aucun commentaire quotidien visible.
5. Vérifier le clic gauche, le clic droit et le double-clic sur une affectation Flotte.
6. Depuis le clic droit, modifier le statut/commentaire du jour puis appliquer une autre modification à tout le groupe.
7. Vérifier le clic gauche et le double-clic sur un projet Flotte.
8. Déplacer puis redimensionner une barre dans les deux sens.
9. Replier et déplier un navire puis une bordée.
10. Contrôler l’absence de chevauchement à 1440 × 900 et 1366 × 1024.
