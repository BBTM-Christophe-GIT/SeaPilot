# Migration du module Projets SPFx vers SeaPilot — inventaire de phase 0

> Statut : phase 0 terminée — audit et cadrage uniquement
>
> Date de l'inventaire : 15 juillet 2026
>
> Source : `C:\CODEX\bbtm-dashboard-spfx-git`
>
> Cible : `C:\CODEX\SeaPilot`

## 1. Objet et limites de cette phase

Cette phase établit le contrat de migration du module métier **Projets** avant toute évolution de schéma, de code ou de données.

Elle couvre :

- le comportement réellement implémenté dans le Dashboard SPFx ;
- le modèle, l'interface, les imports et les autorisations déjà présents dans SeaPilot ;
- les dépendances avec Planning, DPR, Achats et Plan d'action ;
- l'état vérifiable des sources SharePoint et des tables Supabase ;
- les écarts, risques, décisions de conception et prérequis de la phase 1.

Elle ne couvre pas :

- la création ou la modification de migrations Supabase ;
- l'exécution d'un import métier ;
- la refonte de l'interface Projets ;
- la modification des RLS/RPC ;
- la création d'un lien entre `projects` et `planning_projects` ;
- la copie ou le déplacement d'un fichier SharePoint.

## 2. Conclusion exécutive

Le module SeaPilot actuel constitue un **socle technique**, mais pas encore une migration fonctionnelle complète du module SPFx.

Les tables `clients`, `projects`, `project_documents` et `contract_documents` ainsi que leurs pages de consultation existent déjà. En revanche :

1. les quatre tables sont actuellement vides dans l'environnement Supabase lié ;
2. l'import des projets et documents n'est pas rejouable sans risque de doublons tant que les identifiants de listes SharePoint restent absents ;
3. le modèle SeaPilot ne représente qu'une petite partie des champs métier et des clauses SUPPLYTIME gérés par SPFx ;
4. l'interface SeaPilot ne permet qu'une création simplifiée et ne propose ni détail complet, ni aperçu SUPPLYTIME, ni modification ou archivage ;
5. les relations client/navires saisies depuis SeaPilot ne sont pas résolues de façon atomique ;
6. les autorisations de navigation, d'interface et de base de données ne sont pas alignées ;
7. les règles de numérotation et plusieurs noms internes SharePoint doivent être confirmés à partir du catalogue réel des listes avant de figer le schéma cible.

L'architecture cible est confirmée :

- **Supabase est la source de vérité** des données structurées après la bascule ;
- les fichiers restent physiquement dans **SharePoint** ;
- Supabase ne stocke que les métadonnées et références nécessaires pour retrouver et ouvrir ces fichiers ;
- aucune double écriture vers les listes SharePoint n'est mise en place ;
- les imports SharePoint vers Supabase sont des opérations de reprise idempotentes, auditables et rejouables ;
- `projects` et `planning_projects` restent deux concepts distincts.

## 3. Sources inspectées

### 3.1 Dashboard SPFx

- `docs/sharepoint-modules-inventory.md`
- `src/webparts/bbtmKpiDashboard/modules/projects/`
- `src/webparts/bbtmKpiDashboard/BbtmKpiDashboardWebPart.ts`
- `src/webparts/bbtmKpiDashboard/BbtmKpiDashboardWebPart.manifest.json`

### 3.2 SeaPilot

- `src/features/projects/`
- `src/features/sharepoint/`
- `scripts/export-sharepoint-list.ts`
- `scripts/import-sharepoint-export.ts`
- `scripts/import-sharepoint-linked.ts`
- `supabase/migrations/202607020004_projects_clients.sql`
- `supabase/migrations/202607020005_project_documents.sql`
- `docs/migration/sharepoint-import-roadmap.md`
- migrations, requêtes et interfaces des modules Planning, DPR, Achats et Plan d'action

### 3.3 Vérifications externes en lecture seule

Le site SharePoint `https://bbtm668.sharepoint.com/sites/QHSE` a été retrouvé. Les bibliothèques suivantes sont accessibles et existent toujours :

- `Documents Projets` ;
- `Documents Contractuels`.

Les identifiants de lecteur retournés par Microsoft Graph ne correspondent pas exactement aux valeurs versionnées dans `sharePointInventory.ts`. Ils devront être rafraîchis et vérifiés avant un import documentaire.

Le connecteur utilisé permet de confirmer le site et les bibliothèques, mais pas d'inventorier le schéma des listes. La session Microsoft 365 CLI locale n'a pas fourni d'état d'authentification exploitable. Les identifiants des listes, leurs champs internes, leurs choix et les volumes réels restent donc à collecter avec une session autorisée.

Les migrations Supabase liées sont appliquées jusqu'à `202607150005`. Les statistiques estimées de l'environnement lié au 15 juillet 2026 sont :

| Table | Lignes estimées | Lecture |
|---|---:|---|
| `public.clients` | 0 | Aucun client importé |
| `public.projects` | 0 | Aucun projet importé |
| `public.project_documents` | 0 | Aucune métadonnée de document projet importée |
| `public.contract_documents` | 0 | Aucune métadonnée de document contractuel importée |
| `public.planning_projects` | 18 | Données Planning présentes, sans assimilation au catalogue Projets |

Ces chiffres sont des estimations PostgreSQL et devront être complétés par des comptages exacts au moment de la reprise.

## 4. Inventaire fonctionnel du module SPFx

### 4.1 Sources configurées

Le WebPart cible le site QHSE et référence :

| Usage | Titre configuré | Chemin configuré |
|---|---|---|
| Projets | `BBTM - Projets` | `/sites/QHSE/Lists/BBTM  Projets` |
| Clients | `BBTM - Clients` | `/sites/QHSE/Lists/BBTM  Clients` |

Le double espace dans les chemins est significatif. D'autres variantes apparaissent dans la documentation historique ; le chemin serveur réel doit être confirmé, et non reconstitué à partir du titre d'affichage.

Le module est désactivé par défaut dans le manifeste du WebPart et peut exposer un panneau de diagnostic lorsqu'une propriété de configuration l'autorise.

### 4.2 Parcours utilisateur réellement implémenté

Le module SPFx fournit les comportements suivants :

1. protection initiale par un mot de passe partagé codé côté client ;
2. chargement des catalogues de champs des listes Projets et Clients ;
3. chargement paginé des projets, triés par identifiant SharePoint décroissant ;
4. chargement des clients/affréteurs et des navires actifs ;
5. tableau synthétique des projets ;
6. sélection clavier ou souris d'un projet ;
7. aperçu de deux pages du contrat SUPPLYTIME 2017 ;
8. assistant de création dynamique d'un client ;
9. assistant de création dynamique d'un projet ;
10. panneau de diagnostic des champs et des alias attendus.

La protection par mot de passe côté navigateur est un anti-pattern critique. Sa valeur ne doit être ni documentée, ni reprise. SeaPilot doit reposer sur Supabase Auth, les RLS et des RPC contrôlées.

### 4.3 Tableau des projets

La liste SPFx est lue par pages avec un maximum de 5 000 éléments par requête, puis affichée sur sept colonnes fixes :

| Colonne | Source logique |
|---|---|
| Projet | `Title` |
| Date de livraison | alias de date de livraison |
| Port de livraison | alias de port de livraison |
| Date de restitution | alias de date de restitution/fin |
| Port de restitution | alias de port de restitution |
| Navire principal | `Navire` et variantes |
| Second navire | `Navire2`, `Navire_x0020_2` et variantes |

`FieldValuesAsText` est utilisé pour rendre lisibles les valeurs de lookup et d'autres types SharePoint.

### 4.4 Création d'un projet

Le formulaire n'est pas codé comme une liste fixe de champs. Il part du catalogue SharePoint, conserve les champs visibles et modifiables, puis les répartit en cinq groupes fonctionnels :

1. Identification ;
2. Planning ;
3. Offre commerciale ;
4. Opérations ;
5. Contrat SUPPLYTIME.

Les champs système, `Title`, le second navire, certains champs HSE et les champs résiduels non classés sont exclus de l'assistant.

Le service convertit dynamiquement les valeurs selon le type SharePoint :

- lookup ou utilisateur simple vers `<nomInterne>Id` ;
- lookup ou utilisateur multiple vers une liste d'identifiants ;
- choix multiple vers une liste de valeurs ;
- booléen, nombre et devise vers leur type natif ;
- date vers ISO 8601 ;
- URL vers l'objet SharePoint attendu ;
- texte et note vers une chaîne ;
- valeur facultative vide omise du payload.

À la création, SPFx envoie d'abord un titre temporaire, récupère l'identifiant de l'élément, puis renomme le projet selon la règle historique :

`P{identifiant SharePoint + 206} - {nom du projet}`

Cette règle dépend de l'identifiant technique de SharePoint et ne doit pas être transposée dans le navigateur SeaPilot. Les codes existants doivent être conservés. Les nouveaux codes devront être alloués côté serveur de façon transactionnelle et unique après décision métier sur la séquence.

Le module SPFx ne propose pas de formulaire général de modification d'un projet existant. Le seul `MERGE` observé finalise le titre juste après la création. La modification complète et l'archivage dans SeaPilot sont donc nécessaires à la nouvelle source de vérité, mais constituent une extension du comportement historique.

### 4.5 Création d'un client

Le formulaire Client est également généré à partir des champs SharePoint visibles et modifiables. Après création, le client est automatiquement sélectionné comme affréteur du nouveau projet.

En dehors de `Title`, le catalogue exact des champs Client doit encore être extrait de SharePoint. Il ne faut pas figer leur modèle cible à partir des seuls labels visibles.

### 4.6 Sélection des navires

Les options proviennent de la liste de flotte. Le service :

- conserve les éléments de type `Navire` ;
- exclut les navires dont la date de sortie de flotte est antérieure à la date courante ;
- privilégie l'identifiant du lookup quand le schéma le permet ;
- utilise des alias de secours lorsque les champs historiques varient.

Les relations futures doivent utiliser les identifiants stables disponibles. Le nom du navire reste un snapshot d'affichage, pas l'unique clé de relation.

### 4.7 Aperçu SUPPLYTIME 2017

Le projet sélectionné alimente deux images de formulaire et 34 zones contractuelles, ainsi que deux signatures. Les clés logiques sont :

| Groupe | Clés |
|---|---|
| Parties et navire | `box01_owners`, `box02_charterers`, `box03_vessel` |
| Livraison et période | `box04_delivery_date`, `box05_cancelling_date`, `box06_port_delivery`, `box07_delivery_range`, `box08_notice_delivery`, `box09_period`, `box10_extension`, `box11_continuation` |
| Mobilisation et carburant | `box12_mobilisation`, `box13_early_termination`, `box14_bunker_delivery`, `box15_declaration` |
| Opérations | `box16_area_operation`, `box17_employment`, `box18_delivery_hour`, `box19_special_fuel` |
| Prix et paiement | `box20_charter_hire`, `box21_extension_hire`, `box22_invoice_remittance`, `box23_payment`, `box24_account_group`, `box25_internal_price`, `box26_max_price` |
| Risques et résiliation | `box27_war_risk`, `box28_terror`, `box29_notice_money`, `box30_cancellation_clause` |
| Droit et clauses | `box31_taxes`, `box32_other_law`, `box33_dispute_resolution`, `box34_additional_clauses` |
| Signatures | `signature_owners`, `signature_charterers` |

Certaines zones sont surchargées par des champs canoniques :

| Zone | Valeur canonique prioritaire |
|---|---|
| `box03_vessel` | navire principal et second navire |
| `box04_delivery_date` | date de livraison |
| `box06_port_delivery` | port de livraison |
| `box07_delivery_range` | port de restitution |
| `box09_period` | intervalle livraison/restitution |
| `box17_employment` | titre du projet |

Les valeurs directement associées aux clés servent de repli. Cette priorité devra être conservée lors de la reconstruction de l'aperçu.

### 4.8 Panneau de diagnostic

Le panneau SPFx liste les champs visibles, vérifie les alias nécessaires au tableau, suggère des correspondances et copie un rapport de diagnostic.

Ce comportement n'a pas vocation à être repris tel quel dans l'interface métier. Il doit devenir un outil d'administration ou un rapport de réconciliation d'import : catalogue source, champs non mappés, erreurs, doublons et écarts de comptage.

## 5. Dictionnaire métier connu et incertitudes

Les noms suivants sont établis par le code ou les tests SPFx. Ils ne remplacent pas l'extraction du catalogue réel.

| Domaine | Champ/alias connu | Cible recommandée | Observation |
|---|---|---|---|
| Identité | `ID` | provenance SharePoint | Ne devient pas l'identifiant métier Supabase |
| Identité | `Title` | `projects.title` et éventuellement extraction du code | Contient historiquement code et libellé |
| Affréteur | `_x0033__x002e_Affr_x00e9_teur` | `client_id` + snapshot | Lookup réel absent du mapper actuel |
| Armateur | `_x0032__x002e_Armateuretlieudeso` | champ contractuel | Valeur par défaut historique à confirmer |
| Navire principal | `Navire` | `primary_vessel_id` + snapshot | Relation à la flotte |
| Second navire | `Navire2`, `Navire_x0020_2` | `secondary_vessel_id` + snapshot | Affiché mais exclu du formulaire SPFx |
| Contrat | `Contrat`, `TypedeContrat` | type de contrat | Choix réels à extraire |
| Statut | `Statut` | statut contrôlé | Choix réels et transitions à extraire |
| Affectation | préfixe `17` et alias historiques | champ métier | Correspondance exacte à confirmer |
| Support ROV | préfixe `18.1` et alias historiques | booléen/choix métier | Type réel à confirmer |
| Support plongée | préfixe `18.2` et alias historiques | booléen/choix métier | Type réel à confirmer |
| Livraison | labels/alias de date de livraison | `delivery_on` | Le tableau évoque `7`, le formulaire/test `5` |
| Livraison | préfixe `7` port de livraison | `delivery_port` | Collision possible avec la date |
| Restitution | préfixe `8.1` port de restitution | `redelivery_port` | À vérifier sur la liste réelle |
| Période | préfixes `9.1` et `9.2` | début/fin d'affrètement | Le tableau emploie aussi un alias de date de restitution |
| Extension | préfixes `10.1.1`, `10.1.2`, `10.1.3` | nombre, durée, unité | Validation croisée requise |
| Prolongation | préfixes `11.1`, `11.2` | mode et maximum | Valeur par défaut historique `Voyage` |
| Mobilisation | préfixe `12.1` | montant/texte contractuel | Type et devise à confirmer |
| Démobilisation | préfixe `15` | montant/texte contractuel | Type et devise à confirmer |
| Zone | préfixe `16` | zone d'opération | Texte contractuel |
| Prix | alias du charter hire, préfixe `21` | conditions tarifaires | Types et devises à confirmer |
| Audit | préfixe `26` | période maximale d'audit | Sémantique exacte à confirmer |
| Commentaires | alias de commentaires | description/note | Ne pas fusionner sans règle avec les clauses |
| Technique | `Modified` | `source_modified_at` | Sert à la reprise incrémentale et au contrôle |
| Technique | `FieldValuesAsText` | aucun stockage canonique | Aide à décoder les lookups lors de l'export |

Incohérences à résoudre avec le catalogue SharePoint :

- la date de livraison est rattachée au numéro `7` dans l'affichage mais au numéro `5` dans le classement du formulaire ;
- la date de restitution apparaît comme numéro `9` dans l'affichage, tandis que la fin d'affrètement est classée `9.2` ;
- le mapper SeaPilot actuel emploie `Dated_x00e9_but` et `Datefin`, noms plus proches de la liste Planning que du catalogue contractuel observé dans SPFx ;
- le chemin Client existe avec des variantes d'espacement dans les sources historiques ;
- le code projet peut être inclus dans `Title` et ne pas exister dans un champ `NumeroProjet` séparé.

## 6. État actuel de SeaPilot

### 6.1 Modèle déjà présent

Les migrations créent :

- `clients` ;
- `projects` ;
- `project_documents` ;
- `contract_documents`.

Le projet courant stocke notamment : code, titre, client, navires principal et secondaire, dates de début/fin, statut, description et provenance SharePoint.

Les documents stockent un rattachement projet, un code/titre projet, une catégorie, un titre, une URL de fichier, des notes et la provenance SharePoint.

Des index uniques existent sur `(sharepoint_list_id, sharepoint_item_id)`. Ils ne protègent cependant pas les imports actuels lorsque `sharepoint_list_id` est nul.

### 6.2 Interface actuelle

La route `/modules/projects` :

- charge projets, clients et deux collections documentaires depuis Supabase ;
- affiche des indicateurs et des filtres locaux ;
- présente trois tableaux ;
- ouvre les `file_url` dans SharePoint dans un nouvel onglet ;
- propose aux rôles admin/direction une création simplifiée.

Écarts par rapport au besoin cible :

- aucun détail complet du projet ;
- aucun aperçu SUPPLYTIME ;
- pas de formulaire complet des champs métier ;
- pas de création intégrée d'un client ;
- pas de modification, d'archivage ou d'historique ;
- relations client/navires saisies comme textes libres, sans résolution garantie des identifiants ;
- code projet saisi manuellement, sans allocation atomique ;
- listes chargées entièrement puis filtrées côté navigateur ;
- une erreur sur une des quatre requêtes bloque l'ensemble du chargement ;
- statuts codés en dur dans le composant.

### 6.3 Relations et résolveurs existants

Des résolveurs lient déjà les projets aux clients, navires et documents à partir :

1. des identifiants SharePoint lorsqu'ils existent ;
2. du code projet normalisé ;
3. du titre normalisé en dernier recours.

Ces mécanismes sont utiles pour la reprise, mais la création SeaPilot courante ne les appelle pas de manière atomique. La phase d'implémentation devra garantir que les identifiants relationnels et les snapshots sont cohérents dans une même transaction/RPC.

## 7. Documents : architecture et métadonnées cibles

Les fichiers doivent rester exclusivement dans SharePoint. SeaPilot les ouvre à partir de leur URL SharePoint et ne télécharge pas leur contenu pour le stocker dans Supabase Storage, Vercel ou Git.

Supabase doit conserver uniquement les métadonnées nécessaires, au minimum :

- identifiant de bibliothèque/liste ;
- identifiant de lecteur Graph ;
- identifiant de fichier/élément Graph ou SharePoint ;
- URL web SharePoint canonique ;
- chemin ou référence de dossier ;
- nom du fichier ;
- catégorie documentaire ;
- projet associé ;
- type MIME ou extension ;
- taille si utile au contrôle ;
- date de dernière modification ;
- `eTag` ou version technique si disponible ;
- provenance et date d'import.

Le mapper actuel prend principalement `EncodedAbsUrl` ou `webUrl`. Il devra aussi savoir reconstruire/valider une URL à partir de `FileRef`, ignorer les dossiers et refuser toute URL extérieure aux emplacements SharePoint autorisés.

## 8. Import SharePoint et idempotence

### 8.1 État actuel

`sharePointInventory.ts` décrit les quatre sources, mais ne contient pas les identifiants de listes pour :

- Projets ;
- Clients ;
- Documents Projets ;
- Documents Contractuels.

Les identifiants de lecteur documentaires versionnés doivent aussi être réconciliés avec ceux retournés actuellement par Graph.

Le mapper Projets actuel ne couvre que le modèle simplifié. En particulier :

- il cherche le client via `ClientId`/`Client`, pas via le nom interne d'affréteur observé dans SPFx ;
- il utilise des alias de dates non confirmés pour la liste commerciale ;
- il ne garantit pas l'extraction du code depuis le titre historique ;
- il ne conserve pas un payload source complet permettant d'auditer les champs non mappés.

### 8.2 Risque critique de doublons

L'upsert utilise `(sharepoint_list_id, sharepoint_item_id)`. En PostgreSQL, plusieurs lignes dont `sharepoint_list_id` est nul ne sont pas considérées comme en conflit par cet index. Rejouer l'import dans l'état actuel peut donc créer des doublons.

Avant tout import réel, il faut :

1. renseigner et valider les identifiants stables de chaque source ;
2. refuser un import si l'identité de la source est absente ;
3. définir une clé d'upsert non nulle et contrôlée ;
4. valider l'unicité des codes projet après normalisation ;
5. conserver les lignes sources absentes sans suppression implicite ;
6. produire un rapport `créé / mis à jour / inchangé / rejeté / ambigu` ;
7. rendre le dry-run obligatoire avant la première application ;
8. vérifier qu'un second passage produit zéro création et zéro modification inattendue.

Les imports doivent être additifs ou mettre à jour explicitement une ligne identifiée. L'absence d'un élément dans un export ne vaut jamais ordre de suppression.

## 9. Modèle cible recommandé pour la phase 1

Le modèle doit rester hybride : colonnes typées pour les règles métier et JSON uniquement pour la traçabilité ou les clauses très variables.

### 9.1 `projects`

Conserver ou ajouter des colonnes canoniques pour :

- identité, code unique et titre ;
- société/périmètre SeaPilot si le modèle multi-société l'exige ;
- client/affréteur ;
- navires principal et secondaire ;
- statut et type de contrat contrôlés ;
- dates de livraison, restitution et période contractuelle ;
- ports de livraison et restitution ;
- options de prolongation ;
- indicateurs opérationnels nécessaires aux filtres et dépendances ;
- archivage, audit, auteur et dates de modification ;
- provenance SharePoint.

### 9.2 Clauses SUPPLYTIME

Créer un sous-modèle contractuel un-à-un, par exemple `project_contracts`, avec :

- `project_id` unique ;
- type/version du formulaire ;
- données SUPPLYTIME validées, potentiellement dans un `jsonb` structuré pour les 34 zones et signatures ;
- champs canoniques prioritaires lorsque ces valeurs servent aussi aux relations, filtres ou règles métier ;
- historique/audit des modifications.

Le JSON ne doit pas devenir le seul modèle éditable des champs structurants.

### 9.3 Traçabilité de migration

Un `source_payload jsonb` ou une table de staging peut conserver la représentation source et les champs non mappés. Cette donnée sert à l'audit et à la réconciliation ; elle ne remplace pas les colonnes métier validées.

### 9.4 Numérotation

- préserver tous les codes historiques importés ;
- extraire le code de `Title` seulement avec une règle testée et un rapport des échecs ;
- imposer une unicité insensible aux variantes de casse/espacement ;
- allouer les nouveaux numéros dans une transaction ou RPC ;
- démarrer après le maximum métier réellement importé, selon une règle validée ;
- ne jamais calculer le prochain code avec `max(...) + 1` dans le navigateur.

## 10. Dépendances avec les autres modules

### 10.1 Planning

`projects` représente le catalogue commercial et contractuel. `planning_projects` représente les événements ou missions opérationnelles du Planning, alimentés depuis une autre liste SharePoint.

Ils doivent rester séparés. Un éventuel `catalog_project_id` sur `planning_projects` ne pourra être ajouté que si les données fournissent une correspondance déterministe : identifiant stable ou code métier contrôlé. Un rapprochement automatique flou sur le seul titre est interdit.

### 10.2 DPR

Les tables DPR possèdent déjà un `project_id` vers `projects` ainsi que des snapshots SharePoint/code/titre. Les résolveurs privilégient l'identifiant SharePoint, puis le code, puis le titre.

La migration doit préserver ces clés et tester les DPR existants contre les projets importés sans modifier les DPR ambigus.

### 10.3 Achats

Les demandes d'achat possèdent également un `project_id` et des snapshots de projet. Les formulaires actuels utilisent encore principalement le code et le titre saisis/transportés. La future intégration au catalogue doit empêcher les nouvelles références orphelines sans casser l'historique.

### 10.4 Plan d'action

Le Plan d'action suit le même principe : relation `project_id` lorsqu'elle est résolue, snapshots conservés pour l'historique. La reprise devra mesurer les lignes liées, non liées et ambiguës.

## 11. Autorisations et sécurité

### 11.1 Situation actuelle

Les politiques RLS des quatre tables autorisent actuellement :

| Action | Rôles autorisés par les RLS actuelles |
|---|---|
| Lecture | `admin`, `direction`, `armement`, `capitaine` |
| Écriture et suppression | `admin`, `direction`, `armement` |

En parallèle, la navigation Projets et le formulaire de création sont exposés par défaut uniquement à `admin` et `direction`.

Cette divergence signifie qu'un rôle masqué dans l'interface peut néanmoins disposer d'un accès direct à l'API. Elle doit être résolue par une décision métier explicite, puis appliquée aux RLS/RPC et à l'interface.

### 11.2 Cible de sécurité proposée à valider

| Capacité | Cible minimale proposée |
|---|---|
| Consulter le catalogue | `admin`, `direction`; lecture additionnelle pour `armement`/`capitaine` uniquement si validée |
| Créer/modifier | `admin`, `direction`; délégation à `armement` uniquement si validée |
| Archiver | rôle métier explicitement autorisé, via RPC contrôlée |
| Supprimer physiquement | interdit dans le parcours normal |
| Importer/réconcilier | service technique ou administrateur, via RPC/outillage dédié |
| Modifier les métadonnées documentaires | service d'import ou rôle administratif contrôlé |

Les règles doivent être testées avec chaque rôle. Le masquage d'un bouton React ne constitue jamais un contrôle d'accès.

Autres exigences :

- journaliser les créations, modifications et archivages ;
- empêcher la modification directe des identifiants de provenance ;
- limiter les RPC d'import au rôle technique attendu ;
- ne jamais exposer de jeton Graph, clé de service, mot de passe partagé, donnée personnelle ou export métier dans Git.

## 12. Matrice de parité et décisions

| Capacité | SPFx | SeaPilot actuel | Cible / décision |
|---|---|---|---|
| Lister et filtrer | Tableau 7 colonnes | Tableau enrichi, filtres locaux | Conserver, paginer/filtrer côté serveur |
| Voir un projet | Sélection + aperçu | Ligne de tableau seulement | Ajouter un détail métier complet |
| Aperçu SUPPLYTIME | Oui, 2 pages/34 zones | Non | À reconstruire après modèle contractuel |
| Créer un projet | Formulaire dynamique complet | Formulaire simplifié | Formulaire typé, validé, transactionnel |
| Créer un client | Oui, dynamique | Non | Ajouter selon schéma Client validé |
| Modifier un projet | Non, hors renommage post-création | Non | Nécessaire pour la source de vérité Supabase |
| Supprimer | Non observé | Possible par RLS/API | Interdire en usage normal, préférer l'archivage |
| Associer les navires | Lookup flotte | Textes libres + IDs facultatifs | Relations stables + snapshots |
| Numéroter | ID SharePoint + 206 | Saisie manuelle | RPC/sequence atomique |
| Ouvrir un fichier | SharePoint | URL SharePoint | Conserver, sans copie du binaire |
| Diagnostiquer | Panneau utilisateur | Non | Rapport admin de reprise/réconciliation |
| Sécuriser | Mot de passe client | Auth + RLS partielles | Auth, RLS/RPC alignées et testées |
| Double écriture | SharePoint source | Non | Interdite après bascule |

## 13. Informations à collecter avant la phase 1

La phase 1 ne doit pas deviner les éléments suivants :

1. GUID, URL serveur et titre exacts des listes Projets et Clients ;
2. GUID/list ID et drive ID exacts des deux bibliothèques documentaires ;
3. catalogue complet des champs : `InternalName`, titre, type, requis, lecture seule, masqué, choix et lookup cible ;
4. volumes exacts et plages d'identifiants ;
5. échantillon anonymisé couvrant champs renseignés, lookups, multivalués et documents ;
6. distribution des codes projet et exceptions à la règle `P...` ;
7. valeurs réelles de statut et transitions autorisées ;
8. décision sur les rôles `armement` et `capitaine` ;
9. règle de société/périmètre à appliquer aux projets ;
10. présence éventuelle d'un identifiant déterministe reliant Planning et catalogue Projets.

Commandes de collecte en lecture seule après authentification Microsoft 365 CLI :

```powershell
m365 spo list get --webUrl https://bbtm668.sharepoint.com/sites/QHSE --url "/sites/QHSE/Lists/BBTM  Projets" --properties "Id,Title,RootFolder,ItemCount" --output json
m365 spo field list --webUrl https://bbtm668.sharepoint.com/sites/QHSE --listUrl "/sites/QHSE/Lists/BBTM  Projets" --output json
m365 spo listitem list --webUrl https://bbtm668.sharepoint.com/sites/QHSE --listUrl "/sites/QHSE/Lists/BBTM  Projets" --fields "Id,Title,Modified" --output json
```

Les mêmes commandes doivent être exécutées pour Clients et adaptées aux bibliothèques. Les sorties métier restent hors Git et doivent être stockées dans un emplacement local ignoré et protégé.

## 14. Contrôles de données à préparer

Le plan de validation de la reprise devra au minimum comparer :

- nombre d'éléments source, importables, rejetés et importés ;
- unicité des identifiants SharePoint et des codes normalisés ;
- taux de projets sans client ;
- taux de projets sans navire ou avec navire ambigu ;
- cohérence chronologique des dates ;
- couverture des 34 zones SUPPLYTIME ;
- nombre de documents, dossiers ignorés, URL invalides et rattachements ambigus ;
- nombre de références DPR, Achats et Plan d'action résolues/non résolues ;
- absence de liaison automatique non déterministe avec Planning ;
- résultat d'un second import identique : zéro doublon et zéro suppression ;
- absence de contenu binaire hors SharePoint.

## 15. Risques restant ouverts

| Priorité | Risque | Mesure attendue |
|---|---|---|
| Critique | Import rejouable créant des doublons avec des list IDs nuls | Identités source non nulles, contraintes et tests de rejeu |
| Critique | Schéma cible construit sur de mauvais noms internes | Extraction du catalogue SharePoint avant migration de schéma |
| Élevée | Perte des clauses/champs SPFx non modélisés | Modèle contractuel + staging/source payload auditable |
| Élevée | Droits API plus larges que l'interface | Décision de rôles, RLS/RPC et tests négatifs |
| Élevée | Codes concurrents ou dupliqués | Allocation serveur atomique et index normalisé unique |
| Élevée | Relations client/navires stockées seulement en texte | Résolution transactionnelle et rapport des ambiguïtés |
| Élevée | Rupture des dépendances DPR/Achats/Actions | Réconciliation par identifiant/code et tests de non-régression |
| Moyenne | Drive IDs documentaires périmés | Redécouverte Graph et vérification des URL avant import |
| Moyenne | Confusion `projects` / `planning_projects` | Modèles séparés, lien explicite uniquement si déterministe |
| Moyenne | Suppression physique accidentelle | Archivage et suppression interdite par défaut |

## 16. Prochaine phase proposée

La **phase 1 — modèle cible et sécurité** pourra commencer seulement après collecte du catalogue SharePoint et validation des décisions de rôles et de numérotation.

Ses livrables devront être limités à :

- dictionnaire source-cible validé ;
- migrations du modèle Projets/Clients/contrats/métadonnées ;
- contraintes, index, audit et archivage ;
- RLS/RPC et tests de rôles ;
- documentation de la séparation avec Planning ;
- stratégie de migration compatible avec un import idempotent.

Elle ne devra pas encore exécuter la migration des données ni reconstruire l'interface complète.

---

**Arrêt de phase 0 :** aucun code applicatif, schéma Supabase, import ou fichier SharePoint n'a été modifié dans cette phase. Ce document constitue le point de transmission obligatoire vers la phase 1.
