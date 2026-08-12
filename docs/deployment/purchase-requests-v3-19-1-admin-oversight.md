# Demandes d'achat — supervision administrateur v3.19.1

## Évolution livrée

Les administrateurs, la Direction et l'Armement voient désormais les demandes
d'achat de chaque entreprise pour laquelle leur rôle est affecté, même si une
autre entreprise est momentanément sélectionnée dans leur profil. La création
d'un profil Capitaine ne modifie donc plus la visibilité des équipes de bureau.

Le même périmètre est appliqué aux pièces jointes et à l'historique du circuit de
validation. Les administrateurs conservent les actions de traitement existantes
(`Prendre en charge`, `Approuver`, `Refuser`, `Demander un complément`,
`Planifier la livraison` et `Reçu à bord`) et chaque intervention reste tracée
dans l'activité de la demande.

## Déploiement

Appliquer la migration
`20260812123942_admin_purchase_request_oversight.sql` avant de déployer le client.
Aucune nouvelle variable d'environnement n'est requise.

## Contrôles attendus

1. Créer ou conserver un profil Capitaine actif dans l'entreprise des demandes.
2. Se connecter avec un profil Administrateur affecté à cette entreprise.
3. Vérifier que les compteurs et les listes des quatre étapes contiennent les
   demandes attendues.
4. Ouvrir une demande et contrôler l'affichage des pièces jointes et de
   l'historique de validation.
5. Effectuer une action administrateur et vérifier sa présence dans l'activité.

## Retour arrière

Restaurer les politiques et la fonction `purchase_request_transition` de la
migration `20260809183000_purchase_requests_workflow.sql`. Les événements déjà
tracés ne nécessitent aucune suppression.
