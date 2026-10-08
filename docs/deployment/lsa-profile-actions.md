# Actions du registre LSA par profil

Le bouton **Ajouter un matériel** est disponible pour Administration, Direction,
Armement, Capitaine et Marin. Pour Capitaine et Marin, la création et l’aperçu du
prochain numéro restent limités aux navires actifs de la société courante
accessibles selon les affectations Planning réelles.

**Gérer les désignations** est accessible à Administration et Capitaine. Ces
profils peuvent créer, renommer, déplacer et archiver les types et désignations
du catalogue commun de leur société. Marin, Direction et Armement ne gèrent pas
ce catalogue. La modification des fiches existantes reste réservée à
Administration, Direction et Armement.

Appliquer `supabase/migrations/20261008063400_lsa_profile_actions.sql` avant le
client. Les trois RPC contrôlent la session, l’accès au module et la société.
Les tables publiques restent protégées par RLS et sans écriture directe pour
les utilisateurs authentifiés. Aucun secret, nouvelle configuration ou transfert
de données n’est requis.

Vérification : tests React des actions et formulaires par profil, fixtures SQL
avec comptes Capitaine et Marin liés à leurs fiches RH et affectations réelles,
refus hors périmètre, refus de modification existante et révocation du module.
Les fixtures SQL s’exécutent en transaction annulée.

Migration appliquée à SeaPilot le 8 octobre 2026. Les deux scripts SQL
`lsa_register_access_test.sql` et `lsa_designation_catalog_test.sql` passent
après application ; aucun compte ni matériel de test n’est conservé. Les
66 tests React/permissions/levage ciblés, le lint des fichiers modifiés et le
build de production passent. Le contrôle Supabase ne signale aucun nouvel
avertissement lié à cette migration.
