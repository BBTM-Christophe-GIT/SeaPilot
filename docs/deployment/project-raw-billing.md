# Saisie brute de facturation

Version `3.70.0` ajoute l’onglet **Saisie brute** dans Projets → Facturation et sa section dans Éléments de facturation.

Chaque ligne contient la date, la désignation, le prix unitaire HT, la quantité et le total HT calculé au centime. Les lignes sont enregistrées individuellement pour le projet et le mois sélectionnés. La quantité initiale est `1`, modifiable avec trois décimales ; le prix accepte deux décimales. La date proposée est le premier jour du mois sélectionné. Il n’existe pas de limite de lignes imposée par l’interface et la lecture est paginée au-delà de 1 000 enregistrements.

Le **Catalogue de prestations** existant mémorise la catégorie (utilisée comme désignation) et le prix unitaire. Il ne contient aucune quantité par défaut. La sélection explicite d’une prestation copie ces valeurs dans la ligne, sans modifier sa date ni sa quantité. Toutes les valeurs restent modifiables ; saisir la désignation détache l’origine catalogue, même si le texte correspond exactement à une prestation. Ces lignes restent indépendantes des calculs automatiques DPR/P144 des prestations BBTM. Modifier ou archiver le catalogue ne change pas les lignes déjà enregistrées.

À partir de `3.70.1`, le bouton **+** devant **Désignation libre** ouvre une fenêtre **Choisir une prestation**, avec recherche et affichage du prix unitaire. Il remplace la liste « Saisie manuelle ». Sélectionner une prestation remplit uniquement la ligne depuis laquelle la fenêtre a été ouverte ; fermer la fenêtre laisse la ligne intacte. Échap ferme le catalogue et rend le focus au bouton. **Ajouter une ligne** se trouve sous le tableau ; **Enregistrer** reste disponible sur chaque ligne. Aucun changement de stockage ni de droits.

Depuis `3.70.1`, seule la case globale **Inclure la saisie brute** du volet de droite pilote le total sélectionné et les exports PDF, PDF fusionné et ZIP pour toutes les lignes. Les cases individuelles sont retirées et les anciennes exclusions par ligne ne filtrent plus ces exports. Seules les lignes du mois sélectionné dont la date appartient à la période d’export sont exportées. Les lignes modifiées doivent être enregistrées avant l’aperçu ou l’export. Le PDF ajoute un tableau paginé avec les cinq colonnes et un sous-total.

Les lignes brutes et les prestations BBTM sont exprimées en euros. Les loyers suivent la devise du contrat et les frais leur devise enregistrée. L’écran et le PDF conservent des totaux distincts par devise, sans conversion implicite. Les brouillons restent présents quand on masque la section ; une sauvegarde terminée après un changement de mois est conservée dans le cache du même projet.

## Base de données et permissions

Appliquer la migration additive `20261008115912_project_billing_raw_lines.sql` avant le client. Elle crée `project_billing_raw_lines`, ajoute `project_billing_periods.include_raw_in_pdf` et étend les références client par contenu du PDF au bit `8` (saisie brute). Les anciens scopes `0..7` sont conservés ; sans ligne brute incluse, leur référence reste utilisée.

Les contraintes garantissent la cohérence société/projet/période et catalogue, une désignation non vide de 120 caractères maximum et des montants/quantités positifs ou nuls. Supprimer une période ou son projet supprime ses lignes ; une prestation catalogue référencée est conservée et peut être archivée. Administration et Direction peuvent écrire ; les membres de la société consultent selon les mêmes règles que la facturation existante. Aucun accès inter-sociétés n’est ajouté.

`supabase/tests/project_billing_raw_lines_test.sql` vérifie en transaction avec rollback les profils réels Administration, Direction, Marin, Capitaine et Armement, l’isolation entre sociétés, les références, les valeurs manuelles, les inclusions PDF, les cascades et plus de 1 000 lignes. Les tests client couvrent le CRUD, la pagination, les calculs décimaux, le catalogue explicite, les brouillons, les exports et leur pagination.

Aucune nouvelle dépendance ni variable d’environnement. Installation et scripts avec pnpm `10.34.5`.

## Validation de livraison

Le 8 octobre 2026 : 317 tests passent dans 32 fichiers Projets/prévisualisation, ESLint ciblé et build de production réussis. La migration est appliquée au projet Supabase SeaPilot et les fixtures SQL passent avec rollback intégral. Aucun nouveau signalement de sécurité Supabase n’est ajouté.

La recette navigateur vérifie l’interface et les vrais générateurs PDF sur ordinateur et mobile, avec des réponses de stockage de facturation injectées pour les opérations de démonstration. Les droits des profils sont vérifiés séparément par les fixtures SQL réelles, conformément aux instructions du projet.

La correction `3.70.1` est validée par 135 tests dans sept fichiers concernés, dont le choix de prestation via **+**, le maintien de date/quantité, le clavier dans les fenêtres imbriquées, l’ordre du bouton d’ajout, les sauvegardes explicites et l’inclusion globale des anciennes lignes exclues. La recette navigateur vérifie ces ajustements sur ordinateur et mobile. Aucune nouvelle migration.
