# Planning — compteurs équipage (3.39.7)

Dans **Équipages**, le bouton **Solde** de chaque marin ouvre la saisie d’un solde à une date. Ce solde correspond à la **fin de la journée** : le calcul commence le lendemain. Les références sont enregistrées dans Supabase, partagées entre sessions et modifiables à la même date. Une référence ultérieure réinitialise le calcul à sa date sans supprimer les précédentes.

Chaque case affiche le cumul de fin de journée, même lorsqu’elle est vide. Le regroupement par équipes conserve une ligne par marin pour éviter de cumuler les soldes de plusieurs personnes. Un marin en emploi peut apparaître sans affectation pendant toute la période. Sans référence, le compteur affiche `—` (« Solde à initialiser »).

| Statut | Variation quotidienne |
| --- | ---: |
| En mer | +1,05 |
| À terre | +0,50 |
| Extra | +2,05 |
| Formation | +0,50 |
| Repos, congés, case vide | −1,00 |
| Arrêt Maladie, Accident du Travail | 0,00 |

Les calculs utilisent des centièmes entiers, les dates du planning et les bornes d’emploi inclusives. Ils repartent de la référence pertinente, même avant le mois affiché ; les filtres de navire, statut ou équipe ne modifient pas le cumul. Les absences approuvées priment, puis les corrections journalières, les affectations et les périodes historiques. Un statut sans règle (par exemple une visite médicale) ou un conflit non résolu suspend le solde avec une explication, jusqu’à correction du planning ou nouvelle référence.

## Affectations et SILAE

Les affectations annulées sont exclues de la vue Équipages et du détecteur de doubles affectations. Une affectation native remplace intégralement son doublon historique (fonction, statut et confirmation compris). Sur le même navire, la dernière affectation enregistrée détermine la fonction quotidienne ; son identifiant départage les révisions identiques. Les notes journalières d’une affectation remplacée ne reprennent pas la priorité sur la décision conservée. Les conflits entre navires restent à résoudre explicitement dans la grille.

Le cas ROUPSARD du 3 août 2026 conserve la fonction 2nd Capitaine de l’affectation 122, modifiée après l’ancienne fonction Matelot Polyvalent. Le jour est exporté avec CA01A / catégorie 12, sans erreur de fonctions contradictoires. Les changements successifs de fonction et de catégorie continuent à créer des périodes SILAE distinctes. Extra représente une journée travaillée dans SILAE ; sa pondération +2,05 concerne uniquement le compteur équipage.

## Déploiement et droits

Migration : `20260914085758_planning_crew_balances_extra.sql`, appliquée à Supabase avant le frontend. Elle ajoute les références, la validation Extra/Formation aux deux RPC de saisie et une lecture complète des affectations avec leur révision. Les journées sont paginées pour ne pas tronquer les calculs à la limite API.

La nouvelle table utilise RLS et les droits existants du planning. Admin/Direction/Armement peuvent saisir les soldes. Marin et Capitaine conservent leurs droits de lecture et ne peuvent pas modifier les soldes, même par appel direct. Les RPC ajoutées sont `SECURITY INVOKER`, inaccessibles aux utilisateurs anonymes. Les futurs plannings diffusés contiennent les révisions ; les versions déjà diffusées restent immuables.

Validation : tests unitaires du compteur et des priorités, intégration de la saisie dans PlanningPage, tests SILAE et export XLSX texte, suite complète Vitest, lint et build de production. Le script `supabase/tests/planning_crew_balance_test.sql` valide les droits avec de vrais sujets JWT de test, la précision, la mise à jour à date identique et la persistance Extra/Formation, puis annule toutes ses données. Contrôle navigateur sur ordinateur (1440 × 1000) et mobile (390 × 844), sans débordement horizontal ni erreur JavaScript.
