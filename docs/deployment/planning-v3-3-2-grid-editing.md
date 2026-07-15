# Planning v3.3.2 — édition directe de la grille

Version cible : `3.3.2`.

## Périmètre

- Un clic maintenu puis déplacé sur une ligne marin/navire peint le statut par défaut et enregistre toutes les cases au relâchement.
- Une case vide crée automatiquement une affectation native confirmée d'un jour sur le navire et la bordée de la ligne.
- Les cases adjacentes ne forment un segment visuel que si leur couleur et leur commentaire sont identiques.
- Le libellé de statut n'est plus affiché dans la grille ; seul le commentaire court reste visible.
- `Ctrl+C`, `Ctrl+X` et `Ctrl+V` copient ou déplacent les cases vers une autre ligne. Le couper-coller est transactionnel.
- `Suppr` et `Retour arrière` retirent les cases sélectionnées après confirmation.
- Un conflit est signalé sur chaque jour réellement superposé. L'utilisateur choisit la ligne prioritaire ; seuls les jours superposés des autres lignes sont retirés et la décision est historisée.
- Le clic droit conserve le menu de statut et de commentaire. Le formulaire complet reste réservé au double-clic.

## Données et sécurité

Migration à appliquer après toutes les migrations `20260714*` :

1. `202607150001_planning_grid_cell_editing.sql`

La migration ne crée aucune table métier parallèle. Elle réutilise `planning_assignments`, `planning_days` et `planning_change_log`, ajoute un index de recherche partiel et trois RPC :

- `apply_planning_grid_cells(jsonb)` ;
- `remove_planning_grid_cells(jsonb, text)` ;
- `move_planning_grid_cells(jsonb, jsonb, text)`.

Les RPC sont `security invoker`, limitées au rôle `authenticated`, réutilisent `planning_user_can`, les politiques RLS, le verrouillage des périodes publiées et la séparation par `company_id`. Un verrou transactionnel par entreprise sérialise les mutations concurrentes de la grille.

Les dates civiles sont stockées en `date` (`YYYY-MM-DD`). Les heures techniques d'une affectation créée automatiquement sont 08:00–20:00 en `Europe/Paris`, converties en `timestamptz`, y compris lors d'un changement d'heure.

## Contrôles avant déploiement

```powershell
npx tsc -b --pretty false
npm run lint
npm test
npm run build
supabase db push --linked
```

Variables requises, inchangées : `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. Les secrets Supabase et Vercel restent gérés dans leurs plateformes respectives.

## Contrôles après déploiement

1. Vérifier que l'interface affiche `v3.3.2`.
2. Sur une période non publiée, cliquer une case vide puis actualiser : l'affectation d'un jour doit rester visible.
3. Peindre trois jours, modifier le commentaire d'un seul jour au clic droit et vérifier la séparation en segments.
4. Tester `Ctrl+C`, `Ctrl+X`, `Ctrl+V`, `Suppr` et `Retour arrière` sur une autre ligne.
5. Provoquer une double affectation, choisir une ligne prioritaire et vérifier l'entrée correspondante dans Historique.
6. Vérifier en lecture seule qu'aucune mutation n'est disponible et qu'une période publiée reste verrouillée.

## Retour arrière

1. Redéployer le client `v3.3.1`.
2. Supprimer les fonctions dans cet ordre : `move_planning_grid_cells`, `apply_planning_grid_cells`, `remove_planning_grid_cells`.
3. Supprimer éventuellement `planning_assignments_grid_lookup_idx`.

Les affectations et états quotidiens créés avec v3.3.2 sont conservés : ils utilisent les tables P0 existantes et restent lisibles par v3.3.1.
