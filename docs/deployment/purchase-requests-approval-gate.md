# Demandes d'achat — porte d'approbation

## Workflow livré

Toute demande créée dans SeaPilot démarre avec le statut **À traiter** et une
décision **En attente**, y compris lorsqu'une date de livraison souhaitée est
renseignée dès la création.

Le circuit appliqué est désormais séquentiel :

1. **À traiter** : les profils Administrateur, Direction, Armement et Marin
   peuvent approuver la demande. Le refus et la demande de complément restent
   réservés aux profils Administrateur, Direction et Armement.
2. **Refusée** : la justification est obligatoire côté interface et côté base de
   données ; une demande refusée ne peut pas entrer dans le circuit logistique.
3. **Acceptée** : les profils de traitement autorisés peuvent prendre la demande
   en charge, ce qui la fait passer à **En commande**.
4. La planification de la livraison la fait passer à **À réception**.
5. La confirmation de réception la fait passer à **Traitée**.

Les profils Capitaine et Marin conservent leurs actions logistiques. Le Marin
peut aussi approuver une demande en attente de sa société, avec une adhésion
active. Le Capitaine seul ne peut ni approuver ni refuser. Chaque décision et
chaque transition reste enregistrée dans `purchase_request_events`, avec
l'identité de son auteur.

## Déploiement

Appliquer la migration
`20260905170017_purchase_request_approval_gate.sql`, puis
`20260924100759_allow_marin_purchase_request_approval.sql` avant de déployer le client.
Aucune nouvelle variable d'environnement n'est requise.

La migration d'approbation Marin a été appliquée au projet SeaPilot le
24 septembre 2026. Les 70 assertions SQL du circuit d'achat passent dans des
transactions annulées en fin de test ; les 20 assertions de la nouvelle suite
Marin passent également après application de la migration. Les 20 tests
d'interface, le lint ciblé et la compilation de production passent. Un contrôle
navigateur avec une fixture uniquement Marin confirme **Approuver** →
**Demande acceptée** → **Prendre en charge**, avec l'auteur dans l'historique.

## Contrôles attendus

- créer une demande avec et sans date souhaitée et vérifier sa présence dans
  **À traiter** ;
- vérifier les boutons **Approuver** et **Refuser** avec Administrateur,
  Direction et Armement ;
- vérifier le bouton **Approuver** avec un compte uniquement Marin et l'absence
  du bouton **Refuser** ; vérifier l'absence des deux boutons avec Capitaine seul ;
- vérifier le refus serveur d'une approbation hors société, avec une adhésion
  inactive, sur une demande refusée ou déjà approuvée/traitée ;
- confirmer qu'un refus sans justification est bloqué ;
- approuver puis exécuter successivement **Prendre en charge**,
  **Planifier la livraison** et **Reçu à bord** ;
- vérifier l'historique de la demande après chaque étape.

Les règles serveur sont couvertes par
`purchase_request_approval_gate_test.sql`,
`purchase_request_admin_oversight_test.sql` et
`purchase_request_marin_operations_test.sql`, ainsi que
`purchase_request_marin_approval_test.sql` pour l'approbation Marin et les
limites de société et d'adhésion. L'affichage par profil et le
classement des statuts sont couverts par `PurchaseRequestsPage.test.tsx`.

## Retour arrière

Pour retirer uniquement l'approbation Marin, restaurer la fonction
`purchase_request_transition` de la migration
`20260905170017_purchase_request_approval_gate.sql` et le contrôle d'affichage
précédent du bouton **Approuver**. Les événements déjà journalisés ne doivent
pas être supprimés.
