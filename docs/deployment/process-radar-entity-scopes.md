# Radar — périmètres et comparaison des entités

`fetchProcessPerformanceDashboard` complète le chargement historique avec un résultat contenant le périmètre global autorisé et les processus de chaque entité accessible. `fetchProcessPerformance` conserve son retour historique sous forme de liste de processus.

Le catalogue des entités provient de `vessels` sous RLS : navires, quais et bureaux actifs. Il respecte le tri partagé `compareFleetAssets` : navires du plus long au plus court, puis quais et bureaux. Un profil terrain reçoit uniquement les entités de ses affectations courantes autorisées ; aucun périmètre compagnie n’est utilisé par défaut lorsqu’il manque une affectation.

Les processus de chaque entité utilisent les mêmes critères, poids, échéances et règles de calcul que le périmètre global. Une source vide ou une obligation non applicable conserve un score `null` : elle n’est pas transformée en conformité à 100 %. Une source inaccessible ou un chargement incomplet reste identifié comme indisponible.

Les collaborateurs sont rattachés aux entités par les affectations Planning couvrant la date courante et non annulées. Les personnes sans affectation restent dans le bilan compagnie ; elles ne sont pas recopiées dans chaque navire ou bureau. Les Capitaines gardent uniquement leur bordée accessible et les Marins uniquement leurs propres suivis RH. Les catégories et sections RH masquées restent exclues, ainsi que leurs tâches et documents liés.

Les achats et certificats sont rattachés par identifiant d’entité. En l’absence d’identifiant, un nom exact normalisé peut être utilisé ; un identifiant étranger n’est jamais remplacé par un nom homonyme. Les sites d’audit de bureaux ou quais sans `vessel_id` sont rapprochés par nom exact, sans recherche partielle ni rapprochement supposé.

Les sources métier sont chargées une fois. Les comparaisons filtrent ensuite les données autorisées en mémoire. Les registres partagent un instantané par chargement, incluant les métadonnées de FDS et les comptes rendus d’exercices : sélectionner plusieurs entités ne relance pas un chargement complet de chaque inventaire. Le registre médical reste un indicateur collectif non clinique non chiffré ; aucun patient, consultation, pathologie ou contenu médical n’est interrogé pour le radar.

Les tests couvrent les entités navire/quai/bureau, le tri, les RH non affectés, les périodes passées/futures/annulées, les sites d’audit nommés, les rôles réels, les catégories médicales masquées et la réutilisation des lectures des registres. Cette évolution ne modifie ni le schéma ni les règles RLS.
