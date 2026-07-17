# Design QA — carte « Marins par fonction »

## Sources et état comparé

- Vérité visuelle : `C:\Users\chris\Downloads\Image générée 2.png`
- Capture navigateur finale : `C:\Users\chris\AppData\Local\Temp\seapilot-hr-roster-qa-final-desktop.png`
- Carte finale recadrée : `C:\Users\chris\AppData\Local\Temp\seapilot-hr-roster-card-final.png`
- Comparaison complète : `C:\Users\chris\AppData\Local\Temp\seapilot-hr-roster-compare-final.png`
- Comparaison ciblée en-tête et filtres : `C:\Users\chris\AppData\Local\Temp\seapilot-hr-roster-compare-focus-final.png`
- Route locale : `http://127.0.0.1:4173/modules/humanResources?preview=1`
- Viewport bureau : `1440 × 1024`; carte rendue à `519 × 316` avec le panneau de filtres replié et la population **En poste**.
- Viewport mobile : override `390 × 844` (zone de contenu navigateur de 375 px), filtres contrôlés dans leurs états fermé et ouvert.

La référence contient sept marins et un filtre d’échéance actif. La prévisualisation locale contient un marin et aucun filtre documentaire actif. Ces différences relèvent des données dynamiques ; les zones ont été normalisées à la même largeur pour comparer la structure, la densité, les contrôles et les styles sans les interpréter comme un écart visuel.

## Comparaison complète

La comparaison côte à côte confirme la même hiérarchie : en-tête, recherche, résumé repliable, groupes puis lignes compactes. Les lignes de production reprennent la hauteur, les séparateurs, les avatars, les deux métriques et les chevrons de la cible. L’absence de sept lignes dans la capture locale est couverte par les fixtures de test et n’affecte pas le composant.

## Comparaison ciblée

La comparaison focalisée était nécessaire pour lire précisément la typographie, les espacements, les bordures, les icônes et la copie de la zone de filtres. Après normalisation à 524 px de large :

- le titre, le sous-titre et l’action **Modification** suivent la même hiérarchie ;
- le champ de recherche reprend la hauteur, la bordure, le rayon et la copie de la cible ;
- le résumé utilise la même surface bleu pâle, un compteur, le libellé de population, le raccourci **Voir les anciens** et un chevron ;
- le compteur et le résumé sont dynamiques : `1 · En poste` sans filtre documentaire, contre `2 · En poste · À renouveler` dans la référence ;
- aucun libellé « Actif » ni pastille verte n’est rendu dans les lignes de la carte.

## Surfaces de fidélité

- **Polices et typographie** : famille sans-serif existante de SeaPilot conservée ; poids, tailles, hauteurs de ligne et troncature correspondent à la densité de la cible.
- **Espacement et rythme** : colonne de liste portée à environ 519 px sur le viewport de contrôle ; en-tête sur une ligne, filtres compacts et lignes de 58 px.
- **Couleurs et tokens** : bleu SeaPilot, texte marine, surfaces blanches/bleu pâle et séparateurs existants réutilisés.
- **Images et ressources** : la cible ne contient aucune image raster. Les icônes utilisent la bibliothèque déjà installée par SeaPilot ; aucun SVG artisanal, dessin CSS ou substitut n’a été ajouté.
- **Copie et contenu** : recherche, population, raccourci des anciens, catégories et échéances utilisent une copie française cohérente et accentuée.

## Interactions et accessibilité

- Ouverture et fermeture du panneau testées avec les attributs `aria-expanded` et `aria-controls`.
- Sélection **En poste / Anciens / Tous** testée via le champ Population.
- Raccourci **Voir les anciens** et retour **Voir les personnes en poste** testés.
- La sélection de la première personne disponible est restaurée lors du changement de population.
- Carte mobile : `clientWidth = scrollWidth` pour le panneau fermé (`321 px`) et les champs ouverts (`323 px`) ; aucun débordement propre à la carte.
- Aucun log navigateur de niveau warning ou error.

## Historique de comparaison

### Itération 1 — bloquée

- [P2] La colonne liste mesurait environ 452 px : le sous-titre passait sur deux lignes et le résumé **En poste** était tronqué.
- Correction : grille maître/détail rééquilibrée avec une colonne liste minimale de 500 px, recherche allégée, en-tête et bouton **Modification** recalibrés.
- Preuve post-correction : `seapilot-hr-roster-compare-final.png` montre le sous-titre sur une ligne et le résumé sans compression.

### Itération 2 — passée

Aucun écart P0, P1 ou P2 restant. Les différences de noms, de volumes et de compteur de filtres sont les états de données attendus. Le léger écart optique entre l’icône de réglage générée et l’icône Lucide existante est classé P3 et ne justifie pas l’introduction d’une nouvelle famille d’icônes.

## Vérifications automatisées

- `npm test` : 65 fichiers, 462 tests réussis.
- Test RH ciblé : 18 tests réussis.
- `npm run lint` : réussi.
- `npm run build` : réussi.

final result: passed
