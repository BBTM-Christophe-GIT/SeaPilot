# Enveloppe Gmail et compteur de non-lus

Version `3.75.4`, build `2026-10-15.009`.

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

## Compteur préparé, configuration facultative

Le choix de livraison est de préparer le compteur et de livrer le raccourci,
sans identifiant OAuth Google fourni. Aucun identifiant client navigateur Gmail
n'est actuellement configuré sur Vercel. Le raccourci fonctionne ainsi sans
chargement de Google Identity Services ni demande d'accès à la messagerie.
Aucune pastille ne représente une valeur inconnue.

Pour activer le compteur ultérieurement :

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

## Vérification de cette livraison

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
