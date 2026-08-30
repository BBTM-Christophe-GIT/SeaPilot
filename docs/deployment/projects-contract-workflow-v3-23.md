# Module Projets — contrats et stockage privé

## Périmètre

La fiche projet reprend la navigation verticale du module RH et conserve les sections Opérations et Facturation.
La création d'un projet propose exactement trois types de contrat :

- `Offre Commerciale` ;
- `Contrat de Remorquage` ;
- `BIMCO`.

Le formulaire et l'aperçu PDF s'adaptent au type sélectionné. L'offre commerciale tient sur une page, le contrat de
remorquage respecte le modèle fourni et le BIMCO reprend les quatre pages particulières du P144 suivies des vingt-cinq
pages de clauses générales.

## Données et documents

Les nouveaux documents générés et les pièces jointes d'opération sont enregistrés dans le bucket Supabase privé
`project-files`. Aucun nouveau fichier n'est écrit dans SharePoint. Les anciennes références SharePoint restent
consultables comme historique en lecture seule.

La migration `20260829203000_project_generated_documents_private_storage.sql` ajoute la RPC sécurisée
`projects_register_generated_storage_document` et étend la politique de lecture du bucket aux documents générés.
Elle doit être appliquée avant la promotion de l'interface en production.

## Contrôles de livraison

1. Vérifier l'alignement de l'historique des migrations Supabase.
2. Exécuter `corepack pnpm exec supabase db push --linked --dry-run`.
3. Appliquer la migration avec `corepack pnpm exec supabase db push --linked`.
4. Exécuter les tests, le lint et le build de production.
5. Promouvoir le commit validé vers `https://sea-pilot-ten.vercel.app`.
6. Contrôler l'ouverture de `/login` et la route protégée `/modules/projects`.

## Retour arrière

En cas d'incident d'interface, restaurer le déploiement Vercel précédent. La fonction et la politique Supabase sont
additives et peuvent rester en place : elles ne déplacent ni ne suppriment les documents historiques.
