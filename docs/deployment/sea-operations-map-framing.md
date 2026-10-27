# Cadrage de la carte — v3.80.1

Les cartes des projets et des opérations en mer incluent les ports de départ et
d’arrivée définis dans la fiche. Leurs repères bleus portent les libellés Départ
et Arrivée, y compris dans les aperçus et PDF. Ils participent à l’emprise du
cadrage automatique, sans ajouter de waypoint, de segment ou de distance au
voyage. Un même port de départ et d’arrivée est regroupé. Les noms sont résolus
dans le catalogue SeaPilot avec une géolocalisation unique ; les noms ambigus ou
sans coordonnées sont signalés et aucune position n’est inventée.

Le sélecteur **Cadrage automatique / Cadrage manuel** permet de conserver une
vue choisie. Le déplacement, le zoom et la sélection du mode manuel retiennent
le centre et l’étendue de la vue ; les gestes publient leur résultat à leur fin.
Les changements de ports ou de waypoints suivent le cadrage automatique et
respectent une vue manuelle conservée. **Cadrer le parcours** revient au mode
automatique. Les ports hors de la vue manuelle sont signalés.

Pendant le placement, une vue temporaire reste stable entre deux clics pour
permettre les ajouts successifs. Elle se recadre à la sortie du placement sans
être enregistrée comme manuelle. Le mode manuel propose directement déplacement,
zoom et plein écran ; un clic sur le fond n’ajoute aucun waypoint lorsque le
placement est désactivé.

Le champ facultatif `mapViewport` est enregistré indépendamment des géométries,
repris à la réouverture, dans l’aperçu et dans le PDF. Le projet en transmet une
copie indépendante à une nouvelle opération en mer. Les fiches signées restent
immuables ; les anciens enregistrements sans ce champ restent automatiques. Les
dessins PDF sont découpés à la bordure de la carte en mode manuel.

La migration `20261027134541_sea_operation_map_viewport.sql` valide le centre
géographique et une étendue de longitude comprise entre 0,02° et 360°. Elle ne
modifie ni les permissions ni les règles de signature. Aucune configuration
supplémentaire n’est nécessaire.

## Cadrage rapproché et zoom fluide — v3.79.1

Le cadrage utilise l’étendue réelle des positions, avec des marges pour les
repères et leurs libellés. Les anciens planchers régionaux de 0,8°/0,45°
n’écrasent plus visuellement les trajets courts autour d’un port. Un niveau
maximal de zoom conserve une vue locale finie pour un point unique, des
positions identiques ou des points très proches. La borne est commune au
cadrage automatique et au mode de placement pour éviter un saut à son entrée.

La règle est partagée par Projets et Opérations en mer : éditeurs, aperçus,
impression HTML et générateurs PDF. Les points isolés et les sommets des zones
participent au cadrage sans créer de segment ni de distance de navigation.
Lorsqu’un récapitulatif de voyage est superposé en bas à droite, le cadrage
automatique lui réserve une colonne pour ne masquer aucun point.

Le bouton **Cadrer le parcours** recalcule la vue ajustée en mode automatique.
Les marges ci-dessus concernent ce mode ; le mode manuel conserve désormais la
vue sélectionnée pour l’écran et les exports.

La molette cumule les événements natifs et anime le zoom cible sur un court
intervalle synchronisé avec `requestAnimationFrame`. Les unités pixel, ligne
et page sont normalisées ; l’ancrage suit le point sous le curseur et une
inversion reprend depuis la vue visible. Un nouveau geste, le changement de
mode, la perte de focus, une désactivation ou la fermeture annule le reliquat
de zoom. Le zoom ne modifie ni les coordonnées, ni les ETA, ni les contrôles nautiques.

Vérifications : trajet fictif proche de Cherbourg d’environ 1,6 NM, formats écran,
portrait/mobile et paysage PDF, positions confondues, pôles et antiméridien,
couches complémentaires, continuité automatique/manuel, rafales de molette,
annulation des animations, invariance des données et rendu PDF des deux modules.
La modification ne nécessite ni migration de données ni nouvelle API.
