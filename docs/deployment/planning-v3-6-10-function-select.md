# Planning v3.6.10 — sélection de la fonction

## Comportement livré

- Le champ « Fonction » du formulaire complet d’une affectation est une liste déroulante.
- La création et la modification d’une affectation utilisent la même liste.
- La liste reprend les fonctions maritimes de la décision d’effectif ainsi que les fonctions déjà présentes dans les données RH et Planning.
- Une fonction historique absente du référentiel reste proposée afin de pouvoir ouvrir et enregistrer les anciennes affectations sans perte de donnée.

## Vérifications attendues

- ouverture du formulaire complet depuis une affectation existante ;
- présence d’un élément `select` pour « Fonction » ;
- conservation de la valeur actuelle, notamment « 2nd Capitaine » ;
- changement de fonction et enregistrement de la valeur sélectionnée ;
- non-régression de la configuration des décisions d’effectif ;
- tests automatisés, contrôle visuel et build de production.
