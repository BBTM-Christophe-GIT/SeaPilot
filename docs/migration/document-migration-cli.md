# Activation et purge des documents existants

`scripts/migrate-documents-to-google-drive.mjs` bascule les références historiques vers des fichiers Drive déjà migrés et vérifiés. Il ne crée aucun fichier, aucune autorisation Drive ni aucune clé Google. Les images, signatures et autres formats restent hors périmètre. La simulation est le mode par défaut ; elle relit les contenus cloud et écrit un journal local privé, sans modifier Supabase ou Drive.

Le manifeste et la configuration privée doivent rester hors Git, par exemple dans `.data/storage-migration-2026-10-12/`. Le script masque les credentials, URLs et noms de documents dans ses sorties terminal. Les journaux contiennent des références métier et doivent recevoir les mêmes restrictions d’accès que le manifeste. Sur Windows, utiliser un dossier dont les ACL sont réservées à l’opérateur ; le mode `0600` du fichier ne remplace pas ces ACL.

Chaque transfert de contenu Drive ou Storage dispose de dix minutes, y compris les archives sources. Les appels d’authentification, de métadonnées, de base de données et de suppression restent limités à deux minutes. Les vérifications de volume, MD5, SHA-256 et snapshot restent obligatoires avant toute activation ou purge.

## Contrat du manifeste

Le projet est fixé à `szlvyrrmvdvhzixilymh`. Le manifeste JSON contient `project_id`, `count`, `expected_bytes`, `records`, `storage_snapshot_at`, `gateway_verified`, `gateway_verified_at`, `role_fixtures_verified_at`, `gateway_records_sha256`, `drive_permissions_verified_at` et `drive_permissions_records_sha256`.

Chaque record contient :

- `source_bucket`, `source_path`, `source_id` (UUID Storage), `source_bytes`, `source_md5`, `source_sha256` ;
- `source_updated_at` et `source_etag`, exactement issus du snapshot Storage initial ;
- `drive_file_id`, `drive_path`, `file_name`, `mime_type`, `bytes`, `sha256`, `verified_at` ;
- `archive_drive_file_id` et `archive_sha256` lorsqu’une version Drive différente de la source est conservée.

Les MD5/SHA-256 sont des chaînes hexadécimales minuscules. `source_md5` est calculé sur les octets sources ; les ETags multipart sont conservés séparément dans `source_etag` et ne sont jamais interprétés comme un MD5. Une archive distincte est obligatoire lorsque le SHA-256 Drive diffère du SHA-256 source ; son contenu doit correspondre au SHA-256, MD5 et volume source. Le nombre de documents n’est pas fixé à 507 pour permettre une migration ultérieure contrôlée.

L’export `recordsProofDigest(records)` du script calcule un SHA-256 stable des records, triés par bucket/chemin, en sélectionnant tous les champs ci-dessus. Le vérificateur de passerelle doit écrire cette valeur dans `gateway_records_sha256` après ses tests authentifiés. L’audit des ACL et emplacements Google Drive renseigne `drive_permissions_verified_at` et le même digest dans `drive_permissions_records_sha256` : les nouveaux fichiers doivent être sous la racine SeaPilot approuvée, les fichiers existants conserver leurs droits et emplacement attendu. La purge exige les digests exacts et des preuves de passerelle, ACL/emplacements Drive, fixtures de rôles réels, snapshot et vérification de chaque record datant de moins de 24 heures. Changer un ID, hash, nom, chemin, ETag ou date de preuve impose une nouvelle vérification de passerelle et des droits. L’activation peut précéder ces vérifications.

## Configuration privée

Le fichier `--env-file` accepte un objet JSON ou des lignes littérales `NOM=valeur` ; il n’est jamais exécuté par un shell. Ne passer aucun secret sur la ligne de commande. Champs requis :

```dotenv
SUPABASE_SERVICE_ROLE_KEY=<clé privée du projet>
SUPABASE_URL=https://szlvyrrmvdvhzixilymh.supabase.co
GOOGLE_DRIVE_TOKEN_BROKER_URL=https://sea-pilot-ten.vercel.app/api/google-drive-token
GOOGLE_DRIVE_TOKEN_BROKER_SECRET=<secret partagé privé existant>
```

Le broker keyless est prioritaire, avec POST sans body et réponse `access_token`/`expires_in` (1–600 secondes). Seuls `sea-pilot-ten.vercel.app` et `sea-pilot-bbtm-app.vercel.app`, HTTPS et le chemin `/api/google-drive-token` sont autorisés ; une configuration partielle ou un broker défaillant bloque l’opération. Aucune redirection réseau n’est suivie.

Pour un environnement disposant déjà d’une autorisation différente, le script accepte `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` (JSON existant) ou le trio `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN`. Il ne crée aucune clé de compte de service et utilise uniquement le scope Drive readonly. Sans configuration Google valide, il s’arrête avant activation/purge.

## Exécution

Appliquer d’abord la migration SQL et déployer la passerelle ainsi que le frontend. Vérifier les permissions de chaque dossier Drive et les fixtures RLS des vrais profils. Garder les chemins Storage ciblés sans remplacement concurrent pendant la purge : l’API Storage supprime par chemin et ne fournit pas de comparaison atomique ID/ETag pour les lots.

```powershell
corepack pnpm exec node scripts/migrate-documents-to-google-drive.mjs --mode activate --manifest .data/storage-migration-2026-10-12/migration-manifest-final.json --env-file .data/storage-migration-2026-10-12/.env.migration-drive
corepack pnpm exec node scripts/migrate-documents-to-google-drive.mjs --mode activate --manifest .data/storage-migration-2026-10-12/migration-manifest-final.json --env-file .data/storage-migration-2026-10-12/.env.migration-drive --apply --project-ref szlvyrrmvdvhzixilymh
```

L’activation relit les métadonnées et les octets Drive courants, l’archive éventuelle et le contenu Storage de **tous** les documents avant le premier upsert. Elle conserve le même ID Drive et refuse une correspondance existante désactivée ou pointant vers un autre ID. Elle ne modifie pas les droits Drive et n’écrase pas les fichiers courants. Le frontend existant conserve bucket/chemin et consulte la passerelle authentifiée, soumise aux mêmes RLS métier.

### Réutiliser une vérification complète récente

L’option explicite `--verified-journal <journal-privé.json>` évite de retélécharger des contenus déjà vérifiés. Elle accepte uniquement un journal original de simulation d’activation (`mode: activate`, `apply: false`), terminé, couvrant chaque record une seule fois avec `status: verified`, lié au digest exact du manifeste et datant de moins de 24 heures. Les preuves source, Drive courant et archive éventuelle doivent contenir les volumes, MD5 et SHA-256 exacts. Un journal partiel, appliqué, purgé, réutilisé précédemment ou comportant une tentative de suppression est refusé. Le fichier d’entrée doit être distinct du journal de sortie. Cette option conserve les conditions d’activation ; en mode purge, les attestations de passerelle, rôles réels et droits restent obligatoires.

Appliquer d’abord la migration `document_drive_frozen_source_proofs`, puis charger **en privé** les `source_id` et `source_sha256` des chemins déjà présents dans `document_drive_private.frozen_sources`, depuis le manifeste et le journal complet vérifiés. La migration ne contient aucune référence réelle et ne remplit aucune empreinte. La RPC `document_drive_sources_frozen(p_records)` est accessible uniquement au service role et vérifie l’ensemble exact (nombre, chemins, UUID et SHA-256), le RLS Storage actif et les trois policies restrictives de gel. Elle renvoie `false` si une empreinte manque ou si un autre ensemble est présenté. Le schéma privé n’est pas exposé par REST. Conserver ces empreintes et tombstones après la purge.

La CLI contrôle ce gel avant les lectures et avant chaque mutation. Elle relit les snapshots Storage ID/taille/date/ETag exacts et les métadonnées Google courantes de **tous** les fichiers, ainsi que chaque archive : ID, taille, nom et MIME canonique de la version courante, MD5 et SHA-256 natifs correspondant aux contenus précédemment relus. Les deux empreintes Google sont obligatoires ; leur absence ou toute différence bloque l’opération sans repli vers un téléchargement ou un autre journal. La purge répète ces contrôles pour chaque lot avant les derniers mappings, le checkpoint et le DELETE, et revérifie l’âge de toutes les attestations. Une source déjà absente ou déjà purgée est refusée dans ce mode ; une reprise de purge exige le mode normal et son journal de suppression.

```powershell
corepack pnpm exec node scripts/migrate-documents-to-google-drive.mjs --mode activate --manifest .data/storage-migration-2026-10-12/migration-manifest-final.json --env-file .data/storage-migration-2026-10-12/.env.migration-drive --verified-journal .data/storage-migration-2026-10-12/activation-dry-run.json --journal .data/storage-migration-2026-10-12/activation-native-check.json --apply --project-ref szlvyrrmvdvhzixilymh
```

Le journal complet et le manifeste constituent des preuves locales de l’opérateur, sans signature cryptographique indépendante ; leurs ACL privées doivent donc être conservées. La sécurité de la réutilisation du contenu Storage dépend du gel vérifié et de l’absence de remplacement par un service role, qui contourne les RLS. Garder tous les jobs d’upload privilégiés suspendus pendant cette fenêtre. Les métadonnées Google sont toujours relues en direct ; une modification des empreintes ou des métadonnées attendues nécessite une nouvelle vérification des contenus. Le délai réseau de ces appels reste de deux minutes.

En cas d’arrêt après les premières suppressions, relancer la purge **sans** `--verified-journal`, en conservant le même manifeste attesté et le **même journal de sortie** (`--journal`). La reprise normale utilise les tentatives de DELETE et confirmations d’absence enregistrées dans ce journal ; le cache de contenus refuse volontairement toute source déjà purgée.

Après les lectures du proxy, les fixtures RLS des vrais profils et la consultation d'une session Admin existante, assembler le manifeste attesté lié au digest final. Les preuves GET HMAC contrôlent tous les octets : une réponse entière HTTP 200 ne couvre que les fichiers de 4 Mio au maximum ; les plus grands exigent des plages HTTP 206 contiguës, la même version Drive et un SHA-256 global exact. La preuve JWT de la session Admin est représentative ; les décisions d'accès de tous les documents pour les autres profils sont contrôlées dans PostgreSQL. Puis :

```powershell
corepack pnpm exec node scripts/migrate-documents-to-google-drive.mjs --mode purge --manifest .data/storage-migration-2026-10-12/migration-manifest-attested.json --env-file .data/storage-migration-2026-10-12/.env.migration-drive
corepack pnpm exec node scripts/migrate-documents-to-google-drive.mjs --mode purge --manifest .data/storage-migration-2026-10-12/migration-manifest-attested.json --env-file .data/storage-migration-2026-10-12/.env.migration-drive --apply --project-ref szlvyrrmvdvhzixilymh
```

La purge relit tous les contenus source, Drive courant et archive, vérifie les correspondances actives DB, puis contrôle à nouveau les métadonnées Drive et Storage ainsi que les mappings DB pour chaque lot de 20. Les lectures de chaque lot respectent `--concurrency` ; toutes doivent réussir avant le contrôle final des mappings, le journal et la suppression séquentiels. Elle appelle exclusivement l’API Storage `DELETE /object/{bucket}` avec les chemins vérifiés. Aucune suppression SQL de `storage.objects` n’est utilisée. L’absence des objets est confirmée avant l’écriture de `purged_at`.

Les journaux par défaut se trouvent à côté du manifeste, avec le suffixe `.activate.journal.json` ou `.purge.journal.json`. `--journal` choisit un autre chemin privé et `--concurrency 1..8` contrôle les lectures parallèles (4 par défaut). Chaque tentative de DELETE est journalisée avant l’appel. Une relance peut terminer l’écriture de `purged_at` après une interruption uniquement si l’objet absent possède déjà un `purged_at` valide ou une tentative documentée dans le même journal, liée au même digest. Conserver ce journal jusqu’à la fin de la vérification.

Validation locale du script :

```powershell
corepack pnpm exec node --test scripts/migrate-documents-to-google-drive.node-test.mjs
```
