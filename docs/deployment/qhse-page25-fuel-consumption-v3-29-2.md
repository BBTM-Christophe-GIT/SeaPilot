# Rapport QHSE page 25 - consommation de fuel - v3.29.2

## Règle de données

La courbe de fuel du rapport `RSE - consommations par projet` utilise exclusivement le champ `CONSOMMATION DE CARBURANT EN L` du Daily Progress Report, stocké dans `dpr_daily_metrics.fuel_consumed_liters`.

Les litres sont convertis en mètres cubes par division par `1 000`. Le champ d'avitaillement `dpr_supplies.fuel_m3` n'alimente plus cette courbe ni les émissions de la page 25. L'eau reste issue de `dpr_supplies.water_m3`.

## Calcul des émissions

Le facteur de combustion directe MDO est versionné dans `qhse_environment_parameters.direct_combustion_factor_tco2e_per_m3`. Sa valeur validée est `2,85 tCO2e/m3` :

`GES / CO2e = consommation de carburant en litres / 1 000 x 2,85`

La série verte xBee applique ensuite le taux versionné `xbee_reduction_rate`, fixé à `15 %` :

`GES / CO2e avec xBee = GES / CO2e x 0,85`

Le rapport affiche :

- l'eau avitaillée mensuelle et son total annuel ;
- la consommation mensuelle de fuel avec remise à zéro à chaque début de mois et son total annuel ;
- les GES / CO2e cumulés mois par mois pour chaque année ;
- la série verte des émissions avec xBee ;
- les totaux annuels sans xBee, avec xBee et la réduction obtenue.

## Déploiement

Appliquer la migration `20260904051736_qhse_direct_combustion_factor.sql` avant de déployer le client v3.29.2. Aucun secret ni variable d'environnement supplémentaire n'est requis.
