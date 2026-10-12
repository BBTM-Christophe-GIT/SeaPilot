# Procédures : Google Drive et Office sur Windows

Les nouvelles sources et publications sont enregistrées dans Google Drive
synchronisé. SeaPilot conserve leurs fiches, chemins relatifs et métadonnées.
Les anciennes références Supabase des documents migrés sont conservées comme
provenance et donnent accès au fichier Drive autorisé.

## Installation et dossiers automatiques

1. Installer Google Drive pour ordinateur et connecter le compte autorisé.
2. Télécharger le lanceur proposé depuis **Administration → Documents et Google
   Drive**, extraire l'archive et exécuter `Installer.cmd` sur chaque PC qui n'en
   dispose pas. Les opérations de procédures exigent au minimum la version 2.3 ;
   un lanceur 2.6 déjà installé prend en charge l'ouverture des DOC/DOCX, XLS/XLSX
   et PDF. Installer la version 2.7.1 pour ouvrir aussi les modèles Word DOTX.
3. Configurer seulement la racine, par exemple `G:\Mon Drive\SeaPilot`.

L'installation et la configuration créent les dossiers manquants :

- `Procedures` : sources réservées à Administration et Direction.
- `Procedures PDF` : versions publiées destinées à la consultation.
- `Produits Chimiques` : dossiers par navire et produit.
- `Sanctions Disciplinaires` : dossiers par collaborateur et date.

Les fichiers existants sont préservés. La mise à jour conserve `SeaPilotRoot` et
publie un nouvel exécutable sans interrompre les anciens transferts. Le lanceur
ne change pas les permissions Google Drive. La configuration des collaborateurs
reste réservée aux gestionnaires autorisés.

## Création et import

**Nouveau document → Nouvelle Procédure → Ouvrir** copie le modèle fourni dans
`Procedures`, crée la fiche, ferme la fenêtre puis ouvre le document dans Word.
Le nom est **Thème Numéro Version - Titre.docx**. Version initiale : **A**.
Les informations saisies décrivent la fiche ; le modèle Word reste à compléter.
Le thème suit le chapitre ISM selon la correspondance documentée dans
[Création et ISM](procedures-template-ism.md).

**Importer un fichier** copie directement le fichier dans `Procedures`, avec le
même nommage et son extension d'origine. Formats : DOC/DOCX, XLS/XLSX, PPT/PPTX,
ODT/ODS/ODP, TXT et PDF, entre 1 octet et 25 Mo. Aucun choix de stockage, lien
Google ou chemin manuel n'est demandé.

L'ouverture des sources utilise le document enregistré autorisé par le serveur.
Un fichier différent portant le même nom n'est jamais écrasé : modifier la
version ou le numéro. Une reprise avec des octets identiques est possible.
Une suppression de fiche conserve le fichier Drive. Pour changer le chemin d'une
ancienne source, importer le fichier à jour depuis la fiche.

## Publication et consultation

Enregistrer le document dans Office, puis cliquer sur **Publier**. Le lanceur
convertit une copie de la version enregistrée avec Word, Excel ou PowerPoint
selon son format, ou conserve un PDF source. Il écrit le résultat dans
`SeaPilot/Procedures PDF`, sous **Thème Numéro Version - Titre.pdf**. La
conversion ne ferme pas le document de travail. Les macros sont désactivées
pendant la conversion, limitée à une minute. L'application Office correspondante
est requise sur le poste qui publie.

Après vérification des octets et de l'empreinte SHA-256, le RPC
`publish_procedure_drive` enregistre le PDF et actualise le cycle de vie dans une
seule transaction. Une reprise du même reçu ne crée pas de doublon. Un cache
local d'empreintes dans `%LOCALAPPDATA%/SeaPilotDrive/PublicationReceipts` permet
de réessayer après une interruption sans reconvertir une source inchangée.
Changer la version pour publier un contenu différent sous une nouvelle référence.

Administration et Direction gèrent les sources. Armement, Capitaine et Marin
consultent uniquement les PDF publiés ; aucune action de modification, publication
ou suppression ne leur est proposée. Les nouvelles lectures depuis l'application
utilisent le lanceur Windows, le dossier PDF synchronisé et un contrôle de taille
et d'empreinte. Une copie modifiée après publication est refusée.

Le dossier PDF reste également consultable et téléchargeable dans Google Drive
sur les autres appareils, avec le compte Google autorisé. Attendre la fin de la
synchronisation avant de changer de poste. Sur un poste de consultation, rendre
le dossier partagé `Procedures PDF` disponible sous la racine SeaPilot locale.

Les ACL Google Drive et les rôles SeaPilot sont distincts : réserver les sources
aux gestionnaires et partager seulement `Procedures PDF` en **Lecteur** avec les
comptes de consultation. Selon la demande, le partage initial est limité aux
adresses BBTM, sans invitation des adresses externes ni notification par e-mail.
Les changements futurs d'habilitation nécessitent d'actualiser les ACL Drive.
Aucun partage public n'est nécessaire.

## Ouverture dans les applications de bureau

Cliquer sur le nom d'une procédure ou sur **Ouvrir** ouvre le fichier synchronisé
dans l'application Windows associée à son extension : Word pour DOC/DOCX/DOTX, Excel
pour XLS/XLSX et le lecteur PDF par défaut pour les publications PDF. Le document
Drive lui-même est ouvert, avec son chemin complet, y compris les sous-dossiers
des publications migrées. Aucun téléchargement d'une copie de travail n'est
déclenché par cette action. Les modifications enregistrées dans Office sont
synchronisées par Google Drive, selon les droits du compte Google connecté.

Pour les références migrées, `document_drive_lookup` vérifie les droits du vrai
compte SeaPilot avant de fournir le chemin autorisé. Le préfixe `SeaPilot/` est
retiré une seule fois pour construire l'URI `seapilot-drive://root/open/...`,
relative à la racine configurée sur ce PC. Une référence refusée ou un chemin
invalide n'ouvre aucun fichier et ne retombe pas sur une ancienne copie Supabase.
Les publications enregistrées directement dans le dossier PDF synchronisé
conservent leur contrôle de taille et d'empreinte avant l'ouverture.

Google Drive pour ordinateur doit avoir terminé la synchronisation et le lanceur
SeaPilot doit être enregistré sur le poste. Les lanceurs 2.6 et 2.7 ouvrent les
DOC/DOCX, XLS/XLSX et PDF. L'archive 2.7.1 ajoute l'ouverture des modèles Word DOTX
sans macros ; l'installation conserve la racine configurée. Les formats des
opérations d'import, d'écriture et de conversion ne changent pas. Ce correctif
ne nécessite aucune migration de base de données. Le navigateur peut demander d'autoriser l'ouverture
du lanceur. Le lecteur PDF est celui choisi dans les applications par défaut de
Windows.

Le bouton **Télécharger** conserve sa fonction distincte. Sur mobile ou sur un
appareil sans lanceur Windows, les documents migrés restent consultables avec
l'aperçu de la publication accessible depuis sa notification ou avec
**Télécharger**. L'aperçu utilise la passerelle Drive authentifiée et ne lance
aucune application de bureau. Les publications disposant uniquement d'un chemin
local continuent à nécessiter le lanceur pour leur aperçu dans SeaPilot.

## Déploiement et contrôles

Appliquer `20260925072400_procedures_drive_workflow.sql` puis
`20260925073813_procedures_drive_receipt_validation.sql` avant le frontend. Les
sources Drive peuvent désormais avoir un chemin sans identifiant cloud. Les PDF
Drive ont des métadonnées distinctes des sources et des politiques RLS de lecture
seule. Les RPC sont exécutés avec les droits du vrai compte connecté, et aucune
fonction de lecture de fichiers serveur n'est utilisée.

Le pont local est temporaire, limité à la boucle locale, aux origines SeaPilot
prévues et à une session aléatoire. Il transmet le jeton SeaPilot pour vérifier
les droits sans le mémoriser. Les chemins, formats et jonctions sont contrôlés.
Aucune nouvelle dépendance ni variable d'environnement n'est requise.

Après une modification du lanceur, reconstruire son archive :

```powershell
Compress-Archive -LiteralPath scripts/drive/SeaPilotDrive.cs,scripts/drive/SeaPilotDriveBridge.cs,scripts/drive/Install-SeaPilotDrive.ps1,scripts/drive/Install-SeaPilotDriveBinary.ps1,scripts/drive/Installer.cmd,scripts/drive/LISEZ-MOI.txt -DestinationPath public/connectors/seapilot-drive-windows.zip -Force
corepack pnpm test src/features/procedures src/features/documents/localDriveLauncher.test.ts src/features/chemicals/chemicalDrive.test.ts
powershell.exe -NoProfile -File scripts/drive/Test-SeaPilotDrive.ps1
corepack pnpm build
```

Exécuter aussi `supabase/tests/procedures_drive_workflow_test.sql` : les fixtures
Admin, Direction, Capitaine et Marin sont annulées en fin de transaction. Les
tests vérifient les accès aux sources, les PDF en lecture seule, les reçus, les
reprises et les chemins interdits. La conversion réelle Word a été vérifiée sur
le modèle fourni, sans ajouter de document d'essai au dossier partagé.

L'ouverture de bureau réutilise les fichiers Drive existants et leurs droits.
Elle ne crée ni ne déplace de document. Les anciennes sauvegardes ne sont jamais
réactivées automatiquement comme sources de travail. Les tests frontend couvrent
les sources pour Administration/Direction, les PDF publiés pour
Administration/Direction/Armement/Capitaine/Marin, les chemins migrés imbriqués,
les erreurs d'ouverture et l'aperçu conservé depuis les notifications. Les règles
RLS des sources et publications restent inchangées.
