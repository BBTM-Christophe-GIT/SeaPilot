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
