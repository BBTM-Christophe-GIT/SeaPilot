# Planning v3.1 — déploiement du cockpit simplifié

Version cible : `3.1.1`.

## Périmètre

- deux vues principales, Flotte et Équipages ;
- action principale renommée `Nouveau projet` ;
- arborescence Flotte repliable navire → bordée → marin, limitée aux navires ayant au moins un marin sur la période ;
- commandes principales libellées, filtres repliables et outils regroupés ;
- menu `Actions` de publication explicitant les commandes disponibles selon le statut et les permissions ;
- liste persistante des marins non affectés en vue Flotte ;
- affectation provisoire par glisser-déposer sur un navire et un jour ;
- lieu libre par navire et par jour ; le nom apparaît seulement au niveau marin et la fonction n’est pas répétée ;
- défilement horizontal sur Jour, Semaine, Deux semaines, Mois et An ;
- cibles souris et tactiles adaptées à un ordinateur 15 pouces et à un iPad 12,9 pouces.

## Ordre de déploiement

1. Vérifier que les migrations distantes vont jusqu’à `202607140003_planning_p21_maritime_assistant.sql`.
2. Appliquer `202607140004_planning_fleet_daily_locations.sql` avant tout client `3.1.x`.
3. Exécuter `supabase db lint --linked` puis `supabase db push --dry-run` : aucune migration ne doit rester après l’application.
4. Déployer le commit client et conserver les feature flags P2 dans leur état approuvé.

La migration est additive. Elle ne crée pas de table, ne réécrit aucune journée et ne supprime aucune donnée existante. Elle ajoute un index partiel et une RPC authentifiée qui s’appuie sur les politiques RLS et verrous P0.4 existants.

## Contrôles après déploiement

1. Ouvrir `/modules/planning` avec un rôle bureau autorisé.
2. Vérifier que Flotte est la vue initiale, que Navire et Marin ne sont plus proposés, que le panneau Marins non affectés reste visible et que `Nouveau projet` ouvre le formulaire projet.
3. Vérifier que seuls les navires ayant un marin sont affichés, puis replier/déplier un navire et une bordée.
4. Déposer un marin sur un jour libre d’un navire ; vérifier le message d’affectation provisoire et la présence de l’affectation dans l’arborescence et dans Équipages.
5. Renseigner puis supprimer un lieu quotidien ; actualiser la page et vérifier la persistance.
6. Ouvrir `Actions` et vérifier que les commandes proposées correspondent au statut et aux permissions courantes.
7. Vérifier le défilement horizontal et le zoom sur les cinq échelles à 1440 × 900 et 1366 × 1024.
8. Confirmer qu’un rôle lecture seule ne peut ni déposer un marin ni modifier un lieu.
9. Confirmer qu’une période publiée refuse ces deux écritures côté interface et côté serveur.

## Retour arrière

Pour annuler uniquement `3.1.1`, redéployer le client `3.1.0` sans modifier la base.

Pour annuler tout le lot `3.1` :

1. Exporter les lignes `planning_days` dont `source_label = 'seapilot-vessel-location'`.
2. Après validation de l’export, supprimer uniquement ces lignes techniques, puis la fonction `public.save_planning_vessel_day_location(bigint, date, text)` et l’index `public.planning_days_vessel_location_unique_idx`.
3. Redéployer la version client `3.0.1`.

L’export est obligatoire : le client `3.0.1` ne connaît pas encore ce `source_label` et pourrait interpréter ces lignes sans marin comme des journées équipage incomplètes.
