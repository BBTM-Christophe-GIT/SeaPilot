# RH / Brevets : documents administratifs et Google Drive

Le catalogue propose **Attestation de droits** et **Carte Vitale** dans
**Documents administratifs**. La migration `hr_documents_google_drive` ajoute
ces deux types et les références Drive à `hr_documents`.

Les ajouts et renouvellements enregistrent le fichier dans
`SeaPilot/Ressources Humaines/Prénom NOM - c<entreprise>-p<collaborateur>`.
Un identifiant unique dans le nom évite d'écraser une version existante.
SeaPilot conserve les métadonnées, la taille et l'empreinte SHA-256. La lecture
utilise toujours la référence Drive quand elle existe, même si une référence
historique Supabase ou SharePoint reste présente comme sauvegarde.

Les téléchargements individuels et ZIP passent par le lanceur Windows **2.4.0**,
qui vérifie les droits RH du document avec le serveur, puis sa taille et son
empreinte. Le serveur fournit le chemin à lire : le navigateur ne peut pas
choisir un autre fichier. Les téléchargements ZIP sont séquentiels pour ne pas
saturer le serveur local du lanceur. Les erreurs précisent le fichier ou la
connexion à vérifier, et la sélection reste présente après un échec.

## Configuration et droits

Installer la mise à jour depuis **Administration → Documents et Google Drive**
sur chaque poste Windows utilisant les pièces RH. Le dossier déjà configuré est
conservé. Drive pour ordinateur doit être connecté au compte disposant de l'accès
au dossier. Les fichiers s'enregistrent localement puis Google les synchronise ;
attendre la fin de la synchronisation avant de les ouvrir sur un autre poste.
Cette intégration nécessite le lanceur Windows ; les transferts ne sont pas
disponibles sur mobile ou sur un poste sans ce lanceur.

Les RPC sont `SECURITY INVOKER`, avec session obligatoire, et utilisent les
politiques RH existantes : lecture du propre dossier pour Marin, périmètre de
bordée pour Capitaine, gestion pour Administration/Direction/Armement. Le trigger
interdit de rattacher une pièce à un autre dossier que celui du collaborateur.
Les partages Google Drive restent indépendants des rôles SeaPilot et ne sont pas
modifiés par le lanceur.

Formats : PDF, PNG/JPEG, DOC/DOCX, XLS/XLSX, PPT/PPTX, OpenDocument et TXT ;
25 Mo maximum. Les extensions DOCM/XLSM/PPTM ne sont pas acceptées.
Supprimer une fiche Drive conserve son fichier. Renouveler conserve la version
précédente. Si l'enregistrement des métadonnées échoue après une écriture, le
fichier est conservé pour récupération et l'application signale l'échec.

## Migration des pièces existantes

`scripts/drive/Migrate-HrDocuments.ps1` copie les objets du bucket `hr-documents`
et les originaux de la bibliothèque SharePoint **Brevets et Visites Médicales**.
Les références d'origine sont conservées. Les collaborateurs historiques non
rattachés restent identifiés par leur identifiant SharePoint ou, à défaut, leur
nom enregistré dans un dossier historique distinct, sans rattachement arbitraire
à un compte courant.

`hr_legacy_document_metadata` permet la mise à jour des métadonnées de ces
imports sans identifiant. Le contrôle d'entreprise continue de vérifier chaque
création et changement de collaborateur ou d'entreprise ; les règles RLS
et la validation des chemins Drive restent actives.

Le script produit dans un dossier hors Git `before.json`, `manifest.json` et,
si nécessaire, `unavailable.json`. Un original SharePoint récupéré par le
connecteur peut être fourni dans `-SharePointFiles` sous `<id>.source` ; sa taille
est comparée à la bibliothèque. Toute source inaccessible est signalée et reste
inchangée en base.

Avant `-Activate`, télécharger les copies cloud et comparer leurs octets aux
originaux. Le fichier `cloud-verified.json` doit contenir, pour chaque pièce,
`id`, `path`, `bytes`, `md5` et `driveFileId`. L'activation vérifie l'intégralité
du manifeste et utilise `updated_at` pour refuser d'écraser une modification
concurrente. Ne jamais versionner les manifestes, pièces ou URL temporaires.

## Vérifications

- Tests Vitest : catalogue, création, renouvellement, sélection individuelle et
  ZIP, priorité Drive, intégrité des fichiers et erreur de version du lanceur.
- `supabase/tests/hr_document_drive_test.sql` : vrais profils authentifiés,
  contrôle des lectures/écritures et rejet des références forgées, transaction
  annulée après les assertions.
- `scripts/drive/Test-SeaPilotDrive.ps1` : écriture/lecture native, chemin fourni
  par le serveur, empreinte incorrecte, dossier interdit, origine et session.
- Vérification navigateur du formulaire et des deux options administratives ;
  la préversion n'est pas utilisée pour démontrer les droits Marin/Capitaine.
- Build de production et lint.

Références : [téléchargements Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0),
[Google Drive pour ordinateur](https://support.google.com/drive/answer/10838124?hl=fr).
