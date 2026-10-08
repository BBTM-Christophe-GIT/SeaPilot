# Préversion interactive Projets / Facturation

Route : `/preview/projects/` (également `/preview/projects/index.html`).

Cette entrée Vite indépendante présente la maquette choisie avec le portefeuille,
les cinq rubriques et une barre de commandes de facturation. Elle utilise des
projets, opérations, DPR et justificatifs fictifs. Les changements sont conservés
en mémoire pendant la session ; actualiser la page réinitialise les exemples.
Elle ne lit ni n'écrit de données Supabase et ne remplace pas le module existant.

L'en-tête de facturation regroupe le titre, le mois et les commandes sur une
ligne sur grand écran. Les six paramètres occupent une seule rangée dès que
le panneau offre 830 px, puis se répartissent sur trois ou deux colonnes selon
l'espace disponible. Les labels restent visibles et les contrôles conservent
les dimensions partagées SeaPilot.

## Parcours à essayer

- Rechercher un projet, filtrer son statut et changer la densité du portefeuille.
- Changer de dossier et de rubrique ; créer ou modifier un projet et ses opérations.
- Sélectionner un mois : sa fiche est créée automatiquement lors de la première action.
- Déplier les trois sections, exclure une journée ou une section et vérifier le total HT.
- Ajouter ou modifier un frais ou une prestation et joindre un justificatif local.
- Ajouter une ligne brute datée, avec son navire, sa quantité et son prix unitaire.
- Saisir une référence client, enregistrée à la sortie du champ pour le contenu sélectionné.
- Afficher le vrai PDF, exporter le PDF standard, le PDF avec annexes ou le ZIP.

Les calculs et exports réutilisent `projectBilling.ts`. La fiche mensuelle reste
distincte du statut du projet. Modifier le loyer contractuel ne modifie pas les
loyers copiés dans les opérations existantes. Les tarifs propres aux opérations,
les règles de stand-by et les exclusions PDF restent ceux du moteur existant.
Les totaux sont séparés par devise, sans conversion implicite. Les quantités
automatiques des prestations et les arrondis des lignes brutes suivent les
fonctions actuelles du moteur. La section Saisie brute apparaît après le premier
ajout depuis le menu ; la vue initiale conserve les trois sections de la maquette.

Les rubriques Offre & contrat et Documents présentent des résumés et les pièces
fictives du mois. L'édition contractuelle complète, les synchronisations Planning,
les référentiels persistants, les autorisations et les RPC/RLS restent dans
l'application existante. Cette préversion prépare les éléments de facturation ;
elle ne crée ni n'envoie de facture.

## Vérifications

Avec pnpm 10.34.5 :

```powershell
corepack pnpm test src/features/projects/preview/billingDemo.test.ts src/features/projects/preview/previewStorageClient.test.ts src/features/projects/preview/ProjectPreview.test.tsx src/features/projects/projectBilling.test.ts src/features/projects/projectBillingReferences.test.ts --pool=forks --maxWorkers=1
corepack pnpm build
```

La visionneuse utilise le PDF généré et `pdfjs-dist`, déjà présent dans le projet,
pour fonctionner aussi sans visionneuse PDF native du navigateur. Aucun nouvel
accès, service, secret ou changement de base de données n'est nécessaire.

La disposition navy/blanc du shell est une exception visuelle propre à la
maquette choisie par l'utilisateur. Les commandes et panneaux reprennent les
tokens partagés SeaPilot. Les sélecteurs de navire utilisent `compareFleetNames`.

Voir [la vérification visuelle](./design-qa.md).
