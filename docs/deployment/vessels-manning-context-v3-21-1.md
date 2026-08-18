# SeaPilot 3.21.1 — Navires et contexte des décisions d’effectif

## Portée

- Le module `Navires` remplace le libellé applicatif `BBTM - Flotte` et se trouve dans le menu `Opérations`.
- La ligne `Navires` est proposée dans la matrice `Administration > Accès aux menus par rôle`. La clé technique `fleet` est conservée afin de préserver les permissions existantes.
- Chaque situation de l’onglet `Décision d’effectif` enregistre un genre de navigation parmi `CI-CABOTAGE INTERNATIONAL`, `CN-CABOTAGE NATIONAL` et `NC-NAVIGATION COTIERE`.
- La description de l’activité et des limites d’exploitation peut être choisie dans le référentiel demandé ou saisie librement via `Texte personnalisé…`.
- Les prescriptions ou conditions spéciales restent un texte multilignes et sont désormais affichées avec le contexte de la situation sélectionnée.

Le nom `BBTM - Flotte` reste visible uniquement lorsqu’il désigne la source SharePoint historique ; il ne désigne plus le module applicatif.

## Base de données

Appliquer `20260818140000_vessel_manning_navigation_context.sql`. La migration ajoute `navigation_genre` et `activity_description` à `public.planning_manning_matrices`, contraint les genres autorisés et ajoute une signature de `save_planning_manning_matrix` afin de versionner les deux valeurs avec la situation. L’ancienne signature reste disponible pendant la bascule pour ne pas interrompre une session `3.21.0` déjà ouverte.

Les lignes historiques restent lisibles avec un contexte non renseigné. Toute nouvelle sauvegarde ou modification via le client `3.21.1` exige les deux champs.

## Vérification

1. Ouvrir `Administration` et vérifier la ligne `Navires`, puis activer ou désactiver au moins un profil.
2. Vérifier que `Navires` apparaît sous `Opérations` pour un profil autorisé et qu’un profil désactivé ne peut pas ouvrir directement `/modules/fleet`.
3. Dans `Navires > Décision d’effectif`, créer une situation avec une description prédéfinie.
4. Modifier la situation, choisir `Texte personnalisé…`, enregistrer une description libre et plusieurs lignes de prescriptions.
5. Recharger la page et vérifier que les trois valeurs sont affichées dans le contrôle de la situation.
