# UKC indicative à l’ETA avec Copernicus Marine

Version **3.77.21**, build **2026-10-26.001**.

## Données et calcul

L’UKC automatique utilise la bathymétrie `deptho` et la hauteur d’eau `zos`
du **même produit, de la même version et de la même cellule**. Les deux
variables sont déclarées par rapport au géoïde du modèle. Il n’y a donc ni
addition d’une sonde LAT EMODnet à une hauteur au niveau moyen, ni décalage
CRV SHOM supposé.

```text
UKC statique indicative = profondeur du modèle + hauteur d’eau à l’ETA − tirant d’eau conservé
```

| Modèle | Jeu de niveau d’eau instantané | Version | Usage |
| --- | --- | --- | --- |
| NWS | `cmems_mod_nws_phy-ssh_anfc_1.5km-2D_PT15M-i` | `202511` | Prioritaire dans sa couverture Manche / sud de l’Angleterre et ses échéances disponibles |
| IBI | `cmems_mod_ibi_phy_anfc_0.027deg-2D_PT15M-i` | `202411` | Complément géographique Atlantique et échéances hors horizon NWS |

Les statiques correspondants sont `cmems_mod_nws_phy_anfc_1.5km_static`
et `cmems_mod_ibi_phy_anfc_0.027deg-3D_static`, partie `bathy`.
Le catalogue STAC officiel est consulté avant l’extraction pour vérifier
références, dimensions, grille, version et horizon réellement publié.
Les versions sont fixées : un changement incompatible provoque une
indisponibilité explicite, sans migration silencieuse vers un autre produit.

L’ETA est saisie à l’heure de Paris et convertie en UTC. Les heures inexistantes
ou ambiguës des changements d’heure sont refusées. L’interpolation utilise
uniquement les deux échéances de quinze minutes encadrantes ; un instant exact
utilise sa valeur directement. Pas d’extrapolation ni de moyenne quotidienne
ou horaire détalée. Une nouvelle requête pour une ETA passée ne reconstitue pas
une ancienne prévision ; les captures déjà enregistrées restent conservées.

## Limites affichées

- La maille est kilométrique : environ 1,5 km pour NWS et 2–3 km pour IBI.
  L’estimation ne représente pas une sonde de carte ni une profondeur minimale
  garantie dans un chenal, un port ou au voisinage d’un haut-fond.
- SeaPilot refuse le calcul lorsque la profondeur de modèle est **≤ 10 m**.
  NWS impose un minimum de 10 m dans sa dynamique ; le même seuil appliqué à IBI
  est une barrière conservatrice de SeaPilot, pas un plancher officiel IBI.
- Une cellule masquée, non marine ou incompatible reste indisponible. Aucun
  déplacement vers une cellule voisine, même si la météo utilise un rayon de
  recherche. Un rejet NWS pour petits fonds ou masque n’est pas contourné par IBI.
- L’incertitude totale ponctuelle n’est pas fournie par ces produits. Fond,
  niveau d’eau, tirant d’eau, effet de position et interpolation restent
  explicitement inconnus lorsqu’ils ne sont pas quantifiés. Aucun chiffre
  `±`, intervalle à 95 % ou erreur totale ne provient d’une statistique globale.
- Squat, mouvements et autres corrections dynamiques ne sont pas appliqués.
  Les couleurs UKC conservent les seuils demandés par l’utilisateur et ne
  décident pas du GO / NO GO.

La précision stockée est conservée ; l’affichage automatique utilise `≈` et
deux décimales. La palette se fonde sur la valeur brute, avec sa valeur exacte
dans l’infobulle. La version, la cellule en degrés / minutes, les échéances,
le tirant d’eau et les sources figurent dans la fiche et l’annexe du PDF.
Si l’heure du réseau n’est pas publiée, elle reste inconnue ; une date de
création du catalogue n’est pas présentée comme un réseau de prévision.

## Configuration Vercel

Le compte et l’accès aux données Copernicus Marine sont gratuits. Créer et
activer un compte selon l’[aide officielle](https://help.marine.copernicus.eu/en/articles/4220332-how-to-register-for-copernicus-marine-service).
Dans le projet Vercel `sea-pilot`, ajouter comme variables **secrètes** :

```dotenv
COPERNICUSMARINE_SERVICE_USERNAME=<identifiant du compte>
COPERNICUSMARINE_SERVICE_PASSWORD=<mot de passe du compte>
```

Cibler les environnements Production et Preview autorisés, puis redéployer.
Ces variables n’ont aucun préfixe `VITE_` et ne sont jamais lues dans le client.
Ne pas transmettre leurs valeurs dans le chat, dans Git ou dans une URL.
Sans elles, le service retourne `UKC_NOT_CONFIGURED`, jamais une valeur fictive.

Le backend utilise le SDK officiel `copernicusmarine==2.5.0`, Python 3.12 et
les dépendances fixées dans `requirements.txt`, dont `tzdata` pour Paris.
`api/sea-operation-ukc.py` utilise le routage Python `/api` de Vercel, compatible
avec le projet Vite / Node existant. Aucun serveur REST Copernicus supposé.
Le SDK ouvre les jeux paresseusement ; seules la cellule cible et une ou deux
échéances sont chargées. Les datasets sont fermés après la requête.

Le probe de wheels Linux CPython 3.12 a résolu 66 paquets binaires, environ
328 MiB décompressés avant bytecode et application. Le bundle final et son
import Linux doivent être vérifiés par le déploiement Vercel. La fonction Python
exclut les dépendances Node, les sources frontend, les documents et les gros
assets ; sa durée maximale est de 90 secondes. Les délais HTTPS du SDK sont
bornés et ses tentatives supplémentaires désactivées.

## Droits et conservation

Appliquer `20261026084110_sea_operation_copernicus_ukc.sql` avant le frontend.
Le nouvel RPC `sea_operation_ukc_context` ne renvoie que le projet, le navire et
son tirant d’eau canonique après contrôle du compte réel, de la société, du
module et du lien Planning actif. Aucun accès catalogue Projets supplémentaire,
clé `service_role` ou droit de table n’est accordé.

Chaque requête vérifie le JWT avec Supabase et ce contexte avant le cache.
Un tirant d’eau absent bloque le calcul ; un tirant d’eau modifié exige une
actualisation. Le serveur limite à 30 requêtes / minute / acteur et deux
extractions concurrentes par instance. Le cache de données publiques conserve
au plus 64 positions pendant quinze minutes ou jusqu’à l’ETA. Les réponses sont
privées et non mises en cache par le navigateur. Aucun mode anonyme de
démonstration ne peut utiliser les identifiants Copernicus.

Le champ `ukc` reste la saisie manuelle. Les nouveaux points utilisent
`ukcMode: automatic` ; les anciens points sans mode restent manuels.
`ukcForecast` conserve séparément le calcul, sa provenance et toutes ses
identités. Une capture incompatible avec le projet, le point, la position,
l’ETA, le navire ou le tirant d’eau n’est pas affichée comme une valeur actuelle.
Le retour au mode manuel ne réutilise pas implicitement un chiffre du modèle.

Les déclencheurs SQL valident structure, références, arithmétique et budget.
La canonisation du tirant d’eau intervient avant la suppression d’une capture
obsolète. Aucun backfill des fiches signées. Une révision administrative
commence par le clone exact de la version historique ; les contrôles courants
s’appliquent aux sauvegardes ordinaires suivantes.

Un brouillon incomplet reste enregistrable. GO en mode automatique exige une
capture disponible et compatible, y compris après la sauvegarde canonique.
NO GO reste signable sans cette donnée afin de conserver le parcours
d’interruption de l’opération. La signature fige la capture avec la fiche.

## Sources et vérification

- [Produit NWS et accès](https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/services),
  [manuel NWS](https://documentation.marine.copernicus.eu/PUM/CMEMS-NWS-PUM-004-013.pdf).
- [Produit IBI et accès](https://data.marine.copernicus.eu/product/IBI_ANALYSISFORECAST_PHY_005_001/services),
  [manuel IBI](https://documentation.marine.copernicus.eu/PUM/CMEMS-IBI-PUM-005-001.pdf).
- [SDK et authentification serveur](https://toolbox-docs.marine.copernicus.eu/en/stable/usage/quickoverview.html).
- [Fonctions Python Vercel dans `/api`](https://vercel.com/docs/functions/runtimes/python/api-directory).
- [Attribution Copernicus](https://help.marine.copernicus.eu/en/articles/4444611-citing-copernicus-marine-products-and-services).

L’export conserve « Generated using E.U. Copernicus Marine Service Information. »
et le lien produit / DOI. Les tests partagent une fixture arithmétique Python /
TypeScript et couvrent les droits réels, les captures périmées, la canonisation,
les indisponibilités, les profils et la conservation des historiques. Les tests
SQL utilisent des transactions annulées, sans fixture métier persistante.
