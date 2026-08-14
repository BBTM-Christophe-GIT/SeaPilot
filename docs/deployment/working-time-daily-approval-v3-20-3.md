# Approbation quotidienne du temps de travail

Cette livraison remplace le verrouillage mensuel par une approbation atomique de chaque journée travaillée.

## Workflow

- Le Marin ou le Capitaine saisit une ou plusieurs phases puis sélectionne « Soumettre au Capitaine ».
- Le navire, la bordée et l’approbateur sont résolus côté serveur depuis le Planning de la journée.
- Seules les personnes dont le statut effectif est « En Mer » ou « A Terre » sont prises en compte.
- L’approbateur est un Capitaine actif de la même bordée et ne peut jamais être la personne qui soumet ses propres heures.
- L’onglet « Approbation » affiche le nombre et la liste des journées en attente pour le Capitaine connecté.
- Le Capitaine peut corriger les phases soumises avant validation.
- Une non-conformité exige une catégorie, un contexte opérationnel, une action immédiate, un repos compensateur et un commentaire avant validation.
- La validation fige les intervalles, le contexte Planning, les identités et la signature du Capitaine, puis verrouille uniquement la journée concernée.

Les anciens RPC de validation mensuelle ne sont plus exécutables par les clients authentifiés. Les validations historiques sont reprises sous forme de journées validées afin de préserver les données et l’audit.

## Correction des alertes

Une fenêtre glissante non conforme ne marque une date comme « journée non conforme » que si la personne possède réellement au moins un intervalle actif ce jour-là. Une journée sans travail ne reprend donc plus l’alerte calculée à la fin de la veille.

## DPR et Planning

Le contexte de saisie DPR accepte désormais le navire sélectionné. Il renseigne automatiquement le projet actif pour cette date et ce navire, quel que soit l’émetteur, et limite le personnel embarqué aux personnes « En Mer » ou « A Terre ».

## Base de données

La migration `20260814120743_working_time_daily_approvals_and_dpr_planning_scope.sql` crée :

- `working_time_day_approvals`, état courant de la journée ;
- `working_time_day_approval_events`, journal d’audit immuable ;
- `submit_working_time_day` et `validate_working_time_day` ;
- le filtrage partagé des statuts Planning et le nouveau contexte DPR daté par navire.
