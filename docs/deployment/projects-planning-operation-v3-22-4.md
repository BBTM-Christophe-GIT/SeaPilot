# Projets — opération Planning automatique v3.22.4

## Évolutions

- l’enregistrement d’un nouveau Projet/Contrat crée automatiquement une opération rattachée dans le Planning avec le statut **Non validé** ;
- le **Navire principal**, la **Livraison** et la **Restitution** sont requis avant cette création ; un message indique précisément les informations manquantes ;
- la date de début de l’opération provient exclusivement de **Livraison** et sa date de fin exclusivement de **Restitution** ;
- le navire secondaire est également rattaché à l’opération lorsqu’il est renseigné ;
- le pied de page de chaque page du PDF **Offre** affiche en italique `Offre générée le JJ/MM/AAAA`.

## Base de données

Aucune migration n’est nécessaire. La création utilise la fonction RPC sécurisée existante `projects_save_planning_occurrence`, après l’enregistrement du Projet/Contrat.

## Vérifications

- tests d’intégration du formulaire avec contrôle du blocage des champs manquants ;
- contrôle de la charge utile de l’opération : projet, navires, statut, Livraison et Restitution ;
- test unitaire du format de date du pied de page ;
- génération, extraction textuelle et contrôle visuel du PDF Offre ;
- lint, tests applicatifs, build de production et vérification du déploiement Vercel.
