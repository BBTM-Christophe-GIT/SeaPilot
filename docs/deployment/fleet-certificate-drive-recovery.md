# Consultation des certificats après la migration Google Drive

Le 14 octobre 2026, la consultation du certificat « ASSURANCE P&I - LE ROZEL »
affichait `Object not found`. Les documents avaient été transférés dans Google
Drive le 12 octobre, puis un déploiement de `main` avait remplacé le lecteur
compatible avec cette migration par le lecteur Storage historique. Le compte
Benjamin BON conserve les droits nécessaires dans la société 1 ; ses permissions
ne sont pas la cause de cette erreur.

Le client Supabase installe désormais le lecteur `documentDriveStorage` à sa
création. Pour les documents PDF, Word et Excel, ce lecteur consulte
`document_drive_lookup` avec les droits de l'utilisateur réel. Une correspondance
active utilise la fonction serveur `document-drive` pour l'aperçu et le
téléchargement. Un document non migré conserve son lecteur Storage habituel.
Un refus de droits n'utilise jamais une ancienne copie en secours.

Le téléchargement contrôle les bornes, la taille, l'identifiant et la version de
chaque bloc de 4 Mio. Les aperçus volumineux utilisent le même téléchargement
authentifié, puis une URL temporaire libérée après 120 secondes au maximum. Les
images et signatures conservent leurs politiques Storage existantes.

Le relais Vercel `/api/google-drive-token` est également rétabli. Les routes
`/api/` sont exclues de la réécriture SPA, afin que ce relais exécute la fonction
serveur. Il utilise l'identité Vercel de production et le compte Google lecteur
déjà configurés ; aucune clé Google ni aucun secret n'est envoyé au navigateur.
Les variables serveur requises sont décrites dans
`supabase/functions/document-drive/.env.example`.

Les sources de la fonction Edge, les migrations du registre et ses tests sont
conservés dans le dépôt. Ces migrations sont déjà appliquées sur l'instance
SeaPilot ; ce correctif ne transfère ni ne supprime de fichiers.

## Vérification d'une livraison

- Exécuter les tests du lecteur, de l'accès aux certificats et du relais Google,
  puis le build de production avec pnpm 10.34.5.
- Vérifier les règles RLS et `document_drive_lookup` sous l'identité réelle de
  Benjamin BON, et les fixtures Admin, Direction, Armement, Capitaine et Marin.
- Confirmer que `/api/google-drive-token` renvoie HTTP 405 pour une requête GET
  et HTTP 401 pour un POST anonyme en production, avec des réponses non mises
  en cache. Une réponse HTML 200 révèle une régression de la réécriture SPA.
- Relire le PDF LE ROZEL depuis la passerelle déployée et contrôler ses octets.
- Confirmer que le déploiement de production correspond au commit livré et
  conserve le relais serveur, y compris lors des prochains déploiements `main`.

Les documents, manifestes de reprise, preuves privées et secrets restent hors
Git. Les tests ne doivent pas simuler un Marin ou un Capitaine depuis une
session administrateur pour conclure sur leurs droits réels.
