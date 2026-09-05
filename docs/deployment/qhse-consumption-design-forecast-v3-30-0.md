# RSE consommations : design unifié, tendances et prévisions — v3.30.0

## Livraison

Refonte native du PDF « RSE — consommations par projet » suivant la revue validée : trois modules alignés, calendrier janvier–décembre en toutes lettres, courbes fines, quantités en m³ et émissions en tCO2e. Le logo conserve exactement sa boîte et ses proportions (20 × 20 mm, position 14/6). Les pieds de page QHSE ne contiennent plus que le numéro de feuille. Les autres mises en page restent inchangées.

Chaque année sélectionnée dispose de sa page dans le même PDF ; plusieurs années ajoutent une synthèse comparative des données réelles. Les notes longues peuvent occuper une feuille de méthode supplémentaire, sans être coupées. Les filtres navires/projets/années sont conservés, appliqués aux observations et à l'apprentissage des prévisions.

## Réalisé

- Eau : somme des avitaillements `dpr_supplies.water_m3` aux dates réelles des DPR, tracé en paliers, cumul mensuel remis à zéro le 1er, dernière valeur mensuelle étiquetée.
- Fuel : consommation `dpr_daily_metrics.fuel_consumed_liters`, litres additionnés avant conversion en m³, cumul mensuel journalier et remise à zéro mensuelle.
- GES : cumul annuel issu du même fuel ; facteur MDO et réduction XBEE lus dans les paramètres Supabase. Aucune valeur PBIX importée ni donnée chiffrée de démonstration ajoutée à la production.
- Les champs SQL NULL conservent un indicateur de présence distinct d'un zéro explicite. Un mois sans observations n'est pas transformé en zéro. Les dates après la date d'édition sont exclues.
- Les totaux annuels et la carte XBEE restent exclusivement fondés sur les observations, jamais sur les points cumulés ou prévus.

## Options prévisionnelles

Deux groupes distincts sur la fiche KPI, « Tendances observées » et « Prévisions futures », chacun avec quatre cases indépendantes : eau, fuel, GES sans XBEE, GES avec XBEE. Toutes décochées par défaut, désactivées pendant l'export. Les options s'appliquent à l'export individuel et à l'archive ZIP, sans changer le cache des données sources. Activer une tendance n'active jamais une prévision, et inversement.

Méthode déterministe et explicite : moyenne journalière des quantités enregistrées sur les trois mois calendaires immédiatement précédents, divisée par leur nombre de jours. Chaque mois doit présenter une couverture d'au moins 80 % des dates : valeurs de fuel renseignées pour le fuel/GES ; DPR présents et au moins une quantité d'eau explicite pour l'eau (événement ponctuel). L'absence d'un des trois mois bloque la projection, sans chercher arbitrairement des mois plus anciens.

Les prévisions concernent uniquement les jours après la date d'édition de l'année en cours, jusqu'au 31 décembre. Le point à la date d'édition sert d'ancrage et n'ajoute aucune quantité. Les mois partiels reprennent le cumul réel connu puis ajoutent le rythme estimé uniquement pour les jours futurs. Les lacunes passées ne sont pas complétées. Les autres années ne sont pas projetées ; un manque d'historique ou de paramètre est expliqué dans le PDF.

Les quantités mensuelles projetées reviennent à zéro chaque mois. Les émissions projetées sont cumulatives sur l'année et dérivées du même rythme de fuel, avec le même facteur et la même réduction XBEE. Les pointillés sont tracés comme des chemins continus pour éviter qu'un redémarrage quotidien du motif ne les rende visuellement pleins.

Il s'agit d'une estimation à rythme constant, non d'une prédiction saisonnière, d'un calendrier d'avitaillement ou d'une garantie. Aucun intervalle de confiance n'est calculé. La [méthode de moyenne](https://otexts.com/fpp3/simple-methods.html) sert de référence générale ; le choix des trois mois récents, la normalisation journalière et le seuil de couverture sont les règles métier explicitement documentées de cette version.

## Tendances descriptives et texte XBEE

La tendance répond à une autre question : les quantités mensuelles augmentent-elles ou diminuent-elles ? Une régression linéaire par moindres carrés est ajustée sur les totaux des mois calendaires terminés de l'année sélectionnée, avec au moins trois mois présentant la même couverture minimale de 80 %. Le mois courant incomplet est exclu ; les années passées sont admissibles. Les valeurs ajustées sont bornées à zéro, sans prolongement futur ni effet sur les totaux réels ou sur la méthode prévisionnelle. Référence générale : [régression temporelle](https://otexts.com/fpp3/regression.html).

Eau/fuel : droite ocre avec losanges sur l'axe m³ existant. GES : les tendances portent sur les émissions **mensuelles**, non sur le cumul annuel qui monte mécaniquement. Elles utilisent l'axe droit explicitement annoncé, gris sans XBEE et vert avec XBEE, avec losanges. Les données cumulées restent sur l'axe gauche. Les pointillés restent réservés au futur. Le gabarit des trois graphiques ne change pas.

La quantité de réduction en gras reste sur la même ligne que « dans l'atmosphère de », à l'intérieur du paragraphe vert, y compris lorsque le texte précédent doit revenir à la ligne. Aucun nombre d'exemple n'est codé en dur.

## Vérification et sécurité

- Tests de cumuls, reset mensuel, paliers d'eau, années bissextiles, mois partiels, NULL/zero, dates futures et filtres.
- Tests d'indépendance des huit options, calcul des prévisions, tendances mensuelles décroissantes malgré le cumul GES croissant, facteur GES/XBEE, absence d'effet sur les totaux réels et absence de mutation du snapshot.
- Tests de refus d'historique insuffisant et d'export multiannuel.
- Contrôle UI du changement d'options, des valeurs envoyées au générateur et de l'absence d'options périmées dans le cache.
- Rendus A4 avec/sans prévision et plusieurs années ; contrôle des étiquettes, pointillés, unité, logo et numéro de pied de page.
- Aucun changement d'authentification/RLS, aucune migration, aucune dépendance ajoutée, aucun accès privilégié introduit dans le navigateur.

## Écarts intentionnels par rapport à la revue

La référence GES réelle est grise en trait plein et XBEE vert en trait plein : les pointillés sont exclusivement réservés aux prévisions conformément à la dernière demande. Le tableau et la colonne des valeurs réelles identifient explicitement les séries, en plus de leur couleur. Les étiquettes mensuelles utilisent 6,5 pt pour tenir sur les douze mois en conservant le gabarit ; leur disposition est contrôlée sur le PDF final.
