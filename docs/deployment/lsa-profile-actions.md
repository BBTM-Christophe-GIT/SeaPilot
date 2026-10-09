# Actions du registre LSA par profil

Le bouton **Ajouter un matériel** est disponible pour Administration, Direction,
Armement, Capitaine et Marin. Pour Capitaine et Marin, la création et l’aperçu du
prochain numéro restent limités aux navires actifs de la société courante
accessibles selon les affectations Planning réelles.
Le client consulte la capacité d’ajout auprès du serveur pour le navire choisi.
Sur un ancien navire encore consultable par son historique, le bouton reste
désactivé. Les matériels déjà expirés restent visibles après création sur un
navire actuellement accessible.

**Gérer les désignations** est accessible à Administration et Capitaine. Ces
profils peuvent créer, renommer, déplacer et archiver les types et désignations
du catalogue commun de leur société. Marin, Direction et Armement ne gèrent pas
ce catalogue. Administration, Direction, Armement, Capitaine et Marin peuvent
mettre à jour, modifier et supprimer les fiches existantes de leurs navires
autorisés. Les trois actions figurent sur chaque carte ; elles sont désactivées
lorsque le serveur ne donne pas accès en écriture au navire sélectionné.

**Mettre à jour** ouvre une fenêtre contenant uniquement la date d’échéance,
préremplie à la date du jour en Europe/Paris plus un an à chaque ouverture.
La date est obligatoire et modifiable ; le 29 février devient le 28 février
si l’année suivante n’est pas bissextile. Le RPC dédié met à jour cette date et
l’alarme dérivée à J−90, sans modifier les caractéristiques ni les documents.
**Modifier** ouvre la fiche complète. **Supprimer** demande une confirmation,
puis retire le matériel de l’inventaire visible par suppression logique.
Les versions, événements, fichiers et compteurs de numérotation sont conservés.
Toutes les mutations refusent une fiche modifiée depuis son ouverture.

Appliquer `supabase/migrations/20261008063400_lsa_profile_actions.sql` puis
`supabase/migrations/20261008064113_lsa_add_capability_and_expired_inventory.sql`
avant le client. Les RPC contrôlent la session, l’accès au module et la société.
Appliquer ensuite `supabase/migrations/20261009073455_lsa_item_update_and_delete_actions.sql`
pour les trois actions sur les fiches existantes, avant le client `3.71.7`.
Les tables publiques restent protégées par RLS et sans écriture directe pour
les utilisateurs authentifiés. Aucun secret, nouvelle configuration ou transfert
de données n’est requis.

Vérification : tests React des actions et formulaires par profil, fixtures SQL
avec comptes Capitaine et Marin liés à leurs fiches RH et affectations réelles,
refus hors périmètre, modification des fiches existantes et révocation du module.
Les fixtures SQL s’exécutent en transaction annulée.

La nouvelle fixture `lsa_item_actions_test.sql` vérifie les cinq profils,
la mise à jour de l’échéance seule, les conflits, la suppression logique,
la conservation des documents et de la numérotation ainsi que les refus
sur navire historique et hors société. Le test React utilise les contextes
réels de chaque profil sans simulation depuis la session courante.

Migrations appliquées à SeaPilot le 8 octobre 2026. Les deux scripts SQL
`lsa_register_access_test.sql` et `lsa_designation_catalog_test.sql` passent
après application ; aucun compte ni matériel de test n’est conservé. Les
68 tests React/permissions/levage ciblés, le lint des fichiers modifiés et le
build de production passent. Le contrôle Supabase ne signale aucun nouvel
avertissement lié à cette migration.

La migration des actions existantes est appliquée à SeaPilot le 9 octobre 2026.
Les fixtures LSA et levage passent localement et les nouvelles fixtures passent
également sur le projet connecté, en transaction annulée. Les 37 tests React LSA,
72 tests de levage, tests de permissions, lint ciblé et build de production passent.
L’interface a été vérifiée à 1440 × 1000 et 390 × 844 : échéance proposée puis
modifiée, suppression confirmée, sans débordement horizontal. Aucun nouvel
avertissement Supabase ; inventaires existants conservés lors des migrations.
