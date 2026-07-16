# Projets — modèle Supabase livré en phase 1

Date : 15 juillet 2026

Migration : `supabase/migrations/202607150006_projects_phase1_model.sql`

Tests : `supabase/tests/projects_phase1_model_test.sql`

## 1. Périmètre et résultat

Cette phase livre uniquement le modèle de données et sa sécurité. Elle n'importe aucune donnée SharePoint, ne modifie pas l'interface React et ne copie aucun fichier.

L'architecture obtenue est la suivante :

- Supabase porte les clients, les projets, les relations, les champs métier, les clauses contractuelles, les statuts libres hérités, les métadonnées documentaires et l'audit ;
- SharePoint reste l'unique stockage physique des fichiers ;
- les documents Supabase ne contiennent que des identifiants, chemins, URL et métadonnées SharePoint ;
- `projects` reste le catalogue commercial/contractuel ;
- `planning_projects` reste le modèle opérationnel du Planning, sans clé étrangère ni rapprochement ajouté en phase 1.

Les migrations sont additives. Les contraintes susceptibles de rencontrer des lignes historiques non encore réconciliées sont créées `NOT VALID` : elles protègent immédiatement les nouvelles écritures sans supprimer ni réécrire implicitement l'historique.

## 2. Modèle multi-société et relations

`company_id` est ajouté et rendu obligatoire sur :

- `clients` ;
- `projects` ;
- `project_documents` et `contract_documents` ;
- `dpr_items` et `dpr_archives` ;
- `purchase_requests` ;
- `action_items` et `action_documents`.

Les lignes préexistantes sont rattachées à la société initiale `bbtm`, conformément au modèle multi-société déjà livré par le Planning. Il s'agit d'une mise à niveau de gouvernance, pas d'un import métier.

Des clés étrangères composites `(id, company_id)` empêchent un projet de référencer un client ou un navire d'une autre société. Le même contrôle s'applique aux documents et aux références DPR, Achats et Plan d'action. Leurs résolveurs SharePoint conservent l'ordre identifiant source, code, titre, mais n'acceptent désormais que des correspondances de la même société.

Les index de clés étrangères comprennent toujours `company_id` afin de servir les RLS et les jointures tenant-projet.

## 3. Colonnes métier typées

### 3.1 `clients`

Le modèle existant est conservé. S'ajoutent :

- `company_id` ;
- `source_payload jsonb` pour la trace source non canonique ;
- `archived_at`, `archived_by` ;
- `created_by`, `updated_by`.

Les contacts (`email`, `phone`, `address`) restent typés dans la ligne client, mais sont volontairement retirés des instantanés d'audit pour éviter une duplication de données personnelles.

### 3.2 `projects`

Les colonnes stables et interrogées sont typées :

| Domaine | Colonnes |
|---|---|
| Tenant et relations | `company_id`, `client_id`, `primary_vessel_id`, `secondary_vessel_id` |
| Livraison/restitution | `delivery_at`, `redelivery_at`, `delivery_port`, `redelivery_port` |
| Affrètement | `charter_starts_at`, `charter_ends_at`, `contract_type` |
| Opérations | `operation_area`, `is_rov_support`, `is_diving_support` |
| Cycle de vie | `archived_at`, `archived_by`, `created_by`, `updated_by` |
| Traçabilité | colonnes SharePoint existantes et `source_payload` |

Les dates de restitution ne peuvent pas précéder la livraison, et la fin d'affrètement ne peut pas précéder son début. Deux navires liés ne peuvent pas être identiques. Ces contrôles sont `NOT VALID` pour préserver un éventuel historique existant jusqu'à sa réconciliation.

Les listes exactes de choix SharePoint pour `status` et `contract_type` n'étant pas matérialisées dans l'inventaire validé, la phase 1 ne fabrique pas d'énumération. Ces valeurs restent du texte typé non structuré jusqu'à la collecte du catalogue live ; l'import devra produire les choix observés et les anomalies avant tout resserrement de contrainte.

## 4. Contrat et SUPPLYTIME

`project_contracts` est un sous-modèle un-à-un relié à `projects` dans la même société.

Les valeurs stables utilisées par l'interface, les filtres ou les règles sont des colonnes :

- identité armateur et limite d'affectation du navire ;
- nombre, durée et unité de prolongation ;
- période de prolongation automatique et maximum en jours ;
- frais de mobilisation/démobilisation, montant et devise ISO à trois lettres ;
- loyers normal et prolongé, montant, devise et unité ;
- période maximale d'audit ;
- version du formulaire, provenance, archivage et auteurs.

Les montants sont des `numeric(14,2)` non négatifs. Une devise est obligatoire dès qu'un montant correspondant est présent.

### 4.1 Schéma JSON `supplytime-2017-v1`

`supplytime_data jsonb` est réservé aux textes contractuels historiques qui n'ont pas de règle relationnelle ou analytique stable. La fonction `is_valid_supplytime_data` impose :

- un objet JSON, jamais un tableau ni une valeur scalaire ;
- une taille maximale de 1 Mio ;
- aucune clé inconnue ;
- aucune structure imbriquée ;
- une valeur chaîne ou `null` pour chaque clé.

Clés autorisées :

```text
box01_owners
box02_charterers
box03_vessel
box04_delivery_date
box05_cancelling_date
box06_port_delivery
box07_delivery_range
box08_notice_delivery
box09_period
box10_extension
box11_continuation
box12_mobilisation
box13_early_termination
box14_bunker_delivery
box15_declaration
box16_area_operation
box17_employment
box18_delivery_hour
box19_special_fuel
box20_charter_hire
box21_extension_hire
box22_invoice_remittance
box23_payment
box24_account_group
box25_internal_price
box26_max_price
box27_war_risk
box28_terror
box29_notice_money
box30_cancellation_clause
box31_taxes
box32_other_law
box33_dispute_resolution
box34_additional_clauses
signature_owners
signature_charterers
```

Aucun index GIN n'est créé : l'inventaire ne décrit pas de recherche par clause libre. Indexer l'objet complet augmenterait le coût d'écriture sans requête prouvée. Si une clause devient filtrable, elle devra d'abord devenir une colonne typée ou recevoir un index d'expression ciblé.

`source_payload` est un second JSON distinct, limité à un objet de 1 Mio. Il conserve les valeurs SharePoint non mappées pour l'audit de reprise. Il n'est pas modifiable par un utilisateur authentifié et ne remplace jamais les colonnes canoniques.

## 5. Numérotation des projets

La numérotation est entièrement côté base :

1. `project_number_counters` possède une ligne par `(company_id, prefix)` ;
2. `allocate_next_project_code` verrouille cette ligne avec `FOR UPDATE` dans la transaction ;
3. le compteur est incrémenté avant retour ;
4. un index unique sur `(company_id, normalize_project_code(project_code))` protège contre toute collision résiduelle de casse ou d'espacement ;
5. un trigger impose l'allocation pour toute création non SharePoint, même si le navigateur transmet un code manuel ;
6. un import SharePoint conserve son code historique et doit fournir ses identifiants de provenance.

Le plancher initial est `207`, correspondant à la règle historique `id SharePoint + 206` pour le premier élément. Il ne constitue pas une mesure du volume réel. Avant la bascule, l'import validé doit appeler `projects_set_number_floor(<prochain_numéro_explicitement_validé>)`. Cette RPC admin ne peut qu'augmenter le compteur et ne calcule jamais `max(id)`.

Le format d'affichage `P{numéro} - nom` est obtenu à partir de `project_code` et `title`; le stockage ne concatène pas le nom dans le code stable.

## 6. Provenance et documents SharePoint

Les identifiants historiques existants sont conservés. Les tables de documents ajoutent :

- `sharepoint_drive_id`, `sharepoint_drive_item_id` ;
- `file_name`, `folder_path`, `mime_type`, `file_extension`, `file_size_bytes` ;
- `source_etag`, `source_ctag`, `source_created_at`, `source_modified_at` ;
- URL et chemins SharePoint existants ;
- `source_payload`, `created_by`, `updated_by`.

Une identité `(drive_id, drive_item_id)` non nulle est unique. Les identités `(list_id, item_id)` existantes restent uniques. Les nouvelles métadonnées SharePoint doivent fournir une identité de drive ou de liste et une URL/un chemin exploitable. `is_folder` doit être faux : un dossier n'est jamais importé comme fichier.

Il n'existe aucune colonne binaire, aucun bucket Supabase Storage et aucune logique de téléchargement dans cette migration. SeaPilot continuera à ouvrir l'URL SharePoint.

## 7. Audit et immutabilité

`project_change_log` journalise les insertions, modifications et suppressions techniques des tables :

- `clients` ;
- `projects` ;
- `project_contracts` ;
- `project_documents` ;
- `contract_documents`.

Chaque entrée porte société, type et ID d'entité, action, auteur, heure, transaction et instantanés avant/après. Les `source_payload` sont exclus de l'audit ; email, téléphone et adresse client le sont également.

Pour les utilisateurs authentifiés, un trigger interdit la modification de `company_id`, `project_code`, de la provenance SharePoint, des ETag/CTag et des payloads source. Les imports techniques utilisent `service_role`.

## 8. RLS, privilèges et RPC

Matrice livrée :

| Capacité | `admin` | `direction` | `armement` | `capitaine`/`marin` |
|---|---:|---:|---:|---:|
| Lire clients/projets/contrats/documents/audit | Oui | Oui | Non | Non |
| Créer/modifier clients/projets/contrats | Oui | Oui | Non | Non |
| Écrire les métadonnées documentaires SharePoint | Oui | Non | Non | Non |
| Archiver un projet | Oui | Oui | Non | Non |
| Régler le plancher de numérotation | Oui | Non | Non | Non |
| Supprimer physiquement une ligne du domaine | Non | Non | Non | Non |
| Réconcilier les relations SharePoint | Oui | Non | Non | Non |

Toutes les politiques exigent en plus l'appartenance à la société active. Les tables de compteur n'exposent aucune politique aux utilisateurs ; l'accès passe par une RPC `security definer` autorisée explicitement.

RPC livrées :

- `projects_create` : création typée et allocation atomique du code ;
- `projects_archive` : archivage logique ;
- `projects_set_supplytime` : upsert du JSON SUPPLYTIME validé ;
- `projects_set_number_floor` : alignement monotone admin avant bascule ;
- résolveurs SharePoint existants : restreints à `service_role` ou `admin`, avec égalité de société obligatoire.

Les politiques DPR, Achats et Plan d'action conservent leurs rôles fonctionnels antérieurs. Seule l'isolation par société est ajoutée afin de ne pas régresser ces modules.

## 9. Validation exécutée

Commandes de référence :

```powershell
supabase db reset --local
supabase test db --local supabase/tests/projects_phase1_model_test.sql
supabase db lint --local --level warning
npm test
npm run lint
npm run build
```

Le test pgTAP couvre 54 assertions : existence et typage, clés/index, validation JSON, verrou de numérotation, monotonie du compteur, droits positifs/négatifs par rôle, adhésion active, isolation inter-société, interdiction de suppression, anti-usurpation et immutabilité de provenance, documents, audit et archivage.

## 10. Limites et transmission à la phase 2

La phase 2 devra rester limitée à l'export et à l'import idempotent. Avant toute bascule :

- collecter hors Git le catalogue live des cinq sources et les volumes réels ;
- confirmer les noms internes, choix, obligations et devises qui restent inconnus ;
- définir les transformations de chaque rejet plutôt que relâcher les contraintes ;
- importer les codes historiques puis fixer explicitement le plancher du compteur ;
- valider les contraintes `NOT VALID` seulement après rapport de réconciliation ;
- mesurer les relations DPR, Achats et Actions résolues, non résolues et ambiguës ;
- ne créer aucun lien avec `planning_projects` sans identifiant déterministe ;
- vérifier qu'un second import ne crée aucun doublon, aucune suppression et aucune copie de binaire.

**Arrêt de phase 1 : aucune donnée live n'a été importée et aucun fichier n'a quitté SharePoint.**
