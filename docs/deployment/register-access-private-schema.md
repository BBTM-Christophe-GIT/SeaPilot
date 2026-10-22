# Accès aux registres LSA et Exercices

Les requêtes authentifiées échouaient avec `permission denied for schema private`.
Les politiques RLS du registre LSA et les RPC des exercices appellent des fonctions
du schéma `private` : leurs droits d’exécution étaient déjà accordés, mais le rôle
PostgreSQL `authenticated` ne disposait pas du droit de résoudre les objets de ce
schéma. Le défaut concernait donc aussi les comptes Admin.

La migration du calendrier personnel `20261011065558` avait révoqué ce droit sur
le schéma partagé, alors que les migrations précédentes l’accordaient pour les
RPC existants. Les nouvelles tables et fonctions privées doivent conserver leurs
ACL spécifiques sans retirer ce droit de résolution aux autres modules.

Appliquer `supabase/migrations/20261011191929_restore_register_private_schema_usage.sql`.
La correction accorde uniquement `USAGE ON SCHEMA private TO authenticated`.
Elle n’accorde aucun droit à `anon`, aucun accès aux tables privées, aucun droit
`CREATE` ni droit général d’exécution sur les fonctions. Les contrôles de session,
d’adhésion active, de société, de module et d’affectation restent ceux des RPC/RLS
existants. Le schéma `private` reste hors des schémas exposés à l’API.

Cette distinction entre résolution d’un schéma et permissions sur ses objets est
décrite dans la [documentation PostgreSQL sur les privilèges](https://www.postgresql.org/docs/current/ddl-priv.html).
Les [règles RLS Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
continuent de limiter les lignes accessibles.

## Périmètre par profil

| Profil | Registre LSA | Catalogue LSA | Registre des Exercices |
| --- | --- | --- | --- |
| Administration | Lecture et actions sur les navires autorisés de la société active | Gestion | Marins offshore de la société active |
| Direction | Lecture et actions sur les navires autorisés de la société active | Lecture | Marins offshore de la société active |
| Armement | Lecture et actions sur les navires autorisés de la société active | Lecture | Marins offshore de la société active |
| Capitaine | Lecture des navires autorisés par ses affectations ; actions sur ses navires actifs actuellement accessibles | Gestion dans sa société | Lui-même et sa bordée selon les affectations Planning |
| Marin | Lecture des navires autorisés par ses affectations ; actions sur ses navires actifs actuellement accessibles | Lecture | Son propre carnet lié à sa fiche RH |

Les actions LSA comprennent ajout, modification, mise à jour de l’échéance et
suppression logique. Une affectation historique peut conserver la lecture, mais
ne donne aucun droit de mutation. Le client consulte `lsa_can_add_item` pour
activer les actions sur le navire sélectionné. Un compte Capitaine ou Marin sans
fiche RH liée n’obtient aucun élargissement de périmètre. Les rôles se cumulent ; un rôle de
bureau donne le périmètre société.

Le registre des exercices permet l’export du carnet individuel autorisé, avec les
filtres année et navire. Les comptes de bureau disposent aussi du filtre En poste /
Anciens marins / Tous les marins. Capitaine et Marin utilisent le périmètre renvoyé
par le serveur, sans accès supplémentaire aux DPR sous-jacents.

## Vérification

Exécuter sur la base migrée les fixtures ci-dessous avec une connexion PostgreSQL
administrative configurée par les variables `PG*` et un fichier de mots de passe
local. Chaque fixture se termine par `ROLLBACK` et ne conserve aucun compte ni
matériel de test.

```powershell
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/register_private_schema_access_test.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/lsa_register_access_test.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/lsa_designation_catalog_test.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/lsa_item_actions_test.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/emergency_exercises_access_test.sql
pnpm test src/features/lsa/LsaPage.test.tsx src/features/emergencyExercises/EmergencyExercisesPage.test.tsx src/features/emergencyExercises/emergencyExercisesModel.test.ts src/features/emergencyExercises/emergencyExercisesPdf.test.ts src/features/permissions/moduleAccess.test.ts src/features/permissions/navigationPermissions.test.ts
pnpm build
```

La nouvelle fixture contrôle le privilège de schéma et les entrées RLS/RPC qui
déclenchaient l’erreur. Les autres fixtures utilisent des identités Auth distinctes
pour les cinq profils et vérifient les accès autorisés, les refus hors société ou
affectation, les mutations, le catalogue, les historiques, la révocation du module
et les accès anonymes. Les tests React utilisent des données synthétiques et des
contextes de profil indépendants. Les vues Marin/Capitaine simulées depuis une
session Admin ne servent pas de preuve des permissions réelles.

La migration est appliquée au projet SeaPilot le 11 octobre 2026. Les cinq suites
SQL ci-dessus passent sur la base déployée, en transactions annulées. Avant la
correction, la suite Exercices reproduisait le refus d’accès au schéma `private`.
Les points d’entrée LSA et Exercices passent également en lecture avec les
identités des comptes actifs de production disposant des deux modules ; la
lecture LSA hors société reste refusée. Aucun compte ni matériel de test n’est
conservé. Les ACL contrôlées confirment l’absence d’accès anonyme au schéma,
d’accès direct aux tables privées et de droit `CREATE` pour `authenticated`.
Les six suites React ciblées représentent 86 cas validés. La suite Exercices a
été relancée seule après un délai de chargement dépassé lors du run parallèle.
L’installation gelée avec pnpm 10.34.5 et le build de production TypeScript/Vite
réussissent, sans modification des dépendances.
