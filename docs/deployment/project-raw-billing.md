# Saisie brute de facturation

Version `3.70.0` ajoute l’onglet **Saisie brute** dans Projets → Facturation et sa section dans Éléments de facturation.

Chaque ligne contient la date, la désignation, le prix unitaire HT, la quantité et le total HT calculé au centime. Les lignes sont enregistrées individuellement pour le projet et le mois sélectionnés. La quantité initiale est `1`, modifiable avec trois décimales ; le prix accepte deux décimales. La date proposée est le premier jour du mois sélectionné. Il n’existe pas de limite de lignes imposée par l’interface et la lecture est paginée au-delà de 1 000 enregistrements.

Le **Catalogue de prestations** existant mémorise la catégorie (utilisée comme désignation) et le prix unitaire. Il ne contient aucune quantité par défaut. La sélection explicite d’une prestation copie ces valeurs dans la ligne, sans modifier sa date ni sa quantité. Toutes les valeurs restent modifiables ; saisir la désignation détache l’origine catalogue, même si le texte correspond exactement à une prestation. Ces lignes restent indépendantes des calculs automatiques DPR/P144 des prestations BBTM. Modifier ou archiver le catalogue ne change pas les lignes déjà enregistrées.

À partir de `3.70.1`, le bouton **+** devant **Désignation libre** ouvre une fenêtre **Choisir une prestation**, avec recherche et affichage du prix unitaire. Il remplace la liste « Saisie manuelle ». Sélectionner une prestation remplit uniquement la ligne depuis laquelle la fenêtre a été ouverte ; fermer la fenêtre laisse la ligne intacte. Échap ferme le catalogue et rend le focus au bouton. **Ajouter une ligne** se trouve sous le tableau ; **Enregistrer** reste disponible sur chaque ligne. Aucun changement de stockage ni de droits.

Depuis `3.70.1`, seule la case globale **Inclure la saisie brute** du volet de droite pilote le total sélectionné et les exports PDF, PDF fusionné et ZIP pour toutes les lignes. Les cases individuelles sont retirées et les anciennes exclusions par ligne ne filtrent plus ces exports. Seules les lignes du mois sélectionné dont la date appartient à la période d’export sont exportées. Les lignes modifiées doivent être enregistrées avant l’aperçu ou l’export. Le PDF reprend ces valeurs dans un tableau et un sous-total.

Les lignes brutes et les prestations BBTM sont exprimées en euros. Les loyers suivent la devise du contrat et les frais leur devise enregistrée. L’écran et le PDF conservent des totaux distincts par devise, sans conversion implicite. Les brouillons restent présents quand on masque la section ; une sauvegarde terminée après un changement de mois est conservée dans le cache du même projet.

## Base de données et permissions

Version `3.71.0` ajoute le bouton **Nouvelle prestation** dans la fenêtre de sélection : désignation, prix unitaire HT et navire, sans quantité par défaut. Le navire est choisi dans la liste SeaPilot, triée par longueur décroissante ; les bureaux et quais ne sont pas proposés. **Sans navire** conserve la compatibilité avec les anciennes entrées. La prestation créée rejoint le catalogue et préremplit seulement la ligne d’origine ; sa date et sa quantité sont préservées et la ligne doit encore être **Enregistrée**. Annuler revient à la sélection ; une erreur conserve le formulaire pour réessayer.

Le catalogue complet et chaque ligne brute possèdent un sélecteur **Navire**. Le choix d’une prestation reprend aussi son navire ; on peut ensuite choisir un autre navire sur la ligne. Le nom est figé à l’enregistrement de la ligne pour que les modifications de la flotte ou du catalogue ne changent pas ses données historiques. Le PDF affiche six colonnes, dont **Navire**, et retire le bloc Navire en haut à droite lorsque des lignes brutes sont effectivement exportées. Sans ligne brute incluse, le navire reste indiqué en tête.

Depuis `3.71.1`, le [design Tableau synthétique](./billing-pdf-synthetic.md) choisi remplace les pages annexes par une page A4 paysage. La section brute s’intitule **Détail des Opérations** dans le PDF ; l’onglet de saisie garde son nom. Les textes passent à la ligne sans troncature et la densité s’ajuste pour conserver toutes les lignes sur cette page. Les totaux figurent dans le bandeau inférieur, par devise.

Appliquer aussi la migration additive `20261008131113_project_billing_vessel_snapshots.sql` avant le client `3.71.0`. Elle ajoute `vessel_id` nullable et `vessel_name` vide par défaut au catalogue et aux lignes brutes, avec une référence au navire de la même société. Une catégorie active peut être enregistrée pour plusieurs navires distincts ; les doublons sur un même navire (ou sans navire) restent interdits indépendamment de la casse. Les droits existants sont conservés. `supabase/tests/project_billing_vessel_snapshots_test.sql` vérifie les profils réels, l’isolation, les doublons et la conservation des noms lors des renommages, avec rollback.

Appliquer la migration additive `20261008115912_project_billing_raw_lines.sql` avant le client. Elle crée `project_billing_raw_lines`, ajoute `project_billing_periods.include_raw_in_pdf` et étend les références client par contenu du PDF au bit `8` (saisie brute). Les anciens scopes `0..7` sont conservés ; sans ligne brute incluse, leur référence reste utilisée.

Les contraintes garantissent la cohérence société/projet/période et catalogue, une désignation non vide de 120 caractères maximum et des montants/quantités positifs ou nuls. Supprimer une période ou son projet supprime ses lignes ; une prestation catalogue référencée est conservée et peut être archivée. Administration et Direction peuvent écrire ; les membres de la société consultent selon les mêmes règles que la facturation existante. Aucun accès inter-sociétés n’est ajouté.

`supabase/tests/project_billing_raw_lines_test.sql` vérifie en transaction avec rollback les profils réels Administration, Direction, Marin, Capitaine et Armement, l’isolation entre sociétés, les références, les valeurs manuelles, les inclusions PDF, les cascades et plus de 1 000 lignes. Les tests client couvrent le CRUD, la pagination des lectures, les calculs décimaux, le catalogue explicite, les brouillons, les exports et la conservation de toutes les lignes.

Aucune nouvelle dépendance ni variable d’environnement. Installation et scripts avec pnpm `10.34.5`.

## Validation de livraison

Le 8 octobre 2026 : 317 tests passent dans 32 fichiers Projets/prévisualisation, ESLint ciblé et build de production réussis. La migration est appliquée au projet Supabase SeaPilot et les fixtures SQL passent avec rollback intégral. Aucun nouveau signalement de sécurité Supabase n’est ajouté.

La recette navigateur vérifie l’interface et les vrais générateurs PDF sur ordinateur et mobile, avec des réponses de stockage de facturation injectées pour les opérations de démonstration. Les droits des profils sont vérifiés séparément par les fixtures SQL réelles, conformément aux instructions du projet.

La correction `3.70.1` est validée par 135 tests dans sept fichiers concernés, dont le choix de prestation via **+**, le maintien de date/quantité, le clavier dans les fenêtres imbriquées, l’ordre du bouton d’ajout, les sauvegardes explicites et l’inclusion globale des anciennes lignes exclues. La recette navigateur vérifie ces ajustements sur ordinateur et mobile. Aucune nouvelle migration.

Version `3.71.0` : tests concernés, ESLint ciblé et build de production validés avec pnpm `10.34.5`. La recette ordinateur/mobile couvre création, erreur/réessai, annulation, clavier, navire et préremplissage sans sauvegarde automatique des lignes. Les PDF réels sont vérifiés avec ou sans lignes brutes, 95 lignes et un nom de navire exceptionnellement long. La migration Navire est appliquée au projet SeaPilot ; la fixture SQL des profils réels passe avec rollback, sans résidu ni nouveau signalement de sécurité. Les noms historiques restent visibles après renommage de la flotte et les catégories BBTM homonymes se distinguent par leur navire.
