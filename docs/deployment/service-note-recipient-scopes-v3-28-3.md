# Notes de Service — ciblage et reprise des signatures v3.28.3

## Livraison

- Périmètres de diffusion `Tous les utilisateurs`, `Navire(s)` et `Liste de personnes`.
- Résolution des destinataires navire depuis le Planning à la date de la note.
- Application des dates d'embauche et de départ RH, avec exclusion de l'émetteur.
- Registres historiques reconstruits sans date de signature; aucune image de signature n'est inventée lorsqu'un profil n'en possède pas.
- Affichage immédiat des non-signataires dans la bibliothèque et le détail.
- Classement de la bibliothèque par année et numéro chrono décroissant.
- Suppression ciblée de `NS 03-26 - Transmission et formation interne`.

## Base de données

Migration : `20260903062527_service_note_recipient_scopes_and_historical_signatures.sql`.

La migration ajoute les tables RLS `qhse_service_note_target_vessels` et `qhse_service_note_target_people`, rend les signatures historiques explicitement identifiables et déplace les imports SharePoint au statut `archived`. Les nouvelles fonctions `save_service_note_draft`, `service_note_targeting_options` et `service_note_resolved_recipients` valident le rôle, la société, l'emploi et le planning côté serveur.

Contrôle après migration : 14 archives, 185 destinataires, 185 validations historiques, aucune date de signature historique et aucun destinataire hors période d'emploi.

## Vérifications

- Tests ciblés Notes de Service et build de production.
- Contrôle transactionnel du ciblage multi-navires et de la résolution Planning.
- Contrôle RLS avec un vrai profil `Marin` : aucun brouillon visible et seules les archives dont il est destinataire sont lisibles.
