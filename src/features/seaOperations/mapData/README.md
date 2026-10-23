# Fonds terrestres hors ligne du Passage Plan

Ces contours Natural Earth servent de fond de situation schématique à l’écran et dans le PDF. Ils ne constituent pas une carte marine : pas de sondes, de marée, de dangers, de précision hydrographique ni de calcul d’UKC. Les petites îles et les détails côtiers peuvent être absents ou déplacés par la généralisation.

Les fichiers sont embarqués dans l’application. Leur affichage ne télécharge aucune tuile et ne transmet aucune coordonnée d’opération à un fournisseur. Seul le script de préparation télécharge les deux archives publiques fixes ; il ne lit aucune route ni donnée métier.

## Format et couverture

Chaque JSON est un tableau de contours `number[][][]` : `[[[longitude, latitude], ...], ...]`, en degrés WGS84, longitude en premier. Les contours sont fermés, orientés dans le sens antihoraire et triés de manière déterministe. Seuls les contours extérieurs des terres sont conservés ; les trous et les lacs sont remplis comme de la terre. Il n’y a ni propriétés GeoJSON ni métadonnées dans ces tableaux.

| Fichier | Couverture déclarée, ouest / sud / est / nord | Source | Tolérance de simplification |
| --- | --- | --- | --- |
| `world-land.json` | Monde : `[-180, -90, 180, 90]` | Natural Earth 1:50 millions | `0,03°` |
| `europe-land.json` | Manche, Atlantique européen et voisinage : `[-15, 40, 12, 58]` | Natural Earth 1:10 millions | `0,003°` |

La couverture décrit les limites admises, sans garantir la présence de terre à chaque bord. Le fond européen est découpé sur ce rectangle avant simplification ; ses segments de bordure ne représentent donc pas forcément un littoral. Le monde est un fond plus grossier destiné notamment aux routes hors de cette zone.

La simplification Shapely conserve la topologie de chaque géométrie, en coordonnées angulaires, puis les coordonnées sont arrondies à `0,001°` (jusqu’à `0,0005°` par axe). Ces paramètres ne sont ni des mètres ni une garantie d’exactitude. La tolérance mondiale de `0,03°` maintient les deux fichiers sous 700 000 octets ; le détail régional reste à `0,003°`.

## Provenance et licence

Natural Earth place ses données vectorielles et raster dans le domaine public, autorise leur modification et leur utilisation commerciale ou imprimée, sans attribution obligatoire. Une mention « Natural Earth » reste utile pour identifier leur provenance. Voir les [conditions officielles](https://www.naturalearthdata.com/about/terms-of-use/), le [catalogue physique 1:50 millions](https://www.naturalearthdata.com/downloads/50m-physical-vectors/) et la [fiche officielle des terres 1:10 millions](https://www.naturalearthdata.com/downloads/10m-physical-vectors/10m-land/).

Les archives ont été récupérées le 23 octobre 2026 depuis l’hébergement officiel Natural Earth. La version provient du fichier `VERSION.txt` inclus dans chaque archive. Le catalogue web 1:50 millions affiche encore 4.0.0 ; l’archive effectivement utilisée indique 4.1.0 et son empreinte est vérifiée avant traitement.

| Archive | Version incluse | SHA-256 de l’archive |
| --- | --- | --- |
| [ne_50m_land.zip](https://naturalearth.s3.amazonaws.com/50m_physical/ne_50m_land.zip) | `4.1.0` | `0b8e670cf80dce9cbebe2a193bc44ba5602758c22e1fa603980553646d7ff162` |
| [ne_10m_land.zip](https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip) | `5.1.1` | `e547d749445eaa0964aba76738090ec88f5e63c4585122170f98c67a7ea922dc` |

Un changement d’archive, de version ou d’empreinte arrête le script ; il doit faire l’objet d’une mise à jour explicite de cette provenance.

## Régénération reproductible

Le générateur est `scripts/prepare-sea-operation-map-data.py`. Les fichiers présents ont été produits avec Python 3.12.14, Shapely 2.1.2 / GEOS 3.13.1, pyshp 2.3.1 et NumPy 2.2.6. Ces dépendances servent uniquement à la préparation ; elles ne sont pas des dépendances du navigateur ou du serveur SeaPilot.

Depuis la racine du dépôt, utiliser un environnement **Python 3.12** isolé, situé en dehors du dépôt, puis installer les versions exactes. `py -3.12` nécessite Python 3.12 installé ; on peut le remplacer par le chemin explicite d’un exécutable Python 3.12. Ne pas utiliser le Python courant sans vérifier sa version (les roues NumPy épinglées ne couvrent pas toutes les versions plus récentes).

```powershell
py -3.12 -m venv "$env:TEMP\seapilot-map-venv"
& "$env:TEMP\seapilot-map-venv\Scripts\python.exe" -m pip install --index-url https://pypi.org/simple --only-binary=:all: shapely==2.1.2 pyshp==2.3.1 numpy==2.2.6
& "$env:TEMP\seapilot-map-venv\Scripts\python.exe" scripts/prepare-sea-operation-map-data.py --cache-dir "$env:TEMP\seapilot-natural-earth"
& "$env:TEMP\seapilot-map-venv\Scripts\python.exe" scripts/prepare-sea-operation-map-data.py --cache-dir "$env:TEMP\seapilot-natural-earth" --check
```

Le cache ne contient que les archives source vérifiées. `--output-dir` permet une génération dans un autre dossier. `--check` reconstruit les tableaux en mémoire et exige des fichiers identiques octet par octet, sans écrire les JSON. Les vérifications incluent les bornes, les coordonnées finies, la fermeture et la validité des contours. Le script normalise aussi l’ordre, l’orientation et le premier sommet de chaque contour, supprime les points consécutifs identiques et exclut les contours dégénérés après arrondi.

Résultat de référence, vérifiable avec `--check` :

| Fichier | Contours | Coordonnées, fermeture incluse | Octets | SHA-256 du JSON |
| --- | ---: | ---: | ---: | --- |
| `world-land.json` | 1 421 | 28 364 | 478 911 | `06cd3b5dae600d4e0cbe7ea0b90a9e2c69477ce76499c61de8b214a6c875105d` |
| `europe-land.json` | 153 | 9 849 | 153 225 | `cace2da6584dd97816eacfd2fd668ecd117fd45ac0df5a2c86dc0fe6209a680d` |

Total : **632 136 octets** avant compression. `.gitattributes` conserve les JSON en LF, y compris sous Windows, pour préserver les empreintes et le contrôle octet par octet. Aucune réparation géométrique n’a été nécessaire pour ces sorties. Le fichier mondial peut comporter des contours aux limites ±180° : le rendu doit traiter les traversées de l’antiméridien et ne pas relier directement ces bords à travers toute la carte.
