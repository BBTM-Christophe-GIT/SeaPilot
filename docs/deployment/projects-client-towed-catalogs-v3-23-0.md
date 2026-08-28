# Projets — catalogues Clients et Remorqués v3.23.0

## Interface

- Les commandes `Nouveau client` et `Modifier le client` de la barre Projets sont remplacées par `Liste des clients`.
- `Liste des remorqués` ouvre le même espace maître-détail pour le référentiel des engins, navires et colis remorqués.
- Chaque fenêtre propose une recherche plein texte, une liste à gauche et la fiche sélectionnée à droite.
- Admin et Direction peuvent ajouter, modifier et retirer une fiche. Une fiche utilisée par un projet actif ne peut pas être retirée.

## Médias

- Le site officiel d’un client permet de proposer automatiquement son favicon comme logo.
- Le logo reste remplaçable par une URL ou un fichier JPG, PNG ou WebP, et peut être retiré.
- Un remorqué accepte de la même façon une photo importée ou une URL d’image.
- Les fichiers importés sont limités à 5 Mo et stockés dans le bucket privé `project-catalog-media`. Leur lecture repose sur des URL signées et les contrôles d’appartenance à l’entreprise.

## Données et droits

- La migration `20260828050310_project_catalog_directories_media.sql` ajoute les métadonnées de site, logo et photo aux catalogues existants.
- Les RPC `clients_save` et `projects_save_towed_asset` conservent le contrôle Admin/Direction et valident les chemins Storage enregistrés.
- `clients_archive` et `projects_archive_towed_asset` réalisent une suppression métier non destructive afin de préserver l’historique des projets archivés.
- Les politiques Storage autorisent la lecture dans l’entreprise active et réservent l’ajout ou la suppression de médias à Admin/Direction.

## Vérification

- Tests ciblés Projets: requêtes, mutations, médias, dialogues, éditeur et page principale.
- Build TypeScript/Vite de production.
- Migration appliquée et contrôlée sur Supabase local avant livraison distante.
- Recette visuelle desktop et mobile sur la préversion intégrée, sans simulation Marin ou Capitaine.
