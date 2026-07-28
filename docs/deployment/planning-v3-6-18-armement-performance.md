# SeaPilot v3.6.18 — consolidation Armement et performance Planning

## Résultat utilisateur

- `ARMEMENT CHERBOURG` et `Armement - Cherbourg` sont regroupés sous le libellé canonique `Armement - Cherbourg`.
- Les futures lectures du fichier BBTM utilisent directement ce libellé.
- Le chargement du Planning évite les reconstructions répétées de l’ensemble des événements.
- Les périodes Supabase sont lues par pages de 1 000 lignes, soit deux requêtes pour l’import actuel au lieu de quatre.
- Le rendu des lignes hors écran est différé par le navigateur.

## Données

La migration `202607280001_normalize_armement_cherbourg.sql` harmonise les libellés historiques dans les tables Planning.

## Version

- application : `3.6.18`
- build : `2026-07-28.1648`
