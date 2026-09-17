# Administration : collaborateurs sans compte ou sans adresse BBTM

Administration → Utilisateurs affiche un tableau des collaborateurs RH en poste qui n'ont
pas de compte SeaPilot ou d'adresse `@bbtm.fr`, avant la gestion des comptes existants.
Trois filtres permettent d'afficher l'union sans doublons, les personnes sans compte,
ou celles sans adresse BBTM. Les compteurs correspondent aux collaborateurs, pas aux comptes.

Le référentiel `people` est lu avec les règles RLS existantes de l'entreprise,
par pages de 500, avec le filtre `active = true`. Les anciens collaborateurs sont
exclus de la liste et des compteurs. Les adresses nulles, vides ou externes sont incluses.
Le domaine exact `bbtm.fr` est reconnu sans tenir compte de la casse et des espaces
autour de l'adresse ; les sous-domaines ne sont pas assimilés à `bbtm.fr`.

Le compte est identifié d'abord par `people.user_id`, puis, pour une fiche non liée,
par correspondance exacte de l'email normalisé avec les comptes chargés. Une adresse
BBTM présente sur la fiche RH ou le compte associé est reconnue et affichée.
La liste est relue après une création ou suppression de compte.

Aucune migration, modification des autorisations, création de compte ou invitation
automatique n'est nécessaire. L'accès au menu reste réservé aux administrateurs.
Les opérations sur les rôles, invitations et suppressions restent dans le tableau
des comptes existants.

Validation : tests du domaine, rapprochement des comptes, pagination, filtres,
absence d'email, exclusion des anciens collaborateurs, actualisation après changement de compte,
chargement/erreur et intégration à Administration. Vérification visuelle du menu
avec les données isolées de préversion sur ordinateur et mobile.

Retour arrière : revenir au commit précédent du frontend ; aucune donnée n'est modifiée.
