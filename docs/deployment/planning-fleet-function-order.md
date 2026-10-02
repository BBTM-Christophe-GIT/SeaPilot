# Ordre des fonctions dans la vue flotte

Dans **Administration → Planning → Ordre des marins dans les bordées**, le réglage de l’ordre des fonctions définit la position des marins à l’intérieur de chaque bordée dans la vue flotte du planning. Une seule liste couvre les fonctions RH permanentes et les fonctions temporaires portées par les affectations. La fonction temporaire en vigueur à la date de référence sélectionnée dans le planning prend la priorité sur la fonction permanente pour ce tri.

Les fonctions absentes de la liste suivent les fonctions classées. À fonction effective égale, le tri conserve les critères existants : chronologie des affectations, fonction et nom. Les autres vues du planning conservent leur tri. Une liste vide maintient l’ordre existant.

## Suppression du filtre actif

Le bouton **Filtre actif** du Planning et son réglage dans Administration sont supprimés. Le planning ne masque plus les marins selon l’existence d’une affectation en cours ou à venir. Les filtres explicites restent disponibles et les règles d’éligibilité et de lecture par profil restent appliquées.

Les anciennes préférences personnelles et d’entreprise n’ont plus d’effet sur l’affichage, même si leur valeur enregistrée était activée. Le client ne lit ni ne modifie `planning_display_settings` ou `planning_personal_display_settings` et n’appelle plus leurs RPC d’enregistrement. Ces tables, leurs données et leurs RPC historiques restent conservées ; leur suppression n’est pas nécessaire pour retirer le fonctionnement du filtre.

## Base de données

Appliquer la migration `20261002045601_planning_fleet_function_order.sql` avant de publier le client. Elle crée `public.planning_fleet_display_settings` avec une liste `function_order text[]` par entreprise. Le client lit uniquement la configuration de son entreprise active.

La RPC `save_planning_fleet_display_settings(p_function_order text[])` retourne la ligne enregistrée. Elle vérifie le profil Admin de l’entreprise active, retire les espaces autour des libellés et refuse les libellés vides, nuls ou en double, y compris les variantes de casse et d’accents. Elle accepte une liste vide pour rétablir le tri existant.

La table applique RLS. Les vrais profils Admin, Direction, Armement, Capitaine et Marin peuvent lire le réglage de leur entreprise. Les écritures sont réservées à Admin, également pour les accès directs à la table. La RPC reste `SECURITY INVOKER` pour conserver ces contrôles. Aucune permission d’accès anonyme ou de suppression n’est ajoutée.

## Vérification

Le test `supabase/tests/planning_fleet_function_order_test.sql` utilise des comptes distincts Admin, Direction, Armement, Capitaine et Marin, ainsi qu’un Admin d’une autre entreprise. Il couvre la persistance, la validation des libellés, la lecture par les profils réels, le refus des écritures et l’isolation des entreprises.

Exécuter :

```powershell
supabase test db --local supabase/tests/planning_fleet_function_order_test.sql
```

## Retour arrière

Pour rétablir le tri existant, un administrateur de l’entreprise active peut enregistrer une liste vide par la RPC :

```sql
select public.save_planning_fleet_display_settings('{}'::text[]);
```

Si un retour au client précédent est nécessaire, rétablir son déploiement et conserver la table et la RPC. La migration est additive ; leur présence n’altère pas le comportement du client précédent.
