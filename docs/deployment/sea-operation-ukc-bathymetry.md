# Indicateur UKC et données bathymétriques — 24 octobre 2026

Depuis **3.77.21**, une autre voie utilise la profondeur et le niveau d’eau du
même modèle Copernicus NWS / IBI, au géoïde du modèle. Elle fournit une UKC
statique indicative lorsque les données sont admissibles ; elle ne constitue
pas un raccord CRV SHOM / LAT. Voir
[configuration, règles et limites](./sea-operation-copernicus-ukc.md).

Le raccord vertical et les démarches d’accès serveur sont détaillés dans
[SHOM CRV : connexion et qualification](./sea-operation-shom-crv.md). En
v3.77.20, le moteur de calcul est préparé et testé, mais reste non connecté :
aucun nouveau calcul UKC n’est activé sans conversion locale qualifiée.

## Affichage demandé

Les seuils confirmés par l’utilisateur comparent la valeur **UKC** au tirant
d’eau de référence **TE** conservé dans la version de la fiche :

| Plage | Pilule | Icône |
| --- | --- | --- |
| UKC ≤ TE | Rouge | Triangle avec point d’exclamation |
| TE < UKC ≤ TE + 2 m | Orange | Triangle avec point d’exclamation |
| UKC > TE + 2 m | Verte | Aucune |

L’intervalle entre TE et TE + 1 m appartient donc à l’orange. L’égalité à TE
est rouge ; l’égalité à TE + 2 m est orange. Zéro et les UKC négatives restent
des valeurs numériques. Une annotation libre, une UKC absente ou un tirant
d’eau inconnu conserve un affichage neutre. Le tirant d’eau vient de Navires,
avec sa plage existante 0 < TE ≤ 50 m. Les fiches signées anciennes sans copie
du TE ne prennent pas la valeur actuelle du navire.

Ces bandes sont un indicateur demandé par l’utilisateur ; elles ne changent
aucune réponse du questionnaire ni la décision GO / NO GO. L’UKC est déjà une
distance sous quille, distincte de la profondeur totale de l’eau.

## Recherche vérifiée sur les services publics

### EMODnet DTM 2024

Le service [ERDDAP officiel](https://erddap.emodnet.eu/erddap/info/bathymetry_dtm_2024/index.html)
renvoie des valeurs numériques sans clé par latitude / longitude. Résolution
de 1/16 minute, environ 115 m ; référence **LAT**, plus basses mers astronomiques.
Les élévations négatives représentent un fond sous le LAT.

Requête testée HTTP 200 le 24 octobre 2026 :

```text
https://erddap.emodnet.eu/erddap/griddap/bathymetry_dtm_2024.json?elevation[(49.994327)][(0.95218)],elevation_min[(49.994327)][(0.95218)],elevation_max[(49.994327)][(0.95218)],stdev[(49.994327)][(0.95218)],value_count[(49.994327)][(0.95218)],interpolation_flag[(49.994327)][(0.95218)]
```

La maille retournée 49.9942708333 / 0.9526041667 contient une profondeur moyenne
de **20,657 m**, une plage de **19,8 à 21,4 m**, une dispersion `stdev` de
**0,521 m**, sept valeurs et aucun drapeau d’interpolation. La profondeur la plus
faible représentée est `-elevation_max`, la profondeur moyenne `-elevation`.
Un second point 50.040207 / 1.062837 donne 17,660 m ; un point terrestre renvoie
explicitement des valeurs nulles.

`stdev` décrit la dispersion des valeurs de la maille. Ce champ ne démontre
ni une incertitude de mesure ni un intervalle de confiance à 95 %. Il ne faut
pas inventer une incertitude totale à partir de cette seule variable.
Les métadonnées indiquent que le MNT n’est pas destiné à la navigation.

### SHOM HOMONIM

Le [MNT Atlantique / Manche](https://diffusion.shom.fr/donnees/bathymerie/mnt-facade-atl-homonim.html)
est disponible en données ouvertes avec attribution, à 0,001° environ 111 m,
en variantes PBMA ou niveau moyen. Le WMS public retourne des images, mais le
`GetFeatureInfo` testé sur `HOMONIMPBMA3857` refuse l’interrogation numérique.
Une exploitation de sondes demande de télécharger et servir les fichiers du MNT.
Le [descriptif officiel, §5.1](https://services.data.shom.fr/static/specifications/Descriptif_Contenu_MNT_facade_2020.pdf)
précise les limites d’utilisation pour la navigation.

### SHOM niveaux d’eau TOLOSA

Le [service de prévisions côtières](https://www.shom.fr/fr/copernicus) fournit
gratuitement, sans compte, des niveaux d’eau horaires interrogeables par
[ncWMS](https://services.data.shom.fr/support/fr/geoservices/ncwms).
Requête publique testée HTTP 200 :

```text
https://services.data.shom.fr/ncwms2/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=NIVEAUX_TOLOSA_R1120_NORMANDIE-200M/ssh&QUERY_LAYERS=NIVEAUX_TOLOSA_R1120_NORMANDIE-200M/ssh&STYLES=&CRS=CRS:84&BBOX=0.95118,49.993327,0.95318,49.995327&WIDTH=1&HEIGHT=1&I=0&J=0&INFO_FORMAT=text/xml&FEATURE_COUNT=1&TIME=2026-10-24T10:00:00.000Z
```

Résultat au même point : **3,466934188 m**, relatif au **niveau moyen du modèle**.
Le catalogue consulté couvre des échéances horaires jusqu’au 27 octobre 06:00
UTC ; cet horizon est une observation du jour, pas une garantie permanente.

Ce niveau ne s’additionne pas directement à la profondeur LAT EMODnet. La
[notice SHOM de changement de référence verticale](https://services.data.shom.fr/static/help/fr/Notice_CRV.pdf)
décrit une conversion du niveau moyen HYCOM utilisant BathyElli et des
incertitudes locales ; il ne suffit pas de le renommer « niveau moyen ».

### Autres services de marée

[SUPMarée / SAPM](https://services.data.shom.fr/support/fr/services/spm) fournit
des prédictions portuaires ou en tout point avec abonnement et identifiants.
[REFMAR](https://services.data.shom.fr/support/en/services/refmar) fournit les
observations de marégraphes, pas une prédiction future au waypoint.

## Conséquence pour le calcul automatique

La formule reste : profondeur de référence + niveau d’eau au même datum et à
l’ETA − tirant d’eau réel − corrections dynamiques. Il faut qualifier les
sources, harmoniser leurs références verticales et établir les incertitudes
spatiales, verticales, de niveau d’eau, de tirant d’eau et de mouvements avant
de présenter un calcul complet à l’ETA.

Cette livraison ajoute les indicateurs et les sources vérifiées ; elle ne
fabrique pas une UKC à partir de niveaux incompatibles, d’une marée absente ou
d’une profondeur déplacée vers un point voisin. Le rayon météo de 10 km n’est
pas applicable à une sonde bathymétrique.

## Vérifications

La migration `20261024052953_sea_operation_ukc_draft_snapshot.sql` conserve la
référence canonique de Navires uniquement à l’écriture d’un brouillon. Elle
respecte le clone exact créé par la révision administrative et ne fait aucun
backfill des fiches signées.

Le test `supabase/tests/sea_operation_ukc_draft_snapshot_test.sql` vérifie les
droits de vrais profils Capitaine / Marin / Admin / autre société, les valeurs
absentes, la canonisation, la signature et les révisions. Les **14 assertions**
ont réussi sur le projet lié, dans une transaction intégralement annulée.
pgTAP a été chargé uniquement dans cette transaction, sans extension persistante.
Le digest de la fiche signée existante est identique avant et après les tests.
Les tests de la fiche, du composant et du PDF couvrent les trois bandes, leurs
bornes exactes, les valeurs négatives, les annotations libres et les historiques.
Les décimales saisies ne sont pas arrondies au point de masquer un franchissement
de seuil dans la pilule.
