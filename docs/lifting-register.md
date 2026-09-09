# Module Levage

Le module `/modules/lifting` comporte trois sections avec leurs icônes : **Examen à fond - Grue**, **Registre des Apparaux de Levage**, **Remorques**. Cette livraison rend opérationnels les deux registres. La section grue présente un accès aux certificats existants ; son questionnaire spécifique reste une étape ultérieure.

## Utilisation

1. Choisir un navire puis la section Apparaux ou Remorques.
2. Ajouter ou modifier le matériel : type d’accessoire, sous-type pour les remorques, description, CMU facultative, numéro de série, emplacement, notes. L’identifiant est un nombre automatique et non modifiable, à partir de 1 par navire et registre. Les numéros ne sont pas réutilisés après suppression. La suppression retire le matériel de l’inventaire actif ; le filtre des matériels supprimés permet sa restauration.
3. Démarrer un contrôle annuel avec sa date d’émission et son échéance. Un an est proposé, ajustable avant création. Un contrôle est conservé par navire, section et année d’émission.
4. Le formulaire présente tous les matériels regroupés par type d’accessoire. Seuls les codes applicables sont affichés, avec leurs cases précochées. Une case décochée signifie un point insatisfaisant : son code et le matériel affichent une icône rouge. Le résultat du matériel est insatisfaisant dès qu’un seul point applicable échoue, indépendamment de la décision. Enregistrer un matériel ou tous les contrôles en une seule transaction. Les valeurs proposées ne comptent pas comme un contrôle réalisé tant qu’elles ne sont pas enregistrées.
5. Télécharger le PDF brouillon pour vérifier le contenu. Les trois décisions sont **Maintien en service**, **Maintien en service après réparation**, **Mise au rebut**. Les deux dernières nécessitent une observation avant finalisation. Les observations sont reprises dans le rapport. Décocher une case propose automatiquement la réparation si le maintien simple était sélectionné. Un défaut ne peut pas être associé à un maintien en service sans réserve.
6. Finaliser : le PDF porte le nom et le tampon fourni d’**Antoine MONCEAUX**. La finalisation est explicite dans l’interface. Le contrôle devient non modifiable.

Le PDF final est automatiquement enregistré dans le compartiment privé `fleet-certificates`, sous le navire (`société/acronyme/lifting/contrôle/version-uuid.pdf`). Une fiche et sa version documentaire sont créées dans **Certificats flotte**, avec les dates exactes du contrôle, le vérificateur et la catégorie :

| Section | Catégorie |
| --- | --- |
| Apparaux | 08.3 - Accessoires de levage |
| Remorques maritimes | 08.5 - Remorques |

Les alertes d’échéance existantes des certificats s’appliquent. Le statut de validité documentaire ne remplace pas les réserves et décisions de chaque matériel dans le PDF.

## Données initiales et traçabilité

Chargement initial limité au **SUROIT** : **56 apparaux et 8 remorques**, renumérotés de 1 à 56 et de 1 à 8. Les identifiants d’origine sont conservés dans `legacy_reference`, affichés dans les fiches, recherchables et repris dans les nouveaux PDF, sans inventer de CMU manquante.

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

- Migration des formulaires et de la numérotation : `20260909191741_lifting_accessory_checklists.sql`.
- Migrations initiales : `20260909070600_lifting_inventory_and_annual_inspections.sql`, `20260909070844_lifting_suroit_verified_pdf_import.sql`, `20260909071308_lifting_publication_revision_guards.sql`.
- Provisionner le tampon PNG fourni dans `lifting-assets/<company_id>/antoine-monceaux.png` via un accès d’administration, sans exposer de clé serveur au navigateur. Le fichier n’est pas versionné dans Git. Aucun nouveau paramètre d’environnement client n’est nécessaire.
- Vérifications : tests React/modèle/PDF, tests des certificats et permissions, build de production ; `supabase/tests/lifting_inventory_workflow_test.sql` vérifie avec rollback les profils Admin/Direction/Armement/Capitaine/Marin, la séparation des remorques, les snapshots, l’archivage/restauration, les révisions, la publication et son idempotence.
- Interface vérifiée dans le navigateur intégré : 1440 × 1000, 390 × 844 et 412 × 915 ; création d’un contrôle, saisie mobile d’une réparation, progression et changement de section. Aucun débordement horizontal ni erreur console relevé. Les profils Marin/Capitaine sont validés par les fixtures SQL et de composant, pas par une simulation de session.
- PDF : pages de résultats A4 paysage, dernière page de notice sous forme de matrice A3 paysage. Français puis traduction anglaise en italique sous chaque texte. Les codes non conformes portent une icône rouge et la mention NC. Le tableau ne comporte pas de colonne Résultat. La colonne N° ne contient aucune icône ; son texte est rouge uniquement pour une mise au rebut. Dans le formulaire, le code et le matériel restent signalés en rouge dès qu’un point échoue. Les exemples de présentation utilisent le moteur exact de l’application et portent « RÉSULTATS SIMULÉS - NON VALABLE » sur chaque page ; ils ne sont pas classés comme contrôles réels.
- L’interface est une application web responsive nécessitant une connexion pour enregistrer. Les tests ne constituent pas une exécution sur Safari iOS ou une application native iOS/Android.

Documentation technique consultée : [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [déploiements Vercel](https://vercel.com/docs/deployments).

## Référentiel des contrôles (notice fournie le 9 septembre 2026)

| Type | Code type | Points applicables |
| --- | --- | --- |
| Manilles | SH | EG, ID, V1 |
| Crocs | HK | EG, ID, V1 |
| Élingues / sangles textiles | SL | EG, ID, V1, V2, V3, V4, V5 |
| Chaînes | CH | EG, ID, V1, V2 |
| Câbles | WI | EG, ID, V1, V2 |
| Moufles et poulies de retour | PU | EG, ID, V1, V2 |
| Palans à chaîne et tireforts manuels | HC | EG, ID, V1, V2, V3, V4 |
| Aussières textiles | RO | Notice détaillée non fournie : finalisation bloquée pour ce type |

**Remorque (TL, Towing line)** est un type d’accessoire distinct avec cinq sous-types. L’applicabilité a été donnée explicitement par le vérificateur ; les explications reprennent les contrôles de la matière correspondante dans les captures.

| Sous-type de remorque | Points applicables |
| --- | --- |
| Patte d’oie chaîne de remorquage | EG, NID, V1, V2 |
| Remorque textile | EG, NID |
| Câble de remorquage | EG, NID |
| Câble de treuil | EG, NID |
| Patte d’oie textile | EG, V1, V2, V3, V4, V5 |

Le V2 saisi deux fois pour la patte d’oie textile est dédupliqué. La phrase « Fils porteurs non visibles » collée à la fin du contrôle de l’axe des manilles dans la capture est un report manifeste du paragraphe textiles : elle reste dans le contrôle V1 textile et n’est pas transposée à un axe métallique. Les seuils chaînes (< 10 % d’usure, < 5 % d’allongement) et câbles (< 10 % standard, < 3 % antigiratoire) sont transcrits de la notice fournie ; ce module n’ajoute pas d’exigence réglementaire indépendante.

`liftingControls.ts` porte les descriptions bilingues et le classement ; `lifting_control_codes` applique les mêmes codes côté serveur. Les points non applicables sont stockés `na` et représentés par un tiret dans le PDF, sans case à décocher dans le formulaire. Les contrôles historiques (`checklist_version = 1`) et leurs snapshots restent inchangés. Les nouveaux contrôles utilisent la version 2 ; les brouillons antérieurs sont adaptés sans convertir une valeur inconnue en résultat validé.

Le compteur est incrémenté atomiquement par le serveur. Un changement vers le registre Remorques (ou inversement) attribue le prochain numéro du registre de destination ; les anciens rapports conservent leur propre snapshot. Les migrations ne modifient pas les PDF déjà signés.

La revue de l’inventaire a identifié l’élingue chaîne (nouvel identifiant **19**, ancien **160**) parmi les élingues génériques du PDF source. Elle est classée **Chaînes (CH)** pour utiliser EG, ID, V1 et V2, via `20260909193126_lifting_chain_material_classification.sql`. Les rapports historiques restent inchangés.

Vérification des accès après migration : compteur sans droit de lecture ou écriture directe, politique explicite de refus ; RPC de mutation accessibles aux utilisateurs connectés avec contrôle des rôles et du navire. Les avis Supabase sur les RPC `SECURITY DEFINER` authentifiés sont attendus pour cette interface de mutation contrôlée et vérifiés par les fixtures SQL ([explication de l’avis](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)).

Validation du formulaire révisé : contrôles automatiques React/modèle/PDF ; parcours dans le navigateur intégré à 390 × 844 et 412 × 915 (cases précochées, V1 décoché, icônes rouges du code et du matériel, observation, sauvegarde de la liste, persistance du résultat et formulaire Remorque avec EG/NID). Absence de débordement horizontal aux largeurs 390, 412 et 1440 px. La capture complète d’ordinateur est limitée par le recadrage du navigateur intégré ; le contrôle visuel mobile a été réalisé. Aucun test natif Safari iOS/Android.

Les deux exemples SUROIT ont été rendus et inspectés : 56 apparaux sur 7 pages et 8 remorques sur 3 pages, dont une seule dernière page A3 pour la notice. Des résultats simulés illustrent les trois décisions et les codes rouges. Après ajustement demandé, les numéros sont rouges uniquement pour la mise au rebut et la colonne Résultat est retirée. Ces fichiers restent des exemples locaux, non versés aux certificats et non inclus dans Git.
