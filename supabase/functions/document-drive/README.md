# Documents Google Drive

`document-drive` sert les PDF, Word et Excel depuis Google Drive. Supabase conserve les références et la preuve de migration ; aucun contenu binaire n'est écrit dans Storage par cette fonction.

## Configuration serveur

Le lecteur technique est `seapilot-documents-reader@seapilot-documents.iam.gserviceaccount.com`. Activer Google Drive API, Security Token Service et IAM Service Account Credentials dans son projet Cloud. Dans Google Drive, donner à ce compte le rôle **Lecteur** sur le dossier SeaPilot existant dans **Mon Drive**. Ce rôle suffit à lire les documents et leurs versions courantes. Il ne faut ni déplacer ce dossier vers un Drive partagé, ni rendre les documents publics, ni modifier les autorisations des utilisateurs existants. Les dossiers ayant des accès limités doivent également être accessibles au lecteur technique ; conserver leurs restrictions pour les autres utilisateurs.

Le mode préféré utilise la fédération d'identité Vercel vers Google Cloud, sans clé JSON. Dans le pool `seapilot-production`, créer le fournisseur OIDC `vercel` avec l'émetteur `https://oidc.vercel.com/bbtm-app`, l'attribut `google.subject = assertion.sub` et la condition exacte `assertion.sub == 'owner:bbtm-app:project:sea-pilot:environment:production'`. Utiliser l'audience par défaut du fournisseur : `https://iam.googleapis.com/projects/<GCP_PROJECT_NUMBER>/locations/global/workloadIdentityPools/seapilot-production/providers/vercel`. Donner à ce principal exact le rôle **Workload Identity User** sur le compte lecteur. Les identités preview et development ne doivent pas obtenir cette autorisation. Aucun rôle éditeur Drive, aucune délégation de domaine ni clé privée n'est nécessaire. Conserver les politiques d'organisation interdisant la création de clés.

Dans l'environnement **production** Vercel, activer OIDC et configurer `GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID=seapilot-production`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=vercel`, `GCP_SERVICE_ACCOUNT_EMAIL` égal au compte lecteur ci-dessus et `GOOGLE_DRIVE_TOKEN_BROKER_SECRET`. Générer ce dernier avec 32 octets aléatoires encodés en hexadécimal (64 caractères) ou base64url (43 caractères). Le SDK officiel `@vercel/oidc` fournit l'identité du runtime. Le broker `/api/google-drive-token` échange cette identité auprès de STS puis demande à IAM un jeton `drive.readonly` de **600 secondes**, pour ce seul compte. Le jeton intermédiaire `cloud-platform` sert uniquement à cette usurpation contrôlée ; il n'est jamais retourné à Supabase.

Dans les secrets Supabase, enregistrer `GOOGLE_DRIVE_TOKEN_BROKER_URL=https://sea-pilot-ten.vercel.app/api/google-drive-token` et le même `GOOGLE_DRIVE_TOKEN_BROKER_SECRET`. Seuls ce domaine et son alias `sea-pilot-bbtm-app.vercel.app` sont acceptés ; le chemin est fixe, sans port, redirection, paramètres, fragment ni identifiants dans l'URL. Le broker accepte uniquement un POST serveur vide avec `Authorization: Bearer <secret>`. Il refuse GET, OPTIONS et les requêtes de navigateur, ne définit aucune autorisation CORS et répond avec `Cache-Control: no-store`. Le secret est comparé avec `timingSafeEqual` sur deux empreintes de taille constante. Les réponses contiennent seulement `{access_token, expires_in}`. Le lecteur Edge conserve le jeton brièvement en mémoire et le renouvelle avant expiration.

Configurer aussi `GOOGLE_DRIVE_SIGNING_SECRET` avec une valeur aléatoire d'au moins 32 caractères. Sa rotation invalide immédiatement les liens temporaires déjà émis. Cette valeur est indépendante des clés Supabase et des JWT utilisateurs.

Quand la création de clés est déjà autorisée, un mode alternatif peut enregistrer une clé de compte de service sur une seule ligne dans `GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON`. Le compte n'a besoin que d'un accès Lecteur et du scope `drive.readonly`. L'autre alternative utilise les trois secrets OAuth `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET` et `GOOGLE_DRIVE_REFRESH_TOKEN`, pour un compte disposant des accès Drive nécessaires. L'ordre de préférence est broker, JSON, OAuth. Une configuration partielle ou une erreur du broker arrête la lecture explicitement ; elle ne déclenche pas d'autre mode ni un retour à Storage. Les détails d'erreur OAuth, OIDC ou Google et les identifiants serveur ne sont jamais renvoyés au navigateur.

Le fichier [.env.example](./.env.example) décrit les variables. Ne jamais mettre les secrets dans les variables `VITE_*`, le frontend, les tickets, les logs, un commit ou le manifeste de migration. Les variables Supabase `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont fournies par l'environnement Edge.

Configuration de référence : [fédération Google Cloud sur Vercel](https://vercel.com/docs/oidc/gcp), [identité et audiences Vercel](https://vercel.com/docs/oidc/reference), [échange STS](https://cloud.google.com/iam/docs/reference/sts/rest/v1/TopLevel/token) et [jeton IAM du compte de service](https://cloud.google.com/iam/docs/reference/credentials/rest/v1/projects.serviceAccounts/generateAccessToken).

Déployer avec `verify_jwt = false` pour permettre les GET du lecteur PDF sans en-tête Authorization. Cette option ne rend pas les documents publics : le handler valide le JWT avec `auth.getUser` sur chaque POST, puis la RLS sur la référence ; chaque GET exige une signature HMAC valide et expire après **120 secondes maximum**. Comme les URL Storage courtes, un lien déjà émis reste utilisable jusqu'à son expiration après une révocation des droits. Les origines applicatives supplémentaires doivent être explicitement listées dans `SEAPILOT_ALLOWED_ORIGINS`.

## Contrat

- `document_drive_lookup(target_bucket, target_path)` retourne les métadonnées Drive autorisées, `null` pour une clé sans correspondance, ou `42501` pour une correspondance interdite ou inactive.
- `POST {operation:"info", bucket, path}` retourne les métadonnées courantes autorisées : `{drive_file_id, bytes, mime_type, file_name, version, md5?, chunkSize:4194304}`.
- `POST {operation:"url", bucket, path, expiresIn?, download?:boolean|string, range?}` retourne `{signedUrl, document, chunkSize:4194304}`. `document` décrit la version Drive courante ; `expiresIn` reste borné à 120 secondes.
  Le lien public utilise `SUPABASE_URL` et le chemin `/functions/v1/document-drive`. Le chemin interne reçu par le runtime et les en-têtes transmis ne déterminent jamais cette URL : la gateway peut retirer `/functions/v1` avant l'appel du handler.
- `POST {operation:"download", bucket, path, range?:{start,end}, version?}` retourne un contenu binaire `application/octet-stream`, compatible avec le SDK Supabase pour Word et Excel. Un bloc exige `version` et une plage entière inclusive d'au plus **4 MiB**. Chaque POST revalide le JWT et la RLS.
- `GET ?ticket=…` accepte `Range: bytes=start-end` sous le même ticket HMAC ; la version est celle signée dans `document.version`. Un ticket portant déjà une plage ne peut lire que cette plage. Aucune URL Google, aucun destinataire et aucun identifiant Drive arbitraire n'est accepté depuis le navigateur.

Un document de plus de 4 MiB exige des blocs ; une requête complète retourne HTTP 413. Le client assemble les blocs dans l'ordre, contrôle les longueurs, l'identifiant et la version, puis crée le Blob pour lecture ou téléchargement. Chaque réponse partielle est HTTP 206 avec `Content-Range`, `Content-Length`, `X-Document-Drive-Id`, `X-Document-Drive-Version`, `X-Document-Drive-Bytes`, `X-Document-Drive-Mime`, `X-Document-Drive-Name` encodé URI et `X-Document-Drive-Md5` si disponible. Ces en-têtes sont exposés aux origines autorisées.

Le lecteur impose le Range natif Google, la réponse 206 et les limites exactes. Il tamponne uniquement le bloc demandé, d'au plus 4 MiB, puis relit les métadonnées avant d'émettre ses octets. Un changement de version, volume, nom, MIME ou MD5 arrête le bloc avec HTTP 409 ; une plage hors du document retourne 416. Les contenus interrompus ou trop longs échouent. L'amont média reste limité à 120 secondes. La [limite du worker Supabase](https://supabase.com/docs/guides/functions/limits) est de 150 secondes sur Free et 400 sur les plans payants ; augmenter un timeout applicatif ne contourne pas cette limite. Le [Range Google](https://developers.google.com/workspace/drive/api/guides/manage-downloads#partial_download) concerne les PDF et Office binaires, sans conversion vers un document Google natif.

Une absence de configuration Google, une autorisation Google expirée, un fichier supprimé ou un format invalide produit une erreur explicite. Une correspondance existante ne doit jamais provoquer un retour silencieux à une ancienne copie Storage.

## Versions et preuve de purge

`source_bucket` et `source_path` sont des clés historiques utilisées par les fiches existantes, les RPC et la RLS ; elles ne prouvent pas qu'un objet existe encore dans Storage. `source_sha256` décrit la copie Supabase ; `sha256`, `bytes` et `verified_at` décrivent la version Drive contrôlée au moment de la migration. Une ancienne version différente peut être conservée dans `archive_drive_file_id`, sans écraser la version courante.

Après une modification autorisée du fichier Drive, le lecteur continue de servir **la version courante du même identifiant Drive**. Les empreintes de migration ne bloquent pas une modification de taille ou de nom. Les métadonnées courantes doivent rester dans la même famille PDF, Word ou Excel et sous 100 Mo. Les MIME XLSM sont comparés sans tenir compte de la casse ; une copie XLSM n'est jamais convertie. Les documents Google natifs ne sont pas assimilés à un PDF ou à un fichier Office binaire. Un changement de format incompatible demande une nouvelle référence vérifiée.

La copie Supabase ne peut être supprimée qu'après contrôle du contenu et des droits, enregistrement de la correspondance vérifiée, mise en service du lecteur et validation des parcours métier. Avant chaque suppression, vérifier de nouveau que les octets de l'objet Supabase correspondent à `source_sha256` et que la copie Drive ou son archive conserve ce contenu. L'empreinte initiale du fichier Drive reste une preuve de migration ; elle ne prétend pas décrire ses modifications futures.

L'API de suppression Storage travaille par chemin et ne fournit pas de précondition ID/ETag. Avant la vérification finale, geler les écritures sur les **507 seuls chemins du snapshot** pour empêcher un remplacement entre contrôle et suppression. La migration `document_drive_source_freeze` crée un registre privé vide et trois politiques restrictives ; elle ne contient aucun nom de document. L'opérateur charge ensuite les 507 chemins privés en suivant [freeze-sources.example.sql](./freeze-sources.example.sql), sans application automatique. Les politiques empêchent les INSERT/UPDATE/DELETE des utilisateurs sur ces chemins et conservent les règles des autres fichiers. `service_role` contourne la RLS : suspendre les CLI d'import `migrate-qsms-documents-to-storage.ts` et `migrate-project-contract-documents-to-storage.ts` pendant la reprise. Aucune fonction SQL, aucun trigger métier ni aucune Edge déployée ne téléverse actuellement vers ces buckets avec ce rôle ; l'ancienne Edge `project-contract-document-migrate` est fermée avec HTTP 410. Conserver les chemins gelés après purge tant que les parcours de création correspondants n'ont pas été repris dans Drive.

## Accès conservés et dépendances métier

Les références Drive sont protégées par une politique RLS et une fonction `SECURITY INVOKER`. Les requêtes utilisent les tables métier sous la véritable identité Supabase de l'utilisateur. Aucun rôle n'est déduit de `user_metadata` ou du simulateur de profils.

| Bucket historique | Autorisation du lecteur |
|---|---|
| `procedure-documents` | Sources liées : Admin/Direction ; publications selon leur RLS, uniquement publiées pour Armement/Capitaine/Marin |
| `fleet-certificates` | Même société et mêmes cinq rôles que la politique Storage existante |
| `hr-documents` | RLS RH : propriétaire, bureau, Capitaine selon les bordées partagées |
| `project-files` | Référence visible dans `project_drive_files`, les documents générés, contrats ou pièces de facturation sous leur RLS ; les restrictions des pièces opérationnelles restent applicables |
| `expense-note-pdfs` | Note visible par sa RLS ; le relais comptable lit Drive seulement après cette vérification |
| `working-time-imports` | Lots de la société gérés uniquement par Admin |
| `documentary-audit-files` | `documentary_audit_private.can_read_file`, avec les mêmes droits sur audits, constats et événements |
| `purchase-request-attachments` | Pièce visible sous la RLS de la société et du profil ; aucun élargissement fondé sur l'ancien accès global du bucket |
| `lifting-certificates` | `lifting_certificate_path_access`, inchangée |
| `annual-review-reports` | Rapport lié à un entretien visible ; collaborateur, manager ou bureau selon `annual_review_can_read` |
| `vessel-visits` | Pièce de visite visible sous les règles du planning |

`project_drive_files` conserve les anciens couples source et ses permissions existantes. Les RPC d'enregistrement des documents projets acceptent déjà ces références Drive ; les clés historiques ne doivent donc pas être effacées. La RPC de prévisualisation des imports de temps de travail accepte une correspondance Drive active et vérifiée dont l'empreinte source correspond au lot. Les RPC de prévisualisation et de validation sont testées après disparition de l'objet Storage.

Les audits réutilisent leurs pièces déjà enregistrées sans exiger un objet Storage lors des modifications suivantes. Les contrôles Storage restants des audits, du levage et des rapports d'entretien concernent l'enregistrement de **nouvelles** pièces, pas la lecture ou le maintien des pièces migrées. La migration du stock existant ne remplace pas ces parcours de création ; ne pas les réactiver pour téléverser durablement des documents dans Supabase.

Les fixtures SQL créent séparément Admin, Direction, Armement, Capitaine et Marin. Elles vérifient les accès permis, les refus RH/source/brouillon/société, les références inactives, l'absence de modification par le navigateur et les imports après purge. Les tests TypeScript couvrent les JWT, tickets HMAC, expirations, formats, erreurs Google et absence de retour à Storage.
