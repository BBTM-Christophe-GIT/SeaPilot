# Planning — chargement de l’historique (v3.39.1)

## Symptôme et diagnostic

L’ouverture du Planning pouvait afficher « Impossible de charger l’historique du Planning. ». La requête
PostgREST lit les 250 événements les plus récents de `planning_change_log`, dans l’ordre décroissant de
`changed_at`, tout en appliquant les politiques RLS ligne par ligne. Les index existants commençaient par
`company_id` et ne pouvaient pas fournir directement cet ordre global.

Les statistiques de la base de production ont confirmé 1 716 appels de cette lecture, avec une durée moyenne de
3,18 secondes et une pointe à 7,98 secondes, au voisinage du délai maximal de la requête.

## Correctif

Appliquer `supabase/migrations/20260907200347_optimize_planning_history_read.sql`. La migration ajoute l’index
`planning_change_log_changed_at_read_idx` sur `(changed_at desc)`. Elle ne modifie aucune ligne, fonction,
autorisation ou politique RLS.

## Recette

1. Vérifier l’alignement des migrations locale et distante.
2. Exécuter `supabase/tests/planning_history_read_performance_test.sql`.
3. Ouvrir le module Planning avec un compte réel autorisé à consulter l’historique.
4. Vérifier que le chargement initial et l’actualisation n’affichent plus l’erreur et que les événements visibles
   respectent toujours le périmètre du compte.

## Retour arrière

L’index peut être retiré avec `drop index public.planning_change_log_changed_at_read_idx;`. Cette opération ne
restaure aucune donnée, car la migration n’en modifie pas. Elle réintroduit toutefois le risque de dépassement du
délai de lecture et ne doit être exécutée qu’après validation d’un autre plan de requête performant.
