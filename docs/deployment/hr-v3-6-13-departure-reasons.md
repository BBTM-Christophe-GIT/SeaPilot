# RH / Brevets — causes de départ v3.6.13

Le champ **Cause départ** de la fiche RH est désormais une liste déroulante.
La même liste est utilisée lors de la création d'un collaborateur afin de
garantir des données homogènes.

Valeurs proposées :

- Non renseigné ;
- Autres ;
- Décès ;
- Démission ;
- Fin de contrat ;
- Fin Période d'essai ;
- Licenciement économique ;
- Licenciement individuel ;
- Retraite ;
- Rupture conventionnelle.

La valeur **Non renseigné** est enregistrée comme une absence de valeur, pour
rester compatible avec les fiches existantes et les imports SharePoint.
Une ancienne valeur qui ne fait pas partie de cette liste reste visible pendant
l'édition afin qu'elle ne soit pas perdue involontairement.
