# Export SILAE — Planning / Documents

Le bouton **Export SILAE**, réservé aux profils Admin, Direction et Armement comme les exports existants, ouvre un export mensuel `.xlsx`. Le mois et l’année courants sont proposés à l’ouverture. Le chargement est indépendant des filtres et de la période affichés dans le planning.

## Population et confirmation

La liste est construite depuis les fiches RH actuellement en poste, même pour un mois historique. Le jour du départ reste inclus ; un départ futur documenté conserve l’éligibilité même si le drapeau historique `active` a déjà été désactivé. Une fiche inactive sans preuve de départ présent/futur reste exclue. Sont exclus les anciens, les futures recrues et les sédentaires repérés dans fonction/grade/rôle, y compris explicitement Adam DEBORDEAUX sans modifier sa fiche RH.

Tous les marins éligibles sont initialement cochés. L’utilisateur peut modifier la sélection, inspecter les périodes et les anomalies puis cocher la confirmation nominative avant le téléchargement. Tout changement du mois, rechargement ou changement de sélection invalide cette confirmation. Les personnes ayant des anomalies restent visibles et sélectionnées : aucune suppression silencieuse.

## Structure du classeur

La structure reprend les en-têtes et leur ordre dans `SILAE LIGNES SERVICES.xlsx` fourni par l’utilisateur : feuille `Feuil1`, Matricule, Salarié puis 30 groupes de 16 colonnes. Un 31e groupe est ajouté si nécessaire pour conserver tout le mois. Une ligne par marin, sans ligne de totaux. Le fichier exemple nominatif n’est pas livré dans les ressources publiques.

Chaque cellule, y compris les nombres, dates, codes et cases vides, est écrite comme chaîne Excel `inlineStr` avec le format natif Texte (`numFmtId=49`). Aucune formule, apostrophe ajoutée ou conversion numérique des matricules. Les dates sont en `jjmmaaaa`, le salarié en `NOM Prénom`, le matricule provient de `employee_number` et non du numéro marin.

Chaque groupe contient : ID_Ligne vide ; DtDeb/DtFin réelles et inclusives ; JrsMer ; JrsEmbarque ; immatriculation du navire ; Genre `01` ; code ENIM de la fonction applicable à la période ; Position `00` au travail ou `57` au repos ; NbjPos15 et ValPos15 vides ; catégorie ENIM de la fonction applicable ; Taux ENIM `COMPL07` ; NbPart, JrsNonExo, HrsNonExo vides.

## Périodes et règles utilisateur

- En mer et à terre forment un seul état travaillé ; repos, vacances et congés forment l’état repos. Les jours contigus de même état, même navire et même fonction/classification ENIM sont regroupés ; tout changement démarre un nouveau groupe.
- Les périodes sont bornées au mois, à la date d’embauche et à la date de départ (bornes inclusives). Aucun travail ni repos n’est exporté avant/après l’emploi. Christophe BINET commence ainsi le 18/08/2026, même si une affectation est présente le 11/08. Une fiche sans aucun jour d’emploi dans le mois reste signalée dans la liste pour être décochée, sans créer de ligne vide.
- Les jours sans affectation sont reconstitués comme repos. La lecture réelle du planning d’AUGUIN en août 2026 ne contient que les affectations du 3 au 10 et du 19 au 28 ; les intervalles sans affectation sont exactement les repos de l’exemple utilisateur. Une note dans la fenêtre explicite cette règle avant confirmation.
- Les corrections journalières priment sur les affectations, qui priment sur les périodes historiques. Les congés approuvés priment sur ces sources. Les affectations annulées, notes orphelines, positions des navires et demandes de congés non approuvées sont exclues. Les fins exclusives des absences sont converties en dates inclusives dans le fuseau du planning.
- JrsMer vaut la durée inclusive au travail et reste **vide** au repos (correction confirmée par l’utilisateur). JrsEmbarque vaut la durée inclusive dans les deux états.
- Mois de 31 jours : retirer une seule journée de JrsEmbarque sur la dernière période de repos, sans modifier les dates ni les jours travaillés. Une dernière période de repos d’un jour peut donc afficher `0`. La règle initiale est conservée pour un emploi partiel dans le mois : pour BINET du 18 au 31 août, le dernier repos du 29 au 31 compte 2 JrsEmbarque.
- Février de 28 jours avec travail : ajouter une seule fois deux jours à JrsMer sur la dernière période travaillée, sans modifier les dates ni JrsEmbarque.
- Navire pendant le repos : conserver le navire explicitement indiqué ; sinon le dernier navire connu, ou le premier du mois si aucun navire précédent n’est connu. Règle confirmée par l’utilisateur.

Les règles complémentaires de février seront précisées ultérieurement par l’utilisateur. Février de 29 jours, février sans travail, mois de 31 jours sans repos, maladie/accident/autre statut non défini, contradiction à priorité égale et données RH/navire manquantes empêchent l’export du marin concerné. L’utilisateur peut corriger le planning/la fiche ou décocher ce marin ; aucun calcul de remplacement n’est inventé.

## Fonctions temporaires

Le champ **Fonction** de l’affectation ou de la période du planning porte déjà une fonction datée, indépendante de la fonction permanente RH. Le formulaire complet permet de modifier cette fonction et ses dates. L’export lit `planning_assignments.assignment_role`, `planning_periods.function_label` et `planning_days.function_label`. Il utilise le même référentiel `getHrEnimClassification` que les RH : aucun lien avec le grade.

La fonction journalière explicite prime sur celle de l’affectation, puis sur celle de la période historique. Les champs vides, le libellé générique « Équipage » et les absences sans fonction ne remplacent pas une fonction explicite datée. À défaut de fonction planifiée applicable, les valeurs RH sont utilisées, notamment dans les repos sans affectation. Une fonction inconnue ou deux fonctions différentes à même priorité bloquent l’export au lieu de reprendre silencieusement un code RH.

Une fonction temporaire modifie **le code et la catégorie** pendant ses dates (catégorie confirmée par l’utilisateur). BORIS BROT, normalement 2nd Capitaine (`CA01A`, catégorie `12`), est déjà planifié Capitaine du 22/09 au 06/10/2026 : l’export de septembre utilise `AA01A` / `15` du 22 au 30, celui d’octobre du 1 au 6. Hors de cette affectation, il retrouve la fonction applicable à la date. Le tableau de vérification affiche fonction, code et catégorie pour chaque période ; la fiche RH permanente n’est pas modifiée.

## Données, accès et déploiement

Lecture seule des tables existantes avec le client Supabase de l’utilisateur et les RLS existantes : people, vessels, planning_periods, planning_assignments, planning_days, planning_absences. Pagination par 500 lignes et ordre stable par ID sur chaque table ; chargement de l’historique antérieur nécessaire au navire pendant le repos. Seuls les champs RH utiles à l’export sont sélectionnés. Aucun secret, nouvelle permission, migration ou variable d’environnement nécessaire. Les fonctions temporaires utilisent les champs et chemins d’écriture du planning déjà existants.

Les contrôles de profil Marin/Capitaine reposent sur les tests avec leurs rôles réels et sur les règles RLS (`people_planning_company_read`, portée société et partage de bordée pour capitaine), jamais sur une vue simulée de la session courante. La fenêtre et le moteur Excel sont chargés à la demande.

Les préversions utilisent un adaptateur de démonstration séparé (`planningSilaePreview`) pour présenter le parcours sans accès RH réel ; les matricules sont explicitement préfixés `DEMO-` et un avertissement indique que ces fichiers ne sont pas destinés à un import SILAE. Aucun code/matricule n’est synthétisé par le chemin authentifié.

## Validation

Tests : exemple complet Pierre AUGUIN août 2026, exclusions et emploi actuel, frontières mensuelles, changements de navire, corrections journalières/congés, mois de 28/29/30/31 jours, valeurs non définies, pagination/erreurs, confirmation modifiable, réponse réseau périmée, cellules XML Excel au format texte et conservation des zéros initiaux. Tests d’intégration du bouton dans Documents et de son absence pour Marin/Capitaine. Build de production et vérification navigateur desktop/mobile.

Validation initiale : 101 tests ciblés (SILAE, PlanningPage, permissions), revue ESLint, build de production, Edge desktop 1440×1000 et mobile 390×844. Le classeur d’origine a servi de référence pour les 482 en-têtes et les valeurs d’AUGUIN ; la correction ultérieure remplace explicitement les `0` de JrsMer au repos par des cases vides. La lecture SQL a confirmé les dates RH de BINET et la fonction Capitaine déjà enregistrée pour BROT du 22/09 au 06/10. Aucun essai d’import dans le logiciel SILAE n’a été effectué.

Validation des corrections : 114 tests ciblés réussis, ESLint et build de production réussis dans un worktree isolé. Parcours navigateur Edge avec Playwright (skill Browser non disponible) : Planning → Documents → Export SILAE, sélection nominative et confirmation, changement de mois invalidant la confirmation, téléchargement d’août/septembre/octobre. Contrôle de la fenêtre sur ordinateur 1440×1000 et mobile 390×844, sans débordement horizontal de la page. Un jeu de vérification local reprend les données réellement lues pour BINET et BROT, sans écriture en base ni simulation d’un profil Marin/Capitaine. Les trois classeurs téléchargés ont été relus indépendamment en XML : 482 en-têtes, 964 cellules texte par fichier, zéros initiaux conservés, JrsMer vide au repos, dates d’emploi et codes/catégories temporaires vérifiés.

Commande de tests : `corepack pnpm test src/features/planning/planningSilae.test.ts src/features/planning/planningSilaeQueries.test.ts src/features/planning/PlanningSilaeExportDialog.test.tsx src/features/planning/PlanningPage.test.tsx src/features/planning/planningPermissions.test.ts --pool=forks --maxWorkers=1`. Gestionnaire : pnpm 10.34.5 exclusivement.
