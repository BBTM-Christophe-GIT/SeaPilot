# Export SILAE — Planning / Documents

Le bouton **Export SILAE**, réservé aux profils Admin, Direction et Armement comme les exports existants, ouvre un export mensuel `.xlsx`. Le mois et l’année courants sont proposés à l’ouverture. Le chargement est indépendant des filtres et de la période affichés dans le planning.

## Population et confirmation

La liste est construite depuis les fiches RH actuellement en poste, même pour un mois historique. Les dates d’entrée/sortie sont contrôlées ; un départ futur documenté conserve l’éligibilité même si le drapeau historique `active` a déjà été désactivé. Une fiche inactive sans preuve de départ futur reste exclue. Sont exclus les anciens, les futures recrues et les sédentaires repérés dans fonction/grade/rôle, y compris explicitement Adam DEBORDEAUX sans modifier sa fiche RH.

Tous les marins éligibles sont initialement cochés. L’utilisateur peut modifier la sélection, inspecter les périodes et les anomalies puis cocher la confirmation nominative avant le téléchargement. Tout changement du mois, rechargement ou changement de sélection invalide cette confirmation. Les personnes ayant des anomalies restent visibles et sélectionnées : aucune suppression silencieuse.

## Structure du classeur

La structure reprend les en-têtes et leur ordre dans `SILAE LIGNES SERVICES.xlsx` fourni par l’utilisateur : feuille `Feuil1`, Matricule, Salarié puis 30 groupes de 16 colonnes. Un 31e groupe est ajouté si nécessaire pour conserver tout le mois. Une ligne par marin, sans ligne de totaux. Le fichier exemple nominatif n’est pas livré dans les ressources publiques.

Chaque cellule, y compris les nombres, dates, codes et cases vides, est écrite comme chaîne Excel `inlineStr` avec le format natif Texte (`numFmtId=49`). Aucune formule, apostrophe ajoutée ou conversion numérique des matricules. Les dates sont en `jjmmaaaa`, le salarié en `NOM Prénom`, le matricule provient de `employee_number` et non du numéro marin.

Chaque groupe contient : ID_Ligne vide ; DtDeb/DtFin réelles et inclusives ; JrsMer ; JrsEmbarque ; immatriculation du navire ; Genre `01` ; code fonction ENIM RH ; Position `00` au travail ou `57` au repos ; NbjPos15 et ValPos15 vides ; catégorie ENIM RH ; Taux ENIM `COMPL07` ; NbPart, JrsNonExo, HrsNonExo vides.

## Périodes et règles utilisateur

- En mer et à terre forment un seul état travaillé ; repos, vacances et congés forment l’état repos. Les jours contigus de même état et même navire sont regroupés ; un changement de navire démarre un nouveau groupe.
- Les jours sans affectation sont reconstitués comme repos. La lecture réelle du planning d’AUGUIN en août 2026 ne contient que les affectations du 3 au 10 et du 19 au 28 ; les intervalles sans affectation sont exactement les repos de l’exemple utilisateur. Une note dans la fenêtre explicite cette règle avant confirmation.
- Les corrections journalières priment sur les affectations, qui priment sur les périodes historiques. Les congés approuvés priment sur ces sources. Les affectations annulées, notes orphelines, positions des navires et demandes de congés non approuvées sont exclues. Les fins exclusives des absences sont converties en dates inclusives dans le fuseau du planning.
- JrsMer vaut la durée inclusive au travail et `0` au repos. JrsEmbarque vaut la durée inclusive dans les deux états.
- Mois de 31 jours : retirer une seule journée de JrsEmbarque sur la dernière période de repos, sans modifier les dates ni les jours travaillés. Une dernière période de repos d’un jour peut donc afficher `0`.
- Février de 28 jours avec travail : ajouter une seule fois deux jours à JrsMer sur la dernière période travaillée, sans modifier les dates ni JrsEmbarque.
- Navire pendant le repos : conserver le navire explicitement indiqué ; sinon le dernier navire connu, ou le premier du mois si aucun navire précédent n’est connu. Règle confirmée par l’utilisateur.

Les règles complémentaires de février seront précisées ultérieurement par l’utilisateur. Février de 29 jours, février sans travail, mois de 31 jours sans repos, maladie/accident/autre statut non défini, contradiction à priorité égale, entrée/sortie exigeant une proratisation et données RH/navire manquantes empêchent l’export du marin concerné. L’utilisateur peut corriger le planning/la fiche ou décocher ce marin ; aucun calcul de remplacement n’est inventé.

## Données, accès et déploiement

Lecture seule des tables existantes avec le client Supabase de l’utilisateur et les RLS existantes : people, vessels, planning_periods, planning_assignments, planning_days, planning_absences. Pagination par 500 lignes et ordre stable par ID sur chaque table ; chargement de l’historique antérieur nécessaire au navire pendant le repos. Seuls les champs RH utiles à l’export sont sélectionnés. Aucun secret, nouvelle permission, migration ou variable d’environnement nécessaire.

Les contrôles de profil Marin/Capitaine reposent sur les tests avec leurs rôles réels et sur les règles RLS (`people_planning_company_read`, portée société et partage de bordée pour capitaine), jamais sur une vue simulée de la session courante. La fenêtre et le moteur Excel sont chargés à la demande.

Les préversions utilisent un adaptateur de démonstration séparé (`planningSilaePreview`) pour présenter le parcours sans accès RH réel ; les matricules sont explicitement préfixés `DEMO-` et un avertissement indique que ces fichiers ne sont pas destinés à un import SILAE. Aucun code/matricule n’est synthétisé par le chemin authentifié.

## Validation

Tests : exemple complet Pierre AUGUIN août 2026, exclusions et emploi actuel, frontières mensuelles, changements de navire, corrections journalières/congés, mois de 28/29/30/31 jours, valeurs non définies, pagination/erreurs, confirmation modifiable, réponse réseau périmée, cellules XML Excel au format texte et conservation des zéros initiaux. Tests d’intégration du bouton dans Documents et de son absence pour Marin/Capitaine. Build de production et vérification navigateur desktop/mobile.

Validation effectuée dans une copie Git isolée pour ne pas inclure les modifications locales d’autres demandes : 101 tests ciblés (SILAE, PlanningPage, permissions), revue ESLint, build de production, Edge desktop 1440×1000 et mobile 390×844. Le fichier téléchargé a été comparé au classeur original : les 482 en-têtes et les 49 valeurs remplies d’AUGUIN concordent ; les 964 cellules sont du texte. La lecture SQL de production a confirmé la population de 19 marins éligibles, les deux affectations d’AUGUIN, son navire LE ROZEL (`937905`) et les RLS existantes. Aucun essai d’import dans le logiciel SILAE n’a été effectué.

Commande de tests : `corepack pnpm test src/features/planning/planningSilae.test.ts src/features/planning/planningSilaeQueries.test.ts src/features/planning/PlanningSilaeExportDialog.test.tsx src/features/planning/PlanningPage.test.tsx src/features/planning/planningPermissions.test.ts --pool=forks --maxWorkers=1`. Gestionnaire : pnpm 10.34.5 exclusivement.
