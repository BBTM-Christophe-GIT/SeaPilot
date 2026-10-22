# Soumission des demandes d’achat par les équipages

## Correctif

Les profils Capitaine et Marin peuvent créer une demande dans leur entreprise
active, avec une adhésion active et un rôle explicite. Cela couvre notamment les
seconds capitaines dont le rôle applicatif est Marin. Le libellé de fonction RH
n’accorde plus de droit supplémentaire à un compte sans rôle.

Les vues équipage conservent le périmètre des navires affectés et y ajoutent les
demandes soumises par le compte connecté. Une demande sans navire, ou portant sur
un autre navire de l’entreprise, reste ainsi consultable après sa création et au
prochain chargement. L’auteur est établi par l’événement serveur `created`, pas
par le nom du demandeur saisi dans le formulaire.

Les erreurs renvoyées lors de la création s’affichent dans le formulaire ouvert,
en conservant les informations saisies. Le circuit d’approbation existant est
conservé : une nouvelle demande commence en **À traiter / En attente**.

## Livraison

Appliquer `20261020164707_purchase_request_crew_creation.sql` avant le client.
Cette migration remplace le contrôle de création et expose la liste des seules
demandes soumises par le compte connecté. Elle ne nécessite aucune nouvelle
variable d’environnement.

## Vérifications

- Parcours complet des six étapes avec des fixtures Capitaine, Marin / 2nd
  Capitaine et Marin sans fonction particulière.
- Affichage d’une erreur RPC dans le formulaire et conservation de la saisie.
- Conservation des demandes personnelles sans navire ou hors affectation,
  exclusion des demandes des autres auteurs hors périmètre.
- Contrôle SQL de la création, des pièces jointes, de l’identité de l’auteur et
  des restrictions de rôle, d’adhésion et d’entreprise.

Les essais SQL sont exécutés dans des transactions annulées ; aucune demande ni
notification de test n’est conservée.

Recette du 20 octobre 2026 : les 162 assertions des six suites SQL d’achat
passent, dont 47 consacrées à ce correctif. Les identités authentifiées des trois
comptes signalés ont également passé la création, le suivi personnel et le
contrôle d’autorisation des pièces jointes dans une transaction annulée.
Les tests d’interface et de requêtes couvrent le parcours complet et les refus ;
six parcours Chrome sur ordinateur et mobile passent avec des fixtures
Capitaine et Marin, sans erreur console.

## Retour arrière

Restaurer le client et la fonction `purchase_request_can_create` précédents,
puis retirer `purchase_request_own_submission_ids()` si aucun client ne l’utilise.
Conserver les demandes et leur historique.
