# Plan d'action — pilotage du traitement (v3.35.0)

## Changement livré

- ajoute un journal chronologique de traitement à chaque fiche approuvée ;
- permet aux responsables autorisés d'ajouter un commentaire, une pièce jointe ou de clôturer l'action ;
- horodate chaque entrée côté serveur et conserve l'identité de son émetteur ;
- applique les règles de lecture, d'affectation et de confidentialité existantes ;
- conserve le workflow d'approbation, les champs de traitement existants et les données KPI ;
- étend le bucket privé `action-plan-evidence` aux PDF, documents Word, feuilles Excel et fichiers texte, dans la limite existante de 10 Mo.

## Ordre de déploiement

1. appliquer `20260906113000_action_plan_admin_control_center.sql` si elle n'est pas encore présente ;
2. appliquer `20260906163000_action_plan_treatment_followup.sql` ;
3. déployer le client `3.35.0` ;
4. vérifier ensuite la création d'un commentaire, l'ouverture d'une pièce jointe et la clôture d'une action de recette.

Les migrations sont additives. En cas de retour arrière du client, la table de suivi peut rester en place : elle ne modifie pas les lectures ni les traitements des versions précédentes.

## Validation attendue

- une action approuvée affiche `Suivi du traitement` ;
- une entrée affiche son commentaire, son émetteur et sa date/heure ;
- une pièce jointe privée est ouvrable par un lecteur autorisé de la fiche ;
- un responsable affecté peut ajouter un suivi et clôturer l'action ;
- un utilisateur non affecté ne peut ni lire le journal confidentiel ni y écrire ;
- après clôture, le formulaire disparaît et l'historique reste consultable ;
- la version affichée par l'application est `3.35.0`.
