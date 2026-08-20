# Projets — offre commerciale v3.22.3

## Évolutions

- la date de début du projet initialise la livraison et le début d'affrètement à 10 h ;
- la date de fin du projet initialise la restitution et la fin d'affrètement à 18 h ;
- l'offre commerciale expose un champ **Fuel** modifiable, prérempli avec `A la charge de l'affréteur` ;
- la fiche client enregistre son représentant avec un prénom normalisé et un nom en majuscules.

Le PDF **Offre** utilise désormais la description pour les *Duties*, affiche les LOCODE sous les ports, normalise les montants en euros HT et masque les tarifs journaliers nuls ou non renseignés. Le logo BBTM est intégré à l'en-tête et l'ancienne note de validation a été retirée.

## Migration

La migration `20260820124545_project_offer_client_fields.sql` ajoute `clients.represented_by` et met à jour la fonction sécurisée `clients_save` pour enregistrer cette valeur avec les contrôles de société, de rôle et de concurrence existants.

La migration `20260820153000_reload_project_client_rpc_schema.sql` demande ensuite au Data API de recharger sa description de la fonction RPC.

La migration technique `20260820085400_fix_fleet_certificate_renewal_dates_remote_sync.sql` aligne l'historique local avec le correctif de certificats déjà appliqué en production sous ce timestamp ; elle est volontairement sans effet sur le schéma.

## Vérifications

- tests unitaires et d'intégration des éditeurs de projet et de client ;
- test de génération et contrôle visuel du PDF Offre ;
- application locale et lint du schéma Supabase ;
- vérification desktop et mobile des champs ajoutés.
