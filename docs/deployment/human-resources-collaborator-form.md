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

L’indicateur **Sédentaires** classe un collaborateur à partir du grade, du rôle ou de la fonction. La valeur `Sédentaire` dans la colonne `grade_label` est donc comptabilisée même lorsque `role_label` n’est pas renseigné ou contient une autre valeur.

Les contrôles d’administration « Paramétrer les accès » et le résumé « Visibilité par rôle — Fonctions, documents et sections » ne sont plus affichés dans l’en-tête du module RH. Les règles de lecture déjà enregistrées restent appliquées aux données chargées.

## Déploiement

- Aucune nouvelle variable d’environnement n’est requise.
- Aucune migration SQL n’est requise : toutes les colonnes utilisées existent déjà dans `public.people`.
- Exécuter la suite de tests, le lint et le build de production avant déploiement.
