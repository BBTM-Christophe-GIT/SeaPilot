# SeaPilot v3.22.10 — types de service modifiables

## Évolution

Le champ `Type de service` de la fiche société devient une liste déroulante modifiable :

- les types de service et spécialités déjà enregistrés dans le référentiel sont proposés ;
- les doublons sont supprimés et les valeurs sont triées alphabétiquement ;
- l'utilisateur peut toujours saisir une nouvelle valeur libre ;
- le comportement est partagé entre la gestion des sous-traitants, l'ajout d'une société depuis un frais Projet et l'ajout depuis le Planning.

La valeur reste enregistrée dans la colonne Supabase existante `service_providers.service_type`. Aucune migration de base n'est nécessaire.

## Recette

1. Ouvrir une fiche dans `Achats > Gestion des Sous-Traitants` puis cliquer sur `Modifier la fiche`.
2. Ouvrir la liste `Type de service` et sélectionner une valeur existante.
3. Remplacer la valeur par un nouveau libellé et vérifier que la saisie libre reste possible.
4. Répéter le contrôle depuis le bouton `+ Ajouter` d'un frais Projet et d'un arrêt technique Planning.
