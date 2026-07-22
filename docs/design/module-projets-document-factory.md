# Module Projets — missions et fabrique documentaire

## Résultat de l'audit fonctionnel

Le module reprend les deux parcours du SPFx QHSE :

1. un catalogue de projets filtrable, dont chaque ligne expose les missions planning rattachées ;
2. un assistant plein écran en cinq étapes : identification, planning, offre commerciale, facturation et documents.

Un projet catalogue peut être lié à zéro, une ou plusieurs lignes `planning_projects` au moyen de `catalog_project_id`. Une nouvelle mission reprend une date ou période et un navire, sans dupliquer le projet commercial.

La numérotation reste pilotée par `project_number_counters`. `projects_peek_next_code()` ne fournit qu'un aperçu à l'assistant (P265 attendu après l'import P264) ; le trigger `projects_assign_code` et `allocate_next_project_code()` réalisent l'attribution atomique lors de l'insertion.

## Documents disponibles

| Type | Format | État | Source des valeurs |
|---|---:|---|---|
| Offre commerciale | PDF | Actif | projet, client, mission, contrat |
| BIMCO SUPPLYTIME 2017 | PDF, 22 pages | Actif | Part I du SPFx + Part II générique du modèle fourni |
| Contrat de remorquage BBTM | DOCX, 6 pages | Actif | projet, client, mission, contrat et 19 clauses particulières |
| Affrètement — Coque nue | DOCX | En attente du modèle | emplacement de données déjà prévu |
| Prestation intellectuelle | DOCX | En attente du modèle | emplacement de données déjà prévu |

Le BIMCO fourni était un contrat P144 exécuté. SeaPilot ne réutilise ni ses valeurs, ni ses signatures, ni ses annexes client, ni l'historique Adobe. La génération assemble les deux pages Part I vierges déjà utilisées par le SPFx et les vingt pages génériques Part II (pages 5 à 24 du fichier fourni).

Le modèle de remorquage a été assaini : P220, dates et signatures ont été remplacés par des jetons. Les clauses générales BBTM et la mise en page sont conservées. Le script reproductible est `scripts/projects/build_contract_templates.py`.

## Données Supabase

- `project_document_profiles` conserve, par projet et type de document, les champs complémentaires en JSON validé et un numéro de révision.
- `project_generated_documents` conserve uniquement les métadonnées immuables du fichier SharePoint : type, révision, mission éventuelle, nom, type MIME, taille, empreinte SHA-256, identifiants Graph, dossier et URL.
- Les fichiers binaires ne sont pas enregistrés dans Supabase.
- Les politiques RLS limitent la lecture à la société active et l'édition des profils aux rôles `admin` et `direction`.

## Classement SharePoint

Site : [QHSE](https://bbtm668.sharepoint.com/sites/QHSE/)

Bibliothèques auditées :

- [Documents Projets](https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets) — destination des documents générés ;
- [Documents Contractuels](https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels) — consultation des contrats historiques.

Arborescence créée à la première génération :

```text
Documents Projets/
└── SeaPilot/
    └── P265 - Nom du projet/
        ├── P265 - Offre - R1.pdf
        ├── P265 - BIMCO SUPPLYTIME 2017 - R1.pdf
        └── P265 - Contrat de remorquage - R1.docx
```

L'Edge Function `project-document-upload` vérifie la session, le rôle, l'appartenance à la société et le rattachement de la mission avant tout envoi Microsoft Graph.

## Configuration Microsoft requise

L'application SeaPilot utilise Supabase Auth et ne possède donc pas de jeton Microsoft délégué. Une inscription d'application Entra ID est nécessaire pour le classement automatique. Configurer les secrets Supabase suivants :

```text
MICROSOFT_TENANT_ID=<tenant Entra ID>
MICROSOFT_CLIENT_ID=<application SeaPilot>
MICROSOFT_CLIENT_SECRET=<secret applicatif>
SHAREPOINT_PROJECTS_DRIVE_ID=b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_Ou31l1uVoWRrtjl4GcYGNl
```

Permission recommandée : Microsoft Graph `Sites.Selected` (Application), avec un droit `write` accordé uniquement au site QHSE. `Sites.ReadWrite.All` fonctionne également mais donne un périmètre plus large.

Déploiement :

```powershell
supabase secrets set MICROSOFT_TENANT_ID=... MICROSOFT_CLIENT_ID=... MICROSOFT_CLIENT_SECRET=... SHAREPOINT_PROJECTS_DRIVE_ID=...
supabase functions deploy project-document-upload --project-ref szlvyrrmvdvhzixilymh
```

Sans ces trois identifiants Entra ID, SeaPilot génère le fichier, le télécharge localement et signale que le classement SharePoint n'est pas configuré.
