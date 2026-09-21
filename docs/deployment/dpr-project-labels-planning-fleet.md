# DPR et Planning des profils terrain — v3.46.0

Le tableau DPR résout les codes et titres des projets historiques via `dpr_report_projects()`, limité aux rapports que le compte authentifié peut lire dans sa société active. La table commerciale `projects` reste protégée. Le contexte du projet du jour et le catalogue commercial autorisé sont fusionnés sans doublons. Un projet lié dont le libellé serait indisponible est affiché comme « Projet #ID », jamais « Sans projet ».

Les profils Capitaine et Marin peuvent consulter tous les navires de leur société dans la dernière version diffusée du Planning. Les navires actifs sans événement sont également affichés. À l'ouverture, le navire de l'affectation du jour est sélectionné ; sans affectation actuelle, tous les navires sont affichés. Le filtre permet de choisir un autre navire ou « Tous les navires » et conserve ce choix pendant la navigation et le rafraîchissement. Les droits d'édition, les demandes de congés personnelles, le filtrage des dérogations et la suppression des montants commerciaux sont conservés. Les politiques d'accès au brouillon Planning et aux données RH ne sont pas élargies.

## Déploiement

Appliquer `20260921121717_dpr_project_labels_and_planning_fleet_read.sql` avant le client. Migration appliquée à SeaPilot le 21 septembre 2026. Aucun DPR ni rattachement projet n'est modifié.

## Vérifications

- Avant correction, le compte réel Arthur MAREST pouvait lire 947 DPR liés à 22 projets, avec zéro ligne dans le catalogue commercial. Après migration : 22 libellés résolus, zéro DPR lié sans libellé ; catalogue commercial toujours inaccessible.
- `supabase/tests/dpr_projects_planning_fleet_test.sql` utilise des comptes authentifiés Capitaine et Marin, deux sociétés et une transaction annulée : projets autorisés/historiques, refus des projets sans DPR autorisé, lecture de toute la flotte publiée, dernière diffusion uniquement, absence de montants, refus de publication, isolation entre sociétés et refus anonyme.
- Tests React : filtrage initial, changement de navire, totalité de la flotte, persistance du choix après rafraîchissement et absence d'actions d'édition pour chaque profil réel. Aucun profil simulé depuis une session administrateur ne sert de preuve d'accès.

## Retour arrière

Revenir au client précédent, supprimer la politique `vessels_field_planning_fleet_read` et restaurer `planning_visible_release_snapshot` depuis la migration `20260811090335_planning_captain_sailor_readonly.sql`. Supprimer `dpr_report_projects()` après retour au client précédent. Aucune restauration de données métier n'est nécessaire.
