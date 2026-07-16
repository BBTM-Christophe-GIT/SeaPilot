# Planning — diffusion globale et demandes de congé

Migrations cibles :

- `202607160006_planning_global_distribution_leave_workflow.sql`
- `202607160007_planning_terrain_latest_release_only.sql`
- `202607160008_planning_terrain_read_only_permissions.sql`

Cette évolution remplace le circuit historique de publication par période. Le planning courant reste un brouillon modifiable en permanence par les rôles de gestion, tandis que chaque diffusion crée une version globale et immuable.

## Fonctionnement

- `admin`, `direction` et `armement` modifient le planning sans soumission ni validation préalable.
- Le bouton **Diffuser le Planning** capture l’état complet du planning dans une nouvelle version globale.
- Une diffusion affiche uniquement son numéro de version, sa date de publication et son auteur.
- `capitaine` et `marin` consultent uniquement la dernière version diffusée, filtrée par leurs droits métier, et ne peuvent pas modifier le planning.
- Les anciennes capacités terrain de traitement des conflits, de gestion des dépendances et de consultation de l’historique de gouvernance sont retirées.
- Tous les rôles peuvent créer une demande de congé avec une date de début, une date de fin et un motif facultatif.
- Les demandes en attente et les congés approuvés sont visibles directement sur les lignes du planning.
- `admin`, `direction` et `armement` peuvent ouvrir une période de congé sur le planning pour l’accepter ou la refuser.
- Le bouton **Demandes en attente** ouvre uniquement les demandes qui n’ont pas encore été traitées.

## Stockage et sécurité Supabase

La table `planning_releases` stocke les instantanés diffusés. Chaque ligne contient :

- l’entreprise ;
- le numéro de version séquentiel ;
- l’instantané JSON du planning ;
- la date et l’auteur de publication.

Les lignes sont immuables : les mises à jour et suppressions sont refusées par un trigger. Aucun accès direct à la table n’est accordé aux rôles `anon` ou `authenticated`.

Les accès applicatifs passent par les RPC suivantes :

- `publish_planning_release()` : crée une nouvelle version, uniquement pour `admin`, `direction` et `armement` ;
- `planning_release_history()` : renvoie tout l’historique aux rôles de gestion et uniquement la dernière version aux rôles terrain ;
- `latest_planning_release()` : renvoie la dernière version en filtrant son contenu selon le rôle et le périmètre de l’utilisateur.

Les anciennes publications par période sont conservées à titre d’historique, mais leurs verrous sont supprimés et leur RPC de transition n’est plus accessible au client.

Les demandes de congé restent stockées dans `planning_absences`. La migration rend le motif facultatif sans modifier les contrôles de période, de chevauchement, d’entreprise ou de rôle existants.

## Déploiement

Avant migration :

```powershell
npm ci
npm run lint
npm test
npm run build
npx supabase db reset --local
npx supabase test db --local
npx supabase db push --linked --dry-run
```

Appliquer ensuite :

```powershell
npx supabase db push --linked
npx supabase migration list --linked
npx supabase db lint --linked --level warning
```

Aucune nouvelle variable d’environnement n’est nécessaire.

## Recette

1. Avec `admin`, `direction` puis `armement`, modifier un événement et confirmer que le planning reste modifiable après chaque diffusion.
2. Diffuser le planning et vérifier l’incrément du numéro de version ainsi que la date et l’auteur.
3. Modifier à nouveau le brouillon et confirmer qu’un `capitaine` ou un `marin` voit encore la version précédemment diffusée.
4. Diffuser une nouvelle version et vérifier que la vue terrain est actualisée.
5. Vérifier qu’un `capitaine` et un `marin` ne disposent d’aucune action de modification ou de diffusion.
6. Créer une demande de congé sans motif avec chacun des rôles.
7. Vérifier que la période en attente apparaît sur le planning et dans **Demandes en attente**.
8. Cliquer la période avec `admin`, `direction` ou `armement`, puis l’accepter ou la refuser.
9. Vérifier qu’une demande approuvée reste visible sur le planning et que la demande traitée disparaît de la liste des demandes en attente.
10. Vérifier l’isolation entre entreprises et le filtrage des instantanés pour les rôles terrain.

## Retour arrière

Les versions diffusées étant immuables, ne pas supprimer automatiquement `planning_releases`. En cas de régression du client, redéployer le client précédent tout en conservant la migration et les instantanés.

Un retour au circuit historique exige une migration corrective explicite qui rétablit les permissions de transition et les fonctions de verrouillage. Cette opération doit être précédée d’un export de `planning_releases`, `planning_absences`, `planning_publications` et `planning_change_log`.
