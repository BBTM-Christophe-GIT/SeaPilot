# Suivi du temps — protection des heures enregistrées v3.27.11

## Incident corrigé

Le registre mensuel conserve son statut technique `draft` pendant que ses journées passent dans le circuit d’approbation. L’action latérale de retrait restait donc visible après la saisie et pouvait supprimer les intervalles d’une journée déjà soumise ou validée.

La correction applique une défense en profondeur :

- l’interface ne propose le retrait que pour un registre entièrement vide ;
- l’icône ambiguë de fermeture est remplacée par une corbeille explicitement libellée « Retirer ce brouillon vide » ;
- `discard_working_time_draft` refuse tout registre qui possède un intervalle, un commentaire, une approbation journalière ou une preuve de validation ;
- la RPC ne supprime plus aucun contenu de temps de travail.

## Déploiement

1. Appliquer `20260901161537_protect_working_time_submitted_days.sql`.
2. Déployer l’application web v3.27.11 (`2026-09-01.0013`).
3. Vérifier avec un compte Capitaine réel qu’après saisie et soumission d’une journée, aucune action de retrait du registre n’est proposée et que les périodes restent présentes après rechargement.

## Vérifications automatisées

- `WorkingTimeWorkflowPanel.test.tsx` couvre le profil Capitaine et masque l’action destructive dès qu’une heure ou une approbation existe.
- `working_time_captain_assignment_role_test.sql` confirme qu’un Capitaine ne peut pas retirer un registre engagé dans l’approbation et que l’intervalle enregistré demeure intact.
- Les tests des approbations journalières et de la fenêtre de saisie restent inchangés et passent après rejeu complet des migrations.
