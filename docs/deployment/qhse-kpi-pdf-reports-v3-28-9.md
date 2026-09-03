# Rapports PDF QHSE depuis KPI — v3.28.9

## Objectif

La page `QHSE · KPI` expose les 25 pages du fichier de référence `Rapport Général QHSE.pbix` sous la forme de 25 rapports PDF indépendants. Une archive ZIP permet de télécharger les 25 fichiers en une fois sans demander au navigateur d’autoriser 25 téléchargements successifs.

Les valeurs du PBIX ne sont jamais importées dans SeaPilot. Seules sa structure métier et ses formules documentées servent de référence de restitution.

## Sources SeaPilot

- plan d’action QHSE et catalogue de classification des événements ;
- registre versionné des heures d’exposition et RPC `hse_kpi_summary` ;
- DPR soumis ou validés : consommations, avitaillements, déchets, escales, motifs, incidents, exercices et actions HSE ;
- planning des visites, audits et arrêts techniques ;
- référentiel des certificats de la flotte ;
- référentiel RH ;
- bibliothèque QSMS des procédures sources et publiées.

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
- `GES estimés = carburant consommé en m³ × 0,85 × 3,206`. Le scénario de réduction de 15 % reste explicitement présenté comme un scénario comparatif.
- La disponibilité documentée retranche au temps calendaire les escales qualifiées `breakdown` et les arrêts techniques planifiés. La couverture des DPR est présentée séparément pour éviter d’assimiler une absence de saisie à une disponibilité prouvée.
- Les listes longues peuvent se poursuivre sur plusieurs pages dans un même fichier PDF, mais chaque page fonctionnelle du PBIX conserve son propre fichier et son propre nom stable.

## Lacunes explicites

SeaPilot ne stocke pas encore de registre structuré pour les scores d’entretien annuel, les signalements de discrimination et droits humains, ni les heures de fonctionnement des moteurs principaux. Les rapports concernés restent générables et affichent une section `Lecture et limites` ; aucune valeur n’est estimée à partir d’un champ non équivalent.

## Recette

1. Ouvrir `QHSE · KPI` et sélectionner l’année.
2. Choisir la flotte complète ou un navire.
3. Générer un PDF individuel et vérifier son titre, son périmètre, ses sources et ses limites.
4. Télécharger l’archive `rapports-qhse-<année>-<périmètre>.zip` et vérifier qu’elle contient 25 PDF numérotés de `01` à `25`.
5. Contrôler les pages sécurité avec et sans méthodologie HSE, les pages DPR sur une année sans escale et les pages partielles.

Cette version ne nécessite aucune migration de base de données ni variable d’environnement supplémentaire.
