# CI des profils Marin et Capitaine

Le workflow `.github/workflows/profile-tests.yml` complète `Validate` sur chaque
pull request, sur les pushes vers `main` et `codex/**`, et à la demande depuis
GitHub Actions. Son contrôle s'appelle **Marin and Capitaine (SQL + Chromium)**.
Il doit réussir avant de fusionner une modification des profils concernés.

## Environnement et isolation

Le job utilise Node 24, pnpm **10.34.5**, Supabase CLI **2.109.1** et la version
exacte de Playwright inscrite dans `pnpm-lock.yaml`. Il n'utilise aucun secret
GitHub, compte réel ou projet Supabase distant.

`scripts/ci/local-supabase.mjs` génère une configuration indépendante dans
`.ci/supabase-local/`, copie les migrations versionnées et démarre le projet
Docker **SeaPilotCI**. Les ports sont réservés à ce bac à sable : API `55321`,
PostgreSQL `55322`, shadow database `55320`. Le projet local habituel `SeaPilot`
et ses ports `543xx` ne sont pas utilisés. Un bac à sable déjà démarré provoque
un échec explicite plutôt qu'une réutilisation de données anciennes.

Les imports historiques supposent que certaines références existent déjà.
`scripts/ci/reference-data.sql` fournit uniquement les références synthétiques
nécessaires à leur exécution sur une base vide. Le runner l'insère comme
migration dans le dossier temporaire avant ces imports ; ce fichier n'est pas
une migration de production et aucune migration versionnée n'est ignorée.

Le runner refuse les arguments de connexion distants et les configurations
liées à un projet cloud. `ci:db:env` exporte uniquement les paramètres publics
locaux vers `.ci/supabase.env` et, dans GitHub Actions, vers `GITHUB_ENV`. Aucun
fichier `.env` du développeur ni configuration de production n'est copié.

## Vérifications exécutées

1. Démarrage d'une base vide et application de toutes les migrations du dépôt.
2. Suites pgTAP de permissions : Projets, DPR, Temps de Travail (périmètre de
   l'acteur et affectation du capitaine compris), capitaine temporaire, demandes
   d'achat, traitement du plan d'action et publication QSMS.
3. Tests SQL avec assertions pour la fenêtre de lecture des affectations, le
   périmètre du tableau de bord DPR et les dépôts de documents RH du capitaine.
   Ces fichiers ne produisent pas de TAP et sont exécutés séparément, avec les
   assertions PostgreSQL activées et propagation des erreurs.
4. Création des comptes et données métier synthétiques de `e2e/fixtures.sql`,
   puis build de production connecté au Supabase jetable.
5. Parcours Chromium de bureau et mobile depuis la vraie page de connexion,
   avec les vrais rôles Marin/Capitaine, contrôles de navigation et d'accès,
   et vérification d'un parcours DPR.

La liste exacte des suites SQL se trouve dans le runner. Les tests de permissions
créent leurs propres utilisateurs et claims authentifiés dans des transactions
annulées après chaque suite. Les tests navigateur n'utilisent ni la simulation
administrateur des profils, ni les fixtures visuelles Vercel Preview, ni une API
Supabase simulée. Ils ne remplacent pas les assertions RPC/RLS.

Pour les DPR, le Marin pur ne voit pas le navire sans affectation ; le Capitaine
voit également les DPR actifs des autres navires de sa société, conformément
aux règles actuelles. Les deux comptes doivent exclure les DPR d'une autre
société. Le brouillon créé dans le navigateur doit rester lisible après un
rechargement complet.

## Reproduction locale

Prérequis : Docker en mode conteneurs Linux, Supabase CLI 2.109.1 sur le `PATH`,
Node 24 et pnpm 10.34.5. Depuis un checkout propre :

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm ci:db:start
pnpm ci:db:env
pnpm test:permissions
pnpm ci:db:fixtures
```

Charger ensuite les paramètres locaux avant le build et les tests navigateur.
Sous Bash :

```sh
set -a
. .ci/supabase.env
set +a
pnpm build
pnpm test:e2e
```

Sous PowerShell :

```powershell
Get-Content .ci/supabase.env | ForEach-Object {
  $name, $value = $_ -split '=', 2
  [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}
pnpm build
pnpm test:e2e
```

Arrêter le bac à sable après les vérifications, y compris après un échec :

```sh
pnpm ci:db:stop
```

L'arrêt ne conserve pas les données du projet `SeaPilotCI`. Si un précédent run
est resté actif, exécuter cette commande avant `ci:db:start`.

## Diagnostic dans GitHub Actions

Les erreurs de migrations, RPC et RLS sont visibles dans les logs du job et font
échouer le contrôle. Les rapports Playwright, captures et traces d'échec sont
conservés sept jours dans l'artefact `profile-browser-report`. Ils contiennent
uniquement les données et sessions synthétiques locales. `.ci/`, les rapports et
les résultats navigateur sont ignorés par Git et ne sont pas déployés.

La CI arrête le projet jetable dans une étape `always()`. L'intégration Git de
Vercel conserve son fonctionnement actuel ; ce workflow ne publie pas et ne
modifie pas la configuration de production.
