# SeaPilot v3.12.13 — catalogue mensuel et alertes de temps de travail

Cette livraison remplace la liste technique des périodes par un catalogue stable :
une seule carte par marin, puis une navigation par mois et par année. Les objets
mensuels restent distincts en base afin de conserver les signatures, statuts,
verrouillages, exports et événements d'audit propres à chaque mois.

## Interface

- la page s'ouvre sur le mois civil courant ;
- la navigation se fait avec le champ mois/année ou les boutons précédent, suivant
  et « Mois en cours » ;
- les profils administrateur, direction et armement voient tous les marins de leur
  société et peuvent les rechercher par nom ou fonction ;
- la liste présente exactement une carte par marin pour le mois affiché, y compris
  lorsqu'un ancien registre hebdomadaire chevauche ce mois ;
- l'absence de registre mensuel est un état explicite avec une action d'ouverture
  uniquement pour les personnes que le profil connecté peut modifier ;
- les 24 repères horaires, de 00 h à 23 h, sont visibles sur la frise sans défilement
  horizontal ; les demi-heures restent les unités sélectionnables ;
- plusieurs plages disjointes peuvent être glissées successivement puis enregistrées
  en une seule action ;
- la surface utile est responsive jusqu'à 1800 px et la disposition se replie avant
  que la frise ne devienne difficile à utiliser sur un écran de 15 pouces.

## Autorisations

La fonction `working_time_entry_context` retourne maintenant deux périmètres :

- `readable_people` : catalogue consultable ;
- `editable_people` : personnes pour lesquelles une saisie ou une validation est
  autorisée par les règles existantes.

Un profil admin, direction ou armement non relié à une fiche RH peut donc rechercher
et consulter les registres de sa société. Il ne peut pas signer, saisir ni valider
avant d'être relié à une personne RH. Les RPC de mutation et les politiques RLS
restent la source d'autorité.

## Notifications

La migration ajoute le type `working_time_non_compliance` à
`planning_notifications`. Un déclencheur sur les fenêtres calculées crée une alerte
destinée aux comptes actifs portant au moins l'un des rôles suivants :

- administrateur ;
- direction ;
- armement.

Le titre distingue un dépassement du travail, un repos insuffisant ou les deux. Le
corps reprend la personne, le navire, la date et les valeurs comparées aux seuils
datés. Une alerte identique n'est pas dupliquée ; une nouvelle version est créée si
le contenu du calcul change. Lorsque le calcul redevient conforme, les alertes
ouvertes correspondantes sont marquées comme lues.

Le RPC `refresh_working_time_notifications(date)` permet le rattrapage contrôlé des
fenêtres déjà calculées. Il est réservé aux rôles admin, direction et armement. Les
destinataires ne voient que leurs propres notifications grâce aux politiques RLS du
module Planning P1.3.

## Migration et vérification

Migration :
`supabase/migrations/20260807071222_working_time_monthly_catalog_notifications.sql`

Ordre de déploiement :

1. appliquer la migration Supabase ;
2. déployer le client `3.12.13` ;
3. ouvrir `/modules/workingTime` avec un profil administrateur et vérifier la
   recherche de tous les marins ;
4. sélectionner un mois, ouvrir un registre et saisir deux plages disjointes ;
5. provoquer ou recalculer une non-conformité puis vérifier l'onglet Notifications
   avec un compte admin, direction ou armement ;
6. vérifier qu'un marin ne reçoit pas cette notification de supervision.

Commandes de recette locales :

```text
npx supabase db reset --local
npx supabase test db supabase/tests/working_time_workflow_permissions_test.sql
npm test
npm run lint
npm run build
```

La migration conserve les données historiques. Un retour arrière applicatif ne doit
pas supprimer les notifications ou les registres mensuels déjà produits.
