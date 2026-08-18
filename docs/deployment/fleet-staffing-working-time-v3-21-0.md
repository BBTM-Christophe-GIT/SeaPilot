# SeaPilot 3.21.0 — BBTM - Flotte, effectif et validation quotidienne

## Périmètre

- Nouveau module `BBTM - Flotte` adossé à `public.vessels`, avec ajout, modification, retrait réversible et onglet `Décision d’effectif`.
- Référentiel source : liste SharePoint QHSE `BBTM - Flotte`, identifiant `543b9f00-aed2-489a-808a-7b64cc835a83`. Aucune table flotte concurrente n’est créée.
- Contrôle administrateur de la composition par navire, bordée et jour avant diffusion du Planning.
- Réassignation de la fonction Planning sur toute l’affectation continue, sans modifier `people.function_label`.
- Dérogation motivée possible uniquement pour un brevet, une qualification, une habilitation ou une formation manquante ; l’écart reste visible et audité.
- Validation quotidienne du temps de travail avec signature du déclarant et signature du Capitaine approbateur.

## Règles d’effectif

`planning_staffing_board_status` applique la Décision d’effectif active. Une décision absente, une fonction non confirmée, un minimum non atteint, un Capitaine absent ou plusieurs Capitaines éligibles bloquent la diffusion. Un effectif inférieur à la cible mais supérieur ou égal au minimum produit un avertissement administrateur. Le libellé RH exact `Capitaine` est la seule vérité d’éligibilité ; le rôle applicatif et les variantes de libellé ne sont pas utilisés.

`publish_planning_release` appelle le contrôle serveur sur les bordées futures. L’interface ne peut donc pas contourner un écart bloquant. `planning_staffing_derogations` conserve le navire, la bordée, la période, l’exigence, le justificatif et l’auteur.

## Temps de travail

`submit_working_time_day` exige une signature active du déclarant. Un Capitaine RH valide sa propre journée conforme ; un Marin transmet à l’unique Capitaine RH confirmé dans sa bordée. Une journée non conforme reste en attente jusqu’à la saisie par le Capitaine de la justification structurée. `validate_working_time_day_with_comment` enregistre cette justification et la validation dans une seule transaction. Admin et Armement conservent la validation de secours.

Les colonnes `subject_signature_snapshot` et `approver_signature_snapshot` figent les deux preuves séparément. Les anciennes cartes de plages sont retirées de l’écran : les plages enregistrées sont directement cliquables dans la frise pour corriger ou retirer.

## Déploiement

1. Appliquer `20260818120000_fleet_staffing_decisions_and_planning_guards.sql`.
2. Appliquer `20260818130000_working_time_dual_signatures_and_hr_captain_truth.sql`.
3. Déployer le client `3.21.0`.
4. En administrateur, vérifier la liste BBTM - Flotte, configurer au moins une Situation par navire, confirmer une bordée et tester le blocage de diffusion.
5. Tester une journée Capitaine, une journée Marin conforme et une journée Marin non conforme avec justification et deux signatures.

La recette des profils Marin et Capitaine doit s’appuyer sur les gardes RPC/RLS, le code conditionnel et les fixtures de rôle réelles. Les vues simulées depuis une session administrateur ne constituent pas une preuve de comportement.
