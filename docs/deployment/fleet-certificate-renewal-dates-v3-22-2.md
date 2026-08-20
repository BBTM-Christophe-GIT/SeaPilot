# Certificats flotte — dates de renouvellement v3.22.2

## Correctif

Lors de l'enregistrement d'une nouvelle version depuis l'action **Renouveler**, la date d'émission, la date d'échéance et l'alarme à 90 jours sont désormais mises à jour sur la fiche du document dans la même transaction que la création de la version.

Le formulaire conserve explicitement la pièce jointe sélectionnée et refuse une date d'échéance antérieure à la date d'émission.

## Migration

La migration `20260820084731_fix_fleet_certificate_renewal_dates.sql` :

- remplace la fonction `submit_fleet_certificate_renewal` pour synchroniser les dates du document et de sa nouvelle version ;
- recalcule `alarm_on` à partir de la nouvelle échéance ;
- remet en cohérence les renouvellements déjà en attente de validation à partir de leur dernière version soumise.

## Vérifications

- test du formulaire : fichier signé et dates transmis à la fonction RPC ;
- test transactionnel avec annulation : dates identiques sur le document et sa version, sans donnée résiduelle ;
- contrôle après migration : aucun renouvellement en attente avec des dates divergentes.
