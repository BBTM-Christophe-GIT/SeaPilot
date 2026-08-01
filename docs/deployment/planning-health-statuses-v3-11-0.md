# SeaPilot v3.11.0 — états de santé du Planning

Date de livraison : 1er août 2026.

La fenêtre « Statut et commentaire » du Planning propose désormais six états quotidiens :

- En mer ;
- À terre ;
- Vacances ;
- Repos ;
- Arrêt Maladie ;
- Accident du Travail.

« Arrêt Maladie » est affiché en violet et « Accident du Travail » en orange. Ces couleurs sont conservées dans la
grille, lors d’une sélection multiple et après une opération de copie ou de déplacement de cases.

## Déploiement

1. Appliquer `supabase/migrations/20260801185157_planning_health_statuses.sql`.
2. Déployer le client SeaPilot v3.11.0.
3. Ouvrir le menu contextuel d’une case Planning et vérifier la présence des six états.
4. Enregistrer chacun des deux nouveaux états sur une journée puis sur un groupe de cases.
5. Actualiser la page et vérifier que le libellé, la couleur et le commentaire sont conservés.

La migration étend les validations des RPC existants `save_planning_assignment_day_state` et
`apply_planning_grid_cells` ; elle ne crée aucune table parallèle et ne modifie pas les autorisations Planning.
