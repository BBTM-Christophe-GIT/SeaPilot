# Module Projet — interface intégrée et prévisualisation

## Actions des opérations — version 3.71.11

**Nouvelle opération** est placé sous le tableau de l'onglet Opérations, y compris
lorsqu'aucune opération n'est encore associée au projet. Le bouton ouvre le même
formulaire avec le dossier sélectionné ; ses droits et son blocage pour les
projets clôturés sont conservés. Il est retiré du ruban, comme la commande Navires.
La gestion des navires reste accessible depuis le module Navires de la navigation
principale ; les sélecteurs de navires des formulaires restent inchangés.

## Bandeau et statut — version 3.71.10

Le bandeau existant conserve le code, le titre, le contexte client/navire, la
période, le statut et le type de contrat. Il ajoute uniquement **Loyer du contrat**,
avec le montant, la devise et l'unité contractuels. L'onglet Identité est retiré
et le dossier s'ouvre sur Opérations. Les autres informations d'identité ne sont
pas affichées dans le bandeau ; les données, l'éditeur du projet et les PDF
existants restent conservés.

La pastille de statut du portefeuille ou du dossier ouvre directement la liste
des cinq statuts existants. Le menu reprend le composant commun `AppContextMenu`,
le clavier, la fermeture extérieure et le retour du focus à la pastille. Choisir
le statut actuel ne déclenche aucune écriture. Clôturer garde sa confirmation ;
Réactiver conserve le statut précédent. Les droits et RPC existants sont
inchangés. Aucun changement de schéma ou de configuration n'est nécessaire.

## Interface validée intégrée — version 3.71.9

La présentation validée dans `/preview/projects/` est désormais reprise dans le
module réel `/modules/projects`. La préversion autonome reste une démonstration
fictive ; la route normale charge les projets, contrats, DPR, documents et droits
du compte connecté. `/modules/projects?preview=1` permet de vérifier ces mêmes
composants avec le client de démonstration existant.

Le ruban partagé avec Planning regroupe les commandes sur une ligne, dans l'ordre
**Projet**, **Catalogue**, **Documents**. Le portefeuille reste à gauche du dossier
et conserve sa recherche, ses filtres, ses favoris et les actions de chaque carte.
Le dossier choisi reste ouvert pendant le filtrage du portefeuille. Les projets
clôturés restent masqués par défaut et peuvent être réactivés depuis le filtre.

La facturation présente Navire puis Mois sous son titre, avec trois calendriers
visibles pour les mois précédent, choisi et suivant. Le mois civil courant est
sélectionné à l'ouverture ; deux clics définissent une période inclusive, même
entre deux mois. Les champs Période, Début et Fin sont remplacés par ce calendrier.
Les rubriques Loyers d'affrètement, Services refacturables, Prestations BBTM et
Saisie brute se déplient indépendamment sans perdre leurs brouillons. Le suivi
de la facture et les pièces existantes restent accessibles dans une rubrique dédiée.

Les actions locales restent près de leur titre. Les jours sans DPR sont complétés
avec le tarif contractuel applicable à chaque journée. Les services acceptent
plusieurs justificatifs ; après un échec partiel, la reprise conserve le service
enregistré et ne renvoie que les pièces restantes. La saisie brute propose une
ligne vierge à sa première ouverture, puis Ajouter une ligne et Dupliquer la
ligne sous le tableau. Modifier et Supprimer sont placés au début des lignes.

Le volet Relevé du mois conserve les totaux, les quatre choix de contenu PDF, la
référence client par contenu, l'aperçu et les formats d'export existants. Les cases
du volet ne masquent aucune rubrique à l'écran. Les tableaux défilent dans leur
propre zone et la disposition se replie sur une colonne aux petites largeurs.

Cette intégration ne change ni l'assistant Nouveau projet, ni ses validations,
ni la numérotation, les contrats, les RPC/RLS, les calculs, les modèles PDF ou les
chemins de stockage. Les contrôles de création incluent également le parcours
Planning. Aucun changement de schéma ou de configuration n'est nécessaire.

## Historique de la première présentation

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

### Fidélité à la maquette — version 3.60.2

La présentation du dossier retrouve la structure de la proposition validée (`10-billing-expenses-v2.png` et `01-overview-desktop.png`), en s’appuyant sur les composants de production.

| Repère de la maquette | Interface intégrée |
| --- | --- |
| Commandes horizontales lisibles | Fin des tuiles verticales et des libellés minuscules ; toutes les gestions dédiées restent accessibles. |
| Dossier blanc, code bleu, titre et contexte client/navire | En-tête unique, période/statut/contrat et bouton Modifier ; suppression du doublon de titre dans la barre latérale. |
| Navigation horizontale du dossier | Identité, Opérations, Facturation, Offre & contrat, Documents, Historique ; compteurs et navigation clavier conservés. |
| Préparation mensuelle de facturation | Mois, période personnalisée et navire regroupés au-dessus des rubriques. |
| Rubriques de facturation séparées | Loyers & DPR, Frais refacturables, Prestations BBTM, Suivi & pièces. Les formulaires restent montés pour conserver les saisies lors des changements de rubrique. |
| Récapitulatif et exports à droite | Totaux des éléments sélectionnés par devise, contenu du PDF, références client et trois formats existants. L’aperçu utilise le PDF de production dans une fenêtre dédiée. |
| Frais présentés comme une liste lisible | Fournisseur, spécialités, date, numéro, montant/devise, inclusion PDF, documents, modification et suppression conservés. |
| Adaptation mobile | Rubriques défilantes, contrôles et récapitulatif sur une colonne ; tableaux contenus dans leur propre zone de défilement. |

Écarts intentionnels : navigation globale SeaPilot conservée pour garder tous les modules ; inclusion PDF et références regroupées à l’export conformément aux demandes postérieures à la maquette ; onglet Identité conservant tous les champs métier. Les KPI compacts et les filtres de la version 3.60.1 restent inchangés. Le sélecteur de dossier permet de changer de projet sans effacer la recherche du portefeuille.

Cette version ne modifie aucune table, migration, règle de droits, fonction d’écriture, fonction de génération PDF ni chemin de stockage. Les tests de conservation couvrent notamment les champs BIMCO P144, les documents, les actions métier, les brouillons de facturation entre rubriques et les filtres du portefeuille. La page autonome Éléments de facturation garde son mode d’affichage complet.

Les données de `preview=1` sont fictives ; elles ne constituent pas une preuve des droits réels ni une connexion à Google Drive. Certains transferts nécessitent le compte authentifié et le lanceur Windows. Les contrôles Marin/Capitaine sont réalisés dans les règles RLS/RPC et les fixtures propres à chaque profil.

- Développement : `corepack pnpm@10.34.5 dev`.
- Tests : `corepack pnpm@10.34.5 test src/features/projects --maxWorkers=1 --pool=forks`.
- Compilation : `corepack pnpm@10.34.5 build`.
