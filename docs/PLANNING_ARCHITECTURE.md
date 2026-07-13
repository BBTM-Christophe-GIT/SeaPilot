# SeaPilot — architecture et audit du module Planning

Dernière mise à jour : 13 juillet 2026
Périmètre audité : route `/modules/planning`, composants React, accès Supabase, migrations SQL, RLS, rôles, tests et rendu responsive.

## 1. Synthèse

Le Planning SeaPilot est un cockpit React/Vite connecté aux données réelles Supabase et aux historiques SharePoint/SMTR importés. Il fusionne les affectations natives SeaPilot, les journées SMTR et les périodes SMTR sans remplacer les données historiques. La timeline hiérarchise navires, bordées et marins, puis superpose projets et affectations.

Le socle existant est fonctionnel pour consulter et corriger le planning : vues Semaine/Mois/An, filtres, zoom, plein écran, création, modification, duplication, glisser-déposer, redimensionnement, création rapide, export CSV, alertes documentaires et audit des écritures. Les droits d’écriture restent volontairement réservés aux administrateurs dans l’interface et dans les politiques RLS actuelles.

Le premier lot P0 du 13 juillet 2026 a ajouté le moteur central de contrôle des affectations, ses niveaux configurables et le centre de conflits. Le lot de publication qui suit ajoute un workflow administrateur Soumettre → Valider → Publier, un verrou PostgreSQL couvrant les quatre sources d’événements existantes et un instantané immuable à chaque version publiée. Les règles utilisent les données Planning et RH existantes ; aucune donnée fictive et aucune table d’événements concurrente n’ont été créées.

### Phase P0.1 — stabilisation des fondations

La phase P0.1 conserve les tables et les parcours métier existants. Elle isole les dates civiles, la validation, les permissions, les erreurs Supabase, le chargement React et la détection des chevauchements dans des modules dédiés. Toutes les sources nécessaires sont désormais chargées en parallèle sans masquer une erreur derrière un tableau vide. Un rafraîchissement conserve les données déjà affichées et présente l’erreur de la source concernée.

Le contrôle distant réalisé avant migration comptait 11 affectations, 171 journées, 70 périodes et 18 projets. Aucune relation navire obligatoire n’était absente. Une journée éditée dans SeaPilot avait toutefois `disembark_on` au 6 juillet 2026 et `work_date` au 7 juillet 2026 ; la migration P0.1 la normalise de manière auditée avant d’ajouter une contrainte.

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
| Validation, publication, verrouillage | Absent | Opérationnel (socle) | Soumission, validation, publication, réouverture motivée et verrou serveur par période/flotte/navire ; validation multi-acteurs absente | P0 : validation fonctionnelle |
| Historique | Partiel | Amélioré | Triggers transactionnels pour événements, transitions auditées et instantanés publiés ; écran de comparaison absent | P1 |
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
| Une erreur sur projets, certificats ou règles était remplacée silencieusement par un tableau vide | Planning incomplet présenté comme fiable | Toutes les sources sont requises, contextualisées et journalisées techniquement | Corrigé |
| `PlanningPage.tsx` reste volumineux | Maintenabilité et tests d’interaction plus difficiles | Premier composant extrait : `PlanningControlSummary` | P0 refactorisation progressive |
| Les écritures et `planning_change_log` n’étaient pas dans une même transaction | Journal incomplet si l’écriture d’audit échouait | Triggers `after` transactionnels sur affectations, journées, périodes et projets ; les navires conservent leur journal applicatif | Faible, périmètre navires uniquement |
| Suppressions physiques des événements | Perte de traçabilité métier hors période publiée | Les périodes soumises/publiées sont protégées et les suppressions autorisées sont instantanément auditées ; archivage logique encore absent | P0 |
| Chargement intégral des événements | Temps de chargement et mémoire sur plusieurs milliers d’éléments | Événements mémorisés côté React pour les contrôles ; requêtes par période encore nécessaires | P0 performance |
| Détection historique de conflits en O(n²) | Dégradation avec plusieurs milliers d’événements | Le nouveau centre groupe d’abord par marin ; l’ancien marquage visuel reste à indexer | P0 performance |
| Aucun script ESLint dans `package.json` | Pas de contrôle de style automatisé | ESLint couvre désormais TypeScript sur `src` et les règles React Hooks sur le module Planning | Corrigé en P0.1 |
| Une journée pouvait conserver un débarquement antérieur après déplacement | Donnée historique incohérente | Édition d’une journée synchronisée, donnée existante réparée et contrainte SQL ajoutée | Corrigé en P0.1 |
| Aucune gestion des heures/fuseaux par événement | Limites pour les heures de prise/fin de service et changements de port | Les passages de minuit sont représentés par deux dates civiles inclusives ; la précision horaire reste hors du modèle actuel | P1 |

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
- `PlanningPublicationPanel.tsx` présente le statut, la version, le périmètre, le verrou et les actions de workflow sans disperser cette logique dans la timeline.
- `usePlanningOverview.ts` porte le cycle chargement/rafraîchissement/erreur, ignore les réponses obsolètes et préserve le dernier instantané valide pendant un rafraîchissement.

Les prochains refactors doivent extraire la toolbar, la timeline, les dialogues et le panneau latéral par étapes, sans reconstruire le module.

### Modèle métier

La logique pure est répartie sans modifier le modèle métier :

- `planningDates.ts` valide et calcule les dates civiles en UTC ;
- `planningValidation.ts` protège les champs obligatoires, identifiants et plages avant Supabase ;
- `planningPermissions.ts` traduit les rôles existants en capacités de lecture, écriture, export et publication ;
- `planningOverlap.ts` isole les chevauchements inter-navires et groupe les comparaisons par marin ;
- `planningErrors.ts` convertit les codes Supabase en messages utilisateur et journalise opération/code/message sans données métier ;
- `planningModel.ts` conserve les fonctions métier suivantes :
- fusion/déduplication des trois sources équipage ;
- groupement navire/bordée/marin ;
- alertes documents et certificats ;
- export journalier ;
- contrôles d’affectation et centre de conflits.

Le moteur `evaluatePlanningAssignment` reçoit un candidat et renvoie des `PlanningControlResult`. Chaque résultat comprend un code stable, un niveau, un titre, une explication, une date, l’événement et le marin concernés.

Les règles actives peuvent remplacer le niveau par défaut. Un avertissement n’empêche pas l’enregistrement ; un blocage l’empêche. Cette séparation préserve la décision humaine pour les situations exceptionnelles tout en sécurisant les cas incompatibles.

### Accès aux données

`planningQueries.ts` centralise les sélections, mutations et erreurs Supabase. `fetchPlanningOverview` lance en parallèle les requêtes indépendantes afin d’éviter les cascades de chargement. `transitionPlanningPublication` reste l’unique point d’entrée client du workflow de publication.

Sources fusionnées :

- `planning_assignments` : affectations natives SeaPilot ;
- `planning_days` : journées SMTR importées ;
- `planning_periods` : périodes SMTR importées ;
- `planning_projects` : projets et opérations historiques ;
- `people` et `hr_documents` : identité, fonction, activité, titres et aptitude ;
- `vessels` et `fleet_certificates` : flotte et échéances navire ;
- `planning_rules` : niveaux de contrôle configurables.
- `planning_publications` : état, périmètre, verrou et numéro de version courant.

Navires, marins, affectations, journées, périodes, projets, certificats, documents RH, règles et publications sont tous requis. Une source indisponible produit un message dédié ; aucune absence technique n’est présentée comme une liste métier vide.

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
planning_publications ─┬─< planning_versions
                       └── vessels (périmètre optionnel)
```

Les historiques SharePoint conservent leurs identifiants et libellés source. Les relations `person_id`/`vessel_id` sont utilisées lorsqu’elles sont résolues ; le moteur conserve le rapprochement par nom pour les lignes historiques non liées.

L’audit P0.1 confirme que toutes les références navire obligatoires sont résolues. Cinq journées et deux périodes historiques n’ont pas de `person_id` ; elles restent lisibles grâce à leur identité source et ne sont pas supprimées ni inventées. Les tables Planning ne portent actuellement aucun `company_id`, `tenant_id` ou `organization_id` : le déploiement audité est donc mono-entreprise. Une ouverture multi-entreprise exigera une migration dédiée, des clés étrangères de rattachement et une isolation RLS explicite avant toute mutualisation.

### Migrations des lots

`202607130001_planning_control_rules.sql` :

- crée `planning_rules` de manière idempotente ;
- valide code, périmètre, niveau, JSON de configuration et version ;
- indexe état/périmètre/date d’effet ;
- insère dix règles initiales sans écraser une configuration existante ;
- active RLS ;
- autorise la lecture aux rôles Planning existants ;
- réserve les écritures aux administrateurs.

`202607130002_planning_rpc_permissions.sql` retire l’exécution anonyme explicite de `planning_assignment_overview()` et conserve uniquement l’exécution authentifiée. La fonction continue ensuite d’appliquer son filtre par rôle, capitaine et marin.

`202607130003_planning_publication_workflow.sql` :

- crée `planning_publications` et `planning_versions` avec contraintes, index de périmètre/date et RLS ;
- réserve les transitions à l’administrateur dans `transition_planning_publication` ;
- verrouille en base les affectations, journées, périodes et projets qui chevauchent une période soumise, validée, publiée ou archivée ;
- exige un motif de dix caractères minimum avant réouverture ;
- capture un instantané JSON des quatre sources lors de chaque publication ;
- remplace l’audit applicatif non transactionnel des événements par des triggers PostgreSQL ;
- révoque l’exécution publique/anonyme des fonctions internes et n’expose que la transition authentifiée.

`202607130004_planning_p01_foundations.sql` :

- corrige de manière auditée les journées dont `disembark_on` précède `work_date`, sans supprimer de ligne ;
- ajoute puis valide la contrainte `planning_days_disembark_after_work_date` ;
- indexe les clés étrangères d’audit, de règles, de publication et de versions qui ne l’étaient pas ;
- réécrit, à périmètre fonctionnel constant, les politiques RLS Planning les plus sollicitées afin d’évaluer les fonctions de rôle et d’identité une seule fois par requête ;
- peut être rejouée sans danger grâce aux gardes sur la contrainte, aux index `if not exists` et aux recréations déterministes des politiques.

Retour arrière : supprimer la contrainte, les dix index nommés et recréer les politiques depuis la migration précédente. La correction de donnée n’est volontairement pas inversée automatiquement : l’ancienne valeur reste disponible dans `planning_change_log` et sa restauration doit être une décision métier explicite.

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

## 7. Validation, publication et verrouillage

Le workflow de période est limité aux administrateurs, comme les autres écritures Planning actuelles :

1. une période modifiable est soumise ; elle passe à `pending_validation` et est immédiatement verrouillée ;
2. la période figée est validée ;
3. la période validée est publiée et son numéro de version est incrémenté ;
4. un instantané immuable des affectations, journées, périodes et projets concernés est enregistré ;
5. toute modification ultérieure exige une réouverture motivée, puis une nouvelle soumission et une nouvelle publication.

Le périmètre peut couvrir toute la flotte ou un navire existant. Le trigger vérifie l’ancienne et la nouvelle période d’un événement : il empêche donc aussi de déplacer un événement hors d’une zone verrouillée ou vers une zone verrouillée. L’interface retire les contrôles d’édition, mais le trigger PostgreSQL reste l’autorité de sécurité.

## 8. Rôles et sécurité

Rôles existants : `admin`, `direction`, `armement`, `capitaine`, `marin`.

- Tous les accès passent par une session Supabase authentifiée.
- La lecture de `planning_assignments` est limitée par RLS : bureau, capitaine de l’affectation ou marin concerné.
- La fonction `planning_assignment_overview()` reproduit le même périmètre côté serveur.
- L’écriture des tables Planning éditables est actuellement réservée à `admin`, côté interface et RLS.
- Les documents RH conservent leurs politiques RLS propres ; aucune donnée médicale supplémentaire n’est copiée dans `planning_rules` ou dans les événements.
- Les règles sont lisibles par les rôles Planning et modifiables uniquement par `admin`.
- Les états de publication sont lisibles par les rôles Planning ; les instantanés/version et les transitions restent réservés à `admin`.
- Les fonctions de verrou et d’audit ne sont pas exécutables directement par les rôles API.
- Aucun secret ni identifiant de connexion n’est ajouté au dépôt.
- Les appels de rôle et d’identité dans les politiques P0.1 utilisent une sous-requête stable afin d’éviter leur réévaluation pour chaque ligne ; le périmètre d’autorisation reste inchangé.
- L’absence de colonne d’entreprise dans les tables Planning rend ces politiques adaptées uniquement au projet Supabase mono-entreprise actuel.

À terme, les droits de création, validation, publication, dérogation et export devront être séparés dans une matrice d’actions, puis appliqués dans des RPC et politiques RLS dédiées.

## 9. Dates et fuseaux horaires

Le modèle stocke les événements Planning sous forme de dates civiles PostgreSQL (`date`) et les échange au format strict `YYYY-MM-DD`. Une date civile ne représente pas un instant : aucune conversion de fuseau n’est appliquée à l’enregistrement.

- Les calculs calendaires utilisent minuit UTC, `Date.UTC` et les getters UTC pour éviter les glissements causés par le navigateur ou les changements d’heure.
- L’ancre « aujourd’hui » est calculée depuis les composantes locales de l’utilisateur, puis convertie en date civile ; l’affichage reste en calendrier local sans transformer la valeur enregistrée.
- Les bornes sont inclusives. Un événement commençant avant minuit et finissant après minuit est représenté par deux dates civiles consécutives ; il occupe donc les deux journées.
- Un événement multi-jours conserve une date de début et une date de fin inclusives, avec `end_date >= start_date` obligatoire.
- Les changements d’heure d’été/hiver n’ajoutent ni ne retirent une journée, car les durées calendaires ne sont jamais calculées en millisecondes locales.
- Une valeur absente ou invalide est refusée avant écriture ; les rares valeurs historiques absentes reçoivent un libellé sûr à l’affichage.

Le modèle ne stocke pas encore l’heure exacte de prise/fin de service ni un fuseau portuaire. Ajouter cette précision relèvera d’un besoin métier distinct et devra préserver les dates civiles existantes.

## 10. Tests et validation

Outils existants conservés : TypeScript strict, Vitest, Testing Library et build Vite.

Tests Planning couverts :

- validation stricte `YYYY-MM-DD`, plages semaine/mois/année et calculs UTC ;
- création d’un événement valide et refus d’une plage incohérente ;
- passage de minuit, événement multi-jours et changements d’heure ;
- fusion et hiérarchie des sources ;
- chargement explicite des navires et des marins, avec erreur de source contextualisée ;
- filtres et permissions de lecture/modification ;
- absence de chargement Supabase sans permission de lecture ;
- conservation du dernier Planning valide si un rafraîchissement échoue ;
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
- sélection du verrou pertinent pour une période et un navire ;
- ordre des transitions de publication ;
- soumission et verrouillage de la période visible ;
- retrait des actions d’édition sur un planning publié ;
- appel RPC et mapping de l’état/version de publication.

Commandes de validation :

```powershell
npm ci
npx tsc -b --pretty false
npm run lint
npm test -- --reporter=dot
npm run build
supabase db lint --linked
```

## 11. Feuille de route recommandée

### P0

1. Créer le workflow de relève et la comparaison bordée sortante/entrante.
2. Relier fonctions requises, effectif minimum et qualifications aux navires.
3. Charger les événements par période et indexer la détection visuelle des conflits.
4. Ajouter l’archivage logique des événements hors périodes publiées.
5. Extraire progressivement toolbar, timeline, dialogues et panneau latéral.
6. Ajouter un test de parcours navigateur authentifié stable.

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
