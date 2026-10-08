# Capitaine temporaire — v3.54.1

Les actions DPR et la validation quotidienne du temps de travail reconnaissent la fonction
Capitaine d’une affectation Planning confirmée, y compris une fonction définie à la journée.
La fonction RH et les rôles permanents ne sont pas modifiés.

Le temps de travail exige une journée travaillée en commun sur le même navire et dans la
même bordée. Une affectation annulée, provisoire, hors dates ou en repos ne donne pas ces
droits. Le Capitaine RH conserve son éligibilité existante même si la fonction embarquée
est 2nd Capitaine. La signature personnelle, les justifications de non-conformité, le délai
de saisie et le verrouillage des journées soumises/validées restent applicables.

Les DPR reprennent la fonction Planning du navire et du jour. Le profil Marin peut gérer
les DPR de son navire aux dates où il est Capitaine temporaire ; ailleurs, ses restrictions
habituelles restent actives. Les droits affichés viennent du contrôle serveur par DPR.

Appliquer `20260923195443_temporary_captain_permissions.sql` avant le client. La migration
est additive, ne modifie aucune affectation et ne réécrit aucun historique signé. Les
journées déjà soumises à la gestion restent dans leur circuit d’approbation existant.

La note applicative `3.54.1-temporary-captain-rights` annonce la correction. Vérifier avec
les fixtures de comptes réels Marin/Capitaine, jamais avec la simulation administrative :
`temporary_captain_permissions_test.sql`, `working_time_captain_assignment_role_test.sql`,
les tests DPR et `WorkingTimeWorkflowPanel.test.tsx`. Les contrôles des cas signalés doivent
rester en lecture seule : aucun DPR ni signature de production n’est créé pour la recette.
