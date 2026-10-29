# Documents Projet affichés dans Opération en Mer

Version `3.80.15`, build `2026-10-29.001`.

Dans la fiche Projet, onglet **Documents**, la colonne **Opération en Mer** suit
le bouton **Ouvrir**. Chaque case enregistre immédiatement le choix pour ce
document, commun aux opérations du projet. Le bouton de gestion séparé et sa
fenêtre de sélection ont été retirés. Dans la fiche Opération en Mer, la section
**Documents** apparaît sous **1 Armement** ; ses liens restent consultables
dans les fiches signées ou en lecture seule.

## Comportement

- Tous les documents sont décochés sans configuration préalable. Chaque nouveau
  fichier commence décoché, y compris après une sélection enregistrée.
- Les choix explicitement enregistrés sont conservés. Décocher le dernier
  document conserve une sélection vide ; aucun affichage automatique n'est réactivé.
- Les contrats, offres commerciales, factures et leurs catégories descendantes
  sont exclus côté serveur. Aucune case n'est proposée pour ces documents ni pour
  les dossiers. Les documents contractuels importés sont également exclus.
- Les fichiers restent dans Projet ; la sélection ne les supprime pas, ne change
  pas leur classement et ne les ajoute pas aux PDF.
- Pendant une sauvegarde, les cases sont verrouillées. Un refus restaure le choix
  antérieur et affiche une erreur. Un ajout de document ou un changement de
  catégorie recharge le catalogue autorisé. Les réponses tardives ne sont pas
  appliquées à un autre projet, compte ou contexte de droits.

## Serveur et droits

La migration initiale est
`20261028224001_project_sea_operation_document_selection.sql`. La migration
additive `20261029060215_project_sea_operation_document_opt_in.sql` applique le
défaut décoché, renforce l'exclusion des contrats importés et ajoute la RPC
`set_project_sea_operation_document(p_project_id bigint, p_document_id text,
p_selected boolean)`. Elle ne réécrit aucune sélection existante.

La table privée `sea_operation_private.project_document_selections` contient une
ligne par projet, avec société, identifiants, auteur et date. La RLS est activée
et aucun accès direct n'est accordé à `anon` ou `authenticated`.

Le catalogue `project_sea_operation_documents` et la nouvelle RPC sont des
enveloppes SECURITY INVOKER. Les fonctions privées valident les droits de gestion
Projet admin/direction, l'appartenance à la société et l'état du projet. Les
projets clôturés sont consultables sans pouvoir changer les cases. Les profils
Marin et Capitaine peuvent consulter les documents retenus selon leurs droits
habituels, sans pouvoir modifier cette sélection.

La RPC atomique verrouille le projet avant de lire les identifiants, puis ne
modifie que le choix du document ciblé. Deux sessions ne remplacent donc pas
leurs choix indépendants avec des listes périmées. Les anciens endpoints de
lecture et de sauvegarde groupée restent compatibles.

Le résultat `{ configured, documents }` comprend les métadonnées autorisées et
`selected`, sans chemin privé ni URL. Les identifiants `generated:<id>` et
`project:<id>` sont contrôlés dans le projet et la société. La liste Opération
en Mer et l'ouverture d'un document utilisent le même filtre. La désélection
révoque les grants et la RLS Storage revalide l'accès ; les protections contre
les alias vers un fichier commercial sont conservées. Une URL Storage déjà
signée reste valide jusqu'à son expiration de cinq minutes. SharePoint conserve
ses propres droits.

## Validation et déploiement

Appliquer les deux migrations avant de déployer l'interface. Elles sont déjà
appliquées sur Supabase SeaPilot. Aucun secret, variable ou paquet supplémentaire
n'est nécessaire.

Les suites pgTAP vérifient 74 cas de sélection et 57 régressions documentaires,
notamment les vrais profils Marin/Capitaine/Armement, les autres sociétés,
catégories interdites, identifiants forgés et accès directs aux fichiers. Une
sonde sur la base distante valide 12 assertions sans extension pgTAP, dans une
transaction annulée par ROLLBACK. Les contrôles après sonde confirment qu'aucune
fixture ni sélection de projet existant n'a été créée.

Les tests React et requêtes couvrent les cases en ligne, le défaut décoché,
l'enregistrement immédiat, le clavier, les refus, les mises à jour concurrentes,
les changements de contexte, l'ordre des colonnes, l'exclusion des offres et la
position de Documents sous Armement. La préversion utilise ses propres documents
fictifs et conserve les choix en mémoire.

L'[information du linter RLS sans policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
est attendue pour cette table privée : aucun accès direct n'est accordé ; seules
les fonctions privées autorisées y accèdent.
