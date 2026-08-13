# DPR à quai et recherche de ports

La version `3.19.4` complète le préremplissage Planning et harmonise les champs de ports.

## Projet par défaut du DPR

- Lorsque le Planning affecte le rédacteur à un navire mais ne trouve aucun projet actif pour ce navire à la date du DPR, le champ Projet sélectionne automatiquement `Navire à quai`.
- Cette valeur est enregistrée comme projet hors catalogue afin de rester compatible avec les DPR existants et les règles de validation côté serveur.
- Un projet trouvé dans le Planning reste prioritaire et remplace cette valeur par défaut.

## Catalogue de ports

- Le champ Port de l’étape Escale utilise le même catalogue LOCODE que les projets.
- Les ports restent classés par département puis par nom.
- La recherche accepte le nom du port, la commune, le département et le LOCODE, sans dépendre des accents ou de la ponctuation.
- Le même sélecteur recherchable remplace les listes Port de livraison et Port de restitution dans l’éditeur de projet.
- Une valeur historique ou saisie libre reste acceptée.

## Recette

- Les tests DPR vérifient le préremplissage `Navire à quai`, sa sauvegarde et la sélection d’un port par LOCODE.
- Les tests Projets vérifient les groupes départementaux, la recherche et l’enregistrement des ports de livraison et restitution.
- Les tests du catalogue vérifient la recherche par port, département et LOCODE.
