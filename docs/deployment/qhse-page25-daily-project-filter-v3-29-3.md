# Rapport QHSE - consommation journalière et filtre projet - v3.29.3

La bibliothèque des rapports QHSE conserve les dix rapports retenus et les numérote désormais de 1 à 10. Les anciens numéros du fichier Power BI restent enregistrés dans le catalogue pour la traçabilité, mais ne sont plus présentés comme les numéros des rapports générés.

## Filtre projet

La page KPI charge le catalogue des projets visible par le profil depuis `public.projects`. Le filtre **Projets** accepte une ou plusieurs sélections et complète les filtres années et navires. Lorsqu'un projet est sélectionné, la lecture des DPR soumis ou validés applique `dpr_reports.project_id`; le périmètre projet est aussi repris dans l'en-tête et le nom du PDF.

## Consommation de fuel

Le graphique **Consommation de fuel journalière** de **RSE - consommations par projet** utilise un point par date de DPR. Les DPR d'une même date sont additionnés lorsque plusieurs navires ou projets sont sélectionnés. Chaque valeur provient de `dpr_daily_metrics.fuel_consumed_liters` et est convertie en mètres cubes par division par `1 000`.

La zone du graphique dans le PDF reste inchangée. Les totaux annuels et les calculs d'émissions restent basés sur la somme annuelle des mêmes valeurs journalières.

## Vérification attendue

1. Sélectionner une année, un ou plusieurs navires et un projet.
2. Générer **RSE - consommations par projet**.
3. Contrôler que le graphique fuel présente les dates journalières et que son total correspond à la somme des DPR du périmètre.
4. Contrôler que le rapport porte le numéro **10 / 10** et que la bibliothèque affiche des pages consécutives de **1 / 10** à **10 / 10**.
