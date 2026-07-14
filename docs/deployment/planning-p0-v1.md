# SeaPilot Planning P0 — préparation au déploiement V1

Version applicative cible : `1.9.0`
Migrations cibles : `202607130007_planning_p04_governance_v1.sql`, puis `202607130008_planning_p04_audit_backfill_cleanup.sql`
Périmètre : Planning P0.1 à P0.4, sans fonctionnalité P1/P2.

## 1. Ordre des migrations

Sur une base existante SeaPilot, appliquer les migrations dans l’ordre de leur horodatage. Le socle Planning V1 exige au minimum :

1. `202607130001_planning_control_rules.sql` ;
2. `202607130002_planning_rpc_permissions.sql` ;
3. `202607130003_planning_publication_workflow.sql` ;
4. `202607130004_planning_p01_foundations.sql` ;
5. `202607130005_planning_p02_event_views.sql` ;
6. `202607130006_planning_p03_assignments_handovers.sql` ;
7. `202607130007_planning_p04_governance_v1.sql` ;
8. `202607130008_planning_p04_audit_backfill_cleanup.sql`.

Ne jamais marquer manuellement `202607130007` ou `202607130008` comme appliquée. Les migrations doivent réellement s’exécuter avant le client `1.9.0`, car celui-ci sélectionne les auteurs, versions et entrées d’historique P0.4. `202607130008` retire uniquement les traces techniques produites par le backfill `company_id` ; elle ne supprime aucune action utilisateur.

## 2. Variables d’environnement

Aucune nouvelle variable n’est introduite par P0.4. Les trois variables Vite existantes restent obligatoires :

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_APP_BASE_URL=https://sea-pilot-ten.vercel.app
```

La clé `anon` est publique par conception ; ne jamais placer de clé `service_role`, mot de passe de base ou jeton personnel dans Vercel, `.env.example`, le dépôt ou un journal de CI.

## 3. Contrôles avant migration

1. Vérifier que la branche à déployer contient exclusivement P0.4 et que le statut Git est propre.
2. Sauvegarder la base Supabase ou confirmer la disponibilité d’un point de restauration récent.
3. Exporter au minimum `profiles`, `user_roles`, `people`, `vessels`, toutes les tables `planning_*`, `hr_documents` et `fleet_certificates`.
4. Relever les comptes exacts avant migration :

```sql
select 'profiles' as table_name, count(*) from public.profiles
union all select 'user_roles', count(*) from public.user_roles
union all select 'people', count(*) from public.people
union all select 'vessels', count(*) from public.vessels
union all select 'planning_assignments', count(*) from public.planning_assignments
union all select 'planning_days', count(*) from public.planning_days
union all select 'planning_periods', count(*) from public.planning_periods
union all select 'planning_projects', count(*) from public.planning_projects
union all select 'planning_publications', count(*) from public.planning_publications
union all select 'planning_versions', count(*) from public.planning_versions
union all select 'planning_handovers', count(*) from public.planning_handovers
union all select 'planning_derogations', count(*) from public.planning_derogations
union all select 'planning_change_log', count(*) from public.planning_change_log;
```

5. Vérifier qu’aucune relation obligatoire existante n’est orpheline : navires des affectations, marins des affectations, responsables des relèves et règles/personnes/navires des dérogations.
6. Exécuter les contrôles du client :

```powershell
npm ci
npx tsc -b --pretty false
npm run lint
npm test -- --maxWorkers=2 --reporter=dot
npm run build
npx supabase db lint --linked
npx supabase migration list
npx supabase db push --dry-run --linked
```

Le dry-run doit annoncer uniquement les migrations `202607130007` puis `202607130008` sur l’environnement P0.3 attendu. Sur un environnement où la gouvernance a déjà été appliquée, seule `202607130008` est attendue.

## 4. Application de la migration

```powershell
npx supabase db push --linked
npx supabase migration list
npx supabase db lint --linked
```

La migration de gouvernance s’exécute dans cet ordre interne : création de BBTM, adhésion des profils, rétro-remplissage des rôles et données, contraintes `NOT NULL`/FK/index, matrice d’actions, RLS, workflow, verrouillage, audit et RPC. La migration suivante retire uniquement les traces anonymes dont les instantanés diffèrent exclusivement par le rétro-remplissage `company_id`. Aucune ligne métier ni action utilisateur n’est supprimée.

## 5. Contrôles après migration

Les requêtes suivantes doivent renvoyer zéro, sauf la première qui doit renvoyer une entreprise BBTM :

```sql
select id, code, name, active from public.companies where code = 'bbtm';

select count(*) as profiles_without_membership
from public.profiles profile
left join public.company_memberships membership
  on membership.company_id = profile.active_company_id
 and membership.user_id = profile.id
 and membership.active
where membership.user_id is null;

select count(*) as roles_without_company from public.user_roles where company_id is null;
select count(*) as people_without_company from public.people where company_id is null;
select count(*) as vessels_without_company from public.vessels where company_id is null;
select count(*) as assignments_without_company from public.planning_assignments where company_id is null;
select count(*) as days_without_company from public.planning_days where company_id is null;
select count(*) as periods_without_company from public.planning_periods where company_id is null;
select count(*) as projects_without_company from public.planning_projects where company_id is null;
select count(*) as publications_without_company from public.planning_publications where company_id is null;
select count(*) as logs_without_company from public.planning_change_log where company_id is null;
```

Comparer ensuite les comptes métier avec le relevé pré-migration. Les seuls ajouts attendus sont BBTM, les adhésions, la matrice de 32 capacités et les éventuelles entrées de journal générées par une recette métier volontaire.

Contrôler les RLS avec un compte de chaque rôle :

- administrateur : toutes les actions et archivage ;
- direction : édition, validation, publication, réouverture, dérogations et historique ;
- armement : édition, soumission, relèves, historique et export, sans publication ;
- capitaine : lecture et validation uniquement sur un navire affecté ;
- marin : lecture de ses propres affectations et navires, sans écriture ni historique de gouvernance.

## 6. Recette applicative après déploiement

Sur ordinateur 15 pouces puis iPad 12,9 pouces :

1. ouvrir `/modules/planning` sans erreur réseau ou console ;
2. créer une opération et lui affecter un navire ;
3. affecter un marin avec fonction, heures et statut ;
4. vérifier qu’une double affectation apparaît dans les conflits ;
5. enregistrer une relève et comparer les bordées ;
6. soumettre la période avec un compte armement ;
7. valider le navire avec un capitaine affecté ou la direction ;
8. publier avec la direction ou un administrateur ;
9. vérifier que déplacement, redimensionnement, affectation, relève et dérogation sont bloqués ;
10. réouvrir avec un motif d’au moins dix caractères ;
11. modifier un événement et vérifier l’état « Modifié après publication » ;
12. ouvrir l’onglet Historique et vérifier auteur, date, résumé et version immuable ;
13. vérifier qu’un marin ne voit ni les autres marins ni un navire d’une autre entreprise.

## 7. Déploiement Vercel

La base doit être migrée avant la construction Vercel du client `1.9.0`. Après push Git :

1. attendre le succès du déploiement Preview du commit ;
2. ouvrir l’URL Preview et contrôler page, console et requêtes ;
3. vérifier les deux formats 15 pouces et iPad 12,9 pouces ;
4. ne promouvoir en production qu’après la recette Preview ;
5. contrôler ensuite l’alias `https://sea-pilot-ten.vercel.app` et la version affichée.

## 8. Retour arrière

### Retour arrière applicatif recommandé

En cas de régression du client, redéployer le commit `1.8.0` en conservant la migration P0.4. Les colonnes sont additives, les sélections P0.3 restent valides, et les signatures publiques des RPC sont conservées. C’est le retour arrière le moins risqué.

### Retour arrière base avant toute donnée P0.4

Uniquement si aucune deuxième entreprise, permission navire, publication/version ou modification P0.4 n’a été créée :

1. mettre le Planning en maintenance ;
2. exporter les quatre nouvelles tables et toutes les tables `planning_*` ;
3. déployer le client `1.8.0` ;
4. restaurer les fonctions, contraintes d’audit et politiques depuis `202607130003_planning_publication_workflow.sql` puis `202607130006_planning_p03_assignments_handovers.sql` dans une transaction contrôlée ;
5. conserver les colonnes `company_id`, `active_company_id` et les tables d’entreprise tant que leur suppression n’a pas été validée séparément ; elles sont compatibles avec P0.3 et leur suppression serait destructive ;
6. relancer `supabase db lint --linked`, les comptes de données et la recette P0.3.

Si une donnée multi-entreprise ou une version P0.4 existe, ne pas tenter une suppression automatique : restaurer le snapshot Supabase pris avant migration ou corriger en avant avec une migration dédiée.

## 9. Validation effectuée avant livraison

- chaîne complète des migrations exécutée sur PostgreSQL isolé ;
- migration P0.4 rejouée une deuxième fois sans erreur ;
- scénario SQL validé : opération, navire, marin, validation capitaine, publication direction, verrou, réouverture, déplacement, historique, version immuable et isolation inter-entreprises ;
- tests React/Vitest du Planning couvrant les vues, contrôles, relèves, permissions, auteurs, versions et historique ;
- contrôle TypeScript, lint, tests complets et build à exécuter sur le commit final et reporter dans la PR.
