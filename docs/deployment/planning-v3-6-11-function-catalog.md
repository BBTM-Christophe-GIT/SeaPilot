# Planning v3.6.11 — catalogue des fonctions

## Comportement livré

Le champ « Fonction » des formulaires de création et de modification d’une affectation propose uniquement les fonctions suivantes, dans cet ordre :

1. Capitaine
2. Chef Mécanicien
3. 2nd Capitaine
4. Maître d'Equipage
5. Matelot polyvalent
6. Matelot Qualifié
7. Stagiaire

La valeur initiale « Choisir » reste masquée dans la liste visible. Le champ reste facultatif afin de préserver les créations rapides existantes. Les anciennes variantes « Second capitaine », « Matelot polyvalent pont/machine » et « Matelot qualifié pont » sont automatiquement rapprochées de leur nouvelle valeur de référence à l’ouverture du formulaire.

## Vérifications attendues

- ordre et libellés identiques à la liste métier fournie ;
- sélection et enregistrement d’une fonction en création ;
- conversion de « Second capitaine » en « 2nd Capitaine » en modification ;
- absence d’options supplémentaires issues des données RH ou Planning ;
- tests automatisés, contrôle visuel et build de production.
