# QHSE — Produits Chimiques · 3.49.0

QHSE → Produits Chimiques est activé pour Administration, Direction, Armement,
Capitaine et Marin. Chaque profil peut consulter et gérer l'inventaire des navires de
sa société active, sélectionner les neuf pictogrammes SGH, modifier le stock en litres,
ajouter des FDS et exporter un PDF BBTM par navire. Les illustrations des navires et
Flotte servent de filtres. La recherche ne réduit pas le contenu de l'export.

## Inventaire initial

- GOURY : les dix lignes du PDF fourni « Inventaire des Produits Chimiques - GOURY »
  (affectation explicitement demandée), neuf colonnes et pictogrammes, total 130 L.
- LANDEMER : les quatorze références de la capture, affectation confirmée. Le format
  « Base 2, 4,5 L » est une variante, pas un stock constaté. Stocks inconnus à NULL ;
  dangers, pictogrammes, EPI et précautions absents restent à renseigner.
- Aucun danger ni classement n'est déduit du seul nom commercial. Les textes du PDF
  sont transcrits tels que fournis, dont « 314 » pour Carban PLus 3. Ils restent à
  confronter à la FDS. Le document d'inventaire n'est pas enregistré comme FDS.
- Les données initiales sont identifiées par `source_ref` pour éviter les doublons.
  La démonstration publique contient uniquement des produits et navires fictifs.

## Documents Google Drive

Fichiers stockés exclusivement sous la racine synchronisée configurée pour le PC :

`SeaPilot / Produits Chimiques / NAVIRE - c<entreprise>-v<navire> / <produit UUID> / <pièce UUID>-fichier`

Le lanceur Windows **2.2.0** crée les dossiers lors du premier ajout. L'archive est
disponible dans Administration → Documents et Google Drive. Sa mise à jour conserve
la racine existante. Le PC de développement a été mis à jour en conservant
`G:\Mon Drive\SeaPilot`, et le dossier Produits Chimiques y a été créé.

Les fichiers PDF, PNG, JPEG, DOCX, XLSX et TXT sont acceptés, jusqu'à 20 Mo chacun.
Supabase conserve uniquement leurs références, taille, type et empreinte SHA-256.
Une lecture passe par `chemical_drive_scope` avec le produit et la pièce exacte ;
le lanceur vérifie les droits, le chemin, la taille et l'empreinte. Il ne permet pas
de parcourir arbitrairement Drive. Un document changé ou déplacé doit être ajouté
comme nouvelle version. Le retrait d'une pièce ou d'un produit conserve les originaux.

Les opérations documentaires (ajout, téléchargement et PDF avec annexes) nécessitent
Windows, le lanceur 2.2 et le dossier Google Drive synchronisé sur le PC. La consultation,
le CRUD de l'inventaire et le PDF sans annexes restent disponibles sans lanceur.
Les comptes Google Drive doivent disposer du partage du dossier Produits Chimiques ;
les droits Drive sont indépendants de la matrice de profils SeaPilot.

Le PDF comprend les neuf colonnes complètes, les pictogrammes, les observations et la
liste des documents. L'option pièces jointes fusionne les PDF, ajoute les images et
incorpore les autres formats dans le panneau des fichiers joints du lecteur PDF.
Si une annexe ne peut pas être lue, l'export échoue explicitement, sans dossier incomplet.

## Déploiement et droits

Appliquer dans l'ordre les migrations (déjà appliquées au projet BBTM) :

1. `20260922093349_qhse_chemical_inventory.sql` : tables, RLS, profils, import.
2. `20260922095332_chemical_documents_google_drive.sql` : références Drive et RPC.
   Elle supprime le bucket provisoire vide de la première migration. Elle refuse de
   s'exécuter si des fichiers ont été ajoutés entre-temps, pour éviter toute perte.

Les fichiers ne transitent pas par Supabase Storage. Les tables et RPC refusent
l'accès anonyme, une autre société, une adhésion inactive ou un profil désactivé dans
la matrice. Les modifications de produits utilisent une version pour refuser les
écrasements concurrents. L'archivage conserve la trace des produits et les fichiers.

## Vérification

- Vitest : catalogue cinq profils, CRUD complet, stocks inconnus/0/décimaux,
  recherche/navires, pictogrammes, fichiers, conflits, pagination au-delà de 1 000 lignes,
  validation Drive et génération/assemblage PDF.
- `supabase/tests/chemical_inventory_access_test.sql` : cinq identités Auth réelles
  en transaction annulée, avec Marin et Capitaine indépendants de toute simulation
  d'Administration ; CRUD, imports, droits Drive, révocation et isolation des sociétés.
- `scripts/drive/Test-SeaPilotDrive.ps1` : compilation native et HTTP local, contrôles
  d'origine/nonce/session, lecture limitée, empreinte/taille, jonctions, non-écrasement,
  installation répétée et échec de compilation sans dommage.
- Edge : inventaires de 10/14 lignes injectés seulement dans la recette locale,
  filtres, recherche, fiche produit, ajout, export sans/avec annexe, bureau et mobile.
  Aucun inventaire réel n'est publié dans les fixtures de démonstration.
- PDF GOURY : 6 pages d'inventaire ; 8 avec document de test en annexe, extraction
  du texte et inspection des pages rendues. Le document de test n'est jamais ajouté
  aux données de production.

Les droits SQL et le transport natif sont vérifiés séparément ; aucune FDS réelle
n'a été créée pour les essais. Un compte Drive sur un autre PC nécessite son propre
partage et sa synchronisation.
