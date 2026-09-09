# Module Levage

Le module `/modules/lifting` comporte trois sections avec leurs icônes : **Examen à fond - Grue**, **Registre des Apparaux de Levage**, **Remorques**. Cette livraison rend opérationnels les deux registres. La section grue présente un accès aux certificats existants ; son questionnaire spécifique reste une étape ultérieure.

## Utilisation

1. Choisir un navire (ou le site YARD) puis la section Apparaux ou Remorques. L’inventaire est regroupé par type d’accessoire, puis par numéro ; le filtre de type et la recherche par mots-clés peuvent être combinés.
2. Ajouter ou modifier le matériel : type d’accessoire, sous-type pour les remorques, description, CMU facultative, numéro de série, emplacement, notes. L’identifiant est un nombre automatique et non modifiable, à partir de 1 par navire et registre. Les numéros ne sont pas réutilisés après suppression. La suppression retire le matériel de l’inventaire actif ; le filtre des matériels supprimés permet sa restauration.
3. Cliquer sur **Nouveau contrôle annuel**, puis choisir le navire dans la fenêtre, sa date d’émission et son échéance. La fenêtre propose les navires et sites accessibles au compte ; elle peut cibler un autre navire que celui affiché initialement. Un an est proposé, ajustable avant création. Plusieurs contrôles sont possibles pour le même navire et la même section, y compris la même année ou le même jour, sans attendre l’échéance du précédent. Chaque démarrage ouvre le nouveau contrôle avec les matériels actifs du navire choisi et leurs caractéristiques à cet instant ; tous les rapports précédents sont conservés.
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

Le `.iqy` fourni contient la connexion à la liste SharePoint `87fd9c1e-1f76-4ee2-93c2-a0399a6f3e9b`, pas ses lignes. Le premier chargement s’appuyait sur les PDF accessibles. L’import Excel décrit ci-dessous complète désormais cet inventaire ; il ne met pas en place de synchronisation SharePoint.

Les PDF historiques restent les originaux déjà stockés dans Certificats flotte : ils ne sont pas régénérés ni signés à nouveau. Leurs dates d’émission et catégories ont été complétées dans les métadonnées. Le rapport de remorques figure sous l’année d’émission **2025**, même si son nom de fichier indique 2026. Les décisions avec réparation des IDs **260, 282 et 283** et les cases vides des sources sont conservées ; une case vide n’est interprétée ni comme conforme ni comme sans objet.

## Accès et conservation

- Admin, Direction, Armement : gestion de l’inventaire et finalisation.
- Capitaine et Marin : consultation et saisie des contrôles sur les navires accessibles selon les règles réelles du planning et les affectations. Les fonctions SQL contrôlent les droits indépendamment de l’interface.
- Aucun accès anonyme aux données. Le tampon est conservé dans `lifting-assets`, accessible uniquement aux profils de gestion de la société. Aucun tampon ni inventaire réel n’est inclus dans les données de démonstration publiques.

Les tables `lifting_inventory`, `lifting_inspections`, `lifting_inspection_entries` ont la RLS activée. Les mutations passent exclusivement par des RPC contrôlés. Chaque contrôle copie les caractéristiques du matériel et du navire au démarrage. Les éditions ultérieures de l’inventaire ne modifient donc pas les rapports déjà créés, y compris les brouillons existants. Un matériel ajouté ensuite sera inclus au prochain démarrage de contrôle.

La révision du contrôle protège contre l’écrasement par un deuxième appareil et contre la publication d’un PDF devenu obsolète. La création du certificat, de sa version et la finalisation du contrôle sont atomiques et idempotentes. En cas de réponse réseau incertaine, un fichier temporaire peut rester stocké ; le client ne supprime jamais un PDF qui pourrait déjà être rattaché à un rapport finalisé.

La liste distingue les contrôles par leur référence `LEV-<id>` et leur date d’émission. Les noms des nouveaux PDF contiennent la date et cette référence afin de permettre plusieurs classements dans Certificats flotte, même le même jour. L’année reste un filtre ; elle ne limite plus le nombre de contrôles. Un nouveau contrôle ne prolonge ni ne modifie la validité du précédent.

## Exploitation et validation

- Migration autorisant plusieurs contrôles dans une année : `20260909203059_lifting_multiple_inspections_per_year.sql`. Les tests couvrent la création le même jour, avant échéance, les instantanés indépendants et la publication de deux certificats sans écrasement.
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
| Anneaux de levage | AN | EG, ID |
| Pinces à tôles | PN | EG, ID, V1, V2, V3 |
| Grappins | GP | Notice détaillée non fournie : finalisation bloquée pour ce type |

**Remorque (TL, Towing line)** est un type d’accessoire distinct avec cinq sous-types. L’applicabilité a été donnée explicitement par le vérificateur ; les explications reprennent les contrôles de la matière correspondante dans les captures.

| Sous-type de remorque | Points applicables |
| --- | --- |
| Patte d’oie chaîne de remorquage | EG, NID, V1, V2 |
| Remorque textile | EG, NID |
| Câble de remorquage | EG, NID |
| Câble de treuil | EG, NID |
| Patte d’oie textile | EG, NID, V1, V2, V3, V4, V5 |

Le contrôle NID de la patte d’oie textile vérifie la présence de la plaque / étiquette constructeur, du numéro d’identification et de la CMU. Il figure dans le formulaire, le tableau PDF et la notice bilingue. Tout brouillon existant auquel ce point est ajouté doit être enregistré à nouveau avant finalisation ; les rapports déjà publiés sont conservés.

Le V2 saisi deux fois pour la patte d’oie textile est dédupliqué. La phrase « Fils porteurs non visibles » collée à la fin du contrôle de l’axe des manilles dans la capture est un report manifeste du paragraphe textiles : elle reste dans le contrôle V1 textile et n’est pas transposée à un axe métallique. Les seuils chaînes (< 10 % d’usure, < 5 % d’allongement) et câbles (< 10 % standard, < 3 % antigiratoire) sont transcrits de la notice fournie ; ce module n’ajoute pas d’exigence réglementaire indépendante.

`liftingControls.ts` porte les descriptions bilingues et le classement ; `lifting_control_codes` applique les mêmes codes côté serveur. Les points non applicables sont stockés `na` et représentés par un tiret dans le PDF, sans case à décocher dans le formulaire. Les contrôles historiques (`checklist_version = 1`) et leurs snapshots restent inchangés. Les nouveaux contrôles utilisent la version 2 ; les brouillons antérieurs sont adaptés sans convertir une valeur inconnue en résultat validé.

Le compteur est incrémenté atomiquement par le serveur. Un changement vers le registre Remorques (ou inversement) attribue le prochain numéro du registre de destination ; les anciens rapports conservent leur propre snapshot. Les migrations ne modifient pas les PDF déjà signés.

La revue de l’inventaire a identifié l’élingue chaîne (nouvel identifiant **19**, ancien **160**) parmi les élingues génériques du PDF source. Elle est classée **Chaînes (CH)** pour utiliser EG, ID, V1 et V2, via `20260909193126_lifting_chain_material_classification.sql`. Les rapports historiques restent inchangés.

Vérification des accès après migration : compteur sans droit de lecture ou écriture directe, politique explicite de refus ; RPC de mutation accessibles aux utilisateurs connectés avec contrôle des rôles et du navire. Les avis Supabase sur les RPC `SECURITY DEFINER` authentifiés sont attendus pour cette interface de mutation contrôlée et vérifiés par les fixtures SQL ([explication de l’avis](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)).

Validation du formulaire révisé : contrôles automatiques React/modèle/PDF ; parcours dans le navigateur intégré à 390 × 844 et 412 × 915 (cases précochées, V1 décoché, icônes rouges du code et du matériel, observation, sauvegarde de la liste, persistance du résultat et formulaire Remorque avec EG/NID). Absence de débordement horizontal aux largeurs 390, 412 et 1440 px. La capture complète d’ordinateur est limitée par le recadrage du navigateur intégré ; le contrôle visuel mobile a été réalisé. Aucun test natif Safari iOS/Android.

Les deux exemples SUROIT ont été rendus et inspectés : 56 apparaux sur 7 pages et 8 remorques sur 3 pages, dont une seule dernière page A3 pour la notice. Des résultats simulés illustrent les trois décisions et les codes rouges. Après ajustement demandé, les numéros sont rouges uniquement pour la mise au rebut et la colonne Résultat est retirée. Ces fichiers restent des exemples locaux, non versés aux certificats et non inclus dans Git.

## Complément Excel et filtres — 9 septembre 2026

La migration `20260909210104_lifting_inventory_source_metadata.sql` ajoute une identité de source unique par société et des métadonnées historiques. Elle rend le site de type `quay` accessible aux mêmes RPC, sans changer les règles de société et d’affectation. Les bureaux et les navires inactifs restent exclus. Les mutations de fiche ne peuvent pas écrire les colonnes de provenance.

Le fichier **Registre des Apparaux de Levage.xlsx**, feuille du même nom, contient 212 lignes avec identifiants uniques. SHA-256 : `791d46d27bdcbbee34893db626330727caad659cb62f75328013694cf5fab587`. Résultat appliqué à Supabase : 64 fiches SUROIT rapprochées par ancien identifiant, 148 fiches ajoutées, aucun doublon. La sangle source 281 du ROZEL, marquée « Mise au Rebus », est conservée inactive.

| Navire / site | Apparaux | Remorques | Total |
| --- | ---: | ---: | ---: |
| SUROIT | 56 | 8 | 64 |
| LE ROZEL | 86 (85 actifs) | 5 | 91 |
| GOURY | 27 | 0 | 27 |
| HOLENN EUSA | 11 | 0 | 11 |
| KROKDUR | 7 | 0 | 7 |
| YARD - Le Havre | 7 | 0 | 7 |
| BBTM TENDER 1 | 4 | 0 | 4 |
| LANDEMER | 0 | 1 | 1 |
| **Total** | **198** | **14** | **212** |

Les numéros de série, CMU, descriptions et anciennes références sont conservés. Les dates de mise en service, dernière visite et validité, la périodicité littérale, l’action, l’accréditation et le remorquage d’urgence sont consultables dans « Données du registre source ». Les anciennes cases de contrôle restent des métadonnées historiques : elles ne créent aucun contrôle validé. « Biannuelle » n’est pas réinterprété en nouvelle échéance. Les 120 entrées de contrôle et les rapports existants sont restés inchangés lors de l’import. Les élingues chaîne sont classées Chaînes ; les sous-types de remorques sont déduits uniquement des descriptions explicites. Les deux descriptions « GRAPPIN (PETIT MODÈLE) » sans type source sont classées Grappins, en attente de notice.

Préparation reproductible (Python avec `openpyxl`) :

```sh
python scripts/prepare-lifting-inventory.py "chemin/Registre des Apparaux de Levage.xlsx" --output .data/lifting-inventory-import
python -m unittest discover -s scripts -p test_prepare_lifting_inventory.py
```

Le script prépare des fichiers JSON/SQL privés, sans se connecter à la base. Réviser la classification et le rapprochement avant exécution administrative du SQL. L’import est transactionnel ; un ancien identifiant ambigu ou un conflit de navire l’interrompt. Il complète uniquement les numéros de série manquants et la provenance des fiches existantes, sans écraser leurs caractéristiques, leur état, leurs notes ou leurs rapports. La répétition d’un import identique ne consomme aucun numéro et ne modifie aucune ligne. Le classeur et les sorties contenant les données ne sont pas versionnés.

L’inventaire, les contrôles en cours et les rapports consultés proposent un filtre de type d’accessoire et une recherche insensible aux accents et à la casse : référence, ancien identifiant, description, type, série, emplacement, notes et observations des contrôles. Dans un contrôle filtré, **Enregistrer les contrôles affichés** ne valide que les éléments visibles ; les saisies masquées sont conservées avec un rappel. La progression et la finalisation portent toujours sur la totalité du contrôle.

La notice des anneaux reprend EG (état, absence de fissures, rayures profondes, corrosion excessive et déformation) et ID (identification et CMU). Pour les pinces à tôles, les points fournis sont organisés en EG (corps et œillet), ID (marquage et ouverture), V1 (mâchoires), V2 (mécanisme) et V3 (adéquation à la charge). Les exemples 0,5 mm et 10 % restent conditionnés aux limites du fabricant. Les liens du texte fourni ne sont pas repris. La dernière page A3 des apparaux présente désormais une matrice par type, répartie sur trois colonnes, avec français puis anglais en italique ; le moteur contrôle qu’elle tient sur cette seule page.

Validation de cette livraison : tests React du choix d’un autre navire, filtres et conservation des saisies masquées ; tests Python du parseur et des valeurs historiques ; import simulé avec rollback puis appliqué, comparaison des instantanés et répétition sans changement ; fixtures SQL réelles Admin/Direction/Armement/Capitaine/Marin incluant le site, ses refus d’accès et les codes AN/PN ; ESLint ciblé et build de production. Le PDF de démonstration a été rendu et sa dernière page inspectée visuellement.

Parcours navigateur vérifié sur la préversion locale : sélection d’un autre navire dans le dialogue, recherche sans résultat puis réinitialisation, filtre de type, enregistrement d’un défaut et d’une observation à 390 × 844 ; inventaire et icône de grue à 1440 × 1000. Aucun débordement horizontal ni erreur console relevé. Les contrôles mobiles utilisent une fenêtre redimensionnée ; aucune exécution native Safari iOS/Android n’est revendiquée.
