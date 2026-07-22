# DPR — Consolidation des phases 3 à 6

Statut : implémenté et exécuté sur Supabase ; validation technique réussie, recette métier à signer

Date de revue : 22 juillet 2026

Projet Supabase : `szlvyrrmvdvhzixilymh`

Dépôt : `BBTM-Christophe-GIT/SeaPilot`

## 1. Décisions métier approuvées

- Supabase devient la source de référence de tous les nouveaux DPR.
- La date cible de bascule est le 31 août 2026 et reste ajustable.
- SharePoint reste actif et fonctionnel tant que la bascule n'est pas achevée. Aucune désactivation n'est planifiée à ce stade.
- Tous les utilisateurs autorisés consultent tous les DPR de leur compagnie.
- Le Marin peut créer un DPR et modifier uniquement ses propres brouillons jusqu'à leur soumission.
- Le Capitaine peut créer, modifier et valider tous les DPR de sa compagnie, y compris ceux dont il est l'auteur.
- Admin, Direction et Armement peuvent consulter, créer, modifier, valider et supprimer logiquement les DPR.
- La suppression est exclusivement logique.
- Un DPR validé est immuable. Toute correction nécessite une réouverture ou une nouvelle version tracée.
- L'émetteur est le prénom et le nom du profil authentifié qui crée le DPR. Cette valeur est déterminée par le serveur et n'est pas saisissable.
- Les PDF, photos et pièces jointes sont conservés sans limite métier de durée.
- Le document final du DPR est un PDF.
- La présentation du numéro est `DPR-<numéro chronologique>`.
- Le prix MGO est exprimé en `EUR HT/L`.

## 2. État du dépôt et de Supabase

Le dépôt `main` et la base déployée sont cohérents entre eux, mais ne couvrent pas la cible métier.

### 2.1 Modèle existant

La migration `202607020006_dpr_mgo.sql` crée seulement :

- `dpr_items`, table DPR monolithique ;
- `dpr_archives`, qui conserve surtout des liens SharePoint ;
- `mgo_prices`, sans isolation par compagnie.

Les tables cibles décrites dans ce document n'existent pas. Les trois tables existantes sont vides dans le projet Supabase audité.

### 2.2 Client existant

Le client React :

- lit directement `dpr_items`, `dpr_archives` et `mgo_prices` ;
- insère directement dans `dpr_items` depuis le navigateur ;
- autorise la création uniquement à Admin, Direction et Armement ;
- ne représente ni brouillon, ni soumission, ni validation, ni version, ni suppression logique ;
- ouvre les archives avec leur URL SharePoint ;
- ne génère et ne stocke aucun PDF dans Supabase.

### 2.3 Tests existants

Deux tests DPR existent : filtrage/affichage et création par Armement. Ils ne couvrent pas la sécurité SQL, les cinq rôles, l'isolation inter-compagnies, les transitions d'état, le Storage ou l'audit.

## 3. Architecture cible de la phase 3

### 3.1 Principes structurants

- Toutes les tables métier portent un `company_id` obligatoire.
- Les références inter-tables utilisent des clés étrangères composites incluant `company_id` lorsque cela empêche une relation entre compagnies.
- Les nouveaux DPR natifs ne sont jamais stockés sous forme de document JSON principal.
- Le JSON source brut est réservé à la traçabilité des imports SharePoint.
- Les mesures utilisent `numeric`, jamais un nombre flottant.
- Les heures métier utilisent `timestamptz` lorsque la date et l'heure ont un sens opérationnel.
- Les fichiers sont privés et leur chemin est construit côté serveur.
- `dpr_items` et `dpr_archives` restent temporairement des tables de staging/compatibilité ; elles ne constituent pas le futur modèle opérationnel.

### 3.2 `dpr_reports`

Champs minimaux :

- `id bigint generated always as identity` ;
- `company_id bigint not null` ;
- `dpr_number bigint null` pendant le brouillon ;
- `status text not null` parmi `draft`, `submitted`, `validated`, `reopened` ;
- `report_date date not null` ;
- `project_id bigint null` ;
- `unlisted_project_name text null` ;
- `vessel_id bigint null` ;
- `issuer_user_id uuid not null` ;
- `issuer_name_snapshot text not null` ;
- `description text null` ;
- `qhse_note text null` ;
- `created_by`, `updated_by`, `submitted_by`, `validated_by` en UUID ;
- `created_at`, `updated_at`, `submitted_at`, `validated_at` en `timestamptz` ;
- `version_no integer not null default 1` ;
- `reopened_from_id bigint null` ;
- `reopened_at`, `reopened_by`, `reopen_reason` ;
- `deleted_at`, `deleted_by`, `deletion_reason` ;
- `migration_batch_id bigint null` ;
- identité SharePoint composée : site, liste/bibliothèque et identifiant d'élément.

Contraintes :

- unicité partielle `(company_id, dpr_number)` lorsque le numéro n'est pas nul ;
- numéro strictement positif ;
- projet référencé et projet libre mutuellement exclusifs ;
- `validated_by` et `validated_at` obligatoires pour un statut validé ;
- suppression logique cohérente : les trois champs de suppression sont renseignés ensemble ;
- version strictement positive ;
- l'émetteur et son snapshot deviennent immuables après création.

### 3.3 Numérotation

Recommandation à confirmer : attribuer le numéro à la première soumission, pas à la création du brouillon.

- Le brouillon possède immédiatement son identifiant technique.
- La soumission verrouille atomiquement le compteur de la compagnie.
- Le numéro attribué ne change plus et n'est jamais réutilisé.
- Les numéros historiques sont conservés.
- Le compteur des nouveaux DPR démarre à `max(dpr_number) + 1` après migration.
- Le nom du PDF est `DPR-<numéro> - <navire ou Sans navire> - <JJ-MM-AAAA>.pdf`.

Une table `dpr_number_counters(company_id, next_number)` ou une fonction transactionnelle équivalente doit éviter les collisions concurrentes.

### 3.4 Tables enfants

Toutes portent `company_id`, une clé étrangère vers `dpr_reports` et un index sur `dpr_id`.

| Table | Cardinalité | Contenu |
|---|---|---|
| `dpr_daily_metrics` | 0..1 par DPR | consommation en litres, fuel total à bord en litres |
| `dpr_crew_members` | 0..n | personne, fonction, bordée et ordre d'affichage |
| `dpr_other_people` | 0..n | personne référencée ou nom libre |
| `dpr_incidents` | 0..3 | catégories personne, matériel, environnement et niveau T0/T1/T2 |
| `dpr_hse_actions` | 0..1 | TBT, thème, visites, audits et compteurs HSE |
| `dpr_emergency_exercises` | 0..n | association avec le référentiel des exercices |
| `dpr_port_calls` | 0..n | accostage et appareillage en `timestamptz`, port éventuel |
| `dpr_port_call_reasons` | 0..n par escale | motifs multiples |
| `dpr_supplies` | 0..1 | fuel en m³, huile en litres, eau en m³ |
| `dpr_waste_records` | 0..n | type de déchet, quantité et unité contrôlée |
| `dpr_files` | 0..n | PDF, photos et pièces jointes avec versions et checksum |
| `dpr_audit_events` | 0..n | journal append-only du cycle de vie |

Toutes les quantités et tous les compteurs possèdent une contrainte `>= 0`. Les compteurs utilisent un entier. Si accostage et appareillage sont présents, `departure_at >= arrival_at`.

### 3.5 Référentiels

Référentiels existants à réutiliser :

- `companies` ;
- `projects` ;
- `vessels` ;
- `people` ;
- `profiles`, `company_memberships`, `roles` et `user_roles`.

Référentiels à ajouter :

- `emergency_exercise_types` ;
- `port_call_reason_types` ;
- `waste_types` avec unité autorisée.

Valeurs initiales des exercices d'urgence :

- Protection contre l'incendie ;
- Évacuation et abandon du navire ;
- Évacuation à bord ;
- Sauvetage en mer ;
- Perte de propulsion – manœuvrabilité ;
- Perte d'énergie ;
- Évacuation et prise en charge d'un blessé ;
- Lutte contre l'envahissement.

Valeurs initiales des motifs d'escale : Crew Change, Stand-by météo, Avarie et Stand-by. Ces deux champs sont à choix multiple.

### 3.6 Prix MGO

`mgo_prices` doit recevoir :

- `company_id not null` ;
- `effective_date date not null` ;
- `price_eur_ht_per_liter numeric(12,5) not null check (price >= 0)` ;
- une contrainte ou des colonnes constantes garantissant EUR, HT et litre ;
- l'identité SharePoint composée pour les lignes importées.

### 3.7 Fichiers et Storage

Buckets privés :

- `dpr-pdfs` pour les versions finales en `application/pdf` ;
- `dpr-photos` pour les originaux intégrés au PDF ;
- `dpr-attachments` pour les pièces jointes sources.

Le PDF reste le document final opposable. Les originaux peuvent être conservés séparément pour permettre la preuve, la régénération et la déduplication.

Chemin imposé :

`company/{company_id}/dpr/{dpr_id}/{file_id}-{filename}`

`dpr_files` contient au minimum :

- `company_id`, `dpr_id`, `file_kind` ;
- `bucket_name`, `object_path` et nom original ;
- `mime_type`, `size_bytes`, `sha256` ;
- `version_no`, `is_current` pour les PDF ;
- `created_by`, `created_at` ;
- les identifiants SharePoint de migration ;
- les champs de suppression logique éventuelle.

Contraintes :

- chemin unique ;
- une seule version PDF courante par DPR ;
- aucune mise à jour destructrice d'un PDF existant ;
- aucune suppression physique depuis l'application ;
- aucune limite métier supplémentaire de taille, sous réserve des limites techniques de la plateforme ;
- le client ne fournit jamais librement `bucket_name` ou `object_path`.

### 3.8 Migration

Tables :

- `migration_batches` ;
- `migration_records` ;
- `migration_errors` ;
- `migration_source_snapshots` pour le JSON brut, séparé des données opérationnelles.

Règles approuvées :

- 981 DPR source ;
- migrer les 325 PDF existants sans générer les 656 manquants ;
- exclure 15 HTML temporaires ;
- migrer et dédupliquer 10 pièces jointes ;
- autoriser deux DPR avec `vessel_id = NULL` et utiliser `Sans navire` dans le nom du PDF ;
- exclure le navire source 17 ;
- remapper le projet source 28 vers Hors Projet 52 ;
- conserver les 91 DPR sans projet avec `project_id = NULL` ;
- fusionner le doublon Tanguy SIMONET après réaffectation de ses relations ;
- importer sans correction automatique les dates des DPR source 603 et DPR-995 ;
- garantir l'idempotence par l'identité SharePoint site + liste/bibliothèque + élément.

## 4. Architecture cible de la phase 4

### 4.1 Matrice d'accès

| Action | Admin | Direction | Armement | Capitaine | Marin |
|---|---:|---:|---:|---:|---:|
| Consulter les DPR de sa compagnie | Oui | Oui | Oui | Oui | Oui |
| Créer un brouillon | Oui | Oui | Oui | Oui | Oui |
| Modifier un brouillon quelconque | Oui | Oui | Oui | Oui | Non |
| Modifier son propre brouillon | Oui | Oui | Oui | Oui | Oui |
| Soumettre | Oui | Oui | Oui | Oui | Oui, son brouillon |
| Valider | Oui | Oui | Oui | Oui, y compris le sien | Non |
| Réouvrir un DPR validé | Oui | Oui | Oui | Oui | Non |
| Supprimer logiquement | Oui | Oui | Oui | Non | Non |
| Supprimer physiquement | Non | Non | Non | Non | Non |

Toutes les actions restent limitées à `company_id`.

### 4.2 Politiques RLS

- Remplacer toute politique DPR `FOR ALL` par des politiques séparées.
- `SELECT` : appartenance active à la compagnie et rôle DPR autorisé.
- `INSERT` : rôle autorisé, `company_id` issu du profil actif et `created_by = auth.uid()`.
- `UPDATE draft` : rôles privilégiés ou Marin propriétaire du brouillon.
- Aucun `DELETE` applicatif sur les tables DPR et leurs fichiers.
- Le journal d'audit est en lecture selon rôle et sans `UPDATE`/`DELETE` applicatif.
- Les tables enfants vérifient à la fois leur `company_id` et celui du DPR parent.
- Les colonnes utilisées par les politiques RLS sont indexées.

Les transitions sensibles ne doivent pas reposer sur une mise à jour libre depuis le navigateur.

### 4.3 RPC de workflow

Fonctions transactionnelles attendues :

- `create_dpr_draft` ;
- `update_dpr_draft` ;
- `submit_dpr` ;
- `validate_dpr` ;
- `reopen_dpr` ;
- `soft_delete_dpr` ;
- `restore_dpr` ;
- `register_dpr_file` ;
- génération ou orchestration du PDF final.

Chaque fonction :

- déduit l'utilisateur depuis `auth.uid()` ;
- déduit la compagnie depuis l'appartenance active ;
- contrôle le rôle et l'état courant ;
- verrouille la ligne pour éviter les transitions concurrentes ;
- écrit l'événement d'audit dans la même transaction ;
- utilise un `search_path` sûr et des noms d'objets qualifiés ;
- n'accorde `EXECUTE` qu'aux rôles nécessaires.

Les fonctions `SECURITY DEFINER` sensibles doivent idéalement être déplacées hors du schéma exposé ou faire l'objet d'une révocation explicite pour `public` et `anon`.

### 4.4 Traçabilité

`dpr_audit_events` journalise au minimum :

- création ;
- modification ;
- soumission ;
- validation ;
- réouverture ;
- génération PDF ;
- téléchargement ou émission d'une URL signée si nécessaire ;
- suppression logique ;
- restauration ;
- import et correction post-migration.

Chaque événement contient : compagnie, DPR, version, type d'événement, utilisateur, horodatage, motif, métadonnées minimales et corrélation de requête. Le journal est append-only.

### 4.5 Accès Storage

- Aucun bucket DPR n'est public.
- L'upload passe par une fonction serveur qui construit le chemin.
- La lecture passe par une URL signée de courte durée après contrôle RLS métier.
- Les politiques `storage.objects` vérifient les segments compagnie et DPR ainsi que l'existence du `dpr_files` correspondant.
- Les utilisateurs ne peuvent ni écraser un objet existant, ni déplacer un objet, ni supprimer physiquement un fichier.
- Une tentative de fournir un chemin appartenant à une autre compagnie est rejetée, même si l'identifiant du fichier est connu.

### 4.6 Sauvegarde

La conservation indéfinie impose :

- une sauvegarde PostgreSQL avec restauration testée ;
- une sauvegarde séparée des objets Storage ;
- un inventaire périodique base ↔ Storage par checksum ;
- une politique de version et de rétention documentée ;
- un test réel de restauration avant la bascule.

Le plan Supabase Free actuel ne fournit pas de backup projet. La sauvegarde doit être résolue avant le chargement de production.

## 5. Index prioritaires

Sur `dpr_reports` :

- unique `(company_id, dpr_number)` lorsque le numéro n'est pas nul ;
- `(company_id, report_date desc)` ;
- `(company_id, vessel_id, report_date desc)` partiel si navire non nul ;
- `(company_id, project_id, report_date desc)` partiel si projet non nul ;
- `(company_id, status, report_date desc)` ;
- `(company_id, created_by, status)` pour les brouillons du Marin ;
- index sur `migration_batch_id` et l'identité SharePoint.

Sur les tables enfants : index sur `dpr_id`, `company_id`, les clés de référentiel et les colonnes consultées par la RLS. Sur `dpr_files` : index sur `sha256`, `(dpr_id, file_kind, version_no)` et index unique partiel du PDF courant.

## 6. Plan d'exécution proposé

### Lot 3A — Modèle central

- créer types, `dpr_reports`, compteur et contraintes ;
- créer tables enfants et référentiels ;
- mettre `mgo_prices` en conformité ;
- ajouter les index et tests de contraintes.

Critère de sortie : migrations reproductibles et tests SQL des contraintes verts.

### Lot 3B — Fichiers et migration

- créer les buckets privés et `dpr_files` ;
- créer les tables de suivi de migration ;
- préparer le mapping idempotent des 981 DPR et des 325 PDF ;
- exécuter une migration à blanc et réconcilier tous les volumes.

Critère de sortie : aucun objet orphelin, checksums vérifiés, règles d'exclusion et de remapping prouvées.

### Lot 4A — Workflow et RLS

- créer les RPC de cycle de vie ;
- remplacer les politiques `ALL` ;
- interdire le `DELETE` physique ;
- créer le journal append-only ;
- auditer les fonctions `SECURITY DEFINER`.

Critère de sortie : matrice d'accès positive et négative verte pour les cinq rôles et deux compagnies.

### Lot 4B — PDF, Storage et restauration

- générer le PDF côté serveur ;
- signer les accès ;
- tester l'isolation des chemins ;
- mettre en place la sauvegarde base + Storage ;
- exécuter un test de restauration.

Critère de sortie : génération/version/téléchargement/restauration PDF démontrés sans accès inter-compagnies.

### Lot 4C — Intégration de l'interface

- remplacer l'insertion directe dans `dpr_items` par les RPC ;
- implémenter brouillon, soumission, validation, réouverture et suppression logique ;
- afficher l'émetteur provenant du profil sans le rendre éditable ;
- brancher les listes et choix multiples sur les référentiels ;
- afficher les PDF Supabase via URL signée.

Critère de sortie : tests d'interface par rôle, erreurs réseau, concurrence et reprise après échec.

### Lot 5 — Outil de migration et répétition à blanc

- construire un outil en ligne de commande reproductible ;
- produire un manifeste source avant toute écriture ;
- importer les référentiels, DPR, relations et fichiers par étapes reprenables ;
- calculer les checksums avant upload ;
- exécuter une migration à blanc puis une répétition complète en recette ;
- produire les rapports de réconciliation et d'erreurs.

Critère de sortie : deux exécutions successives produisent le même état cible, sans doublon, et tous les contrôles de volumes et de fichiers sont prouvés.

### Lot 6 — Reprise historique contrôlée

- charger les 981 enregistrements DPR, dont les 325 DPR disposant d'un PDF ;
- transférer les PDF et autres fichiers éligibles ;
- corriger les anomalies par règle versionnée ou intervention auditée ;
- rejouer uniquement les éléments nécessaires ;
- exécuter la réconciliation automatisée complète ;
- contrôler manuellement un échantillon représentatif.

Critère de sortie : 325 DPR avec PDF repris ou exclus avec justification, 656 DPR données seules conservés, fichiers accessibles, aucun orphelin, aucune erreur de permission et totaux réconciliés.

## 7. Phase 5 — Outil de migration et répétition à blanc

### 7.1 Architecture de l'outil

L'outil de migration doit être un processus serveur ou une commande locale contrôlée, jamais du code exécuté dans le navigateur. Il utilise :

- Microsoft Graph ou l'API SharePoint avec une identité dédiée en lecture seule ;
- la connexion PostgreSQL ou un client Supabase privilégié limité à la migration ;
- une clé de service injectée uniquement dans l'environnement d'exécution et jamais stockée dans GitHub ;
- un répertoire temporaire contrôlé pour les téléchargements et le calcul des checksums ;
- `migration_batches`, `migration_records`, `migration_errors` et `migration_source_snapshots` pour la reprise et l'audit.

Chaque exécution reçoit un identifiant de lot et enregistre :

- la compagnie cible ;
- l'environnement ;
- la version du code et des règles de transformation ;
- les listes et bibliothèques SharePoint sources ;
- les heures de début et de fin ;
- le mode `dry-run`, `apply`, `resume` ou `reconcile` ;
- les compteurs lus, transformés, importés, exclus, inchangés et en erreur.

Une seule migration active est autorisée simultanément pour une même compagnie et une même source. Un verrou PostgreSQL consultatif ou une ligne verrouillée dans `migration_batches` doit empêcher deux chargements concurrents.

### 7.2 Pipeline ordonné

1. **Découverte** : inventorier les listes, bibliothèques, champs, relations et fichiers sans écrire dans la cible.
2. **Manifeste** : figer pour chaque entité l'identité SharePoint composée, les métadonnées, la taille, l'URL source et la décision attendue.
3. **Normalisation des référentiels** : importer ou rapprocher compagnies, projets, navires et personnes ; appliquer aliases, exclusions et fusion de doublons.
4. **Import des DPR** : créer ou mettre à jour `dpr_reports` avec leurs snapshots source et leurs clés de migration.
5. **Relations multiples** : importer équipages, autres personnes, incidents, actions HSE, exercices, escales, motifs, approvisionnements et déchets.
6. **Téléchargement des fichiers** : télécharger par flux, mesurer la taille et calculer SHA-256 sans charger le fichier entier en mémoire.
7. **Déduplication** : comparer identité source, taille et checksum ; ne jamais conclure à un doublon sur le nom seul.
8. **Upload Storage** : charger dans le bucket privé et le chemin déterministe construit par l'outil.
9. **Métadonnées** : créer ou mettre à jour `dpr_files`, puis rattacher le fichier au bon DPR.
10. **Réconciliation** : comparer manifeste, base et Storage ; produire les rapports de succès, exclusions, avertissements et erreurs.

Les étapes doivent être reprenables indépendamment. L'état d'un enregistrement passe par exemple par `discovered`, `normalized`, `db_loaded`, `file_verified`, `storage_loaded`, `linked`, `reconciled` ou `error`.

### 7.3 Idempotence

La clé naturelle d'import est :

`(company_id, sharepoint_site_id, sharepoint_container_id, sharepoint_item_id)`

où `sharepoint_container_id` identifie la liste ou la bibliothèque. Cette combinaison possède un index unique partiel lorsque les identifiants source sont présents.

Règles obligatoires :

- utiliser des `upsert` ou des fonctions transactionnelles fondés sur cette clé ;
- réutiliser le même `dpr_reports.id` et le même `dpr_files.id` lors d'une reprise ;
- utiliser un chemin Storage déterministe ;
- si un objet existe déjà avec la taille et le SHA-256 attendus, le considérer comme inchangé ;
- si le chemin existe avec un checksum différent, arrêter l'enregistrement et produire une erreur de conflit ;
- ne jamais générer un nouveau numéro DPR lors de la réexécution d'un DPR historique ;
- remplacer les relations multiples par une synchronisation déterministe ou un upsert avec clé unique, jamais par des insertions aveugles ;
- enregistrer `unchanged`, `updated`, `inserted`, `excluded` ou `error` pour chaque source.

Le test d'idempotence consiste à exécuter deux fois le même manifeste. La seconde exécution doit produire :

- zéro nouvelle ligne métier ;
- zéro nouveau fichier Storage ;
- zéro nouveau numéro DPR ;
- zéro nouvelle relation multiple ;
- uniquement des résultats `unchanged`, hors erreurs déjà connues et explicitement suivies.

### 7.4 Cohérence entre base et Storage

PostgreSQL et Supabase Storage ne partagent pas une transaction atomique. L'outil doit donc utiliser une séquence compensable :

1. réserver ou retrouver la ligne `dpr_files` avec un état `pending` ;
2. construire le chemin à partir des identifiants cibles contrôlés ;
3. téléverser ou vérifier l'objet ;
4. confirmer taille et checksum ;
5. passer la métadonnée à `ready` et créer le rattachement dans une transaction PostgreSQL ;
6. laisser toute opération incomplète en état explicite pour reprise ;
7. détecter et signaler les objets Storage sans métadonnée et les métadonnées sans objet.

Une erreur ne doit jamais provoquer la suppression automatique d'un objet validé lors d'une précédente exécution.

### 7.5 Compteurs de réconciliation

Le contrôle « fichiers source = fichiers cible » porte sur les fichiers **éligibles**, pas sur tous les objets découverts.

| Population | Source attendue | Résultat cible attendu |
|---|---:|---:|
| DPR | 981 | 981 `dpr_reports` historiques |
| PDF DPR éligibles | 325 | 325 métadonnées PDF rattachées et 325 fichiers vérifiés avant déduplication physique éventuelle |
| DPR sans PDF | 656 | 656 DPR sans PDF, sans génération automatique et sans erreur bloquante |
| HTML temporaires | 15 | 0 fichier cible, 15 exclusions tracées |
| Pièces jointes éligibles | 10 | 10 rattachements logiques ; nombre d'objets physiques égal au nombre de SHA-256 uniques |
| DPR sans navire | 2 | 2 exceptions approuvées avec `vessel_id = NULL` |
| DPR sans projet | 91 | 91 exceptions approuvées avec `project_id = NULL` |

Pour les fichiers dédupliqués, deux compteurs distincts sont nécessaires :

- nombre de rattachements logiques dans `dpr_files` ;
- nombre d'objets physiques uniques dans Storage.

Les 38 PDF appartenant aux 91 DPR sans projet doivent rester rattachés à leur DPR. Le projet source 28 est remappé vers Hors Projet 52 pour 57 DPR. Le navire source 17 est exclu et n'est utilisé par aucun DPR.

### 7.6 Rapport d'erreurs et manifeste de sortie

Chaque erreur contient :

- lot et étape ;
- type d'entité et identité SharePoint complète ;
- DPR cible éventuel ;
- code stable, sévérité et message ;
- tentative, horodatage et cause technique nettoyée ;
- contexte JSON sans secret ;
- caractère reprenable ou bloquant ;
- état de résolution et commentaire opérateur.

Rapports à produire en JSON et en format lisible :

- synthèse du lot ;
- détail des insertions, mises à jour, éléments inchangés et exclusions ;
- erreurs et avertissements ;
- réconciliation DPR ;
- réconciliation des relations ;
- réconciliation des fichiers par taille et SHA-256 ;
- fichiers orphelins dans chaque sens ;
- identifiants SharePoint dupliqués ;
- exceptions projet/navire ;
- comparaison entre première et seconde exécution.

Le rapport final contient le hash du manifeste d'entrée et la version Git exacte de l'outil pour permettre une reproduction.

### 7.7 Modes d'exécution

- `inventory` : lecture SharePoint et production du manifeste uniquement ;
- `dry-run` : transformations, résolutions et contrôles sans écriture Supabase ni Storage ;
- `apply` : exécution du manifeste approuvé ;
- `resume` : reprise des seuls éléments incomplets ou en erreur ;
- `reconcile` : contrôle sans mutation de la base et du Storage ;
- `verify-idempotence` : seconde exécution et preuve qu'aucun doublon n'est créé.

Le mode `dry-run` ne doit effectuer aucune écriture métier ni aucun upload. L'écriture de journaux locaux ou dans une zone de recette explicitement dédiée doit être distinguée du chargement cible.

### 7.8 Critères de validation de la phase 5

La phase 5 est validée uniquement si, dans un projet Supabase de recette ou une copie contrôlée :

- le manifeste source a été approuvé ;
- les 981 DPR sont présents une seule fois ;
- les 325 PDF éligibles sont rattachés et vérifiés ;
- les 656 absences de PDF sont comptabilisées comme exceptions approuvées ;
- les 15 HTML sont exclus et tracés ;
- les 10 pièces jointes possèdent chacune un rattachement logique et sont dédupliquées par SHA-256 ;
- tailles et checksums correspondent entre source, métadonnées et Storage ;
- aucun fichier n'est orphelin ;
- aucun identifiant SharePoint n'est dupliqué ;
- seuls les 2 DPR sans navire et les 91 DPR sans projet approuvés restent non rattachés ;
- les règles navire 17, projet 28 → 52 et doublon Tanguy SIMONET sont prouvées dans le rapport ;
- les anomalies de date approuvées sont importées sans correction silencieuse ;
- une seconde exécution ne crée aucune ligne, relation, version, numéro ou objet supplémentaire ;
- les erreurs non bloquantes sont documentées et toutes les erreurs bloquantes sont résolues ;
- la restauration de la copie de recette a été testée avant et après l'exercice.

## 8. Phase 6 — Reprise des 325 DPR et des fichiers

### 8.1 Périmètre de la reprise

La formulation « 325 DPR repris » désigne les 325 DPR historiques possédant un PDF. Ils constituent un sous-ensemble des 981 DPR source :

- 325 DPR avec données et PDF ;
- 656 DPR avec données, sans PDF et sans génération rétroactive ;
- 981 enregistrements DPR attendus au total dans `dpr_reports`.

Les 656 DPR sans PDF ne sont donc pas des exclusions de données. Ils sont importés comme DPR historiques sans ligne PDF dans `dpr_files`.

### 8.2 Conditions préalables

Le chargement historique ne commence que si :

- les phases 3 et 4 sont implémentées et leurs tests sont verts ;
- la phase 5 a réussi deux fois en recette sans doublon ;
- le manifeste source des 981 DPR et 325 PDF est figé et approuvé ;
- une sauvegarde restaurable de la cible existe ;
- les buckets privés, politiques RLS et URL signées sont validés ;
- la fenêtre de chargement, les responsables et le plan de retour arrière sont approuvés ;
- aucune écriture utilisateur concurrente ne peut modifier le périmètre historique pendant le chargement.

### 8.3 Déroulement du chargement

1. Enregistrer un nouveau `migration_batch` de type `historical_load` et le hash du manifeste approuvé.
2. Importer ou rapprocher les référentiels et appliquer les règles navire, projet et personne.
3. Importer les 981 DPR et leurs relations multiples.
4. Télécharger et vérifier les 325 PDF et les autres fichiers éligibles.
5. Charger les objets dans les buckets privés et finaliser `dpr_files`.
6. Exécuter la réconciliation automatisée sans mutation.
7. Classer les anomalies en bloquantes, corrigeables automatiquement ou nécessitant une décision humaine.
8. Corriger uniquement au moyen d'une règle versionnée ou d'une action manuelle auditée.
9. Rejouer en mode `resume` les seuls enregistrements concernés.
10. Réexécuter la réconciliation puis le contrôle manuel.

Le rejeu ne doit jamais supprimer ou renuméroter un DPR déjà validé par le contrôle. Une correction d'un DPR historique conserve la valeur source dans le snapshot de migration et écrit un événement d'audit.

### 8.4 Traitement des anomalies

| Anomalie | Traitement attendu |
|---|---|
| Navire source 17 | Exclusion du référentiel ; aucun DPR concerné |
| DPR sans navire | Conserver les 2 exceptions avec `vessel_id = NULL` |
| Projet source 28 | Remapper 57 DPR vers Hors Projet 52 et tracer l'ancienne valeur |
| DPR sans projet | Conserver les 91 exceptions avec `project_id = NULL` |
| Doublon Tanguy SIMONET | Réaffecter vers la personne canonique, puis désactiver le doublon |
| DPR source 603 daté du 19/02/2002 | Importer la valeur source ; correction manuelle ultérieure auditée |
| DPR-995 daté du 30/07/2026 | Importer la valeur source ; correction manuelle ultérieure auditée |
| PDF absent | Ne pas générer ; classer parmi les 656 absences approuvées |
| HTML temporaire | Exclure et compter parmi les 15 exclusions |
| Checksum divergent | Bloquer le fichier, ne pas écraser et demander une investigation |
| Rattachement ambigu | Bloquer le DPR ou fichier concerné, sans rapprochement approximatif |

### 8.5 Contrôle automatisé complet

Le contrôle produit au minimum :

- nombre total de DPR source et cible ;
- nombre de DPR avec et sans PDF ;
- distribution par navire, projet, date et statut ;
- distribution des équipages, incidents, exercices, escales et fichiers ;
- liste des exceptions navire/projet approuvées ;
- identité SharePoint unique de chaque DPR et fichier ;
- présence de chaque objet Storage référencé par `dpr_files` ;
- absence d'objet DPR sans métadonnée ;
- comparaison taille et SHA-256 source/cible ;
- unicité des chemins Storage ;
- unicité des numéros DPR ;
- état final de chaque `migration_record` ;
- matrice de lecture des PDF pour les cinq rôles dans la compagnie ;
- refus de lecture depuis une autre compagnie ;
- absence de droits d'écrasement et de suppression physique.

Les totaux par navire et projet sont comparés à SharePoint après application des règles approuvées : projet 28 regroupé dans Hors Projet 52, navire absent regroupé dans « Sans navire » et projet absent regroupé dans « Sans projet ».

### 8.6 Échantillon manuel représentatif

Recommandation : contrôler au minimum 33 DPR, soit environ 10 % des 325 DPR avec PDF, puis ajouter tous les cas rares qui ne seraient pas inclus dans ces 33.

L'échantillon est stratifié et inclut :

- au moins un DPR pour chaque navire représenté parmi les 325 ;
- plusieurs projets, dont Hors Projet 52 et des DPR sans projet ;
- différentes périodes, y compris le plus ancien et le plus récent ;
- des DPR avec équipage multiple et avec autre personne ;
- chaque catégorie et niveau d'incident QHSE présents ;
- des actions HSE et exercices d'urgence ;
- des escales avec plusieurs motifs ;
- des photos ;
- chacune des catégories de pièces jointes ;
- les fichiers dédupliqués ;
- les deux DPR sans navire s'ils disposent d'un PDF ;
- les anomalies de date si elles disposent d'un PDF.

Pour chaque DPR échantillonné, le contrôleur compare SharePoint, PostgreSQL, l'interface et le PDF :

- numéro, date, projet, navire et émetteur ;
- description et mesures ;
- équipage et autres personnes ;
- QHSE, escale, approvisionnements et déchets ;
- ordre et rendu des photos ;
- présence et ouverture des pièces jointes ;
- nom du PDF, nombre de pages, première et dernière page ;
- accessibilité par URL signée pour un rôle autorisé ;
- absence d'accès depuis une autre compagnie.

Le contrôle est enregistré avec contrôleur, date, résultat, commentaire et preuve éventuelle. Toute anomalie manuelle doit être répercutée dans `migration_errors` ou un registre de recette lié au lot.

### 8.7 Définition des erreurs de permission

Le critère « 0 erreur de permission » signifie simultanément :

- zéro refus injustifié pour un utilisateur autorisé de la même compagnie ;
- zéro accès accepté pour un utilisateur non autorisé ou d'une autre compagnie ;
- zéro URL publique ou permanente ;
- zéro possibilité d'écraser, déplacer ou supprimer physiquement un fichier depuis l'application.

Les expirations normales d'URL signées et les refus attendus des tests négatifs ne sont pas comptés comme des erreurs.

### 8.8 Rapport de reprise

Le rapport final de phase 6 contient :

- identifiant du lot, version Git et hash du manifeste ;
- volumes avant/après et écarts ;
- 325 décisions PDF : repris ou exclusion justifiée ;
- détail des 656 DPR données seules ;
- anomalies initiales, corrections et replays ;
- réconciliation par navire et projet ;
- résultat du contrôle Storage et checksums ;
- résultat de la matrice de permissions ;
- composition et résultat de l'échantillon manuel ;
- erreurs restantes, responsable et décision ;
- décision finale `go`, `go sous réserve` ou `no-go` signée par les responsables désignés.

### 8.9 Critères de validation de la phase 6

- 981 DPR présents en cible : 325 avec PDF et 656 sans PDF.
- 325 DPR avec PDF repris, ou chaque exclusion explicitement justifiée et approuvée.
- 100 % des PDF attendus accessibles aux rôles autorisés via URL signée.
- Taille et SHA-256 conformes pour 100 % des fichiers repris.
- Zéro fichier orphelin dans PostgreSQL ou Storage.
- Zéro erreur de permission selon la définition de la section 8.7.
- Totaux par navire et projet identiques à SharePoint après transformations approuvées.
- Zéro identité SharePoint dupliquée.
- Zéro erreur bloquante ouverte.
- Échantillon manuel représentatif accepté et signé.

## 9. Matrice de tests obligatoire

Créer au minimum un compte actif par rôle dans la compagnie A, un second jeu d'identités dans la compagnie B et des DPR couvrant chaque statut.

Scénarios obligatoires :

- lecture de tous les DPR de sa compagnie par chacun des cinq rôles ;
- refus de toute lecture inter-compagnies ;
- création d'un brouillon par chaque rôle ;
- modification du propre brouillon par Marin et refus sur le brouillon d'un tiers ;
- validation de son propre DPR par Capitaine ;
- refus de validation par Marin ;
- refus de modification directe d'un DPR validé ;
- réouverture avec nouvelle version et motif obligatoire ;
- suppression logique par Admin/Direction/Armement et refus pour Capitaine/Marin ;
- refus SQL du `DELETE` physique pour tous les rôles applicatifs ;
- attribution concurrente de numéros sans doublon ;
- quantités négatives refusées ;
- appareillage antérieur à l'accostage refusé ;
- PDF non conforme refusé pour le document final ;
- écrasement, suppression et chemin Storage d'une autre compagnie refusés ;
- expiration d'une URL signée ;
- présence de chaque événement dans le journal ;
- migration idempotente et réconciliation 981/325/656/15/10 ;
- sauvegarde et restauration d'un DPR avec toutes ses versions PDF.

## 10. Points restant à confirmer avant implémentation

1. Attribution du numéro DPR à la soumission — recommandée — ou dès la création du brouillon.
2. Une personne peut-elle occuper plusieurs fonctions dans le même DPR ?
3. Le thème TBT devient-il obligatoire lorsque TBT est coché ? Recommandation : oui.
4. Une journée peut-elle contenir plusieurs escales ? Le modèle proposé l'autorise.
5. Le port doit-il être saisi, déduit du projet ou rester facultatif ?
6. Le maximum visuel de deux photos doit-il rester une règle d'interface seulement ? Recommandation : ne pas le contraindre en base.

## 11. Point de validation

Les phases 3, 4, 5 et 6 restent ouvertes tant que :

- le modèle et les décisions restantes ne sont pas approuvés ;
- les migrations, contraintes, index et politiques ne sont pas revus ;
- les tests des cinq rôles et de deux compagnies ne sont pas verts ;
- le stockage PDF privé, la sauvegarde et la restauration ne sont pas démontrés.
- la migration complète et sa seconde exécution idempotente ne sont pas validées en recette.
- la reprise historique, la réconciliation automatisée et l'échantillon manuel ne sont pas formellement acceptés.

L'exécution réelle et ses preuves sont consignées dans `docs/migration/dpr-phase6-execution-report.md`.
