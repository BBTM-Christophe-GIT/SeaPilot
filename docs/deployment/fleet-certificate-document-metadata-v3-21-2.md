# Certificats flotte — modification des informations documentaires (v3.21.2)

## Parcours utilisateur

Dans l’onglet **Aperçu du document**, les profils `admin`, `direction` et `armement` disposent d’un bouton **Modifier** dans le panneau **Informations du document**.

Le formulaire permet de modifier :

- le navire ;
- la catégorie ;
- le nom du document ;
- la date d’émission ;
- la date d’échéance.

La version et le fichier restent en lecture seule. Leur remplacement continue de passer par le parcours **Renouveler**. Une date d’échéance vide correspond à une validité illimitée.

## Persistance et sécurité

La fonction `update_fleet_certificate_document_metadata` est exécutée avec les droits de l’utilisateur connecté. Elle contrôle l’entreprise courante et les rôles bureau avant toute modification.

L’enregistrement met à jour le certificat et les dates de sa version active dans une même transaction. Il recalcule également l’état `valid`, `renew_due` ou `expired` et la date d’alarme à J-90. Les états spéciaux `missing` et `pending_validation` sont conservés.

Les profils `capitaine` et `marin` conservent un accès en lecture seule aux informations du document.

## Ordre de déploiement

Appliquer la migration `20260819093028_update_fleet_certificate_document_metadata.sql` avant de déployer le client web. La migration est additive et n'altère ni les fichiers déjà déposés ni l'historique des versions.
