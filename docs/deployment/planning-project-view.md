# Planning — vue Projet

Le module Planning propose un onglet **Projet**, à côté de Flotte et Équipages. Le calendrier affiche uniquement les navires et leurs projets. Les navires actifs sans projet restent disponibles pour planifier une nouvelle opération ; les navires historiques restent visibles lorsqu'ils portent un projet dans la période affichée.

## Utilisation

- Cliquer sur **+** à côté du navire ou double-cliquer sur une case pour ouvrir le catalogue de projets existant. La case fournit la date et le navire ; le bouton **+** utilise le premier jour de la période visible.
- Le bouton **Nouveau projet**, pour Admin et Direction, ouvre l'assistant du module Projets.
- Double-cliquer sur une barre pour modifier l'opération. Le menu contextuel conserve les détails, la modification, la duplication, les changements de statut, l'annulation et la suppression avec confirmation.
- Le déplacement entre dates/navires et le redimensionnement des périodes utilisent les mêmes traitements que la vue Flotte. Les opérations multi-navires restent synchronisées.
- Les filtres navire, type, statut et responsable, la navigation mensuelle, le zoom, l'actualisation et le plein écran restent disponibles.

## Hauteur sur portable 16 pouces

La vue utilise la hauteur disponible de la fenêtre, après l'en-tête de l'application. Les lignes mesurent 38 px pour un projet simple et ajoutent 27 px par projet simultané. Les projets qui se chevauchent restent distincts. Le ruban général, le panneau opérationnel, les visites, les bordées et les marins sont absents de cette vue.

Le cadre du planning tient dans la fenêtre, avec les commandes et les dates accessibles. Un grand nombre de navires ou de projets simultanés déclenche un défilement interne, sans étirer la page ni masquer les projets. Les dimensions de contrôle sont 1536 × 864 et 1366 × 768, ainsi que 390 × 844 pour le repli mobile. La diagonale physique seule ne détermine pas l'espace disponible : la résolution et le zoom du système interviennent aussi.

## Accès et déploiement

Les droits existants sont conservés : Admin, Direction et Armement peuvent modifier le planning ; Marin et Capitaine consultent le planning diffusé en lecture seule. Les fixtures de ces deux profils vérifient leurs données publiées et l'absence de commandes d'écriture, sans simulation du profil depuis la session administrateur.

Aucune migration, nouvelle dépendance ni variable d'environnement n'est nécessaire. Les lectures et écritures réutilisent les requêtes, RPC et règles RLS existantes.

## Validation

Les tests couvrent les navires vides, les projets multi-navires, les filtres, l'ouverture du catalogue, la modification et la suppression depuis la nouvelle vue, et la lecture seule des profils Marin et Capitaine. La suite existante vérifie aussi le catalogue, les droits et l'empilement des barres. La validation visuelle utilise des données locales de prévisualisation pour le profil gestionnaire.

Contrôle du 16 septembre 2026 sur le build compilé, dans le navigateur intégré :

| Fenêtre | Bas du planning | Hauteur de la page | Résultat |
| --- | ---: | ---: | --- |
| 1536 × 864 | 846 px | 864 px | Aucun débordement vertical |
| 1366 × 768 | 750 px | 768 px | Aucun débordement vertical |
| 390 × 844 | 826 px | 844 px | Aucun débordement de page ; commandes et calendrier défilants |

Les lignes mesurées sont de 38 px, ou 65 px pour deux projets simultanés. Le catalogue s'ouvre depuis le bouton du navire avec la date préremplie. Le menu des projets conserve les actions Modifier, Dupliquer, Statut, Annuler et Supprimer. La console ne contient aucune erreur. Les écritures sont vérifiées par les tests de composants et de requêtes, sans modifier les données réelles pendant le contrôle visuel.
