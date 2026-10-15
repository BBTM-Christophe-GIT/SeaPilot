# DPR : chargement des rapports et capacités de modification

Le tableau DPR répétait les vérifications de société, de rôle et de Planning pour chaque rapport et chaque ligne liée. Le champ calculé `dpr_report_can_manage` recommençait également ces contrôles pour chaque rapport affiché. Les journaux PostgreSQL du 15 octobre 2026 contiennent des annulations pour dépassement du délai dans ces deux chemins.

La migration `20261015073628_optimize_dpr_report_access_scope.sql` calcule les identifiants autorisés pour le compte connecté une fois par requête. Les politiques RLS des rapports et de leurs lignes liées utilisent cette portée. Les libellés de projets suivent la même portée. Le client charge les capacités de modification avec un seul appel `dpr_manageable_report_ids`, sans champ calculé par ligne.

Les règles existantes restent applicables : accès au module DPR et société active du compte, historique propre au Marin, modification de ses rapports pendant 72 heures, autorité de Capitaine sur le navire et la date concernés et consultation des navires affectés pendant la fenêtre de préparation et de suivi. Cette dernière possibilité reste limitée à la lecture. Les contrôles des RPC d'écriture ne changent pas.

Appliquer la migration après les migrations de portée des navires affectés du 14 octobre, puis déployer le client. L'appel de capacité échoue explicitement si le serveur ne dispose pas encore de la migration.

Vérification : `dpr_dashboard_access_scope_test.sql` utilise de vrais rôles PostgreSQL `authenticated` avec des comptes de fixtures Marin et Capitaine et 1 300 rapports supplémentaires. Il vérifie les lectures sous un délai de quatre secondes, la sauvegarde transactionnelle et ses métriques, les mêmes capacités que les contrôles d'écriture, les limites des affectations, les sociétés, le retrait du module et le refus aux appels anonymes. Les tests `dpr_role_matrix_test.sql`, `temporary_captain_permissions_test.sql` et `assignment_vessel_read_window_test.sql` complètent cette vérification. Toutes les données de test sont annulées par transaction.
