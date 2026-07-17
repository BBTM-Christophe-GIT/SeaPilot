# Module RH — création d’un collaborateur

La fenêtre **Ajouter un collaborateur** reprend les huit sections de la fiche RH :

1. Identité et poste
2. Contrat et dates
3. Coordonnées
4. Contact urgence
5. Documents administratifs
6. Santé et habilitations
7. Tenues et mensurations
8. Documents

Les champs structurés sont enregistrés directement dans la table Supabase `public.people`. La création utilise les mêmes colonnes que la modification d’une fiche RH existante, notamment les coordonnées, dates de contrat, contacts d’urgence, informations d’identité, habilitations et mensurations.

Les fichiers de l’onglet **Documents** sont ajoutés après la création du collaborateur : ils nécessitent l’identifiant Supabase de la ligne `people` pour être rattachés dans `public.hr_documents` et stockés dans le bucket RH prévu par l’application.

Depuis la fiche d’un collaborateur existant, les rôles de gestion disposent de l’action **Ajouter un document**. Le type vient du catalogue partagé `public.stcw_certificates`, la date d’échéance est obligatoire et le fichier est renommé selon la règle du Dashboard SPFx : `Collaborateur - Document - Année.extension`. Les fichiers restent dans le bucket privé `hr-documents`; un nom existant n’est jamais écrasé.

Le catalogue RH reprend les **54 éléments actifs** de la liste SharePoint QHSE `8c8561d7-9fb4-420f-8290-b66309d07e92`. La colonne Supabase `file_name` conserve désormais le champ SharePoint **Nom de Fichier** et devient prioritaire pour le renommage automatique. Le mode de prévisualisation utilise le même catalogue complet.

La sélection par cases à cocher permet de télécharger un fichier directement ou plusieurs fichiers dans une archive ZIP datée. Le détail complet de l’audit et des règles reprises est documenté dans `docs/migration/human-resources-spfx-document-workflow.md`.

L’indicateur **Sédentaires** classe un collaborateur à partir du grade, du rôle ou de la fonction. La valeur `Sédentaire` dans la colonne `grade_label` est donc comptabilisée même lorsque `role_label` n’est pas renseigné ou contient une autre valeur.

Les contrôles d’administration « Paramétrer les accès » et le résumé « Visibilité par rôle — Fonctions, documents et sections » ne sont plus affichés dans l’en-tête du module RH. Les règles de lecture déjà enregistrées restent appliquées aux données chargées.

## Déploiement

- Aucune nouvelle variable d’environnement n’est requise.
- Appliquer `202607170004_hr_document_catalog_file_names.sql` pour ajouter et renseigner `public.stcw_certificates.file_name`. La migration vérifie que les 54 éléments SharePoint attendus sont actifs.
- Exécuter la suite de tests, le lint et le build de production avant déploiement.
