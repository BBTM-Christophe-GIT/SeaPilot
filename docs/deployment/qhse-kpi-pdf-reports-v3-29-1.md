# Rapports PDF QHSE depuis KPI — v3.29.1

## Objectif

La page `QHSE · KPI` expose désormais les dix rapports conservés du fichier de référence sous forme de PDF indépendants. L’archive ZIP contient uniquement les pages source `1`, `4`, `5`, `6`, `7`, `8`, `12`, `20`, `21` et `25`.

Les pages `2`, `3`, `9`, `10`, `11`, `13`, `14`, `15`, `16`, `17`, `18`, `19`, `22`, `23` et `24` ne sont plus proposées ni incluses dans l’archive.

Toutes les valeurs sont recalculées depuis les données Supabase visibles par le profil connecté. Les valeurs du PBIX restent des références de présentation et ne sont jamais importées comme mesures courantes.

## Page 25 — RSE, consommations par projet

Le rapport A4 portrait contient :

- l’eau avitaillée issue de `dpr_supplies.water_m3`, agrégée par mois sans report d’un mois sur l’autre ;
- le fuel avitaillé issu de `dpr_supplies.fuel_m3`, selon la même règle mensuelle ;
- les cumuls annuels d’eau et de fuel avitaillés ;
- les GES annuels calculés depuis le fuel consommé ;
- le CO2 annuel sans additif et la courbe verte avec xBee ;
- les tonnes de CO2 émises et les tonnes évitées par xBee pour chaque année.

La formule est `fuel consommé en m³ × densité × facteur d’émission`. La série xBee applique le taux versionné dans `qhse_environment_parameters`, actuellement confirmé à `15 %`. Si les paramètres environnementaux ne sont pas visibles ou configurés, les émissions sont affichées comme indisponibles plutôt que calculées avec une valeur inventée.

Le logo BBTM est ajusté dans sa boîte en conservant strictement son ratio d’origine. Les métadonnées, sources, notes et pieds de page PDF ne contiennent plus le nom du produit ; ils identifient BBTM et Supabase.

## Autres règles conservées

- Historique officiel : 2023 (`11 454 h`, `1 091 hommes-jours`), 2024 (`25 883 h`, `2 394 hommes-jours`) et 2025 (`36 230 h`, `3 448 hommes-jours`).
- Les années sans accidentologie structurée affichent `—` et une alerte de complétude.
- La population RH est dérivée de `Fiche RH / Grade` : `Sédentaire` alimente la population sédentaire, les autres grades la population marine.
- L’eau environnementale correspond à l’eau avitaillée enregistrée dans les DPR.
- Pour P144/GOURY, la durée d’escale est calculée sans ajout de 1 h 30 ; les objectifs 2026 restent cinq jours d’avarie et huit escales de 24 h au 31/08/2026.

## Recette

1. Ouvrir `QHSE · KPI` et vérifier les dix cartes de rapport.
2. Sélectionner une ou plusieurs années et un ou plusieurs navires.
3. Générer la page 25 et contrôler les quatre courbes, le tableau annuel et la courbe xBee verte.
4. Vérifier que le PDF tient sur une page A4 portrait et que le logo reste carré.
5. Télécharger l’archive et vérifier qu’elle contient exactement dix PDF numérotés `01`, `04`, `05`, `06`, `07`, `08`, `12`, `20`, `21` et `25`.

## Déploiement

Aucune migration ni variable d’environnement supplémentaire n’est requise pour v3.29.1. La migration `20260903201520_qhse_report_reference_metrics.sql` déjà appliquée fournit les paramètres environnementaux. Déployer le client web après réussite des tests, du lint et du build de production.
