# Planning v3.6.9 — fenêtre mensuelle fluide

## Comportement livré

- Le calendrier affiche le mois de référence avec une semaine de contexte avant et après.
- Les flèches « Mois précédent » et « Mois suivant » encadrent le sélecteur mois/année.
- Le bouton « Aujourd’hui » replace immédiatement le calendrier sur le mois courant.
- Le zoom et le mode plein écran restent disponibles.

## Performance

La grille annuelle pouvait rendre jusqu’à 485 colonnes pour chaque ligne de navire, bordée ou marin. La fenêtre mensuelle rend désormais entre 42 et 45 colonnes selon la longueur du mois, soit environ 90 % de cellules DOM en moins.

Les données restent stockées et synchronisées dans Supabase. Aucun service Python ni duplication de base n’est nécessaire pour cette optimisation d’affichage.

Si le volume de lignes devient à son tour limitant, l’étape suivante recommandée est une virtualisation verticale des lignes et un chargement des enregistrements borné à la période visible.

## Vérifications attendues

- sélection directe d’un mois et d’une année ;
- navigation au mois précédent et suivant ;
- plage exacte du premier jour du mois moins sept jours au dernier jour du mois plus sept jours ;
- persistance du zoom, du plein écran, des filtres et des actions du planning ;
- tests automatisés, build de production et contrôle visuel.
