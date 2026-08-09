# Demandes d'achat — v3.13.0

## Périmètre livré

- Nouvelle interface maître-détail inspirée de la maquette modernisée : recherche, filtres, onglets de statut, détail, activité et pagination.
- Workflow animé : demande créée, approbation, commande, réception.
- Actions métier sécurisées : **Prendre en charge**, **Planifier la livraison à bord**, **Reçu à bord**, approbation, refus et demande de complément.
- Création guidée en six étapes avec fichiers et photos (25 Mo maximum par fichier).
- Vue Capitaine initialisée sur son navire affecté, avec filtre permettant de consulter les autres navires.
- Traitement autorisé pour Admin, Direction, Armement et Capitaine, y compris par un autre Capitaine.
- Notification des rôles Admin, Direction et Armement à la création d'une demande SeaPilot.

## Source SharePoint

- Site : `https://bbtm668.sharepoint.com/sites/QHSE`
- Liste : `Demande d'Achat`
- List ID : `3dce17c3-a634-4c04-ab77-18d47d717642`
- Vue Power Query : `540EA6D5-D078-4125-BFC4-0884D4977A44`
- URL : `https://bbtm668.sharepoint.com/sites/QHSE/Lists/Demande%20dAchat/AllItems.aspx`

L'export vérifié contient 68 demandes, dont 9 urgentes, et 16 pièces jointes. Les pièces jointes SharePoint conservent leur URL authentifiée; les nouveaux fichiers SeaPilot sont stockés dans le bucket privé `purchase-request-attachments` et servis par URL signée.

## Déploiement et import

1. Appliquer `20260809183000_purchase_requests_workflow.sql` puis `20260809184000_purchase_request_attachment_conflict_index.sql` sur la base liée.
2. Importer l'export authentifié :

   ```powershell
   corepack pnpm import:sharepoint:linked --file .data/sharepoint-purchase-requests-live.json
   ```

3. Vérifier les volumes de `purchase_requests` et `purchase_request_attachments`, puis le rapprochement des navires.
4. Déployer le commit en production Vercel et contrôler le module `/modules/purchaseRequests`.

## Retour arrière

Le frontend peut être restauré par redéploiement du commit précédent. Les colonnes et tables ajoutées sont rétrocompatibles; ne pas supprimer les données importées lors d'un rollback applicatif. Désactiver temporairement l'accès au module par les permissions si un retour arrière fonctionnel est requis.
