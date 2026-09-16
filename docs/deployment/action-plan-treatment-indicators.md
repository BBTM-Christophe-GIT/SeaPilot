# Plan d’action : traitement par navire

La liste démarre avec le statut **Non soldé**. Le filtre **Soldé** permet de
retrouver les éléments clôturés ; **Tous les statuts** affiche les deux.
**Tout afficher** rétablit la vue générale et le filtre initial Non soldé.

Chaque carte de navire ou de lieu affiche, sous son illustration, la proportion
d’éléments soldés parmi tous ses éléments accessibles. Cet indicateur et les
compteurs par catégorie restent indépendants des filtres de la liste :

- strictement plus de 90 % : vert ;
- de 75 % à 90 % inclus : orange ;
- moins de 75 % : rouge, avec la carte entière sur fond rouge clair.

Les seuils utilisent le taux exact ; le pourcentage affiché est arrondi à une
décimale au maximum. La clôture utilise la même règle que le filtre de statut,
y compris pour les données historiques. Les pastilles rouges des catégories
comptent les éléments non soldés ; une catégorie entièrement soldée conserve
une pastille neutre à zéro pour rester consultable avec le filtre Soldé.

La carte **Sans navire / lieu** est retirée du navigateur. Les rapports concernés
restent accessibles dans la liste générale ; aucune donnée n’est supprimée.

Le volet de rapport et sa colonne sont absents à l’arrivée. Ils s’ouvrent au clic
sur un élément et se ferment avec **Fermer le rapport**, au changement de filtre
ou de périmètre. Un lien explicite de notification `?action=…` ouvre toujours le
rapport visé, même s’il est soldé. Sur mobile, la sélection fait défiler vers le
rapport après son affichage.

## Droits et déploiement

Appliquer `20260916205252_action_plan_assigned_vessel_scope.sql`, puis
`20260916212108_action_plan_personal_report_access.sql` avant le client
(appliquée au projet SeaPilot). Aucune variable d’environnement à modifier.

Pour Marin et Capitaine, les cartes de navires et le formulaire de création sont
limités à leurs propres affectations Planning en cours : date du jour à Paris
comprise entre début et fin, affectation non annulée. Les rapports dont ils sont
auteurs ou responsables restent visibles dans **Tout afficher**, même sur un
autre navire ou sans affectation courante. Ils n’obtiennent pas accès aux autres
rapports de cet autre navire. Les droits de gestion
Administration, Direction et Armement conservent leur périmètre entreprise.

La RLS applique cette règle aux rapports natifs et importés. Le retrait de la
responsabilité retire immédiatement l’accès personnel, sauf si la personne est
également auteur ou affectée au navire. Les rapports sans navire restent eux aussi
accessibles à leurs auteurs et responsables.
La confidentialité des signalements sensibles est conservée. Le RPC
`action_plan_current_vessel_scope` limite le formulaire de création et les cartes
frontend. Les rapports renvoyés par la RLS sont conservés sans second filtrage par
navire. Un échec de ce RPC bloque le chargement, sans repli vers
toute la flotte. Les fixtures SQL utilisent de vraies identités authenticated
dans une transaction annulée, sans simulation d’un profil administrateur.

## Vérifications

- Tests du module : filtre initial, consultation des soldés, ouverture/fermeture,
  notification ciblée, seuils stricts, compteurs stables et absence de carte sans
  affectation.
- Tests existants des traitements, signatures, approbations et corrections.
- Build de production, lint des fichiers modifiés et vérification navigateur
  en vue bureau et mobile.

La vérification navigateur utilise Playwright/Edge sur les données de démonstration
Administration à 1440 × 1000 et 390 × 844 : filtre Soldé, stabilité des indicateurs,
sélection, fermeture et retour à la vue initiale. Aucun débordement ni erreur
d’exécution ; le favicon local absent renvoie seul une 404.

Les scénarios SQL de périmètre passent dans une transaction annulée sur SeaPilot.
Les deux suites de traitement existantes passent aussi (15 + 31 assertions,
exécutées comme assertions SQL strictes, pgTAP étant absent du projet distant).
