# SeaPilot v3.7.1 — Export P144 des éléments de facturation

Date de livraison : 30 juillet 2026.

## Objet

Cette version corrective remplace l’export PDF générique des éléments de
facturation par une reproduction du modèle métier
`P144 - Element de Facturation - Juin 2026.pdf`.

Le document est généré sur une page panoramique de `2667,12 × 1896 pt` et
reprend le logo BBTM, l’en-tête Projet/Période/Navire, les tableaux
**Opérations** et **Frais Imputables**, ainsi que les trois blocs de totaux.

## Source des opérations

Une ligne d’opération n’est plus créée artificiellement pour chaque jour du
contrat. Les lignes exportées correspondent exclusivement aux DPR non supprimés
du projet, compris dans la période choisie et, le cas échéant, associés au
navire filtré.

Les données sont lues depuis `dpr_reports.source_payload`, avec les tables
normalisées `dpr_port_calls`, `dpr_supplies` et `vessels` en repli :

- date : `dpr_reports.report_date` ;
- opération : `P144-FAC-Operations` ;
- montant HT : `P144-FAC-Montant`, puis loyer du contrat si absent ;
- statut du navire, heures d’accostage et d’appareillage ;
- quantité de fuel.

Aucune journée manquante n’est inventée.

## Commentaires DPR

Le commentaire reproduit la formule Power BI fournie :

- traitement spécial uniquement pour `24/24 CREW CHANGE` et
  `CONTRACTUAL MAINTENANCE DAY` ;
- heure affichée avec le décalage fixe UTC+2 ;
- ligne d’accostage uniquement lorsque le statut est `NAVIRE AU PORT` ;
- ordre des lignes : accostage, refueling, appareillage ;
- pour les autres opérations, seul le refueling éventuel est affiché.

## Validation

- tests unitaires de sélection des DPR, repli du loyer et formule de commentaire ;
- build de production ;
- rendu PDF réel puis conversion en image ;
- comparaison visuelle avec le modèle P144 transmis.

Aucune migration Supabase ni nouvelle variable d’environnement n’est requise.
