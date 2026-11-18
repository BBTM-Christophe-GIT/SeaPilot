# Administration : collaborateurs sans compte ou sans adresse BBTM

Administration → Utilisateurs affiche par défaut les collaborateurs RH en poste qui n'ont
pas de compte SeaPilot ou d'adresse `@bbtm.fr`, avant la gestion des comptes existants.
Les filtres de catégorie permettent d'afficher l'union sans doublons, les personnes sans compte,
ou celles sans adresse BBTM. Les compteurs correspondent aux collaborateurs, pas aux comptes.

Un filtre commun « Collaborateurs affichés » propose « En poste » (par défaut),
« Anciens collaborateurs » et « Tous les collaborateurs ». Il s'applique au tableau
de couverture et à la gestion des comptes. Les anciens comptes restent disponibles
dans les vues Anciens/Tous avec leur bouton Supprimer et sa confirmation habituelle.
Changer de filtre ne modifie ni les comptes, ni les fiches RH.

La vue `admin_people_directory` lit le référentiel RH avec les règles RLS de l’entreprise,
par pages de 500, avec les dates `hired_on` et `departed_on`, sans exclure les anciens.
La date du jour est calculée dans le fuseau Europe/Paris. Une date de départ passée
ou égale à aujourd'hui classe la personne parmi les anciens, même si `active = true`.
Une fiche inactive est également classée parmi les anciens. Une embauche future
n'apparaît que dans Tous. Une fiche active sans dates renseignées reste visible par défaut.
Les adresses nulles, vides ou externes sont incluses.
Le domaine exact `bbtm.fr` est reconnu sans tenir compte de la casse et des espaces
autour de l'adresse ; les sous-domaines ne sont pas assimilés à `bbtm.fr`.

Le compte est identifié d'abord par `people.user_id`, puis, pour une fiche non liée,
par correspondance exacte de l'email normalisé avec les comptes chargés. Une adresse
BBTM présente sur la fiche RH ou le compte associé est reconnue et affichée.
Les comptes sont classés par la même fiche RH que le tableau de couverture. Un contrat
actuel prévaut sur un ancien contrat pour un même compte. Les comptes sans fiche RH
restent accessibles par défaut (notamment les comptes administratifs) ; l'interface
indique cette convention. Les deux sources sont chargées ensemble avant d'afficher
les comptes pour éviter un affichage temporaire non filtré ou trompeur en cas d'erreur.
La liste est relue après création de compte. Après suppression, la ligne du compte
disparaît, son lien RH est retiré localement comme en base et la fiche RH reste visible.

L’accès au menu et à la vue des collaborateurs est réservé aux administrateurs.
Les opérations sur les rôles, invitations et suppressions restent dans le tableau
des comptes existants.

Validation : tests du domaine, rapprochement des comptes, pagination, filtres,
absence d'email, départ passé malgré le drapeau actif, départ du jour/futur, embauche
future, frontière de date à Paris, exclusion/réaffichage des anciens collaborateurs,
filtre commun aux comptes, annulation puis confirmation de suppression, conservation
de la fiche RH et absence de liste non filtrée en cas d'erreur. Vérification visuelle du menu
avec les données isolées de préversion sur ordinateur et mobile.

## Identités RH de référence

Appliquer `20261118074520_canonical_people_directories.sql` avant de déployer le
client. La couverture et les invitations s’appuient sur la même vue, qui écarte
les doublons confirmés. La table privée `people_directory_aliases` relie chaque
ancienne fiche à sa référence RH dans la même société. Une fiche historique garde
son identifiant pour les références Planning, DPR et HSE. Les affectations et
responsabilités enregistrées dans l’organigramme suivent l’identité RH de référence.

Le compte SeaPilot, le matricule et le numéro marin sont uniques. Deux personnes
homonymes gardent chacune leur fiche. Un doublon issu d’une variante orthographique
sans identifiant commun doit être vérifié avant d’ajouter un rapprochement.

Le test `supabase/tests/people_directory_aliases_test.sql` couvre les droits, la
conservation des fiches historiques et les identifiants uniques par entreprise.

## Champ technique `people.active`

Le badge « Actif / Inactif » est retiré de la fiche RH, car il ne décrit pas la
présence actuelle dans l'entreprise. La colonne en base est conservée après audit :
elle est encore lue par le Planning (`planningModel`, `planningP12`, `planningP13`),
le Suivi du Temps (imports et workflow) et la sélection/provision des invitations
(`fetchAdminInviteCandidates`, RPC `provision_invited_seapilot_user`). Sa suppression
nécessiterait une migration coordonnée de ces usages. Cette livraison ne modifie
pas leurs règles ni leurs données.
