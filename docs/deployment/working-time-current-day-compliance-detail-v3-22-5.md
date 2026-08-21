# Suivi du temps — date du jour et motif de conformité v3.22.5

## Résultat utilisateur

- Le module sélectionne automatiquement la date locale du jour lorsqu’il ouvre le mois courant.
- Un mois historique continue de s’ouvrir sur son premier jour.
- Une ligne non conforme indique désormais la règle en échec, la valeur mesurée, le seuil configuré et les bornes de la fenêtre glissante.
- Les indicateurs « Repos 24 h » et « Travail 7 jours » d’une ligne non conforme reprennent la fenêtre fautive afin de ne plus les juxtaposer avec un statut provenant d’un autre calcul.

## Cas Arthur MAREST du 18 août 2026

La non-conformité est réelle : la fenêtre glissante allant du 17 août à 06:30 au 18 août à 06:30 contient 13 heures de travail, alors que la politique « Accords Collectifs du 27/06/2025 » fixe le maximum à 12 heures sur 24 heures. Les 9 heures travaillées le 18 ne dépassent pas seules le seuil ; la fenêtre inclut encore le travail du 17.

## Vérification

- Test composant avec une fenêtre fautive à 06:30 et une fenêtre conforme en fin de journée.
- Test de sélection du jour dans le mois courant et de repli sur le premier jour pour un mois historique.
- Test de chargement des seuils de la politique avec le workspace de temps de travail.
