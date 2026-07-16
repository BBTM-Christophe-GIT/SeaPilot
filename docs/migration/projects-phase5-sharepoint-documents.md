# Projets — frontière documentaire Supabase / SharePoint (phase 5)

Date de livraison : 16 juillet 2026.

## Architecture livrée

| Responsabilité | Système de référence |
|---|---|
| Projet, relation projet-document et métadonnées techniques | Supabase (`project_documents`, `contract_documents`) |
| Contenu binaire, version du fichier et autorisations documentaires | SharePoint (`Documents Projets`, `Documents Contractuels`) |
| Consultation | SeaPilot lit les métadonnées Supabase puis ouvre l’URL SharePoint d’origine dans un nouvel onglet |
| Ajout, remplacement, déplacement ou suppression d’un fichier | SharePoint uniquement |

SeaPilot ne lit pas le contenu pour l’afficher, ne le télécharge pas en arrière-plan et ne le copie ni dans Supabase Storage, ni dans Vercel, ni dans le dépôt Git. Aucun bucket Supabase Storage n’est créé. Les URL restent des URL protégées du tenant `bbtm668.sharepoint.com` ; aucune URL publique ou signée n’est fabriquée.

## Métadonnées conservées

Les deux tables stockent notamment :

- l’identité stable de la source (`sharepoint_drive_id`, `sharepoint_drive_item_id`, identifiants liste/item disponibles) ;
- l’URL SharePoint originale, le chemin et le dossier ;
- le nom, l’extension, le type MIME et la taille ;
- ETag, CTag et dates source lorsqu’ils sont fournis par SharePoint ;
- les instantanés projet (ID SharePoint, code et titre) utilisés par la résolution vers `projects.id`.

Les dossiers renvoyés par l’API de liste sont ignorés par l’import. L’upsert repose sur `(sharepoint_drive_id, sharepoint_drive_item_id)` et peut être rejoué : il met à jour la ligne existante, sans purge, prune ou suppression implicite.

## Règles de consultation

- le lien « Ouvrir dans SharePoint » n’est rendu que pour une URL HTTPS du tenant `bbtm668.sharepoint.com` située sous `/sites/QHSE` ;
- la validation ne transforme pas l’URL : le `href` reste la valeur originale de Supabase ;
- une URL absente ou invalide reste visible comme anomalie, sans lien cliquable de secours ;
- les métadonnées en doublon sont réduites à une ligne pour la consultation et leur nombre est signalé ; la base n’est pas modifiée par ce dédoublonnage d’affichage ;
- une ligne sans `project_id` résolu est comptée et signalée ; ses instantanés historiques restent disponibles pour la réconciliation ;
- SeaPilot ne sonde pas l’URL protégée. Un fichier déplacé ou supprimé est donc constaté lors de l’ouverture dans SharePoint, puis corrigé par rafraîchissement des métadonnées ;
- si Microsoft 365 demande une authentification, l’utilisateur se connecte dans Microsoft 365 avec un compte autorisé. SeaPilot ne contourne pas les autorisations SharePoint.

## Rafraîchissement idempotent

La commande suivante étend la chaîne d’export/import existante et ne récupère que les champs de liste des deux bibliothèques :

```powershell
npm run refresh:sharepoint:project-documents
```

Le comportement par défaut est un dry-run :

1. export récursif des métadonnées dans `.data/sharepoint-project-documents.json` (répertoire ignoré par Git) ;
2. validation du mapping et comptage des lignes ;
3. aucune écriture Supabase.

Après contrôle de l’export et des volumes, l’application explicite est :

```powershell
npm run refresh:sharepoint:project-documents -- --apply
```

Prérequis : session CLI Microsoft 365 authentifiée avec accès en lecture aux deux bibliothèques, `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` fournis hors Git. L’application effectue les upserts puis appelle `resolve_sharepoint_project_document_links()`. La commande ne contient aucune opération de suppression et n’appelle aucune API de téléchargement de fichier.

## Lien de dépôt dans un dossier

La phase 0 confirme les chemins des bibliothèques, mais ne valide ni une convention unique de dossier par projet, ni un besoin métier de dépôt depuis SeaPilot, ni la matrice d’autorisation associée. Aucun lien de dossier n’est donc exposé dans cette phase. Un ajout ultérieur devra partir d’un dossier canonique confirmé par projet et conserver l’ouverture directe dans SharePoint.

## Contrôles couverts

- URL autorisée, absente, mal formée, hors tenant, hors site et protocole non HTTPS ;
- conservation exacte de l’URL valide ;
- dédoublonnage par identité drive/item ;
- affichage des anomalies et de l’aide Microsoft 365 ;
- filtrage des dossiers à l’import ;
- mapping des métadonnées des deux bibliothèques ;
- export récursif par titre lorsque le List ID n’est pas configuré ;
- index d’upsert et rejeu sans doublon dans les tests Supabase.

## Risques résiduels

- un déplacement SharePoint peut changer l’URL sans être visible avant le prochain rafraîchissement ;
- le contrôle de disponibilité ne peut pas être réalisé depuis le navigateur sans requête SharePoint authentifiée, ce qui est volontairement exclu ;
- les documents déjà orphelins ou dupliqués doivent être réconciliés à partir du rapport de rafraîchissement ; aucune suppression automatique n’est autorisée ;
- l’exécution live du rafraîchissement dépend d’une session Microsoft 365 et des variables Supabase de l’opérateur.

**Arrêt de phase 5 : l’intégration documentaire est limitée aux métadonnées Supabase et à l’ouverture protégée dans SharePoint. Aucun fichier n’a été déplacé.**
