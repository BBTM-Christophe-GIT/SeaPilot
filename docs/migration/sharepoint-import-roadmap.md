# SeaPilot - Import SharePoint vers Supabase

Date: 2026-07-01

## Format d'export accepte

Le pipeline applicatif accepte un bundle JSON avec une entree par source SharePoint:

```json
{
  "exportedAt": "2026-07-01T21:30:00Z",
  "sources": [
    {
      "sourceKey": "list-rh-personnel-bbtm",
      "items": [
        {
          "id": "42",
          "fields": {
            "ID": 42,
            "Title": "LECOCQ",
            "Pr_x00e9_nom": "Julien",
            "Modified": "2026-06-30T08:15:00Z"
          }
        }
      ]
    }
  ]
}
```

Les `sourceKey` doivent correspondre a l'inventaire dans `src/features/sharepoint/sharePointInventory.ts`.

Un exemple complet est disponible dans `docs/migration/sample-sharepoint-export.json`.

## Commande locale

Exporter la liste RH depuis SharePoint avec Microsoft 365 CLI:

```powershell
pnpm --package=@pnp/cli-microsoft365 dlx m365 login --authType browser
npm run export:sharepoint:rh
```

L'export RH est ecrit dans `.data/sharepoint-rh-personnel-bbtm.json`. Le dossier `.data/` est ignore par git car il peut contenir des donnees personnelles.

Exporter la liste RH et la bibliotheque `Brevets et Visites Medicales` dans un seul bundle:

```powershell
npm run export:sharepoint:rh-full
```

Si les fichiers `.iqy` de SharePoint sont disponibles, les fournir au script permet d'utiliser les vues exactes de SharePoint, par exemple `Personnel Actif`:

```powershell
npm run export:sharepoint:rh-full -- --iqy "list-rh-personnel-bbtm=C:\Users\chris\Downloads\RH - Personnel BBTM.iqy" --iqy "library-brevets-visites-medicales=C:\Users\chris\Downloads\Brevets et Visites Médicales.iqy"
```

L'export complet est ecrit dans `.data/sharepoint-rh-full.json`.

Verifier un export sans ecrire en base:

```powershell
npm run import:sharepoint -- --file docs/migration/sample-sharepoint-export.json --dry-run
```

Importer dans Supabase local:

```powershell
$env:SUPABASE_URL = "http://127.0.0.1:54321"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service-role-key>"
npm run import:sharepoint -- --file C:\chemin\vers\export-sharepoint.json
```

Importer le RH dans le projet Supabase Cloud lie via la CLI Supabase:

```powershell
npm run import:sharepoint:linked -- --file .data/sharepoint-rh-personnel-bbtm.json
```

Cette variante genere un SQL d'upsert puis appelle `supabase db query --linked`; elle n'a pas besoin de stocker une cle service-role dans le depot.

Importer le bundle RH complet puis rattacher les documents aux collaborateurs:

```powershell
npm run import:sharepoint:linked -- --file .data/sharepoint-rh-full.json
supabase db query "select * from public.resolve_sharepoint_hr_document_links();" --linked
```

Importer puis rattacher automatiquement les lignes Planning aux marins/navires deja importes:

```powershell
npm run import:sharepoint -- --file C:\chemin\vers\export-sharepoint.json --resolve-planning-links
```

Importer puis rattacher automatiquement le Planning, les documents RH, les certificats flotte, les PDF QSMS, les projets, leurs documents, DPR, achats, actions et bibliotheques documentaires aux donnees deja importees:

```powershell
npm run import:sharepoint -- --file C:\chemin\vers\export-sharepoint.json --resolve-planning-links --resolve-hr-document-links --resolve-fleet-certificate-links --resolve-published-procedure-links --resolve-project-links --resolve-project-document-links --resolve-dpr-links --resolve-operation-links --resolve-document-links
```

Le script accepte aussi `VITE_SUPABASE_URL`, `SUPABASE_ANON_KEY` et `VITE_SUPABASE_ANON_KEY`, mais la cle `SUPABASE_SERVICE_ROLE_KEY` est recommandee pour les imports administratifs.

## Sources deja transformables

- `list-bbtm-flotte` vers `vessels`
- `list-rh-personnel-bbtm` vers `people`
- `list-smtr-journees-planning` vers `planning_days`
- `list-smtr-planning-periodes` vers `planning_periods`
- `list-kpi-projets-planning` vers `planning_projects`
- `library-brevets-visites-medicales` vers `hr_documents`
- `library-certificats-flotte` vers `fleet_certificates`
- `library-qsms` vers `procedures`
- `library-qsms-pdf` vers `published_procedures`
- `list-bbtm-clients` vers `clients`
- `list-bbtm-projets` vers `projects`
- `library-documents-projets` vers `project_documents`
- `library-documents-contractuels` vers `contract_documents`
- `list-mgo` vers `mgo_prices`
- `list-indicateurs-projet-p144emdt` vers `dpr_items`
- `library-dpr` vers `dpr_archives`
- `list-demande-achat` vers `purchase_requests`
- `list-audit` vers `action_items`
- `library-fiche-progres` vers `action_documents`
- `library-logos-systeme` vers `document_assets`
- `library-vehicules` vers `fleet_documents`
- `library-permis-travail` vers `work_permits`
- `library-suivi-temps-travail` vers `work_time_documents`
- `library-archive-documentaire` vers `document_archive`
- `library-notes-service` vers `service_notes`
- `library-alerte-securite` vers `safety_alerts`
- `library-documentation-technique` vers `technical_documents`
- `library-fiche-navire-equipement` vers `vessel_equipment_documents`
- `library-registre-apparaux-levage` vers `lifting_reports`
- `library-documents-partages` vers `shared_documents`

Chaque ligne importee recoit les colonnes de reconciliation:

- `sharepoint_site_url`
- `sharepoint_list_id`
- `sharepoint_list_title`
- `sharepoint_item_id`
- `sharepoint_unique_id`
- `sharepoint_file_ref`
- `sharepoint_encoded_abs_url`
- `source_modified_at`

Les upserts se font sur `sharepoint_list_id,sharepoint_item_id` pour permettre de rejouer un import sans doublons.

## Reste a faire

### Donnees et imports

- Exporter le bundle SharePoint reel avec Microsoft Graph ou PnP, en priorite:
  - `RH - Personnel BBTM`
  - `BBTM - Flotte`
  - `SMTR - Journees - Planning`
  - `SMTR - Planning Periodes`
  - `KPI - Projets-Planning`
  - `Demande d'Achat`
  - `Audit`
  - bibliotheques documentaires techniques et operationnelles

### Base Supabase

- Completer les policies RLS par module.

### Application

- Enrichir le module RH avec les sections restantes de la fiche collaborateur.
- Construire les modules encore placeholders selon la priorite metier restante.

### Application - deja livre

- Ecran admin de suivi d'import SharePoint avec sources, modules, tables cibles, priorites et statut de confirmation.
- Module Planning enrichi avec filtres par navire, marin, periode et statut.
- Documents RH enrichis avec dates, source, notes et lien vers le fichier importe.
- Documents RH importes sans collaborateur rattache visibles par les roles bureau avec compteur de reconciliation.
- Fiche RH enrichie avec champs collaborateur importes: identite, contrat, coordonnees, urgence, habilitations et mensurations.
- Module RH enrichi avec filtres fonction/grade/registre/role, KPIs contrat/urgence/habilitations et badges de synthese collaborateur.
- Fiche RH editable par les roles bureau avec sauvegarde des champs importes collaborateur.
- Rapport Plan de Formation migre depuis le Dashboard SPFx : ouverture directe d'un PDF A4, coûts cumulés trimestriels, récapitulatif financier, détail par collaborateur, certificats médicaux, historiques annuels du turnover et de l'ancienneté moyenne depuis la première embauche, et formules de calcul sur la dernière page.
- Module Planning enrichi avec details SMTR importes: debarquement, depart, rythme, bordee, repos, cumul, commentaires et source.
- Cockpit Planning SPFx migre dans SeaPilot : calendrier Semaine/Mois/An, groupes navire/bordee/marin, projets et statuts, zoom, plein ecran, filtres, creation/duplication d'affectations, panneaux certificats, marins non affectes, facturation et alertes RH. L'inventaire et les regles sont conserves dans `docs/migration/planning-spfx-inventory.md`.
- Module Certificats flotte raccorde a `fleet_certificates` avec KPIs, filtres par navire/statut/recherche, liens fichiers et creation pour les roles bureau.
- Module Procedures QHSE raccorde a `procedures` et `published_procedures` avec KPIs, filtres, liens fichiers et creation de procedure pour les roles bureau.
- Module Daily Progress Report raccorde a `dpr_items`, `dpr_archives` et `mgo_prices` avec KPIs, filtres projet/navire/date/recherche, archives PDF, dernier prix MGO et creation de rapport pour les roles bureau.
- Module Projets raccorde a `projects`, `clients`, `project_documents` et `contract_documents` avec KPIs, filtres projet/client/navire/date/recherche, liens fichiers et creation de projet pour les roles Direction/Admin.
- Module Achats raccorde a `purchase_requests` avec KPIs, filtres statut/projet/fournisseur/date/recherche et creation de demande pour les roles bureau.
- Module Plan d'action raccorde a `action_items` et `action_documents` avec KPIs, filtres statut/priorite/navire/projet/date/recherche, fiches de progres et creation d'action pour les roles bureau.
- Module QHSE documentaire raccorde aux bibliotheques documentaires normalisees avec KPIs, filtres bibliotheque/navire/statut/categorie/date/recherche, liens fichiers et creation de document pour les roles bureau.

### Deploiement

- Creer les autres comptes utilisateurs et affecter les roles metier.
- Realiser une recette avec comptes `Admin`, `Direction`, `Armement`, `Capitaine`, `Marin`.

### Deploiement - deja livre

- Projet Vercel `bbtm-app/sea-pilot` cree et lie au depot GitHub.
- URL stable de production `https://sea-pilot-ten.vercel.app`.
- `VITE_APP_BASE_URL=https://sea-pilot-ten.vercel.app` configure dans Vercel pour Production et Preview.
- `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` configures dans Vercel pour Production.
- `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` configures dans Vercel pour Preview.
- Supabase CLI installee et mise a jour en version `2.109.0`.
- Projet Supabase Cloud `SeaPilot` (`szlvyrrmvdvhzixilymh`) lie au depot local.
- 16 migrations appliquees sur Supabase Cloud.
- Base distante verifiee avec `supabase db push --dry-run` et `supabase db lint --linked`.
- Supabase Auth configure sur `https://sea-pilot-ten.vercel.app` avec inscriptions publiques desactivees.
- Premier compte admin `christophe@bbtm.fr` cree dans Supabase Auth avec profil applicatif et role `admin`.
- Deploiement production verifie avec connexion admin, navigation privee et acces au module `/modules/planning`.
