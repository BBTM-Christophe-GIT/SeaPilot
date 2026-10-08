# Notes de service : synchronisation des destinataires navire

## Correction

Les affectations déjà présentes dans le Planning avant une diffusion, mais commençant après la date de la note, pouvaient être omises du registre. La cloche et les droits de lecture des profils Marin et Capitaine dépendent de ces lignes destinataires.

La résolution inclut désormais les affectations courantes et futures pour les notes émises durant l'année civile en cours. Les nouvelles affectations, périodes et journées ajoutent également le destinataire aux notes diffusées de son navire, même après l'émission. Le rattachement ultérieur d'un compte SeaPilot à une fiche RH déjà affectée déclenche la même synchronisation.

Les notes des années précédentes, archivées ou rappelées ne créent pas de nouvelle obligation par cette synchronisation. Les affectations annulées, l'émetteur, les fiches inactives et les personnes sans compte actif sont exclus. Aucun destinataire ni signature existante n'est supprimé.

## Migration et validation

Appliquer `supabase/migrations/20261008065846_sync_service_notes_all_planning_sources.sql`. La reprise ajoute les destinataires manquants aux notes diffusées de l'année en cours, sans réémettre les documents.

Le test `supabase/tests/service_note_all_planning_recipient_sync_test.sql` couvre la résolution avant diffusion, la synchronisation après émission, la limite annuelle, le rattachement tardif d'un compte et les lectures RLS avec des comptes Marin et Capitaine distincts. Exécuter également les tests Notes de service et le build de production avec pnpm 10.34.5.

## Contrôle du 8 octobre 2026

La migration est appliquée au projet SeaPilot. Pour `NS 09-26 — Opération de veille - Travaux Cordistes - Parc EMDT`, Pierre HARACHE, Pierre LEPRETRE et Emilien LAFFAITEUR figurent désormais en attente dans le registre. Le compte de Pierre HARACHE a été rattaché pendant l'intervention. Les lectures sous les identités authentifiées de chacun confirment l'accès à la note et une demande non signée pour la cloche. Le registre passe de six à neuf destinataires.

La reprise a ajouté six destinataires au total aux notes diffusées concernées. Les 199 signatures préexistantes sont inchangées et aucun destinataire existant n'a été supprimé. Les trois suites pgTAP passent avec 73 assertions, les tests du module avec 47 assertions, et le build de production réussit.
