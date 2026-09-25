# Création de procédures à partir du modèle Word

Dans **Nouveau document**, le champ **Mode de création** propose **À partir d’un
fichier existant** et **À partir d’un modèle** aux profils Administration et
Direction.

Le modèle `public/templates/procedure.docx` est la copie exacte du fichier
`Procédure.docx` fourni. Il conserve sa page de garde, ses styles, son historique
des révisions, sa table des matières et ses champs Word. Il ne contient aucun
document de travail rempli. Les informations saisies dans SeaPilot constituent
la fiche documentaire ; le contenu Word reste à compléter dans Word.

En mode modèle, SeaPilot est le stockage proposé : à l’enregistrement, une copie
du modèle est déposée dans le stockage privé existant, avec un nom composé de la
référence et du titre. Aucun fichier manuel n’est requis. En cas d’échec de
chargement du modèle, le formulaire conserve la saisie et permet de réessayer.
Le téléchargement du modèle permet également de créer et compléter une copie
dans le dossier Google Drive synchronisé, puis de renseigner son lien et son
chemin en choisissant ce stockage.

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

Aucune dépendance ni migration de base de données supplémentaire. Le build doit
inclure le modèle dans `dist/templates/procedure.docx`. Les autorisations des
sources privées et des PDF publiés restent celles du module Procédures.

- Tester les douze correspondances, les numéros disponibles et les doublons.
- Créer une procédure avec le modèle, puis télécharger sa source Word.
- Vérifier que son contenu binaire correspond au modèle fourni.
- Vérifier l’import existant, l’association Drive et la modification d’une fiche.
- Vérifier les fixtures des profils Armement, Capitaine et Marin : PDF publiés
  uniquement, sans action de création ni lecture des sources privées.
