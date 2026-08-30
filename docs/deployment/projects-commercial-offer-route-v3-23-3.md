# Projets - offre commerciale sans route redondante (v3.23.3)

## Changement

- La ligne `ROUTE` de l'en-tête de l'offre commerciale est masquée lorsque le port de livraison et le port de restitution sont identiques.
- La comparaison ignore la casse, les accents, les espaces et les séparateurs usuels afin d'éviter un affichage redondant pour des libellés équivalents.
- Les lignes `LIVRAISON` et `REDÉLIVRAISON` du cadre opérationnel restent inchangées.
- L'aperçu SeaPilot et le PDF généré appliquent la même règle.

## Validation attendue

- `Port de Dieppe` / `Port de Dieppe` : aucune ligne `ROUTE`.
- `Port de Dieppe` / `Le Havre` : ligne `ROUTE` conservée.
- Le document généré reste sur une page.
