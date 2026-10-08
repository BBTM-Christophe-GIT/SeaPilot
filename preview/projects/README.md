# Préversion interactive Projets / Facturation

Route : `/preview/projects/` (également `/preview/projects/index.html`).

Cette entrée Vite indépendante présente la maquette choisie avec le portefeuille,
les cinq rubriques et une barre de commandes de facturation. Elle utilise des
projets, opérations, DPR et justificatifs fictifs. Les changements sont conservés
en mémoire pendant la session ; actualiser la page réinitialise les exemples.
Elle ne lit ni n'écrit de données Supabase et ne remplace pas le module existant.

## Parcours à essayer

- Rechercher un projet, filtrer son statut et changer la densité du portefeuille.
- Changer de dossier et de rubrique ; créer ou modifier un projet et ses opérations.
- Sélectionner un mois et enregistrer sa fiche avant d'ajouter des frais ou d'exporter.
- Déplier les trois sections, exclure une journée ou une section et vérifier le total HT.
- Ajouter ou modifier un frais ou une prestation et joindre un justificatif local.
- Afficher le vrai PDF, exporter le PDF standard, le PDF avec annexes ou le ZIP.

Les calculs et exports réutilisent `projectBilling.ts`. La fiche mensuelle reste
distincte du statut du projet. Modifier le loyer contractuel ne modifie pas les
loyers copiés dans les opérations existantes. Les tarifs propres aux opérations,
les règles de stand-by et les exclusions PDF restent ceux du moteur existant.

Les rubriques Offre & contrat et Documents présentent des résumés et les pièces
fictives du mois. L'édition contractuelle complète, les synchronisations Planning,
les référentiels persistants, les autorisations et les RPC/RLS restent dans
l'application existante. Cette préversion prépare les éléments de facturation ;
elle ne crée ni n'envoie de facture.

## Vérifications

Avec pnpm 10.34.5 :

```powershell
corepack pnpm test src/features/projects/preview/billingDemo.test.ts src/features/projects/preview/ProjectPreview.test.tsx src/features/projects/projectBilling.test.ts --pool=forks --maxWorkers=1
corepack pnpm build
```

La visionneuse utilise le PDF généré et `pdfjs-dist`, déjà présent dans le projet,
pour fonctionner aussi sans visionneuse PDF native du navigateur. Aucun nouvel
accès, service, secret ou changement de base de données n'est nécessaire.

La disposition navy/blanc du shell est une exception visuelle propre à la
maquette choisie par l'utilisateur. Les commandes et panneaux reprennent les
tokens partagés SeaPilot. Les sélecteurs de navire utilisent `compareFleetNames`.

Voir [la vérification visuelle](./design-qa.md).
