# Certificats flotte — responsables des écarts v3.27.5

## Changement

Dans les formulaires de création et de modification d'un écart, la liste `Responsable` exclut désormais toute personne dont la date de départ est antérieure à la date du jour en Europe/Paris.

Les personnes sans date de départ, dont le départ est prévu aujourd'hui ou ultérieurement, restent sélectionnables. Le filtre `active` existant reste également appliqué.

## Vérification

1. Ouvrir un document dans `Certificats flotte`.
2. Cliquer sur `Nouvel écart`.
3. Vérifier qu'une personne partie avant aujourd'hui n'est plus proposée dans `Responsable`.
4. Vérifier qu'une personne sans date de départ ou avec une date future reste proposée.
