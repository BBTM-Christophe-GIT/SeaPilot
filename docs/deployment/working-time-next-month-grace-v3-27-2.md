# Délai de saisie du temps de travail — v3.27.2

La saisie manuelle d’un registre mensuel reste disponible jusqu’au 5 du mois suivant inclus, selon la date locale `Europe/Paris`. Elle devient automatiquement accessible en lecture seule le 6.

L’écran indique l’échéance pendant les cinq jours de grâce, puis explique la clôture. Le verrou est aussi contrôlé par Supabase pour les enregistrements manuels. Les journées déjà soumises restent accessibles aux approbateurs afin de ne pas interrompre une validation ou la justification d’une non-conformité.

## Déploiement

1. Appliquer `20260901103335_working_time_next_month_grace.sql`.
2. Déployer le client web `v3.27.2` / build `2026-09-01.0004`.
3. Vérifier qu’un registre d’août reste modifiable le 5 septembre et passe en lecture seule le 6.

## Couverture

- `workingTimeEntryWindow.test.ts` vérifie les bornes calendaires et le passage décembre–janvier.
- `WorkingTimeWorkflowPanel.test.tsx` vérifie l’état éditable jusqu’au 5 et l’état en lecture seule le 6.
- `working_time_entry_window_test.sql` vérifie la règle serveur et ses privilèges.
