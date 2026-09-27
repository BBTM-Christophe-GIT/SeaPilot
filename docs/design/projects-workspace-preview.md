# Prévisualisation du dossier Projet

Une proposition interactive de refonte, accessible à `/previews/projects.html` (ou `/previews/projects`). Le projet P901 s’ouvre directement ; « Retour au portefeuille » permet de parcourir les dossiers actifs et archivés.

La page utilise une entrée Vite dédiée. Elle ne monte ni le fournisseur d’authentification ni les requêtes de l’application. Elle fonctionne sans configuration Supabase et sans connexion. L’application principale, ses autorisations, ses données et les fonctionnalités de production restent inchangées.

## Parcours disponibles

- Portefeuille : recherche, filtres, archives, création et modification des projets, consultation des référentiels.
- Vue d’ensemble : informations essentielles, contrat à compléter, opérations et activité récente.
- Offre et contrat : famille de contrat, informations essentielles, aperçu, sauvegarde temporaire, PDF illustratifs.
- Opérations : ajout, modification et statut des missions.
- Facturation : sélection et ajout d’éléments, calcul du total, export PDF ou ZIP avec pièces.
- Documents : recherche, catégories, ajout de fichiers en mémoire, consultation et téléchargement.
- Historique : événements initiaux et modifications de la session ; archivage réversible conservant les opérations et les documents.

Les exemples et les montants sont fictifs. Les modifications sont uniquement en mémoire et disparaissent au rechargement. Aucun fichier ajouté n’est transmis à un service. Les PDF sont explicitement marqués « démonstration » ; ils ne reprennent pas les modèles contractuels complets. Les référentiels sont en consultation et le mois de facturation est fixe pour illustrer le parcours.

## Suite de la refonte

Cette prévisualisation permet d’évaluer la direction d’interface. L’intégration définitive devra raccorder ces espaces aux requêtes et générateurs existants, conserver toutes les clauses et annexes, les règles DPR, les documents historiques, les droits réels par profil et la traçabilité disponible. Les vues de profil simulées ne constituent pas une validation Marin ou Capitaine.

## Validation

Utiliser pnpm 10.34.5 : `corepack pnpm@10.34.5 dev`, puis ouvrir `/previews/projects.html`.

Tests ciblés : `corepack pnpm@10.34.5 test --dir src/features/projectPreview`.

Contrôle statique : `corepack pnpm@10.34.5 exec eslint src/features/projectPreview vite.config.ts`.

Compilation : `corepack pnpm@10.34.5 build`. La sortie comprend `dist/index.html` et `dist/previews/projects.html`.
