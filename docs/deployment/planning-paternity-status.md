# Planning — Congés Paternités

Version `3.69.2`, build `2026-10-08.003`.

Le statut **Congés Paternités** est disponible dans les affectations, les périodes
des postes fictifs, le filtre de statut et la fenêtre **Statut et commentaire**.
Il s'applique à une journée ou à un groupe de cases et conserve son libellé et son
commentaire après lecture, copie et déplacement. Il utilise la couleur des congés
et la catégorie **Congés** dans les filtres et contrôles d'absence.

Les règles métier du solde Équipages et de l'export SILAE pour ce statut ne sont
pas définies : le solde reste **À préciser** et SILAE indique **Statut à préciser**
plutôt que d'assimiler la paternité à des congés ordinaires.

## Déploiement

1. Appliquer `20261008113550_planning_paternity_status.sql` avant le client.
2. Exécuter `supabase/tests/planning_paternity_status_test.sql` : les fixtures sont
   annulées par rollback, y compris celles des vrais profils Marin et Capitaine.
3. Déployer le client puis choisir **Congés Paternités** sur une journée et une
   période. Vérifier le filtre, le commentaire et la conservation après relecture.

La migration étend uniquement les validations de
`save_planning_assignment_day_details`, `apply_planning_grid_cells` et
`planning_save_generic_crew_row`. Les RPC de journée et de période existants
réutilisent ces fonctions. Les autorisations et les règles RLS restent identiques.
