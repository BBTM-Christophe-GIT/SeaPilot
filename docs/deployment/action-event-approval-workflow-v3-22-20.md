# Rapport d'évènement et circuit d'approbation — v3.22.20

## Évolutions livrées

- La saisie devient un rapport d'évènement horodaté avec manœuvre du navire et conditions météo.
- Le type d'écart est obligatoire uniquement pour les huit familles d'audit et de visite demandées ; il disparaît du PDF lorsqu'il ne s'applique pas.
- La cause de l'anomalie est choisie après la création parmi les huit valeurs QHSE de référence.
- Chaque rapport est soumis à Christophe MINASSIAN, qui désigne une ou plusieurs personnes et/ou l'équipage d'un navire.
- Un Marin rattaché au navire par une affectation Planning confirmée voit et peut traiter l'action approuvée.
- Le PDF A4 devient un `RAPPORT D'EVENEMENT` et intègre l'heure du constat, la signature figée de l'émetteur et toutes les photos disponibles.

## Déploiement

Appliquer `20260827152812_action_event_approval_workflow.sql` avant de déployer le client web. La migration ajoute les champs du rapport, la table `action_item_assignees`, les fonctions sécurisées de création, d'approbation et de traitement, ainsi que les politiques RLS associées.

Les lignes historiques SharePoint sont conservées et initialisées comme déjà approuvées. Leur lecture et le traitement Capitaine existant restent compatibles.

## Vérifications

- `action_event_approval_workflow_test.sql` couvre la soumission, la signature, l'approbation exclusivement par Christophe, les affectations multiples et l'accès Marin dérivé du Planning.
- `action_plan_captain_treatment_test.sql` protège la compatibilité du traitement des actions SharePoint par le Capitaine.
- Vitest couvre la visibilité conditionnelle du type d'écart, la création, l'approbation multi-responsables, la complétude et le PDF.
- La recette visuelle contrôle le formulaire continu, le panneau de suivi et le rendu A4 avant publication de la préversion.

Captures de recette : [bureau](../design/action-event-report-workflow-v3-22-20.png) et [mobile](../design/action-event-report-workflow-mobile-v3-22-20.png).
