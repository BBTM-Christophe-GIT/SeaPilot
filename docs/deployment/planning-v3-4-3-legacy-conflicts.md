# Planning v3.4.3 — conflits avec les périodes historiques

## Objet

Cette livraison corrige le workflow de priorisation lorsqu'un conflit oppose une
affectation native (`planning_assignments`) à une donnée historique encore portée
par `planning_periods` ou `planning_days`.

Le clic gauche ouvre désormais le même dialogue de priorisation pour les trois
sources. La confirmation retire uniquement les dates communes de la ligne non
prioritaire, conserve les dates adjacentes, scinde la période si nécessaire et
enregistre le motif dans `planning_change_log`.

## Migration

Appliquer les migrations dans l'ordre suivant :

1. `202607150002_planning_performance_stcw_confirmation.sql` ;
2. `202607150003_planning_legacy_conflict_resolution.sql`.

La seconde migration crée ou remplace uniquement la fonction
`resolve_planning_grid_conflict_cells(jsonb, text)`. Elle ne modifie aucune donnée
tant qu'un utilisateur ne confirme pas une résolution de conflit. Elle est
rejouable sans danger.

La fonction est `security invoker`, reste limitée à l'entreprise courante,
réutilise les contrôles `planning_user_can('edit_event', ...)` et s'exécute sous
un verrou transactionnel commun aux mutations de grille. Une erreur sur l'une
des sources annule l'ensemble de la résolution.

## Contrôles avant et après déploiement

- Vérifier que la migration `202607150003` figure dans l'historique distant.
- Ouvrir un conflit affectation/période historique par clic gauche.
- Vérifier que toutes les lignes concurrentes sont proposées dans le dialogue.
- Fermer le dialogue sans confirmer lors d'une recette en production afin de ne
  pas modifier les données métier.
- Vérifier que la version affichée est `v3.4.3`.

## Retour arrière

Redéployer le client précédent, puis supprimer la surcharge
`resolve_planning_grid_conflict_cells(jsonb, text)` ou restaurer sa définition
précédente. Les périodes déjà résolues ne doivent pas être restaurées
automatiquement : leur état antérieur et le motif sont disponibles dans
`planning_change_log` et doivent être rétablis au cas par cas après validation
métier.
