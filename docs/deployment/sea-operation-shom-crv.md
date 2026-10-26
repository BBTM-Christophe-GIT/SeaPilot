# Raccord SHOM CRV pour l’UKC à l’ETA

État vérifié le **24 octobre 2026**, version **3.77.20**.

Depuis **3.77.21**, le calcul indicatif utilise une paire fond / niveau d’eau
issue du même modèle Copernicus NWS ou IBI. Cette voie est décrite dans le
[guide Copernicus](./sea-operation-copernicus-ukc.md). Le présent document reste
la recherche du raccord SHOM / LAT ; l’accès CRV et ses deux raccords ne sont
pas supposés résolus par le changement de fournisseur.

## Ce qui est gratuit et ce qui reste à confirmer

Le compte utilisateur SHOM et la consultation des prévisions sur son portail
sont gratuits. La [notice CRV adaptée à l’océanographie](https://services.data.shom.fr/static/help/fr/Notice_CRV.pdf)
décrit le changement de référence depuis un océanogramme du portail.
Cela ne confirme pas des droits d’appel serveur depuis SeaPilot.

La [page actuelle des API](https://diffusion.shom.fr/services-numeriques/api-shom.html)
annonce des abonnements pour SPM / SAPM et la gratuité de REFMAR et des
vignettes. Le [répertoire 2026](https://diffusion.shom.fr/media/R_pertoire-2026.pdf)
et les [licences actuelles](https://diffusion.shom.fr/licences) ne donnent pas
de tarif CRV identifiable. Les anciens tarifs du répertoire 2021–2025 ne sont
pas une offre actuelle. **Ni gratuité ni tarif API CRV 2026 confirmés** : ne pas
souscrire à SPM / SAPM en supposant qu’il s’agit d’un accès CRV.

## Démarche de connexion

1. Créer un compte sur [data.shom.fr](https://data.shom.fr), icône silhouette,
   **Créer un compte**, puis confirmer l’adresse email. Le compte est commun
   aux portails data et diffusion. Voir l’[aide officielle](https://api.data.shom.fr/support/fr/aide/tuto/creercomptedata).
2. Demander au [support SHOM](https://diffusion.shom.fr/contact) les conditions,
   le tarif éventuel et les droits **serveur à serveur** pour le service CRV.
   Ne pas acheter d’abonnement sans leur confirmation de la référence requise.
3. Obtenir le contrat exact des requêtes / réponses et la qualification des
   réalisations verticales ci-dessous. La seule création du compte n’active
   pas la conversion dans SeaPilot.
4. Lorsque le connecteur aura été développé contre ce contrat et testé,
   enregistrer la clé dans **Vercel → projet sea-pilot → Settings → Environment
   Variables**, sous un nom serveur, prévu `SHOM_CRV_API_KEY`, type **Secret**,
   pour les environnements autorisés par le SHOM. Aucun préfixe `VITE_`.
   Appliquer les restrictions distinctes Production / Preview du compte et
   redéployer les environnements concernés. Ne pas envoyer la clé dans le chat,
   la placer dans Git ou l’inclure dans une URL retournée au navigateur.
5. Vérifier un point connu en Manche et un point connu en Atlantique, puis les
   cas sans couverture, droits manquants et incertitude indisponible avant
   d’activer le calcul automatique.

**La variable ci-dessus est un nom réservé au futur connecteur : cette version
ne la lit pas. L’ajouter seule n’activera pas l’UKC.** Aucun abonnement, compte,
secret ou service externe n’a été créé par cette livraison.

## État technique vérifié

- La [configuration publique CRV](https://services.data.shom.fr/crv/getConfig)
  annonce `https://services.data.shom.fr/crv/{clé}/changeVerticalRef`.
- La [liste des références](https://services.data.shom.fr/crv/listVerticalRef)
  contient notamment `NM_HYCOM2DOCEANO_1` et `PBMA1_1`. Cela ne démontre pas que
  ces identifiants conviennent à TOLOSA ou à la réalisation LAT d’EMODnet.
- La clé anonyme du portail répond **401, MissingRights / Wrong referer** à
  l’appel serveur testé. Elle ne constitue pas une clé serveur réutilisable.
  Aucun en-tête de provenance n’est falsifié pour contourner cette restriction.
- Le contrat de `changeVerticalRef` n’a pas pu être validé avec les accès
  disponibles. Aucun paramètre supposé ni adaptateur non vérifié n’est déployé.

## Références à harmoniser

EMODnet DTM2024 est référencé au **LAT**. Les hauteurs publiques `ssh` TOLOSA
sont relatives au **niveau moyen du modèle**. Additionner directement ces
deux valeurs produirait une erreur de référence verticale.

La notice CRV de mai 2023 décrit le niveau moyen HYCOM / HOMONIM, construit à
partir de PBMA BathyElli V1 et d’une grille PBMA–NM, et un ZH BathyElli V2.1.
Le [descriptif SHOM des niveaux, novembre 2024](https://services.data.shom.fr/static/specifications/Descriptif_Contenu_oceano_niveaux.pdf)
indique le remplacement de HYCOM par TOLOSA au 6 novembre 2024, mais ne certifie
pas l’équivalence exacte entre le NM TOLOSA et l’identifiant CRV HYCOM.
Il reste à qualifier **NM TOLOSA ↔ référence CRV** et **LAT EMODnet ↔ réalisation
PBMA / LAT de la conversion**. Un niveau moyen générique n’est pas équivalent
par son seul nom ; utiliser la bathymétrie EMODnet convertie au MSL par GTSM
ne garantit pas son raccord au niveau moyen de TOLOSA.

Une archive [MNT Atlantique HOMONIM au NM](https://services.data.shom.fr/INSPIRE/telechargement/prepackageGroup/MNT_ATL100m_HOMONIM_PBMA_4326_PACK_DL/prepackage/MNT_FACADE_ATLANTIQUE_HOMONIM_NM/file/MNT_FACADE_ATLANTIQUE_HOMONIM_NM.7z)
est publique (425 290 891 octets, maille 0,001°). Sa
[spécification](https://services.data.shom.fr/static/specifications/Descriptif_Contenu_MNT_facade_2020.pdf)
ne démontre pas davantage l’identité de son NM avec TOLOSA. Elle nécessite un
prétraitement géographique ; aucun téléchargement de 425 Mo par waypoint.

## Calcul préparé et incertitude

Le moteur pur `seaOperationUkcEstimateModel.ts` n’est pas connecté à un endpoint,
à l’interface ou aux fiches enregistrées. Il prépare :

```text
δ = hauteur ellipsoïdale du NM source − hauteur ellipsoïdale du LAT cible
hauteur_eau_LAT = ssh_NM + δ
UKC_statique = profondeur_LAT + hauteur_eau_LAT − tirant_eau
```

`δ` doit être une conversion locale qualifiée au waypoint, avec source et
référence. Tester le sens d’une conversion avec 0 m puis 1 m et un repère connu ;
ne pas inférer le signe depuis `positive_upward` seul. Le moteur refuse une
conversion absente, non qualifiée, incompatible ou provenant d’un autre point.

L’interpolation à l’ETA exige deux valeurs horaires encadrantes du même modèle,
run, cellule et datum, séparées d’au plus une heure ; aucune extrapolation.
Les sources doivent fournir l’emprise géographique réelle de chaque cellule ;
le moteur contrôle latitude et longitude séparément, y compris à l’antéméridien.
La maille bathymétrique doit couvrir le point : pas de rayon déduit de sa
résolution ni de déplacement de 10 km comme pour la météo. Le futur instantané
devra être lié au projet, au waypoint, à la position, à l’ETA, au navire et au
tirant d’eau canonisé à la sauvegarde.

Le budget distingue fond, niveau d’eau, conversion, tirant d’eau, effet vertical
de la position et interpolation temporelle. Les composantes non publiées restent
inconnues. La somme conservatrice des incertitudes types explicitement connues
est un **budget partiel**, pas une incertitude totale ni un intervalle à 95 %.
La dispersion `stdev` et les minima / maxima de maille EMODnet décrivent la
variabilité spatiale ; ils ne sont pas une incertitude instrumentale ou une
profondeur minimale garantie. L’ordre de grandeur SHOM de 1 % de maille n’a pas
de niveau de confiance déclaré et n’est pas utilisé comme écart-type.

L’estimation est statique : squat, mouvements, gîte et chargement ne sont pas
inventés. Elle ne change pas le GO / NO GO. Le formulaire conserve sa saisie
manuelle et ses indicateurs existants tant que le raccord n’est pas qualifié.

## Texte à transmettre au support SHOM

> Nous développons SeaPilot pour préparer des opérations maritimes en Manche,
> Atlantique français et sud de l’Angleterre. Nous souhaitons calculer une
> estimation de l’UKC à l’ETA des waypoints en combinant la bathymétrie EMODnet
> DTM2024 référencée LAT, les prévisions `ssh` TOLOSA diffusées par votre ncWMS
> et le tirant d’eau du navire.
>
> Pouvez-vous confirmer la disponibilité et la gratuité éventuelle d’un accès
> CRV serveur à serveur, puis fournir la procédure d’obtention de clé, les
> limites d’appels et le contrat exact de `changeVerticalRef` ?
>
> Quel identifiant représente précisément le niveau moyen des flux TOLOSA
> depuis novembre 2024 ? Peut-on utiliser `NM_HYCOM2DOCEANO_1`, ou faut-il une
> autre réalisation ? Quelle conversion recommandez-vous vers LAT / PBMA,
> avec son incertitude locale, son niveau de confiance et les conventions de
> signe ? Merci de préciser le raccord entre LAT EMODnet et PBMA / BathyElli.
>
> À défaut d’API gratuite, pouvez-vous fournir une grille ouverte et qualifiée
> de conversion, ainsi que son incertitude, ou confirmer l’usage possible du
> CRV du portail pour ces données ?

Ce texte est un brouillon ; aucune demande n’a été envoyée.
