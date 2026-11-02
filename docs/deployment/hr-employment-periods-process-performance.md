# RH — réembauches, indicateurs et suivi des actions

## Périodes d’emploi

La rubrique **Contrat et dates → Parcours dans la compagnie → Gérer les périodes** permet de conserver plusieurs embauches et départs pour une même personne. Chaque période porte son contrat et son motif de départ. Clôturer la période précédente avant d’ajouter une réembauche ; les interruptions sont conservées et les chevauchements sont refusés côté application et côté base.

La migration `20261101215413_hr_employment_periods.sql` ajoute `people.employment_periods` et reprend les dates existantes sans créer de doublon de collaborateur. Le déclencheur synchronise les colonnes historiques `hired_on`, `departed_on`, `contract_type`, `departure_reason` avec la dernière période. Les éditions des anciens champs mettent à jour cette dernière période et conservent les périodes antérieures.

La migration complémentaire `20261101220454_hr_employment_history_validation.sql` protège aussi les remplacements explicites de l’historique dans le déclencheur, même à travers une future API privilégiée. Les éditions en libre-service des champs de date historiques déjà autorisés restent compatibles.

Les règles RLS existantes de `people` restent applicables : les profils Admin, Direction et Armement autorisés dans la compagnie peuvent gérer l’historique. Le nouvel éditeur n’est pas proposé en libre-service Marin ou Capitaine. Les contrôles d’accès ne reposent pas sur une simulation de ces profils dans une session de gestionnaire.

L’enregistrement explicite d’une dernière période ouverte réactive aussi la fiche (`active = true`) pour les modules qui utilisent encore ce drapeau. Le statut RH et les indicateurs restent calculés à partir des dates ; une réembauche future n’est pas ajoutée prématurément à l’effectif actuel.

## Convention de calcul

- L’embauche est incluse et le départ est exclu, conformément à la convention déjà utilisée dans les indicateurs SeaPilot. Un départ le même jour que l’embauche reste accepté pour préserver les données existantes ; cette période contribue zéro jour aux effectifs et à l’ancienneté.
- L’effectif à une date compte chaque personne une seule fois si une de ses périodes couvre cette date. Une absence entre deux contrats n’est pas comptée.
- Les sorties et le turnover comptent chaque départ de période dans la fenêtre de calcul, même si la personne est revenue depuis. Le turnover CDI sélectionne les périodes CDI, et non le seul contrat actuel.
- Le détail des sorties reprend le contrat et le motif de la période concernée. L’effectif moyen reste une moyenne des effectifs quotidiens.
- L’ancienneté moyenne correspond au cumul des durées travaillées des collaborateurs présents ; les interruptions et périodes futures sont exclues.
- Les lectures RH sont paginées par lots de 500, avec un ordre déterministe comprenant l’identifiant, pour dépasser les limites de lignes du serveur.

## Indicateurs et navigation

Les six indicateurs sont regroupés en quatre panneaux compacts : anneau de répartition des effectifs, documents à revalider, urgences, puis trois lignes pour le turnover, l’ancienneté et la conformité médicale. L’anneau médical représente le pourcentage réel et adapte sa couleur au résultat. Le bandeau mesure 148 px de haut dans la vérification ordinateur à 1536 px de large ; les sous-totaux restent tous visibles et la disposition s’adapte au mobile.

L’évolution des effectifs conserve le choix de l’année, le détail du turnover et les causes de départ. Elle utilise une aire graduée, des libellés lisibles, un résumé de variation et une liste de valeurs accessible aux lecteurs d’écran. Les animations respectent `prefers-reduced-motion`.

**À revalider** conserve la même définition : documents échus ou à renouveler. Le total est désormais explicitement égal à **Certificats + Visites médicales + Autres documents**. Ce dernier sous-total, affiché lorsqu’il est non nul, comprend les documents administratifs ; ils ne sont pas reclassés artificiellement en certificats. Les documents échus restent également présents dans l’indicateur Urgent.

Le suivi partagé des rendez-vous et actions RH s’affiche sous la fiche sélectionnée. Une planification porte sa date et son lieu et reste distincte de la conformité d’un document ou de la réalisation effective d’une action. Les entretiens s’appuient sur le module Entretiens et son état réel, et non sur une échéance documentaire utilisée comme preuve de réalisation.

Les liens du radar peuvent cibler `/modules/humanResources?person=ID&document=ID&actions=1`. La personne est recherchée dans les données autorisées, le document est mis en évidence et le suivi des actions est amené à l’écran. Les règles de visibilité continuent de s’appliquer.

## Vérification

Les tests `employmentPeriods.test.ts` couvrent les interruptions, réembauches, sorties multiples, contrats historiques, ancienneté cumulée, validations et pagination. `EmploymentPeriodsPanel.test.tsx` couvre l’enregistrement d’une réembauche et l’absence d’édition pour un profil en lecture seule. Les suites RH existantes couvrent les filtres, documents, permissions et commandes conservées.

Avant livraison : appliquer la migration, vérifier les données historiques et les refus de chevauchement, exécuter les suites RH et le build de production, puis vérifier les vues ordinateur et mobile.
