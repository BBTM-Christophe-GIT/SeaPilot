# Certificats flotte — rapport compact et correction des dates (v3.21.4)

## Rapport « Certificats Flotte - Plan d'Action »

- suppression de la page de couverture et de synthèse ;
- démarrage direct sur la page du navire ;
- conservation d'un navire par page ;
- présentation compacte de la liste des documents, avec séparateurs de catégories intégrés ;
- maintien des écarts à la suite du tableau de suivi de leur catégorie ;
- vérification automatisée d'un rapport d'un navire comprenant 18 documents et 14 catégories sur une page A4.

## Modification des informations d'un document

Les migrations `20260819113157_reload_fleet_certificate_metadata_rpc_schema.sql` et `20260819114837_refresh_postgrest_notification_queue.sql` rafraîchissent la file de notifications PostgreSQL puis forcent le rechargement du schéma PostgREST. Elles corrigent les réponses `404` observées en production lors de l'enregistrement d'une date ou de la création d'une ligne alors que les fonctions SQL existaient bien dans PostgreSQL.

L'interface restitue également le message renvoyé par l'API si un nouvel échec survient.

Le formulaire d'ajout expose désormais une pièce jointe facultative en permanence : sans fichier, il crée une ligne « Manquant » ; avec fichier, il crée directement le document et sa première version.

## Vérifications attendues après déploiement

1. Modifier une date d'émission et une date d'échéance depuis l'aperçu d'un document.
2. Générer un rapport pour un seul navire avec uniquement la liste des documents.
3. Vérifier que le PDF contient une seule page lorsque le volume est comparable à l'exemple SUROIT.
