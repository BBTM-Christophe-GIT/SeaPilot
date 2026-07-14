# SeaPilot Planning P2.1 — déploiement de l’assistant pilote

## Périmètre et garde-fous

La version `2.3.0` ajoute un assistant de conseil explicable. Le moteur est déterministe et s’exécute dans le client à partir des données Planning P0/P1 déjà autorisées. Il ne crée, ne modifie et ne supprime aucune affectation, publication ou dérogation.

Le feature flag est désactivé par défaut :

```dotenv
VITE_PLANNING_ASSISTANT_ENABLED=false
```

Le rendre visible nécessite simultanément :

1. `VITE_PLANNING_ASSISTANT_ENABLED=true` dans l’environnement Vercel ciblé ;
2. un rôle `admin`, ou un rôle `direction`/`armement` inscrit dans l’allowlist serveur ;
3. une appartenance active à l’entreprise courante.

## Migration

Appliquer après les 35 migrations P0/P1 :

```powershell
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
npx supabase db lint --linked --level warning
```

Migration attendue :

```text
202607140003_planning_p21_maritime_assistant.sql
```

Elle ajoute deux tables uniquement :

- `planning_assistant_pilots` : allowlist Direction/Armement administrée et auditée ;
- `planning_assistant_reviews` : journal append-only des décisions et de leur preuve explicable.

Les écritures directes sont révoquées. `set_planning_assistant_pilot` exige le rôle administrateur. `record_planning_assistant_review` vérifie l’accès pilote, la période, l’entreprise, le marin/navire et la présence des huit champs de preuve. Cette dernière RPC écrit seulement dans le journal assistant et `planning_change_log`.

## Activation pilote

1. Déployer la migration avec le flag à `false`.
2. Vérifier la RLS et le build.
3. Passer le flag à `true` uniquement en Preview ou sur l’environnement pilote.
4. Se connecter comme administrateur, ouvrir Planning → Réglages → Assistant Planning → Accès pilote.
5. Activer individuellement les utilisateurs Direction/Armement avec un motif d’au moins dix caractères et, si nécessaire, une date de fin.
6. Ne pas attribuer de rôle administratif pour contourner l’allowlist.

## Contrôles avant déploiement

```powershell
npx tsc -b --pretty false
npm run lint
npx vitest run --maxWorkers=2
npm run build
git diff --check
```

Vérifier également :

- aucune clé ou secret ajouté au dépôt ;
- le flag absent ou `false` dans Production tant que le pilote n’est pas approuvé ;
- 36 migrations locales/distantes alignées ;
- aucune politique RLS ou permission P1 supprimée ;
- les seuils travail/repos P1.3 restent administrés, jamais codés dans l’assistant.

## Recette après déploiement

1. Flag `false` : aucun bouton Assistant et aucune RPC d’accès appelée.
2. Flag `true`, marin/capitaine : aucun bouton Assistant.
3. Flag `true`, utilisateur Direction/Armement non inscrit : aucun bouton Assistant.
4. Administrateur : bouton visible et onglet Accès pilote disponible.
5. Pilote autorisé : suggestions visibles, onglet Accès pilote absent.
6. Ouvrir une suggestion et vérifier critères, données, règles, conflits, données indisponibles, confiance et justification.
7. Accepter puis refuser une suggestion avec commentaire : vérifier deux lignes dans `planning_assistant_reviews` et `planning_change_log`.
8. Vérifier qu’aucune ligne n’a changé dans `planning_assignments`, `planning_publications` ou `planning_derogations`.
9. Contrôler le rendu ordinateur et iPad, les cibles tactiles et l’absence d’erreur console.

## Requêtes de contrôle

```sql
select role_key, action_key, scope_mode
from public.planning_action_permissions
where action_key in ('use_assistant', 'manage_assistant_pilots')
order by role_key, action_key;

select company_id, user_id, enabled, valid_until, reason, updated_at
from public.planning_assistant_pilots
order by updated_at desc;

select suggestion_type, decision, reviewed_by_name, reviewed_at,
       suggestion_snapshot -> 'confidence' as confidence
from public.planning_assistant_reviews
order by reviewed_at desc;
```

## Retour arrière

Le retour arrière prioritaire ne supprime aucune donnée :

1. remettre immédiatement `VITE_PLANNING_ASSISTANT_ENABLED=false` et redéployer ;
2. conserver les deux tables pour audit ;
3. revenir au client `2.2.0` si nécessaire.

La suppression SQL n’est envisagée qu’après export des deux tables. Supprimer ensuite les RPC/policies P2.1, les tables, les actions P2.1 et restaurer les contraintes P1.3. Ne jamais supprimer le journal avant validation juridique et métier.
