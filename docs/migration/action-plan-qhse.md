# Plan d’Action QHSE

## Périmètre livré

Le module SeaPilot consolide deux vues SharePoint dans `public.action_items` :

| Source | Liste SharePoint | Vue Power Query | Volume initial |
| --- | --- | --- | ---: |
| `Plan d'Action.iqy` | `8a1a31f5-e212-4a03-ae6b-bcc855ea029b` | `059A2677-1C55-4153-8AF4-8F5923C1C5DD` | 113 |
| `Indicateurs QHSE.iqy` | `833e4b0f-0f5a-4e9b-b1b0-885224a41282` | `70AE0C15-3C2D-4D30-B87F-4F1C5A24A65B` | 35 |

Chaque ligne conserve l’identifiant, le GUID, la date de modification, le site et la liste SharePoint. Le catalogue navire est rapproché par `vessel_sharepoint_item_id`.

## Workflow Rapport d'évènement

Les nouvelles fiches SeaPilot suivent désormais le parcours suivant :

1. l'émetteur renseigne l'identification, la date et l'heure du constat, le navire, sa manœuvre, les conditions météo, la qualification, le constat, l'action proposée et les photos ;
2. le type d'écart n'est demandé que pour les audits client, eCMID/IMCA et interne BBTM, ainsi que les visites bossoir, grue, HSE/exploitation, radio et société de classification ;
3. le rapport est soumis à Christophe MINASSIAN sans responsable ni cause préaffectés ;
4. Christophe sélectionne la cause de l'anomalie puis affecte une ou plusieurs personnes et/ou l'équipage dynamique d'un navire ;
5. après approbation, les responsables traitent l'action, ajoutent leur commentaire et la photo de preuve, puis clôturent la fiche.

L'émetteur est prérempli depuis le profil connecté et sa signature active est figée lors de la création. Le PDF A4 porte le titre `RAPPORT D'EVENEMENT`, reprend la date et l'heure, la signature, les conditions du navire et les photos. La ligne `Type d'écart` est absente lorsque cette donnée ne s'applique pas. Les preuves restent enregistrées dans le bucket privé `action-plan-evidence` (10 Mo maximum par fichier).

Les affectations d'équipage sont dynamiques : un Marin voit et peut traiter l'action lorsqu'une affectation Planning confirmée le rattache au navire concerné. Les politiques RLS et les RPC appliquent ce périmètre côté base, indépendamment de l'interface.

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
