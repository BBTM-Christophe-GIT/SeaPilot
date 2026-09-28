# Module Projet — interface intégrée et prévisualisation

La proposition est intégrée aux composants de production depuis la version 3.60.0. `/previews/projects.html` redirige vers `/modules/projects?preview=1`, avec le client de démonstration existant. La route normale `/modules/projects` utilise le compte et les droits réels. Les anciennes sources de la maquette restent conservées dans `src/features/projectPreview` ; elles ne remplacent plus les PDF de production.

## Organisation

Nouveau projet, Clients, Navires, Remorqués et Catalogue de prestations sont regroupés. Chacun ouvre sa gestion dédiée. Le portefeuille présente les indicateurs avant la liste ; un projet ouvre son dossier complet (Identité, Opérations, Facturation, Offre & contrat, Documents, Historique). Le retour à la liste conserve les filtres.

Les vues « Dossiers courants », « Archives » et « Tous les projets » distinguent le rangement du statut métier. Un projet terminé reste suivi tant qu’il n’a pas été archivé explicitement. L’historique des archives reste inclus dans les indicateurs.

## Indicateurs

Le mois sélectionné définit aussi l’année. Pour chaque navire, deux groupes de barres montrent le prévu et le réalisé, sur le mois et sur l’année entière. Base : jours calendaires, journées/navires dédupliquées, opérations annulées exclues, date de sortie de flotte prise en compte. Le réalisé provient des DPR soumis ou validés non supprimés. Un défaut de chargement est distingué d’un taux nul. Un DPR manquant n’atteste pas une absence d’activité.

La répartition compte les lignes de planning recoupant le mois, classées depuis le contrat et l’intitulé : antipollution, affrètement coque nue, bouées, remorquage, affrètement avec équipage ou autres opérations. Ce classement déduit n’est pas un nouveau champ métier.

## Facturation et documents

Les modèles PDF existants et tous les formulaires contractuels sont conservés. Les inclusions Loyers, Frais et pièces, Prestations BBTM et la référence client sont regroupées dans l’export. Une référence par combinaison est conservée pour chaque projet. Les quantités proposées aux nouvelles prestations incluent Operation et Crew Change ; les quantités restent modifiables.

Les périodes mensuelles, frais, fournisseurs, devises, pièces, sélection des journées, tarifs, compléments sans DPR, exports PDF/annexes/ZIP et suivi des factures restent accessibles. Les documents et événements historiques proviennent des tables existantes. Voir `docs/deployment/project-documents-google-drive.md` pour le stockage, la migration, les droits et le contrôle de conservation.

## Prévisualisation et vérification

Les données de `preview=1` sont fictives ; elles ne constituent pas une preuve des droits réels ni une connexion à Google Drive. Certains transferts nécessitent le compte authentifié et le lanceur Windows. Les contrôles Marin/Capitaine sont réalisés dans les règles RLS/RPC et les fixtures propres à chaque profil.

- Développement : `corepack pnpm@10.34.5 dev`.
- Tests : `corepack pnpm@10.34.5 test src/features/projects --maxWorkers=1 --pool=forks`.
- Compilation : `corepack pnpm@10.34.5 build`.
