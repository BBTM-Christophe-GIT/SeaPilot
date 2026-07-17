# Planning v3.4.2 — persistance visuelle, conflits, performance et STCW

## Correctifs

- Les périodes historiques sans `planning_assignments.id` restent visibles avec leur couleur métier dans l’arborescence flotte. La barre n’est transparente que lorsqu’une grille quotidienne colorée la remplace réellement.
- Le clic gauche sur une case en conflit ouvre le workflow de priorisation même après une opération copier/couper. Le clic droit, le double-clic, le déplacement et le redimensionnement restent inchangés.
- La peinture continue au pointeur est remplacée par un double-clic unitaire sur les cases vides ; le glissement maintenu sert désormais au défilement horizontal et vertical de la grille.
- Les calculs de couverture d’une ligne (jours occupés, navire et fonction) sont mémorisés entre les rendus.

## Catalogue STCW

La migration `202607140006_planning_stcw_board_daily_state.sql` est déjà appliquée en production et le catalogue `public.stcw_certificates` contient 54 lignes actives provenant de la liste SharePoint `8c8561d7-9fb4-420f-8290-b66309d07e92`.

La migration `202607150002_planning_performance_stcw_confirmation.sql` ne duplique pas ces données. Elle contrôle qu’au moins 54 éléments actifs sont présents avant de marquer la source d’inventaire `lookup-brevet` comme confirmée. Ainsi, l’administration ne présente plus à tort le catalogue Brevet comme « À confirmer ».

## Performance SQL

La migration ajoute trois index de lecture, compatibles avec les politiques RLS par entreprise :

- `planning_days (company_id, work_date, crew_name)` ;
- `planning_periods (company_id, starts_on, crew_name)` ;
- `planning_change_log (company_id, changed_at desc)`.

## Application

1. Sauvegarder les tables `sharepoint_sources`, `stcw_certificates`, `planning_days`, `planning_periods` et `planning_change_log`.
2. Exécuter `supabase db push --linked`.
3. Vérifier que la migration locale et distante `202607150002` est alignée.
4. Vérifier que `public.stcw_certificates` contient au moins 54 lignes actives pour la liste source.
5. Vérifier dans Administration que la source Brevet est « Confirmée ».
6. Ouvrir Planning et contrôler une période historique, un conflit et une sélection continue.

## Retour arrière

En cas de régression du plan d’exécution, supprimer uniquement les trois index `*_read_idx`. Pour retirer la confirmation d’inventaire, remettre `sharepoint_sources.confirmed` à `false` pour `lookup-brevet`. Les 54 lignes STCW ne doivent être supprimées que si le référentiel est explicitement retiré après export ; cette migration ne les modifie pas.
