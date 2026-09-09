# Module Levage

Le module `/modules/lifting` comporte trois sections avec leurs icônes : **Examen à fond - Grue**, **Registre des Apparaux de Levage**, **Remorques**. Cette livraison rend opérationnels les deux registres. La section grue présente un accès aux certificats existants ; son questionnaire spécifique reste une étape ultérieure.

## Utilisation

1. Choisir un navire puis la section Apparaux ou Remorques.
2. Ajouter ou modifier le matériel : identifiant, type, description, CMU facultative, numéro de série, emplacement, notes. La suppression retire le matériel de l’inventaire actif ; le filtre des matériels supprimés permet sa restauration.
3. Démarrer un contrôle annuel avec sa date d’émission et son échéance. Un an est proposé, ajustable avant création. Un contrôle est conservé par navire, section et année d’émission.
4. Pour chaque matériel, enregistrer la décision, les points EG, NID, V1 à V5 du registre source et les observations. Choisir « Sans objet » pour les points non applicables. Une saisie partielle peut être enregistrée puis reprise depuis un autre appareil connecté.
5. Télécharger le PDF brouillon pour vérifier le contenu. Les réparations, retraits et matériels non présentés nécessitent des observations. Un défaut ne peut pas être associé à un maintien en service sans réserve.
6. Finaliser : le PDF porte le nom et le tampon fourni d’**Antoine MONCEAUX**. La finalisation est explicite dans l’interface. Le contrôle devient non modifiable.

Le PDF final est automatiquement enregistré dans le compartiment privé `fleet-certificates`, sous le navire (`société/acronyme/lifting/contrôle/version-uuid.pdf`). Une fiche et sa version documentaire sont créées dans **Certificats flotte**, avec les dates exactes du contrôle, le vérificateur et la catégorie :

| Section | Catégorie |
| --- | --- |
| Apparaux | 08.3 - Accessoires de levage |
| Remorques maritimes | 08.5 - Remorques |

Les alertes d’échéance existantes des certificats s’appliquent. Le statut de validité documentaire ne remplace pas les réserves et décisions de chaque matériel dans le PDF.

## Données initiales et traçabilité

Chargement initial limité au **SUROIT** : **56 apparaux et 8 remorques**, identifiants d’origine conservés, sans inventer de CMU manquante.

| Source | Émission inscrite | Échéance inscrite | Contenu |
| --- | --- | --- | --- |
| SUR - Registre des apparaux de levage - 2026.pdf, retrouvé dans SharePoint | 22/01/2026 | 22/01/2027 | 56 apparaux |
| SUR - Registre des remorques - 2026.pdf, fourni | 26/11/2025 | 26/11/2026 | 8 remorques |
| SUR - Examen à fond - Apparaux de levage - 2025.pdf, fourni | 18/12/2025 | Non indiquée dans ce PDF | Rapport de grue, consulté pour préparer la troisième section |

Le `.iqy` fourni contient la connexion à la liste SharePoint `87fd9c1e-1f76-4ee2-93c2-a0399a6f3e9b`, pas ses lignes. La session CLI Microsoft 365 n’étant pas connectée, la transcription s’appuie sur les PDF accessibles. Ce chargement ne représente pas l’ensemble de la liste ni de la flotte et ne met pas en place de synchronisation SharePoint.

Les PDF historiques restent les originaux déjà stockés dans Certificats flotte : ils ne sont pas régénérés ni signés à nouveau. Leurs dates d’émission et catégories ont été complétées dans les métadonnées. Le rapport de remorques figure sous l’année d’émission **2025**, même si son nom de fichier indique 2026. Les décisions avec réparation des IDs **260, 282 et 283** et les cases vides des sources sont conservées ; une case vide n’est interprétée ni comme conforme ni comme sans objet.

## Accès et conservation

- Admin, Direction, Armement : gestion de l’inventaire et finalisation.
- Capitaine et Marin : consultation et saisie des contrôles sur les navires accessibles selon les règles réelles du planning et les affectations. Les fonctions SQL contrôlent les droits indépendamment de l’interface.
- Aucun accès anonyme aux données. Le tampon est conservé dans `lifting-assets`, accessible uniquement aux profils de gestion de la société. Aucun tampon ni inventaire réel n’est inclus dans les données de démonstration publiques.

Les tables `lifting_inventory`, `lifting_inspections`, `lifting_inspection_entries` ont la RLS activée. Les mutations passent exclusivement par des RPC contrôlés. Chaque contrôle copie les caractéristiques du matériel et du navire au démarrage. Les éditions ultérieures de l’inventaire ne modifient donc pas les rapports déjà créés, y compris les brouillons existants. Un matériel ajouté ensuite sera inclus au prochain démarrage de contrôle.

La révision du contrôle protège contre l’écrasement par un deuxième appareil et contre la publication d’un PDF devenu obsolète. La création du certificat, de sa version et la finalisation du contrôle sont atomiques et idempotentes. En cas de réponse réseau incertaine, un fichier temporaire peut rester stocké ; le client ne supprime jamais un PDF qui pourrait déjà être rattaché à un rapport finalisé.

## Exploitation et validation

- Migrations : `20260909070600_lifting_inventory_and_annual_inspections.sql`, `20260909070844_lifting_suroit_verified_pdf_import.sql`, `20260909071308_lifting_publication_revision_guards.sql`.
- Provisionner le tampon PNG fourni dans `lifting-assets/<company_id>/antoine-monceaux.png` via un accès d’administration, sans exposer de clé serveur au navigateur. Le fichier n’est pas versionné dans Git. Aucun nouveau paramètre d’environnement client n’est nécessaire.
- Vérifications : tests React/modèle/PDF, tests des certificats et permissions, build de production ; `supabase/tests/lifting_inventory_workflow_test.sql` vérifie avec rollback les profils Admin/Direction/Armement/Capitaine/Marin, la séparation des remorques, les snapshots, l’archivage/restauration, les révisions, la publication et son idempotence.
- Interface vérifiée dans le navigateur intégré : 1440 × 1000, 390 × 844 et 412 × 915 ; création d’un contrôle, saisie mobile d’une réparation, progression et changement de section. Aucun débordement horizontal ni erreur console relevé. Les profils Marin/Capitaine sont validés par les fixtures SQL et de composant, pas par une simulation de session.
- PDF de 56 lignes inspecté après rendu : quatre pages, en-têtes répétés, tableau lisible, pagination et tampon.
- L’interface est une application web responsive nécessitant une connexion pour enregistrer. Les tests ne constituent pas une exécution sur Safari iOS ou une application native iOS/Android.

Documentation technique consultée : [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [déploiements Vercel](https://vercel.com/docs/deployments).
