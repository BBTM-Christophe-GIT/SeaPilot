# Certificats flotte — catégories et lignes sans fichier (v3.21.3)

## Taxonomie

La catégorie historique `08 - Grue & Bossoir` devient `08 - Levage`. Les catégories existantes restent disponibles et les sous-catégories demandées sont ajoutées sous `06 - Incendie`, `07 - LSA`, `08 - Levage` et `16 - Registre des produits dangereux`.

Les catégories `15 - Dotation Médicale` et `16 - Registre des produits dangereux` sont ajoutées. La catégorie historique `10 - Dotation Médicale` est conservée.

## Ligne de suivi sans fichier

Le formulaire **Ajouter un document** propose l’option **Créer une ligne sans document joint**. La ligne est créée avec l’état `missing`, sans objet Storage ni version documentaire. Un fichier peut ensuite être ajouté depuis l’action de renouvellement ou le bouton **Ajouter un fichier** dans l’aperçu.

## Déploiement

Appliquer la migration `20260819102029_extend_fleet_certificate_categories.sql` avant de déployer le client web. Elle renomme les enregistrements de la catégorie 08 et ajoute la fonction transactionnelle `create_fleet_certificate_line`.
