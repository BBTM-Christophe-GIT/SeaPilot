# SeaPilot — architecture et audit du module Planning

Dernière mise à jour : 14 juillet 2026
Périmètre audité : route `/modules/planning`, composants React, accès Supabase, migrations SQL, RLS, rôles, tests et rendu responsive.

## 1. Synthèse

Le Planning SeaPilot est un cockpit React/Vite connecté aux données réelles Supabase et aux historiques SharePoint/SMTR importés. Il fusionne les affectations natives SeaPilot, les journées SMTR et les périodes SMTR sans remplacer les données historiques. P0.2 sépare explicitement la vue Flotte, organisée par navire, de la vue Équipages, organisée par marin ou équipe.

Le socle existant est fonctionnel pour consulter et corriger le planning : vues Jour/Semaine/Deux semaines/Mois/An, filtres métier, zoom, plein écran, création, modification, duplication, glisser-déposer, changement de navire, redimensionnement, formulaires rapide/complet, export CSV, alertes documentaires et audit des écritures. Les mutations simples mettent à jour l’instantané React sans recharger l’ensemble du Planning et restaurent la valeur précédente si Supabase refuse l’écriture. P0.4 sépare désormais préparation, validation, publication, administration et lecture dans une matrice d’actions appliquée à la fois par React, les RPC et les politiques RLS.

Le premier lot P0 du 13 juillet 2026 a ajouté le moteur central de contrôle des affectations, ses niveaux configurables et le centre de conflits. Le lot de publication qui suit ajoute un workflow administrateur Soumettre → Valider → Publier, un verrou PostgreSQL couvrant les quatre sources d’événements existantes et un instantané immuable à chaque version publiée. Les règles utilisent les données Planning et RH existantes ; aucune donnée fictive et aucune table d’événements concurrente n’ont été créées.

### Phase P0.1 — stabilisation des fondations

La phase P0.1 conserve les tables et les parcours métier existants. Elle isole les dates civiles, la validation, les permissions, les erreurs Supabase, le chargement React et la détection des chevauchements dans des modules dédiés. Toutes les sources nécessaires sont désormais chargées en parallèle sans masquer une erreur derrière un tableau vide. Un rafraîchissement conserve les données déjà affichées et présente l’erreur de la source concernée.

Le contrôle distant réalisé avant migration comptait 11 affectations, 171 journées, 70 périodes et 18 projets. Aucune relation navire obligatoire n’était absente. Une journée éditée dans SeaPilot avait toutefois `disembark_on` au 6 juillet 2026 et `work_date` au 7 juillet 2026 ; la migration P0.1 la normalise de manière auditée avant d’ajouter une contrainte.

### Phase P0.2 — vues et événements

P0.2 conserve l’architecture P0.1 et extrait seulement le rendu des lignes dans `PlanningTimeline.tsx` et la construction des perspectives dans `planningViews.ts`. Le cockpit courant propose deux vues explicites : Flotte pour les navires, opérations, transits, maintenances, indisponibilités et affectations ; Équipages pour les embarquements, repos, congés, formations et indisponibilités avec un état provisoire, confirmé ou annulé. Les anciennes perspectives redondantes Navire et Marin ont été retirées. La vue Flotte est structurée en trois niveaux repliables — navire, bordée, marin — et masque les navires sans marin affecté sur la période visible. Les filtres navire, marin, type, statut et responsable restent actifs après une mutation et sont regroupés dans un panneau repliable.

La vue Flotte réutilise désormais le langage visuel compact de la vue Équipages : hauteurs de lignes homogènes, accent vert d’eau, compteurs discrets et barres de projet fines avec libellé centré. Le clic simple ne colore aucune case vide : le statut par défaut est créé uniquement au double-clic. Un clic maintenu sur la grille déplace le viewport horizontalement et verticalement avec un curseur de préhension. Le menu d’état au clic droit, le glisser-déposer des objets métier et le redimensionnement restent disponibles.

Les formulaires rapide et complet utilisent un panneau latéral commun. En vue Flotte, la liste persistante des marins non affectés permet de déposer directement un marin sur le jour d’un navire ; SeaPilot crée alors une affectation provisoire de 08:00 à 20:00, après les contrôles P0, sans rechargement intégral. La poignée tactile utilise Pointer Events sur iPad. À la souris, la grille se parcourt par préhension dans les deux axes ; cette interaction ne crée aucune affectation. Le lieu libre par navire/jour est limité à `ARMEMENT - CHERBOURG`. Les autres cases colorées appartiennent à une affectation et acceptent un texte court distinct chaque jour. Toutes les échelles conservent un débordement horizontal explicite ; la vue Jour montre une fenêtre mobile de sept jours centrée sur la date de référence.

### Phase P0.3 — affectations maritimes, relèves et contrôles essentiels

P0.3 ajoute une précision horaire aux affectations existantes sans supprimer leurs dates civiles : `starts_at` et `ends_at` conservent les instants UTC, tandis que `starts_on` et `ends_on` restent synchronisés en calendrier `Europe/Paris` pour la timeline et les données historiques. La vue Équipages présente les affectations provisoires ou confirmées et ouvre le panneau d’édition complet. La vue Flotte affiche le nom du marin uniquement au troisième niveau de l’arborescence, sans répéter sa fonction ; les opérations et lieux quotidiens restent portés par la ligne navire, et les périodes d’affectation par la ligne marin.

Les contrôles distinguent Information, Avertissement et Blocage pour les doubles affectations, absences, indisponibilités, fonctions incompatibles, titres expirés ou expirant pendant l’embarquement, aptitude médicale et qualifications pont/machine manquantes. Les blocages essentiels (activité, absence/indisponibilité et aptitude médicale) sont aussi contrôlés par trigger PostgreSQL. Les niveaux restent configurables dans `planning_rules`.

Une relève regroupe navire, instant, lieu, durée de passation, responsable, commentaires, statut et postes entrants/sortants. Sa sauvegarde complète passe par une RPC transactionnelle. La comparaison classe les postes inchangés, remplacés, vacants ou non conformes et expose les documents/qualifications manquants. Les dérogations sont limitées aux administrateurs, bornées dans le temps, rattachées à une règle et immuablement attribuées côté serveur ; chaque écriture est historisée.

### Phase P0.4 — gouvernance et préparation V1

P0.4 finalise le cycle `preparation` → `pending_validation` → `validated` → `published`, puis `modified_after_publication` après une réouverture motivée, et `archived` pour clôturer une période. Une période verrouillée, y compris archivée, peut être reprise explicitement par un rôle autorisé sans altérer les versions publiées. La publication reste définie par période et par flotte ou navire. Chaque transition conserve son auteur, son horodatage, son commentaire et le numéro de version ; chaque publication crée un instantané JSON immuable incluant affectations, journées, périodes, opérations, relèves, bordées et dérogations.

La migration `202607130007_planning_p04_governance_v1.sql` corrige aussi la contrainte P0.3 qui avait omis le type d’historique `publication`. Le journal transactionnel distingue désormais création, modification, déplacement/redimensionnement, affectation, désaffectation, validation, publication, annulation, dérogation, changement de statut, archivage et réouverture.

L’isolation entreprise est matérialisée par `companies`, `company_memberships`, `profiles.active_company_id` et des `company_id` obligatoires sur les données Planning, RH et flotte consommées par le module. Toutes les lignes existantes sont rattachées à BBTM avant activation des contraintes. Les rôles sont désormais attribués dans une entreprise, et les politiques RLS recoupent entreprise, action, navire, période et personne. Les autorisations exceptionnelles par navire sont bornées, motivées et révocables dans `planning_vessel_permissions`.

### Phase P1.1 — rotations, modèles et matrices d’armement

P1.1 étend le socle P0 sans le remplacer. Une rotation 7/7, 10/10, 14/14 ou personnalisée est décrite dans `planning_rotation_series`, puis chaque période embarquée est créée dans `planning_assignments` et reliée par `planning_rotation_occurrences`. Les vues Flotte, Équipages, Navire et Marin continuent donc à lire une seule source opérationnelle. La génération est transactionnelle, sérialisée par marin et refuse toute affectation existante qui chevauche une occurrence. Les portées de modification sont explicites : occurrence seule, occurrence et suivantes, ou série entière.

Les modèles restent dans `planning_templates`. Leur application crée soit un `planning_project`, soit une relève brouillon dans `planning_handovers`; aucune table d’événements concurrente n’est introduite. Les matrices `planning_manning_matrices` et `planning_manning_requirements` définissent les fonctions, minima, cibles, brevets, qualifications, habilitations, formations et restrictions par navire. La comparaison côté client indexe marins et documents, détecte postes vacants, fonctions au-delà de la cible et documents manquants ou expirant avant la fin d’affectation. Les restrictions textuelles sont affichées à l’opérateur, mais ne deviennent pas des règles bloquantes tant qu’elles ne sont pas structurées dans les données existantes.

Le panneau `PlanningP11Panel.tsx` est chargé uniquement à son ouverture. Après une mutation, il recharge uniquement les affectations, projets ou relèves concernés, sans réinitialiser la période, les filtres ou la perspective du Planning P0. Les rôles `admin`, `direction` et `armement` reçoivent les actions serveur `manage_rotation`, `manage_template` et `manage_manning`; les autres rôles conservent une lecture bornée par la RLS P0.

### Phase P1.2 — absences, remplacements et centre de conflits

P1.2 ajoute un workflow d’absence typé (`leave`, `illness`, `training`, `medical_visit`, `unavailability`, `recovery`) avec demande, modification tant qu’elle est en attente, validation, refus et annulation. Les instants sont stockés en UTC ; la validation locale réutilise les protections P0 sur les heures inexistantes et les intervalles incohérents. Une approbation conserve les affectations existantes pour rendre leur impact visible, mais un trigger serveur bloque les nouvelles affectations chevauchantes selon les règles et dérogations P0.

`planningP12.ts` détecte neuf familles de conflit à partir des affectations, absences, périodes historiques, documents RH, maintenances, relèves et matrices P1.1 déjà chargés. Il groupe les affectations par marin, indexe les documents et produit une clé stable par conflit. `planningP12Queries.ts` centralise les trois lectures P1.2 et les quatre RPC. Le panneau `PlanningP12Panel.tsx`, chargé à la demande, sépare demandes, traitement et recherche de remplaçants. Les dossiers persistants conservent responsable, priorité, statut, commentaire, liens source, résolution/dérogation et historique sans dupliquer les événements opérationnels.

La recherche de remplacement écarte ou avertit selon les autres affectations, absences approuvées, certificats, documents médicaux, fonction et exigences de matrice. Elle explique chaque incompatibilité et ne choisit jamais un marin : l’action finale ouvre le formulaire d’affectation P0 prérempli, en statut provisoire. Les règles complètes de repos, les suggestions automatiques et les notifications restent hors P1.2.

### Phase P1.3 — repos, notifications, indicateurs, exports et dépendances

P1.3 finalise le périmètre métier P1 sans modifier les sources opérationnelles P0. `planning_work_rest_policies` porte des seuils versionnés par entreprise ou navire et par période. La migration ne fournit aucune valeur réglementaire implicite : tant qu’un administrateur n’a pas saisi de politique, chaque contrôle est explicitement « non évaluable ». Le moteur pur `planningP13.ts` contrôle travail/repos sur 24 heures et 7 jours, repos consécutif, fractionnement, travail de nuit et temps de passation. Il consomme les métriques `planning_days`; les trois métriques détaillées absentes des imports historiques restent nullable et ne sont jamais devinées. Les dérogations P0.3 sont appliquées uniquement lorsqu’elles ciblent la règle, le marin, le navire et la date du contrôle.

`planning_notifications` contient une ligne par destinataire et une empreinte anti-doublon. Les triggers couvrent affectation, modification, publication, relève, absence, conflit critique et poste vacant. Une RPC idempotente actualise les échéances documentaires à 30 jours. Les utilisateurs ne voient et ne marquent comme lues que leurs propres notifications ; les insertions restent exclusivement serveur. `planning_dependencies` décrit des liens fin-début entre projet, affectation, absence/formation et relève. Les RPC contrôlent l’entreprise, les permissions, les références et les cycles avant écriture ; le client explique les écarts de délai.

`PlanningP13Panel.tsx` est chargé dynamiquement et regroupe tableau de bord, contrôles de repos, notifications, dépendances et exports. Les indicateurs sont calculés depuis les données déjà chargées avec index `Map`/`Set`. Les exports Excel OOXML, PDF et ICS sont générés côté client à la demande pour le Planning, les listes d’équipage, feuilles de relève, anomalies et contrôles travail/repos ; les bibliothèques lourdes restent hors du bundle initial.

### Phase P2.1 — assistant de planification maritime

P2.1 ajoute un moteur de conseil déterministe dans `planningP21.ts`. Il réutilise les conflits P1.2, matrices P1.1, contrôles travail/repos P1.3, dépendances P1.3, relèves, documents RH et historique P0.4. Il identifie les vacances, classe des marins compatibles, explique les incompatibilités, suggère des relèves et réorganisations, détecte les incohérences et résume les modifications. Chaque résultat contient les critères, données vérifiées, règles, conflits, données indisponibles, un score/niveau de confiance et une justification. Une donnée absente réduit la confiance ou produit une conclusion non évaluable ; elle n’est jamais inventée.

`PlanningP21Panel.tsx` est chargé dynamiquement uniquement lorsque `VITE_PLANNING_ASSISTANT_ENABLED=true` et que la RPC d’accès confirme un administrateur ou un utilisateur Direction/Armement explicitement inscrit dans `planning_assistant_pilots`. Accepter ou refuser une suggestion appelle seulement `record_planning_assistant_review` : la preuve affichée et la décision humaine sont figées dans `planning_assistant_reviews` et le journal global. Cette RPC ne possède aucun chemin d’écriture vers les affectations, publications ou dérogations. Les administrateurs gèrent l’allowlist pilote par RPC auditée ; le flag reste désactivé par défaut.

### Phase P2.2 — projections bornées et scénarios alternatifs

P2.2 ajoute `planningP22.ts`, un moteur pur qui exploite uniquement le programme déjà saisi. Il calcule la charge descriptive par navire et par marin en jours calendaires uniques, puis classe les périodes de tension avec une règle explicite : opérations × 3 + indisponibilités navire × 3 + mouvements d’équipage × 2 + conflits connus × 2. Le seuil est le maximum entre 6 et le 75e percentile observé. Ces résultats décrivent les données connues ; ils ne prédisent ni une opération future, ni la probabilité d’une absence.

Les simulations d’absence et d’immobilisation ajoutent un événement synthétique uniquement en mémoire, réexécutent les contrôles P1.2, comparent le plan de référence au scénario et présentent deux alternatives manuelles. Chaque résultat sépare faits, règles et estimations, expose données utilisées, hypothèses, limites et confiance, et ne possède aucune action d’application. L’analyse est bornée à 400 jours pour garantir un coût prévisible.

`PlanningP22Panel.tsx` est chargé dynamiquement lorsque `VITE_PLANNING_PREDICTIONS_ENABLED=true` et que l’accès serveur P2.1 autorise déjà l’utilisateur. Le flag P2.2 est indépendant du flag assistant. La qualité des données est analysée dans le périmètre RLS réellement visible : l’absence de matrice d’armement, politique travail/repos, historique d’absences ou contrat d’intégration bloque la fonction concernée au lieu de produire une estimation fragile. La prévision statistique des sous-effectifs, les synchronisations externes et le cache hors connexion persistant restent donc volontairement non développés. Aucun schéma Supabase ni aucune donnée P0/P1 n’est modifié.

## 2. Matrice fonctionnelle

| Domaine | État avant le lot | État après le lot | Constat / limite restante | Priorité suivante |
| --- | --- | --- | --- | --- |
| Route et intégration SeaPilot | Opérationnel | Opérationnel | Route protégée sous `/modules/planning`, navigation et authentification conservées | Maintenir |
| Données navires, marins et projets | Opérationnel | Opérationnel | Données réelles Supabase et historiques SharePoint | Maintenir |
| Vue équipages | Opérationnel | Opérationnel P0.2 | Marins ou équipes en lignes ; première colonne et dates fixes ; affectations provisoires/confirmées | Maintenir |
| Vue flotte | Partiel | Opérationnel P0.2 | Arborescence navire → bordée → marin ; navires vides masqués ; opérations et lieux sur le navire, affectations sur le marin, dépôt direct disponible | Maintenir |
| Échelles temporelles | Partiel | Opérationnel P0.2 | Jour mobile de 7 jours, semaine, deux semaines, mois glissant de 49 jours et année, tous avec défilement horizontal | Maintenir |
| Filtres et navigation temporelle | Opérationnel | Opérationnel P0.2 | Période, navire, marin, type, statut, responsable, zoom et défilement horizontal permanent ; les week-ends restent toujours visibles | Maintenir |
| Création rapide et complète | Opérationnel | Opérationnel P0.2 | Panneau latéral commun ; contrôles avant enregistrement ; pièces jointes hors P0.2 | Maintenir |
| Modification directe | Opérationnel | Opérationnel P0.2 | Édition, déplacement, changement de navire et redimensionnement optimistes avec retour arrière | Maintenir |
| Affectations | Partiel | Opérationnel P0.3 | Fonction, instants, statut provisoire/confirmé, modification/retrait et dépôt Flotte simplifié ; périodes visibles dans l’arborescence et détail complet dans Équipages | Maintenir |
| Détection de double affectation | Partiel | Opérationnel P0.3 | Détecte les affectations natives et historiques sur deux navires ; niveau configurable | Maintenir |
| Disponibilités et absences | Partiel | Opérationnel P1.2 | Demande, validation, refus, annulation, impacts et historique UTC ; les statuts historiques restent lus | Maintenir |
| Qualifications et certificats marins | Partiel | Amélioré P0.3 | Expiré/expirant et qualification pont/machine signalés ; pas de matrice d’armement par navire | P0 ultérieur |
| Aptitude et restrictions médicales | Partiel | Amélioré | Inaptitude, restriction et validité jusqu’au débarquement prises en compte | P0 : dérogation autorisée |
| Certificats navires | Partiel | Partiel | Alertes à 90 jours ; pas encore de blocage selon opération | P1 |
| Centre de conflits | Absent | Opérationnel P1.2 | Neuf familles, responsable, priorité, statut, commentaire, source, historique, résolution ou dérogation | Maintenir |
| Remplacements | Absent | Opérationnel P1.2 | Recherche filtrée, compatibilité expliquée et préparation manuelle d’une affectation provisoire | Maintenir la décision humaine |
| Relèves d’équipage | Absent | Opérationnel P0.3 | Saisie complète, comparaison des bordées et sauvegarde transactionnelle | Maintenir |
| Rotations récurrentes | Absent | Absent | Aucun modèle 7/7, 10/10, 14/14 ni édition de série | P1 |
| Temps de travail et repos | Partiel | Opérationnel P1.3 | Seuils administrables, 24 h/7 j, repos consécutif/fractionné, nuit, passation et dérogations ; données détaillées historiques parfois non évaluables | Maintenir la qualité des saisies |
| Validation, publication, verrouillage | Absent | Opérationnel P0.4 | Cycle complet, multi-acteurs, verrou serveur et réouverture motivée par période/flotte/navire | Maintenir |
| Historique | Partiel | Opérationnel P0.4 | Journal sémantique, auteurs figés, versions complètes immuables et consultation dans le panneau latéral | P1 : comparaison visuelle de versions |
| Permissions | Partiel | Opérationnel P0.4 | Matrice d’actions, périmètre entreprise/navire/période/personne et contrôle identique UI/RPC/RLS | Maintenir |
| Export | Partiel | Opérationnel P1.3 | Excel OOXML, PDF et ICS : Planning, équipage, relève, anomalies et travail/repos ; crew list dédiée A4 paysage par date/navire/bordée | Maintenir |
| Notifications et collaboration | Absent | Opérationnel P1.3 | Huit familles, destinataire individuel, lecture et anti-doublon serveur ; pas d’envoi e-mail/push | Extension éventuelle |
| Tableau de bord métier | Absent | Opérationnel P1.3 | Opérations, embarqués/disponibles, relèves, vacances, conflits, couverture, conformité et échéances 7/14/30 j | Maintenir |
| Dépendances | Absent | Opérationnel P1.3 | Opérations, maintenance/remise en service, formation/affectation et livraison/opération ; cycles refusés | Maintenir |
| Assistant de planification | Absent | Pilote P2.1 | Suggestions déterministes explicables, confiance, données manquantes et décisions acceptées/refusées journalisées ; aucune application automatique | Mesurer le pilote |
| Projections et scénarios | Absent | Limité P2.2 | Charge descriptive, tension expliquée, simulations locales absence/navire et comparaison de plans ; prévisions statistiques et intégrations bloquées par qualité insuffisante | Enrichir les données avant extension |
| Responsive ordinateur/iPad | Opérationnel | Opérationnel P0.2 | Timeline prioritaire sous 1500 px, panneau latéral plein écran étroit, contrôles tactiles de 44 px | Maintenir |
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
| Aucune gestion des heures/fuseaux par affectation | Limites pour les prises/fin de service et changements d’heure | P0.3 stocke les instants UTC, affiche en `Europe/Paris`, refuse les heures locales inexistantes et conserve les dates civiles | Corrigé pour les affectations |

## 4. Architecture applicative

### Route

- `src/App.tsx` associe le module `planning` à `PlanningPage`.
- `RequireAuth` et `AppShell` fournissent la session, les rôles et le client Supabase.
- L’URL de production reste `/modules/planning` ; la réécriture Vercel SPA est inchangée.

### Composants

- `PlanningPage.tsx` orchestre chargement, perspectives, filtres, formulaires, mutations optimistes et actions.
- `PlanningTimeline.tsx` rend séparément une ligne Flotte ou Équipages, les zones de sélection/création, les barres, le glisser-déposer et le redimensionnement Pointer Events ; en vue Flotte, une case vide se colore uniquement au double-clic, tandis que les barres et cases existantes conservent leur ouverture complète au double-clic.
- `planningViews.ts` construit les lignes par navire, marin ou équipe, applique les filtres P0.2 et porte les transformations immuables utilisées pour le retour arrière.
- `PlanningEventDialog` édite une journée, période ou affectation.
- `PlanningProjectDialog` édite les projets Planning existants.
- `PlanningSideContent` affiche conflits, échéances, marins non affectés et facturation.
- `PlanningControlSummary.tsx` présente les contrôles sans dépendre uniquement de la couleur : libellé du niveau, titre et explication.
- `PlanningPublicationPanel.tsx` présente le statut, la version, le périmètre, le verrou et les actions de workflow sans disperser cette logique dans la timeline.
- `PlanningP03Panels.tsx` porte les vues Navire/Marin, l’éditeur de relève, la comparaison des bordées et les dérogations.
- `PlanningP11Panel.tsx` porte les rotations, modèles et matrices sans augmenter la responsabilité de `PlanningPage.tsx`.
- `planningP11.ts` contient les calculs purs de série et de comparaison d’armement ; `planningP11Queries.ts` centralise les lectures et RPC P1.1.
- `PlanningP12Panel.tsx` porte les absences, le centre de conflits et la recherche manuelle de remplaçants ; il est chargé dynamiquement à l’ouverture.
- `planningP12.ts` contient la détection et l’explication des compatibilités ; `planningP12Queries.ts` centralise les lectures et RPC P1.2.
- `PlanningP13Panel.tsx` porte le cockpit final P1 ; `planningP13.ts` contient les calculs purs et `planningP13Queries.ts` centralise les lectures/RPC.
- `planningP13Exports.ts` construit Excel/PDF/ICS à la demande et reste séparé du rendu et des règles métier.
- `planningCrewList.ts` sélectionne une bordée à une date depuis l’instantané Supabase et génère une crew list Excel ou PDF A4 paysage monochrome sans lire les données du fichier modèle fourni ; il normalise les champs FAL 5 et embarque le nom/signature du ship owner.
- `PlanningP21Panel.tsx` porte l’assistant pilote, son journal et l’administration de l’allowlist ; il est absent du bundle initial.
- `planningP21.ts` produit les suggestions et preuves sans effet de bord ; `planningP21Queries.ts` limite les écritures aux décisions et accès pilote auditables, tandis que `planningP21Access.ts` garde la vérification d’accès hors du chunk métier.
- `PlanningP22Panel.tsx` porte projections, scénarios, qualité et état des intégrations ; il est absent du bundle initial et ne propose aucune écriture.
- `planningP22.ts` contient les calculs purs, les seuils documentés, les portes de qualité et la comparaison référence/scénario ; il réutilise les lectures P1.3 sans créer de service Supabase concurrent.
- `usePlanningAssistantAccess.ts` n’appelle la RPC d’accès que si le feature flag est actif et que le rôle est éligible.
- `usePlanningOverview.ts` porte le cycle chargement/rafraîchissement/erreur, ignore les réponses obsolètes et préserve le dernier instantané valide pendant un rafraîchissement.

Les prochains refactors peuvent extraire la toolbar et les dialogues par étapes, sans reconstruire le module ni remettre en cause les frontières P0.1.

### Modèle métier

La logique pure est répartie sans modifier le modèle métier :

- `planningDates.ts` valide et calcule les dates civiles en UTC ;
- `planningValidation.ts` protège les champs obligatoires, identifiants et plages avant Supabase ;
- `planningPermissions.ts` traduit les rôles existants en capacités de lecture, écriture, export et publication ;
- `planningOverlap.ts` isole les chevauchements inter-navires et groupe les comparaisons par marin ;
- `planningHandovers.ts` construit les bordées autour d’un instant de relève et compare chaque poste ;
- `planningViews.ts` isole les perspectives, regroupements, filtres et mises à jour optimistes ;
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
- `planning_versions` et `planning_change_log` : versions immuables et journal sémantique attribué.
- `planning_handovers` et `planning_handover_positions` : relèves transactionnelles et bordées entrantes/sortantes.
- `planning_derogations` : exceptions bornées, attribuées et rattachées à une règle, un marin et un navire.
- `companies`, `company_memberships`, `planning_action_permissions` et `planning_vessel_permissions` : isolation et autorisation serveur P0.4.
- `planning_rotation_series` et `planning_rotation_occurrences` : définition et exceptions des séries, reliées aux affectations P0.
- `planning_templates` : modèles réutilisables appliqués aux projets ou relèves P0.
- `planning_manning_matrices` et `planning_manning_requirements` : armement requis et versionné par navire.
- `planning_work_rest_policies` : seuils administrés, bornés dans le temps et éventuellement par navire.
- `planning_notifications` : notifications applicatives individualisées et état de lecture.
- `planning_dependencies` : liens métier fin-début contrôlés et audités.
- `planning_assistant_pilots` : allowlist entreprise des utilisateurs Direction/Armement autorisés pendant le pilote.
- `planning_assistant_reviews` : journal immuable des suggestions acceptées/refusées, avec instantané explicable complet.

Navires, marins, affectations, journées, périodes, projets, certificats, documents RH, règles et publications sont tous requis. Une source indisponible produit un message dédié ; aucune absence technique n’est présentée comme une liste métier vide.

P0.2 réutilise `planning_projects` comme source des événements Flotte avec `event_type` et `responsible_name`, et `planning_assignments` avec `confirmation_status`. Les valeurs historiques reçoivent respectivement les défauts sûrs `operation` et `confirmed`. Aucune table concurrente n’est créée.

## 5. Données et relations

```text
people ─┬─< planning_assignments >─ vessels
        ├─< planning_days >──────── vessels
        ├─< planning_periods >───── vessels
        └─< hr_documents

vessels ─< fleet_certificates
vessels ─< planning_projects (primary_vessel_id / secondary_vessel_id)

companies ─┬─< company_memberships >─ profiles
           ├─< people / vessels / événements Planning
           └─< user_roles

planning_change_log ── entreprise + référence logique entity_kind + entity_id
planning_rules ──────── configuration des contrôles par entreprise
planning_publications ─┬─< planning_versions
                       └── vessels (périmètre optionnel)

planning_handovers ─┬─< planning_handover_positions >─ people
                    ├── vessels
                    └── people (responsable)

planning_rules ─< planning_derogations >─ planning_assignments
                         ├── people
                         └── vessels
```

Les historiques SharePoint conservent leurs identifiants et libellés source. Les relations `person_id`/`vessel_id` sont utilisées lorsqu’elles sont résolues ; le moteur conserve le rapprochement par nom pour les lignes historiques non liées.

L’audit P0.1 confirme que toutes les références navire obligatoires sont résolues. Cinq journées et deux périodes historiques n’ont pas de `person_id` ; elles restent lisibles grâce à leur identité source et ne sont pas supprimées ni inventées. P0.4 rattache ces lignes historiques directement à leur entreprise, même lorsque la relation marin ou navire est absente. Le périmètre courant vient de `profiles.active_company_id`, validé contre `company_memberships`; les rôles et les politiques Planning ne peuvent pas traverser ce périmètre.

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

`202607130005_planning_p02_event_views.sql` :

- ajoute `planning_projects.event_type` et `responsible_name`, ainsi que `planning_assignments.confirmation_status` ;
- préserve les lignes existantes avec les valeurs par défaut `operation` et `confirmed` ;
- ajoute puis valide les contraintes de domaine sans verrou de validation prolongé ;
- indexe les filtres type/date, responsable et confirmation/date ;
- recrée `planning_assignment_overview()` avec le statut de confirmation, le même périmètre de lecture et une exécution réservée à `authenticated` ;
- reste rejouable grâce aux colonnes/index conditionnels, aux gardes de contraintes et à la recréation déterministe de la fonction.

Retour arrière : restaurer la fonction depuis la migration précédente, supprimer les index et contraintes P0.2, puis n’abandonner les trois colonnes qu’après export des valeurs nouvelles. Le retrait des colonnes est volontairement une opération manuelle car il serait destructif.

`202607130006_planning_p03_assignments_handovers.sql` :

- ajoute et rétroalimente `starts_at`/`ends_at` en UTC sur `planning_assignments`, puis synchronise les dates civiles en `Europe/Paris` ;
- crée `planning_handovers`, `planning_handover_positions` et `planning_derogations` avec clés étrangères, contraintes et index de filtrage ;
- expose `save_planning_handover` comme unique écriture transactionnelle de l’entête et de ses postes ;
- protège auteur et historique des dérogations, ajoute les contrôles bloquants essentiels côté serveur et respecte le verrou de publication ;
- applique RLS : lecture bureau/capitaine selon périmètre pour les relèves, dérogations réservées aux administrateurs, écritures administrateur uniquement ;
- étend l’audit transactionnel et recrée `planning_assignment_overview()` avec les instants UTC.

Retour arrière : exporter relèves/dérogations, supprimer les triggers/fonctions et tables P0.3, restaurer la RPC et la contrainte d’audit depuis P0.2, puis ne supprimer les instants qu’après décision métier. La migration préserve les données et ses créations/recréations sont idempotentes.

`202607130007_planning_p04_governance_v1.sql` :

- crée l’entreprise BBTM et rattache sans suppression profils, rôles, personnes, navires, événements, règles, publications, versions, relèves, dérogations et historique ;
- rend le périmètre entreprise obligatoire après rétro-remplissage et ajoute les index utilisés par les RLS et les vues temporelles ;
- remplace les rôles globaux par des rôles rattachés à une entreprise et introduit la matrice d’actions ainsi que les autorisations motivées par navire ;
- applique l’isolation entreprise/navire/personne aux lectures et aux écritures, y compris dans les fonctions `security definer` ;
- attribue soumission, validation, publication, verrouillage et mise à jour avec un libellé d’auteur conservé ;
- enrichit l’instantané publié avec les relèves et dérogations, rend les versions non modifiables et corrige la contrainte d’audit P0.3 ;
- classe les mutations en actions métier et expose les 250 dernières entrées autorisées au client ;
- recrée la RPC de relève, le verrou de période, les contrôles de règles et la vue des affectations avec les mêmes contrôles d’entreprise et d’action.

Retour arrière : suivre `docs/deployment/planning-p0-v1.md`. Les colonnes d’entreprise ne doivent pas être supprimées tant qu’une donnée P0.4 ou une deuxième entreprise existe. La migration a été rejouée deux fois sur une chaîne PostgreSQL vierge ; elle est idempotente et conserve les lignes existantes.

`202607130008_planning_p04_audit_backfill_cleanup.sql` retire du journal les seules mises à jour anonymes dont les instantanés avant/après diffèrent exclusivement par l’ajout de `company_id`. Ce nettoyage rejouable conserve toutes les actions utilisateur et empêche le backfill multi-entreprise d’apparaître comme une modification métier.

`202607140004_planning_fleet_daily_locations.sql` réutilise `planning_days` pour le lieu libre d’un navire à une date, identifié par `source_label = 'seapilot-vessel-location'` et sans relation marin. Un index unique partiel garantit une seule valeur par entreprise, navire et date. La RPC `save_planning_vessel_day_location` valide la longueur, l’entreprise, le navire actif, l’action `edit_event`, la RLS et le verrou de publication avant un upsert ou une suppression atomique. La migration ne modifie aucune journée historique et peut être rejouée. Le retour arrière exporte d’abord ces lignes techniques, puis retire la RPC et l’index ; aucune donnée existante n’est supprimée automatiquement.

`202607140005_planning_assignment_daily_notes.sql` réutilise aussi `planning_days` pour un texte de 32 caractères au maximum par affectation et par date. La clé technique `slot365 = 'assignment:<id>'` et le `source_label = 'seapilot-assignment-note'` évitent toute table concurrente et permettent au modèle de rattacher le texte à la barre colorée sans exposer la ligne comme un événement supplémentaire. La RPC vérifie l’entreprise, la plage de l’affectation, l’état non annulé, `edit_event`, la RLS et le verrou de publication. La migration est additive, idempotente et ne réécrit aucune donnée existante.

`202607160005_planning_reopen_archived.sql` étend la transition sécurisée `reopen` aux périodes archivées. Elle conserve la matrice d’autorisation, le motif obligatoire, le numéro de version et les instantanés publiés, retire uniquement le verrou courant et journalise le passage vers `modified_after_publication` ou `preparation`.

Les références réglementaires ou internes sont descriptives. Elles ne sont pas présentées comme une interprétation juridique définitive.

## 6. Contrôles livrés

| Code | Défaut | Données utilisées |
| --- | --- | --- |
| `invalid_period` | Blocage | Début/fin |
| `inactive_person` | Blocage | `people.active`, `hired_on`, `departed_on` |
| `crew_unavailability` | Blocage | Repos, congé, arrêt, formation sur événements fusionnés |
| `crew_absence` | Blocage | Congé, arrêt, maladie ou absence chevauchant l’affectation |
| `assignment_overlap` | Avertissement | Chevauchement du même marin sur deux navires |
| `function_mismatch` | Information | Fonction RH vs fonction planifiée |
| `expired_medical` | Blocage | Catégorie/titre/statut/échéance du document RH |
| `expired_credential` | Avertissement | Brevet, certificat, qualification, habilitation ou formation |
| `credential_expires_during_assignment` | Avertissement | Titre valide au départ, expirant avant le débarquement |
| `missing_qualification` | Avertissement | Qualification pont/machine connue dans le dossier RH |
| `medical_unfit` | Blocage | `medical_unfit` |
| `medical_restriction` | Avertissement | `medical_restriction` |
| `pending_validation` | Avertissement | Validation capitaine requise et statut en attente |

Les contrôles sont appliqués à la création, à la création rapide, à l’édition, au déplacement et au redimensionnement.

## 7. Validation, publication et verrouillage

Le workflow est contrôlé par action et périmètre :

1. une période modifiable est soumise ; elle passe à `pending_validation` et est immédiatement verrouillée ;
2. la période figée est validée ;
3. la période validée est publiée et son numéro de version est incrémenté ;
4. un instantané immuable des affectations, journées, périodes, projets, relèves, postes et dérogations concernés est enregistré ;
5. toute modification ultérieure exige l’action visible « Modifier à nouveau » et un motif d’au moins dix caractères, y compris si la période a été archivée, puis une nouvelle soumission et une nouvelle publication.

Le périmètre peut couvrir toute la flotte ou un navire existant. Le trigger vérifie l’ancienne et la nouvelle période d’un événement : il empêche donc aussi de déplacer un événement hors d’une zone verrouillée ou vers une zone verrouillée. Relèves, postes et dérogations sont soumis au même verrou. L’interface retire les contrôles d’édition, mais le trigger PostgreSQL reste l’autorité de sécurité.

## 8. Rôles et sécurité

Rôles existants : `admin`, `direction`, `armement`, `capitaine`, `marin`.

| Rôle | Entreprise | Événements | Workflow | Autres actions |
| --- | --- | --- | --- | --- |
| `admin` | entreprise active | lecture/écriture | soumettre, valider, publier, réouvrir, archiver | navires, relèves, dérogations, permissions, historique, export |
| `direction` | entreprise active | lecture/écriture | soumettre, valider, publier, réouvrir | dérogations, historique, export |
| `armement` | entreprise active | lecture/écriture | soumettre | relèves, historique, export |
| `capitaine` | navire affecté ou autorisation explicite | lecture du navire | validation du navire affecté | historique du navire |
| `marin` | personne et navires affectés | lecture propre | aucune transition | aucun historique de gouvernance |

- Tous les accès passent par une session Supabase authentifiée et une adhésion active à `profiles.active_company_id`.
- `planning_action_permissions` définit les capacités de rôle ; `planning_vessel_permissions` complète exceptionnellement une action sur un navire, pour une période et avec un motif d’au moins dix caractères.
- Les RPC `transition_planning_publication` et `save_planning_handover` revérifient l’entreprise, l’action, le navire et la période malgré leur exécution `security definer`.
- La fonction `planning_assignment_overview()` reproduit le périmètre RLS bureau/capitaine/marin.
- Les relations d’une affectation, relève ou dérogation ne peuvent pas référencer une autre entreprise ; des triggers rejettent tout décalage.
- Les documents RH et certificats flotte restent dans leurs tables sources, désormais filtrées par la même entreprise.
- Les versions publiées et les fonctions internes de verrou/audit ne sont pas directement modifiables ou exécutables par les rôles API.
- Aucun secret ni identifiant de connexion n’est ajouté au dépôt.

## 9. Dates et fuseaux horaires

Le modèle historique conserve les événements Planning sous forme de dates civiles PostgreSQL (`date`) au format strict `YYYY-MM-DD`. Depuis P0.3, les affectations portent en plus `starts_at` et `ends_at` en `timestamptz` : l’instant canonique est UTC et les dates civiles restent synchronisées pour la timeline existante.

- Les calculs calendaires utilisent minuit UTC, `Date.UTC` et les getters UTC pour éviter les glissements causés par le navigateur ou les changements d’heure.
- L’ancre « aujourd’hui » est calculée depuis les composantes locales de l’utilisateur, puis convertie en date civile ; l’affichage reste en calendrier local sans transformer la valeur enregistrée.
- Les bornes sont inclusives. Un événement commençant avant minuit et finissant après minuit est représenté par deux dates civiles consécutives ; il occupe donc les deux journées.
- Un événement multi-jours conserve une date de début et une date de fin inclusives, avec `end_date >= start_date` obligatoire.
- Les changements d’heure d’été/hiver n’ajoutent ni ne retirent une journée, car les durées calendaires ne sont jamais calculées en millisecondes locales.
- Les formulaires d’affectation saisissent l’heure en `Europe/Paris`, la convertissent en ISO-8601 UTC avant écriture et restaurent l’heure locale à l’affichage. Une heure locale inexistante au passage à l’heure d’été est refusée.
- Les événements passant minuit et les affectations multi-jours conservent leurs instants exacts et occupent chaque date civile traversée. La contrainte exige `ends_at > starts_at`.
- Une valeur absente ou invalide est refusée avant écriture ; les rares valeurs historiques absentes reçoivent un libellé sûr à l’affichage.

Le fuseau portuaire par événement n’est pas encore modélisé : P0.3 utilise volontairement `Europe/Paris`, cohérent avec l’exploitation actuelle. Une extension multi-fuseaux devra ajouter un identifiant IANA explicite sans réinterpréter les instants UTC existants.

## 10. Tests et validation

Outils existants conservés : TypeScript strict, Vitest, Testing Library et build Vite.

Tests Planning couverts :

- validation stricte `YYYY-MM-DD`, plages jour/semaine/deux semaines/mois/année et calculs UTC ;
- création d’un événement valide et refus d’une plage incohérente ;
- passage de minuit, événement multi-jours et changements d’heure ;
- fusion et hiérarchie des sources ;
- chargement explicite des navires et des marins, avec erreur de source contextualisée ;
- filtres et permissions de lecture/modification ;
- absence de chargement Supabase sans permission de lecture ;
- conservation du dernier Planning valide si un rafraîchissement échoue ;
- création classique et rapide ;
- perspectives Flotte/Équipages et regroupement marin/équipe ;
- filtres type/statut/responsable ;
- création et modification d’événements Flotte typés ;
- redimensionnement équipage et flotte ;
- conservation des filtres et absence de rechargement intégral après mutation simple ;
- transformations optimistes et restauration de l’instantané précédent ;
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
- conversion affectation locale/UTC, passage de minuit et refus d’une heure inexistante au changement d’heure ;
- contrôles absence, titre expirant, qualification manquante et dérogation active ;
- préremplissage et comparaison des bordées (inchangé, remplacé, vacant, non conforme) ;
- formulaire complet et lecture seule d’une relève, payload RPC transactionnel ;
- payload, attribution serveur et historique des dérogations ;
- vues Flotte et Équipages, absence des anciennes vues redondantes Navire/Marin, et conservation des filtres lors du changement de perspective ;
- dépôt souris d’un marin non affecté sur un navire/jour, affectation provisoire sans rechargement complet et contrôles métier réutilisés ;
- lieu libre par navire/jour, exclusion de ces lignes techniques des événements équipage et RPC de sauvegarde validée ;
- défilement horizontal et vertical par préhension de la grille, plus zoom sur Jour/Semaine/Deux semaines/Mois/An, avec poignée tactile réservée au glisser-déposer iPad.
- séparation des capacités administrateur, direction, armement, capitaine et marin ;
- auteurs et horodatages du workflow, archivage motivé et historique visible ;
- parcours SQL soumission → validation capitaine → publication → blocage → réouverture → modification ;
- conservation et immutabilité de la version publiée ;
- absence de fuite de navire entre deux entreprises et lecture propre du marin ;
- rejeu complet et double rejeu de la migration P0.4 sur PostgreSQL isolé.
- génération 14/14 sans doublon, rythme personnalisé et bornes calendaires ;
- payload RPC et portée de modification occurrence/suivantes/série ;
- création/réutilisation de modèles et conservation de leur configuration ;
- matrice versionnée, postes vacants, fonctions en excès et documents manquants ;
- rejeu idempotent et scénario SQL transactionnel P1.1 sur le schéma P0.4.
- détection des neuf familles de conflit et stabilité de leurs clés P1.2 ;
- création, validation, refus et dates UTC des absences ;
- recherche de remplaçants par fonction/qualification avec raisons d’incompatibilité ;
- traitement manuel, source, priorité, responsable, commentaire, résolution/dérogation et historique ;
- permissions UI/RPC/RLS et garde serveur contre une affectation chevauchant une absence approuvée.
- seuils de travail/repos exclusivement administrés, passation incluse, fenêtres 24 h/7 j et dérogations ciblées ;
- absence de conclusion lorsque les métriques de repos consécutif, fractionnement ou nuit sont manquantes ;
- notifications individualisées, lecture serveur, huit familles et actualisation documentaire idempotente ;
- indicateurs métier et performance sur plusieurs milliers de journées sans balayage quadratique ;
- dépendances fin-début, référence entreprise et refus des cycles côté RPC ;
- exports Excel OOXML, PDF et ICS pour les cinq livrables métier P1.3.
- feature flag inactif par défaut et absence de requête assistant lorsque le flag ou le rôle est hors périmètre ;
- génération déterministe des vacances, candidats, incompatibilités, relèves, incohérences, documents, résumés et réorganisations ;
- présence systématique des critères, données, règles, conflits, données absentes, confiance et justification ;
- performance du moteur sur 500 marins et absence de mutation des données sources ;
- acceptation/refus limité à la RPC de journalisation, et gestion des pilotes limitée aux administrateurs.
- activation P2.2 indépendante, mais accès toujours borné par l’autorisation serveur P2.1 ;
- portes de qualité bloquant sous-effectifs statistiques, intégrations externes et cache persistant lorsque les données requises manquent ;
- charge navire/marin en jours calendaires uniques, score de tension explicite et preuves faits/règles/estimations ;
- simulations d’absence et d’immobilisation sans mutation, deux alternatives manuelles et validation humaine obligatoire ;
- performance bornée sur 500 marins et une année d’analyse.

Commandes de validation :

```powershell
npm ci
npx tsc -b --pretty false
npm run lint
npm test -- --maxWorkers=2 --reporter=dot
npm run build
supabase db lint --linked
```

La procédure de migration, les contrôles pré/post-déploiement et le retour arrière V1 sont détaillés dans `docs/deployment/planning-p0-v1.md`.

## 11. Feuille de route recommandée

### Après P0

1. Surveiller la taille des événements et charger par période avant plusieurs milliers de lignes.
2. Extraire progressivement toolbar, dialogues et panneau latéral sans modifier le modèle P0.
3. Conserver un parcours navigateur authentifié ordinateur/iPad dans la recette de chaque déploiement.

### P1

1. P1.1 livré : rotations 7/7, 10/10, 14/14 et personnalisées, modèles et matrices d’armement.
2. P1.3 livré : moteur configurable de travail/repos à partir des données SMTR.
3. P1.2 livré : absences, impacts, remplacements manuels explicables et centre de conflits.
4. P1.3 livré : notifications individualisées, dépendances et tableau de bord métier.
5. P1.3 livré : exports PDF/Excel/ICS pour Planning, équipage, relève, anomalies et travail/repos.
6. Cache client, chargement progressif et abonnements temps réel ciblés.

### P2

1. P2.1 livré derrière feature flag : assistant explicable fondé uniquement sur les données et contraintes P0/P1.
2. Mesurer les décisions acceptées/refusées du pilote avant toute extension ou automatisation.
3. P2.2 livré derrière feature flag : charge descriptive, tension et simulations locales explicables, sans application automatique.
4. Alimenter et valider les matrices d’armement, politiques de repos et historiques avant toute prévision statistique de sous-effectif.
5. Définir contrats API, identité externe, propriété des données et résolution des conflits avant toute intégration ou persistance hors connexion.
