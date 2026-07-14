# Déploiement SeaPilot Planning V2 — P1.3

## Périmètre

La version applicative `2.2.0` finalise P1 avec :

- politiques administrables de travail/repos, sans seuil réglementaire embarqué ;
- contrôles 24 h, 7 jours, repos consécutif/fractionné, nuit et passation ;
- notifications applicatives individualisées ;
- tableau de bord Planning ;
- exports Excel, PDF et ICS ;
- dépendances opérationnelles avec refus des cycles.

La décision de conformité dépend des seuils saisis par l’entreprise et de la complétude des données SMTR. Une valeur manquante produit « non évaluable », jamais une conformité implicite.

## Variables d’environnement

Aucune nouvelle variable n’est requise. Conserver :

```dotenv
VITE_APP_BASE_URL=https://sea-pilot-ten.vercel.app
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Ne jamais exposer la clé `service_role` dans Vite ou Vercel.

## Ordre des migrations

Appliquer toutes les migrations P0/P1 dans l’ordre du nom de fichier. Pour un environnement déjà en P1.2, appliquer uniquement :

1. `supabase/migrations/202607140002_planning_p13_work_rest_notifications_exports.sql`.

La migration :

- ajoute trois colonnes nullable à `planning_days` ;
- crée `planning_work_rest_policies`, `planning_notifications` et `planning_dependencies` ;
- ajoute actions, règles sans seuil, index, RLS, RPC et triggers ;
- ne modifie ni ne supprime aucune affectation, absence, publication, relève ou matrice existante.

## Contrôles avant déploiement

1. Exporter au minimum `planning_days`, `planning_rules`, `planning_action_permissions`, `planning_change_log`, `planning_assignments`, `planning_publications`, `planning_handovers`, `planning_absences` et `planning_conflict_cases`.
2. Relever leurs comptes et conserver l’horodatage de l’export.
3. Vérifier la branche et l’absence de fichiers secrets :

```powershell
git status --short
git diff --check
```

4. Vérifier le différentiel Supabase :

```powershell
npx supabase migration list --linked
npx supabase db push --dry-run --linked
```

5. Exécuter les validations applicatives :

```powershell
npm ci
npx tsc -b --pretty false
npm run lint
npm test -- --maxWorkers=4
npm run build
```

## Application

```powershell
npx supabase db push --linked
npx supabase migration list --linked
npx supabase db lint --linked --level warning
```

Déployer ensuite le même commit sur Vercel. Le client `2.2.0` sélectionne les nouvelles colonnes `planning_days` et les trois tables P1.3 ; la migration doit donc précéder le déploiement.

## Recette fonctionnelle V2

Avec un compte administrateur :

1. ouvrir `/modules/planning`, puis `Paramètres` → `Cockpit métier P1.3` ;
2. constater qu’aucun seuil n’est prérempli lors de la création d’une politique ;
3. saisir une politique de test approuvée par l’entreprise et vérifier les contrôles 24 h/7 j ;
4. vérifier que les métriques détaillées absentes apparaissent « non évaluables » ;
5. vérifier qu’une dérogation active et ciblée transforme uniquement le contrôle correspondant ;
6. actualiser les notifications et marquer une notification lue ;
7. créer une dépendance maintenance → remise en service et vérifier son état ;
8. tenter un cycle et confirmer le refus serveur ;
9. générer un Excel liste d’équipage, un PDF travail/repos et un ICS Planning ;
10. contrôler le tableau de bord et les échéances cumulatives à 7, 14 et 30 jours.

Avec un compte marin, vérifier qu’il ne voit que ses notifications et ne peut ni administrer les seuils, ni créer une dépendance, ni lancer un export global. Avec un capitaine, vérifier la limitation au navire/période affectés.

## Contrôles après déploiement

```sql
select count(*) from public.planning_work_rest_policies;
select count(*) from public.planning_notifications;
select count(*) from public.planning_dependencies;

select action_key, role_key, scope_mode
from public.planning_action_permissions
where action_key in ('manage_work_rest', 'read_notifications', 'manage_dependency')
order by action_key, role_key;
```

Vérifier également :

- migration locale/distante `202607140002` alignée ;
- `supabase db lint` sans erreur ;
- checks GitHub verts ;
- déploiement Vercel du commit en état `success` ;
- URL Preview puis route directe `/modules/planning` en HTTP 200 ;
- absence d’erreur console et de débordement horizontal à 1280×720 et 1024×1366.

## Retour arrière

Le retour arrière est export-first et doit être validé avec le responsable des données.

1. Revenir au dernier commit P1.2 côté Vercel avant de changer le schéma.
2. Exporter les trois tables P1.3, les colonnes `consecutive_rest_hours`, `rest_period_count`, `night_work_hours` et les entrées d’audit `work_rest_policy`/`dependency`.
3. Désactiver puis supprimer les cinq triggers `*_p13_notify`.
4. Révoquer et supprimer les RPC/fonctions P1.3.
5. Supprimer `planning_dependencies`, `planning_notifications`, puis `planning_work_rest_policies`.
6. Restaurer les contraintes d’actions, de portée des règles et d’entités d’audit depuis P1.2.
7. Ne supprimer les trois colonnes nullable de `planning_days` qu’après confirmation écrite que leur export est exploitable.

Les notifications sont dérivées et peuvent être régénérées ; les politiques et dépendances sont des données métier et doivent être restaurées depuis l’export en cas de retour ultérieur à P1.3.
