# RH / Brevets — effectifs historiques et turnover v3.6.12

## Calcul des effectifs

La courbe des effectifs est désormais calculée à partir des dates d'embauche et
de départ de tous les collaborateurs visibles par le rôle connecté.

- un collaborateur est comptabilisé si sa date d'embauche est antérieure ou
  égale à la date observée ;
- il reste comptabilisé tant qu'aucune date de départ n'est renseignée ou que sa
  date de départ est postérieure à la date observée ;
- les années révolues sont observées au 31 décembre ;
- l'année en cours est observée à la date du jour ;
- une fiche sans date d'embauche valide ne peut pas alimenter l'historique.

Le filtre **Toutes les années** affiche les clôtures annuelles de 2020 à l'année
en cours. La sélection d'une année affiche les effectifs mois par mois pour cette
année.

## Calcul du turnover

Le turnover est calculé selon la formule :

`nombre de départs sur la période / effectif moyen de la période × 100`

L'effectif moyen correspond à la moyenne entre l'effectif au début et à la fin
de la période. Le mode **Toutes les années** affiche les douze derniers mois. La
sélection d'une année affiche le turnover de cette année civile, ou de la partie
écoulée pour l'année en cours.

Le calcul porte sur toutes les fiches RH autorisées, y compris les anciens
collaborateurs. Il ne dépend donc plus du filtre de liste **En poste / Anciens**.

## Validation

- tests unitaires des effectifs annuels et mensuels ;
- test du turnover avec un départ réel et variation d'effectif ;
- test d'interface du filtre annuel et du détail de calcul ;
- contrôle visuel du module RH / Brevets.
