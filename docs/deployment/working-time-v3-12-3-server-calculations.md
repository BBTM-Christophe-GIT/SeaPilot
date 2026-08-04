# SeaPilot v3.12.3 — calculs serveur du temps de travail

Date de livraison : 4 août 2026.

Cette étape rend les calculs glissants du module « Suivi du Temps de Travail »
autoritaires côté Supabase. Les intervalles horodatés de
`working_time_intervals` restent l’unique source de vérité. Le navigateur ne
peut ni insérer, ni modifier, ni supprimer un résultat calculé.

## Moteur de calcul

La migration `20260804074018_working_time_server_calculations.sql` ajoute la
projection en lecture seule `working_time_calculation_windows`. Pour chaque
personne et chaque borne de fenêtre utile, le serveur calcule :

- le travail et le repos sur 24 heures glissantes ;
- la plus longue période de repos consécutif et le nombre de périodes de repos ;
- le travail et le repos sur 7 jours glissants ;
- le travail compris dans la fenêtre de nuit de la politique applicable ;
- le détail des contrôles et les codes de non-conformité.

Les intervalles sont d’abord bornés à la fenêtre observée, puis fusionnés en
« îlots » lorsqu’ils se chevauchent ou se touchent. Un intervalle qui traverse
minuit reste un seul intervalle absolu ; la date locale et le fuseau conservés
servent à résoudre la politique et la fenêtre de nuit.

Les seuils proviennent exclusivement de `planning_work_rest_policies`. Une
politique propre au navire prévaut sur une politique globale applicable. En
l’absence de politique, les durées sont calculées mais la conformité reste
indéterminée : aucune valeur réglementaire implicite n’est créée.

## Règles de conformité

Les comparaisons sont inclusives à la limite :

- le travail est conforme tant qu’il est inférieur ou égal au maximum ;
- le repos est conforme tant qu’il est supérieur ou égal au minimum ;
- le nombre de périodes de repos est conforme tant qu’il est inférieur ou égal
  au maximum configuré.

Une anomalie n’apparaît donc qu’après un dépassement strict du maximum ou un
passage strict sous le minimum.

## Recalcul et sécurité

Un déclencheur `AFTER INSERT OR UPDATE OR DELETE` sur
`working_time_intervals` reconstruit toutes les fenêtres potentiellement
affectées jusqu’à sept jours après la modification. La création, la modification
ou la suppression d’une politique recalcule les personnes concernées. Un verrou
transactionnel par personne évite deux recalculs concurrents incohérents.

Les fonctions de fusion, de mesure et de recalcul sont dans le schéma privé et
ne sont exécutables ni par `anon`, ni par `authenticated`. La table de résultats
est protégée par RLS : le marin lit ses propres résultats, les rôles de gestion
lisent ceux de leur société et le capitaine lit ceux de sa bordée selon les
affectations Planning existantes.

## Vérifications

- reconstruction complète de la base locale à partir des migrations ;
- tests pgTAP des intervalles chevauchants et traversant minuit ;
- tests des calculs 24 h, 7 jours, repos consécutif, périodes de repos et nuit ;
- test de l’égalité conforme puis du dépassement strict après modification ;
- tests des droits RLS et de l’impossibilité d’injecter un agrégat navigateur ;
- lint Supabase, tests applicatifs, lint TypeScript et build de production.

## Retour arrière

Revenir au client v3.12.2 laisse les résultats calculés inutilisés par cette
ancienne interface. La migration peut être retirée en supprimant ses deux
déclencheurs, ses fonctions privées et `working_time_calculation_windows`, puis
en restaurant la contrainte d’exclusion des chevauchements uniquement si les
données déjà importées ont été contrôlées et ne contiennent aucun chevauchement.
