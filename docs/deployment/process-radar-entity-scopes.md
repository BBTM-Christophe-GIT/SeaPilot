# Radar — périmètres et comparaison des entités

`fetchProcessPerformanceDashboard` complète le chargement historique avec un résultat contenant le périmètre global autorisé et les processus de chaque entité accessible. `fetchProcessPerformance` conserve son retour historique sous forme de liste de processus.

Le catalogue des entités provient de `vessels` sous RLS : navires, quais et bureaux actifs. Il respecte le tri partagé `compareFleetAssets` : navires du plus long au plus court, puis quais et bureaux. Un profil terrain reçoit uniquement les entités de ses affectations courantes autorisées ; aucun périmètre compagnie n’est utilisé par défaut lorsqu’il manque une affectation.

Les processus de chaque entité utilisent les mêmes critères, poids, échéances et règles de calcul que le périmètre global. Une obligation non applicable reste `null`, sans conformité inventée. Un registre LSA ou remorques absent sur un navire autorisé est en revanche une obligation non remplie : note 0 et action de saisie. Une source inaccessible ou un chargement incomplet reste identifié comme indisponible et n’est pas assimilé à un registre absent.

Les collaborateurs sont rattachés aux entités par les affectations Planning couvrant la date courante et non annulées. Les personnes sans affectation restent dans le bilan compagnie ; elles ne sont pas recopiées dans chaque navire ou bureau. Les Capitaines gardent uniquement leur bordée accessible et les Marins uniquement leurs propres suivis RH. Les catégories et sections RH masquées restent exclues, ainsi que leurs tâches et documents liés.

Les achats et certificats sont rattachés par identifiant d’entité. En l’absence d’identifiant, un nom exact normalisé peut être utilisé ; un identifiant étranger n’est jamais remplacé par un nom homonyme. Les sites d’audit de bureaux ou quais sans `vessel_id` sont rapprochés par nom exact, sans recherche partielle ni rapprochement supposé.

Le chargement initial utilise `includeEntities:false` : synthèse globale et catalogue, sans portraits RH ni calcul de toutes les unités. `entityIds:[id]` calcule ensuite une seule unité ; la comparaison charge les autres à la demande. Les sources sont réutilisées pendant 30 secondes dans un cache mémoire borné et isolé par client, droits, personne, modules et date. Les registres partagent les inventaires et métadonnées FDS. Les exercices utilisent un RPC mensuel agrégé unique. Le registre médical est retiré du radar, sans changement du module ni lecture de données cliniques.

« Comparer les unités » utilise leurs noms comme axes et une moyenne à poids égaux des processus notés, avec couverture explicite. Une source indisponible suspend le total. Un clic ouvre le radar des processus de l’unité ; un clic sur un processus ouvre ses composantes en barres horizontales. La liste de chips n’a aucun défilement interne.

Les tests couvrent les entités navire/quai/bureau, le tri, les RH non affectés, les périodes passées/futures/annulées, les sites d’audit nommés, les rôles réels, les catégories médicales masquées et la réutilisation des lectures des registres. Le nouveau RPC des exercices et ses garde-fous sont livrés par `20261102074236_process_exercise_monthly_performance.sql`, avec tests SQL des profils réels ; les règles d’accès existantes restent la référence.
