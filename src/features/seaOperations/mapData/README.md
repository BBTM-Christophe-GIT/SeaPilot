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

## Noms de villes et repères de ports hors ligne

`places.json` ajoute des points de référence à la carte interactive, sur demande
explicite via `showPlaces`. Le rendu statique historique et le PDF compact ne
les activent pas. `showWaypointCoordinates` ajoute séparément les coordonnées
OMI en degrés et minutes sous les points du tableau, avec leur indice original.

Ce sont des **repères de situation**, sans information hydrographique. Un point
de port n’indique ni une entrée, ni un chenal, ni un quai ou une position sûre.
La précision n’est pas garantie ; la généralisation du fond terrestre peut aussi
placer visuellement un repère sur la terre. Aucun point n’alimente les calculs
UKC ni la sélection automatique d’un waypoint. Aucun appel réseau n’est effectué
pendant l’affichage et les coordonnées d’opération ne sont pas transmises.

### Sources et licences

Les sources ont été téléchargées le **26 octobre 2026** :

| Données embarquées | Source primaire | Licence et limites |
| --- | --- | --- |
| 671 points français, identifiant `CdPort`, nom, commune, département, coordonnées CRS84 et code de précision | [SANDRE/SHOM, Ports – Espace maritime français](https://www.data.gouv.fr/datasets/ports-espace-maritime-francais), [GeoJSON officiel](https://services.sandre.eaufrance.fr/telechargement/geo/PTS/PortMaritime_FRA/Port_Maritime_FRA.geojson.zip) | Licence Ouverte Etalab ; code de précision publié conservé, souvent `0` (inconnue). Les identifiants ne sont pas des LOCODE. |
| 186 points du Royaume-Uni, numéro WPI, nom et LOCODE s’il est syntaxiquement valide | [NGA, World Port Index](https://msi.nga.mil/Publications/WPI), [CSV officiel](https://msi.nga.mil/api/publications/download?key=16920959%2FSFH00000%2FUpdatedPub150.csv&type=view) | Travail du gouvernement des États-Unis, domaine public (17 USC ; [publication officielle](https://msi.nga.mil/api/publications/download?key=16694622%2FSFH00000%2FPub150bk.pdf&type=view)). Couverture et précision partielles. Le CSV contient 3 807 entrées mondiales ; seul le sous-ensemble Royaume-Uni est embarqué. La source ne donne pas de numéro de version dans le CSV. |
| 7 342 villes et localités mondiales, nom, identifiant Natural Earth, point, rang cartographique et population indicative de tri | [Natural Earth 1:10m Populated Places Simple](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/), version **5.1.2** | [Domaine public Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/). Échantillonnage cartographique de localités ; ni liste exhaustive de communes ni recensement actuel. |

Les coordonnées SANDRE et NGA sont arrondies à six décimales pour le stockage ;
cette résolution de stockage n’est pas une précision déclarée. Les points des
villes proviennent de la géométrie SHP, également arrondie à six décimales.

Les noms des villes sont espacés selon le rang Natural Earth et la place
disponible. Les libellés des ports peuvent être masqués pour éviter les collisions,
mais chaque point identifié reste une ancre et **tous les ports localisés dans le
rectangle visible restent dans la liste régionale**, repliable et défilante.
Plusieurs entrées partageant le même point source partagent une ancre dont le titre
énumère leurs noms. Le filtrage tient compte de l’antiméridien.

### Association au catalogue Projets

Le modèle importe directement **`PROJECT_PORTS`** ; il ne maintient pas une liste
séparée de grands ports. Chaque entrée conserve son objet, ses codes, sa commune,
ses éventuels rattachements et son libellé `formatProjectPort`. Seules des identités
entièrement identiques sont dédupliquées.

En France, la jointure utilise le **nom du port**, la **commune** et le **code du
département** lorsqu’ils sont disponibles (casse, accents et ponctuation
normalisés). Elle exige un résultat unique. Les homonymes Saint-Pierre sont
ainsi distingués. Les **669 ports officiels** du catalogue, dont **161 sans LOCODE
propre**, sont tous rattachés à leur point SANDRE. Le catalogue contient aussi
**9 alias historiques** sans correspondance géographique propre (certains
désignent un territoire) : l’interface annonce donc **669/678**, sans leur
attribuer un centre de commune ou de territoire.

En Angleterre, la jointure utilise le **LOCODE propre** exact, à défaut un nom WPI
exact et unique. Un LOCODE municipal n’est jamais utilisé comme position de port.
Trois équivalences de noms explicites sont conservées : Portsmouth ↔ Portsmouth
Harbour, Portland ↔ Portland Harbour et Hughtown (St Mary's) ↔ St. Mary's (Scilly
Isl.). Elles associent le lieu nommé au point publié, sans inventer de coordonnées.
Les LOCODE mal formés du CSV sont écartés, jamais réparés par supposition.
Résultat : **75/202** entrées anglaises ont une position propre retrouvée.

Les autres entrées restent dans le catalogue. Un rattachement statistique à un
port géoréférencé visible peut apparaître dans une sous-liste distincte : il porte
la mention **« position propre non disponible »** et n’est pas dessiné à la position
de son parent. Ce rattachement ne prouve pas que le port enfant est dans le cadre.
Une entrée sans position ni rattachement connu ne peut pas être filtrée selon
la région ; les compteurs de couverture rendent cette limite explicite.

Le [répertoire géographique DfT annoncé sur data.gov.uk](https://www.data.gov.uk/dataset/e3168df2-194d-4578-8ae4-c4b26c96e4dc/port-locations)
est marqué non publié. Le service UNECE officiel consulté pour compléter les
coordonnées anglaises renvoyait HTTP 403 ; aucune restriction n’a été contournée.

### Régénération des repères

Le script `scripts/prepare-sea-operation-map-places.py` utilise uniquement la
bibliothèque standard Python (lecture SHP/DBF de points, GeoJSON et CSV). Il
télécharge uniquement les trois sources publiques fixes en l’absence de cache.
Les empreintes sont vérifiées **avant** traitement ; une modification de source
interrompt la génération et nécessite une revue des associations et de cette
provenance.

| Source | SHA-256 |
| --- | --- |
| `Port_Maritime_FRA.geojson.zip` | `e6dfa72fa5abf5931b0c99136ef305421596c400123ee17d4d2051be154b6820` |
| `UpdatedPub150.csv` | `315644f1e77966291633145fd351c2762b37702d115926b9ed074b39e8e21667` |
| `ne_10m_populated_places_simple.zip` | `2963ee08f7743f13f37d5243acd77a2f7a510e26a36c7e04b920f1b381f2b251` |

```powershell
py scripts/prepare-sea-operation-map-places.py --cache-dir "$env:TEMP\seapilot-map-places"
py scripts/prepare-sea-operation-map-places.py --cache-dir "$env:TEMP\seapilot-map-places" --check
```

Sortie déterministe : **857 points de port source + 7 342 villes**, **473 793 octets**,
SHA-256 `d4888b349117e3b3c58041571819670b33d6743d482ad760242d70062ba473b5`.
Les points source non associés au catalogue Projets ne sont pas ajoutés à la liste
des ports de SeaPilot.
