# Planning : mois historiques et calculs de soldes — v3.64.5

## Affectations de septembre masquées

La grille du mois de référence septembre 2026 couvre 49 jours, du 31 août au 18 octobre. Le filtre actif comparait la date du jour à la fin de cette grille. Le 1er octobre, il supprimait donc les lignes Flotte dont les affectations avaient fini en septembre. Gary LEFEVRE et Mathieu QUESNOT restaient dans Équipages grâce à leurs affectations d’octobre sur LANDEMER, alors que leurs lignes de septembre sur LE ROZEL et les autres navires disparaissaient.

Le filtre actif utilise désormais le mois de référence pour reconnaître un mois révolu. Toutes ses affectations restent consultables, même si les jours supplémentaires de la grille recouvrent le mois courant. Pour le mois courant et les mois futurs, le filtre conserve son comportement : il masque les lignes sans affectation en cours ou à venir. Les filtres explicites, dates d’emploi, annulations, priorités des sources et règles de lecture restent appliqués. L’exception temporaire des lignes ajoutées manuellement se termine toujours à la création d’une nouvelle affectation visible, y compris dans un mois révolu.

L’audit des données a confirmé les affectations et les identifiants des deux marins, sans écrire dans la base. La correction traite l’affichage, sans réimporter ni supprimer des données.

## Calculs et actualisations

Les soldes étaient calculés pour toutes les personnes au chargement, au changement de mois et à l’actualisation, même dans Flotte ou Projet. Ils sont maintenant calculés à la demande pour les personnes affichées dans Équipages. Le résultat de chaque personne est conservé entre les changements de vue, de tri et de filtre ; les nouvelles données, dates et valeurs de solde invalident ce cache. Le calcul des soldes et leurs possibilités de saisie restent identiques.

Les demandes initiales et les actualisations des absences, visites/prestataires et audits partagent maintenant un compteur par ressource. Une ancienne réponse ou erreur ne peut plus écraser les résultats d’une actualisation récente. Le changement de client, de portée ou le démontage de la page invalide les requêtes en cours. Les chargements restent parallèles et les erreurs de la dernière requête restent affichées.

Aucune modification du design ou retrait de fonctionnalité. Aucun changement de schéma, de droit, de variable d’environnement ou de dépendance.

## Focus des dialogues — v3.64.6

La validation complète a révélé une course dans `AppDialog`, également utilisé par le Planning. Son focus initial différé pouvait arriver après le début d'une saisie, déplacer le focus du champ vers le bouton Fermer, puis laisser l'espace suivant activer ce bouton. Les tests documentaires retrouvaient alors une ancienne référence à un dialogue détaché, ce qui provoquait l'erreur de recherche du champ Responsable de traitement.

La séquence a été reproduite avec une animation contrôlée sur le vrai composant. Le focus initial s'applique maintenant seulement si le dialogue est encore connecté et si aucun élément du dialogue n'a déjà reçu le focus. Le démontage annule l'animation en attente. L'autofocus habituel, la navigation clavier et la fermeture volontaire restent disponibles, sans modifier le design. Les tests de validation des pièces jointes et de prévention des doubles envois restent inchangés.

## Recette

- Le 1er octobre, ouvrir septembre avec le filtre actif activé : Gary sur LE ROZEL Bordée 1, Mathieu sur LE ROZEL Bordée 2 et ses autres affectations de septembre ; conserver ces lignes après Actualiser, changement de vue et filtre navire.
- Vérifier mois courant et futur, filtre désactivé, annulations, transferts de navire, regroupement Marins/Équipes et dates d’emploi.
- Vérifier les soldes affichés, leur saisie, leur maintien lors d’un aller-retour entre vues et leur recalcul après changement de mois ou de données.
- Retarder une demande initiale puis actualiser : absences, visites, prestataires et audits récents ne sont pas remplacés par la réponse ancienne ; une erreur récente reste visible.
- Vérifier les interactions existantes : zoom, défilement, repli de bordées, cellules quotidiennes, formulaire complet, déplacements, redimensionnement et exports.
- Dans un dialogue, commencer une saisie avant le focus initial : l'arrivée tardive de l'animation ne doit ni déplacer le focus ni fermer la fenêtre. Fermer le dialogue avant l'animation doit annuler celle-ci ; vérifier aussi le focus initial normal et la navigation clavier.

Déployer le frontend avec les données existantes. Retour arrière : redéployer la version précédente ; aucune migration nécessaire.
