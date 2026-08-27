# Temps de travail — validation directe par le Capitaine — v3.22.21

## Correction livrée

Le Capitaine RH affecté au même navire et à la même bordée peut désormais préparer les périodes d’un Marin encore non soumises et utiliser l’action « Valider » directement depuis la journée.

- La portée reste contrôlée par le Planning publié et la fonction RH exacte `Capitaine`.
- Les signatures actives du titulaire et du Capitaine sont obligatoires et gelées séparément.
- L’instantané de la signature du titulaire indique explicitement l’apposition par le Capitaine affecté ; l’événement d’audit conserve également l’utilisateur et la personne ayant effectué l’action.
- Une journée conforme est validée atomiquement. Une journée non conforme est soumise puis reste ouverte jusqu’à la saisie de la justification obligatoire par le Capitaine.

Le cas de référence est Adrien BOIS préparant la journée d’Alexandre ROUPSARD sur GOURY / Bordée 2 les 26 ou 27 août 2026.

## Déploiement

Appliquer `20260827183808_allow_assigned_captain_day_validation.sql` avant le client web. La migration remplace uniquement les deux fonctions de contrôle et de soumission quotidiennes ; elle ne modifie aucune période ni approbation existante.

## Vérifications

- `working_time_captain_assignment_role_test.sql` couvre l’édition, l’enregistrement des phases, la validation atomique, les deux signatures et l’acteur d’audit.
- `WorkingTimeWorkflowPanel.test.tsx` couvre l’apparition et l’appel de l’action « Valider » sur le brouillon d’un Marin de la bordée.
- La recette de production contrôle le contexte GOURY / Bordée 2 avec l’identité d’Adrien sans créer de données dans le registre réel.
