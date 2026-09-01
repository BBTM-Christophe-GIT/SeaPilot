# Module Projets — missions et fabrique documentaire

## Résultat de l'audit fonctionnel

Le module reprend les deux parcours du SPFx QHSE :

1. un catalogue de projets filtrable, dont chaque ligne expose les missions planning rattachées ;
2. un assistant plein écran en cinq étapes : identification, planning, offre commerciale, facturation et documents.

Un projet catalogue peut être lié à zéro, une ou plusieurs lignes `planning_projects` au moyen de `catalog_project_id`. Une nouvelle mission reprend une date ou période et un navire, sans dupliquer le projet commercial.

La numérotation reste pilotée par `project_number_counters`. `projects_peek_next_code()` ne fournit qu'un aperçu à l'assistant (P265 attendu après l'import P264) ; le trigger `projects_assign_code` et `allocate_next_project_code()` réalisent l'attribution atomique lors de l'insertion.

## Assistant de création

Les cinq entrées de la navigation latérale sont de vraies étapes : une seule carte est affichée à la fois et les valeurs déjà saisies sont conservées lors du passage d'une étape à l'autre.

L'étape Identification permet de créer un client ou affréteur avec la RPC `clients_save`. Le nouveau client est ajouté à la liste et sélectionné dans le projet sans fermer l'assistant.

Les ports de livraison et de restitution utilisent le référentiel SharePoint `LOCODE` du site QHSE (liste `20e7b5db-85f2-4e7f-ad8d-64d75b396414`). Les 53 lignes validées sont versionnées dans `projectPorts.ts`, groupées par département et affichées sous la forme `Port – LOCODE`. La valeur persistée dans les champs historiques `delivery_port` et `redelivery_port` reste le nom du port afin de préserver la compatibilité avec les projets existants et la génération documentaire.

## Documents disponibles

| Type | Format | État | Source des valeurs |
|---|---:|---|---|
| Offre commerciale | PDF | Actif | projet, client, mission, contrat |
| BIMCO SUPPLYTIME 2017 | PDF, 29 pages | Actif | projet, client, mission, contrat et cases particulières |
| Contrat de remorquage BBTM | PDF, 6 pages | Actif | projet, client, mission, contrat et 19 clauses particulières |
| Contrat d'Affrètement — Coque nue | PDF, 4 pages | Actif | projet, client, navire, contrat, cases particulières et signataires |
| Prestation intellectuelle | DOCX | En attente du modèle | emplacement de données déjà prévu |

Le BIMCO fourni était un contrat P144 exécuté. SeaPilot ne réutilise ni ses valeurs, ni ses signatures, ni ses annexes client, ni l'historique Adobe. La génération assemble les deux pages Part I vierges déjà utilisées par le SPFx et les vingt pages génériques Part II (pages 5 à 24 du fichier fourni).

Les modèles de remorquage et d'affrètement coque nue ont été assainis : références projet, parties, navire, dates, valeurs commerciales et signatures du contrat exécuté ont été supprimées. Les clauses générales BBTM, les passages barrés, le logo et la mise en page sont conservés. Le script reproductible est `scripts/projects/build_contract_templates.py`.

## Données Supabase

- `project_document_profiles` conserve, par projet et type de document, les champs complémentaires en JSON validé et un numéro de révision.
- `project_generated_documents` conserve les métadonnées immuables du fichier : type, révision, mission éventuelle, nom, type MIME, taille, empreinte SHA-256 et chemin privé.
- Les fichiers binaires générés sont enregistrés dans le bucket Supabase privé `project-files` ; les anciennes références SharePoint restent consultables en lecture seule.
- Les politiques RLS limitent la lecture à la société active et l'édition des profils aux rôles `admin` et `direction`.

## Classement documentaire

Site : [QHSE](https://bbtm668.sharepoint.com/sites/QHSE/)

Bibliothèques auditées :

- [Documents Projets](https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets) — destination des documents générés ;
- [Documents Contractuels](https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels) — consultation des contrats historiques.

Arborescence privée créée à la première génération :

```text
project-files/
└── projects/<project_id>/generated/
    ├── offer/r1/<uuid>-P265-Offre-R1.pdf
    ├── bimco_supplytime/r1/<uuid>-P265-BIMCO-R1.pdf
    ├── towage_contract/r1/<uuid>-P265-Contrat-de-remorquage-R1.pdf
    └── bareboat_charter/r1/<uuid>-P265-Contrat-d-affretement-R1.pdf
```

La RPC `projects_register_generated_storage_document` vérifie la session, le rôle, l'appartenance à la société, le type documentaire et l'existence du fichier privé avant l'enregistrement des métadonnées.

Les utilisateurs appartenant à la société active reçoivent un lien Supabase signé à durée courte pour consulter un fichier. Les rôles `admin` et `direction` sont les seuls à pouvoir générer et enregistrer un nouveau document.
