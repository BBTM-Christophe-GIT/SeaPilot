# Suppression administrateur des congés

## Résultat

La vue Planning utilise désormais le libellé « Congés » dans les barres, les commandes et le centre des absences.

La colonne fixe « Navires · Bordées · Marins » reste également au-dessus des barres du calendrier lors d’un défilement horizontal, y compris sur les écrans étroits. Les barres de congés ne recouvrent plus les noms des marins.

Le statut technique historique `Vacance` est conservé dans les données et les API, mais toutes ses présentations dans l’application utilisent désormais le libellé « Vacances ».

Un administrateur peut supprimer définitivement une entrée de type `leave` depuis la fiche ouverte en cliquant sur la barre de congés. L’action :

- affiche une confirmation explicite ;
- n’est pas proposée aux rôles Direction, Armement, Capitaine ou Marin ;
- est également bloquée côté Supabase pour tout utilisateur non administrateur ;
- supprime les dépendances Planning qui référencent cette entrée afin de ne laisser aucun lien orphelin ;
- recharge les absences et recalcule les conflits et postes vacants ;
- conserve la ligne supprimée dans `planning_change_log`.

Les autres types d’absence restent hors du périmètre de cette suppression.

## Migration

Migration additive :

`supabase/migrations/202607160010_planning_admin_delete_leave.sql`

Elle ajoute la RPC `public.delete_planning_leave(bigint)`. Aucun privilège direct de suppression sur `planning_absences` n’est accordé.

## Validation

```powershell
npm run lint
npm test
npm run build
npx supabase test db --local supabase/tests/planning_global_distribution_test.sql
```

La recette fonctionnelle attendue est :

1. ouvrir Planning avec un compte administrateur ;
2. cliquer sur une barre « Congés » ;
3. choisir « Supprimer les congés » ;
4. annuler une première fois pour confirmer l’absence de mutation ;
5. confirmer une seconde fois ;
6. vérifier la disparition de la barre et le recalcul des impacts ;
7. vérifier que le bouton n’est pas présent avec un rôle non administrateur.
