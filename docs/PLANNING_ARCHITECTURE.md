# SeaPilot — architecture et audit du module Planning

Dernière mise à jour : 13 juillet 2026
Périmètre audité : route `/modules/planning`, composants React, accès Supabase, migrations SQL, RLS, rôles, tests et rendu responsive.

## 1. Synthèse

Le Planning SeaPilot est un cockpit React/Vite connecté aux données réelles Supabase et aux historiques SharePoint/SMTR importés. Il fusionne les affectations natives SeaPilot, les journées SMTR et les périodes SMTR sans remplacer les données historiques. La timeline hiérarchise navires, bordées et marins, puis superpose projets et affectations.

Le socle existant est fonctionnel pour consulter et corriger le planning : vues Semaine/Mois/An, filtres, zoom, plein écran, création, modification, duplication, glisser-déposer, redimensionnement, création rapide, export CSV, alertes documentaires et audit des écritures. Les droits d’écriture restent volontairement réservés aux administrateurs dans l’interface et dans les politiques RLS actuelles.

Le lot P0 du 13 juillet 2026 ajoute la fondation qui manquait le plus : un moteur central de contrôle des affectations, des niveaux configurables Information/Avertissement/Blocage, un aperçu avant enregistrement et un centre de conflits. Les règles utilisent les données Planning et RH existantes ; aucune donnée fictive et aucune table d’événements concurrente n’ont été créées.

## 2. Matrice fonctionnelle

| Domaine | État avant le lot | État après le lot | Constat / limite restante | Priorité suivante |
| --- | --- | --- | --- | --- |
| Route et intégration SeaPilot | Opérationnel | Opérationnel | Route protégée sous `/modules/planning`, navigation et authentification conservées | Maintenir |
| Données navires, marins et projets | Opérationnel | Opérationnel | Données réelles Supabase et historiques SharePoint | Maintenir |
| Vue équipages | Opérationnel | Opérationnel | Hiérarchie navire → bordée → marin, première colonne et dates fixes | Maintenir |
| Vue flotte | Partiel | Partiel | Les projets sont visibles par navire, mais les indisponibilités/maintenances ne disposent pas encore d’un modèle unifié | P0 |
| Échelles temporelles | Partiel | Partiel | Semaine sur 14 jours, mois sur 49 jours et année ; liste, trimestre et Gantt absents | P1 |
| Filtres et navigation temporelle | Opérationnel | Opérationnel | Navire, marin, mois, année, zoom et week-ends | P1 : statut, fonction, alertes |
| Création rapide et complète | Opérationnel | Amélioré | Contrôles affichés avant enregistrement ; pièces jointes et participants absents | P0/P1 |
| Modification directe | Opérationnel | Amélioré | Édition, déplacement et redimensionnement passent par le même moteur de contrôle | Maintenir |
| Affectations | Partiel | Amélioré | Dates, activité RH, fonction, documents, aptitude et disponibilité contrôlés ; matrice d’armement absente | P0 |
| Détection de double affectation | Partiel | Amélioré | Centre dédié et niveau configurable ; les avertissements restent dérogeables | P0 : dérogation auditée |
| Disponibilités et absences | Partiel | Amélioré | Repos, congé, arrêt et formation déjà présents dans les statuts ; workflow de demande/validation absent | P1 |
| Qualifications et certificats marins | Partiel | Amélioré | Échéances et statuts des documents RH contrôlés ; exigences par navire/fonction absentes | P0/P1 |
| Aptitude et restrictions médicales | Partiel | Amélioré | Inaptitude, restriction et validité jusqu’au débarquement prises en compte | P0 : dérogation autorisée |
| Certificats navires | Partiel | Partiel | Alertes à 90 jours ; pas encore de blocage selon opération | P1 |
| Centre de conflits | Absent | Opérationnel (socle) | Liste Blocage/Avertissement/Information ; résolution guidée et affectation d’un responsable absentes | P1 |
| Relèves d’équipage | Absent | Absent | Aucun workflow bordée entrante/sortante dédié | P0 |
| Rotations récurrentes | Absent | Absent | Aucun modèle 7/7, 10/10, 14/14 ni édition de série | P1 |
| Temps de travail et repos | Partiel | Partiel | Données SMTR `worked_hours`, `rest_24h`, `cumulative_7d` importées mais pas de moteur de conformité | P1 |
| Validation, publication, verrouillage | Absent | Absent | Pas de version publiée ni de verrou de période | P0 |
| Historique | Partiel | Partiel | `planning_change_log` trace les écritures admin ; journal non transactionnel et sans comparaison de versions | P0/P1 |
| Permissions | Partiel | Partiel | Lecture RLS par rôle/périmètre ; écriture admin uniquement ; permissions granulaires d’action absentes | P0 |
| Export | Partiel | Partiel | CSV journalier par marin ; PDF/Excel/ICS et export flotte absents | P1 |
| Notifications et collaboration | Absent | Absent | Pas de workflow de confirmation ou notification Planning | P1 |
| Responsive ordinateur/iPad | Opérationnel | Amélioré | Layout à une colonne sous 1240 px, contrôles tactiles, résumés de contrôle adaptatifs | Maintenir |
| Temps réel et cache | Absent | Absent | Aucun abonnement Supabase Realtime ni cache de requêtes | P1 |
| Virtualisation / chargement par période | Absent | Absent | Toutes les sources sont chargées avant filtrage client | P0 performance |

## 3. Anomalies et risques relevés

| Constat | Risque | Traitement | Priorité résiduelle |
| --- | --- | --- | --- |
| Les contrôles étaient dispersés dans `PlanningPage.tsx` et limités à la double affectation | Écritures incohérentes et règles impossibles à faire évoluer | Moteur pur `evaluatePlanningAssignment` et règles Supabase configurables | Faible pour le lot livré |
| La fin pouvait précéder le début avant d’atteindre la contrainte SQL lors d’une création | Message générique et mauvaise expérience | Validation TypeScript explicite et Blocage avant écriture | Corrigé |
| Les données RH pouvaient être ignorées si leur requête échouait | Contrôles documentaires faussement rassurants | Le chargement RH est désormais requis pour rendre le Planning | Corrigé |
| `PlanningPage.tsx` reste volumineux | Maintenabilité et tests d’interaction plus difficiles | Premier composant extrait : `PlanningControlSummary` | P0 refactorisation progressive |
| Les écritures et `planning_change_log` ne sont pas dans une même transaction | Journal incomplet si l’écriture d’audit échoue | Conserver la disponibilité actuelle, puis déplacer les mutations critiques dans des RPC transactionnelles | P0 |
| Suppressions physiques des événements | Perte de traçabilité métier | Introduire archivage logique/versionnement avant publication | P0 |
| Chargement intégral des événements | Temps de chargement et mémoire sur plusieurs milliers d’éléments | Événements mémorisés côté React pour les contrôles ; requêtes par période encore nécessaires | P0 performance |
| Détection historique de conflits en O(n²) | Dégradation avec plusieurs milliers d’événements | Le nouveau centre groupe d’abord par marin ; l’ancien marquage visuel reste à indexer | P0 performance |
| Aucun script ESLint dans `package.json` | Pas de contrôle de style automatisé | TypeScript strict couvre les erreurs de type ; ajouter ESLint sans perturber les conventions existantes | P0 outillage |
| Aucune gestion des heures/fuseaux par événement | Limites pour opérations 24 h/24 et changements de port | Dates civiles ISO `YYYY-MM-DD` traitées en UTC ; modèle horaire à ajouter avec migration compatible | P1 |

## 4. Architecture applicative

### Route

- `src/App.tsx` associe le module `planning` à `PlanningPage`.
- `RequireAuth` et `AppShell` fournissent la session, les rôles et le client Supabase.
- L’URL de production reste `/modules/planning` ; la réécriture Vercel SPA est inchangée.

### Composants

- `PlanningPage.tsx` orchestre chargement, filtres, timeline, formulaires, glisser-déposer et actions.
- `PlanningTimelineRow` rend une ligne navire, bordée ou marin et les barres projets/équipages.
- `PlanningEventDialog` édite une journée, période ou affectation.
- `PlanningProjectDialog` édite les projets Planning existants.
- `PlanningSideContent` affiche conflits, échéances, marins non affectés et facturation.
- `PlanningControlSummary.tsx` présente les contrôles sans dépendre uniquement de la couleur : libellé du niveau, titre et explication.

Les prochains refactors doivent extraire la toolbar, la timeline, les dialogues et le panneau latéral par étapes, sans reconstruire le module.

### Modèle métier

`planningModel.ts` contient les fonctions pures :

- calcul UTC des jours et des plages ;
- fusion/déduplication des trois sources équipage ;
- groupement navire/bordée/marin ;
- détection des chevauchements ;
- alertes documents et certificats ;
- export journalier ;
- contrôles d’affectation et centre de conflits.

Le moteur `evaluatePlanningAssignment` reçoit un candidat et renvoie des `PlanningControlResult`. Chaque résultat comprend un code stable, un niveau, un titre, une explication, une date, l’événement et le marin concernés.

Les règles actives peuvent remplacer le niveau par défaut. Un avertissement n’empêche pas l’enregistrement ; un blocage l’empêche. Cette séparation préserve la décision humaine pour les situations exceptionnelles tout en sécurisant les cas incompatibles.

### Accès aux données

`planningQueries.ts` centralise les sélections et mutations Supabase. `fetchPlanningOverview` lance en parallèle les requêtes indépendantes afin d’éviter les cascades de chargement.

Sources fusionnées :

- `planning_assignments` : affectations natives SeaPilot ;
- `planning_days` : journées SMTR importées ;
- `planning_periods` : périodes SMTR importées ;
- `planning_projects` : projets et opérations historiques ;
- `people` et `hr_documents` : identité, fonction, activité, titres et aptitude ;
- `vessels` et `fleet_certificates` : flotte et échéances navire ;
- `planning_rules` : niveaux de contrôle configurables.

Les erreurs sur projets, certificats flotte et règles peuvent encore utiliser les comportements de repli historiques. Les documents RH sont requis : si cette donnée sensible au contrôle ne charge pas, le Planning n’autorise pas silencieusement une affectation.

## 5. Données et relations

```text
people ─┬─< planning_assignments >─ vessels
        ├─< planning_days >──────── vessels
        ├─< planning_periods >───── vessels
        └─< hr_documents

vessels ─< fleet_certificates
vessels ─< planning_projects (primary_vessel_id / secondary_vessel_id)

planning_change_log ── référence logique entity_kind + entity_id
planning_rules ──────── configuration globale des contrôles Planning
```

Les historiques SharePoint conservent leurs identifiants et libellés source. Les relations `person_id`/`vessel_id` sont utilisées lorsqu’elles sont résolues ; le moteur conserve le rapprochement par nom pour les lignes historiques non liées.

### Migration du lot

`202607130001_planning_control_rules.sql` :

- crée `planning_rules` de manière idempotente ;
- valide code, périmètre, niveau, JSON de configuration et version ;
- indexe état/périmètre/date d’effet ;
- insère dix règles initiales sans écraser une configuration existante ;
- active RLS ;
- autorise la lecture aux rôles Planning existants ;
- réserve les écritures aux administrateurs.

`202607130002_planning_rpc_permissions.sql` retire l’exécution anonyme explicite de `planning_assignment_overview()` et conserve uniquement l’exécution authentifiée. La fonction continue ensuite d’appliquer son filtre par rôle, capitaine et marin.

Les références réglementaires ou internes sont descriptives. Elles ne sont pas présentées comme une interprétation juridique définitive.

## 6. Contrôles livrés

| Code | Défaut | Données utilisées |
| --- | --- | --- |
| `invalid_period` | Blocage | Début/fin |
| `inactive_person` | Blocage | `people.active`, `hired_on`, `departed_on` |
| `crew_unavailability` | Blocage | Repos, congé, arrêt, formation sur événements fusionnés |
| `assignment_overlap` | Avertissement | Chevauchement du même marin sur deux navires |
| `function_mismatch` | Information | Fonction RH vs fonction planifiée |
| `expired_medical` | Blocage | Catégorie/titre/statut/échéance du document RH |
| `expired_credential` | Avertissement | Brevet, certificat, qualification, habilitation ou formation |
| `medical_unfit` | Blocage | `medical_unfit` |
| `medical_restriction` | Avertissement | `medical_restriction` |
| `pending_validation` | Avertissement | Validation capitaine requise et statut en attente |

Les contrôles sont appliqués à la création, à la création rapide, à l’édition, au déplacement et au redimensionnement.

## 7. Rôles et sécurité

Rôles existants : `admin`, `direction`, `armement`, `capitaine`, `marin`.

- Tous les accès passent par une session Supabase authentifiée.
- La lecture de `planning_assignments` est limitée par RLS : bureau, capitaine de l’affectation ou marin concerné.
- La fonction `planning_assignment_overview()` reproduit le même périmètre côté serveur.
- L’écriture des tables Planning éditables est actuellement réservée à `admin`, côté interface et RLS.
- Les documents RH conservent leurs politiques RLS propres ; aucune donnée médicale supplémentaire n’est copiée dans `planning_rules` ou dans les événements.
- Les règles sont lisibles par les rôles Planning et modifiables uniquement par `admin`.
- Aucun secret ni identifiant de connexion n’est ajouté au dépôt.

À terme, les droits de création, validation, publication, dérogation et export devront être séparés dans une matrice d’actions, puis appliqués dans des RPC et politiques RLS dédiées.

## 8. Dates et fuseaux horaires

Le modèle actuel stocke les événements Planning en dates civiles PostgreSQL (`date`) et les manipule en `YYYY-MM-DD`. Les calculs utilisent `Date.UTC`, les getters UTC et un formatage `fr-FR` avec `timeZone: 'UTC'`, ce qui évite le glissement d’un jour lié au navigateur.

Cette architecture gère les périodes multi-jours et les années bissextiles, mais pas encore les heures de prise/fin de service, les événements passant minuit ni plusieurs fuseaux portuaires. Une future migration devra conserver les dates existantes et ajouter des timestamps avec fuseau uniquement aux événements qui exigent une précision horaire.

## 9. Tests et validation

Outils existants conservés : TypeScript strict, Vitest, Testing Library et build Vite.

Tests Planning couverts :

- plages semaine/mois/année et UTC ;
- fusion et hiérarchie des sources ;
- filtres et permissions lecture/écriture ;
- création classique et rapide ;
- redimensionnement ;
- double affectation et marquage visuel ;
- export journalier ;
- alertes documents/certificats ;
- indisponibilité bloquante ;
- aptitude médicale jusqu’à la fin d’affectation ;
- remplacement du niveau par une règle Supabase ;
- affichage du centre de conflits ;
- refus d’écriture en présence d’un blocage.

Commandes de validation :

```powershell
npm ci
npx tsc -b --pretty false
npm test -- --reporter=dot
npm run build
supabase db lint --linked
```

Le dépôt ne fournit pas encore de script `lint` JavaScript/TypeScript dédié ; cette lacune est suivie en P0 outillage.

## 10. Feuille de route recommandée

### P0

1. Ajouter validation/publication/verrouillage, versions et dérogations auditables.
2. Créer le workflow de relève et la comparaison bordée sortante/entrante.
3. Relier fonctions requises, effectif minimum et qualifications aux navires.
4. Charger les événements par période et indexer la détection visuelle des conflits.
5. Déplacer les mutations critiques et l’audit dans des RPC transactionnelles.
6. Extraire progressivement toolbar, timeline, dialogues et panneau latéral.
7. Ajouter ESLint et un test de parcours navigateur authentifié stable.

### P1

1. Rotations 7/7, 10/10, 14/14 et séries modifiables.
2. Moteur configurable de travail/repos à partir des données SMTR.
3. Workflow absence/remplacement et suggestions explicables.
4. Modèles Planning, notifications, dépendances et comparaison de versions.
5. Exports PDF/Excel/ICS et impression par navire, marin et relève.
6. Cache client, chargement progressif et abonnements temps réel ciblés.

### P2

1. Scénarios alternatifs et prévision de sous-effectif.
2. Assistant de planification fondé uniquement sur les contraintes configurées.
3. Intégrations externes et mode hors connexion partiel après stabilisation des P0/P1.
