# Procédures : Google Drive et Office sur Windows

Le fichier de travail peut être conservé dans Google Drive et ouvert dans Word, Excel ou PowerPoint sur le PC. Drive pour ordinateur synchronise les enregistrements vers le cloud. SeaPilot conserve la fiche documentaire et les PDF publiés dans Supabase.

## Utilisation

1. Installer Drive pour ordinateur et connecter le compte disposant de l’accès au dossier des sources.
2. Dans **Administration → Documents et Google Drive**, télécharger **Installer le lanceur Windows**, extraire entièrement l’archive et exécuter `Installer.cmd`.
3. Choisir le dossier synchronisé des sources, par exemple `G:\Mon Drive\SeaPilot\Procedures`. Cette configuration est propre à chaque utilisateur Windows ; le lecteur peut porter une autre lettre sur un autre PC.
4. Enregistrer le document Office dans ce dossier. Dans **Nouveau document**, conserver **Google Drive synchronisé**, coller le lien Google du fichier et renseigner son chemin relatif au dossier choisi.
5. Cliquer sur le titre dans SeaPilot : le navigateur peut demander l’autorisation de lancer SeaPilot Drive, puis le fichier local s’ouvre dans son application Windows. Enregistrer dans Office et attendre la fin de la synchronisation Drive avant d’éteindre le PC.

La configuration du poste est regroupée dans `/modules/admin?section=documents`, accessible aux administrateurs selon les droits existants. Cette section reste consultable pendant le chargement des données d’administration. Le bandeau de configuration a été retiré du module Procédures. Administration propose cinq sections : Utilisateurs, Accès et rôles, Documents et Google Drive, Plan d’action, Imports et migration. La section choisie figure dans l’URL pour permettre les favoris et le retour du navigateur.

**Voir dans Drive** ouvre le fichier authentifié sur le site Google, où il peut aussi être téléchargé. Le dossier Drive reste disponible dans le cloud lorsque ce PC est éteint. L’ouverture native nécessite un poste Windows configuré, Drive pour ordinateur et les applications Office installées.

Les nouveaux fichiers sont d’abord enregistrés dans Drive, puis liés à leur fiche SeaPilot. Cette version n’ajoute pas de téléversement vers Google par l’API depuis le navigateur SeaPilot. Aucun identifiant Google ni jeton de connexion n’est enregistré dans le code ou dans la fiche documentaire.

Les liens `drive.google.com/file/d/…`, `drive.google.com/open?id=…` et les liens `docs.google.com` des fichiers Office sont acceptés. Les documents doivent conserver leur format Office, sans conversion en document Google natif.

## Publication et droits

- Les liens des sources figurent uniquement dans `procedures`, protégée par les règles RLS existantes pour les profils Admin et Direction. Ils ne sont jamais copiés dans `published_procedures`.
- Les profils Armement, Capitaine et Marin continuent de consulter uniquement les PDF approuvés et publiés dans Supabase.
- Les autorisations Google Drive sont indépendantes des rôles SeaPilot. Partager le dossier source uniquement avec les comptes des gestionnaires autorisés ; aucun partage public n’est nécessaire.
- Un enregistrement dans Word ou Excel ne remplace pas un PDF publié. La publication d’une nouvelle version PDF reste une action distincte dans SeaPilot.
- Une suppression de fiche ne supprime pas le fichier dans Google Drive. Le dialogue le précise.
- Après un renommage ou un déplacement, mettre à jour le chemin dans la fiche. Les accès hors ligne et les conflits de modifications sont gérés par Drive pour ordinateur ; cette intégration n’ajoute pas de verrouillage documentaire commun à SeaPilot et Office.

## Installation technique

La migration `20260914192518_procedure_google_drive_sources.sql` ajoute l’identifiant Drive et le chemin relatif à la table privée existante. Appliquer cette migration avant le frontend. Aucune variable d’environnement supplémentaire ni serveur Nextcloud n’est requis.

Le lanceur est compilé localement avec .NET Framework 4 depuis le C# fourni, puis enregistré dans `HKCU\Software\Classes\seapilot-drive`. Son dossier racine est dans `HKCU\Software\SeaPilot\Drive`. Il n’utilise ni mot de passe, ni serveur HTTP local, ni commande shell construite à partir du nom du fichier. Le chemin relatif encodé est contrôlé, puis le chemin Windows réel est vérifié pour empêcher aussi une sortie par jonction de dossiers. Les exécutables et les extensions Office modernes à macros ne sont pas acceptés.

Sources de l’installateur : `scripts/drive/`. Après un changement de ces sources, reconstruire l’archive servie par Vercel :

```powershell
Compress-Archive -LiteralPath scripts/drive/SeaPilotDrive.cs,scripts/drive/Install-SeaPilotDrive.ps1,scripts/drive/Installer.cmd,scripts/drive/LISEZ-MOI.txt -DestinationPath public/connectors/seapilot-drive-windows.zip -Force
```

L’archive contient les sources et le script d’installation, pas un exécutable opaque téléchargé. L’installation par script peut nécessiter l’autorisation de la politique de sécurité du poste.

## Migration des sources existantes

Le périmètre initial comprend 118 fichiers `.docx`, `.xlsx` et `.pptx` (344 930 524 octets). Chaque nom dans Drive commence par l’identifiant de la fiche, pour éviter les collisions. Les sept sources PDF, le modèle DOTX et le fichier HTML conservent leur stockage existant. Les publications PDF ne sont pas déplacées.

La bascule des fiches intervient après comparaison des octets téléchargés depuis Google avec les fichiers sources Supabase. Les objets Supabase originaux sont conservés comme sauvegarde de migration ; après bascule, l’ouverture et **Voir dans Drive** utilisent exclusivement le lien Drive et ne servent jamais cette ancienne copie comme version actuelle. La taille affichée des sources Drive n’est pas présentée comme une mesure actualisée automatiquement.

Les manifestes de copie, empreintes, identifiants et éventuelles URL temporaires de vérification restent dans `.data/`, ignoré par Git. Ne pas les ajouter au dépôt. Pour revenir à Supabase, importer explicitement le fichier à jour dans la fiche ; ne pas réactiver aveuglément une ancienne sauvegarde.

## Vérification

```powershell
corepack pnpm test src/features/procedures src/App.test.tsx --exclude '**/.pnpm-store/**'
supabase test db --local supabase/tests/qsms_procedure_publishing_test.sql
powershell.exe -NoProfile -File scripts/drive/Test-SeaPilotDrive.ps1
corepack pnpm build
```

Les tests couvrent les liens privés, la validation des chemins et URL, la priorité de Drive sur une sauvegarde, la séparation des PDF publiés, la création d’une fiche Drive et les profils réels dans les fixtures SQL. Le parcours navigateur vérifie le formulaire et les tailles bureau/mobile ; l’adaptateur de prévisualisation ne représente pas une persistance réelle. Une validation séparée sur le poste couvre le lancement du protocole enregistré, l’ouverture de fichiers de test dans Word et Excel, leur modification et leur sauvegarde avant contrôle de la synchronisation cloud.

Documentation Google : [Drive pour ordinateur](https://support.google.com/drive/answer/10838124?hl=fr), [ouverture des fichiers](https://support.google.com/drive/answer/2423485?hl=fr).

Validation du 14 septembre 2026 : 58 tests applicatifs, 20 assertions SQL et 16 cas du lanceur Windows validés. Les 118 copies cloud ont été téléchargées et comparées par taille et empreinte MD5 aux sources. Les fichiers Word et Excel ouverts par le protocole ont été modifiés et enregistrés dans Office ; les octets récupérés ensuite depuis Google correspondent aux fichiers enregistrés. Le formulaire a été vérifié dans Chrome en 1440 et 390 pixels de large, sans débordement horizontal ; seule l’icône locale `favicon.ico`, déjà absente, produit un 404.
