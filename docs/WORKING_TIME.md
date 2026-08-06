# Suivi du Temps de Travail

Le module `/modules/workingTime` conserve les intervalles horodatés comme source de vérité pour les contrôles de travail et de repos. Plusieurs phases disjointes peuvent être saisies le même jour ; elles sont contrôlées ensemble puis enregistrées atomiquement par Supabase.

Les rôles `admin` et `armement` peuvent préparer ou corriger un brouillon pour toute fiche RH active de leur société. Le marin et le capitaine conservent leur périmètre personnel ou de bordée publiée. La Direction reste en lecture seule. La signature du titulaire demeure obligatoirement explicite et l’auto-validation d’un capitaine reste interdite.

## Saisie multi-périodes

La grille affiche les 48 demi-heures de la journée sans défilement horizontal dès 516 px de largeur utile. Les indicateurs de conformité sont disposés au-dessus de la frise afin de lui réserver toute la largeur disponible.

Chaque clic-glissé ajoute immédiatement une période à la sélection. Les périodes disjointes sont conservées, les périodes adjacentes ou qui se recouvrent sont fusionnées, et une puce permet de sélectionner ou retirer chaque période. Une seule action, « Enregistrer la sélection », persiste atomiquement toutes les périodes. La saisie précise début/fin reste disponible et modifie la période active.

## Exports mensuels

Le PDF est généré à la demande dans le navigateur et n’est pas conservé par SeaPilot. Il comprend l’identité, le navire, l’OMI, le pavillon, le validateur, les commentaires, une grille de 48 demi-heures, les totaux journaliers, le cumul glissant 7 jours calculé côté serveur, les anomalies et les deux signatures figées.

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

L’assistant d’import est visible uniquement par les rôles `admin` et `armement`. Il lit les parties OpenXML du classeur avec JSZip et ne charge jamais `xl/vbaProject.bin` : les macros sont détectées pour information mais ne sont ni interprétées ni exécutées.

Le parcours est volontairement séparé en dépôt privé, détection, aperçu, contrôle des totaux, recherche de doublons, correction ou exclusion, validation et traçabilité. La grille source est convertie en phases de 30 minutes ; plusieurs phases disjointes restent plusieurs intervalles. Une différence entre l’année du nom de fichier et celle des dates mises en cache dans Excel est affichée avant validation et conservée dans les métadonnées.

Pour les imports historiques BBTM, le total journalier déclaré dans le XLSM est la source de vérité métier. Dans le modèle annuel, les deux cellules d’en-tête `00h` sont les bornes de la frise : les 48 demi-heures sont lues de la cellule suivant le premier `00h` jusqu’à la cellule du second `00h` incluse. Ce repérage évite de décaler toutes les phases de 30 minutes et conserve correctement la dernière demi-heure se terminant à `24:00`. Tout écart résiduel avec le total déclaré reste `inconsistent` jusqu’à correction.

Le navigateur ne décide jamais si une ligne est importable. `preview_working_time_import` revalide les phases, les totaux, la personne, l’année, le fuseau, le navire et la bordée du Planning publié. Il classe chaque journée en `ready`, `corrected`, `excluded`, `duplicate`, `inconsistent`, `blocked_workflow` ou `blocked_validated`. `commit_working_time_import` reprend un verrou par personne, refait les contrôles et n’insère que les journées `ready` ou `corrected`. Une journée déjà validée, soumise ou déjà saisie n’est jamais remplacée.

Le fichier source est conservé dans le bucket privé `working-time-imports` avec son SHA-256, sa taille, sa version de parseur et le lien de chaque intervalle vers le lot et la ligne source. La migration à appliquer est `20260804224824_working_time_excel_import.sql`.

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
| Droits Marin/Capitaine/Admin, auto-validation interdite | `working_time_workflow_permissions_test.sql` |
| Verrouillage, réouverture motivée, instantanés de signature | `working_time_workflow_permissions_test.sql` et `working_time_domain_model_test.sql` |
| RLS/RPC et non-écrasement d’une journée validée | `working_time_excel_import_test.sql` |
| XLSM, macro neutralisée, phases disjointes, correction | `workingTimeExcelImport.test.ts` et `WorkingTimeImportWizard.test.tsx` |
| Grille 24 h responsive et sélection multi-périodes en une action | `WorkingTimeEntryBoard.test.tsx` et recette navigateur 1280 × 720 |
| PDF avec les deux signatures figées | `workingTimePdf.test.ts` |
