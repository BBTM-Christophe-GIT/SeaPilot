# Connexion mobile et anciens raccourcis d’activation — v3.64.3

## Défaut et périmètre

La route `/auth/update-password` affichait le formulaire dès qu’une session existait. Elle ne distinguait pas une connexion ordinaire d’une récupération ou d’une invitation. Son état de succès était local au composant et disparaissait à la réouverture. Un onglet ou une icône d’écran d’accueil conservant cette adresse pouvait donc demander de choisir un mot de passe à chaque utilisation.

Le défaut était commun au client web, sans règle particulière liée au téléphone ou au rôle. La lecture du code et des règles Auth n’a révélé aucun renouvellement périodique imposé. L’adresse exacte de l’icône du téléphone signalé n’a pas été observée ; la reproduction utilise cette ancienne route avec une session normale.

L’application mobile utilise le même client React que le navigateur de bureau. Le dépôt n’enregistre ni service worker ni manifeste PWA. Il n’y a pas de cache hors ligne distinct à migrer.

## Correction

Une ancienne route sans demande de récupération ouvre l’accueil si la session est présente, ou la connexion dans le cas contraire. Les vrais liens d’invitation et de récupération restent utilisables : leur intention est capturée avant que Supabase ne nettoie le fragment URL, puis rapprochée de la session reçue du SDK. Un code PKCE seul ne suffit pas à autoriser le formulaire ; son traitement doit avoir réussi. Une erreur de lien ne peut pas utiliser une session normale comme récupération.

L’intention temporaire conservée pour recharger une récupération en cours contient uniquement l’identifiant utilisateur et une échéance d’une heure dans `sessionStorage`. Elle est supprimée après l’enregistrement du mot de passe, une connexion normale ou la déconnexion. Aucun jeton ni mot de passe n’est ajouté à ce marqueur. Les tokens de callback utilisés pour identifier la session restent uniquement en mémoire ; la persistance Auth habituelle de Supabase est inchangée.

Les événements Auth récents prennent priorité sur un ancien résultat de `getSession`. Le changement de compte réinitialise les champs et empêche une réponse tardive d’afficher le succès d’un autre compte.

Le formulaire de connexion ignore les réponses de récupération devenues obsolètes après un changement de mode. Le retour après connexion retire les routes et paramètres de callback Auth tout en conservant les destinations métier. La déconnexion désactive le bouton pendant la requête, signale un échec réseau et permet de réessayer sans annoncer un succès ni effacer manuellement la session.

Les formulaires restent dans les écrans de 320 px, proposent des champs mobiles de 16 px et des liens tactiles d’au moins 44 px. Leur hauteur suit le viewport dynamique.

## Vérification et déploiement

Frontend uniquement, sans migration, modification de compte, nouvelle variable ou changement de droits. Les liens d’activation et la fonction de récupération existante restent nécessaires pour les comptes qui en ont réellement besoin.

Régressions automatisées : session restaurée ordinaire, invitation et récupération, callback invalidé, reprise avant et après enregistrement, intention expirée ou liée à un autre compte, erreur serveur, réponse Auth tardive, changement de compte et stockage indisponible. Les parcours de connexion et de déconnexion couvrent les réponses réseau tardives, le refus de déconnexion et la possibilité de réessayer.

Recette Chrome avec le vrai SDK Supabase et des réponses API synthétiques sur localhost : anciens raccourcis avec ou sans session, liens implicites `invite`/`recovery`, rechargement pendant la récupération, enregistrement puis réouverture, callback PKCE sans vérificateur et liens malformés/expirés, connexion ordinaire, navigation mobile et déconnexion après erreur. Largeurs de 320 et 390 px, bureau de 1440 px et viewport réduit de 390 × 350 px. Aucun email ni mot de passe réel n’est modifié pour cette recette.

Après déploiement, fermer puis rouvrir SeaPilot sur le téléphone. Pour recréer un raccourci, partir de l’accueil de `https://sea-pilot-ten.vercel.app`, après connexion, et non du lien reçu par email. Une ancienne icône sur la route nue d’activation est prise en charge par la correction. Un lien contenant des paramètres expirés affiche un état de lien invalide et propose l’accès à la session existante.

La recette ne remplace pas une vérification sur le téléphone concerné ou sur Safari iOS réel. Retour arrière : redéployer le frontend précédent, sans changement des données Auth.
