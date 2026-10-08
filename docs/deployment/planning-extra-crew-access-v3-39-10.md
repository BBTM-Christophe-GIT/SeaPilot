# Planning — Extra et accès Équipages (3.39.10)

Une journée Extra débite désormais 1,00 du compteur cumulé. Le calcul et l’aide de la fenêtre Solde utilisent cette règle. Les cumuls sont recalculés à partir des références de fin de journée existantes ; aucune réécriture des journées ou des soldes de référence n’est nécessaire.

La permission `canViewCrewPlanning` réserve la vue Équipages aux rôles Admin, Direction et Armement. Capitaine et Marin disposent de la vue Flotte uniquement. Le contrôle porte sur l’onglet, le changement de vue, le rendu, les calculs et les requêtes de soldes, ainsi que la fenêtre de saisie. Une session qui perd ce droit revient immédiatement à Flotte, même si Équipages ou la fenêtre Solde était ouverte.

Les profils Capitaine et Marin continuent à utiliser leur planning diffusé avec le filtrage RPC/RLS existant. Les demandes de congés et les crew lists restent accessibles selon leurs permissions. Aucune migration nécessaire.

Validation : calcul d’une séquence comprenant Extra à cheval sur deux mois ; fixtures dédiées Capitaine et Marin utilisant la lecture du planning diffusé ; refus de l’onglet, des requêtes de soldes et d’une vue déjà ouverte après retrait du rôle de bureau ; tests de permissions et du planning, lint et build de production.

Les 86 tests ciblés passent. Le test SQL `supabase/tests/planning_crew_balance_test.sql` a été exécuté avec succès sur Supabase avec des sujets JWT Marin, Capitaine et Armement ; ses données sont annulées par la transaction. Vérification navigateur de l’aide Extra corrigée et de l’accès de bureau à 1440 × 1000 et 390 × 844. Les profils simulés de la session courante ne servent pas de preuve des accès Marin/Capitaine.
