# Enveloppe Gmail et compteur de non-lus

Version `3.75.4`, build `2026-10-15.009`.

Activation : version `3.75.9`, build `2026-10-16.001`.

## Raccourci livré

L'enveloppe se trouve immédiatement à droite de la cloche, avant l'aide. Son
clic ouvre Gmail dans une nouvelle fenêtre avec l'adresse du compte SeaPilot
connecté. L'adresse vient exclusivement de `session.user.email`, indépendamment
des fiches RH, des métadonnées affichées ou d'une vue de profil.

Le lien Gmail transmet l'adresse comme indication de compte (`authuser`). Les
sessions SeaPilot et Google sont indépendantes : Google peut demander de
sélectionner ou de connecter ce compte. Le lien reste utilisable au clavier,
avec le menu contextuel et les clics modifiés. La nouvelle fenêtre ne reçoit
aucun accès à la fenêtre SeaPilot. Le raccourci est désactivé en prévisualisation.

## Configuration du compteur

La livraison initiale préparait le compteur sans client OAuth. Le 16 octobre
2026, un client Web `SeaPilot Gmail Web` a été créé dans le projet Google Cloud
`seapilot-documents`, avec l'application `SeaPilot – Compteur Gmail` et une
audience **interne** à l'organisation BBTM. Gmail API était déjà activée.
`VITE_GMAIL_CLIENT_ID` est configuré sur Vercel pour production, preview et
développement ; cette variable contient uniquement l'identifiant public.

Les origines autorisées sont `https://sea-pilot-ten.vercel.app`,
`https://sea-pilot-bbtm-app.vercel.app`,
`https://sea-pilot-git-main-bbtm-app.vercel.app` et `http://localhost:5173`.
Une URL de preview supplémentaire doit être autorisée explicitement avant
d'utiliser le compteur sur cette origine. Aucun URI de retour serveur n'est
nécessaire pour le modèle de jeton Google Identity Services.

Pour reproduire cette configuration :

1. Créer un client OAuth Google de type application Web pour SeaPilot et activer
   l'API Gmail dans son projet Google Cloud.
2. Configurer l'écran de consentement adapté à l'organisation et les origines
   JavaScript autorisées, notamment `https://sea-pilot-ten.vercel.app` et chaque
   autre origine utilisée. Les prévisualisations Vercel doivent également avoir
   leur origine autorisée pour utiliser le compteur.
3. Définir **uniquement l'identifiant public** du client dans
   `VITE_GMAIL_CLIENT_ID`, puis reconstruire et déployer l'application. Cet
   identifiant se termine par `.apps.googleusercontent.com`. Aucun secret OAuth,
   mot de passe Gmail ou compte de service n'est requis dans le navigateur.
4. Dans le menu du compte SeaPilot, utiliser l'action d'activation du compteur
   et autoriser le compte Google correspondant à l'adresse SeaPilot.

L'autorisation est distincte de la connexion SeaPilot ; elle est demandée au
clic et ne remplace pas la session de l'application. Les portées demandées sont
`openid`, `email` et `https://www.googleapis.com/auth/gmail.labels`. Cette
dernière autorise la gestion des libellés dans Google ; SeaPilot utilise
uniquement des requêtes GET pour lire le compteur et ne modifie aucun libellé,
message ou statut de lecture.

## Identité et valeur affichée

Avant de lire le compteur, SeaPilot vérifie l'adresse Google et sa validation
via OpenID Connect. Une adresse différente du compte SeaPilot est refusée.
L'API Gmail fournit ensuite `INBOX.messagesUnread` : le nombre de **messages**
non lus dans la boîte de réception, et non le nombre de conversations ou de
notifications SeaPilot. La pastille affiche un nombre positif, plafonné
visuellement à `99+`, et son libellé accessible garde le nombre exact.

Le jeton Google reste en mémoire ; aucun jeton de rafraîchissement n'est
enregistré. Un changement de compte, l'expiration ou une erreur retire le
compteur. Une valeur inconnue n'est jamais remplacée par zéro. Une nouvelle
autorisation nécessite une action de l'utilisateur. La fermeture ou le
rechargement de la page supprime l'autorisation conservée en mémoire.

## Coût et consommation

La console Google Cloud a été vérifiée le 16 octobre 2026 : le projet
`seapilot-documents` n'est associé à **aucun compte de facturation**. Ne pas
activer l'essai Google Cloud, associer un paiement ni demander d'extension
payante de quotas pour cette fonctionnalité.

L'usage standard de Gmail API est gratuit. La documentation Google actuelle
indique un seuil de 80 millions d'unités par jour et par projet ; une requête
`labels.get` consomme une unité. Google annonce une possible facturation future
des dépassements : la gratuité repose sur le maintien dans les quotas et
l'absence de compte de facturation, et ne constitue pas une promesse de quota
illimité.

SeaPilot espace les lectures Gmail d'au moins 60 secondes par autorisation,
y compris les clics d'actualisation et les événements de focus/visibilité.
Aucune lecture ne part tant que la page est masquée. Cent utilisateurs actifs
huit heures représentent environ 48 000 lectures Gmail par jour. L'identité
OpenID est vérifiée avant chaque lecture avec le même jeton. Aucun service
Supabase, Vercel Functions, Pub/Sub ni stockage serveur n'est ajouté.

Une nouvelle autorisation, un changement de compte ou un nouvel onglet crée
son propre contrôleur en mémoire ; cette limite locale n'est pas un quota
global du projet Google.

## Vérification de cette livraison

Pour l'activation `3.75.9`, les 158 tests ciblés messagerie, shell, manuel et
routes passent. Ils couvrent aussi les rafales de focus/clic, la reprise à
60 secondes, une page initialement masquée et l'isolation des comptes.

Les 190 tests ciblés shell et messagerie, les 13 tests des routes de
l'application et les 23 tests du manuel passent, avec ESLint ciblé et
compilation de production.
La recette navigateur utilise le véritable `AuthProvider` et `AppShell`, avec
trois comptes de test distincts Administrateur, Marin et Capitaine, sans vue
de profil simulée depuis un administrateur.

À 1280 et 390 pixels, l'ordre cloche/enveloppe/aide, l'absence de débordement,
l'ouverture d'une fenêtre isolée avec la bonne adresse et la fermeture des
menus sont vérifiés. Sans identifiant client, aucun chargement SDK ni appel
aux API Google n'a lieu. Les réponses Google simulées vérifient également le
compteur positif, zéro sans pastille et le refus d'une autre adresse avant
toute lecture Gmail. Les captures ont été revues visuellement. Le consentement
Google réel reste à vérifier lors de la configuration d'un client OAuth.

## Références Google

- [Modèle de jeton Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Lecture d'un libellé Gmail et portées autorisées](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels/get)
- [Champs du libellé Gmail](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.labels)
- [Portées Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Quotas et coût Gmail API](https://developers.google.com/workspace/gmail/api/reference/quota)
