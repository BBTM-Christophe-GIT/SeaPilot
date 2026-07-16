# SeaPilot Planning P1.2 — migration, recette et retour arrière

Version applicative cible : `2.1.0`

Migration cible : `202607140001_planning_p12_absences_conflict_center.sql`

Prérequis : P0 déployé et P1.1 stable, migrations `202607130009` et `202607130010` appliquées.

Évolution actuelle : les migrations `202607160006` à `202607160008` rendent le motif de demande facultatif, affichent les périodes d’absence sur le planning et réservent leur validation ou leur refus à `admin`, `direction` et `armement`. La procédure complète est décrite dans `planning-global-distribution-leave-workflow.md`.

## Périmètre et garanties

P1.2 ajoute trois tables bornées par `company_id` : les demandes d’absence, les dossiers de traitement des conflits et leur historique. Les affectations P0, les projets Flotte, les relèves et les matrices P1.1 restent les sources de vérité. La migration ne déplace, ne supprime et ne génère aucune affectation existante.

Les absences utilisent des `timestamptz`. Le navigateur convertit les dates/heures locales valides vers UTC avant la RPC et reconvertit les instants pour l’affichage. Une fin doit être strictement postérieure au début ; le passage de minuit, les périodes de plusieurs jours et les changements d’heure sont donc traités comme des intervalles d’instants. Une absence approuvée ne supprime pas une affectation existante : elle crée un impact et un poste vacant dans le centre. En revanche, le trigger P1.2 refuse toute nouvelle affectation chevauchante lorsque la règle `crew_absence` ou `crew_unavailability` est bloquante et qu’aucune dérogation active ne couvre l’intervalle.

Le centre détecte en lecture les doubles affectations, absences, indisponibilités, postes vacants, certificats invalides, qualifications manquantes, effectifs insuffisants, maintenances incompatibles et relèves incomplètes. Une clé déterministe relie chaque résultat à un dossier persistant uniquement lorsqu’un utilisateur le prend en charge. Le responsable, la priorité, le statut, le commentaire, la source, la résolution ou la dérogation sont alors enregistrés et historisés. La recherche de remplaçants ne crée aucune affectation : elle prépare le formulaire P0, en statut provisoire, après un choix humain explicite.

## Permissions et RLS

- `admin`, `direction` et `armement` peuvent demander, valider ou refuser une absence et traiter les conflits de l’entreprise ;
- `capitaine` peut demander sa propre absence et traiter les conflits des navires dont il a la charge sur la période, sans valider ni refuser une demande ;
- `marin` peut demander et consulter sa propre absence ;
- une permission temporaire `manage_conflict` peut être bornée à un navire et une période ;
- toutes les écritures passent par quatre RPC `security definer` avec validation de l’entreprise et des références ;
- les tables accordent seulement `select` au rôle `authenticated` et refusent les écritures directes ;
- les RLS recoupent entreprise, personne, navire et période. Un capitaine peut lire une absence uniquement si elle impacte une affectation de son navire.

## Avant migration

1. Confirmer une sauvegarde ou un point de restauration Supabase récent.
2. Exporter `planning_assignments`, `planning_periods`, `planning_projects`, `planning_handovers`, `planning_derogations`, `planning_change_log`, `planning_action_permissions` et `planning_vessel_permissions`.
3. Relever les comptes des tables exportées et vérifier les parcours P0/P1.1.
4. Exécuter :

```powershell
npm ci
npx tsc -b --pretty false
npm run lint
npm test
npm run build
npx supabase migration list --linked
npx supabase db push --dry-run --linked
npx supabase db lint --linked --level warning
```

Le dry-run doit annoncer uniquement `202607140001_planning_p12_absences_conflict_center.sql` sur un environnement P1.1 à jour.

## Application

```powershell
npx supabase db push --linked
npx supabase migration list --linked
npx supabase db lint --linked --level warning
```

Déployer ensuite le client `2.1.0`. Aucune nouvelle variable d’environnement n’est requise ; les trois variables Vite documentées pour P0/P1.1 restent suffisantes.

## Contrôles après migration

1. Vérifier les trois tables, leurs index, leur RLS et l’absence de droits directs `insert/update/delete` pour `authenticated`.
2. Vérifier les actions `request_absence`, `review_absence` et `manage_conflict` dans la matrice de permissions.
3. Créer une demande sans motif qui passe minuit et confirmer les instants UTC, l’affichage local et sa période sur le planning.
4. Refuser une demande sans commentaire et confirmer le rejet par la RPC, puis la refuser avec commentaire.
5. Approuver une absence chevauchant une affectation existante et vérifier l’impact, le poste vacant et le journal global.
6. Tenter une nouvelle affectation sur l’absence approuvée : le blocage serveur doit s’appliquer sans dérogation active.
7. Prendre un conflit en charge, changer sa priorité et son statut, ajouter un commentaire, puis vérifier `planning_conflict_case_history`.
8. Lier une dérogation active et vérifier que le statut `derogated` est impossible sans cette référence.
9. Rechercher un remplaçant, lire les raisons d’incompatibilité, choisir un candidat compatible et vérifier que seul le formulaire provisoire est préparé.
10. Ouvrir **Demandes en attente**, cliquer une période et vérifier que seuls `admin`, `direction` et `armement` peuvent l’accepter ou la refuser.
11. Refaire les lectures/écritures avec un marin, un capitaine et un utilisateur d’une autre entreprise pour confirmer les limites RLS.
12. Valider le panneau sur un écran 15 pouces et un viewport iPad 12,9 pouces, avec des cibles tactiles d’au moins 44 px.

## Retour arrière

Le retour arrière ne doit pas effacer automatiquement l’historique métier :

1. masquer l’accès au panneau P1.2 en redéployant le client `2.0.0` si nécessaire ;
2. exporter les trois tables P1.2 et les entrées `absence`/`conflict_case` de `planning_change_log` ;
3. retirer le trigger `planning_assignments_p12_absence_guard` pour restaurer le comportement d’affectation P1.1 ;
4. supprimer les quatre RPC, les triggers et politiques P1.2 ;
5. supprimer `planning_conflict_case_history`, puis `planning_conflict_cases`, puis `planning_absences` uniquement après validation de l’export ;
6. restaurer les contraintes de permissions et de types d’historique définies par `202607130009` ;
7. rejouer TypeScript, lint, tests, build, lint Supabase et les recettes P0/P1.1.

La réouverture d’une affectation publiée, la suppression d’une affectation ou l’application automatique d’un remplacement restent des décisions métier distinctes et ne font pas partie du retour arrière P1.2.
