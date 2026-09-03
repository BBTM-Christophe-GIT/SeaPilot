# Rapports PDF QHSE depuis KPI — v3.29.0

## Objectif

La page `QHSE · KPI` expose les 25 pages du fichier de référence `Rapport Général QHSE.pbix` sous la forme de 25 rapports PDF indépendants. Une archive ZIP permet de télécharger les 25 fichiers en une fois sans demander au navigateur d’autoriser 25 téléchargements successifs.

Les cinq pages prioritaires (social/sécurité, sécurité navire, environnement, opérations P144/GOURY et social/gouvernance) reprennent la structure visuelle du rapport de référence sur une page A4 portrait. Les autres pages conservent leur rapport indépendant.

Les valeurs PBIX ne sont pas utilisées comme source courante. Seuls les trois historiques expressément validés par la Direction sont enregistrés dans Supabase : 2023 (11 454 h, 1 091 hommes-jours), 2024 (25 883 h, 2 394 hommes-jours) et 2025 (36 230 h, 3 448 hommes-jours).

## Sources SeaPilot

- plan d’action QHSE et catalogue de classification des événements ;
- registre versionné des heures d’exposition et RPC `hse_kpi_summary` ;
- DPR soumis ou validés : consommations, avitaillements, déchets, escales, motifs, incidents, exercices et actions HSE ;
- planning des visites, audits et arrêts techniques ;
- référentiel des certificats de la flotte ;
- référentiel RH ;
- bibliothèque QSMS des procédures sources et publiées.
- tables de référence QHSE `qhse_annual_reference_metrics`, `qhse_environment_parameters` et `qhse_contract_targets`.

Les lectures conservent les politiques RLS existantes. Le moteur tolère qu’un domaine ne soit pas visible par le profil connecté : le PDF indique alors que la source est inaccessible au lieu de présenter une valeur fictive.

## Correspondance des pages

| Page | Rapport SeaPilot | Couverture |
|---:|---|---|
| 1 | Sommaire des rapports QHSE | complète |
| 2 | Durée des escales | complète |
| 3 | QHSE — taux de fréquence et de gravité | complète |
| 4–6 | RSE — santé et sécurité / sécurité navire | complète |
| 7 | RSE — environnement | complète |
| 8 | RSE — social et gouvernance | partielle |
| 9–10 | Technique — maintenance / disponibilité | partielle |
| 11–13 | Opérations — escales / disponibilité | complète ou partielle selon le taux |
| 14–15 | Plans d’action BBTM / politique QHSE | complète |
| 16–19 | Visites et certificats flotte | complète |
| 20–21 | RH — pyramide des âges / management | complète |
| 22–23 | KPI QHSE et écarts d’audit | complète |
| 24 | QSMS — liste des documents | complète |
| 25 | RSE — consommations par projet | complète |

## Calculs et règles de lecture

- `TF = (FAT + LWDC) × 1 000 000 / heures travaillées`.
- `TG = jours perdus × 1 000 / heures travaillées`.
- Les autres taux HSE sont produits par la méthodologie versionnée SeaPilot. Le filtre navire est transmis à `hse_kpi_summary` afin d’aligner événements et heures d’exposition.
- L’eau correspond à la quantité avitaillée et saisie dans les DPR.
- La carte de stress hydrique est conservée comme illustration fixe issue du rapport de référence ; elle n’entre dans aucun calcul.
- `GES sans xBee = carburant consommé en m³ × densité × facteur d’émission`, puis `GES avec xBee = GES sans xBee × (1 − 15 %)`. Les paramètres sont versionnés dans Supabase ; xBee s’applique à tous les navires depuis le début de l’historique.
- La population RH est dérivée de `Fiche RH / Grade` : un grade contenant `Sédentaire` alimente `sedentary`, tous les autres grades alimentent `offshore`.
- Pour P144/GOURY, un Crew Change propose exclusivement `14h Port Call` ou `24h Port Call`. La durée est strictement calculée entre accostage et appareillage, sans ajout de 1 h 30. `Stand-by météo` alimente Weather Stand-by.
- Les objectifs P144/GOURY 2026 sont 5 jours de maintenance `Avarie` et 8 escales `24h Port Call`, avec échéance au 31/08/2026.
- La disponibilité documentée retranche au temps calendaire les escales qualifiées `breakdown` et les arrêts techniques planifiés. La couverture des DPR est présentée séparément pour éviter d’assimiler une absence de saisie à une disponibilité prouvée.
- Les listes longues peuvent se poursuivre sur plusieurs pages dans un même fichier PDF, mais chaque page fonctionnelle du PBIX conserve son propre fichier et son propre nom stable.

## Lacunes explicites

Les années sans accidentologie structurée affichent `—` et une alerte de complétude, jamais un zéro déduit. Les historiques Crew Change antérieurs sans qualification 14h/24h restent non répartis jusqu’à leur qualification explicite.

L’interface d’entretien annuel demandée à partir du classeur `Entretien d'Evaluation - Professionnel.xlsx` est volontairement reportée au second lot. Son périmètre documenté comprend les six volets du classeur, la double signature émetteur/collaborateur, le PDF imprimable et l’archivage dans `Fiche RH > Entretien d’évaluation`. Les scores du radar et le registre discrimination/droits humains ne sont pas créés dans ce lot.

## Recette

1. Ouvrir `QHSE · KPI` et sélectionner une ou plusieurs années.
2. Choisir tous les navires, un navire ou plusieurs navires.
3. Générer un PDF individuel et vérifier son titre, son périmètre, ses sources et ses limites.
4. Télécharger l’archive `rapports-qhse-<année>-<périmètre>.zip` et vérifier qu’elle contient 25 PDF numérotés de `01` à `25`.
5. Contrôler les pages sécurité avec et sans méthodologie HSE, les pages DPR sur une année sans escale et les pages partielles.

La migration `20260903201520_qhse_report_reference_metrics.sql` crée les tables de référence, ajoute les deux qualifications d’escale et synchronise `employment_population` depuis le grade. Aucune variable d’environnement supplémentaire n’est requise.
