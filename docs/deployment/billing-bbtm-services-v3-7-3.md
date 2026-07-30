# Facturation projets v3.7.3

## Évolutions

- La référence client de l’export est enregistrée par projet et par mois. Le projet P144 propose `TRE-PO-000503` par défaut.
- Le projet et le navire du PDF proviennent du contrat et de l’opération sélectionnés.
- Les jours sans DPR peuvent être complétés, après confirmation, avec une ligne `24/24 Operation` au loyer de l’opération.
- Les pièces jointes sont gérées dans chaque service refacturable et renommées `date - facture - catégorie`.
- La prestation BBTM `Spread Antipollution` possède un montant unitaire et une quantité modifiable. Sa quantité proposée correspond au nombre de lignes `24/24 Operation`, compléments compris.
- Le PDF présente la prestation BBTM sous les frais imputables et l’intègre dans le total HT.
- Un bouton permet d’afficher ou de masquer la prestation BBTM dans le PDF. Lorsqu’elle est masquée, son tableau, son sous-total et son montant sont exclus du total HT.

## Base de données

La migration `20260730091931_project_billing_bbtm_services.sql` ajoute la table `project_billing_services`.
La table est protégée par RLS : lecture pour les membres de la société, écriture pour les rôles `admin` et `direction`.

## Déploiement

1. Appliquer la migration Supabase.
2. Déployer l’application v3.7.3.
3. Vérifier un export P144 sur un mois incomplet, avec et sans complétion, puis avec et sans prestation BBTM.
