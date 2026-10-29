# Modifier le classement d’un document de projet

Version `3.80.18`, build `2026-10-29.004`.

Dans **Projets → fiche projet → Documents**, le crayon près du nom du fichier
ouvre **Modifier la catégorie**. Admin et Direction choisissent une catégorie
active et, si nécessaire, une sous-catégorie de cette catégorie, puis enregistrent.
Les documents importés de SharePoint, les pièces ajoutées et les documents émis
sont pris en charge. Les dossiers et les documents sans rattachement confirmé
au projet ne proposent pas cette action. Un projet clôturé reste en lecture seule.

La liste et les filtres affichent immédiatement le nouveau classement, qui reste
conservé après changement d’onglet ou rechargement. Le fichier, son nom, ses
octets et son emplacement ne changent pas. Les synchronisations SharePoint
conservent les classements manuels. Les catégories retirées restent lisibles,
mais ne peuvent pas être choisies pour un nouveau classement.

## Enregistrement et droits

Appliquer `20261029191053_project_document_category_edit.sql` avant l’interface.
Cette migration ajoute les sous-catégories aux deux tables de documents importés,
un historique pour les pièces générées et la RPC
`projects_set_document_category`. Aucun secret ou paquet supplémentaire n’est requis.

La RPC reçoit le projet, l’identifiant `generated:<id>`, `project:<id>` ou
`contract:<id>`, le nouveau classement et les deux clés précédemment lues.
Elle contrôle le compte, la société, les droits Admin/Direction, le rattachement
au projet, son état ouvert et la hiérarchie active du catalogue. Un changement
concurrent différent est refusé avec `40001` ; un réessai du même classement est
sans effet. Les erreurs conservent la fenêtre et la saisie, sans réessai automatique.
Les réponses tardives d’un ancien projet ou contexte ne modifient pas la fiche ouverte.

Les enveloppes publiques sont SECURITY INVOKER et les écritures passent par des
fonctions privées contrôlées. Les permissions RLS existantes, notamment celles
des profils Armement, Marin et Capitaine, restent inchangées. Le journal du
dossier conserve les changements de catégorie et de sous-catégorie.

## Documents affichés dans Opération en Mer

Tout changement effectif de classement décoche explicitement le document pour
Opération en Mer et révoque ses autorisations temporaires. Il faut le recocher
s’il reste autorisé. Le classement ne vaut jamais sélection automatique.

Les contrats, offres et factures d’origine restent exclus, même après un
reclassement dans HSE. Leur provenance commerciale initiale est conservée dans
une table privée, séparément du classement courant. Les liens alias vers ces
fichiers restent refusés. Un document initialement non commercial peut être
reclassé de Facturation vers HSE ; il redevient éligible, toujours décoché.

## Validation

Les tests de service et de préversion couvrent les trois origines, les identifiants
distincts, les réponses confirmées, conflits et réessais. Les tests React vérifient
l’éditeur, les refus, l’actualisation des filtres et des cases, les réponses tardives
et la conservation du classement dans la fiche. Les tests SQL utilisent les rôles
réels et deux sociétés fictives ; ils vérifient également la provenance commerciale,
les alias, l’historique et la conservation du classement lors des imports.
Les contrôles distants utilisent une transaction annulée par ROLLBACK.

Voir aussi la [bibliothèque documentaire](project-document-library.md) et la
[sélection des documents pour Opération en Mer](project-sea-operation-document-selection.md).

