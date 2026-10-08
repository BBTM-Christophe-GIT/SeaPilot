# Planning — arborescence Flotte (3.39.9)

Un bouton **Tout replier / Tout déplier**, placé à côté du sélecteur Flotte / Équipages, commande tous les navires et toutes les bordées du planning affiché. Si une partie de l’arborescence est fermée, le bouton propose de tout déplier, y compris les bordées imbriquées. Les commandes individuelles restent disponibles.

Le bouton est réservé à la vue Flotte, désactivé lorsque le résultat est vide et accessible au clavier. Son état d’ouverture est exposé aux lecteurs d’écran. Il conserve l’état des branches masquées par les filtres et ne modifie aucune donnée du planning. Aucune migration ni modification de droits n’est nécessaire.

Validation : tests existants de PlanningPage, lint, build de production et contrôle navigateur du repli/dépli global, d’une branche partiellement fermée et de la disparition du bouton dans Équipages.
