# Catégories et rattachement des documents de projet

Le parcours est décrit dans [la bibliothèque de documents de projet](project-document-library.md). Le catalogue est commun aux projets d’une même société ; sa gestion conserve les rôles Admin et Direction existants.

## Contrat et historique

- `fetchProjectDocumentCategories(client, { includeInactive?: boolean })` charge aussi les catégories retirées par défaut. Les listes d’envoi filtrent `active` ; les lecteurs gardent les libellés historiques. `includeInactive: false` demande uniquement les choix actifs.
- `projects_save_document_categories(target_categories jsonb)` conserve sa signature et ses droits. La charge est un catalogue non vide, avec clés uniques, noms non vides, noms actifs distincts au même niveau et une seule profondeur de sous-catégories. Une sous-catégorie active exige une racine active. Retirer tous les choix reste possible en gardant les lignes désactivées.
- Une clé omise est désactivée, jamais supprimée ni réensemencée. Les libellés peuvent être renommés ; déplacer une clé déjà référencée par un document est refusé pour préserver son classement. Les FK et politiques RLS existantes restent en place.
- `projects_register_storage_attachment(...)` garde ses arguments et retourne le même `bigint` pour un réessai identique sur le même projet, bucket et chemin. Le nom, MIME, taille, SHA, catégorie, sous-catégorie et échéance doivent correspondre exactement au premier rattachement. Un conflit retourne `22023 / PROJECT_ATTACHMENT_PATH_CONFLICT` sans modifier le document.
- Le réessai vérifie toujours la preuve physique. Il peut reconnaître un document déjà rattaché après retrait de sa catégorie ; un nouveau rattachement exige une racine et une sous-catégorie actives et correctement liées.

Le catalogue et le rattachement prennent le même verrou transactionnel par société ; le rattachement prend ensuite un verrou sur le chemin. L’index unique existant `(storage_bucket, storage_path)` demeure la protection finale. Avant ce changement, un réessai rencontrait `23505` ; il ne créait déjà pas de doublon.

## Stockage et autorisations

Les nouveaux envois utilisent le bucket logique `project-files` et un chemin `projects/<id>/attachments/...`. La préparation et la finalisation passent par l’API Vercel privée existante : identité Supabase vérifiée, autorisation du projet, réservation immuable, lecture complète et vérification SHA/octet/MIME avant enregistrement. Le rattachement accepte cette preuve Blob sans créer de ligne artificielle dans `storage.objects`. Les preuves historiques Drive/Storage continuent de suivre leur validation existante.

La limite effective du bucket est **50 MiB**. Les formats existants sont PDF, JPEG, PNG, ZIP, Word DOC/DOCX, Excel XLS/XLSX, CSV, TXT et octet-stream, avec les restrictions supplémentaires de l’API. Les fichiers Office de projet sont autorisés ; l’exclusion des sources Office des Procédures reste propre à ce module.

La migration n’ajoute aucun droit. Admin et Direction de la société courante peuvent gérer et rattacher. Armement conserve les lectures déjà permises mais ne peut pas gérer le catalogue ni rattacher. Marin et Capitaine gardent leurs accès aux seuls documents d’opération autorisés par le planning ; les pièces générales de projet restent protégées par leur RLS. Les accès intersociétés, l’identité absente et les adhésions inactives restent refusés.

## Vérification et déploiement

Source créée par `supabase migration new project_document_library_integrity`, puis alignée sur la version réellement appliquée en production : `20261014211056_project_document_library_integrity.sql`. Elle remplace seulement les deux RPC existants, garde leurs signatures/grants et ferme explicitement l’exécution anonyme. Ne pas réappliquer les migrations historiques.

Validation locale : **54 assertions pgTAP** sous `session_user = authenticator`, **20 assertions de régression** du contrat documentaire existant et **8 tests client** des catégories. Les fixtures utilisent deux sociétés synthétiques et des profils Admin, Direction, Armement, Capitaine, Marin, une autre société et une adhésion inactive, entièrement en `ROLLBACK`. Elles couvrent les preuves privées, conflits et réessais, retraits, hiérarchie historique, RLS et absence de faux objets Storage. La clone locale ancienne manque seulement le `SELECT authenticated` sur `project_billing_documents`, déjà présent en production : le préambule privé le restaure pour le test et le rollback le retire ; aucun GRANT supplémentaire ne figure dans la migration.

Une reproduction séparée des fonctions précédentes montre les noms actifs dupliqués et les cycles inactifs acceptés, le déplacement d’une sous-catégorie référencée et l’échec `23505` au réessai. Les preuves avant/après restent hors Git. L’audit de production est strictement en lecture seule : aucune vraie pièce ni catégorie n’a été créée, renommée, retirée ou réimportée pour vérifier ce parcours. Build, revue et déploiement communs sont coordonnés avec la livraison de la bibliothèque.

Après application, la lecture de l’historique confirme la version `20261014211056`. Les définitions des deux RPC correspondent à la source ; leurs ACL sont identiques à la baseline (exécution authentifiée et service conservée, anonyme refusée), avec `SECURITY DEFINER` et `search_path` vide. Les empreintes complètes des 12 catégories, 13 documents et 790 mappings Blob restent inchangées. Aucun rattachement ni mutation métier n’a servi de test en production.
