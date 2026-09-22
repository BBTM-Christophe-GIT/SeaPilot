# Registres et listes des procédures par navire

Le menu **Registres → Produits Chimiques** remplace l’entrée correspondante sous QHSE.
La route `/modules/chemicals`, la clé de permission `chemicals` et les droits existants restent inchangés.

Dans **Procédures QHSE**, **Générer une liste des documents** ouvre une sélection indépendante
des filtres de recherche et de projet de la bibliothèque. Le navire du filtre principal est repris
à l’ouverture et reste modifiable dans la fenêtre. Un navire inclut ses propres documents et
tous les documents dont le champ Navire est vide (y compris les anciennes valeurs nulles ou
constituées d’espaces). La comparaison ignore la casse et les accents, sans correspondance partielle.
Le filtre Navire de la bibliothèque applique la même règle.

Tous les documents disponibles sont cochés initialement. La sélection individuelle et les boutons
Tout sélectionner / Tout désélectionner portent sur le navire affiché. Les exclusions sont conservées
pendant les changements de navire et réinitialisées à la réouverture. Le PDF exporte uniquement
les documents cochés appartenant au périmètre affiché, avec référence, titre, version et date de
diffusion, regroupés par chapitre ISM. Le statut et le navire n’apparaissent pas dans le PDF.
Le format est A4 portrait. La taille du texte et les espacements s’adaptent pour viser une seule page
(de 9 à 7 points). Si la sélection est trop longue, toutes les lignes sont conservées sur plusieurs
pages, avec en-têtes et pagination répétés.

Administration et Direction génèrent la liste de l’onglet actif (sources privées ou PDF publiés).
Armement, Capitaine et Marin utilisent uniquement les publications accessibles avec leur compte.
Les règles RLS et les requêtes de publication existantes restent applicables ; aucun accès source
supplémentaire n’est accordé.

Le champ **Navire** de la création et de la modification charge les navires actifs de la table
`vessels`, selon les droits de lecture du compte. Les quais et bureaux sont exclus. L’option
**Tous les navires (champ vide)** enregistre une procédure commune. Une ancienne valeur hors flotte
est conservée lors de la modification d’une fiche. Une erreur de chargement de la flotte est affichée.

Aucune migration, dépendance ou variable d’environnement supplémentaire n’est requise.

Validation : tests des filtres, sélection/export, formulaire et persistance du navire, profils
opérationnels dédiés, navigation, requête flotte et PDF multipage ; build de production ; contrôle
visuel sur ordinateur et mobile avec les données de démonstration Administration. Les politiques de
`20260908044216_procedure_publishing_workflow.sql` et les fixtures de
`supabase/tests/qsms_procedure_publishing_test.sql` servent de référence pour Capitaine et Marin.
