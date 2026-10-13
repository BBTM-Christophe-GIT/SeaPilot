# Saisie du temps de travail : journées de calcul et seuils persistants

La migration `20261013153130_working_time_calculation_days_production.sql`
aligne les calculs enregistrés et les recommandations de saisie sur le découpage
validé pour la préversion. Elle ne modifie ni les périodes déclarées, ni les
approbations, ni les signatures et leurs preuves figées. Le taux congés/repos
reste à **1,05**.

Version client : **3.72.3**, build **2026-10-13.002**. La route réelle
`/modules/workingTime` utilise les données du registre et la politique persistée.
Les huit diagnostics visibles sont actualisés pendant la saisie. Le contrôle
du travail de nuit conserve sa fenêtre et son seuil serveur existants.

La frise affiche chaque heure et garde le pas de 30 minutes. Les bords des
périodes non enregistrées s'ajustent par glissement ou au clavier, avec contrôle
des collisions et annulation du glissement. Les brouillons sont isolés par marin
et date, conservés pendant les changements de vue et les actualisations des
seuils. Ils restent temporaires et disparaissent au rechargement complet.
La vue mois affiche une frise pour chaque jour, distingue enregistré/en attente
et conserve les totaux officiels. Une correction remplace uniquement sa bande
graphique, sans modifier ces totaux avant enregistrement.

Le PDF du registre reçoit uniquement les données enregistrées ; les diagnostics
de saisie, bandes d'écart et brouillons ne lui sont pas transmis. Le rapport de
conformité distinct conserve sa fonction d'analyse existante.

## Règles du moteur version 4

Un repos continu atteignant le minimum configuré
`min_consecutive_rest_hours` (6 h dans la règle de démonstration) termine une
journée de calcul **au début de ce repos**. La journée suivante commence au même
instant ; elle inclut le repos précédant la reprise du travail. Une pause de
5 h 59 ne satisfait pas un minimum de 6 h.

Pour 02:00–07:00, 08:00–12:00 et 18:00–22:00, le repos 12:00–18:00 clôt la
première journée à 12:00 avec 9 h de travail. La nouvelle journée commence à
12:00 et contient 4 h de travail jusqu'à 22:00. Le cumul brut de 13 h sur la
fenêtre de 24 h ne constitue pas, seul, un dépassement du plafond par journée.

Le contrôle du plafond `max_work_24h` retient le **maximum de toutes les
journées pertinentes** pour la fenêtre analysée. Une nouvelle journée conforme
ne supprime donc pas un dépassement de 13 h dans la journée précédente encore
pertinente. Le début du travail antérieur à la borne glissante reste compté
lorsque sa journée ne s'est pas interrompue par un repos qualifiant.

Les contrôles suivants restent indépendants : repos total sur 24 h,
repos continu, nombre de périodes de repos, travail/repos sur 7 jours et travail
de nuit. Le repos continu ne remplace plus le minimum de repos total sur 24 h
(suppression de l'ancien `total suffisant OU repos continu suffisant`).

Deux contrôles configurables complètent la politique persistée :

- `max_amplitude_hours` : durée entre le premier début et la dernière fin de
  travail d'une séquence interrompue par un repos qualifiant ; défaut 14 h.
- `max_interval_between_rests_hours` : durée du bloc de travail continu fusionné
  touchant la fenêtre, y compris sa partie antérieure à cette fenêtre ; défaut
  14 h.

Les codes d'écart correspondants sont `amplitude` et `rest_interval`.
Les destinataires et empreintes de notification existants sont conservés.
Un index partiel commençant par `person_id` permet aux calculs de lire
l'historique de la personne sans parcourir les périodes de toute la flotte.
L'historique complet jusqu'à la borne reste nécessaire pour conserver le début
d'une journée prolongée sans repos qualifiant.

## Contrats et droits

`save_planning_work_rest_policy` conserve ses 18 paramètres existants et ajoute
deux paramètres facultatifs à la fin : `p_max_amplitude_hours` et
`p_max_interval_between_rests_hours`. L'ancienne signature est supprimée pour
éviter une surcharge ambiguë dans PostgREST. Les paramètres omis valent
`NULL` : création à 14 h, préservation de la valeur existante à la modification.
Les nouvelles valeurs et les autres seuils sont enregistrés atomiquement.

La garde administrateur, le contrôle de l'entreprise et du navire, les dates
d'effet et les droits d'exécution sont conservés. Un Capitaine réel ne peut pas
modifier les seuils de l'entreprise. Aucun droit RLS Marin/Capitaine n'est
élargi. Les helpers `private.*` restent interdits aux clients navigateur.

Les RPC `working_time_interval_recommendation` et
`working_time_phases_recommendation` conservent leurs paramètres et retournent
également : `current_day_starts_at`, `current_day_ends_at`,
`current_day_work_seconds`, `calculation_days`, `maximum_amplitude_seconds` et
`maximum_rest_interval_seconds`. Le champ historique `work_24h_seconds` contient
le maximum pertinent utilisé pour la conformité ; le cumul de la journée
courante reste disponible séparément.

## Déploiement et données existantes

1. Appliquer la migration au projet Supabase **`szlvyrrmvdvhzixilymh`**.
2. Vérifier les colonnes et l'unique signature RPC étendue, puis déployer
   l'application utilisant ces champs.
3. Les nouvelles saisies et recommandations utilisent le moteur v4. Les anciens
   calculs conservent leur version jusqu'à une réévaluation explicite ; aucun
   recalcul historique global n'est déclenché par la migration.

Le module réel est accessible à la route **`/modules/workingTime`**.
L'opération préparée
`supabase/operations/recalculate_working_time_open_days_v4.sql` cible les
évaluations complètes de BBTM du 1er septembre au 31 octobre 2026, sans
approbation ou encore en brouillon. Elle exclut également les lignes rattachées
au dernier jour contribuant dont l'approbation a déjà été soumise ou validée.
Contrôler le nombre de lignes éligibles avant exécution ; traiter de petits lots
de personnes si l'historique est important. Ce script n'est pas exécuté
automatiquement par la migration.

Pour actualiser un périmètre historique convenu, préférer une réévaluation
**bornée des lignes existantes**, dans une transaction et avec la notification
automatique suspendue. Un `UPDATE ... SET calculated_at = now()` fait exécuter
le trigger v4 sur chaque évaluation complète. Filtrer l'entreprise, les dates et
`calculation_version < 4`, vérifier le nombre de lignes visées avant l'exécution,
puis réactiver le trigger de notification dans la même transaction. Cette voie
conserve les identifiants des calculs et ne modifie pas les snapshots des
approbations déjà signées. Ne pas réévaluer une preuve importée incomplète comme
si ses composantes étaient attestées : le trigger préserve son verdict explicite.

`private.working_time_recalculate_person(person_id, impact_start, impact_end)`
reste disponible pour une reconstruction ciblée après changement de périodes.
Il inclut jusqu'à 7 jours après `impact_end` pour les fenêtres affectées ; éviter
les bornes `NULL` qui demandent toute l'histoire de la personne.

## Vérification

Les tests SQL sont transactionnels et se terminent par `ROLLBACK` :

- `working_time_calculation_days_test.sql` : cas utilisateur, 5 h 59/6 h,
  minimum configuré de 8 h, dépassement d'une journée fermée, durée avant la
  borne, repos cumulatif indépendant, contrôles privés et signatures RPC.
- `working_time_work_cycle_capitaine_test.sql` : compte Capitaine réel avec
  fonction RH et affectation, saisie/RPC/calcul enregistré et refus de modifier
  les seuils administrateur.
- `working_time_admin_policy_settings_test.sql` : création et modification
  atomiques, compatibilité des anciens clients et valeurs personnalisées.
- Suites de calcul serveur, recommandations, attribution quotidienne et lecture
  Capitaine : contrôle des agrégats, autorisations et signatures figées.

Le contrôle Supabase local `db advisors --local --type security --level warn`
ne signale aucun problème. La suite historique
`working_time_workflow_permissions_test.sql` possède des attentes antérieures
aux règles actuelles de publication/lecture RH et échoue avant le moteur de
calcul ; les fixtures actuelles Marin/Capitaine ci-dessus sont utilisées pour
la vérification de cette livraison. Aucune modification de ces règles
d'autorisation historiques n'est incluse.

Vérification finale locale : **182 assertions SQL passent dans 8 suites**
(22 calcul des journées, 13 réglages administrateur, 10 compatibilité des
helpers, 13 Capitaine réel, 53 lecture/RLS Capitaine, 30 calcul serveur,
21 recommandations Marin et 20 attribution/signatures).
