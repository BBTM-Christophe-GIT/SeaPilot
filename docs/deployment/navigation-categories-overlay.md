# Catégories françaises de navigation professionnelle

## Source officielle embarquée

`src/features/seaOperations/mapData/shom-navigation-categories.json` contient les
limites vectorielles publiées par le Shom pour les **2e et 3e catégories** de
navigation professionnelle. Source : [Catégories de navigation effectuées par les
navires professionnels — métadonnées Shom](https://services.data.shom.fr/geonetwork/upload/api/records/BDML_DAM_LIMITE_CAT_NAVIGATION.xml),
présentée sur le [portail officiel Limites maritimes](https://limitesmaritimes.gouv.fr/thematiques/circulation-et-navigation).

Les deux réponses du [WFS public Shom](https://services.data.shom.fr/support/fr/geoservices/wfs)
ont été récupérées le **28 octobre 2026**. La publication du jeu est datée du
**29 juillet 2016** et ses métadonnées principales du **19 octobre 2021** ; leur
fréquence de mise à jour est « au besoin ». La date du 14 septembre 2026 affichée
sur la page Limites maritimes est celle de la page, pas une nouvelle version des
géométries. La source ne fournit pas de numéro de version du jeu.

La couche native est en **EPSG:3857**. Les requêtes épinglées demandent le WFS
**1.0.0**, `srsName=EPSG:4326` et `outputFormat=application/json`. Les réponses
déclarent `urn:ogc:def:crs:EPSG::4326` et publient les coordonnées en degrés
**WGS84, longitude puis latitude**. Les géométries obtenues avec WFS 2.0.0 sont
identiques ; les réponses `resultType=hits` et les nombres d'enregistrements du
SHP officiel confirment les 3 et 8 entités sans troncature.

| Catégorie | Couche / requête officielle exacte | Entités / parties de ligne | Coordonnées | Octets source | SHA-256 de la réponse source |
| --- | --- | ---: | ---: | ---: | --- |
| 2 | [`DAM_LIMIT_CAT_NAVIGATION_WFS:categorie2_lines_3857`](https://services.data.shom.fr/INSPIRE/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=DAM_LIMIT_CAT_NAVIGATION_WFS:categorie2_lines_3857&srsName=EPSG:4326&outputFormat=application/json) | 3 / 3 | 2 013 | 56 137 | `fd220c668b9c11e04aa3ffd99f07da9ac26cf91c3534751ee4fdc7700864b6ef` |
| 3 | [`DAM_LIMIT_CAT_NAVIGATION_WFS:categorie3_lines_3857`](https://services.data.shom.fr/INSPIRE/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=DAM_LIMIT_CAT_NAVIGATION_WFS:categorie3_lines_3857&srsName=EPSG:4326&outputFormat=application/json) | 8 / 8 | 5 491 | 140 519 | `4c0b418a7b9da190cb8e1b653febd52f17b6f844da31a0e00ccf66b1272d35da` |

Les empreintes brutes ci-dessus identifient les réponses récupérées initialement.
GeoServer produit un champ `timeStamp` à la racine avec l'heure de chaque
requête : deux téléchargements du même contenu ont donc des empreintes brutes
différentes. Pour permettre une nouvelle récupération reproductible, le script
vérifie un unique `timeStamp` de service au format ISO8601 puis remplace
**uniquement sa valeur** par le texte ASCII `<service-timeStamp>` dans les octets
source avant calcul de l'empreinte de contenu. Tous les autres octets, y compris
les coordonnées et les comptes, restent strictement identiques. Aucun autre
champ variable ou changement de contenu n'est accepté.

| Catégorie | SHA-256 du contenu épinglé, seul `timeStamp` normalisé |
| --- | --- |
| 2 | `def473e19d9d2fa0d66c5046c6e5152f8a07e8312cd59274c58c3a57fb77faa3` |
| 3 | `45f7797da5de5ae3f9d58a97167a0a68cbd3de50a3020958d125f220c4dd1e46` |

L'[archive SHP officielle](https://services.data.shom.fr/INSPIRE/telechargement/prepackageGroup/DAM_LIMIT_CAT_NAVIGATION_PACK_DIFFL_DL/prepackage/CATEGORIE_NAVIGATION/file/CATEGORIE_NAVIGATION.7z)
contient des fichiers datés du 27 juillet 2016 et une fiche PACK datée du
26 juillet 2016, qui cite encore la Licence Ouverte 1.0. La **fiche principale
actuelle**, datée de 2021 et liée par le portail officiel, cite la **Licence
Ouverte Etalab 2.0 d'avril 2017**. C'est cette licence qui est documentée pour les
réponses WFS utilisées ici.

## Licence et limites de couverture

La [Licence Ouverte Etalab 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence)
permet la réutilisation en citant la source. Mention à conserver avec le rendu :
**« Source : Shom — Catégories de navigation professionnelle (2016), extrait du
28 octobre 2026. Licence Ouverte 2.0. Ne pas utiliser pour la navigation. »**
La dernière phrase est une limitation explicite du producteur. L'échelle
indicative des métadonnées est 1:25 000 ; elle ne garantit pas l'exactitude d'un
affichage agrandi ni la conformité d'une route.

Les réponses publiées couvrent la **France métropolitaine et la Corse** et leur
voisinage maritime. Elles ne contiennent pas de limites ultramarines. Le
rectangle global annoncé par `GetCapabilities` s'étend à l'outre-mer, mais ne
correspond pas à la couverture des entités effectivement retournées. Les bornes
vérifiées, dans l'ordre ouest / sud / est / nord, sont :

| Catégorie | Bornes EPSG:4326 des coordonnées publiées |
| --- | --- |
| 2 | `[-10.11074194, 38.52088119, 13.76234309, 54.57840393]` |
| 3 | `[-5.65255648, 41.13829746, 10.00864778, 51.43576969]` |

Les limites sont des **lignes ouvertes**, pas des polygones de zones. Le fichier
préserve toutes les parties `MultiLineString`, leur ordre et chaque coordonnée
source, avec ses décimales publiées, jusqu'à huit décimales. Il ne ferme, ne
fusionne, ne simplifie et n'arrondit aucune ligne. Une absence de trait ne prouve
pas l'absence de règle, de restriction ou d'une catégorie.

Le portail et la fiche principale avertissent que le jeu n'intègre pas le
changement du 30 août 2021 concernant la 4e catégorie. Les limites des catégories
4 et 5 sont exclues de cet extrait. La 4e catégorie bis introduite en 2026 n'est
pas représentée non plus.

## Sens réglementaire des catégories 1, 2 et 3

L'[article 110.11 en vigueur depuis le 18 juin 2026](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000054265707/)
de l'arrêté du 23 novembre 1987, modifié par l'arrêté du 20 avril 2026, conserve
les définitions des catégories 1 à 3 :

- **1re catégorie** : les navigations qui ne relèvent pas des catégories
  suivantes. Il n'existe pas de ligne officielle de 1re catégorie dans ce jeu ;
  aucun contour n'est inventé pour la représenter.
- **2e catégorie** : rester à 200 milles nautiques au plus d'un port ou d'un lieu
  permettant de mettre passagers et équipage en sécurité, **et** limiter à
  600 milles la distance entre le dernier port d'escale du pays de départ et le
  port final de destination.
- **3e catégorie** : rester à 20 milles nautiques au plus de la terre la plus
  proche.

La catégorie autorisée et les restrictions propres au navire figurent sur son
permis de navigation. Une position ou une intersection avec un trait ne suffit
donc pas à classer réglementairement un voyage ; le critère de distance de la
2e catégorie dépend aussi du voyage et des lieux de mise en sécurité.

## Régénération reproductible

Le script `scripts/prepare-navigation-category-data.py` utilise uniquement la
bibliothèque standard Python. Il télécharge les **deux URL publiques fixes** en
l'absence de cache et exige HTTP 200, une taille inférieure à 1 Mo et les
empreintes SHA-256 de contenu épinglées, après la seule normalisation du
`timeStamp` décrite ci-dessus, avant extraction des coordonnées. Un cache altéré
ou une source modifiée arrête la génération ; aucune mise à jour d'empreinte
n'est automatique.
Le script ne lit aucune route ni donnée d'opération.

```powershell
py scripts/prepare-navigation-category-data.py --cache-dir "$env:TEMP\seapilot-navigation-categories"
py scripts/prepare-navigation-category-data.py --cache-dir "$env:TEMP\seapilot-navigation-categories" --check
```

Le cache contient `categorie2-wfs1.geojson` et `categorie3-wfs1.geojson`. Le script
vérifie le CRS, les comptes `totalFeatures` / `numberMatched` / `numberReturned`,
les types et nombres de géométries, les comptes de coordonnées, les bornes et
l'ordre des axes. Les nombres sont lus et sérialisés avec `Decimal` pour
conserver toutes les décimales sans conversion en flottants binaires.

Le contrat du JSON embarqué est
`{ "categories": [{ "category": 2, "lines": number[][][] }, { "category": 3, "lines": number[][][] }] }`,
avec chaque point sous la forme `[longitude, latitude]`. Les propriétés GeoJSON
sans utilité pour le tracé sont retirées. `--check` reconstruit l'asset en mémoire
et exige l'identité octet par octet avec le fichier versionné sans le réécrire.
L'application utilise cet asset statique ; le téléchargement des sources sert
uniquement à sa préparation.

Sortie de référence : **11 parties de ligne, 7 504 coordonnées, 189 597 octets**,
SHA-256 `08fdb438f5798e6e241b8e8fb196320f78f104188bb19541a996d4473a6f7c77`.

## Affichage partagé Projet / Opération en Mer

Version `3.80.12`, build `2026-10-28.006`. Le bouton **Catégories de navigation**
remplace le précédent volet documentaire SMDSM dans les cartes d'écran. Le
calque est optionnel ; les limites 2 et 3 ont chacune leur case, leur couleur et
leur motif de pointillé. La 1re catégorie est expliquée dans la légende, sans
frontière inventée. Les noms et les sommets des zones métier, les ports et les
waypoints restent au premier plan. Aucune catégorie ni autorisation n'est
calculée pour une position.

Le JSON est chargé dans un chunk local à la première activation, préparé une
seule fois, puis gardé en mémoire. Aucun appel au SHOM n'est fait au zoom ou au
déplacement. La projection est mémoïsée sur le cadrage confirmé, indépendante
du point temporaire déplacé. Les limites sont dans le groupe caméra existant :
le zoom à la molette utilise la même transformation par frame que le fond.
Les chunks de 64 segments sont éliminés par leurs bornes avant projection ;
les segments visibles sont découpés au cadre puis simplifiés à moins de 0,4 px.
Les limites source restent inchangées. La préparation refuse plus de 20 000
coordonnées ou 100 lignes au lieu de tronquer silencieusement le calque.

Les tracés n'interceptent ni le clic, ni le glisser, ni la molette. Les
contrôles gardent les verrouillages de la carte en cours d'enregistrement.
L'activation est un choix d'affichage local : aucune écriture métier, migration,
permission, clé ou variable d'environnement supplémentaire. Les cartes HTML
des documents et les PDF n'activent pas le calque. Le composant partagé reçoit
un opt-in explicite depuis l'éditeur et les vues de carte d'écran.

La légende passe sur plusieurs lignes sur petit écran. En plein écran, ses
définitions longues défilent dans un panneau borné pour garder la carte et les
commandes accessibles.

Validation : 24 tests du calque et de sa géométrie, 134 tests existants de la
carte, de l'éditeur et de la fiche Projet ; contrôle visuel desktop/mobile,
plein écran, changement de limite, glisser et molette. Génération fraîche puis
`--check` identique et rejet des sources altérées (coordonnée, comptes, CRS,
ordre des axes ou fermeture). La livraison est préparée en prévisualisation
pour permettre la vérification visuelle demandée.

## Réglages et réactivité — version 3.80.13

Build `2026-10-28.007`. À la première activation du calque, seule la 3e catégorie
est cochée. Les deux libellés de catégories utilisent le vert partagé
`--sp-success` ; leurs traits gardent leurs couleurs et pointillés distincts.
Le texte SVG de la carte n'est plus sélectionnable à la souris, y compris les
libellés de villes, ports, zones et coordonnées. Les champs et les textes autour
de la carte restent normalement sélectionnables.

Le glisser et la molette fonctionnent aussi dans le cadrage automatique de
l'éditeur, sans activer le placement. Les clics de fond et la touche Entrée
n'ajoutent toujours aucun point tant que le placement n'est pas activé. Les
boutons des ports conservent leur action explicite existante. Les contrôles
désactivés et les droits de modification restent appliqués.

Le déplacement de caméra coalesce les événements pointeur dans une seule
transformation SVG par frame. La projection exacte et les libellés ne sont
reconstruits qu'au relâchement, avec un seul rappel du cadrage contrôlé. Le zoom
continu suit le même principe et ne force plus une projection complète toutes
les 160 ms. Les détails nouvellement découverts au bord du cadre sont actualisés
quand le geste se termine. L'annulation, le changement de source, la perte de
focus et le plein écran annulent les frames en attente et restaurent le cadre.

La liste régionale des ports n'est montée dans le DOM que lorsque son volet
est ouvert. Le catalogue complet et le compteur restent conservés. Les noms,
tris et rattachements sont indexés une fois ; un index de villes par cases de
2° réduit les recherches après un changement de cadrage. L'ordre d'origine est
rétabli avant le placement des libellés. Les vues presque mondiales utilisent
le catalogue complet pour ne pas perdre les villes de part et d'autre de
l'antiméridien. Les six scénarios de comparaison (monde, Europe, Manche, port,
mobile et antiméridien) conservent les mêmes ports, coordonnées et libellés,
vérifiés par empreinte de leur sortie complète.

Les tests de gestes vérifient qu'une rafale de 120 déplacements ou un flux de
50 événements de molette n'effectue aucune projection complète pendant le geste
et une seule à la fin. Les tests des véritables fixtures serveur Capitaine et
Marin continuent à interdire toute modification : ils reconnaissent uniquement
le bouton d'affichage hérité du fieldset en lecture seule, désactivé dans ce
contexte. Le test du portefeuille Projet attend le montage asynchrone de sa
commande Carte avant d'interagir.

## Couleur de la 2e catégorie — version 3.80.14

Build `2026-10-28.008`. Le libellé et l'accent de la case de la 2e catégorie
utilisent désormais le violet de son tracé (`#7e429f`) dans les deux modules.
Le libellé de la 3e catégorie reste vert et seule cette catégorie est cochée
à la première activation. Les géométries, leurs pointillés et les gestes de
navigation restent identiques.
