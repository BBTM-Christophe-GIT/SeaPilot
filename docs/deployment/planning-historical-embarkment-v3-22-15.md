# Embarquements historiques du Planning v3.22.15

## Correction

La saisie d'un embarquement dans une bordée historique vérifie désormais la période d'emploi du marin à la date ou sur la période demandée. Le statut RH `active` représente la situation actuelle et ne bloque plus une saisie antérieure lorsque les dates d'embauche et de départ couvrent cette saisie.

Le même principe s'applique aux trois chemins de création :

- coloration ou collage de cases dans la grille avec `apply_planning_grid_cells` ;
- création manuelle d'une affectation, y compris depuis une ligne historique ;
- création groupée d'une bordée avec `create_planning_board_assignments`.

Une saisie antérieure à l'embauche ou postérieure au départ reste refusée par Supabase. Les contrôles d'entreprise, de navire, de permissions, d'absences et d'aptitude restent inchangés.

## Cas de référence

Loic ALIX, employé du 1er juillet 2024 au 2 décembre 2025, peut recevoir un embarquement en janvier 2025 même si sa fiche est aujourd'hui inactive. Une saisie en janvier 2026 reste refusée.

## Vérifications

- test d'interface de la sélection d'un marin historique dans le formulaire d'affectation ;
- test de la règle métier frontend sur les périodes valides et invalides ;
- huit tests pgTAP couvrant la grille, l'affectation directe et la création de bordée ;
- suite automatisée, lint et build de production.
