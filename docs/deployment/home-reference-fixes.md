# Accueil : axes visibles et catégories horizontales

Version `3.67.7`, build `2026-10-07.002`.

Le panneau des objectifs affiche tous les axes stratégiques actifs, même quand
aucun objectif actif n’est encore renseigné. Un axe vide présente **Aucun objectif
défini** et **Progression non renseignée**, sans barre ni moyenne de 0 % inventée.
Les axes archivés restent exclus. Les totaux et moyennes continuent d’utiliser
`summarizeQhsePolicyObjectives` et le snapshot QHSE autorisé pour la société courante.
Les pourcentages des données de démonstration ne sont pas utilisés en production.

`QhsePolicyHomeCard.css` définit désormais la présentation du panneau avec sa propre
racine et ses variables locales. Le chargement des styles du module Politique QHSE
après une navigation ne doit pas modifier son alignement, sa typographie ou ses barres.

Les catégories de tâches occupent une grille horizontale qui répartit les colonnes
selon la largeur réellement disponible, plutôt que selon la diagonale physique de
l’écran. Une largeur de portable de 1 366 pixels sert de référence de vérification.
Les colonnes reviennent à une seule sur mobile. Chaque catégorie conserve toutes ses
tâches et ses liens ; une liste longue défile dans sa catégorie sur ordinateur et
dans la page sur mobile. Un bouton permet de replier et déplier chaque catégorie
avec `aria-expanded`, `aria-controls` et un retrait des liens du parcours clavier.

Chaque ligne reprend le titre, le contexte et le détail de l’échéance. Une chip
compacte affiche **Aujourd’hui**, **Demain** ou la date française. Les alertes
conservent leur sens avec **En retard**, **En attente**, **Manquant** ou **Alerte**,
y compris lorsque leur date de classement dans la file est ramenée à aujourd’hui.
La date relative se rapporte au jour courant, indépendamment du jour sélectionné
dans le calendrier. Les alertes urgentes gardent leur signal rouge, le lendemain
un signal orange et les autres dates un fond gris discret. **Traiter** conserve
la destination de l’action existante et son nom accessible complet. Le cercle
de la ligne est décoratif ; aucune action de complétion fictive n’est introduite.

Les filtres navire, catégorie et date, leurs compteurs, le calendrier et les dates
clés conservent leurs périmètres et calculs. Les requêtes, droits de module,
RPC/RLS, fixtures de profils et données de production ne sont pas modifiés.
Aucune migration, dépendance ni variable d’environnement n’est requise.
