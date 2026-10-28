# Réactivité du zoom de la carte

Version 3.80.7 — 28 octobre 2026.

Les cartes de localisation Projet et de préparation Opération en Mer utilisent le
même éditeur. Le zoom à la molette reconstruit désormais ses détails à intervalles
bornés pendant un geste continu (au plus toutes les 160 ms), puis exactement au
cadrage final. Entre ces mises à jour, une matrice SVG déplace immédiatement le
contenu existant et ses cibles interactives sans rendu React à chaque frame.

La matrice conserve les échelles longitude/latitude distinctes de la projection
locale et le passage de l’antiméridien. La surface de saisie, le clip, le nord,
l’échelle et le réticule restent fixes. Une reprojection périodique révèle le
littoral et les ports qui entrent dans le cadre au dézoom ; le résultat exact
remplace toujours l’aperçu en fin de geste. Les destinations successives sont
regroupées avant frame ; une rafale continue utilise une interpolation de 40 ms, un
cran isolé 100 ms. L’inversion repart de la vue visible.

Le cadrage n’est communiqué au formulaire qu’à la fin du geste. Les commandes
pointeur réconcilient la vue exacte avant leur traitement ; les flèches utilisent
la vue intermédiaire sans notifier deux fois le parent. Les clés des cibles ports
reposent sur leurs identités catalogue, afin de préserver le premier clic pendant
cette réconciliation. Blur, redimensionnement, changement de source, désactivation,
plein écran et démontage annulent les animations tardives. Les coordonnées des
waypoints, points isolés et sommets ne sont modifiées que par leurs commandes de
saisie existantes. Aucun RPC, permission, modèle PDF ou calque GMDSS n’est ajouté.

Validation : tests de matrice/projection et d’ancre, rafale 8 ms sur 400 ms avec budget
de recalcul borné, commit parent unique, inversion, clic de port pendant aperçu,
remontage des cibles après désactivation et annulations. Vérification des cartes,
des localisations Projet et du plein écran ; compilation de production.

Recette navigateur locale : mêmes 4 waypoints, 2 zones et ports visibles, avant/après
sur les sources du même composant. Une interaction native identique a montré un
premier changement visible de 89,1 ms avant contre 1,8 ms après, avec 3 mises à jour du
littoral contre 1. Ces mesures locales sont des éléments de diagnostic, pas une
garantie de latence ou de fréquence sur tous les ordinateurs. Zoom inverse,
repositionnement, menu, plein écran et format mobile contrôlés séparément.
