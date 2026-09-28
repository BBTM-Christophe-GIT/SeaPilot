# Projets — stockage Google Drive et version 3.60.0

## Organisation et compatibilité

Les nouveaux documents du module Projet sont écrits dans la racine Google Drive déjà configurée dans Administration, sous `SeaPilot/Projet/Projet-<id>/<rubrique>/<fichier>`. L’identifiant du dossier est celui de la fiche Supabase : changer le numéro ou le titre du projet ne crée pas un second dossier. Rubriques : Contrat, HSE, Facturation, Operations, Offres, et catégories documentaires complémentaires existantes.

Le lanceur Windows commun **2.5.0** est requis pour ajouter les fichiers et assembler leurs octets dans les exports. Mettre à jour depuis Administration → Documents et Google Drive ; la racine et les réglages existants sont conservés. Les fichiers historiques disposant d’un identifiant Drive s’ouvrent aussi directement dans le navigateur. Les logos clients et photos du catalogue restent des ressources communes, indépendantes des dossiers projets.

Les modèles PDF existants sont conservés : relevé de facturation, offres et contrats SUPPLYTIME, remorquage et coque nue. L’aperçu PDF.js affiche les octets du générateur de production. Un export téléchargé est également classé dans Facturation. La quantité proposée aux nouvelles prestations compte les journées/navires distincts des DPR 24/24 Operation et Crew Change de la sélection ; une quantité enregistrée ou modifiée manuellement, y compris zéro, n’est pas remplacée.

## Base de données et droits

Migration `20260928060640_project_workspace_drive_and_references.sql` : deux tables additives, `project_drive_files` et `project_billing_client_references`, avec RLS, et adaptation du contrôle d’existence des documents enregistrés. Les tables, identifiants, URL, documents et événements historiques ne sont ni réécrits ni supprimés.

Les anciennes adresses logiques restent utilisables. Une correspondance Drive vérifiée est recherchée avant la source d’origine. Les lectures locales contrôlent chemin, droits, taille et SHA-256 ; une copie altérée est refusée. Le serveur valide le projet et l’entreprise avant toute écriture. Le lanceur refuse traversées de chemin, jonctions, écrasements et fichiers hors périmètre ; maximum 50 Mio pour Projet, limites des autres modules inchangées. Retirer un lien métier conserve le fichier Drive. Les partages Drive restent indépendants et ne sont jamais élargis par cette migration.

Une référence client est mémorisée par projet et combinaison des trois rubriques d’export : bit 1 loyers, bit 2 frais fournisseurs, bit 4 prestations BBTM. La référence historique reste disponible pour sa composition d’origine ; aucune ancienne fiche mensuelle n’est modifiée par le déploiement.

## Transfert des archives

1. Sauvegarder hors dépôt toutes les lignes originales des projets, contrats, échéanciers, pièces, facturation, planning, DPR et historique.
2. Exécuter en PowerShell 7 `scripts/drive/Migrate-ProjectDocuments.ps1 -DriveRoot '<racine SeaPilot>' -WorkDirectory '<dossier privé>'`. Authentifications Supabase CLI et Microsoft Graph autorisées requises ; clés uniquement en mémoire.
3. Si Microsoft refuse le contenu malgré l’accès aux métadonnées, télécharger les originaux dans la session SharePoint autorisée et passer `-LegacySourceDirectory '<dossier des originaux>'`. Le script vérifie notamment la taille annoncée par Graph. Aucun fichier destination différent n’est écrasé.
4. Attendre la synchronisation et relire les copies depuis Google Drive. Comparer taille, SHA-256 et MD5 avec `drive-manifest.json`. Produire `cloud-verified.json` avec `path`, `bytes`, `sha256`, `md5`, `driveFileId`. Ne pas commettre ces manifestes contenant les données client.
5. Appliquer la migration, puis relancer avec `-Activate`. Le script exige une correspondance cloud vérifiée pour chaque entrée et relit chaque routage enregistré. Les sources originales restent conservées.
6. Comparer les enregistrements complets avant/après par identifiant, pas uniquement les nombres de lignes.

Le 28 septembre 2026, l’inventaire comporte 45 projets, 45 contrats, 69 lignes de planning, 415 événements, 1 159 DPR et 46 documents liés (16 contrats, 13 documents générés, 17 pièces de facturation). Les huit contrats SharePoint ont été récupérés dans la session Chrome autorisée. Les 46 copies Drive ont été relues et vérifiées octet par octet. Une pièce Storage sans rattachement métier est également conservée séparément dans Facturation, sans inventer de lien vers une facture.

## Validation et retour arrière

Tests du module Projet, des références, du calcul des jours, des fichiers et des autres consommateurs du lanceur ; suite native `scripts/drive/Test-SeaPilotDrive.ps1`. Les 17 assertions SQL de `supabase/tests/projects_drive_workspace_test.sql` vérifient Admin, Direction, Capitaine et Marin, les métadonnées et les refus d’accès avec des profils réels de test. Les transactions de test sont annulées, sans conserver les fixtures.

Le déploiement de l’ancienne application reste possible, car les colonnes et sources historiques sont intactes. Conserver les deux nouvelles tables et les fichiers Drive : de nouveaux fichiers créés après la livraison peuvent n’exister que dans Drive. Ne jamais supprimer un dossier pour revenir à une ancienne interface.
