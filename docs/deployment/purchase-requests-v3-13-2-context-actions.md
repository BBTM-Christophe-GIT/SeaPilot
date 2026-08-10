# Demandes d'achat — actions contextuelles v3.13.2

## Évolution livrée

Les commandes propres à la demande sélectionnée quittent le ruban global et rejoignent la ligne de métadonnées de la fiche, au niveau des chips navire, catégorie, demandeur et date.

La composition reste volontairement compacte :

- une seule action métier principale est visible selon l'étape (`Prendre en charge`, `Planifier la livraison` ou `Reçu à bord`) ;
- une chip **Actions** regroupe les décisions secondaires (`Approuver`, `Refuser`, `Demander un complément`) ainsi que les raccourcis **Pièces jointes** et **Historique** ;
- le ruban Planning conserve uniquement les commandes globales **Demandes** et **Vues**.

Le menu est utilisable au clavier, expose son état aux technologies d'assistance et se referme au changement de demande ou lorsque le focus le quitte. Les autorisations et transitions du workflow ne changent pas.

## Déploiement

Cette version est uniquement côté client. Elle ne nécessite ni migration Supabase, ni nouvelle variable d'environnement. Déployer le commit applicatif puis vérifier `/modules/purchaseRequests` avec un rôle de traitement et un rôle Capitaine.

## Contrôles attendus

1. Vérifier qu'une seule action principale et la chip **Actions** apparaissent à côté des métadonnées.
2. Vérifier que le menu distingue les sections **Décision** et **Suivi** sans masquer le titre de la demande.
3. Changer d'étape et confirmer l'adaptation de l'action principale.
4. Vérifier l'ouverture et la fermeture du menu au clavier, au clic et lors d'un changement de demande.
5. Contrôler la disposition compacte sur écran large et l'empilement sans débordement sur mobile.

## Retour arrière

Redéployer la version `3.13.1`. Aucun retour arrière de données n'est requis.
