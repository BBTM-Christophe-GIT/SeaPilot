# Demandes d'achat — porte d'approbation

## Workflow livré

Toute demande créée dans SeaPilot démarre avec le statut **À traiter** et une
décision **En attente**, y compris lorsqu'une date de livraison souhaitée est
renseignée dès la création.

Le circuit appliqué est désormais séquentiel :

1. **À traiter** : seuls les profils Administrateur, Direction et Armement
   peuvent approuver ou refuser la demande.
2. **Refusée** : la justification est obligatoire côté interface et côté base de
   données ; une demande refusée ne peut pas entrer dans le circuit logistique.
3. **Acceptée** : les profils de traitement autorisés peuvent prendre la demande
   en charge, ce qui la fait passer à **En commande**.
4. La planification de la livraison la fait passer à **À réception**.
5. La confirmation de réception la fait passer à **Traitée**.

Les profils Capitaine et Marin conservent leurs actions logistiques, mais ne
peuvent ni approuver ni refuser. Chaque décision et chaque transition reste
enregistrée dans `purchase_request_events`.

## Déploiement

Appliquer la migration
`20260905170017_purchase_request_approval_gate.sql` avant de déployer le client.
Aucune nouvelle variable d'environnement n'est requise.

## Contrôles attendus

- créer une demande avec et sans date souhaitée et vérifier sa présence dans
  **À traiter** ;
- vérifier les boutons **Approuver** et **Refuser** avec Administrateur,
  Direction et Armement ;
- vérifier leur absence avec Capitaine et Marin ;
- confirmer qu'un refus sans justification est bloqué ;
- approuver puis exécuter successivement **Prendre en charge**,
  **Planifier la livraison** et **Reçu à bord** ;
- vérifier l'historique de la demande après chaque étape.

Les règles serveur sont couvertes par
`purchase_request_approval_gate_test.sql`,
`purchase_request_admin_oversight_test.sql` et
`purchase_request_marin_operations_test.sql`. L'affichage par profil et le
classement des statuts sont couverts par `PurchaseRequestsPage.test.tsx`.

## Retour arrière

Restaurer les fonctions `purchase_request_create` et
`purchase_request_transition` de la migration
`20260828152343_allow_marin_purchase_request_operations.sql`, puis restaurer les
anciens défauts de colonnes si nécessaire. Les événements déjà journalisés ne
doivent pas être supprimés.
