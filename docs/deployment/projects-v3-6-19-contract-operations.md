# Projets 3.6.19 — contrats et opérations

La version 3.6.19 réorganise le module **Projets** autour d'une liste de contrats et d'une fiche de contrat sélectionné. Les opérations rattachées sont présentées chronologiquement et restent visibles dans le Planning.

## Règles fonctionnelles

- Un contrat peut contenir une ou plusieurs opérations.
- À la création d'une opération, le loyer d'affrètement actif du contrat est copié dans l'opération.
- Cette copie devient une valeur propre à l'opération : une modification ultérieure du contrat n'est pas rétroactive.
- Le loyer, la devise et l'unité peuvent être modifiés lors de l'édition de l'opération.
- Une opération accepte plusieurs pièces jointes. Elles sont stockées dans SharePoint **Documents Projets**, sous le dossier `SeaPilot/{code projet}/Operations/OP-{id opération}`.
- Les pièces jointes sont consultables depuis la fiche du contrat et depuis le détail de l'opération dans le Planning.

## Déploiement

1. Appliquer la migration `20260729151354_project_operation_hire_documents.sql`.
2. Redéployer la fonction Supabase `project-document-upload`.
3. Vérifier que le secret Supabase `SHAREPOINT_PROJECTS_DRIVE_ID` désigne toujours la bibliothèque **Documents Projets**.
4. Déployer l'application web en version 3.6.19.

La migration ajoute les champs de loyer aux occurrences Planning, copie le loyer du contrat lors de la création, autorise le type documentaire `operation_attachment` et expose la RPC `projects_save_planning_occurrence`.

## Recette

- Sélectionner un contrat dans la colonne **Contrats** et contrôler l'affichage de sa fiche.
- Vérifier l'ordre chronologique des opérations.
- Créer une opération sans modifier le loyer et contrôler qu'elle conserve la valeur du contrat.
- Modifier ensuite le loyer du contrat : les opérations existantes doivent rester inchangées.
- Modifier le loyer d'une opération et contrôler son libellé **Modifié**.
- Ajouter plusieurs documents à une opération et les ouvrir depuis **Projets**, puis depuis **Planning**.
