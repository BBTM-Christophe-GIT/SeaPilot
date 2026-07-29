# Projets v3.6.20 — suppression d’une opération

La fiche d’un contrat permet désormais aux rôles `admin` et `direction` de supprimer une opération depuis le tableau chronologique.

## Comportement

- Une confirmation explicite précède la suppression définitive de l’occurrence du Planning.
- L’opération disparaît immédiatement de la fiche du contrat et du Planning.
- Les documents déjà classés ne sont pas supprimés de SharePoint. Leur lien précis vers l’occurrence est effacé par la contrainte `ON DELETE SET NULL`, tandis que leur rattachement au projet est conservé.
- Les utilisateurs sans rôle de gestion ne voient pas l’action de suppression.

## Sécurité Supabase

La fonction `projects_delete_planning_occurrence(bigint, bigint)` :

- vérifie l’appartenance à la société courante ;
- exige le rôle `admin` ou `direction` ;
- vérifie que l’occurrence appartient au projet et à la société courante ;
- n’accorde l’exécution qu’au rôle `authenticated`.

Migration : `20260729162911_delete_project_operation.sql`.
