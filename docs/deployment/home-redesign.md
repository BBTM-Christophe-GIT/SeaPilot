# Accueil : priorités, calendrier et objectifs

Version `3.67.6`, build `2026-10-07.001`.

L’accueil présente une synthèse des priorités, les filtres par navire, une liste de
tâches par catégorie et un calendrier dans des panneaux blancs sur fond gris clair.
Les urgences sont repérées par une bordure et un libellé contrastés. Les titres,
contextes et échéances peuvent revenir à la ligne sans masquer leur contenu.

Sur ordinateur, les tâches apparaissent à gauche du calendrier. Sur un écran
étroit, les panneaux s’empilent et la page défile normalement. Les styles de
l’accueil sont regroupés dans `src/features/home/ManagerHomeDashboard.css`.

Le calendrier conserve les dates et filtres existants. Les trois prochaines dates
distinctes sont affichées avec leur contexte ; un clic sélectionne leur jour et
leur mois. **Aujourd’hui** revient à la date courante et au mois courant en
conservant le filtre de catégorie. Le choix du navire suit les règles existantes
de disponibilité des résultats. La date du jour est également annoncée avec
`aria-current="date"`, indépendamment du jour sélectionné.

Le panneau **Objectifs de la politique** apparaît sous les tâches et le calendrier.
Il reprend la requête `qhse_policy_snapshot`, les objectifs et axes stratégiques
existants, leurs icônes et la règle partagée `summarizeQhsePolicyObjectives`.
Le total réalisé et la moyenne globale portent sur les objectifs actifs des axes
actifs. Chaque ligne d’axe présente son propre total réalisé et sa progression
moyenne avec une barre accessible. Les objectifs et axes archivés sont exclus.
L’absence d’objectif, le chargement et une erreur de lecture restent distincts ;
une erreur permet de relancer le chargement.

Le module Politique QHSE masqué dans les droits du profil ne produit aucun panneau
sur l’accueil. Les liens **Consulter la politique** et **Voir les objectifs**
gardent leurs destinations. Aucune donnée, requête du tableau des échéances,
association de navire, règle RPC/RLS ou migration n’est modifiée.

Les contrôles automatisés couvrent les filtres combinés navire/catégorie/date,
les états vides, les dates clés, la navigation mensuelle, le retour à aujourd’hui,
les permissions de profils et la progression réelle des objectifs. Les fixtures
SQL de Politique QHSE utilisent des comptes indépendants pour chaque rôle ; elles
restent la référence d’autorisation avec les règles RLS, sans simulation de profil
depuis une session de bureau.

La direction visuelle reprend la hiérarchie sobre des
[vues de projets Linear](https://linear.app/plan) et les compositions de
[tableaux de tâches contemporains](https://dribbble.com/search/task-management-dashboard),
adaptées aux informations et à la navigation SeaPilot.

Aucune migration, dépendance, variable d’environnement ou note de mise à jour
applicative supplémentaire n’est requise.
