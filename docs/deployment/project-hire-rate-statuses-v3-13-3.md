# Barème des loyers par statut — v3.13.3

Le barème contractuel conserve une période de validité, une devise et une unité communes, avec trois montants :

- **En Opération** ;
- **Stand-by** ;
- **Weather Stand-by**.

Les périodes historiques sont complétées avec leur ancien loyer pour les trois montants afin de préserver les calculs existants. Le loyer **En Opération** reste celui recopié par défaut dans une opération du Planning. Une surcharge manuelle de l’opération reste prioritaire.

Dans la facturation mensuelle, chaque ligne DPR sélectionne le montant de la période applicable à sa date : les libellés Weather Stand-by utilisent le loyer météo, les autres libellés Stand-by utilisent le loyer d’attente et toutes les autres activités utilisent le loyer En Opération. Un montant explicitement saisi dans le DPR reste prioritaire.

## Déploiement

1. Appliquer `supabase/migrations/20260811083603_project_hire_rate_statuses.sql`.
2. Vérifier que les colonnes `standby_hire` et `weather_standby_hire` sont renseignées pour toutes les périodes existantes.
3. Déployer le client web puis ouvrir **Projet > Modification > Offre commerciale** avec un profil Admin ou Direction.
4. Contrôler l’enregistrement de plusieurs périodes et la génération du PDF mensuel pour les trois activités.

La migration est additive pour les données. En cas de retour arrière du client, conserver les deux nouvelles colonnes : la RPC accepte encore un ancien payload et reprend alors le loyer En Opération pour les deux tarifs manquants.
