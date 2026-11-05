# Import GPX dans le Passage Plan

Dans la fenêtre de saisie d’une Opération en Mer, la section **Passage Plan**
propose **Importer les waypoints** à côté de **Placer les waypoints** aux comptes
autorisés à modifier la fiche.
Le panneau précise **Fichier GPX (.gpx)** et exige de choisir le contenu :

- **Route** : ajoute les points à la suite des waypoints du Passage Plan.
- **Points isolés** : ajoute les repères à la localisation de la mission.
- **Zone** : utilise les points comme sommets du contour, dans l’ordre du fichier,
  avec un nom de zone et au moins trois positions distinctes. Un dernier point
  identique au premier n’est pas répété dans la liste des sommets.

Les points isolés et les zones ne créent ni segments de navigation, ni distance,
ni ETA de parcours. GPX ne définit pas de polygone : le choix explicite **Zone**
donne cette signification à la liste de positions sélectionnée.
Une croix fine matérialise la position de chaque point isolé sur la carte et
dans le PDF.

Le lecteur accepte GPX 1.0/1.1, ses routes (`rtept`), points (`wpt`) et tracés
(`trkpt`). Si le fichier contient plusieurs jeux de points, l’utilisateur choisit
celui à importer. Chaque segment de tracé est proposé séparément pour ne pas
relier automatiquement des segments discontinus. L’aperçu présente les dix
premiers points et le nombre total avant confirmation ; tous les points du jeu
choisi sont ajoutés. Les éléments déjà saisis restent conservés.

Le fichier est lu localement dans le navigateur, sans dépôt du GPX sur le serveur.
Les coordonnées doivent être valides en WGS84. Un fichier incorrect est refusé
sans import partiel ni simplification. Les noms et descriptions sont du texte.
Les heures enregistrées dans le GPX ne deviennent pas des ETA : la route utilise
les règles existantes de départ et de calcul distance/vitesse. Les nouveaux
points n’héritent pas de captures météo, radio ou UKC d’autres points.

Limites : fichier de 5 Mo, 200 points par jeu, 200 waypoints de route au total,
200 points isolés, 50 zones et 200 sommets par zone. Les limites existantes de
taille de localisation sont également vérifiées avant l’ajout.

Après confirmation, le cadrage de la carte revient en mode automatique afin de
montrer les nouveaux éléments. L’enregistrement du brouillon reste explicite.
Les fiches signées et les fiches en lecture seule ne proposent pas l’import.
Aucune migration, nouvelle dépendance ou configuration de déploiement n’est
nécessaire ; les données suivent le schéma et les droits existants.

Vérifications : lecture GPX, choix des trois destinations, import dans une
nouvelle opération, ajout à une préparation existante, sauvegarde avec les
fixtures réelles Marin et Capitaine, conservation des données signées et
interdiction en lecture seule, aperçu desktop/mobile et build de production.
