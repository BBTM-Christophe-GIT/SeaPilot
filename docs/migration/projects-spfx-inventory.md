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

### 3.4 Inventaire des cinq sources demandées

| Source | Type et emplacement | Identifiant vérifié | Volume live | État de preuve |
|---|---|---|---:|---|
| `BBTM - Projets` | Liste, `/sites/QHSE/Lists/BBTM  Projets` | List ID non disponible | Non relevé | Chemin confirmé par le manifeste SPFx ; catalogue live inaccessible sans session CLI Microsoft 365 |
| `BBTM - Clients` | Liste, variantes `/sites/QHSE/Lists/BBTM  Clients` et `/sites/QHSE/Lists/BBTM Clients` | List ID non disponible | Non relevé | Titre et variantes établis par le code ; chemin canonique à résoudre live |
| `BBTM - Flotte` | Liste, `/sites/QHSE/Lists/BBTM%20%20Flotte` | List ID versionné `543b9f00-aed2-489a-808a-7b64cc835a83`, non revalidé live | Non relevé | Utilisée comme lookup et déjà déclarée dans l'inventaire SeaPilot |
| `Documents Projets` | Bibliothèque, `/sites/QHSE/Documents%20Projets` | Drive ID Graph live `b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_Ou31l1uVoWRrtjl4GcYGNl` ; List ID non disponible | Non relevé | Bibliothèque et URL vérifiées par Microsoft Graph le 15 juillet 2026 |
| `Documents Contractuels` | Bibliothèque, `/sites/QHSE/Documents%20Contractuels` | Drive ID Graph live `b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_OWUUcnVo9hTIk_y0nRfdyl` ; List ID non disponible | Non relevé | Bibliothèque et URL vérifiées par Microsoft Graph le 15 juillet 2026 |

Les deux drive IDs live contiennent le segment `ywF` absent des valeurs actuellement versionnées dans `sharePointInventory.ts`. Les valeurs versionnées ne doivent donc pas être utilisées pour une reprise avant correction et test de lecture.

Le connecteur Graph disponible expose les bibliothèques mais pas le catalogue des listes, leurs colonnes ni un comptage récursif fiable par bibliothèque. La commande `m365 status --output json` n'a pas répondu avant expiration du délai local ; aucun export live n'a donc été exécuté et aucun volume indicatif n'est présenté comme réel.

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

Validations réellement observées :

- le nom du projet est le seul champ toujours marqué obligatoire par l'interface ;
- les autres obligations viennent du catalogue `Required` SharePoint, avec les limites de propagation décrites dans le dictionnaire ;
- les champs vides facultatifs sont omis du payload ;
- les nombres acceptent espaces et virgule décimale avant conversion ;
- les dates locales sont converties en ISO, avec minuit local pour une date sans heure ;
- aucune validation croisée n'empêche une fin avant un début, une durée sans unité, un montant sans devise ou un doublon de code/titre ;
- SharePoint constitue le dernier niveau de validation de type et de champ obligatoire ;
- aucune modification générale, suppression ou transition de statut n'est implémentée.

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

### 5.1 Règles de lecture du dictionnaire détaillé

Le code SPFx lit pour chaque colonne : libellé, `InternalName`, `StaticName`, `EntityPropertyName`, type, caractère masqué/lecture seule/obligatoire, multivaleur, lookup, choix et valeur par défaut. En l'absence du catalogue live, les mentions suivantes sont utilisées :

- **confirmé code** : nom interne ou comportement explicitement codé ;
- **attendu test** : type exercé par un test unitaire, mais pas prouvé sur la liste live ;
- **`? live`** : choix, défaut ou obligation impossible à établir sans le catalogue ;
- **déjà migré** : colonne Supabase et mapper présents pour la donnée ;
- **incomplet** : une cible existe, mais la source, la transformation ou la relation est partielle ;
- **absent** : aucune cible canonique n'existe ;
- **obsolète** : champ volontairement exclu ou mapping actuel à retirer/remplacer.

Le formulaire applique `required` aux champs texte, nombre, devise, date, URL, note et choix simple. Il ne le propage pas aux sélecteurs lookup, multichoix, booléens ni aux cases ROV/plongée. Une colonne requise peut donc n'être rejetée que par SharePoint au moment du POST. Cette lacune ne doit pas être reproduite : les contraintes cibles devront être validées par RPC/base et reflétées dans l'interface.

Les valeurs par défaut sont initialisées depuis `DefaultValue`. Deux surcharges SPFx existent : une identité juridique/adresse d'armateur codée dans l'application, qui doit devenir une donnée de configuration contrôlée, et `Voyage` pour la période d'extension automatique.

### 5.2 Champs métier Projets reconnus par SPFx

| Réf. | Libellé et nom interne/alias | Métadonnées source connues | Transformation et cible Supabase proposée | Section, dépendances et règles | Statut SeaPilot |
|---|---|---|---|---|---|
| P01 | Titre — `Title` | Text attendu ; choix n/a ; défaut `? live` ; requis `? live` | Extraire séparément code et libellé ; `projects.project_code`, `projects.title` ; conserver le titre source | Hors formulaire dynamique ; le nom saisi est obligatoire ; renommage post-création `P{ID+206} - nom` | Incomplet : `title`/`project_code` existent, extraction et allocation serveur absentes |
| P02 | 3. Affréteur — `_x0033__x002e_Affr_x00e9_teur` | Lookup confirmé code ; lookup cible/choix/défaut/requis `? live` | ID source vers `client_sharepoint_item_id`, résolution vers `client_id`, snapshot `client_name` | Identification ; dépend de `BBTM - Clients` ; création d'un client puis sélection automatique | Incomplet : relations prévues, alias réel absent du mapper |
| P03 | 2. Armateur et lieu des opérations — `_x0032__x002e_Armateuretlieudeso` | Note attendu test ; défaut SPFx codé ; requis `? live` | Texte contractuel/configuration, par exemple `project_contracts.owner_identity` | Identification ; présenté comme « Armateur » | Absent |
| P04 | 4. Navire — `Navire` ou alias numéroté commençant par `4` | Lookup attendu test ; lookup cible/défaut/requis `? live` | ID source vers `primary_vessel_sharepoint_item_id`, résolution `primary_vessel_id`, snapshot du nom | Identification ; dépend de `BBTM - Flotte` et des règles d'éligibilité | Incomplet : colonnes présentes, saisie SeaPilot encore libre |
| P05 | Contrat / Type de contrat — `Contrat`, `TypedeContrat` | Choice attendu test ; choix/défaut/requis `? live` | Valeur normalisée et contrainte, `projects.contract_type` | Identification ; le libellé devient « Type de contrat » | Absent |
| P06 | Statut — `Statut` | Choice attendu test ; choix/défaut/requis `? live` | Enumération/table de référence et transitions validées, `projects.status` | Identification ; ne pas reprendre les cinq valeurs SeaPilot codées en dur avant comparaison live | Incomplet : colonne présente, choix et transitions non contrôlés |
| P07 | 17. Affectation du navire limitée à — `_x0031_7_x002e_Affectationdunavi` | Note attendu test ; défaut/requis `? live` | Texte ou structure contractuelle validée, `project_contracts.vessel_assignment_limit` | Identification, carte Mission | Absent |
| P08 | 18.1 Navire support ROV — `_x0031_8_x002e_1Indiquersilenavi` | Choice attendu test ; UI convertit `Oui`/vide ; choix/défaut/requis `? live` | Normaliser en booléen nullable `projects.is_rov_support` tout en conservant la valeur source | Identification, carte Mission ; la case SPFx ignore `required` | Absent |
| P09 | 18.2 Navire support de plongée — `_x0031_8_x002e_2Naviresupportdep` | Choice attendu test ; UI convertit `Oui`/vide ; choix/défaut/requis `? live` | Normaliser en booléen nullable `projects.is_diving_support` | Identification, carte Mission ; la case SPFx ignore `required` | Absent |
| P10 | 5. Date Livraison / alias tableau `7. Date Livraison`, `DateLivraison`, `Delivery Date` | DateTime attendu test ; défaut/requis `? live` | Conserver date et heure si présentes, `projects.delivery_at` ; dériver la date pour les filtres | Planning/Livraison ; alimente SUPPLYTIME box 4 et tableau | Incomplet : `starts_on` existe mais le mapper actuel utilise un alias Planning non vérifié |
| P11 | 7. Port de Livraison — `PortLivraison` et alias de libellé | Text attendu test ; défaut/requis `? live` | `projects.delivery_port` | Planning/Livraison ; alimente SUPPLYTIME box 6 et tableau | Absent |
| P12 | 8.1 Port de restitution / alias tableau `9. Port de restitution`, `PortRestitution`, `Redelivery Port` | Text attendu test ; défaut/requis `? live` | `projects.redelivery_port` | Planning/Restitution ; alimente SUPPLYTIME box 7 et tableau | Absent |
| P13 | 9.1 Date début Affrètement — alias `DateDebutAffretement` | DateTime attendu test ; défaut/requis `? live` | `projects.charter_starts_at` ou date canonique validée | Planning/Livraison ; distincte de la date de livraison tant que les données ne prouvent pas leur équivalence | Incomplet : seule `starts_on` existe |
| P14 | 9.2 Date fin Affrètement / alias tableau `9. Date de restitution`, `DateRestitution`, `Redelivery Date` | DateTime attendu test ; défaut/requis `? live` | `projects.charter_ends_at`/`redelivery_at` selon catalogue | Planning/Restitution ; alimente la période SUPPLYTIME et le tableau | Incomplet : seule `ends_on` existe et le mapper emploie `Datefin` non vérifié |
| P15 | 10.1.1 Nombre de prolongations — alias `NombreProlongation` | Number attendu test ; défaut/requis `? live` | Entier non négatif `project_contracts.extension_count` | Planning/Prolongation ; groupe compact avec P16/P17 | Absent |
| P16 | 10.1.2 Durée de la prolongation — alias `DureeProlongation` | Number attendu test ; défaut/requis `? live` | Numérique non négatif `project_contracts.extension_duration` | Planning/Prolongation | Absent |
| P17 | 10.1.3 Unité de durée — alias `UniteDureeProlongation` | Choice attendu test ; choix/défaut/requis `? live` | Unité contrôlée `project_contracts.extension_unit` | Planning/Prolongation ; cohérence obligatoire avec P16 | Absent |
| P18 | 11.1 Période d'extension automatique — alias `PeriodeExtensionAuto` | Choice attendu test ; défaut SPFx `Voyage` ; choix/requis `? live` | Valeur contrôlée `project_contracts.auto_extension_period` | Planning/Prolongation | Absent |
| P19 | 11.2 Durée maximale de prolongation (jours) — alias `DureeMaxProlongation` | Number attendu test ; défaut/requis `? live` | Entier non négatif `project_contracts.max_extension_days` | Planning/Prolongation | Absent |
| P20 | 12.1 Forfait mobilisation — alias `ForfaitMobilisation` | Currency attendu test ; devise/défaut/requis `? live` | Montant + devise explicite, `project_contracts.mobilisation_fee_*` | Offre commerciale | Absent |
| P21 | 8. Forfait mobilisation — Obligations HSE — alias `ForfaitMobilisationHse` | Type/défaut/requis `? live` | Conserver en staging tant que la raison d'exclusion n'est pas validée | Classé `other` et volontairement absent du formulaire SPFx | Obsolète dans l'UI SPFx ; décision de conservation métier requise |
| P22 | 15. Forfait démobilisation — alias `ForfaitDemobilisation` | Currency attendu test ; devise/défaut/requis `? live` | Montant + devise, `project_contracts.demobilisation_fee_*` | Offre commerciale | Absent |
| P23 | Loyer d'affrètement — alias `LoyerAffretement` | Currency attendu test ; devise/défaut/requis `? live` | Montant/unité/devise, `project_contracts.charter_hire_*` | Offre commerciale ; peut alimenter SUPPLYTIME box 20 après règle explicite | Absent |
| P24 | 21. Loyer d'affrètement en prolongation — alias `LoyerProlongation` | Currency attendu test ; devise/défaut/requis `? live` | Montant/unité/devise, `project_contracts.extension_hire_*` | Offre commerciale ; peut alimenter SUPPLYTIME box 21 | Absent |
| P25 | 16. Zone d'opération — alias `ZoneOperation` | Text attendu test ; défaut/requis `? live` | `projects.operation_area` ou champ contractuel selon usages de filtre | Opérations ; alimente potentiellement SUPPLYTIME box 16 | Absent |
| P26 | 26. Période maximale d'audit — alias `PeriodeMaxAudit` | Note attendu test ; défaut/requis `? live` | Champ contractuel validé `project_contracts.max_audit_period` | Opérations dans le formulaire SPFx malgré son numéro SUPPLYTIME | Absent |
| P27 | Commentaires / `CommentaireInterne` | Note attendu test ; défaut/requis `? live` | Séparer description métier, note interne et clause ; `projects.description` ou audit dédié | Opérations | Incomplet : `description` existe mais fusionne actuellement plusieurs alias |
| P28 | Navire 2 — `Navire2`, `Navire_x0020_2` | Lookup attendu test ; lookup cible/défaut/requis `? live` | ID source, `secondary_vessel_id` et snapshot | Affiché dans tableau/SUPPLYTIME mais exclu du formulaire de création SPFx | Incomplet : colonnes présentes, saisie SeaPilot libre et ID non résolu à la création |

### 5.3 Colonnes contractuelles SUPPLYTIME reconnues par clé

SPFx recherche une colonne dont le libellé, nom interne, nom statique ou propriété d'entité correspond exactement à la clé normalisée ci-dessous. Le code ne prouve pas que ces 36 colonnes existent sur la liste live. Pour chaque ligne, le type, les choix, la valeur par défaut et le caractère obligatoire sont donc `? live`.

| Clé interne reconnue et libellé de l'aperçu | Transformation/cible proposée | Classement réel du formulaire SPFx | Règle métier | Statut SeaPilot |
|---|---|---|---|---|
| `box01_owners` — Owners / place of business | `project_contracts.supplytime_data.box01_owners` et identité armateur canonique | Non affiché (`other`) | P03 doit surcharger la zone lorsqu'elle est canonique | Absent |
| `box02_charterers` — Charterers / place of business | `supplytime_data.box02_charterers` et référence client | Offre commerciale par heuristique `charter` | Le client P02 reste la relation canonique | Absent |
| `box03_vessel` — Vessel name and IMO number | `supplytime_data.box03_vessel` | Opérations | Surchargé par P04/P28 dans l'aperçu | Absent |
| `box04_delivery_date` — Date of delivery | `supplytime_data.box04_delivery_date` | Non affiché (`other`) | Surchargé par P10 dans l'aperçu | Absent |
| `box05_cancelling_date` — Cancelling date and time | `supplytime_data.box05_cancelling_date` et éventuellement colonne typée | Non affiché (`other`) | Conserver date et heure ; ne pas confondre avec livraison | Absent |
| `box06_port_delivery` — Port/place of delivery | `supplytime_data.box06_port_delivery` | Non affiché (`other`) | Surchargé par P11 dans l'aperçu | Absent |
| `box07_delivery_range` — Redelivery range/place | `supplytime_data.box07_delivery_range` | Non affiché (`other`) | Surchargé par P12 dans l'aperçu | Absent |
| `box08_notice_delivery` — Notices/delivery options | `supplytime_data.box08_notice_delivery` | Non affiché (`other`) | Texte contractuel | Absent |
| `box09_period` — Period of hire | `supplytime_data.box09_period` | Non affiché (`other`) | Surchargé par la période P10/P14 affichée | Absent |
| `box10_extension` — Extension period/option | `supplytime_data.box10_extension` | Non affiché (`other`) | Peut être dérivé de P15 à P17 seulement après règle validée | Absent |
| `box11_continuation` — Further extension period | `supplytime_data.box11_continuation` | Non affiché (`other`) | Peut dépendre de P18/P19 | Absent |
| `box12_mobilisation` — Mobilisation fee | `supplytime_data.box12_mobilisation` | Offre commerciale via le libellé `fee` | Ne pas dupliquer P20 sans règle de priorité | Absent |
| `box13_early_termination` — Early termination | `supplytime_data.box13_early_termination` | Contrat SUPPLYTIME | Texte contractuel | Absent |
| `box14_bunker_delivery` — Bunkers delivery | `supplytime_data.box14_bunker_delivery` | Opérations | Texte carburant/opérations | Absent |
| `box15_declaration` — Owners declaration | `supplytime_data.box15_declaration` | Non affiché (`other`) | Texte contractuel | Absent |
| `box16_area_operation` — Area of operation | `supplytime_data.box16_area_operation` | Opérations | Ne pas dupliquer P25 sans règle de priorité | Absent |
| `box17_employment` — Employment of vessel | `supplytime_data.box17_employment` | Opérations | Surchargé par `Title` dans l'aperçu | Absent |
| `box18_delivery_hour` — Delivery hour/fuel | `supplytime_data.box18_delivery_hour` | Non affiché (`other`) | Conserver une éventuelle heure explicite | Absent |
| `box19_special_fuel` — Special provisions/fuel details | `supplytime_data.box19_special_fuel` | Opérations | Texte carburant/opérations | Absent |
| `box20_charter_hire` — Charter hire | `supplytime_data.box20_charter_hire` et montant typé P23 | Offre commerciale | Type Currency seulement exercé par test, non confirmé live | Absent |
| `box21_extension_hire` — Extension hire | `supplytime_data.box21_extension_hire` et montant typé P24 | Offre commerciale | Type/devise/unité à valider | Absent |
| `box22_invoice_remittance` — Invoice/remittance options | `supplytime_data.box22_invoice_remittance` | Offre commerciale | Texte de facturation | Absent |
| `box23_payment` — Payment details | `supplytime_data.box23_payment` | Offre commerciale | Donnée potentiellement sensible ; droits dédiés à envisager | Absent |
| `box24_account_group` — Owners account group | `supplytime_data.box24_account_group` | Offre commerciale | Ne pas y stocker de secret bancaire non nécessaire | Absent |
| `box25_internal_price` — Internal price | `supplytime_data.box25_internal_price` | Offre commerciale | Montant et visibilité à contrôler | Absent |
| `box26_max_price` — Maximum audit price | `supplytime_data.box26_max_price` | Offre commerciale | Distinct de P26 « période maximale d'audit » | Absent |
| `box27_war_risk` — War risks | `supplytime_data.box27_war_risk` | Contrat SUPPLYTIME | Texte contractuel | Absent |
| `box28_terror` — Terror risks | `supplytime_data.box28_terror` | Contrat SUPPLYTIME | Texte contractuel | Absent |
| `box29_notice_money` — Notice/money due | `supplytime_data.box29_notice_money` | Non affiché (`other`) | Texte contractuel/financier | Absent |
| `box30_cancellation_clause` — Cancellation clause | `supplytime_data.box30_cancellation_clause` | Contrat SUPPLYTIME | Texte contractuel | Absent |
| `box31_taxes` — Taxes | `supplytime_data.box31_taxes` | Offre commerciale, car la règle `taxes` précède la règle contrat | Décision d'interface à confirmer | Absent |
| `box32_other_law` — Other law/jurisdiction | `supplytime_data.box32_other_law` | Contrat SUPPLYTIME | Texte juridique | Absent |
| `box33_dispute_resolution` — Dispute resolution | `supplytime_data.box33_dispute_resolution` | Contrat SUPPLYTIME | Texte juridique | Absent |
| `box34_additional_clauses` — Additional clauses | `supplytime_data.box34_additional_clauses` | Contrat SUPPLYTIME | Type Note seulement exercé par test, non confirmé live | Absent |
| `signature_owners` — Owners signature | `supplytime_data.signature_owners` ou référence documentaire, jamais un secret | Contrat SUPPLYTIME | Déterminer si texte, nom ou simple emplacement de signature | Absent |
| `signature_charterers` — Charterers signature | `supplytime_data.signature_charterers` ou référence documentaire | Contrat SUPPLYTIME | Même décision que signature armateur | Absent |

La classification ci-dessus décrit le code SPFx tel qu'il fonctionne. Plusieurs boxes alimentent l'aperçu tout en étant classées `other` et donc invisibles dans l'assistant de création. La cible ne doit pas reproduire cet écart accidentel : toutes les clauses conservées devront avoir un parcours de consultation et de modification explicite.

### 5.4 Champs Clients

Seul `Title` est explicitement consommé comme libellé par SPFx. Les autres champs ci-dessous proviennent du mapping SeaPilot existant et constituent des hypothèses à vérifier, pas un catalogue live.

| Libellé et nom interne/alias | Métadonnées source | Transformation/cible | Interface et règles | Statut SeaPilot |
|---|---|---|---|---|
| Nom client — `Title` | Text attendu ; défaut/requis `? live` | Trim vers `clients.name`, provenance conservée | Formulaire client dynamique ; libellé de l'option affréteur | Déjà migré dans le modèle et le mapper ; données non importées |
| Code client — `CodeClient`, alias `Code`, `ClientCode` | Text supposé par migration ; défaut/requis `? live` | Normalisation vers `clients.code` | Unicité/règle métier non définie | Incomplet, alias non vérifiés |
| Email — `Email` | Text supposé ; défaut/requis `? live` | Validation email puis `clients.email` | Donnée personnelle ; exposition minimale | Incomplet, champ live non vérifié |
| Téléphone — `Telephone` | Text supposé ; défaut/requis `? live` | Normalisation légère vers `clients.phone` | Donnée personnelle | Incomplet, champ live non vérifié |
| Adresse — `Adresse` | Text supposé ; défaut/requis `? live` | `clients.address` | Ne pas confondre avec l'identité armateur P03 | Incomplet, champ live non vérifié |
| Ville — `Ville` | Text supposé ; défaut/requis `? live` | `clients.city` | Complément d'adresse | Incomplet, champ live non vérifié |
| Pays — `Pays` | Text supposé ; défaut/requis `? live` | Valeur contrôlée éventuelle, `clients.country` | Choix live à vérifier | Incomplet, champ live non vérifié |
| Actif — `Actif` | Boolean supposé ; défaut/requis `? live` | Boolean non nul, défaut cible `true` | Conditionne les options futures | Incomplet, champ live non vérifié |
| Toute autre colonne visible/modifiable | Catalogue inconnu | Staging puis décision explicite ; aucune suppression silencieuse | SPFx la rend automatiquement dans le formulaire | Absent jusqu'à extraction live |

Le formulaire Client reprend les mêmes conversions de type que Projets. Une fois créé, l'ID SharePoint du client est injecté dans le lookup affréteur du projet courant.

### 5.5 Champs Flotte utilisés par Projets

| Libellé et nom interne | Type attendu | Transformation/cible | Règle | Statut SeaPilot |
|---|---|---|---|---|
| ID — `Id`, `ID` | Counter/Number standard | `vessels.sharepoint_item_id`, puis relation projet | Doit être strictement positif | Déjà migré pour la flotte ; relation projet incomplète |
| Nom navire — `Title` | Text | Snapshot du nom + résolution `vessels.id` | Option triée en français | Déjà migré |
| Type d'unité — `Typedunit_x00e9_` | Choice/Text à confirmer | Champ type de `vessels` | Seule la valeur exacte `Navire` est éligible | Déjà migré ; choix live non revalidé |
| Date de sortie de flotte — `Datesortiedeflotte` | DateTime | Date canonique de sortie | Navire conservé si vide ou strictement postérieur à aujourd'hui ; une sortie le jour courant est exclue | Déjà migré ; règle réutilisée par Projets |

### 5.6 Métadonnées des deux bibliothèques documentaires

| Libellé et nom interne | Type/obligation connus | Transformation/cible | Règle | Statut SeaPilot |
|---|---|---|---|---|
| ID — `ID`, `Id` | Counter standard, obligatoire technique | `sharepoint_item_id`/`source_sharepoint_id` | Clé de rejeu avec le List ID non nul | Incomplet : colonnes présentes, List ID manquant |
| Identifiant unique — `UniqueId`, `GUID` | Guid standard | `sharepoint_unique_id` | Identité secondaire de contrôle | Incomplet : cible présente, mapper à vérifier |
| Nom fichier — `FileLeafRef` | File/Text standard ; obligatoire pour un fichier | `title` et futur `file_name` explicite | Ignorer les dossiers | Incomplet : mappé vers `title` seulement |
| Chemin — `FileRef`, `ServerRelativeUrl` | Text standard | `sharepoint_file_ref`/`folder_path` | Ne doit pas être réduit à `notes` | Incomplet : mapper actuel le met aussi dans `notes` |
| URL absolue — `EncodedAbsUrl`, Graph `webUrl` | URL/Text | `file_url` canonique SharePoint | Refuser les URL hors tenant/site autorisé | Déjà migré pour l'ouverture ; validation absente |
| Modifié — `Modified`, Graph `lastModifiedDateTime` | DateTime | `source_modified_at` | Reprise incrémentale et réconciliation | Incomplet |
| Type d'objet — `FSObjType`, `FileSystemObjectType`, facet Graph `folder`/`file` | Integer/facet standard | Champ de staging, pas de stockage métier requis | Importer uniquement les fichiers | Absent du filtre du mapper actuel |
| Type MIME/extension — `File_x0020_Type` ou facet Graph `file.mimeType` | Text | `mime_type`, `file_extension` | Métadonnée uniquement, aucun contenu binaire | Absent |
| Taille — `File_x0020_Size` ou facet Graph `size` | Number | `file_size_bytes` | Contrôle de réconciliation | Absent |
| Version — `ETag`, `eTag`, `cTag` | Text | `source_etag` | Détection de modification sans téléchargement | Absent |
| Projet lookup — `ProjetId`, alias `ProjectId`, `ProjetLookupId` | Lookup attendu ; requis `? live` | `project_sharepoint_item_id`, puis `project_id` | Résolution prioritaire par ID stable | Incomplet, champ live non vérifié |
| Projet libellé — `Projet`, `Project`, `ProjetLookupValue`, `ProjectTitle` | Lookup/Text attendu | Snapshot `project_title` | Repli seulement si ID/code absent | Incomplet |
| Numéro projet — `NumeroProjet`, `Num_x00e9_roProjet`, `ProjectCode`, `CodeProjet`, `Code` | Text attendu | `project_code` normalisé | Repli de résolution après ID | Incomplet, alias live non vérifiés |
| Catégorie | Champ live inconnu ou catégorie fixe par bibliothèque | `category_key` contrôlé | Valeur actuelle fixe `project_document`/`contract_document` | Incomplet |

Les tables actuelles ne possèdent pas encore toutes les colonnes de métadonnées recommandées. Aucune colonne ne doit contenir les octets du fichier.

### 5.7 Champs système SharePoint et traitement

| Nom interne | Traitement SPFx | Cible/traitement recommandé | Statut |
|---|---|---|---|
| `ID` | Lu pour l'identité et la numérotation | `sharepoint_item_id`, jamais PK métier | Déjà migré comme provenance |
| `Modified` | Lu et affichable | `source_modified_at` | Déjà migré |
| `Created` | Exclu du formulaire | `source_created_at` si nécessaire à l'historique | Absent |
| `Author` | Exclu du formulaire | Staging ou audit pseudonymisé selon besoin | Absent, ne pas importer sans finalité |
| `Editor` | Exclu du formulaire | Staging ou audit pseudonymisé selon besoin | Absent, ne pas importer sans finalité |
| `GUID` | Exclu du formulaire | `sharepoint_unique_id` | Incomplet |
| `Attachments` | Exclu du formulaire | Inventorier séparément ; fichier maintenu dans SharePoint | Absent |
| `ContentType` | Exclu du formulaire | `source_content_type` si utile au mapping | Absent |
| `FileSystemObjectType` | Exclu du formulaire | Filtre fichier/dossier pour les bibliothèques | Absent du contrôle actuel |
| `OData__UIVersionString` | Exclu du formulaire | Staging/version technique éventuelle | Obsolète pour le modèle métier |
| `ServerRedirectedEmbedUri` | Exclu du formulaire | Ignorer | Obsolète |
| `ServerRedirectedEmbedUrl` | Exclu du formulaire | Ignorer | Obsolète |
| `FieldValuesAsText` | Développé pour décoder les valeurs affichées | Utilisé pendant l'export, non stocké comme donnée canonique | Obsolète après transformation |

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

### 11.0 Autorisation du module SPFx

SPFx ne contient aucune matrice de rôles métier Projets. Le mot de passe partagé côté client masque le chargement mais n'est pas une autorisation serveur. Une fois ce contrôle franchi, les appels `SPHttpClient` s'exécutent avec l'identité Microsoft 365 courante et sont finalement autorisés ou refusés par les permissions des listes SharePoint.

Les boutons de création de projet, de création de client, d'actualisation et de diagnostic ne font l'objet d'aucun contrôle de rôle dans le composant. `projectsShowDiagnosticButton` et `projectsDiagnosticMode` sont des propriétés de WebPart, pas des droits. Le modèle cible ne doit donc pas chercher à reproduire des « rôles SPFx » inexistants ; il doit faire valider une matrice métier SeaPilot explicite.

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
$webUrl = 'https://bbtm668.sharepoint.com/sites/QHSE'
$sources = @(
  [pscustomobject]@{ Key = 'projects';  Kind = 'list';    Url = '/sites/QHSE/Lists/BBTM  Projets' },
  [pscustomobject]@{ Key = 'clients';   Kind = 'list';    Url = '/sites/QHSE/Lists/BBTM  Clients' },
  [pscustomobject]@{ Key = 'fleet';     Kind = 'list';    Url = '/sites/QHSE/Lists/BBTM  Flotte' },
  [pscustomobject]@{ Key = 'project-documents';  Kind = 'library'; Url = '/sites/QHSE/Documents Projets' },
  [pscustomobject]@{ Key = 'contract-documents'; Kind = 'library'; Url = '/sites/QHSE/Documents Contractuels' }
)

# GUID, titre, URL et ItemCount déclaratif de chaque source.
foreach ($source in $sources) {
  m365 spo list get `
    --webUrl $webUrl `
    --url $source.Url `
    --properties 'Id,Title,ItemCount,BaseTemplate,BaseType,LastItemModifiedDate' `
    --output json
}

# Catalogue exhaustif : Title, InternalName, StaticName, EntityPropertyName,
# TypeAsString, Required, Hidden, ReadOnlyField, Choices, DefaultValue,
# LookupList, LookupField et AllowMultipleValues sont notamment attendus.
foreach ($source in $sources) {
  m365 spo field list --webUrl $webUrl --listUrl $source.Url --output json
}

# Comptage exact paginé. ItemCount seul peut inclure les dossiers d'une bibliothèque.
function Get-AllSpoRows {
  param(
    [Parameter(Mandatory)] [string] $ListUrl,
    [Parameter(Mandatory)] [string] $Fields
  )

  $pageNumber = 0
  $allRows = @()
  do {
    $raw = m365 spo listitem list `
      --webUrl $webUrl `
      --listUrl $ListUrl `
      --fields $Fields `
      --pageSize 5000 `
      --pageNumber $pageNumber `
      --output json
    if ($LASTEXITCODE -ne 0) { throw "Échec de lecture de $ListUrl, page $pageNumber" }
    $batch = if ([string]::IsNullOrWhiteSpace($raw)) { @() } else { @($raw | ConvertFrom-Json) }
    $allRows += $batch
    $pageNumber += 1
  } while ($batch.Count -eq 5000)

  return $allRows
}

foreach ($source in $sources) {
  $fields = if ($source.Kind -eq 'library') {
    'ID,Title,Modified,UniqueId,FSObjType,FileLeafRef,FileRef,EncodedAbsUrl'
  } else {
    'ID,Title,Modified'
  }
  $rows = @(Get-AllSpoRows -ListUrl $source.Url -Fields $fields)
  $fileCount = if ($source.Kind -eq 'library') {
    @($rows | Where-Object { $_.FSObjType -eq 0 }).Count
  } else {
    $null
  }
  [pscustomobject]@{
    Source = $source.Key
    TotalItems = $rows.Count
    FilesOnly = $fileCount
  }
}
```

Si le chemin Clients à double espace échoue, répéter les trois lectures avec `/sites/QHSE/Lists/BBTM Clients`, puis conserver l'URL retournée par `spo list get`. Les sorties métier restent hors Git et doivent être stockées uniquement dans un emplacement local ignoré et protégé. Ne jamais copier une sortie brute dans ce document.

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

### 16.1 Critères d'acceptation des phases suivantes

| Phase | Critères d'acceptation minimaux avant arrêt de phase |
|---|---|
| 1 — Modèle cible et sécurité | Catalogue live des cinq sources archivé hors Git ; chaque champ a un mapping décidé ; migrations réversibles ; contraintes de code/date/relations ; audit et archivage ; RLS/RPC testées positivement et négativement pour chaque rôle ; séparation `projects`/`planning_projects` documentée ; aucune donnée métier importée |
| 2 — Export et import idempotent | Identifiants de site/liste/drive non nuls et vérifiés ; dry-run disponible ; rapport créé/mis à jour/inchangé/rejeté/ambigu ; aucun dossier importé comme fichier ; aucune suppression implicite ; second rejeu identique sans doublon ni mutation inattendue ; aucun binaire transféré hors SharePoint |
| 3 — Reprise des données | Volumes exacts source/cible réconciliés ; historiques et codes conservés ; dates et choix contrôlés ; clients/navires/documents liés ou explicitement signalés ; échantillons métier validés ; rejets corrigés ou acceptés par écrit ; sauvegarde et procédure de retour documentées |
| 4 — Parité fonctionnelle Projets | Liste, sélection, détail, création client/projet, modification, archivage, statuts, champs obligatoires et aperçu SUPPLYTIME couverts ; codes alloués côté serveur ; fichiers ouverts dans SharePoint ; aucune double écriture ; tests interface, requêtes et RLS verts |
| 5 — Intégrations | DPR, Achats et Plan d'action utilisent les IDs du catalogue sans perdre leurs snapshots historiques ; références orphelines/ambiguës mesurées ; Planning reste indépendant ; éventuel lien Planning ajouté uniquement sur preuve déterministe ; tests de non-régression verts |
| 6 — Bascule | Supabase déclaré source de vérité ; écritures SharePoint listes désactivées dans le parcours SeaPilot ; accès et secrets revus ; imports finaux rejouables ; monitoring et support prêts ; validation métier formelle ; déploiement production et procédure de retour vérifiés |

---

**Arrêt historique de phase 0 :** aucun code applicatif, schéma Supabase, import ou fichier SharePoint n'avait été modifié à cette étape. La mise à jour ci-dessous constitue désormais le point de transmission vers la phase 2.

## 17. Mise à jour de transmission — schéma livré en phase 1

Date de livraison : 15 juillet 2026.

Références :

- migration : `supabase/migrations/202607150006_projects_phase1_model.sql` ;
- tests : `supabase/tests/projects_phase1_model_test.sql` ;
- modèle détaillé et procédure : `docs/migration/projects-phase1-supabase-model.md`.

### 17.1 État effectif du dictionnaire cible

Les statuts « Absent » ou « Incomplet » des sections 5.2 et 5.3 décrivent SeaPilot avant la phase 1. Pour les phases suivantes, la matrice ci-dessous fait autorité sur le schéma effectivement livré.

| Groupe inventaire | Structure Supabase livrée | État après phase 1 |
|---|---|---|
| P01 identité | `projects.title`, `projects.project_code`, index unique normalisé par société | Modèle livré ; UI/import non migrés |
| P02 client/affréteur | `projects.client_id` + snapshots source ; `clients.company_id` | Relation composite même société livrée |
| P03 navire principal | `projects.primary_vessel_id` + snapshots source | Relation composite même société livrée |
| P04 propriétaire | `project_contracts.owner_identity` | Colonne typée livrée |
| P05 limite d'affectation | `project_contracts.vessel_assignment_limit` | Colonne typée livrée |
| P06–P09 prolongations | `extension_count`, `extension_duration`, `extension_unit`, `auto_extension_period`, `max_extension_days` | Colonnes et contrôles numériques livrés |
| P10–P14 dates/ports | `delivery_at`, `redelivery_at`, `charter_starts_at`, `charter_ends_at`, `delivery_port`, `redelivery_port` | Colonnes temporelles/textes et cohérence chronologique livrées |
| P15–P22 frais et options | frais de mobilisation/démobilisation + devise ; `is_rov_support`, `is_diving_support` | Colonnes typées livrées |
| P23–P24 loyers | `charter_hire`, `extension_hire`, `hire_currency`, `hire_unit` | Colonnes numériques/devise livrées |
| P25 zone d'opération | `projects.operation_area` | Colonne typée livrée |
| P26 audit maximum | `project_contracts.max_audit_period` | Colonne typée livrée |
| P27 type de contrat | `projects.contract_type` | Colonne texte livrée ; choix live à confirmer |
| P28 navire secondaire | `projects.secondary_vessel_id` + snapshots source | Relation composite même société livrée |
| 34 zones + 2 signatures SUPPLYTIME | `project_contracts.supplytime_data` versionné `supplytime-2017-v1` | JSON objet strict, clés fermées, valeurs texte/null, 1 Mio maximum |
| Valeurs source non mappées | `source_payload` sur clients, projets, contrats et documents | Trace JSON objet, non canonique et protégée |
| Documents Projets/Contractuels | IDs drive/item/liste, URL, chemin, nom, catégorie, taille, type MIME, extension, ETag/CTag, dates | Métadonnées livrées ; aucun contenu de fichier |
| Cycle de vie | `archived_at/by`, `created_by`, `updated_by` | Archivage logique et auteurs livrés |
| Audit | `project_change_log` | Journal append-only livré, payload brut et contacts client exclus |

Les valeurs de choix exactes pour les statuts, types de contrat, unités et champs SharePoint non confirmés ne sont volontairement pas inventées. Elles devront être ajoutées aux mappings après extraction du catalogue live, avant resserrement éventuel des contraintes.

### 17.2 Numérotation effectivement livrée

- `project_number_counters` possède un compteur par société et préfixe ;
- l'allocation utilise un verrou `FOR UPDATE` et un index unique normalisé ;
- les créations SeaPilot ignorent tout code proposé par le navigateur et reçoivent un code base-side ;
- les imports SharePoint conservent leur code historique et leurs identifiants source ;
- le plancher initial `207` traduit uniquement la règle `P{id+206}` et ne représente aucun volume réel ;
- après import historique et avant bascule, `projects_set_number_floor` doit recevoir le prochain numéro validé explicitement ; elle ne peut pas diminuer le compteur et n'utilise jamais `max(id)`.

### 17.3 Autorisations effectivement livrées

| Capacité Projets | Rôles après phase 1 |
|---|---|
| Lire clients, projets, contrats, documents et audit | `admin`, `direction`, société active uniquement |
| Créer/modifier clients, projets et contrats | `admin`, `direction`, société active uniquement |
| Écrire les métadonnées documentaires SharePoint | `admin` uniquement |
| Archiver un projet | `admin`, `direction`, via RPC |
| Régler le plancher de numérotation | `admin` uniquement |
| Réconcilier les liens SharePoint | `service_role` ou `admin` |
| Supprimer physiquement | aucun rôle authentifié |
| `armement`, `capitaine`, `marin` sur le catalogue | aucun accès tant qu'une extension n'est pas validée |

Les droits fonctionnels existants de DPR, Achats et Plan d'action sont préservés. Leurs RLS et leurs relations reçoivent uniquement l'isolation `company_id` nécessaire pour éviter un rattachement à un projet d'une autre société.

### 17.4 Décisions et non-décisions de phase 1

- `projects` et `planning_projects` restent séparés ; aucune colonne ni clé étrangère n'a été ajoutée au Planning.
- Les fichiers restent dans SharePoint ; aucun bucket Storage ni champ binaire n'a été créé.
- Les nouvelles créations de projets/clients ont `seapilot` comme provenance par défaut ; aucune double écriture SharePoint n'est introduite.
- Les identifiants SharePoint sont protégés contre la modification par un utilisateur authentifié.
- Les contraintes historiques sensibles sont `NOT VALID` : elles s'appliquent aux nouvelles lignes, puis seront validées après réconciliation en phase de reprise.
- Aucun enum de statut ou de type de contrat n'est créé sans catalogue live confirmé.
- Aucune donnée live n'a été importée pendant cette phase.

### 17.5 Contrôles de sortie de phase 1

- reconstruction locale complète de toutes les migrations ;
- 54 assertions pgTAP sur le schéma, le JSON, les RLS/RPC, les rôles et adhésions actives, l'isolation société, la provenance, l'audit, les documents, l'archivage et la numérotation ;
- lint Supabase local ;
- tests, lint et build applicatifs à consigner dans la PR de phase 1 ;
- vérification qu'aucun export métier, secret ou binaire SharePoint n'entre dans le diff.

### 17.6 Critères d'entrée de la phase 2

La phase 2 pourra traiter exclusivement l'export et l'import idempotent après :

1. extraction hors Git du catalogue live et des volumes réels des cinq sources ;
2. validation des noms internes, choix, obligations, devises et lookups encore inconnus ;
3. définition du rapport créé/mis à jour/inchangé/rejeté/ambigu ;
4. preuve qu'aucun dossier ni contenu binaire ne sera copié ;
5. stratégie explicite d'alignement du compteur après import des codes historiques ;
6. plan de validation des contraintes `NOT VALID` et des références DPR/Achats/Actions ;
7. maintien de l'absence de lien automatique avec `planning_projects`.

**Arrêt de phase 1 : le modèle et sa sécurité sont livrés ; aucune donnée live n'a été migrée et aucun fichier n'a quitté SharePoint.**

## 18. Mise à jour de transmission — consultation livrée en phase 3

Date de livraison : 15 juillet 2026.

Cette phase fait évoluer le module existant `src/features/projects` en lecture seule. Elle ne crée ni ne modifie aucun projet, client, contrat ou document et n'ajoute aucune migration Supabase.

### 18.1 Parité de consultation effectivement livrée

| Capacité inventoriée | Implémentation phase 3 | État |
|---|---|---|
| Liste et sélection | portefeuille trié, sélection explicite par bouton clavier, détail du premier projet visible par défaut | Livré |
| Recherche et filtres | recherche sans sensibilité aux accents ; filtres statut, client, navire et chevauchement de période | Livré |
| Indicateurs | projets actifs/affichés, documents projets/contractuels et clients représentés, recalculés selon les filtres | Livré |
| Identification | numéro, statut, type de contrat, affréteur, armateur, navires, limite d'affectation, supports ROV/plongée et coordonnées client | Livré selon le schéma de phase 1 |
| Planning | période historique, livraison/restitution, ports, début/fin d'affrètement et prolongations | Livré selon le schéma de phase 1 |
| Offre commerciale | mobilisation, démobilisation, loyer initial et loyer de prolongation avec devise/unité | Livré selon le schéma de phase 1 |
| Opérations | zone d'opération, période maximale d'audit, description et documents projets | Livré selon le schéma de phase 1 |
| Contrat SUPPLYTIME | aperçu textuel des 34 zones et deux signatures, groupé comme dans l'inventaire | Livré |
| Priorités SUPPLYTIME | les champs canoniques armateur, client, navires, livraison, ports, période, zone et emploi priment sur leur valeur JSON historique | Livré et testé |
| Documents | métadonnées Supabase uniquement ; ouverture du lien dans SharePoint ; aucun contenu téléchargé ou stocké par SeaPilot | Livré |
| Provenance | source, liste/item SharePoint et dernière modification source affichés lorsque disponibles | Livré |
| États asynchrones | chargement, jeu valide vide, filtres sans résultat, erreur principale avec nouvelle tentative et sources secondaires partielles distinctes | Livré et testé |
| Écriture | ancien formulaire simplifié et appel d'insertion retirés de l'interface Projets | Hors périmètre volontairement |

### 18.2 Contrat de lecture et performance

- le navigateur interroge uniquement les tables Supabase `projects`, `clients`, `project_contracts`, `project_documents` et `contract_documents` ;
- aucun appel SharePoint de liste, bibliothèque ou Graph n'est exécuté par l'écran ; seuls les liens de fichiers sont ouverts à la demande de l'utilisateur ;
- les cinq sources Supabase sont lancées en parallèle ; l'échec de `projects` produit un état d'erreur, tandis que chaque source secondaire en échec produit un avertissement de consultation partielle ;
- chaque table est parcourue par pagination keyset sur sa clé primaire `id`, par lots de 500, afin de ne pas subir la limite implicite d'une réponse PostgREST ;
- la liste rend au plus 40 projets par page, diffère la recherche lors de la frappe et limite le travail de rendu des lignes hors écran ;
- les RLS livrées en phase 1 restent l'autorité de sécurité. L'interface ne tente pas de compenser un refus RLS par une liste vide.

### 18.3 Couverture automatisée

Les tests de la phase couvrent :

- mapping complet du projet, du contrat typé, de la provenance et du JSON SUPPLYTIME ;
- filtrage texte/structuré et chevauchement de périodes ;
- conservation ou repli de la sélection ;
- priorité des valeurs canoniques et présence des 36 emplacements SUPPLYTIME ;
- sélection accessible, cinq sections de détail, liens SharePoint et absence de formulaire d'écriture ;
- erreur de la source principale, source secondaire partielle et jeu Supabase réellement vide ;
- intégration de la route `/modules/projects` dans l'application.

### 18.4 Risques et validations restant ouverts

- la validation métier visuelle sur les données réelles reste nécessaire après réconciliation de la phase 2 ;
- les choix live de statut/type/unité non confirmés restent affichés tels qu'importés et ne sont pas inventés par l'interface ;
- les valeurs absentes sont signalées « Non renseigné » ; elles ne sont pas dérivées lorsque l'inventaire n'a pas validé une règle de priorité ;
- un document sans URL reste visible avec « Lien SharePoint indisponible » et doit être corrigé par la réconciliation, sans téléchargement de secours ;
- l'accès reste limité par les RLS phase 1 à `admin` et `direction` tant qu'une extension de matrice de rôles n'est pas validée ;
- l'aperçu est un rendu structuré des zones SUPPLYTIME, pas une reproduction graphique éditable des deux pages du formulaire papier.

**Arrêt de phase 3 : la parité de consultation prévue pour cette phase est livrée dans le code et couverte par les tests ; aucune écriture métier, migration de données ou copie de fichier n'a été ajoutée.**

## 19. Mise à jour de transmission — écritures métier livrées en phase 4

Date de livraison : 16 juillet 2026.

Références :

- migration : `supabase/migrations/202607160001_projects_phase4_business_writes.sql` ;
- tests de base : `supabase/tests/projects_phase4_business_writes_test.sql` ;
- contrat détaillé : `docs/migration/projects-phase4-business-writes.md` ;
- interface : `src/features/projects/ProjectEditors.tsx` et `projectMutations.ts`.

### 19.1 Matrice de parité après phase 4

| Capacité phase 0 | État effectif phase 4 |
|---|---|
| Création/modification projet | Livrée par formulaire SeaPilot et RPC atomique `projects_save` |
| Création/modification client | Livrée pour `admin`/`direction` par `clients_save` |
| Sélection navires | Référentiel `vessels`, société active et disponibilité vérifiées en base |
| Champs obligatoires/défauts | Titre/nom obligatoires ; dates, devises, prolongations et relations validées ; défauts confirmés uniquement |
| Sections SPFx adaptées | Identification, Planning, Offre commerciale, Opérations, Contrat SUPPLYTIME |
| Données commerciales/contractuelles | Colonnes typées et 36 zones SUPPLYTIME enregistrées avec le projet dans une transaction |
| Numéro `P…` | Alloué uniquement en base sous verrou ; collision testée ; aucun `max(id)` navigateur |
| Archivage | Transition logique par RPC ; aucune suppression physique authentifiée |
| Autorisations | `admin`/`direction` écrivent ; refus serveur des autres rôles et sociétés |
| Journalisation | Triggers d'audit existants conservés ; contacts et payload brut exclus |
| Provenance importée | Codes/IDs/payload/source SharePoint préservés lors des modifications |
| Modules dépendants | DPR, Achats et Plan d'action sélectionnent `projects.id` via catalogue RPC et conservent leurs snapshots |
| Planning | Toujours séparé, sans relation inventée ni duplication |

### 19.2 Décisions effectives

- les trois tables métier centrales ne sont plus insérables/modifiables directement par `authenticated` ;
- le contrat et le projet sont enregistrés atomiquement, avec verrou optimiste `updated_at` ;
- les choix non confirmés restent dynamiques à partir de Supabase ; aucun enum spéculatif n'est ajouté ;
- `armement` peut lire le catalogue minimal pour ses écritures DPR/Achats/Actions, sans accéder aux clients, contrats ou informations commerciales ;
- les créations des modules dépendants stockent la FK canonique et les snapshots historiques, sans dupliquer le catalogue ;
- aucun appel de liste SharePoint, transfert de fichier ou double écriture n'est introduit.

### 19.3 Critères de sortie vérifiés

- migrations locales rejouables et tests phase 1 + phase 4 verts ;
- succès, validations, refus de rôles/sociétés, conflit optimiste, collision de numéro, archivage et audit testés ;
- erreurs réseau et payload RPC couverts côté TypeScript/composants ;
- build production et lint applicatif exécutés ;
- documentation de schéma, workflows et risques mise à jour.

**Arrêt de phase 4 : les workflows d'écriture Projets sont validés. Les travaux de bascule ou de réconciliation supplémentaires restent hors de cette phase.**

## 20. Mise à jour de transmission — intégration documentaire livrée en phase 5

Date de livraison : 16 juillet 2026.

Références :

- contrat de frontière : `docs/migration/projects-phase5-sharepoint-documents.md` ;
- migration : `supabase/migrations/202607160002_projects_phase5_sharepoint_documents.sql` ;
- interface : `src/features/projects/projectDocuments.ts` et `ProjectsPage.tsx` ;
- rafraîchissement : `npm run refresh:sharepoint:project-documents`.

### 20.1 Parité documentaire effective

| Exigence | État effectif phase 5 |
|---|---|
| Source de consultation | Métadonnées lues uniquement dans Supabase |
| Ouverture | Lien explicite vers l’URL SharePoint d’origine, sans transformation publique |
| Frontière fichiers | Contenu conservé exclusivement dans SharePoint ; aucun bucket ou transfert binaire |
| URL absente/invalide | Document visible, lien bloqué et anomalie explicite |
| Déplacé/supprimé | Aide utilisateur et rafraîchissement des métadonnées ; aucun téléchargement de contrôle |
| Authentification Microsoft 365 | Connexion demandée directement par SharePoint ; aucun contournement SeaPilot |
| Document non résolu | Comptage global et signalement sur la fiche lorsqu’il est associé par instantané historique |
| Doublon | Identité drive/item protégée en base ; doublons historiques masqués et comptés dans l’interface |
| Rafraîchissement | Export récursif des métadonnées, dry-run par défaut, upsert explicite avec `--apply`, sans suppression |
| Lien de dossier pour dépôt | Non livré : besoin, dossier canonique et autorisations non confirmés par l’inventaire |

### 20.2 Décisions effectives

- seules les URL HTTPS de `bbtm668.sharepoint.com/sites/QHSE` deviennent cliquables ;
- le navigateur n’appelle ni Graph ni les listes SharePoint et ne sonde pas le contenu ;
- les bibliothèques sans List ID configuré sont exportées par leur titre avec une requête CAML récursive ;
- les dossiers sont exclus avant l’upsert ;
- l’identité d’import des fichiers est `(sharepoint_drive_id, sharepoint_drive_item_id)` ;
- l’export temporaire reste dans `.data/`, déjà exclu de Git ;
- aucune purge, aucun prune, aucune suppression implicite et aucune copie binaire ne sont introduits.

### 20.3 Critères de sortie

- tests des liens, anomalies, doublons, relations orphelines, mappings et export récursif réussis ;
- migration additive et test d’idempotence Supabase fournis ;
- lint, suite automatisée et build production exécutés ;
- frontière et procédure opérateur documentées.

**Arrêt de phase 5 : la consultation et le rafraîchissement des métadonnées documentaires sont livrés ; les fichiers restent dans SharePoint et aucun lien de dépôt non validé n’est ajouté.**

## 21. Transmission phase 6 — recette finale et bascule

La recette du 16 juillet 2026 conclut à un **NO-GO**. Le projet Supabase lié est bien `SeaPilot`, mais il contient 0 projet, 0 client, 0 document projet et 0 document contractuel. Les 14 navires et 18 `planning_projects` présents ne constituent pas le catalogue Projets. La session Microsoft 365 CLI est déconnectée ; les volumes live des cinq sources ne peuvent donc pas être établis ni rapprochés.

Les contrôles d’intégrité à zéro ne sont pas une preuve lorsque les tables sont vides. La migration ne sera terminée qu’après l’export live, un dry-run, deux imports identiques, le rapprochement des volumes et anomalies, l’alignement explicite du compteur et une validation métier des cinq rôles.

Contrôles livrés :

- `supabase/validation/projects_phase6_reconciliation.sql` — volumes et anomalies agrégés sans donnée métier ;
- `supabase/validation/projects_phase6_security.sql` — RLS, privilèges, RPC et frontière Storage ;
- `supabase/tests/projects_phase6_role_matrix_test.sql` — 36 assertions sur Admin, Direction, Armement, Capitaine et Marin ;
- `supabase/migrations/202607160003_projects_phase6_security_hardening.sql` — révocation explicite des privilèges `anon`/`public` du domaine ;
- `docs/migration/projects-cutover-runbook.md` — import/rejeu, contrôles, retour arrière et responsabilités ;
- `docs/migration/projects-phase6-final-acceptance.md` — preuves et conditions de levée du No-Go.

Le site et les deux drives SharePoint attendus sont confirmés, sans déplacement de fichier. Le rafraîchissement reste idempotent, sans téléchargement, purge ou prune. Le parcours Windows de l’exporteur a été corrigé pour transmettre les requêtes CAML sans interprétation par `cmd.exe` ; sans session Microsoft 365, il s’arrête désormais explicitement avant tout export.

**Arrêt de phase 6 : sécurité durcie et recette automatisable fournie ; bascule non autorisée tant que la réconciliation live et la validation métier ne sont pas achevées.**

## 22. Complément validé — offres, contrats et exécutions multiples

Le besoin métier confirmé le 16 juillet 2026 lève l'ambiguïté sur la relation Planning : un projet catalogue peut être exécuté plusieurs fois. Les deux modèles restent séparés, mais `planning_projects.catalog_project_id` fournit désormais un lien explicite, optionnel et protégé par la société. Il n'est jamais déduit d'un titre historique.

Éléments effectivement livrés :

- action « Nouvelle opération » sur la fiche projet, réservée à Admin et Direction ;
- RPC créant une nouvelle occurrence à chaque appel, avec contrôles base sur projet, société, navire et dates ;
- liste de toutes les occurrences rattachées dans la section Planning ;
- génération locale d'une offre PDF structurée selon les rubriques historiques SharePoint ;
- génération du contrat PDF sur les deux modèles SUPPLYTIME strictement repris du SPFx, avec les 36 positions d'origine ;
- liens vers les bibliothèques SharePoint pour déposer la version validée, sans stockage de binaire dans SeaPilot ;
- correction du fond opaque et du contraste des fenêtres de création/modification.

L'absence de modèle d'offre vierge dans le dépôt SPFx est documentée dans `docs/migration/projects-offers-planning.md`. L'offre générée reprend les rubriques d'un document historique de la bibliothèque contractuelle sans embarquer ce document ni ses données dans Git.

Le NO-GO de réconciliation live de la section 21 n'est pas annulé par ce complément : les fonctionnalités peuvent être déployées, mais la migration des données historiques reste à réconcilier avant de déclarer la bascule métier complète.

## 23. Audit live et reprise du 21 juillet 2026

Une session Microsoft 365 authentifiée a permis de lever les inconnues de la phase 0. L’audit porte sur le site `https://bbtm668.sharepoint.com/sites/QHSE/` et sur le schéma Supabase lié.

| Source | Identifiant live | Volume exporté | Cible Supabase |
|---|---|---:|---|
| `BBTM - Clients` | `eacbc0c3-1028-44bf-975b-ed50f762943d` | 7 | `clients` |
| `BBTM - Flotte` | `543b9f00-aed2-489a-808a-7b64cc835a83` | 15, dont 1 ligne vide | `vessels` : 14 lignes importables |
| `Remorqué` | `585151b0-190c-4634-b534-74aac6cd8400` | 1 | `towage_options` |
| `BBTM - Projets` | `6abf8928-acfd-47ec-a848-29e4071249fc` | 28 | `projects` et `project_contracts` |
| `Documents Projets` | liste `7559dfae-5ab9-4616-bb63-97819c606365` | 0 | `project_documents` |
| `Documents Contractuels` | liste `27475196-8f56-4c61-893f-cb49d17ddca5` | 16 fichiers | `contract_documents` |

Constats de schéma : les tables principales et leurs colonnes canoniques existaient, mais sept champs clients observés en production n’étaient pas typés et la table de lookup `towage_options` n’existait pas. Les deux identifiants de drive documentaires versionnés avaient aussi perdu le segment `ywF`. La migration `202607210001_projects_sharepoint_live_import.sql` corrige ces écarts, enregistre les identités live et conserve chaque ligne source complète dans `source_payload`.

Les titres historiques `Pnnn - Libellé` sont séparés en code et libellé. Les onze projets sans code historique reçoivent un code de traçabilité `SP-<SharePoint ID>` ; ils ne consomment pas la séquence `P`. Le compteur `P` est relevé automatiquement au-dessus du plus grand code historique valide pendant la synchronisation des contrats.
