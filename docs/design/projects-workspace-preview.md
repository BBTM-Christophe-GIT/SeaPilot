# Prévisualisation du module Projet

Une seule proposition interactive de refonte, accessible à `/previews/projects.html` (ou `/previews/projects`). L’entrée ouvre le portefeuille et ses indicateurs. Les liens `#P901/overview` et `#P901/billing` donnent directement accès au dossier et à sa facturation.

La page utilise une entrée Vite dédiée, sans fournisseur d’authentification ni requêtes applicatives. Elle fonctionne sans configuration Supabase et sans connexion. L’application principale, ses autorisations, ses données et les fonctionnalités de production restent inchangées.

## Portefeuille et indicateurs

- Utilisation par navire : deux barres **prévu / réalisé**, nombres de jours et dénominateurs visibles. Le prévu compte les jours couverts par les opérations sur tous les jours calendaires du mois. Le réalisé compte les jours avec DPR sur les jours écoulés de ce mois, jusqu’à la date de démonstration du 27 septembre 2026. Un mois futur affiche « — » pour le réalisé. Les jours sont dédupliqués par navire, y compris entre projets. Un DPR manquant ne prouve pas une absence d’activité.
- Répartition des opérations : nombre de missions recoupant le mois, classées par activité métier (antipollution, coque nue, bouées, remorquage, assistance offshore, travaux sous-marins). Cette classification est modifiable et distincte du modèle contractuel.
- Le mois et le navire pilotent les indicateurs. La liste peut couvrir toutes les périodes ou seulement le mois sélectionné. Recherche, avancement et rangement filtrent uniquement la liste. Cliquer une catégorie du graphique filtre les projets du mois.
- Avancement calculé depuis les dates : À venir / En cours / Terminé. La validation reste une colonne distincte. L’archivage est un rangement réversible, indépendant de l’avancement, qui conserve documents, opérations et événements. Les archives continuent de contribuer aux indicateurs historiques.
- Accès explicites : Clients, Navires & remorqués, Catalogue de prestations. Ces catalogues sont en consultation dans la maquette. Chaque ligne propose aussi un accès direct à sa facturation.

## Dossier Projet

Les six rubriques demeurent : vue d’ensemble, offre et contrat, opérations, facturation, documents, historique. Création et modification des projets/opérations, champs contractuels essentiels, PDF illustratifs, ajout et consultation de documents et archivage/restauration restent disponibles. Les événements initiaux sont conservés lorsque la session ajoute une modification.

## Facturation mensuelle

L’audit de `ProjectBillingPanel.tsx`, `projectBilling.ts` et `BillingElementsPage.tsx` a servi à compléter les parcours de la prévisualisation.

| Fonction existante     | Présentation dans la proposition                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Périodes et paramètres | Dossiers indépendants par mois, référence client, plage de loyers personnalisée, filtre navire, sauvegarde explicite avant export.                                                 |
| Loyers et DPR          | Sélection quotidienne, détail du DPR, jours absents et futurs visibles, complément explicite sans création de DPR. Tarifs opération / stand-by / météo et surcharge par opération. |
| Frais refacturables    | Ajout, modification, retrait, fournisseur libre ou suggéré, spécialité, numéro/date de facture, HT/TTC, devise, quantité/unité, commentaire et DPR lié.                            |
| Justificatifs          | Ajout local de plusieurs fichiers, consultation, détachement, conservation dans la bibliothèque après retrait du frais.                                                            |
| Prestations BBTM       | Choix dans le catalogue, libellé/description/prix/quantité modifiables, prestation personnalisée, quantité reprise des DPR en 24/24 Operation.                                     |
| Composition du relevé  | Inclusion par rubrique et par élément, totaux HT distincts par devise, aucun taux de conversion implicite.                                                                         |
| Suivi                  | Numéro de facture, dates d’émission/envoi/échéance/paiement et commentaire par mois ; statut de suivi déduit. Aucun envoi réel.                                                    |
| Exports                | PDF du relevé, PDF fusionné avec les annexes PDF sélectionnées, ZIP avec toutes les pièces sélectionnées. Aperçu paginé des octets du PDF, rendu localement par PDF.js.            |

Les dates personnalisées et le navire limitent les loyers ; frais et prestations restent rattachés au mois. Les frais exclus n’ajoutent ni montant ni pièce à l’export. Le PDF fusionné accepte les annexes PDF ; les autres formats sont conservés dans le ZIP. Un PDF protégé ou illisible produit une erreur explicite. La quantité des dépenses est informative : le montant HT saisi est le total de facture.

## Données et limites

Sept projets, navires, fournisseurs, DPR et montants sont fictifs. Les DPR sont des fixtures déterministes avec des lacunes et aucune date future, destinées à tester les états de l’interface. Les modifications et fichiers restent en mémoire et disparaissent au rechargement ; aucun ajout n’est transmis à un service.

Les PDF sont marqués « démonstration » ; ils ne remplacent ni les modèles contractuels complets ni les générateurs comptables existants. Les règles financières du prototype illustrent la priorité DPR → tarif de l’opération → tarif du mode contractuel. Les échéanciers contractuels et les particularités des DPR réels doivent rester ceux des fonctions de production lors du raccordement. Les catalogues et la création de fournisseurs persistants, l’édition riche des prestations, les modèles de documents et les droits réels ne sont pas reproduits entièrement dans cette maquette. Aucune migration n’est nécessaire pour la prévisualisation.

L’intégration définitive doit conserver toutes les clauses, annexes et données historiques, raccorder les requêtes et générateurs existants et vérifier les droits réels Marin/Capitaine. Les vues de profil simulées ne constituent pas cette validation.

## Validation

Utiliser pnpm 10.34.5 : `corepack pnpm@10.34.5 dev`, puis `/previews/projects.html`.

- Tests : `corepack pnpm@10.34.5 test src/features/projectPreview --maxWorkers=1 --pool=forks` (worker unique utile sur l’environnement Windows local).
- Lint : `corepack pnpm@10.34.5 exec eslint src/features/projectPreview vite.config.ts`.
- Compilation : `corepack pnpm@10.34.5 build` ; sorties `dist/index.html` et `dist/previews/projects.html`.

Les tests couvrent les métriques, archives, périodes futures, tarifs et compléments, sélections, devises, génération et fusion PDF, contenu ZIP, édition des frais avec pièces, navigation mensuelle et conservation de l’historique/documents sans appel réseau.
