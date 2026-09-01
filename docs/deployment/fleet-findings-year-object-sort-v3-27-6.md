# Certificats flotte — tri des écarts v3.27.6

## Changement

Le pilotage du traitement classe désormais les écarts selon deux critères :

1. année de la date d'échéance, de la plus ancienne à la plus récente ;
2. objet de l'écart, de A à Z dans chaque année, sans tenir compte d'un préfixe numérique.

Les écarts sans année d'échéance exploitable sont placés après les écarts datés.

## Vérification

1. Ouvrir un document qui comporte des écarts sur plusieurs années.
2. Vérifier que toutes les échéances de l'année la plus ancienne apparaissent d'abord.
3. Vérifier que les objets sont triés alphabétiquement à l'intérieur de chaque année.
4. Refaire le contrôle depuis `Afficher toute la flotte`.
