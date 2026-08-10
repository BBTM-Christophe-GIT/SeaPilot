# Demandes d'achat — ruban de commandes v3.13.1

## Évolution livrée

Le module **Demandes d'achat** adopte le même ruban de commandes que le module Planning : surface blanche arrondie, commandes sur deux lignes, icônes bleues, badges rouges, séparateurs verticaux et libellés de groupes en pied de barre.

Les commandes sont organisées en quatre groupes :

- **Demandes** : nouvelle demande, filtres, urgences et actualisation ;
- **Vues** : à traiter, en commande, à réception et traitées ;
- **Décision** : prise en charge, approbation, refus et demande de complément ;
- **Logistique et suivi** : planification de la livraison, réception à bord, pièces jointes et historique.

Les actions métier restent conditionnées par les rôles et par l'étape de la demande. Une commande non applicable reste visible mais désactivée afin de conserver une barre stable et de rendre le workflow lisible. Les commandes **Pièces jointes** et **Historique** amènent directement à la section correspondante de la demande sélectionnée.

## Déploiement

Cette version est uniquement côté client. Elle ne nécessite ni migration Supabase, ni nouvelle variable d'environnement. Déployer le commit applicatif puis vérifier `/modules/purchaseRequests` avec un rôle de traitement et un rôle Capitaine.

## Contrôles attendus

1. Vérifier l'alignement du ruban avec le design du module Planning sur écran large.
2. Vérifier le défilement horizontal du ruban sur mobile sans compression des commandes.
3. Ouvrir les filtres, activer les urgences et changer d'étape depuis le ruban.
4. Confirmer que les actions de décision et de logistique sont désactivées en dehors de leur étape.
5. Contrôler la prise en charge, l'ouverture du formulaire de livraison, le marquage « Reçu à bord » et les raccourcis de suivi.

## Retour arrière

Redéployer la version `3.13.0`. Aucun retour arrière de données n'est requis.
