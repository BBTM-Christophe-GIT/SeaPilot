# Consultation des navires autour d’une affectation

Un collaborateur dispose d’une fenêtre de **lecture des informations opérationnelles** de chaque navire auquel il est affecté : un mois calendaire avant le premier jour d’affectation, pendant celle-ci, et un mois calendaire après le dernier jour occupé. Les bornes sont incluses et calculées dans le fuseau `Europe/Paris` ; un mois ne signifie pas trente jours.

La source est le Planning courant (`planning_assignments`), avec une affectation **confirmée**, liée au collaborateur comme équipier ou capitaine. Les affectations provisoires et annulées ne créent aucun accès. La publication du Planning ne conditionne pas la consultation opérationnelle. Les dates horodatées font foi lorsqu’elles existent ; une fin à minuit est exclusive, donc le dernier jour occupé est la veille. Le compte, le personnel, la société active et l’adhésion doivent être actifs ; les comptes supprimés, bannis ou anonymes sont exclus de ce droit supplémentaire.

Exemple : une affectation du 20 octobre au 3 novembre ouvre la consultation du 20 septembre au 3 décembre inclus. Les informations du navire restent consultables indépendamment de la date de création du document.

## Périmètre

| Module | Consultation opérationnelle |
| --- | --- |
| Achats | Les profils Marin et Capitaine affichent les demandes de tous les navires dans leur fenêtre, ainsi que leurs pièces jointes et événements. Le filtre n’est plus limité au seul navire du jour. Les profils de bureau gardent leur périmètre société. |
| DPR | Les DPR des navires affectés, leurs équipages opérationnels, pièces jointes et PDF à la demande sont consultables. Les propres DPR historiques restent accessibles selon les droits existants. |
| Levage, LSA, certificats | Inventaires, inspections, certificats et fichiers des navires dans la fenêtre sont lisibles. |
| Audits internes et documentaires (ECMID, OVID, MARAD, ISM, clients) | Sites navires, audits, constats et documents sont lisibles. Les capacités de traitement sont calculées séparément. |
| Plan d’Action | Les actions opérationnelles du navire sont lisibles. Les cas confidentiels liés à la discrimination et aux droits humains restent soumis à leurs droits spécifiques. |
| Notes de service | Les notes diffusées ou archivées visant le navire sont lisibles, avec leurs fichiers. Les brouillons et notes uniquement nominatives conservent leur périmètre. Le registre des destinataires et leurs signatures restent réservés au périmètre de diffusion antérieur ; une lecture par affectation n’autorise pas une nouvelle signature. |
| Exercices | La sélection d’un navire affecté ouvre ses totaux d’exercices et TBT par année, même pour les autres bordées. Les carnets individuels restent limités au personnel déjà autorisé. |
| Flotte, produits chimiques, procédures, bibliothèques réglementaires et politique QHSE | Ces informations ont déjà leur consultation société ; les droits existants sont conservés. |
| Planning | Les règles de publication et le périmètre personnel existants sont conservés. Cette fenêtre n’autorise pas la lecture d’un Planning non publié. |

Le **Registre médical**, les données **RH**, le temps de travail personnel, les entretiens, les sanctions, les frais personnels et l’**Administration** conservent leurs restrictions. Les modules de gestion financière (Projets, facturation) gardent également leurs profils autorisés.

La fenêtre ajoute seulement de la lecture : aucun droit supplémentaire de saisie, correction, inspection, traitement, téléversement, approbation ou validation. Les règles de navigation et les autorisations métier restent applicables.

## Contrôles techniques

- `private.assigned_vessel_read_scope(company_id)` calcule le périmètre du compte connecté et de sa société active.
- Le RPC invoker `public.assigned_vessel_read_scope()` expose uniquement les identifiants de ses propres navires. Les achats ferment le chargement si le RPC échoue ; aucun repli vers une liste société n’est permis pour Marin/Capitaine.
- Les lecteurs SQL/RLS et les règles Storage utilisent ce périmètre. Les lecteurs historiques qui servaient aussi de garde d’écriture sont figés dans des fonctions privées avant leur extension.
- La liste des achats et les exercices sont invalidés lors d’un changement de compte, et les réponses tardives sont ignorées.
- Les fixtures authentifiées couvrent Marin et Capitaine, plusieurs navires, les bornes calendaires, le minuit de débarquement, les annulations, les sociétés/comptes inactifs, les fichiers et les refus de mutation pendant la fenêtre :
  - `supabase/tests/assignment_vessel_read_window_test.sql`
  - `supabase/tests/audit_actionplan_vessel_read_window_test.sql`
  - `supabase/tests/vessel_notices_read_window_test.sql`
  - `supabase/tests/emergency_exercises_access_test.sql`

L’évaluation des permissions utilise les vrais profils authentifiés, leurs rôles et les politiques SQL. Les profils simulés depuis une session d’administration ne servent pas de preuve d’accès.
