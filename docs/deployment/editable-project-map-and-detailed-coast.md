# Carte Projet modifiable et fond côtier détaillé

Version 3.80.9 — 28 octobre 2026.

## Édition de la localisation depuis la fiche

L’onglet Carte propose **Modifier la carte**, puis **Enregistrer la carte** et
**Annuler**. Il réutilise l’éditeur de localisation pour créer, déplacer ou
supprimer une route, des points isolés et des zones, avec leurs champs existants.
La sauvegarde fonctionne dans le volet du portefeuille comme dans la fiche ouverte.
ETD, cartes marines, icônes, cadrage et option d’annexe PDF restent conservés.
La consultation initiale ne modifie aucune donnée. Les changements de dossier,
d’onglet ou de page protègent les modifications non enregistrées.

Le nouveau RPC `projects_set_location` appelle le writer privé existant. Il
modifie uniquement `location_plan` et les métadonnées de mise à jour, avec le jeton
`updated_at` exact. Les droits Projet Admin/Direction, la société active et le
verrou des projets archivés sont conservés. Aucun champ commercial, tarif ou
contrat n’est réécrit. Les réponses asynchrones périmées et doubles enregistrements
sont ignorés. Un conflit conserve la saisie locale et signale le besoin de recharger.

Migration appliquée : `20261028075932_project_detail_location_save.sql`.
Vérification transactionnelle réelle : 18 assertions sur droits, conflits,
validation et préservation des contrats ; transaction annulée, aucun objet de
test conservé. Les avis de sécurité sont identiques avant et après la migration.

## Source côtière et rendu

Les cartes interactives Projet et Opération en Mer activent **Fond côtier détaillé**.
Le fond utilise les tuiles vectorielles publiques [OpenFreeMap](https://openfreemap.org/quick_start/),
fondées sur [OpenMapTiles](https://www.openmaptiles.org/) et
[OpenStreetMap](https://www.openstreetmap.org/copyright). Les attributions et liens
restent visibles sur la carte. Aucun compte, clé API ou abonnement n’est requis.
Le bouton permet de revenir au fond local Natural Earth.

Les couches d’eau décrivent notamment les bassins et le trait de côte. Les jetées,
routes et bâtiments sont ajoutés aux niveaux détaillés disponibles. Les données
sont communautaires et leur couverture varie ; elles ne sont pas une carte marine
officielle. Les repères du catalogue de ports restent les mêmes points de
référence, indépendamment du dessin plus détaillé des quais.

Le TileJSON `https://tiles.openfreemap.org/planet` fournit le millésime actuel,
sans figer une URL datée. Seuls les domaines et chemins HTTPS attendus sont
acceptés. Le niveau natif maximal est 14 ; le dessin vectoriel conserve sa netteté
au zoom supplémentaire sans créer de précision géographique supplémentaire.
Chaque sommet MVT est converti de Web Mercator en latitude/longitude, puis projeté
dans la projection locale de la carte. Aucune image n’est étirée ni géoréférencée
approximativement.

Le téléchargement, le décodage PBF et la construction des tracés s’exécutent dans
un Worker. Le zoom anime la caméra SVG déjà présente ; les nouveaux détails sont
demandés après stabilisation, sans bloquer la souris. Le rendu conservé est
repositionné avec la matrice de caméra exacte pendant le renouvellement.
Le nombre de tuiles, les requêtes concurrentes, la taille des réponses et le cache
mémoire sont bornés. Les requêtes périmées sont annulées. Une indisponibilité ou
une couverture partielle laisse le fond local visible et les points éditables.

Les aperçus documentaires et PDF conservent leur fond vectoriel autonome, sans
requête externe ni modification de leurs tableaux, en-têtes ou pieds de page.

## Vérification

Tests de l’édition des trois géométries, enregistrement ciblé et annulation ;
profils réels Marin/Capitaine en consultation ; conflits et changements de compte ;
décodage PBF, trous des polygones, jetées, coutures de tuiles, antiméridien et cache ;
annulations, délais réseau et gestes de zoom ; compilation de production.
Recette navigateur sur données synthétiques avec les tuiles publiques réelles,
formats ordinateur et mobile, plein écran et sauvegarde en mémoire.
