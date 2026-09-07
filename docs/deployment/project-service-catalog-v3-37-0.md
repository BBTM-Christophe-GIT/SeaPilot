# Projets — catalogue et lignes multiples de prestations BBTM (v3.37.0)

Date de livraison : 6 septembre 2026.

## Fonctionnel

- La commande « Liste des prestations » est placée dans le ruban Projets, groupe « Facturation », à côté de « Éléments de facturation ».
- Le catalogue reprend la navigation maître/détail de la liste des clients. Une prestation contient une catégorie, un montant unitaire en euros HT et une description riche.
- Dans Facturation / Prestation BBTM, la catégorie est sélectionnée dans une liste déroulante. Le bouton `+` ouvre directement la création d’une catégorie.
- Une période peut contenir plusieurs prestations de catégories différentes. Chaque ligne conserve son tarif et sa description au moment de l’enregistrement et est reprise dans le PDF de facturation.
- Le sélecteur supérieur « Vue » a été retiré. L’application utilise toujours les rôles réellement affectés au compte.

## Sécurité et données

La migration `20260906213000_project_service_catalog_multi_billing.sql` :

1. crée `project_service_catalog` avec isolation par entreprise et RLS ;
2. réserve la création et la modification aux profils Administrateur et Direction ;
3. interdit la suppression physique via l’API et utilise un archivage logique ;
4. ajoute à `project_billing_services` la référence catalogue et la description figée ;
5. reprend les anciennes lignes « Spread Antipollution » sans perte de données.

## Ordre de déploiement

1. appliquer les migrations Supabase, notamment `20260906213000_project_service_catalog_multi_billing.sql` ;
2. exécuter `supabase test db` et contrôler `project_service_catalog_test.sql` ;
3. déployer le client `3.37.0` (`2026-09-06.009`) ;
4. vérifier avec un profil Administrateur puis Direction la création d’une prestation et l’ajout de deux catégories différentes sur une même période ;
5. vérifier qu’un profil Armement ne peut pas écrire directement dans le catalogue par l’API.

## Retour arrière

Le client précédent peut être redéployé sans supprimer la table de catalogue. Ne pas supprimer les colonnes ajoutées aux lignes de facturation : elles contiennent les instantanés utilisés pour les exports déjà produits.
