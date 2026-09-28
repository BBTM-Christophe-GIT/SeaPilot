# Module Projet — interface intégrée et prévisualisation

La proposition est intégrée aux composants de production depuis la version 3.60.0. `/previews/projects.html` redirige vers `/modules/projects?preview=1`, avec le client de démonstration existant. La route normale `/modules/projects` utilise le compte et les droits réels. Les anciennes sources de la maquette restent conservées dans `src/features/projectPreview` ; elles ne remplacent plus les PDF de production.

## Organisation

Nouveau projet, Clients, Navires, Remorqués et Catalogue de prestations sont regroupés. Chacun ouvre sa gestion dédiée. Le portefeuille présente les indicateurs avant la liste ; un projet ouvre son dossier complet (Identité, Opérations, Facturation, Offre & contrat, Documents, Historique). Le retour à la liste conserve les filtres.

Depuis la version 3.60.1, « Projets actuels » (vue par défaut) retient les projets dont la période ou une opération non annulée recoupe le mois civil en cours ou une période future. La fin du projet utilise la restitution, puis la fin d’affrètement, puis la date de fin ; à défaut, sa date de début. « Tous les projets » inclut aussi les projets passés, archivés et sans date. Ces vues ne modifient pas l’archivage et sont indépendantes du mois choisi pour les KPI.

## Indicateurs

Le bandeau est replié par défaut : utilisation globale prévue/réalisée du mois et de l’année, nombre d’opérations du mois, choix de période et bouton « Voir les détails ». La synthèse pondère les taux par les jours/navires disponibles. Les graphiques se déplient au besoin.

Le mois sélectionné définit aussi l’année. Pour chaque navire, deux groupes de barres montrent le prévu et le réalisé, sur le mois et sur l’année entière. Le périmètre est la flotte active aujourd’hui, hors BBTM 2710, TAMARIS et ECREHOUEL, même en consultant une année antérieure. Ces exclusions concernent uniquement les KPI ; les navires, projets et historiques restent conservés. Base : jours calendaires, journées/navires dédupliquées, opérations annulées exclues, date de sortie de flotte prise en compte. Le réalisé provient des DPR soumis ou validés non supprimés. Un défaut de chargement est distingué d’un taux nul. Un DPR manquant n’atteste pas une absence d’activité.

La répartition compte les lignes de planning recoupant le mois, affectées à un navire du périmètre ou sans affectation, classées depuis le contrat et l’intitulé : antipollution, affrètement coque nue, bouées, remorquage, affrètement avec équipage ou autres opérations. Ce classement déduit n’est pas un nouveau champ métier.

## Facturation et documents

Les modèles PDF existants et tous les formulaires contractuels sont conservés. Les inclusions Loyers, Frais et pièces, Prestations BBTM et la référence client sont regroupées dans l’export. Une référence par combinaison est conservée pour chaque projet. Les quantités proposées aux nouvelles prestations incluent Operation et Crew Change ; les quantités restent modifiables.

Les périodes mensuelles, frais, fournisseurs, devises, pièces, sélection des journées, tarifs, compléments sans DPR, exports PDF/annexes/ZIP et suivi des factures restent accessibles. Les documents et événements historiques proviennent des tables existantes. Voir `docs/deployment/project-documents-google-drive.md` pour le stockage, la migration, les droits et le contrôle de conservation.

## Prévisualisation et vérification

Les données de `preview=1` sont fictives ; elles ne constituent pas une preuve des droits réels ni une connexion à Google Drive. Certains transferts nécessitent le compte authentifié et le lanceur Windows. Les contrôles Marin/Capitaine sont réalisés dans les règles RLS/RPC et les fixtures propres à chaque profil.

- Développement : `corepack pnpm@10.34.5 dev`.
- Tests : `corepack pnpm@10.34.5 test src/features/projects --maxWorkers=1 --pool=forks`.
- Compilation : `corepack pnpm@10.34.5 build`.
