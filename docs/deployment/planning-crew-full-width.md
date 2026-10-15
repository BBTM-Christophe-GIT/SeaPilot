# Planning Équipages — largeur disponible

Version `3.75.7`, build `2026-10-15.012` pour la largeur ; version `3.75.8`,
build `2026-10-15.013` pour le retrait du bandeau.

La vue Équipages utilisait la grille à deux colonnes du Planning alors que son
volet droit était fermé. Une colonne vide de 312 px (270 px sur les largeurs
intermédiaires) réduisait inutilement le calendrier.

La classe `planning-layout.is-crew-board-only` applique une seule colonne quand
la perspective est Équipages et que le suivi opérationnel est fermé. La carte
occupe ainsi toute la largeur disponible, sans agrandir les cases des jours.
Ouvrir le suivi opérationnel rétablit sa colonne ; le fermer libère à nouveau
la largeur. Les règles existantes de Flotte, Projet, plein écran et petits
écrans continuent de s'appliquer.

Depuis la version `3.75.8`, la vue Équipages ne rend plus le ruban de commandes
ni le bloc « Diffusion du planning ». Le calendrier suit directement le titre.
Ses onglets Flotte/Projet/Équipages, sa création d'affectation, ses filtres,
son actualisation, ses regroupements, son tri, son zoom, sa navigation et son
plein écran restent disponibles. Le retour en Flotte retrouve le ruban et la
diffusion avec leurs permissions existantes. La vue Projet reste sans ruban ;
les Planning personnels Marin et Capitaine gardent leur menu de congés en
vue Flotte. Les données et le circuit de publication ne changent pas.

La recette du retrait du bandeau vérifie les passages Flotte → Équipages →
Flotte, l'absence de réserve verticale, les regroupements Marins/Équipes,
les filtres, la création d'affectation et le plein écran, sur ordinateur et
tablette. L'ouverture et la fermeture du volet ont été vérifiées lors de la
livraison de la largeur en `3.75.7`. La recette utilise les composants réels
avec des données de test hors production. Les profils Marin et Capitaine conservent leurs fixtures
distinctes et leur accès au Planning personnel publié ; aucune permission ne
change. Aucun appel serveur, migration ni nouvelle dépendance n'est requis.
