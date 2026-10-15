# Planning Équipages — largeur disponible

Version `3.75.7`, build `2026-10-15.012`.

La vue Équipages utilisait la grille à deux colonnes du Planning alors que son
volet droit était fermé. Une colonne vide de 312 px (270 px sur les largeurs
intermédiaires) réduisait inutilement le calendrier.

La classe `planning-layout.is-crew-board-only` applique une seule colonne quand
la perspective est Équipages et que le suivi opérationnel est fermé. La carte
occupe ainsi toute la largeur disponible, sans agrandir les cases des jours.
Ouvrir le suivi opérationnel rétablit sa colonne ; le fermer libère à nouveau
la largeur. Les règles existantes de Flotte, Projet, plein écran et petits
écrans continuent de s'appliquer.

La recette porte sur le passage Flotte → Équipages, l'ouverture et la fermeture
du volet, les regroupements Marins/Équipes, les filtres et le plein écran, sur
ordinateur et tablette. Elle utilise les composants réels avec des données de
test hors production. Les profils Marin et Capitaine conservent leurs fixtures
distinctes et leur accès au Planning personnel publié ; aucune permission ne
change. Aucun appel serveur, migration ni nouvelle dépendance n'est requis.
