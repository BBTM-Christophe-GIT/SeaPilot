# Planning — fenêtre de ±2 mois et lignes compactes

Version `3.75.11`, build `2026-10-16.003`.

## Comportement

La fenêtre principale couvre deux mois avant et deux mois après la date de
référence, bornes incluses. À l'ouverture le 16 octobre 2026, elle va du 16 août
au 16 décembre 2026 : 123 jours au lieu de 246. Les commandes de mois changent
la référence ; « Aujourd'hui » revient à la date courante et recentre la grille.
Les fins de mois et années bissextiles gardent les mêmes règles de dates.

Les hauteurs des lignes de Flotte, Projet et Équipages sont réduites de 10 %.
Les hauteurs des barres, leurs décalages, les piles de projets/visites/audits et
les lignes de soldes/fonctions sont ajustés ensemble. Les coordonnées de la grille
restent réelles : aucun zoom ni transformation visuelle ne décale les clics ou
le glisser-déposer. Les icônes des navires restent sous leur nom et Armement en
tête. Les jours gardent leur largeur.

Les dates de création restent liées à la date choisie ou au mois de référence.
Les droits Marin/Capitaine, le planning diffusé et les calendriers personnels
ne sont pas modifiés. Cette correction est exclusivement côté client : aucune
migration, variable d'environnement ou dépendance nouvelle.

## Validation

Les tests du modèle couvrent les bornes, la continuité, février et les années
bissextiles, ainsi que les affectations touchant les deux extrémités. Les tests
de page vérifient navigation, centrage, zoom, retour à aujourd'hui et conservation
du défilement lors des filtres. Les tests des frises vérifient les empilements
et la coexistence des projets, visites et audits.

La recette navigateur compare les builds précédents et corrigés sur les mêmes
fixtures, avec affichage réel des lignes avant les mesures, sur ordinateur et
mobile. Les durées de modification sont locales et excluent le réseau Supabase.
