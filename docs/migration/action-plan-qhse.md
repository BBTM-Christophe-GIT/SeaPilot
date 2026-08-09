# Plan d’Action QHSE

## Périmètre livré

Le module SeaPilot consolide deux vues SharePoint dans `public.action_items` :

| Source | Liste SharePoint | Vue Power Query | Volume initial |
| --- | --- | --- | ---: |
| `Plan d'Action.iqy` | `8a1a31f5-e212-4a03-ae6b-bcc855ea029b` | `059A2677-1C55-4153-8AF4-8F5923C1C5DD` | 113 |
| `Indicateurs QHSE.iqy` | `833e4b0f-0f5a-4e9b-b1b0-885224a41282` | `70AE0C15-3C2D-4D30-B87F-4F1C5A24A65B` | 35 |

Chaque ligne conserve l’identifiant, le GUID, la date de modification, le site et la liste SharePoint. Le catalogue navire est rapproché par `vessel_sharepoint_item_id`.

## Workflow adapté

L’audit de l’application SharePoint a confirmé le parcours suivant :

1. liste groupée par statut, navire puis type d’action ;
2. filtres navire, type, statut et type d’écart ;
3. création en cinq sections : titre, émetteur, catégorie, proposition, photos ;
4. traitement avec action réalisée, commentaire et photo de clôture ;
5. sauvegarde intermédiaire ou clôture de l’action.

SeaPilot conserve ce parcours et ajoute une barre de fonctions `Actions`, `Indicateurs HSE` et `Sources importées`. L’émetteur d’une nouvelle action est prérempli avec le prénom et le nom du profil connecté. Les preuves sont enregistrées dans le bucket privé `action-plan-evidence` (10 Mo maximum par fichier).

## Catégories HSE et temps d’exposition

`public.action_type_catalog` contient les catégories historiques et les catégories de sécurité suivantes :

- Décès (FAT) ;
- Accident avec Arrêt de Travail (LTI / LWDC) ;
- Blessure – Travail adapté (RWC) ;
- Accident avec traitement médical (MTC) ;
- Accident sans arrêt de travail / premiers soins (FAC) ;
- presque-accident et observation sécurité ;
- situation dangereuse, dommage matériel, avarie T1/T2, accident de trajet, rapport de mer et événement environnemental.

Le trigger `sync_action_item_hse_event()` synchronise les catégories comptabilisées vers `public.hse_safety_events`. Les taux LTIFR, TRIR, FAR, FAC, MTC, RWC et SOFR sont calculés par `public.hse_kpi_summary()` avec le même registre d’heures d’exposition versionné que le module Suivi du Temps de travail.

## Réimport reproductible

L’export Microsoft 365 nécessite une session `m365` authentifiée :

```powershell
corepack pnpm@10.34.5 export:sharepoint:action-plan
corepack pnpm@10.34.5 import:sharepoint:linked -- --file .data/sharepoint-action-plan-qhse.json
```

Le fichier `.data/sharepoint-action-plan-qhse.json` reste local et ignoré par Git. L’import est idempotent sur `(sharepoint_list_id, sharepoint_item_id)`.

Contrôle post-import :

```sql
select sharepoint_list_title, count(*)
from public.action_items
where sharepoint_list_id in (
  '8a1a31f5-e212-4a03-ae6b-bcc855ea029b',
  '833e4b0f-0f5a-4e9b-b1b0-885224a41282'
)
group by sharepoint_list_title;
```

Le chargement initial du 9 août 2026 a produit 113 actions, 35 indicateurs QHSE et 10 événements reliés aux KPI d’exposition.
