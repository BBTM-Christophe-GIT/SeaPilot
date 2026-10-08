# Audit de cohérence visuelle des modules SeaPilot

Date : 7 octobre 2026. Base inspectée : `origin/main`, commit `062ce19` (version 3.67.9), dans le worktree propre de la demande.

## Périmètre et niveau de preuve

Cet inventaire couvre les 37 entrées de `APP_MODULES`, les trois sous-routes de Levage, le parcours destinataire des entretiens et les surfaces transversales de connexion, d'aide et de dialogue. Les constats ci-dessous proviennent du code et des feuilles de style actuels. Ils identifient des écarts mesurables de couleurs, typographie, espacements et composants ; ils ne constituent pas des observations de captures d'écran.

La vérification visuelle a été menée sur la version publiée de référence, puis sur la préversion corrigée, avec captures enregistrées et inspectées. La section finale distingue les observations visuelles, les tests et leurs limites. Les captures d'une préversion administrateur prouvent l'apparence de cette préversion uniquement. Elles ne prouvent pas l'interface d'un compte Marin ou Capitaine réel.

La demande porte uniquement sur la présentation. Aucun contrôle, droit, champ métier, filtre, action, route, information ou étape du workflow ne doit être ajouté, supprimé, déplacé vers un autre parcours ou réinterprété.

## Inventaire complet

Sources de l'inventaire : `src/features/permissions/moduleAccess.ts`, `src/App.tsx`, composants de page et CSS correspondants. Les clés sont aussi les chemins `/modules/<clé>`, sauf l'accueil qui est `/` et le registre de levage dont la route racine redirige vers `/modules/lifting/apparaux`.

| Nº | Module / clé | Racine et en-tête existants | CSS principale et particularité à conserver |
| --- | --- | --- | --- |
| 1 | Accueil / `home` | `.manager-home-page`, `.manager-home-intro` | `home/ManagerHomeDashboard.css`, `home/managerHomeVessels.css` ; contenu dépendant du rôle et du périmètre |
| 2 | Politique QHSE / `qhsePolicy` | `.qhse-policy-page`, `.qhse-policy-page__header` | `qhsePolicy/qhsePolicy.css` ; document officiel et pièces jointes gardent leur mise en page |
| 3 | KPI / `kpi` | `.kpi-page`, `.kpi-page-head` | `kpi/kpiReports.css` ; graphes, métriques, options et rapports conservés |
| 4 | Produits Chimiques / `chemicals` | `.chem-page`, `.chem-header` | `chemicals/chemicals.css` ; tableau large, pictogrammes de danger et fiches de sécurité conservés |
| 5 | Registre des Exercices / `emergencyExercises` | `.exercise-page`, `.exercise-header` | `emergencyExercises/emergencyExercises.css` ; tableau et graphe du carnet conservés |
| 6 | Registre LSA / `lsa` | `.lifting-page.lsa-page`, `.lifting-heading` | `lifting/lifting.css`, `lsa/lsa.css` ; échéances, arbre de désignations, documents et permissions conservés |
| 7 | Certificats flotte / `certificates` | `.fcx-page`, `.fcx-hero.fcx-compact-hero` | `styles/index.css`, `fleetCertificates/fleetCertificateVersions.css` ; ruban, bibliothèque, visites et statuts documentaires conservés |
| 8 | Procédures QHSE / `procedures` | `.procedures-page`, `.procedure-hero` | `styles/index.css`, `procedures/procedureList.css`, `procedureGoogleDrive.css` ; source privée, PDF diffusé et publication conservés |
| 9 | Notes de Service / `serviceNotes` | `.service-notes-page`, `.service-notes-hero` | `serviceNotes/serviceNotes.css` ; éditeur, signatures, diffusion et document A4 conservés |
| 10 | Plan d'Action / `actionPlan` | `.action-plan-page`, `.action-control-page-header` | `actionPlan/actionPlan.css`, `actionPlanNavigation.css` ; navigation flotte, traitement et validation conservés |
| 11 | QHSE documentaire / `qhse` | `.qhse-page`, `.qhse-page > .admin-header` | `styles/index.css` ; route masquée de la navigation principale, bibliothèques et permis conservés |
| 12 | OVID / `ovid` | `.documentary-audits-page`, `.da-header` | `documentaryAudits/documentaryAudits.css` ; même composant avec `kind="ovid"` |
| 13 | eCMID / `ecmid` | `.documentary-audits-page`, `.da-header` | même composant avec `kind="ecmid"` |
| 14 | Audit ISM Externe / `externalIsmAudits` | `.documentary-audits-page`, `.da-header` | même composant avec `kind="external_ism"` |
| 15 | Audit ISM Interne / `internalAudits` | `.internal-audits-page`, `.ia-page-header` | `internalAudits/internalAudits.css` ; trames, participants et traitements assignés conservés |
| 16 | Audit Client / `clientAudits` | `.documentary-audits-page`, `.da-header` | même composant avec `kind="client"` |
| 17 | Daily Progress Report / `dpr` | `.dpr-native`, `.dpr-native__header` | `styles/index.css` ; saisie par étapes, aperçu et production PDF conservés |
| 18 | Projets / `projects` | `.projects-page.project-design`, `.project-module-header` | `projects/ProjectDesign.css`, `ProjectWorkspace.css`, `ProjectSheet.css` ; l'en-tête est volontairement masqué en dossier, ne pas le réafficher |
| 19 | Navires / `fleet` | `.fleet-page`, `.fleet-page-heading` | `styles/index.css` ; annuaire, fiches, photos et onglets conservés |
| 20 | Demande d'Achat / `purchaseRequests` | `.purchase-page.purchase-workspace`, `.purchase-topbar` | `styles/index.css` ; ruban, files, approbation, prise en charge et réception conservés |
| 21 | Gestion des Sous-Traitants / `serviceProviders` | `.service-providers-page`, `.service-providers-command-header` | `styles/index.css` ; annuaire, contacts, spécialités et actions conservés |
| 22 | Notes de frais / `expenseNotes` | `.expense-page`, `.expense-header` | `expenseNotes/expenseNotes.css` ; ruban, saisie en accordéon, véhicules, justificatifs et envoi conservés |
| 23 | Éléments de facturation / `billingElements` | `AppDialog`, `.billing-elements-workspace` | `styles/index.css`, styles de facturation Projets ; présentation en dialogue plein écran et route masquée conservées |
| 24 | Planning / `planning` | `.planning-workspace`, `.planning-command-header` | `styles/index.css`, CSS `planning/*` ; densité, géométrie des jours, grille, déplacements et couleurs métier conservés |
| 25 | RH / Brevets / `humanResources` | `.hr-page`, `.hr-command-header` | `styles/index.css`, `humanResources/hrDocumentActions.css`, `personPhotos.css` ; dossier personnel Marin et bordée Capitaine restent distincts |
| 26 | Organigramme / `organigramme` | `.org-page`, `.org-header` | `organigramme/organigramme.css` ; zoom, canvas, contacts, options et documents conservés |
| 27 | Entretien Professionnel et d'Evaluation / `annualReviews` | `.annual-review-page`, `.annual-review-command-header` | `annualReviews/annualReviews.css` ; entretien confidentiel, réponses et parcours destinataire conservés |
| 28 | Suivi du Temps de travail / `workingTime` | `.working-time-page`, `.working-time-command-bar` | `styles/index.css` ; le `h1` est masqué avec `.sr-only`, ne pas introduire de titre visible ou modifier la grille temporelle |
| 29 | Sanctions Disciplinaires / `disciplinary` | `.disciplinary-page`, `.disciplinary-page-header` | `disciplinary/disciplinary.css` ; confidentialité, collaboration, courriers et statut conservés |
| 30 | Marad / `marad` | `.module-page`, titre `h1` existant | `styles/index.css` ; page d'attente existante, aucune implémentation fonctionnelle à ajouter |
| 31 | Documents Techniques / `technicalDocuments` | `.module-page`, titre `h1` existant | `styles/index.css` ; page d'attente existante, aucune implémentation fonctionnelle à ajouter |
| 32 | Levage / `lifting` | `.lifting-page`, `.lifting-heading` | `lifting/lifting.css`, `liftingNavigation.css` ; racine redirigée et trois sous-routes existantes |
| 33 | Bibliothèque Réglementaire / `regulatoryLibrary` | `.reg-library`, `.reg-library__header` | `regulatoryLibrary/regulatoryLibrary.css` ; catégories, liens officiels et veille conservés |
| 34 | Sécurité Maritime / `regulatorySafety` | `.reg-library`, `.reg-library__header` | même composant, catégorie `safety` et lien de retour conservés |
| 35 | Code des Transports / `regulatoryTransport` | `.reg-library`, `.reg-library__header` | même composant, catégorie `transport` et lien de retour conservés |
| 36 | Liens utiles / `usefulLinks` | `.useful-links`, `.useful-links__header` | `usefulLinks/usefulLinks.css` ; répertoire, catégories, filtres et accès conservés |
| 37 | Administration / `admin` | `.admin-page`, `.admin-page-heading` | `admin/adminSections.css`, `adminCollaborators.css`, `adminFleetOrder.css`, `styles/index.css` ; configuration et permissions conservées |

Sous-routes à vérifier séparément : `/modules/lifting/apparaux`, `/modules/lifting/remorques`, `/modules/lifting/grue`, toutes dérivées de `liftingSections.ts` ; `/annual-review/:reviewId`, qui utilise le mode destinataire de la page d'entretien.

Surfaces transversales : `/login`, `/auth/update-password` (`.login-page`, `.login-panel`) ; `/manual/:moduleKey?` (`.user-manual`, `.manual-header`) ; `AppShell` (`.sidebar`, `.topbar`, `.content-area`, `.user-avatar`) ; `ModuleRibbon`, `AppDialog` et `AppContextMenu`. Les fichiers d'export PDF/Word/Excel et les feuilles de style de document restent hors normalisation du chrome applicatif.

## Constats du code

1. **Trois noirs différents dans le cadre applicatif.** `styles/index.css` donne à `.sidebar` un fond `#030303` avec un halo radial bleu et à `.topbar` un fond `#050505`. `components/SeaPilotLogo.css` donne à `.seapilot-logo` le noir `#000`. Un token de cadre noir `#000` et un fond uni éliminent cette différence sans changer la navigation.
2. **Pas de palette sémantique commune.** L'action primaire utilise notamment `#0c5598` en KPI/Disciplinaires, `#0964d9` en Projets, `#3f63e9` en DPR, `#0b7d86` en Audits, `#126d7c` en Notes de frais, `#12364b` en Organigramme et `#16394b` en Levage. Un même rôle visuel prend donc plusieurs couleurs sans raison métier. Les couleurs d'état et les accents de familles, eux, portent une information à préserver.
3. **Hiérarchie des titres variable.** `.fleet-page-heading h1` vaut 24 px, `.kpi-page h1` 25 px, `.org-header h1` 27 px, les modules QHSE/Exercices/Chimie 28 px, Projets et Levage 30 px, tandis que `.reg-library__header h1` monte à 40 px. Les sous-titres varient de 12 px à 19 px. Ces différences doivent être résolues sur les titres de page déjà présents, sans changer les titres des documents ou des fiches.
4. **Familles typographiques différentes.** Le socle choisit Inter avec des polices système de secours ; `.reg-library` impose Aptos. Aptos reste justifié à l'intérieur des documents mis en page, mais le chrome des modules doit hériter de la famille commune.
5. **Gouttières cumulées.** `.content-area` applique 18 px, puis certains modules ajoutent 22–32 px : Certificats, Politique QHSE, Chimie, Levage, Bibliothèque, Liens utiles, Sous-Traitants et Notes de service. D'autres utilisent immédiatement le bord du contenu. Les en-têtes et outils sautent horizontalement à chaque changement de module. Définir un seul niveau responsable de la gouttière règle ce problème ; les espacements internes des documents et tableaux restent indépendants.
6. **Surfaces et rayons hétérogènes.** Les contrôles vont de 5–6 px à 12 px de rayon ; les panneaux vont de 7–8 px à 15–16 px. Les ombres sont absentes, légères ou assez accentuées selon le module. Les panneaux de même rôle peuvent partager bordure, rayon et ombre, sans imposer une même grille à des tâches différentes.
7. **Sélections et focus différents.** Les onglets utilisent une barre inférieure, une pilule, un aplat sombre ou un aplat teal. Les contours de focus utilisent plusieurs teintes et épaisseurs. Le changement ne doit porter que sur la représentation des états déjà déclenchés par `aria-selected`, `aria-pressed`, `aria-current` ou `.is-active`.
8. **Rubans partiellement mutualisés.** `ModuleRibbon` utilise les classes `.planning-module-toolbar`, `.planning-ribbon-*` ; Planning, Achats, Certificats et Notes de frais partagent déjà cette base. Les outils Temps de travail, Projets et Procédures restent spécifiques. Les apparences peuvent être alignées, mais l'organisation, les groupes, le nombre de lignes et les commandes doivent rester identiques.
9. **Photo utilisateur existante non représentée dans le shell.** Le déclencheur du menu utilisateur rend seulement les initiales dans `.user-avatar`. `CurrentPersonSummary` ne transporte actuellement pas de photo. La RH dispose déjà d'un modèle et d'un affichage de portraits ; la photo du compte doit réutiliser la source autorisée existante, avec les initiales comme repli, sans introduire d'écran ou d'action de gestion de photo.

## Règle de cohérence proposée

Le design commun définit des **rôles visuels**, pas une composition métier unique. Les futurs modules reprennent les tokens du socle et les composants partagés ; leur disposition peut varier quand les données ou les tâches l'exigent.

| Rôle | Convention du socle |
| --- | --- |
| Cadre / marque | Noir `#000` partagé par la sidebar, la topbar et le support du logo |
| Fond de l'application | Gris clair `#f3f6f9`, surface principale blanche, surface secondaire légèrement teintée |
| Texte | Texte `#182132`, titres `#111827`, texte secondaire `#536276` ; pas de nouvelle couleur de texte par module |
| Action primaire | Bleu `#0c5598`, focus `#0c66b7` et couleur de survol commune ; les actions dangereuses conservent leur rouge |
| Titres de page existants | Même famille, taille 28 px sur grand écran et 24 px sur mobile, graisse et interligne communs |
| Sous-titres | 14 px, couleur secondaire et interligne 1,5 ; les textes de tableau gardent leur densité utile |
| Espacements | Échelle de 4 px ; gouttière applicative commune, marges internes régulières de 12/16/20/24 px selon le rôle |
| Contrôle standard | Rayon 6 px, bordure commune, hauteur cible 40 px ; pas d'application automatique aux cellules denses, commandes de ruban ou contrôles de document |
| Panneau | Surface blanche, bordure commune, rayon 8 px ; ombre légère réservée aux surfaces nécessitant une séparation |
| Onglet / sélection | Token bleu de sélection, fond légèrement teinté, focus visible ; l'indicateur existant reste dans sa forme et son emplacement |
| Dialogue / menu | Réutiliser `AppDialog` / `AppContextMenu` quand ils existent ; apparence alignée des dialogues spécifiques sans réécrire leurs interactions |
| État métier | Conserver réussite, danger, urgence, retard, statut de document, pictogrammes de risque et codes couleur des affectations |

La feuille de normalisation doit s'appuyer sur une liste explicite de sélecteurs existants, chargée après les styles de module. Elle ne doit pas appliquer un changement général à tous les `button`, `h2`, `img`, `table` ou éléments sélectionnés de l'application. Les dimensions métier de la grille Planning et des frises Temps de travail sont des exceptions documentées.

Les futurs modules doivent : réutiliser les tokens au lieu d'ajouter des valeurs hexadécimales pour le chrome ; conserver un en-tête, un panneau et des actions sémantiquement identifiables ; employer les états accessibles déjà utilisés par les composants communs ; justifier dans la documentation toute exception de densité ou de couleur métier. Une mise à jour d'un token commun doit être vérifiée sur plusieurs familles de modules.

## Sélecteurs explicites pour une correction sans changement de fonction

Les racines et en-têtes du tableau précédent sont la liste de référence. Les ensembles suivants complètent les en-têtes pour les surfaces récurrentes.

- **Rubans et outils :** `.planning-module-toolbar`, `.planning-ribbon-scroll`, `.planning-ribbon-group`, `.planning-ribbon-command`, `.purchase-module-toolbar`, `.fcx-certificates-ribbon`, `.working-time-command-bar`, `.working-time-command-group`, `.project-workspace-actions`, `.procedure-toolbar`, `.chem-toolbar`, `.exercise-filters`, `.org-document-toolbar`, `.useful-links__toolbar`, `.kpi-filters`.
- **Panneaux :** `.admin-panel`, `.manager-home-summary`, `.kpi-panel`, `.kpi-metrics`, `.ia-panel`, `.da-workspace`, `.annual-review-list-panel`, `.annual-review-workspace`, `.disciplinary-people`, `.disciplinary-main`, `.disciplinary-procedure`, `.fcx-workspace-card`, `.fleet-roster`, `.fleet-detail`, `.fleet-manning-panel`, `.hr-roster-panel`, `.hr-signature-panel`, `.service-provider-directory`, `.service-provider-profile`, `.service-note-workspace`, `.chem-inventory`, `.exercise-report`, `.expense-vessel`, `.org-controls`, `.org-canvas-panel`, `.org-inspector`, `.lifting-fleet`, `.lifting-content`, `.procedure-library`, `.project-design .project-contract-workspace .project-detail.project-contract-sheet.project-dossier`.
- **Onglets et sélecteurs de vue :** `.kpi-tabs`, `.ia-tabs`, `.da-tabs`, `.disciplinary-tabs`, `.fcx-workspace-tabs`, `.fleet-tabs`, `.fleet-kind-tabs`, `.project-detail-tabs`, `.purchase-tabs`, `.service-note-status-tabs`, `.working-time-side-tabs`, `.org-tabs`, `.org-document-tabs`, `.expense-tabs`, `.lifting-tabs`, `.lifting-view-switch`, `.useful-links__filters`. Préserver leurs mécanismes `aria-*` et leurs compteurs.
- **Actions primaires connues :** `.admin-primary-button`, `.hr-primary-button`, `.kpi-button.is-primary`, `.disciplinary-page button.disciplinary-primary`, `.dpr-native .button--primary`, `.qhse-policy-button` sauf `.is-secondary`/boutons icône, `.chem-primary`, `.exercise-export`, `.expense-button--primary`, `.org-page button.org-primary`, `.reg-button--navy`, `.reg-button--review`, `.lifting-page .primary-button`, `.service-provider-primary`, `.service-notes-hero > button`, `.service-note-editor-footer .is-primary`, `.useful-links__actions .is-primary`, `.procedure-primary-action`, `.procedure-button-primary`, `.app-dialog__footer button.is-primary`. En Audits, Actions et Entretiens, la base `button` est primaire et plusieurs listes/boutons d'icône la surchargent : aligner les tokens locaux et les sélecteurs d'action, pas tous les boutons à l'aveugle.
- **Champs de filtres :** `.planning-filter-panel`, `.purchase-modern-filters`, `.procedure-filter-bar`, `.hr-filter-panel`, `.qhse-policy-filters`, `.chem-search`, `.exercise-filters`, `.expense-filters`, `.useful-links__search`, `.service-provider-filters`, `.lifting-register-filters`, `.dpr-native__filters`. Préserver checkbox/radio et tailles adaptées aux tableaux ou à la saisie spécialisée.
- **Éléments transversaux :** `.sidebar`, `.topbar`, `.seapilot-logo`, `.user-avatar`, `.app-dialog`, `.app-dialog__header`, `.app-dialog__content`, `.app-dialog__footer`, `.app-context-menu`, `.login-panel`, `.manual-header`.

Les noms sont un inventaire de points de normalisation, pas une instruction de modifier tous leurs styles : un selector composite peut avoir une règle plus spécifique dans une feuille de fonctionnalité. Le contrôle dans le navigateur doit confirmer le style calculé final.

Les tokens de module existants peuvent servir d'adaptateurs au socle :

| Racine | Couleurs d'action | Texte / secondaire / bordure / surface |
| --- | --- | --- |
| `.manager-home-page` | `--manager-blue`, `--manager-navy` | `--manager-heading`, `--manager-ink`, `--manager-muted`, `--manager-border` |
| `.action-plan-page` | `--ap-blue` | `--ap-ink`, `--ap-muted`, `--ap-line`, `--ap-surface` |
| `.internal-audits-page` | `--ia-teal` | `--ia-ink`, `--ia-muted`, `--ia-line` |
| `.documentary-audits-page` | `--da-teal` | `--da-ink`, `--da-muted`, `--da-line` |
| `.kpi-page` | `--kpi-blue` | `--kpi-ink`, `--kpi-muted`, `--kpi-line` |
| `.fcx-page` | `--fcx-blue` | `--fcx-navy`, `--fcx-muted`, `--fcx-border` |
| `.fc-page` | `--fc-blue` | `--fc-ink`, `--fc-muted`, `--fc-border` |
| `.purchase-page.purchase-workspace` | `--purchase-blue`, `--purchase-teal` | `--purchase-navy`, `--purchase-ink`, `--purchase-muted`, `--purchase-border` |
| `.service-notes-page`, `.service-note-editor` | `--sn-blue`, `--sn-teal` | `--sn-navy`, `--sn-muted`, `--sn-border`, `--sn-pale` |
| `.lifting-page` | Sélecteur `.primary-button` explicite | `--lev-navy`, `--lev-muted`, `--lev-border` ; `--lev-navy` sert aujourd'hui au texte et aux actions |
| `.reg-library` | `--reg-teal` | `--reg-navy`, `--reg-muted`, `--reg-line` |
| `.project-editor` | `--navy` selon le contrôle | `--text`, `--muted-text`, `--line`, `--line-strong`, `--surface`, `--surface-subtle` |
| `.planning-p13-panel` | `--primary` | `--text`, `--muted-text`, `--line`, `--line-strong`, `--surface`, `--surface-soft` |
| `.planning-p21-panel` | `--assistant-primary`, `--assistant-primary-soft` | `--assistant-ink`, `--assistant-muted`, `--assistant-line` |

Conserver les variables `--manager-danger/warning/success`, `--assistant-danger/warning/success`, `--danger`, `--warning`, `--success`, `--crew-state-*`, `--planning-event-*`, `--document-vessel-tint`, `--completion` et les couleurs de catégorie. Éviter qu'une adaptation de tokens d'un module se propage à un document officiel imbriqué : sa palette et sa typographie peuvent être isolées localement. Les couleurs hardcodées des modules sans tokens exigent des sélecteurs explicites.

## Marin et Capitaine : sources de vérité et protections

Les aperçus de rôle depuis une session administrateur sont exclus de la preuve. Les différences d'interface viennent des rôles authentifiés, des affectations réelles, du profil RH et du résultat des RPC. Les politiques RLS continuent à être la source de vérité pour les données.

| Parcours | Fixtures de composant à préserver | Vérification serveur existante |
| --- | --- | --- |
| Planning publié et actions autorisées | `planning/PlanningPage.test.tsx` : Marin en consultation, congés, listes d'équipage ; Capitaine limité aux congés/listes. `planning/usePlanningOverview.test.tsx` : données publiées sans journal live | `supabase/tests/planning_reference_month_and_hr_self_edit_test.sql`, `temporary_captain_permissions_test.sql`, tests Planning de périmètre et d'affectation |
| Temps de travail et signature | `workingTime/WorkingTimeWorkflowPanel.test.tsx` : brouillon Marin, Capitaine RH exact, commentaire obligatoire sur non-conformité, absence d'action destructive après soumission. `WorkingTimeEntryBoard.test.tsx` : approbateur Planning | `working_time_workflow_permissions_test.sql`, `working_time_captain_assignment_role_test.sql`, `working_time_work_cycle_capitaine_test.sql`, `working_time_daily_approval_test.sql` |
| DPR | `dpr/DprPage.test.tsx` : propres DPR du Marin, fenêtre d'édition, Capitaine autorisé et permissions du Capitaine temporaire | `dpr_role_matrix_test.sql`, `temporary_captain_permissions_test.sql`, tests de modèle/production à la demande |
| Dossier RH | `humanResources/HumanResourcesPage.test.tsx` : Marin modifie uniquement sa fiche par RPC, Capitaine modifie sa propre fiche dans la bordée | `planning_reference_month_and_hr_self_edit_test.sql`, tests de documents RH et de portraits |
| Audits internes | `internalAudits/InternalAuditsPage.test.tsx` : Capitaine assigné traite, réponses en consultation ; Marin non assigné sans traitement | `internal_audits_test.sql` : JWT distincts, visibilité des assignations et interdictions RLS ; `internal_audit_photos_deadlines_test.sql` |
| OVID/eCMID/ISM externe/Client | `documentaryAudits/DocumentaryAuditsPage.test.tsx` : Capitaine traite uniquement l'écart assigné, Marin non assigné en consultation | `documentary_audits_test.sql` : JWT Capitaine/Marin distincts, visibilité dossier/preuves et refus d'usurpation |
| Plan d'Action | `actionPlan/ActionPlanPage.test.tsx` : Capitaine crée/commente sans traitement management, fixture Marin vide sans fuite de flotte | `action_plan_captain_treatment_test.sql`, `action_plan_assigned_vessel_scope_test.sql` |
| Achats | `purchaseRequests/PurchaseRequestsPage.test.tsx` : approbation et transitions Marin sans création/refus ; saisie Capitaine conservée | `purchase_request_marin_approval_test.sql`, `purchase_request_marin_operations_test.sql`, `purchase_request_approval_gate_test.sql` |
| Notes de frais | `expenseNotes/ExpenseNotesPage.test.tsx` : fixtures `marin` et `capitaine` limitées aux notes de leur compte, sans filtre émetteur ni paramétrage ; véhicules personnels et saisie conservés | `expense_notes_access_test.sql`, `expense_personal_vehicles_test.sql` |
| Exercices d'urgence | `emergencyExercises/EmergencyExercisesPage.test.tsx` : périmètres `self` et `watch` renvoyés par le serveur, sans filtre population de bureau | `emergency_exercises_access_test.sql` |
| Autres catalogues et registres | Tests de page des modules Chimie, Politique QHSE, Bibliothèque, Liens et Organigramme ; vérifier leurs réponses de permission sans utiliser une session simulée comme preuve | `chemical_inventory_access_test.sql`, `qhse_policy_access_test.sql`, `regulatory_library_access_test.sql`, `useful_links_access_test.sql`, `organigramme_access_test.sql` |
| Levage / LSA | `lifting/lifting.test.tsx` : gestion masquée pour fixture Marin réelle ; `liftingLifecycle.test.tsx` : création si permission explicite | `lifting_inventory_workflow_test.sql`, `lsa_register_access_test.sql`, `lsa_designation_catalog_test.sql` |
| Certificats | `fleetCertificates/FleetCertificatesPage.test.tsx` : Capitaine consulte une version reçue sans valider | tests RLS de documents et workflow du registre |
| Navigation / aide | `shell/AppShell.test.tsx`, `permissions/moduleAccess.test.ts`, `permissions/navigationPermissions.test.ts`, `manual/UserManualPage.test.tsx` | `role_module_permissions` reste la source de visibilité, avec restrictions d'accès spécifiques conservées |

Cette section recense des fixtures inspectées et des tests existants. Elle ne prétend pas que tous les tests SQL ont été exécutés pendant cet audit. Pour une correction purement visuelle, la validation de non-régression doit exécuter les tests pertinents de composants et le build, puis confirmer qu'aucun fichier de RPC/RLS ou workflow n'a changé.

## Vérification visuelle de la préversion

Les captures de cette demande sont regroupées dans le dossier de preuve `seapilot-design`, livré avec l'audit. Les fichiers `before-manifest.json`, `after-manifest.json` et `mobile-manifest.json` identifient les routes et les dimensions observées ; les planches `before-modules-*.jpg`, `after-modules-*.jpg` et `mobile-contact.jpg` ont été inspectées. La version de référence est le déploiement Vercel du commit `062ce19`. Les corrections ont été contrôlées dans le navigateur à partir du même socle et des fixtures de démonstration existantes.

### Étapes et constats issus du navigateur

| Étape | Vérification | Résultat / limite |
| --- | --- | --- |
| 1 | Inventaire de `APP_MODULES`, routes et navigation | 37 modules, trois sous-sections Levage, facturation et QHSE masqués, aide transversale recensés ; aucun menu ajouté/supprimé |
| 2 | Cadre et logo, styles calculés à 1280 × 720 | Sidebar, pied de sidebar, topbar et support du logo : noir uni `rgb(0, 0, 0)` ; disparition du halo bleu |
| 3 | Accueil, KPI, QHSE, catalogues et registres | Titres visibles à 28 px, description à 14 px, gouttière commune ; tableaux, pictogrammes et couleurs d'état conservés |
| 4 | Cinq variantes Audits | Titres, actions primaires et panneaux alignés ; grille annuelle gardée dans son défilement interne |
| 5 | Opérations, achats et ressources humaines | Rubans, boutons, onglets et surfaces alignés ; aucun changement de commande ou de workflow |
| 6 | Bibliothèque, deux catégories, liens, maintenance et administration | Police et tailles harmonisées ; catégories et états métier conservés ; pages d'attente Marad/Documents Techniques conservées |
| 7 | Largeur disponible de RH, Certificats et Notes de service | Disposition adaptée au conteneur déjà existant ; aucun débordement du body dans les captures finales à 1280 px ; chaque dossier reste accessible |
| 8 | Mobile 390 × 844 : Accueil, Projets, Procédures, Certificats, Notes de service, RH, Bibliothèque, Planning et Audits internes | Titres à 24 px, aucun débordement du body ; rubans et tableaux larges défilent dans leurs panneaux |
| 9 | Menu mobile et menu utilisateur | Ouverture/fermeture vérifiées, contenu conservé ; nom accessible du compte maintenu même quand le texte est masqué sur mobile |
| 10 | Recherche « Veracity » dans Liens utiles | Une entrée retrouvée, retour aux 15 liens après effacement ; aucune donnée enregistrée |
| 11 | Nouveau projet et facturation | Ouverture et annulation sans enregistrement ; fenêtre projet couvre le viewport mobile ; facturation couvre le viewport desktop avec les marges existantes de 16 px |
| 12 | Console | Pas d'erreur de chargement de CSS ; une trace `[Planning] Object` apparaît lors du parcours local et reste classée comme limite de la démonstration ; vérification distincte sur le déploiement final |

### Limites explicitement conservées

- QHSE documentaire affiche déjà « Impossible de charger les documents QHSE. » sur la référence publiée et sur la fixture corrigée. Cette route est auditée dans son état d'erreur ; son contenu documentaire n'est pas déclaré validé.
- L'aperçu PDF de la politique et certains indicateurs KPI restent en chargement dans les captures. Leur cadre a été vérifié ; ces captures ne prouvent pas le rendu final de tous les documents et graphiques. Les exports ne sont pas modifiés.
- Le registre mensuel Temps de travail de la fixture est en création automatique. Le ruban est vérifié ; cette capture ne valide pas une grille mensuelle complète.
- Aucun compte navigateur réellement Marin/Capitaine n'était disponible pour une session visuelle authentifiée. Les protections sont vérifiées par les fixtures de comptes distincts et l'inspection des RPC/RLS, jamais par la simulation de rôle d'un administrateur. Les scénarios SQL ont été inspectés, sans exécution ou mutation de base pour ce changement visuel.
- Cette vérification ne constitue pas un audit exhaustif de conformité WCAG ni une validation de tous les workflows métier.

### Validation automatisée

- 322 tests pertinents de permissions, périmètres et composants dans 16 fichiers réussis, avec fixtures Marin/Capitaine distinctes.
- 46 tests finaux dans six fichiers réussis pour le shell, le portrait, son chargement indépendant et les portraits RH existants.
- La suite complète locale a exécuté 2 759 tests. Dix cas ont échoué pendant les modifications sous forte charge ; leur relance sur les sources stabilisées a réussi : 14 cas paramétrés dans dix fichiers, sans modification des comportements ni des assertions.
- Build de production et lint exécutés ; leur résultat final et celui de la CI du commit livré sont consignés dans le rapport de livraison. Aucun fichier de migration, RPC, RLS, permission, workflow métier ou dépendance n'a changé.
