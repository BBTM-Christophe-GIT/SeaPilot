# RH / Brevets — indicateurs du Plan de Formation v3.6.15

L'export PDF **Plan de Formation** reprend désormais le filtre de période du
graphe **Évolution des effectifs**.

## Période exportée

- avec **Toutes les années**, les courbes du PDF vont de la première année
  d'embauche connue jusqu'à l'année en cours ; les cartes de turnover et de
  sorties portent sur les 12 derniers mois glissants, comme à l'écran ;
- avec une année précise, les courbes s'arrêtent à cette année et les cartes du
  PDF présentent les indicateurs de l'année sélectionnée ;
- l'introduction du PDF indique explicitement l'année filtrée afin que le
  périmètre reste vérifiable après téléchargement.

Le millésime du **Plan de Formation** reste indépendant : il continue de
correspondre à l'année des formations et certificats à renouveler.

## Indicateurs harmonisés

La première page présente maintenant :

- le **Turnover CDI**, calculé sur les départs CDI et l'effectif CDI moyen
  quotidien, hors stagiaires ;
- le **Taux de sorties tous contrats**, calculé sur tous les départs et
  l'effectif total moyen quotidien ;
- l'**Ancienneté moyenne** à la date de référence de l'année.

Les deux courbes d'évolution affichent le turnover CDI et les sorties tous
contrats. La page des méthodes de calcul reprend les mêmes définitions que le
module RH, y compris la moyenne quotidienne et l'exclusion des stagiaires du
turnover CDI.

## Validation

La génération a été testée avec le filtre `2024`. Les deux pages ont été rendues
en image et contrôlées : année sélectionnée visible, cartes et courbes lisibles,
formules non tronquées, tableaux et pieds de page alignés.
