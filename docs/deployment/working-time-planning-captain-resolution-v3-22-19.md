# Temps de travail — résolution du Capitaine Planning — v3.22.19

## Correction livrée

- Une affectation de Marin « En Mer » ou « A Terre » reste reconnue pour la saisie quotidienne, y compris lorsqu'elle est provisoire et non annulée.
- L'approbateur est désormais la personne de la même bordée et du même navire dont la fonction RH exacte est `Capitaine` et dont l'affectation Planning est confirmée. Son rôle opérationnel Planning peut notamment être `2nd Capitaine`.
- Pendant le chargement du contexte Planning, l'interface affiche un état d'attente au lieu du message erroné « Aucune affectation Planning ».

Le cas de référence est Alexandre ROUPSARD le 26 août 2026 : son affectation GOURY / bordée 2 est reconnue et Adrien BOIS, `Capitaine` dans la fiche RH, est proposé comme approbateur bien que son rôle d'affectation soit `2nd Capitaine`.

## Déploiement

Appliquer `20260827144242_fix_working_time_captain_resolution.sql` avant de déployer le client web. La migration remplace uniquement trois fonctions de résolution du périmètre Temps de travail et ne modifie aucune affectation Planning ni aucun registre existant.

## Vérifications

- Le test transactionnel `working_time_captain_assignment_role_test.sql` utilise un Capitaine RH affecté comme `2nd Capitaine` et couvre l'accès à la bordée, la résolution de l'approbateur et la correspondance de journée.
- `WorkingTimeEntryBoard.test.tsx` vérifie que l'état de chargement n'est pas présenté comme une absence d'affectation.
- La recette de production exécute `working_time_day_context` avec l'identité liée à Alexandre sur le 26 août 2026 et contrôle GOURY, bordée 2 et Adrien BOIS.
