# SeaPilot Planning P1.1 — procédure de migration et retour arrière

Version applicative cible : `2.0.0`

Migrations cibles : `202607130009_planning_p11_rotations_templates_manning.sql`, puis `202607130010_planning_p11_rotation_lint_cleanup.sql`
Prérequis : P0.4 stable, migrations `202607130007` et `202607130008` appliquées.

## Ordre et garanties

Appliquer toutes les migrations par ordre horodaté, puis `202607130009` et `202607130010`. La première ajoute cinq tables sans modifier ni supprimer les lignes P0. Elle étend la matrice d’actions et l’historique, installe la RLS et expose cinq RPC authentifiées. La seconde remplace à l’identique la RPC de génération afin de retirer une déclaration PL/pgSQL redondante ; elle ne touche aucune donnée. Les rotations futures créées après déploiement utilisent les affectations P0 natives ; aucune donnée n’est générée pendant les migrations elles-mêmes.

La migration peut être rejouée : tables, index et fonctions sont idempotents ; politiques et triggers sont supprimés puis recréés. Les RPC de génération et de modification prennent un verrou transactionnel par marin ou navire afin d’éviter deux séries ou versions concurrentes.

## Avant migration

1. Confirmer une sauvegarde ou un point de restauration Supabase récent.
2. Exporter `planning_assignments`, `planning_projects`, `planning_handovers`, `planning_change_log`, `planning_action_permissions` et `planning_vessel_permissions`.
3. Relever les comptes de ces tables et vérifier que le Planning P0.4 fonctionne.
4. Exécuter :

```powershell
npm ci
npx tsc -b --pretty false
npm run lint
npm test
npm run build
npx supabase migration list --linked
npx supabase db push --dry-run --linked
npx supabase db lint --linked
```

Le dry-run doit annoncer `202607130009`, puis `202607130010`, sur une base P0.4 à jour. Sur l’environnement où `202607130009` a déjà été appliquée, seule `202607130010` est attendue.

## Application

```powershell
npx supabase db push --linked
npx supabase migration list --linked
npx supabase db lint --linked
```

Déployer ensuite le client `2.0.0`. Aucun secret ou nouvelle variable d’environnement n’est requis ; les trois variables Vite existantes restent suffisantes.

## Contrôles après migration

Vérifier que les cinq tables existent, que leur RLS est active et que les actions `manage_rotation`, `manage_template` et `manage_manning` sont attribuées uniquement à `admin`, `direction` et `armement` par défaut.

Recette minimale :

1. générer quatre occurrences 14/14 sur un marin sans affectation concurrente ;
2. vérifier quatre `planning_assignments` distinctes et quatre liens `planning_rotation_occurrences` ;
3. déplacer la deuxième occurrence seule et vérifier que les trois autres dates ne changent pas ;
4. créer puis appliquer un modèle Transit et vérifier le nouveau `planning_project` ;
5. créer une matrice active avec un capitaine minimum et deux matelots minimum ;
6. vérifier les postes vacants sur une période sans équipage complet ;
7. contrôler en compte capitaine/marin qu’aucune RPC d’écriture P1.1 n’est autorisée ;
8. vérifier qu’une entreprise ne lit ni ne référence les données P1.1 d’une autre entreprise.

## Retour arrière

Le retour arrière ne doit jamais effacer automatiquement les affectations déjà générées. Procéder ainsi :

1. désactiver temporairement l’accès au panneau P1.1 en redéployant le client P0.4 si nécessaire ;
2. exporter les cinq tables P1.1 et les affectations `source_label = 'seapilot_rotation'` ;
3. conserver ces affectations si elles ont été publiées, utilisées dans une relève ou validées opérationnellement ;
4. supprimer les fonctions, triggers, politiques et cinq tables P1.1 dans l’ordre inverse des dépendances ;
5. restaurer les contraintes d’actions et de types d’historique définies par `202607130007` ;
6. rejouer TypeScript, tests, build, RLS et une recette P0.4.

La suppression des affectations générées est une décision métier distincte, à faire uniquement après export et vérification de leurs dépendances.
