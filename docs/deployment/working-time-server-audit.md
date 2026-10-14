# Audit du suivi du temps de travail — 14 octobre 2026

La recette de l’interface et de ses reprises après erreur est décrite dans [l’audit du module](working-time-module-audit.md). Ce document couvre le serveur et les vérifications de production en lecture seule.

## Source et règles en production

Les six migrations déjà appliquées entre le 11 et le 13 octobre ont été réintégrées avec leurs versions et leur SQL historiques : `20261011074048`, `20261011075206`, `20261011195953`, `20261012141951`, `20261013072043` et `20261013153130`. Cette restauration synchronise le dépôt avec la production ; elle ne réexécute pas leurs opérations et ne modifie aucune politique, attribution de rôle ou donnée métier. Leur SQL ne contient aucun secret ; la sélection historique de l’administrateur désigné conserve la condition RH originale, nécessaire à cette autorisation.

Le calcul v4 distingue le travail de la journée de calcul courante du maximum des journées de calcul qui touchent la fenêtre analysée. Un repos consécutif suffisant clôt une journée sans effacer une journée précédente encore pertinente. Le repos total sur 24 heures conserve son minimum indépendant. Le travail et le repos sur sept jours, la nuit, le fractionnement, l’amplitude et l’intervalle maximal entre repos restent contrôlés par les politiques existantes. L’audit ne change ni leurs seuils, ni leurs dates d’effet, ni les résultats calculés.

## Autorisation quotidienne

Migration effective : `20261014202431_harden_working_time_actor_scope.sql`.

Un profil authentifié membre de la société mais sans fiche RH pouvait produire `NULL` dans une comparaison d’identité. Les conditions `IF NOT NULL` ne rejetaient alors pas la requête. Une fixture locale a reproduit quatre accès indus : lecture du contexte d’un tiers, préparation de sa signature, abandon de son brouillon et enregistrement d’un objet de signature existant. Aucun de ces RPC de mutation n’a été appelé en production.

Trois fonctions sont durcies : `working_time_can_manage_signature_person` retourne explicitement `false` en l’absence d’autorisation, et les gardes de `working_time_day_context` et `discard_working_time_draft` exigent un résultat explicitement vrai. Les grants, les rôles autorisés, les scopes société et les règles de calendrier sont conservés.

`working_time_day_context(person,date)` retourne aussi `register_id` et `actor_can_edit_day`, un booléen JSON strict calculé par le helper serveur existant. Le registre est le mensuel exact de la personne et du mois ; un ancien registre hebdomadaire ne peut pas autoriser l’édition d’un autre mensuel. Un registre absent ou abandonné donne `false`. Le client ne consomme cette permission que si l’identifiant correspond à son registre sélectionné. Un ancien serveur sans ce champ conserve le filtre antérieur du client.

Cette projection restitue les exceptions déjà déployées, notamment l’administrateur spécifiquement désigné lorsque son réglage est actif et la fenêtre d’approbation du Capitaine. Elle n’accorde aucun droit supplémentaire. Les verrous SQL restent le contrôle final de chaque mutation.

## Vérification

- **35 assertions pgTAP passent**, en transaction annulée, avec des sociétés et profils synthétiques indépendants : Admin, Direction, Armement, Capitaine, Marin, profil sans fiche RH et autre société. Elles couvrent les quatre refus, les droits légitimes, le mensuel exact, le conflit avec un hebdomadaire, la clôture historique, le jour validé et l’exception de l’administrateur désigné.
- Les tests de calendrier utilisent réellement `SESSION AUTHORIZATION authenticator` puis `ROLE authenticated`. La connexion locale initiale doit pouvoir changer l’autorisation de session, par exemple `supabase_admin` dans la pile locale. Le compte local `postgres` n’est pas superuser. Le bypass de maintenance existant `session_user = 'postgres'` est conservé et ne sert pas à prouver les droits d’un utilisateur de l’API.
- **76 cas de recommandation en production passent sous huit secondes**, chacun dans une transaction `READ ONLY` distincte, avec les identités et rôles réels : les 46 personnes actives sur deux périodes disjointes, puis 25 journées historiques denses et cinq sélections de 48 phases. Les 27 personnes liées utilisent leur propre contexte ; les 19 autres utilisent un administrateur réel autorisé de leur société. Maximum : **1 760,74 ms** pour les 46 cas courants et **5 123,20 ms** pour les 30 autres cas. Trois cas historiques conservent une reprise compatible absente ; aucun timeout n’est masqué. Les propositions sans navire ni bordée testent aussi le chemin existant sans affectation Planning. La Direction et le profil sans fiche RH sont couverts par les fixtures, aucun compte réel de ces catégories n’étant disponible pour le probe.
- Le contrôle HTTP après migration utilise trois sessions réelles distinctes Admin, Marin et Capitaine. Les identités Auth sont vérifiées ; les neuf lectures sont limitées aux deux RPC `working_time_day_context` et `working_time_can_manage_signature_person`. Les identifiants mensuels et booléens correspondent aux attendus SQL. La signature personnelle est autorisée ; la signature d’un tiers reste refusée au Marin et au Capitaine. Les trois sessions sont révoquées localement. Aucun mail, envoi, upload, abandon, enregistrement ou approbation métier n’est effectué.
- Les empreintes complètes et nombres de lignes de **huit tables métier sont identiques avant et après** : registres, intervalles, approbations quotidiennes, fenêtres calculées, événements d’audit, validations, lots d’import et lignes d’import. Les preuves détaillées et les identités restent hors Git.

Les imports conservent leur délai ciblé de 30 secondes pour l’aperçu et 60 secondes pour la validation, ainsi que leur recalcul différé. Ces RPC écrivent des données et ne font pas partie des probes de production en lecture seule. Les seuils globaux de l’API ne sont pas augmentés.

## Anciennes attentes SQL

Les trois suites auparavant en échec ont été reprises sans modifier le moteur. L’isolation des sociétés seules conserve les trois et six échecs des deux premières suites ; la troisième utilise des phases pures sans société et conserve ses cinq échecs. Ils ne proviennent donc pas d’un conflit avec les politiques du seed.

Les attentes v3 avaient été remplacées en production par les règles v4 : l’amplitude de 14 heures borne la proposition se terminant auparavant à 16 heures ; le maximum des journées pertinentes reste distinct du compteur courant ; six heures consécutives ne dispensent plus du minimum de repos total. Les fixtures explicitent ces règles et ajoutent des assertions séparées du compteur courant et du dépassement d’amplitude. Les quotas ne sont pas changés pour rendre les tests verts.

Résultat : `working_time_entry_recommendations_test.sql` **22/22**, `working_time_work_cycle_capitaine_test.sql` **11/11** et `working_time_work_cycle_reset_test.sql` **11/11**. Avec les 35 nouvelles assertions, ces suites totalisent **79 assertions SQL réussies**. Les opérations de sauvegarde de ces fixtures sont locales et annulées.
