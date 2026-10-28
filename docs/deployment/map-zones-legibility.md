# Zones lisibles dans Projet et Opération en Mer

Version 3.80.5 — 27 octobre 2026.

Les zones dessinées partagent une présentation commune entre les cartes SVG,
l’annexe Projet et le PDF Opération en Mer. Chaque rang de la liste possède
son repère Z1, Z2… et une couleur de données distincte : même contour, fond
léger, légende et entête de tableau. Les 50 rangs autorisés ont des couleurs
RGB distinctes ; le code complète la couleur pour identifier la zone.

La carte affiche des cartouches courts. Le placement recherche une position
libre et ajoute un trait de rappel lorsque le cartouche est décalé. Une carte
saturée conserve tous les polygones et la légende ; les étiquettes de sommets
qui se chevaucheraient peuvent être omises, sans supprimer de coordonnées.
Les remplissages sont dessinés de l’extérieur vers l’intérieur, puis tous les
contours restent visibles. Les positions, le cadrage enregistré, les routes,
les points isolés et les gestes de déplacement ne sont pas réécrits.

Les deux PDF utilisent une arborescence : un entête parent « Z1 - nom de la
zone », suivi des sommets indentés Z1.1, Z1.2… et de leurs coordonnées WGS84
en degrés/minutes, dans les colonnes « Point » et « Coordonnées ». Le nom
de la zone n’est plus répété sur chaque ligne.
L’entête parent et les titres de colonnes se répètent quand une grande zone
continue sur une autre page. Les petits groupes restent ensemble si possible.
Les cartes sont vectorielles et les en-têtes/pieds de page Word sont conservés.

Le précédent volet de consultation SMDSM britannique est remplacé par le
[calque vectoriel des catégories professionnelles de navigation](navigation-categories-overlay.md).
La [provenance du document MCA](gmdss-reference-map.md) est conservée pour
l’historique. Aucune limite radio A1/A2 française ni bande A3/A4 n’est inventée.
Le calque ne classe aucun waypoint et n’ajoute pas d’image aux PDF.

Aucune migration, autorisation, RPC, RLS ou donnée métier n’est modifiée.
Validation : tests des 50 couleurs et du placement, zones imbriquées,
coordonnées complètes et hiérarchie PDF, pagination de 200 sommets et noms
longs, source inchangée, contrôles visuels desktop/mobile, PDF Projet et
Opération en Mer, ESLint et build de production.
