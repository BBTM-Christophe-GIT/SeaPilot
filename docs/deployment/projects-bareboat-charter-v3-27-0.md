# Projets — contrat d'affrètement coque nue (v3.27.0)

## Changement

- Le module Projet propose le type `Contrat d'Affrètement` aux côtés de l'offre commerciale, du remorquage et du BIMCO.
- L'aperçu restitue les quatre pages du modèle BBTM fourni et place les données dans les vingt cases contractuelles.
- Le formulaire reprend automatiquement les données disponibles du projet, du client, du navire et de la fiche RH de l'émetteur. Le lieu de signature vaut par défaut `Cherbourg-En-Cotentin` et la date de signature est initialisée à la date du jour.
- La case 5 utilise la date d'émission du `Certificat de Classification` (ou `Certificat de Classe`) attaché au navire, puis celle du `Permis de Navigation` uniquement si aucun certificat de classification n'existe.
- La case 6 utilise les dates d'échéance des documents `Permis de Navigation` et `Permis d'Armement`; une échéance absente ou un document absent est restitué par `Illimité`.
- Les dates et ports de livraison/restitution alimentent directement les cases 7 et 9. La clause `Sur camion – Déchargement à la charge de l’affréteur` est optionnelle et décochée par défaut.
- Les frais, options de prolongation, loyer journalier, indemnité de fin anticipée, valeur assurée, assurance, loi et juridiction alimentent directement les cases 8 et 12 à 18.
- Pour ce type de contrat, l'assistant masque les champs projet génériques sans incidence sur le PDF et conserve uniquement les champs contractuels utiles ainsi que la section `Documents` destinée aux pièces jointes.
- Le document généré est un PDF de quatre pages conservé dans le bucket privé Supabase `project-files` avec le type `bareboat_charter`.
- Le modèle livré ne contient plus les références, parties, navire, montants ni signatures du contrat d'exemple. Les clauses, suppressions barrées, styles et logo sont conservés.

## Données et sécurité

- Les champs spécifiques restent regroupés dans `project_contracts.supplytime_data` ; aucune duplication de la fiche client ou navire n'est créée.
- Les dates d'émission et d'échéance sont lues au moment de l'aperçu et de la génération depuis `fleet_certificates`, pour le navire principal sélectionné.
- La migration `20260901051855_allow_bareboat_charter_generated_documents.sql` autorise ce type dans la RPC gardée existante sans élargir les rôles autorisés ni les politiques RLS.
- Le fichier source exécuté n'est jamais publié par l'application.

## Validation attendue

- Navigation complète `1 / 4` à `4 / 4` dans l'aperçu.
- Génération d'un PDF de quatre pages avec les parties, le navire, les dates, le loyer, la loi, la juridiction et les signataires attendus.
- Absence de `P242`, `HOLENN EUSA`, `ETMF` et de la signature source dans le modèle assaini.
- Tests, tests SQL, lint et build de production verts avant déploiement.
