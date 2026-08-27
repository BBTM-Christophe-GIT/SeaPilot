# Suivi du Temps de Travail

Le module `/modules/workingTime` conserve les intervalles horodatés comme source de vérité pour les contrôles de travail et de repos. Plusieurs phases disjointes peuvent être saisies le même jour ; elles sont contrôlées ensemble puis enregistrées atomiquement par Supabase.

Les rôles `admin` et `armement` peuvent préparer ou corriger un brouillon pour toute fiche RH active de leur société. Le Marin et le Capitaine conservent leur périmètre personnel ou de bordée publiée. La Direction reste en lecture seule. Chaque fiche RH disposant d’une date d’embauche reçoit automatiquement un registre pour chaque mois depuis son mois d’embauche. Pour le personnel sorti, la série s’arrête au mois de départ ; sinon elle va jusqu’au mois courant. La création ou la modification d’une fiche déclenche ce provisionnement, et le chargement du module garantit le mois demandé avant de lire les registres.

Le formulaire quotidien ne demande plus Début, Fin, Navire ni Bordée : la frise fournit les heures et le serveur impose l’affectation Planning active de la personne et de la journée. Seuls les statuts Planning normalisés « En Mer » et « A Terre » sont éligibles ; les vacances, repos, arrêts, formations et autres statuts sont exclus. Le commentaire devient obligatoire dès que l’analyse serveur détecte une alerte ou une non-conformité.

Le workflow porte désormais sur une journée, pas sur tout le registre mensuel. Sous le commentaire, le Marin ou le Capitaine choisit « Valider ». Une signature active de l’auteur est obligatoire et figée avec la journée. La qualité de Capitaine vient exclusivement du libellé RH exact `Capitaine`, indépendamment du rôle applicatif : `Capitaine 200`, `Second capitaine` ou toute variante de casse ne confèrent pas cette qualité.

Le Capitaine RH valide directement sa propre journée avec sa signature active. Pour un Marin, le serveur résout l’unique personne de la même bordée dont la fonction RH est exactement `Capitaine` et dont l’affectation Planning est confirmée sur le même navire. Le rôle opérationnel de cette affectation peut être `Capitaine`, `2nd Capitaine` ou un autre libellé : il ne remplace jamais la fonction RH comme source de vérité. Cette personne reçoit la demande dans l’onglet « Approbation », avec une pastille rouge indiquant le nombre de demandes. Elle peut corriger les phases et valide avec sa propre signature active ; les signatures du Marin et du Capitaine sont conservées séparément. Le Capitaine affecté peut également préparer une journée encore non soumise pour un Marin de sa bordée et la valider directement lorsque les deux signatures de profil sont actives. L’apposition déléguée de la signature du titulaire conserve explicitement l’identité du Capitaine acteur dans l’instantané et dans le journal d’audit. Pour une journée non conforme, la journée reste soumise jusqu’à ce que le Capitaine renseigne la justification puis utilise l’action atomique « Valider la saisie des heures et la justification ». Les rôles Admin et Armement conservent la validation de secours. Seule la journée validée devient en lecture seule.

## Cockpit mensuel

L’écran principal est organisé comme un cockpit mensuel : commandes métier regroupées en haut, équipage classé par service à gauche, calendrier et frise 24 heures au centre, synthèse de conformité à droite. Un administrateur, l’Armement ou la Direction peut basculer entre le personnel en poste et le personnel ancien ; la date locale `departed_on` détermine la catégorie. Le catalogue conserve une seule entrée visuelle par marin, même lorsque d’anciens registres hebdomadaires coexistent avec le registre mensuel.

À l’ouverture du mois courant, la journée locale du jour est sélectionnée ; un mois historique s’ouvre sur son premier jour. Dans la vue mensuelle, une journée non conforme affiche le contrôle en échec, la valeur mesurée, le seuil de la politique appliquée et les bornes exactes de la fenêtre glissante. L’alarme est rattachée à la date du dernier créneau de travail qui contribue à la fenêtre fautive. Lorsqu’une fenêtre de 24 heures encore non conforme se termine le lendemain avant toute nouvelle heure de travail, ce lendemain reste neutre et matérialise seulement la portion de fenêtre qui recouvre la journée par une fine ligne rouge directement dans la frise 00h–24h. Le libellé indique l’heure de départ à J−1 et l’heure de fin ; le détail complet reste disponible au survol et pour les lecteurs d’écran. Aucune justification supplémentaire n’est demandée. Les colonnes de repos sur 24 heures et de travail sur 7 jours d’une ligne en alarme reprennent le calcul fautif.

La barre de commandes reste centrée sur les fonctions d’aide à la décision et les documents. Le groupe « Gestion des congés », « Actualiser », « Ouvrir un registre » et toutes les actions de brouillon ont été retirés. L’action « Valider » apparaît sous le commentaire. Les fonctions secondaires s’ouvrent dans des fenêtres dédiées : « Import » pour l’assistant XLSM réservé aux administrateurs, « Exposition HSE / IMCA » pour les indicateurs et « Contrôles travail et repos » pour le moteur P1.3 et ses alertes.

Les intervalles affichés sont consolidés par personne et par mois, indépendamment du registre historique qui les porte. Après un import XLSM, les espaces Planning et Temps de travail sont rechargés ensemble : les phases importées apparaissent immédiatement, y compris plusieurs créneaux disjoints pour une même journée.

## Saisie multi-périodes

La grille affiche les 48 demi-heures de la journée sans défilement horizontal dès 516 px de largeur utile. Les indicateurs de conformité sont disposés au-dessus de la frise afin de lui réserver toute la largeur disponible.

Chaque clic-glissé ajoute immédiatement une période à la sélection. Les périodes disjointes sont conservées et les périodes adjacentes ou qui se recouvrent sont fusionnées. Les anciennes lignes récapitulatives munies des boutons « Corriger » et « Retirer » sont supprimées : une plage déjà enregistrée se sélectionne directement dans la frise, qui affiche alors ses actions de correction et de retrait. L’action « Valider » enregistre la journée et déclenche son workflow. Il n’existe plus de saisie manuelle Début/Fin, Navire, Bordée ou approbateur.

## Daily Progress Report

Le contexte DPR est résolu à partir de la date et du navire sélectionnés, indépendamment de l’émetteur. Le projet actif du Planning est automatiquement renseigné. La section « Personnel embarqué » ne propose que les personnes affectées au navire avec un statut Planning effectif « En Mer » ou « A Terre » ; les autres statuts, notamment « Vacance », sont exclus.

## Exports mensuels

Le PDF est généré à la demande dans le navigateur et n’est pas conservé. Il tient sur une seule page paysage et comprend l’identité, le navire, l’OMI, le pavillon, le validateur, les commentaires, une grille de 48 demi-heures, les totaux journaliers, le cumul glissant 7 jours calculé côté serveur, les anomalies et les deux signatures figées dans des cases placées au-dessus du tableau. Aucune page de synthèse supplémentaire n’est créée et le nom du produit n’apparaît pas dans le document.

Les bibliothèques PDF sont préchargées avec la page du module afin d’éviter un téléchargement différé vers un ancien fichier haché après déploiement. Si Vite détecte malgré tout un module préchargé devenu obsolète, l’application effectue une unique actualisation de récupération avant de rendre l’erreur à l’utilisateur.

## Exposition HSE / IMCA

`working_time_intervals` porte les heures réelles. `hse_exposure_hours` est un ledger séparé qui conserve la méthodologie versionnée utilisée pour les heures d’exposition.

- Sédentaires : une affectation issue d’un Planning publié produit 8 heures d’exposition par jour. Une saisie réelle ou un import Excel sur la même personne et la même date remplace cette valeur et empêche tout double comptage.
- Offshore : les heures réelles restent utilisées pour les contrôles travail/repos. Leur conversion en exposition exige un facteur explicite dans `hse_exposure_methodologies`.
- Aucun multiplicateur de taux n’est implicite. Tant que l’administrateur ne les renseigne pas, les taux concernés restent `null` et l’interface affiche « À configurer ».

Les classifications disponibles sont `FAT`, `LWDC`, `RWC`, `MTC`, `FAC`, `NEAR_MISS` et `SAFETY_OBSERVATION`. Le RPC `hse_kpi_summary` produit LTI, LTIFR, TRIR, FAR, les taux FAC/MTC/RWC, SOFR et les taux français de fréquence et de gravité, avec filtres période, navire, bordée, personne, fonction, client, projet, zone et population.

## Exploitation

1. L’administrateur crée ou complète une méthodologie datée et versionnée.
2. L’armement, la direction ou l’administrateur lance `refresh_hse_exposure_hours` sur la période.
3. Les rôles autorisés interrogent `hse_kpi_summary` depuis le panneau HSE du module.

Les politiques RLS limitent les lectures à la société active. La gestion des méthodes est réservée à l’administrateur et le recalcul d’exposition aux rôles administrateur, direction et armement.

## Import annuel XLSM

L’assistant d’import est visible uniquement par le rôle `admin`. Le même contrôle est appliqué dans les RPC et les politiques RLS : les rôles `armement`, `direction`, `capitaine` et `marin` ne peuvent ni déposer un fichier, ni lancer un import, ni consulter ses lots d’audit. L’assistant lit les parties OpenXML du classeur avec JSZip et ne charge jamais `xl/vbaProject.bin` : les macros sont détectées pour information mais ne sont ni interprétées ni exécutées.

Le parcours est volontairement séparé en dépôt privé, détection, aperçu, contrôle des totaux, recherche de doublons, correction ou exclusion, validation et traçabilité. La grille source est convertie en phases de 30 minutes ; plusieurs phases disjointes restent plusieurs intervalles. Une différence entre l’année du nom de fichier et celle des dates mises en cache dans Excel est affichée avant validation et conservée dans les métadonnées.

Pour les imports historiques BBTM, le total journalier déclaré dans le XLSM est la source de vérité métier. Dans le modèle annuel, les deux cellules d’en-tête `00h` sont les bornes de la frise : les 48 demi-heures sont lues de la cellule suivant le premier `00h` jusqu’à la cellule du second `00h` incluse. Ce repérage évite de décaler toutes les phases de 30 minutes et conserve correctement la dernière demi-heure se terminant à `24:00`. Tout écart résiduel avec le total déclaré reste `inconsistent` jusqu’à correction.

Le navigateur ne décide jamais si une ligne est importable. `preview_working_time_import` revalide les phases, les totaux, la personne, l’année, le fuseau, le navire et la bordée du Planning publié. Il classe chaque journée en `ready`, `corrected`, `excluded`, `duplicate`, `inconsistent`, `blocked_workflow` ou `blocked_validated`. `commit_working_time_import` reprend un verrou par personne, refait les contrôles et n’insère que les journées `ready` ou `corrected`. Une journée strictement identique est conservée sans nouvel intervalle. Une journée différente peut être remplacée par l’administrateur quel que soit le statut du registre, sans justification et sans transition `reopened`. Le statut reste `validated` lorsqu’il l’était déjà ; un événement `approved_import`, l’empreinte du fichier et les anciennes valeurs annulées assurent automatiquement la traçabilité. Le verrou ordinaire continue de protéger toute modification effectuée hors de cette transaction d’import.

La validation d’un lot annuel diffère les recalculs des fenêtres glissantes pendant l’insertion, puis reconstruit une seule fois les calculs autoritatifs de la personne avant de terminer la transaction. Le RPC de validation dispose d’un délai ciblé de 60 secondes, sans modifier les limites globales des autres requêtes. Si la transaction expire malgré tout, aucune journée partielle n’est conservée et l’interface propose de relancer la validation.

Le fichier source est conservé dans le bucket privé `working-time-imports` avec son SHA-256, sa taille, sa version de parseur et le lien de chaque intervalle vers le lot et la ligne source. Les migrations d’import sont `20260804224824_working_time_excel_import.sql`, `20260807002926_working_time_replace_validated_days_discard_drafts.sql`, `20260808113643_working_time_batch_import_timeout.sql` et `20260808153712_working_time_admin_import_override_validated.sql`.

Les écarts résiduels entre total déclaré et demi-heures détectées sont des avertissements avant contrôle : ils n’empêchent
pas de lancer l’analyse serveur. Ils deviennent des lignes `inconsistent` qui doivent être corrigées avant la validation finale. Le bucket accepte les deux casses équivalentes du type MIME XLSM produites par les
navigateurs et Windows. Les comptes historiques sont associés à leur fiche RH uniquement lorsqu’un e-mail unique
correspond dans la même société ; toute ambiguïté reste à traiter manuellement.

## Matrice de recette

| Exigence | Couverture automatisée |
| --- | --- |
| Minuit, chevauchements, doublons, repos total/consécutif | `working_time_server_calculations_test.sql` |
| Fenêtre entre deux mois et exactement 7 jours | `working_time_server_calculations_test.sql` |
| Changement de bordée publié pendant l’année | `working_time_excel_import_test.sql` |
| Vérité RH exacte `Capitaine`, rôle Planning opérationnel distinct, validation directe d’un brouillon de bordée et approbateur automatique | `working_time_daily_approval_test.sql`, `working_time_captain_assignment_role_test.sql` et `WorkingTimeWorkflowPanel.test.tsx` |
| Verrouillage limité au jour validé, justification atomique et deux instantanés de signature | `working_time_daily_approval_test.sql` et `WorkingTimeWorkflowPanel.test.tsx` |
| RLS/RPC, import réservé à l’admin, remplacement validé sans réouverture et import annuel de 104 journées sous 8 s | `working_time_excel_import_test.sql` |
| XLSM, macro neutralisée, phases disjointes, correction | `workingTimeExcelImport.test.ts` et `WorkingTimeImportWizard.test.tsx` |
| Grille 24 h responsive et sélection multi-périodes en une action | `WorkingTimeEntryBoard.test.tsx` et recette navigateur 1280 × 720 |
| PDF français d’une page avec les deux signatures figées en première page | `workingTimePdf.test.ts` |
| Consolidation de deux créneaux importés issus de registres historiques différents | `WorkingTimeWorkflowPanel.test.tsx` |
| Journée sans travail non signalée par une fenêtre glissante héritée | `WorkingTimeWorkflowPanel.test.tsx` et `working_time_daily_approval_test.sql` |
| Personnel et projet DPR issus du Planning selon la date et le navire | `DprPage.test.tsx` et `dpr_planning_prefill_test.sql` |
