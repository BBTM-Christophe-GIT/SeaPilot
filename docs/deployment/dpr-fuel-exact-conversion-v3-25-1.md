# DPR — conversion exacte du fuel dans la facturation (v3.25.1)

## Correction

- La valeur normalisée `dpr_supplies.fuel_m3` est désormais prioritaire sur les anciens champs P144 importés.
- La conversion des mètres cubes vers les litres est arrondie au litre après multiplication par 1 000.
- Exemple validé : `8,052 m³` produit `Refueling : 8 052 L` dans le PDF des éléments de facturation.
- Le champ `FUEL (EN M3)` accepte explicitement trois décimales dans le formulaire DPR.

## Compatibilité

- Les anciens champs P144 restent utilisés en secours lorsqu'aucune valeur normalisée n'existe.
- Aucun historique DPR n'est modifié et aucune migration de données n'est nécessaire.
