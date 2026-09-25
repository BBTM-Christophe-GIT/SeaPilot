# Validation quotidienne et attribution des alertes

## Correction

Une fenêtre de repos non conforme calculée avant la première plage de travail
d'une journée pouvait bloquer sa validation, alors que l'interface rattachait
correctement l'alerte à la dernière journée travaillée dans cette fenêtre.
Le contrôle SQL, la justification et l'instantané de validation utilisent
désormais tous cette dernière journée contributrice, par type de seuil
(24 heures ou 168 heures).

Le chargement du registre parcourt toutes les pages de calculs, périodes,
commentaires, signatures et approbations, avec un tri stable par identifiant.
Une erreur de page interrompt le chargement plutôt que de présenter des
alertes incomplètes. Les sept jours de contexte autour du mois permettent de
conserver l'attribution aux limites mensuelles ; ils ne gonflent pas le total
du mois. La politique affichée provient du calcul serveur effectif.

## Déploiement

Appliquer `20260925100533_align_working_time_daily_compliance.sql` avant le client.
La migration est appliquée au projet SeaPilot lié. Elle ne réécrit ni les heures,
ni les signatures, ni les approbations historiques.

Le nouveau helper SQL reste interdit à `anon` et `authenticated`. Les RPC
publiques conservent leurs contrôles de société, de Capitaine affecté,
de signature active et de justification complète pour la journée concernée.

## Vérifications

- `corepack pnpm test src/features/workingTime` : 106 tests passent, dont la
  pagination au-delà de 1 000 calculs / 2 000 approbations, l'échec d'une page,
  l'approbation par le Capitaine et l'attribution entre deux mois.
- `working_time_daily_attribution_test.sql` : 20 assertions passent avec des
  profils Marin, autre Marin et Capitaine authentifiés, des signatures et des
  affectations Planning propres aux fixtures. Toute la transaction est annulée.
- `working_time_daily_approval_test.sql` : 17 assertions passent sur les
  permissions et les points d'entrée du workflow quotidien.
- `corepack pnpm build` et ESLint ciblé passent. Les avertissements de taille
  de bundles et d'import dynamique de documents projets sont préexistants.
- Playwright avec Edge, sur fixture locale du composant et sans mode aperçu :
  chargement, zéro alerte le lendemain, clic « Valider la journée », confirmation
  et clôture visibles. Console sans erreur ; rendus bureau (1518 × 1100) et
  mobile (390 × 844). Les droits réels sont vérifiés par les tests SQL ci-dessus.
- Contrôle en lecture seule du cas signalé : l'écart calculé le 24 septembre
  2026 à 03:00, avant le premier travail, est rattaché au 23 septembre.
  Le 24 n'exige plus de justification et reste soumis à l'approbation humaine.
- Les signatures et instantanés des journées déjà validées restent inchangés.

## Retour arrière

Restaurer les deux anciennes fonctions depuis les migrations
`20260814120743_working_time_daily_approvals_and_dpr_planning_scope.sql` (helper)
et la définition de `validate_working_time_day` avant cette migration, en
conservant les évolutions ultérieures de droits. Ne pas réappliquer intégralement
les anciennes migrations de workflow. Le frontend paginé reste compatible.
