# Fermeture du point d’envoi historique de documents projet

L’Edge Function `project-document-upload` écrivait les nouveaux documents dans SharePoint. Le client SeaPilot actuel enregistre ces documents dans Vercel Blob privé et n’appelle plus cette fonction. Sa fermeture empêche un ancien client de créer une nouvelle pièce jointe hors du stockage actuel.

La fonction répond désormais `410` avec le code `LEGACY_DOCUMENT_UPLOAD_CLOSED` et invite à actualiser SeaPilot. Elle ne lit pas le corps de la requête, n’accède à aucun secret de stockage ou compte et ne contacte ni Graph ni Supabase. Les documents et références existants restent conservés. Les origines CORS existantes, y compris `SEAPILOT_ALLOWED_ORIGINS`, sont conservées ; une origine inconnue reçoit `403`, une méthode autre que `POST` ou `OPTIONS` reçoit `405`.

Déployer uniquement `supabase/functions/project-document-upload/index.ts` et sa dépendance `handler.ts`, avec `verify_jwt=true` comme dans la version de production précédente. Aucun secret, schéma ou donnée métier ne doit être modifié pour ce déploiement. Après déploiement, relire la version et ses sources avec `get_edge_function` pour confirmer le handler fermé et la vérification JWT. Les tests locaux couvrent les anciennes requêtes base64, l’absence de lecture du corps et d’accès réseau, les méthodes et les origines CORS.
