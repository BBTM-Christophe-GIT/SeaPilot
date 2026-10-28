# Documents Projet affichés dans Opération en Mer

Version `3.80.14`, build `2026-10-28.008`.

Dans une fiche Projet, onglet **Documents**, **Documents pour Opération en Mer**
ouvre la liste des documents éligibles. Cocher les documents puis **Enregistrer
la sélection** définit la liste commune aux fiches d'opération de ce projet.
**Tout sélectionner** et **Tout désélectionner** permettent notamment de ne
proposer aucun document. Annuler ne sauvegarde rien.

## Comportement et compatibilité

- Un projet sans configuration conserve le comportement précédent : tous ses
  documents opérationnels éligibles sont affichés.
- Dès le premier enregistrement, seuls les identifiants cochés sont affichés.
  Les fichiers ajoutés ensuite doivent être sélectionnés explicitement.
- Une sélection vide est conservée ; elle ne réactive pas l'affichage de tous
  les documents. Le remplacement d'un fichier par un nouvel identifiant demande
  une nouvelle sélection.
- Les documents restent dans Projet. Cette sélection ne les supprime pas, ne
  change pas leurs catégories et ne les ajoute pas aux PDF.

## Serveur et droits

Migration `20261028224001_project_sea_operation_document_selection.sql`.
La table `sea_operation_private.project_document_selections` stocke une ligne
par projet, la société, les identifiants et l'auteur/date de la modification.
RLS activée, aucun accès direct accordé à `anon` ou `authenticated`.

Les RPC publics `project_sea_operation_documents(p_project_id bigint)` et
`set_project_sea_operation_documents(p_project_id bigint, p_document_ids text[])`
sont des enveloppes SECURITY INVOKER. Leurs implémentations privées valident
l'utilisateur, son appartenance à la société et son rôle admin/direction comme
la gestion des projets. Le catalogue est configurable avant la création d'une
occurrence Planning et indépendamment de l'accès au module Opération en Mer.
Les projets clôturés ne peuvent pas recevoir de nouvelle sélection.

Le résultat est `{ configured: boolean, documents: [...] }`. Chaque entrée
reprend les métadonnées documentaires autorisées et `selected: boolean` ; aucun
chemin privé ou URL n'est fourni. Les identifiants `generated:<id>` et
`project:<id>` sont vérifiés dans le même projet et la même société.

Les catégories Offre commerciale, Facturation et leurs descendants, les
dossiers et les contrats générés restent exclus. La sélection filtre le chemin
commun à la liste d'Opération en Mer et à la résolution de chaque ouverture.
Les grants des documents retirés sont supprimés et la RLS revalide la sélection.
Les protections contre les alias vers un fichier commercial restent présentes.
Une URL Storage déjà signée conserve sa validité jusqu'à son expiration
(cinq minutes) ; les liens SharePoint restent soumis aux droits SharePoint.

## Validation

La suite pgTAP `project_sea_operation_document_selection_test.sql` couvre la
compatibilité, tous/aucun, les nouveaux fichiers, les catégories exclues, les
identifiants forgés, les autres projets/sociétés, les grants et la RLS Storage,
les vrais profils Marin/Capitaine/Armement, la Direction, l'appartenance révoquée,
le module masqué, les projets non planifiés et clôturés. Elle crée des fixtures
dans une transaction et termine par ROLLBACK.

Les tests React/requêtes couvrent la sauvegarde, les erreurs et le retry,
l'annulation, la double soumission, les métadonnées invalides et les réponses
tardives après un changement de compte, de client, de projet ou de droits.
La préversion conserve ses propres données fictives et ses sélections en mémoire.

Appliquer la migration avant de déployer l'interface. Elle ne crée aucune
sélection pour les projets existants. Aucune variable, clé ou dépendance nouvelle.

La migration a été appliquée au projet Supabase SeaPilot sous la version
`20261028224001`. Les contrôles après application confirment la RLS, l'absence
d'accès direct et de droit anonyme aux RPC. Une sonde réelle sans extension
pgTAP valide 12 assertions sur des fixtures synthétiques, puis les annule par
ROLLBACK ; aucun projet existant n'a reçu de sélection lors de ces contrôles.
Les 54 assertions de la nouvelle suite et les 57 de régression passent aussi
sur la base locale.

L'[information du linter RLS sans policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
est attendue pour cette table privée : aucune policy ni aucun grant ne permet
de la lire directement ; seules les fonctions privées autorisées y accèdent.
