# Planning v3.3 — décisions d’effectif et bordées guidées

Version cible : `3.3.0`.

Pour une vérification locale sans authentification, utiliser uniquement `http://127.0.0.1:<port>/modules/planning?preview=1`. Le paramètre est ignoré sur tout hôte non local ; les préversions Vercel BBTM continuent à ouvrir directement l’application.

## Périmètre

- « Décision d’effectif » simplifiée autour de la Situation, du navire, des postes, des brevets et des prescriptions spéciales ;
- Situation limitée aux valeurs `Situation 1` à `Situation 6` ;
- brevets sélectionnés dans un catalogue STCW à choix multiple ;
- catalogue initial de 54 éléments importé de la liste SharePoint QHSE `8c8561d7-9fb4-420f-8290-b66309d07e92` référencée par `stcw_certificates.iqy` ;
- éléments RH, visite médicale et plan de formation conservés dans le référentiel mais exclus du sélecteur de brevets grâce à `is_credential = false` ;
- création d’une bordée à partir des postes de la décision d’effectif active du navire ;
- proposition limitée aux marins sans affectation chevauchante et dont les documents ou brevets de profil couvrent les exigences du poste ;
- dépôt d’un marin non affecté sur une ligne Bordée, ou sur le navire seulement lorsqu’il n’a encore aucune bordée ;
- statut quotidien par clic : vert `En Mer`, jaune `A Terre`, noir `Vacance`, rouge `Repos`, avec commentaire de 32 caractères maximum ;
- application possible au jour sélectionné ou à tout le groupe de cases ;
- poignées visibles aux deux extrémités des groupes, sans poignée à six points au centre ;
- suppression de l’éditeur de lieu d’`ARMEMENT - CHERBOURG` dans l’interface. Les anciennes lignes restent conservées et ignorées par cette vue.

Les colonnes historiques de `planning_manning_matrices` et `planning_manning_requirements` ne sont pas supprimées. L’interface fixe les effectifs minimum/cible à `1` par poste et vide seulement les champs retirés lors d’un nouvel enregistrement. Une décision existante n’est donc jamais réécrite par la migration.

## Données et sécurité

`public.stcw_certificates` est un référentiel global non rattaché à une entreprise. Il ne contient aucune donnée personnelle. Les utilisateurs authentifiés disposent uniquement de `SELECT`; les écritures sont réservées aux migrations. La RLS limite la lecture aux lignes actives.

`public.create_planning_board_assignments` fonctionne avec les droits de l’appelant. La fonction contrôle l’entreprise courante, l’autorisation `edit_event`, le navire actif, les marins actifs et l’absence d’affectation chevauchante. La création des postes sélectionnés est atomique : une anomalie annule toute la bordée.

`public.save_planning_assignment_day_state` réutilise les lignes techniques `planning_days` et l’index unique de la version 3.2. Le contrôle `edit_event` et le verrouillage des périodes publiées restent appliqués côté serveur.

## Ordre de migration

1. Vérifier que `202607140005_planning_assignment_daily_notes.sql` est appliquée.
2. Sauvegarder les tables `planning_manning_matrices`, `planning_manning_requirements`, `planning_assignments` et les lignes `planning_days` dont `source_label = 'seapilot-assignment-note'`.
3. Appliquer `202607140006_planning_stcw_board_daily_state.sql`.
4. Exécuter `supabase db lint --linked`.
5. Exécuter `supabase db push --dry-run` et confirmer qu’aucune autre migration inattendue n’est proposée.
6. Vérifier que le catalogue contient 54 lignes, dont 42 utilisables comme brevets :

   ```sql
   select count(*) as total, count(*) filter (where is_credential) as credentials
   from public.stcw_certificates;
   ```

7. Déployer le client `3.3.0`.

La migration est rejouable : table, index et politique sont idempotents, les fonctions sont remplacées et le catalogue est mis à jour par la clé `(source_list_id, source_item_id)`.

## Contrôles avant déploiement

1. TypeScript, ESLint, tests et build de production réussis.
2. Vérifier que la liste SharePoint source contient toujours 54 éléments (l’identifiant 36 est absent de la source).
3. Vérifier la RLS et les privilèges de `stcw_certificates`, `planning_days` et `planning_assignments`.
4. Vérifier qu’une décision active existe pour chaque navire devant utiliser la création guidée de bordée.
5. Tester à 1440 × 900 et 1366 × 1024, au clavier, à la souris et au tactile.

## Contrôles après déploiement

1. Ouvrir Décision d’effectif et contrôler les six Situations, le multisélecteur STCW et l’absence des anciens champs.
2. Créer une décision avec plusieurs postes et plusieurs brevets, actualiser et vérifier leur persistance.
3. Ajouter une bordée depuis un navire : chaque poste attendu doit apparaître avec uniquement les marins disponibles et compatibles.
4. Vérifier qu’un même marin ne peut pas être choisi sur deux postes et qu’un chevauchement forcé est refusé côté serveur.
5. Glisser un marin sur une bordée, puis vérifier qu’un navire possédant une bordée ne constitue plus une zone de dépôt.
6. Cliquer une case colorée, changer son statut et son commentaire, actualiser et vérifier la couleur et le texte.
7. Appliquer le même statut à tout un groupe, puis étirer et réduire le groupe avec les deux poignées.
8. Confirmer qu’aucun lieu n’est affiché sur la ligne `ARMEMENT - CHERBOURG`.
9. Vérifier qu’un rôle lecture seule ne peut créer ni bordée ni état quotidien.

## Retour arrière

1. Exporter `public.stcw_certificates` et les nouvelles lignes quotidiennes avant toute suppression.
2. Supprimer les fonctions `public.create_planning_board_assignments(bigint, text, date, date, jsonb)` et `public.save_planning_assignment_day_state(bigint, date, text, text)`.
3. Redéployer le client `3.2.1`.
4. Conserver `stcw_certificates` si un autre module l’utilise ; sinon seulement, supprimer sa politique, son index puis la table.
5. Ne pas supprimer les affectations créées par une bordée sans validation métier : elles sont des affectations P0 natives et restent compatibles avec la version précédente.
6. Les lignes `seapilot-assignment-note` restent compatibles avec la migration 3.2 ; restaurer leur sauvegarde uniquement si un contrôle fonctionnel démontre une perte.
