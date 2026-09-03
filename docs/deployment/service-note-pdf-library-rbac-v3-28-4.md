# Déploiement Notes de Service — v3.28.4

Date : 3 septembre 2026

## Contenu

- téléchargement PDF disponible sur toutes les fiches visibles par l'utilisateur;
- logo BBTM fourni appliqué à l'aperçu et au PDF;
- suppression du cartouche de lecture obligatoire et de la mention de génération SeaPilot;
- filtre `Navire` explicite et classement bibliothèque par année puis navire;
- notes nominatives sans navire laissées directement sous l'année et notes multi-navires présentes dans chaque groupe concerné;
- diffusion directe d'un brouillon, avec attribution du numéro chrono uniquement à cette étape;
- défense UI complémentaire : les brouillons et commandes de gestion restent réservés aux profils `Administrateur` et `Direction`.

## Données et sécurité

Aucune nouvelle migration n'est nécessaire. Les fonctions transactionnelles et politiques RLS existantes restent la source d'autorité : gestion réservée aux rôles `admin`/`direction`, lecture des notes diffusées/archivées limitée aux destinataires, signature limitée au destinataire connecté.

## Vérifications attendues

- tests unitaires PDF, regroupement année/navire et restrictions de rôle;
- lint, suite Vitest et build Vite de production;
- contrôle visuel ordinateur/mobile de la bibliothèque et du détail d'un brouillon;
- rendu rasterisé du PDF pour contrôler le logo, les suppressions demandées et les deux pages.
