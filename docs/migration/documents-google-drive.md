# Documents SeaPilot dans Google Drive

Les PDF, documents Word et classeurs Excel sont conservés dans Google Drive. Supabase reste responsable des données métier, des droits d'accès et des références documentaires. Une référence historique `bucket/path` ne signifie plus que les octets sont présents dans Storage : `document_drive_files` relie cette référence à un fichier Drive vérifié.

## Périmètre de la reprise du 12 octobre 2026

L'inventaire initial comprend 507 documents (688 804 698 octets) : 337 PDF, 114 documents Word et 56 classeurs Excel. Les images, signatures, le fichier PowerPoint et le fichier HTML ne font pas partie de cette reprise. Les inventaires détaillés, copies temporaires et preuves d'intégrité restent dans le répertoire local ignoré `.data/storage-migration-2026-10-12/` ; ils ne doivent pas être publiés dans Git.

## Classement Drive

Le dossier existant `SeaPilot` accueille les dossiers métier suivants. Les fichiers déjà présents dans Drive conservent leur ID et leur emplacement pour préserver les liens, les versions et les permissions existantes.

| Dossier | Classement des nouveaux documents |
| --- | --- |
| Procedures | Sources ; archives des anciennes copies Supabase si la version Drive a évolué |
| Procedures PDF | Versions publiées |
| Flotte | Navire, puis certificats, sécurité, levage et visites par année |
| Projet | Projet, puis contrat, opérations, facturation et archives |
| QHSE | Audits par navire/site, année et audit ; rapports, constats et preuves |
| Achats | Année, demande, justificatifs |
| Finances | Notes de frais par année et personne/navire |
| Ressources Humaines | Personne, catégorie de document, temps de travail et entretiens par année |
| Archives techniques privées | Documents sans référence métier ; accès limité au propriétaire et au lecteur serveur |
| Sanctions Disciplinaires | Dossier distinct soumis aux droits spécifiques existants |

Les noms nouveaux contiennent une référence métier ou un identifiant stable pour éviter les collisions. Une ancienne version Supabase différente est archivée dans Drive ; elle ne remplace jamais le fichier Drive courant. Les trois fichiers sans référence métier sont conservés dans `Archives techniques privées` : l'héritage des permissions du dossier SeaPilot y est désactivé. Seuls le propriétaire et le compte lecteur serveur disposent d'un accès direct. Les profils applicatifs continuent de refuser ces fichiers tant qu'aucun rattachement métier ne les autorise.

## Accès applicatif

La fonction serveur `document-drive` vérifie le JWT SeaPilot et appelle `document_drive_lookup` avec les droits de l'utilisateur. La RLS reprend les règles métier des procédures, RH, projets, flotte, achats, notes de frais, audits, levage, entretiens et visites. Les fixtures SQL vérifient les comptes Admin, Direction, Armement, Capitaine et Marin. Une simulation de profil dans une session administrateur ne constitue pas une preuve de ces droits.

Le serveur utilise le compte Google « SeaPilot Documents Reader », lecteur du seul dossier SeaPilot. Google interdit la création de clés privées dans cette organisation : la connexion déployée utilise la fédération d'identité de charge de travail, limitée au serveur Vercel `sea-pilot` de l'équipe `bbtm-app` en production. Le relais serveur échange son identité contre un jeton Google `drive.readonly` de 600 secondes. Les secrets du relais et de signature restent côté serveur ; aucune clé privée Google n'est créée ou exposée au navigateur. Un téléchargement navigateur utilise une URL signée HMAC valable au maximum 120 secondes. Les mobiles passent par ce serveur et ne dépendent pas du lanceur Windows. L'envoi des notes de frais utilise également la source Drive après les contrôles d'accès métier.

Les téléchargements de l'application lisent les métadonnées courantes puis des blocs de 4 Mio au maximum. Chaque requête POST contrôle de nouveau le JWT, la référence et la RLS ; le navigateur assemble le fichier uniquement après validation des bornes, longueurs, ID et version de tous les blocs. Une modification Drive ou une révocation d'accès en cours de lecture interrompt le téléchargement. Les petits aperçus conservent leur URL HMAC ; au-delà de 4 Mio, l'ouverture assemble également les blocs authentifiés et utilise une URL temporaire du navigateur, libérée après 120 secondes au maximum. Cela permet notamment la lecture des rapports de 43 Mo dans la limite de durée d'exécution Supabase.

Les fichiers non migrés continuent d'utiliser leur source existante. Une référence migrée refusée, inactive ou inaccessible ne doit pas revenir silencieusement à une ancienne copie Supabase.

## Vérification et suppression des copies

1. Capturer l'inventaire Storage et les références métier avant toute mutation.
2. Télécharger chaque source et contrôler sa taille, son MD5 Storage lorsque disponible et son SHA-256.
3. Retrouver le fichier Drive existant ou copier la source vers son classement métier sans écrasement.
4. Télécharger le fichier depuis le cloud Drive et comparer les octets. Si sa version courante diffère, vérifier séparément l'archive identique à la source Supabase.
5. Vérifier les permissions Drive, activer les correspondances et tester la consultation réelle par les règles RLS et le serveur de téléchargement déployé.
6. Recontrôler que la source Supabase n'a pas changé depuis le snapshot, puis supprimer exclusivement les objets vérifiés avec l'API Storage. Ne pas supprimer les lignes `storage.objects` directement en SQL.
7. Relire l'inventaire Storage et vérifier le bilan par bucket ; conserver les preuves, empreintes et IDs Drive dans le manifeste de reprise.

La suppression n'est autorisée qu'après validation de l'intégrité, du téléchargement applicatif et des accès. Un succès de synchronisation Drive sur le poste ne suffit pas : les octets doivent être relus depuis Google Drive.

## Exploitation

Le fichier Drive courant peut être modifié sous le même ID. Les empreintes du manifeste attestent les versions contrôlées lors de la reprise, tandis que SeaPilot consulte la version Drive courante. Les ACL Google du dossier et les règles SeaPilot restent complémentaires : partager directement un fichier RH avec un nouveau destinataire ne remplace pas le contrôle métier.

Cette reprise concerne les documents existants. Les écritures documentaires qui utilisent encore Storage doivent être adaptées séparément avant d'interdire définitivement tout nouvel envoi PDF/Word/Excel dans les buckets historiques.
