# Cadrage automatique et zoom molette — v3.79.1

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

Les déplacements et zooms manuels restent libres pendant l’édition. Le bouton
**Cadrer le parcours** recalcule la vue ajustée. Les exports se cadrent sur les
positions enregistrées, indépendamment de la vue manuelle utilisée à l’écran.

La molette cumule les événements natifs et anime le zoom cible sur un court
intervalle synchronisé avec `requestAnimationFrame`. Les unités pixel, ligne
et page sont normalisées ; l’ancrage suit le point sous le curseur et une
inversion reprend depuis la vue visible. Un nouveau geste, le changement de
mode, la perte de focus, une désactivation ou la fermeture annule le reliquat
de zoom. Le zoom ne modifie ni coordonnées, ni ETA, ni données métier.

Vérifications : trajet fictif proche de Cherbourg d’environ 1,6 NM, formats écran,
portrait/mobile et paysage PDF, positions confondues, pôles et antiméridien,
couches complémentaires, continuité automatique/manuel, rafales de molette,
annulation des animations, invariance des données et rendu PDF des deux modules.
La modification ne nécessite ni migration de données ni nouvelle API.
