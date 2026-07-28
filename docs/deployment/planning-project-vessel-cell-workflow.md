# Planning — projets depuis une case navire

Date : 28 juillet 2026.

## Parcours livré

- Un double-clic sur une case de la ligne d’un navire ouvre le catalogue des projets.
- Le catalogue accepte une recherche par code, titre, client, statut ou description.
- Le catalogue et le portefeuille Projets classent les codes par leur partie numérique, du numéro le plus élevé en haut au plus petit en bas, indépendamment du préfixe (`P`, `SP`, etc.).
- La sélection d’un projet crée une occurrence opérationnelle d’un jour, liée au projet catalogue et positionnée sur le navire et la date choisis.
- Le bouton `Créer un nouveau projet` affiche uniquement la carte `1 Identification`.
- La création rapide enregistre atomiquement le projet catalogue et sa première occurrence Planning.
- La carte Identification peut être repliée et dépliée. Les blocs Planning produits conservent le déplacement par glisser-déposer, les poignées d’extension et le repli des lignes navire déjà en place.
- Lorsque plusieurs projets se chevauchent sur une même ligne navire, le Planning les répartit automatiquement sur des sous-lignes successives. Une sous-ligne libérée est réutilisée pour le projet suivant et les visites navire restent affichées sous l’ensemble des projets.

## Permissions

| Profil | Catalogue et recherche | Création / ajout | Déplacement / extension |
|---|---:|---:|---:|
| Admin | Oui | Oui | Oui |
| Direction | Oui | Oui | Oui |
| Armement | Oui | Oui | Oui |
| Capitaine | Oui, lecture seule | Non | Non |
| Marin | Oui, lecture seule | Non | Non |

Les contrôles sont appliqués dans l’interface et dans les fonctions Supabase. Les écritures ne reposent donc pas uniquement sur des boutons désactivés.

## Migration Supabase

La migration `202607280002_planning_project_cell_workflow.sql` ajoute cinq RPC limitées à la société active. La migration `202607280003_project_catalog_numeric_order.sql` aligne ensuite l’ordre serveur du catalogue sur la partie numérique décroissante des codes :

- `planning_project_catalog`
- `planning_project_clients`
- `planning_create_project_client`
- `planning_schedule_catalog_project`
- `planning_create_and_schedule_project`

Les deux fonctions de lecture n’exposent que les champs nécessaires au sélecteur. Les fonctions d’écriture exigent l’un des rôles `admin`, `direction` ou `armement`.

## Vérification

Les tests couvrent :

- l’ouverture du sélecteur depuis une case navire ;
- la recherche et la sélection d’un projet ;
- l’ordre numérique décroissant avec des préfixes de projet différents ;
- la création avec la seule carte Identification ;
- le repli et le dépliage de la carte ;
- l’empilement vertical des projets qui se chevauchent et la réutilisation d’une sous-ligne libre ;
- le mode lecture seule ;
- les contrats d’appel des RPC et la mise à jour immédiate du Planning.
