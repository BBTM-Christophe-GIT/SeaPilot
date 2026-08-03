# SeaPilot v3.12.0 — module Suivi du Temps de Travail

Date de livraison : 3 août 2026.

Le chemin `/modules/workingTime` ouvre désormais une page métier dédiée au lieu de la page générique de migration.

## Architecture

- `WorkingTimePage.tsx` charge l’aperçu Planning avec `usePlanningOverview` ;
- la page réutilise `getPlanningPermissions` sans introduire de matrice de droits concurrente ;
- `PlanningP13Panel.tsx` accepte une présentation intégrée et limite la surface à l’onglet travail/repos ;
- les seuils restent stockés uniquement dans `planning_work_rest_policies` ;
- les lectures et écritures restent centralisées dans `planningP13Queries.ts` ;
- les contrôles 24 heures, 7 jours, repos consécutif, fractionnement, nuit et passation restent calculés par `planningP13.ts`.

Cette livraison ne comporte aucune migration Supabase. La migration P1.3 `202607140002_planning_p13_work_rest_notifications_exports.sql` doit déjà être appliquée.

## Autorisations

- administrateur : consultation et administration des politiques ;
- direction, armement, capitaine et marin : consultation selon les règles Planning et les politiques RLS existantes ;
- aucune valeur réglementaire n’est préremplie par le client.

## Vérification après déploiement

1. ouvrir `/modules/workingTime` avec un profil administrateur ;
2. vérifier l’affichage de la période, des politiques et des contrôles P1.3 ;
3. modifier la période et confirmer le recalcul des contrôles ;
4. vérifier que « Nouvelle politique » est disponible pour l’administrateur ;
5. ouvrir la page avec un profil non administrateur et vérifier que l’édition des politiques est absente ;
6. ouvrir `/modules/planning`, puis le cockpit P1.3, et confirmer que son comportement en dialogue est inchangé.

## Retour arrière

Revenir au commit client précédent restaure la page générique `workingTime`. Aucune donnée ni migration ne doit être annulée : les tables et politiques P1.3 sont partagées avec le Planning et restent nécessaires à ce dernier.
