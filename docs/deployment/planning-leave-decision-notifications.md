# Planning — décisions de congés dans la cloche

Une demande de type Congés acceptée ou refusée crée une notification non lue pour
son émetteur (`requested_by`), y compris lorsque celui-ci a saisi la demande pour
une autre personne. La cloche affiche « Congés acceptés » ou « Congés refusés »,
le marin concerné, les dates et heures en Europe/Paris, et le commentaire éventuel.

La migration `20260910182329_planning_leave_decision_notifications.sql` complète le
trigger existant. Elle réutilise la notification et sa clé unique par destinataire,
demande et décision pour éviter les doublons. L'émetteur possède une entrée
`entity_kind = 'absence_decision'` ; les autres notifications Planning conservent
leur circuit. Une modification sans nouvelle décision ne réactive pas une
notification lue. Les anciennes décisions ne sont pas rejouées.

La cloche charge ces décisions via les règles RLS de `planning_notifications` :
uniquement le destinataire membre de la société. Elle actualise cette liste à
l'ouverture, au retour dans l'onglet, après une décision et toutes les 30 secondes
quand l'onglet est visible. Le lien « Voir le planning » ouvre le module et marque
la notification comme lue via la RPC protégée. Un échec du marquage conserve
la notification non lue.

## Déploiement et vérification

- Migration appliquée à SeaPilot avant le client. Aucune demande réelle modifiée
  et aucune notification historique envoyée.
- `supabase/tests/planning_leave_decision_notifications_test.sql` : test transactionnel
  réussi et annulé, avec profils Administrateur, Marin et Capitaine. Vérifie les deux
  décisions, le commentaire, les dates locales, l'émetteur distinct du bénéficiaire,
  l'absence de doublon et de réactivation, les droits de lecture et de marquage.
- 32 tests frontend ciblés réussis sur la cloche, les décisions et les requêtes Planning.
- Recette Playwright/Chrome à 1440 × 1000 et 390 × 844 : deux décisions visibles,
  commentaire de refus lisible, ouverture du Planning et compteur diminué après
  lecture. Aucun débordement ni erreur applicative. La préversion utilise des
  exemples ; elle ne sert pas à valider les droits des vrais comptes.
- Lint et build de production requis avant publication.
- Contrôle Supabase des avis de sécurité : aucun nouveau constat après la migration.

Pour revenir au comportement précédent, redéployer le client antérieur et restaurer
la version précédente de `planning_notify_absence`. Conserver les notifications et
leur état de lecture ; aucune suppression de données n'est nécessaire.
