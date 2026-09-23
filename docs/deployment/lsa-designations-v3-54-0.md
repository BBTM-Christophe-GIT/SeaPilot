# Désignations LSA — v3.54.0

La fiche matériel propose les 16 désignations demandées, réparties dans Gilets de Sauvetage, GMDSS, Navigation, Pyrotechnie et Survie. Les groupes et leurs désignations sont triés en français. Le choix détermine le type et le prochain numéro du navire : `Feu à main - 01`, `02`, puis `100` sans troncature. Marque, modèle et numéro de série complètent la recherche et les détails de la fiche.

Lieu du contrôle, contrôle prévu, date d’émission, suivi du renouvellement et prestataire ne sont plus saisis. Les anciennes valeurs, les documents, les événements de renouvellement et les libellés importés restent conservés en base. Seule la date d’échéance déclenche l’alarme LSA à J−90 ; une échéance dépassée est signalée en rouge. Une date absente ne crée pas une fausse alarme de document manquant. Les autres registres conservent leurs règles.

## Catalogue et numérotation

Les tables `lsa_equipment_types` et `lsa_designations` appartiennent à une société. Le catalogue est initialisé pour les sociétés existantes et nouvelles. La consultation respecte l’accès au module. Seul le rôle `admin` de la société active peut appeler `save_lsa_catalog_entry`. Direction et Armement conservent la saisie des fiches ; Marin et Capitaine restent en consultation selon leurs affectations réelles.

Le bouton **Gérer les désignations** permet d’ajouter/renommer un type ou une désignation, de déplacer une désignation et de l’archiver/désarchiver. Les libellés sont uniques dans une société. Les fiches gardent leurs références et leurs numéros après renommage ou archivage. Une sélection archivée ne peut plus être ajoutée sur une nouvelle fiche. Les modifications concurrentes d’une fiche ou d’une entrée du catalogue sont refusées avec une invitation à recharger.

Un compteur privé persistant par société, navire et désignation attribue les numéros dans la transaction de sauvegarde. Un numéro utilisé ne redevient pas disponible après un changement de désignation. Les sauvegardes et les modifications du catalogue partagent un verrou de transaction par société ; un index unique protège aussi les numéros. L’aperçu `lsa_next_item_number` est en lecture seule ; le numéro final est confirmé à l’enregistrement si une autre saisie intervient entre-temps.

## Migration et données existantes

La migration `20260923191859_lsa_designation_catalog.sql` ajoute les champs sans modifier les valeurs des colonnes existantes. Une comparaison de toutes les anciennes colonnes avant/après fait échouer la migration si elles diffèrent. Les libellés d’origine sont également conservés dans `original_designation`.

Les correspondances sûres (EPIRB, SART, Feu à main rouge, Fusée à parachute, Lampe flash, Lampe à éclat, Fumigène flottant) reprennent leurs numéros existants. Les libellés sans correspondance sûre, notamment VFI 275N, HRU EPIRB et gilets mousse, ne sont pas assimilés à une désignation différente. Leur formulaire permet de conserver le libellé actuel ou de choisir explicitement une nouvelle désignation.

Appliquer la migration avant le déploiement du client. Un ancien formulaire ouvert demande de recharger lors de sa sauvegarde. Aucun fichier Storage n’est déplacé ou supprimé. Aucun secret ou paramètre d’environnement nouveau n’est nécessaire. En cas de retour arrière, conserver les nouvelles tables et compteurs ; un simple retour à l’ancien formulaire n’est pas compatible avec la nouvelle RPC de saisie.

## Vérifications

- `supabase/tests/lsa_register_access_test.sql` : vrais profils authentifiés Admin, Direction, Armement, Capitaine et Marin, affectations, périmètres navires/sociétés, lecture des documents, refus d’écriture et module masqué.
- `supabase/tests/lsa_designation_catalog_test.sql` : catalogue initial de 5 types/16 désignations, numéros par navire, modification sans renumérotation, changement de désignation sans réemploi, numéro 100, tentative de forcer titre/type/numéro, préservation des anciennes données, isolation des sociétés, renommage/déplacement/archivage et conflits de mise à jour.
- Tests React : liste groupée et triée, champs retirés, saisie et recherche marque/modèle/série, administration et archivage, filtres et documents.
- Tests d’alarme : J−1, J0, J60, J90, J91, statuts importés et ancienne visite planifiée.
- Compilation production, lint et recette navigateur sur ordinateur et mobile. Les démos vérifient la présentation ; elles ne servent pas de preuve des droits Marin/Capitaine.

Recette des données après application : 48 fiches, 3 versions et 3 événements conservés ; les 48 fiches correspondent à leur copie d’origine pour toutes les anciennes colonnes. 34 fiches sont rattachées à une désignation sûre et 14 conservent leur libellé existant. Les compteurs reprennent notamment Feu à main 06, Fusée à parachute 04 et Lampe flash 14 sur LANDEMER.

Les conseils Supabase signalent seulement, pour les nouveaux objets, les [tables privées sans politique RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) (compteurs volontairement inaccessibles hors RPC) et les [index encore inutilisés](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) après création. Aucune politique publique ne donne accès aux compteurs.
