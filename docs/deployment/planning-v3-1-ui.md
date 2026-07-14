# Planning v3.1 — déploiement du cockpit simplifié

Version cible : `3.1.0`.

## Périmètre

- deux vues principales, Flotte et Équipages ;
- commandes principales libellées, filtres repliables et outils regroupés ;
- liste persistante des marins non affectés en vue Flotte ;
- affectation provisoire par glisser-déposer sur un navire et un jour ;
- lieu libre par navire et par jour, sans afficher le nom ou la fonction du marin dans la vue Flotte ;
- défilement horizontal sur Jour, Semaine, Deux semaines, Mois et An ;
- cibles souris et tactiles adaptées à un ordinateur 15 pouces et à un iPad 12,9 pouces.

## Ordre de déploiement

1. Vérifier que les migrations distantes vont jusqu’à `202607140003_planning_p21_maritime_assistant.sql`.
2. Appliquer `202607140004_planning_fleet_daily_locations.sql` avant le client `3.1.0`.
3. Exécuter `supabase db lint --linked` puis `supabase db push --dry-run` : aucune migration ne doit rester après l’application.
4. Déployer le commit client et conserver les feature flags P2 dans leur état approuvé.

La migration est additive. Elle ne crée pas de table, ne réécrit aucune journée et ne supprime aucune donnée existante. Elle ajoute un index partiel et une RPC authentifiée qui s’appuie sur les politiques RLS et verrous P0.4 existants.

## Contrôles après déploiement

1. Ouvrir `/modules/planning` avec un rôle bureau autorisé.
2. Vérifier que Flotte est la vue initiale, que Navire et Marin ne sont plus proposés et que le panneau Marins non affectés reste visible.
3. Déposer un marin sur un jour libre d’un navire ; vérifier le message d’affectation provisoire et la présence de l’affectation dans Équipages.
4. Renseigner puis supprimer un lieu quotidien ; actualiser la page et vérifier la persistance.
5. Contrôler que les barres d’affectation, noms et fonctions des marins ne sont pas affichés dans la timeline Flotte.
6. Vérifier le défilement horizontal et le zoom sur les cinq échelles à 1440 × 900 et 1366 × 1024.
7. Confirmer qu’un rôle lecture seule ne peut ni déposer un marin ni modifier un lieu.
8. Confirmer qu’une période publiée refuse ces deux écritures côté interface et côté serveur.

## Retour arrière

1. Exporter les lignes `planning_days` dont `source_label = 'seapilot-vessel-location'`.
2. Après validation de l’export, supprimer uniquement ces lignes techniques, puis la fonction `public.save_planning_vessel_day_location(bigint, date, text)` et l’index `public.planning_days_vessel_location_unique_idx`.
3. Redéployer la version client `3.0.1`.

L’export est obligatoire : le client `3.0.1` ne connaît pas encore ce `source_label` et pourrait interpréter ces lignes sans marin comme des journées équipage incomplètes.
