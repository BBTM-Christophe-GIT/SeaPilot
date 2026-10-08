# Fonctions temporaires par jour ou groupe de cases

Un clic droit sur une case ouvre le champ **Fonction temporaire**. Le choix
**Ce jour** ou **Tout le groupe de cases** détermine les dates de la modification.
La fonction RH et la fonction de base de l’affectation restent inchangées.
Sélectionner la fonction de base permet de la rétablir aux dates choisies.
Si le groupe contient plusieurs fonctions, **Conserver les fonctions de chaque
jour** permet de modifier le statut ou le commentaire sans les remplacer.

La fonction exercée est conservée dans `planning_days.function_label`, avec
`source_label = 'seapilot-assignment-note'` et le lien à l’affectation existant.
Les modifications de statut, de commentaire et le copier-coller conservent
cette fonction. Les cases adjacentes ayant des fonctions différentes sont
séparées visuellement. Une étiquette violette affiche la fonction sous les dates
concernées dans les vues Flotte et Équipages. Sur une case étroite, le libellé est
abrégé ; le libellé complet reste visible près du nom du marin et au survol.
La fonction RH reste affichée. Les anciennes catégories génériques « Pont » ou
« Machine » ne sont pas présentées comme des changements de fonction.

Les lignes sont regroupées par navire puis par dates d’affectation visibles,
avant le tri par fonction ou nom. La vue Flotte conserve sa hiérarchie de
navires et bordées. Si une ligne couvre plusieurs rotations, son classement
utilise l’affectation la plus longue dans la période affichée, puis la plus
ancienne en cas d’égalité. Les journées consécutives d’un même navire restent
dans une même rotation, même lorsque la fonction change.

Les crew lists IMO utilisent la fonction du jour demandé. Les attestations
d’armement, les exports du planning et les calendriers ICS séparent les périodes
quand la fonction change. SILAE applique le code et la catégorie ENIM de la
fonction exercée aux dates concernées, puis retrouve la fonction applicable
hors de ces dates. Le contrôle de la décision d’effectif lit aussi la fonction
du jour, sans changer les critères RH d’éligibilité. La démonstration applique
les modifications en mémoire jusqu’au rechargement de la page.

## Déploiement

Appliquer `20260922071650_planning_daily_functions.sql` avant le frontend.
Les nouvelles RPC `save_planning_assignment_day_details` et
`save_planning_assignment_day_details_range` sont réservées aux utilisateurs
authentifiés autorisés à modifier le planning. Elles valident les dates et
verrouillent l’affectation ; l’écriture d’un groupe est atomique.
Les anciennes RPC de statut et de commentaire gardent leurs signatures et
préservent les fonctions temporaires. Aucune table, permission métier ou
variable d’environnement supplémentaire n’est nécessaire.

En cas de retour arrière du frontend, conserver cette migration : les anciennes
RPC restent compatibles et protègent les fonctions déjà saisies. Ne pas purger
les lignes quotidiennes. Un ancien frontend peut ne pas afficher ces fonctions
dans tous ses exports ; rétablir le frontend corrigé avant de les éditer.

## Vérification

- Tests React du choix jour/groupe et des appels RPC.
- Cas commun Capitaine → 2nd Capitaine → Capitaine : crew list Excel,
  attestation, export journalier, SILAE avec code/catégorie et calendrier ICS.
- Tests SQL transactionnels des écritures, de la conservation des fonctions,
  de l’effectif et des refus pour les vrais profils Marin et Capitaine.
- Tests de regroupement des rotations dans les vues Flotte et Équipages.
- Lint, compilation de production et vérification navigateur du formulaire,
  des étiquettes de fonction et de l’ordre des marins sur ordinateur et mobile.

La migration a été appliquée à Supabase et le test SQL transactionnel y passe
également, avec annulation de toutes les données de test. L’audit Supabase ne
signale pas les nouvelles RPC ; le contrôle d’effectif existant reste signalé
comme [fonction SECURITY DEFINER accessible aux utilisateurs authentifiés](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
Ses vérifications de société et ses droits d’exécution sont conservés.
