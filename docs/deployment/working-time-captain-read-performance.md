# Délais de lecture du temps de travail

Version `3.72.2`, build `2026-10-13.001`.

## Problème et correction

L'authentification réussissait, mais les lectures des heures, commentaires,
calculs et validations pouvaient dépasser le délai PostgREST de huit secondes.
Même une lecture limitée à ses propres heures évaluait les accès historiques
de capitaine aux registres et calculs des autres personnes.

La migration `20261013072043_optimize_working_time_captain_access.sql` ajoute un
contrôle interne calculé une seule fois par requête. Il recherche une affectation
confirmée avec une fonction RH exacte « Capitaine », une fonction d'affectation
« Capitaine », ou une note quotidienne de remplacement « Capitaine ». Sans
candidature possible, les lectures conservent le périmètre personnel et évitent
les jointures historiques. Lorsqu'une candidature existe, les contrôles complets
de société, bordée, navire, période et statut de travail restent appliqués.

Ce contrôle inclut les affectations passées et les remplacements temporaires.
Le rôle applicatif seul n'accorde aucun accès supplémentaire. La fonction interne
est dans le schéma non exposé `private`, avec authentification et appartenance à
la société vérifiées et aucun droit d'exécution pour `PUBLIC` ou `anon`.

Le client charge les validations uniquement pour les registres du périmètre
affiché, y compris ceux retournés sur les pages suivantes. Il évite entièrement
cette lecture si aucun registre n'est affiché. Les autres lectures restent
parallèles, et la limite de 1 000 événements est conservée.

## Déploiement et vérification

Appliquer la migration au projet SeaPilot avant le client. Aucun changement de
compte, de rôle ou de mot de passe n'est requis. La migration ne modifie pas les
données de travail ni les contrôles d'écriture.

Exécuter les tests Vitest du module et le build de production avec pnpm 10.34.5.
Exécuter les fixtures SQL `working_time_captain_read_performance_test.sql` et
`working_time_captain_assignment_role_test.sql` avec de véritables rôles
`authenticated` et identités distinctes. Vérifier les accès personnels, les
capitaines RH, les remplacements quotidiens, les autres bordées et sociétés,
les profils inactifs ou non liés et les utilisateurs non authentifiés.

Les anciens tests `working_time_domain_model_test.sql` et
`working_time_workflow_permissions_test.sql` présentent déjà des échecs avec
les règles antérieures à ce correctif (journée verrouillée et anciennes fixtures
de périmètre). La comparaison avant/après confirme ces mêmes échecs ; ils ne
sont pas modifiés dans cette livraison.

Avant correction, une lecture de deux commentaires personnels prenait 4,1 s
et une lecture des calculs personnels 4,6 s en isolation. Les lectures simultanées
observées en production échouaient après environ 8,1 s. Mesurer après migration
les mêmes requêtes en transaction de lecture seule, avec les claims du compte
concerné et le rôle `authenticated`, plutôt qu'avec les droits administrateur.

Migration appliquée en production le 13 octobre 2026. Mesures après correction :
commentaires 16 ms, heures 24 ms, calculs 21 ms et validations du mois 17 ms.
Les lectures simultanées restent sous le délai de huit secondes. Le compte testé
conserve exactement ses 54 registres visibles (même empreinte des identifiants),
28 intervalles, deux commentaires et 129 calculs pour les périodes contrôlées.
Les groupes et nombres d'avis de sécurité Supabase sont identiques avant/après.

Validation : 53 nouveaux contrôles SQL, 12 contrôles du workflow Capitaine RH,
161 tests Vitest du module et build de production. Le lint des fichiers modifiés
passe ; le lint global conserve cinq erreurs préexistantes dans les fichiers
`documentDriveStorage.ts`, `documentDriveStorage.test.ts` et `localDriveLauncher.ts`.
