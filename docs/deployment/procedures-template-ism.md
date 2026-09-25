# Création de procédures à partir du modèle Word

Dans **Nouveau document**, le champ **Mode de création** propose **À partir d’un
fichier existant** et **À partir d’un modèle** aux profils Administration et
Direction.

Le modèle `public/templates/procedure.docx` est la copie exacte du fichier
`Procédure.docx` fourni. Il conserve sa page de garde, ses styles, son historique
des révisions, sa table des matières et ses champs Word. Il ne contient aucun
document de travail rempli. Les informations saisies dans SeaPilot constituent
la fiche documentaire ; le contenu Word reste à compléter dans Word.

En mode modèle, le bouton **Ouvrir** crée une copie exacte du modèle dans
`SeaPilot/Procedures`, enregistre la fiche, ferme la fenêtre puis ouvre Word.
Le nom est `Thème Numéro Version - Titre.docx`, avec `A` comme version initiale.
Aucun téléchargement manuel du modèle ni choix de stockage n'est nécessaire.
En cas d'échec de copie, la saisie est conservée et aucune fiche n'est créée.
Si seule l'ouverture échoue, la fiche et le fichier déjà créés sont conservés.

La carte **Importer un fichier** propose uniquement le fichier à ajouter. Le
lanceur le copie dans `SeaPilot/Procedures`, avec le même nommage et son extension
d'origine. Le champ Navire propose également **Armement**.

## Correspondance des chapitres ISM

| Chapitre | Thème |
| --- | --- |
| 01 | GEN |
| 02 | POL |
| 03 | RAC |
| 04 | DPA |
| 05 | AUT |
| 06 | REP |
| 07 | OPE |
| 08 | URG |
| 09 | SEC |
| 10 | TEC |
| 11 | SMS |
| 12 | VPC |

Une nouvelle fiche commence au chapitre 01, avec GEN et le prochain numéro
disponible. La sélection d’un chapitre actualise le thème ; si le thème change,
le numéro est proposé dans la nouvelle série. Le numéro reste inchangé si le
thème est identique. Le thème et le numéro restent modifiables manuellement.
Le chapitre 13, les documents non contrôlés et le chapitre non renseigné n’ont
pas de correspondance : leur sélection efface la proposition et permet une
saisie manuelle. Ouvrir une fiche existante ne modifie pas ses données.

## Déploiement et recette

Appliquer `20260925072400_procedures_drive_workflow.sql` puis
`20260925073813_procedures_drive_receipt_validation.sql` avant le frontend.
Installer le lanceur 2.3 sur les postes Windows : il conserve la racine déjà
configurée et crée les dossiers de modules manquants. Le build inclut le modèle
inchangé dans `dist/templates/procedure.docx`.

Les détails de publication, de stockage et de droits figurent dans
[Procédures et Google Drive](procedures-google-drive.md).

- Tester les douze correspondances, les numéros disponibles et les doublons.
- Vérifier la création du Word, sa référence exacte et l'ouverture après fermeture.
- Vérifier l'import, les erreurs de copie et la modification d'une fiche existante.
- Vérifier la conversion Office et l'enregistrement atomique de la publication.
- Tester les vrais rôles Admin, Direction, Capitaine et Marin avec
  `supabase/tests/procedures_drive_workflow_test.sql`, sans simulation de session.
