# Tags des documents de procédure

La version 3.68.0 ajoute des tags facultatifs aux documents de travail et aux PDF
publiés du module **Procédures QHSE**. Administration et Direction peuvent les
renseigner lors de la création ou de la modification d'un document, ou avec
l'action **Modifier les tags** dans chaque ligne, y compris pour un PDF importé
sans document source.

Saisir les tags en les séparant par des virgules ou des points-virgules, par
exemple `Sécurité, Incendie, Formation`. Les valeurs vides et doublons sont
retirés. Vider le champ supprime tous les tags. Les tags s'affichent sous le
document et sont inclus dans la barre **Recherche de document**, avec la même
recherche insensible à la casse et aux accents que les autres métadonnées.
Les filtres Projet et Navire continuent à s'appliquer aux résultats.

Depuis la version 3.68.2, les tags s'affichent immédiatement après le navire,
sur la même ligne de métadonnées que les projets. Leur hauteur reprend celle
du badge Navire. Sur les petits écrans ou avec de nombreux tags, cette ligne
se parcourt horizontalement au toucher ou au clavier sans agrandir le document.

Depuis la version 3.68.1, le champ **Ajouter un tag pré-enregistré** permet de
choisir les tags d'un catalogue partagé. Sa liste initiale comprend **Rôle**,
**MARPOL**, **Pollution**, **Incendie** et **THOMSEA**. Les tags déjà utilisés
sur les documents rejoignent aussi ce catalogue.

Il reste possible de saisir un nouveau tag : l'enregistrement du document ou de
ses tags l'ajoute automatiquement au catalogue. Il pourra être réutilisé sur
les autres documents, même après son retrait du document d'origine. Les tags
déjà sélectionnés ne sont pas proposés une seconde fois. La liste est partagée
entre les profils Administration et Direction, seuls gestionnaires des documents.

Le bouton **Gérer les tags** permet d'ajouter un choix au catalogue ou de le
supprimer de la liste. Un tag retiré reste associé aux documents qui l'utilisent
et continue à être recherché. Enregistrer à nouveau ces documents ne réactive
pas le choix supprimé ; l'ajouter explicitement dans **Gérer les tags** le rend
de nouveau disponible. Retirer un tag d'un document reste possible dans
**Modifier les tags**.

Si le catalogue ne peut pas être chargé, un message permet de réessayer ; les
tags existants et la saisie libre restent disponibles.

Les tags d'un document source sont conservés à la publication, pour les fichiers
SeaPilot et Google Drive. Leur modification met à jour les PDF publiés liés
sans modifier ni republier les fichiers. Un PDF sans source conserve ses propres
tags. Les documents existants commencent avec une liste vide.

## Déploiement

Appliquer `supabase/migrations/20261007135737_procedure_document_tags.sql` avant
le client. La migration ajoute `tags text[]` aux deux tables existantes et des
triggers exécutés avec les droits de l'appelant. La propagation ne touche que
les PDF publiés complets ; les anciennes lignes non diffusables ne bloquent pas
l'enregistrement d'un document source. Aucune nouvelle permission n'est accordée.

Les profils Armement, Capitaine et Marin peuvent rechercher et consulter les
tags uniquement sur leurs PDF publiés accessibles. Les sources et les actions
de modification restent réservées à Administration et Direction.

Appliquer également `20261007141605_procedure_tag_catalogue.sql` avant le
client 3.68.1. Cette migration crée le catalogue partagé avec ses politiques RLS
Administration/Direction et enregistre les tags depuis les triggers existants,
sans accorder d'accès supplémentaire aux documents.

Appliquer ensuite `20261007142542_procedure_tag_catalogue_archive.sql`. Elle
ajoute l'état actif des choix : la suppression du catalogue les désactive sans
modifier les tags des documents. Les noms ne peuvent pas contenir de virgule
ni de point-virgule, réservés à la saisie de plusieurs tags.

## Vérification

Les tests du module couvrent l'enregistrement, la suppression, les PDF autonomes,
la recherche par tag seul, les accents, les résultats multiples et les droits
des profils. `supabase/tests/procedure_document_tags_test.sql` vérifie les
triggers et les règles RLS avec des comptes distincts dans une transaction
annulée à la fin. `supabase/tests/procedure_tag_catalogue_test.sql` couvre les
choix initiaux, l'ajout, la suppression, la réactivation, les doublons et les
droits de gestion avec des comptes Administration, Direction, Capitaine et Marin.

Les trois migrations ont été appliquées au projet SeaPilot lié le 7 octobre 2026. Les
assertions ont réussi sur ce projet et les comptes/documents de test ont été
supprimés par le rollback de leur transaction.
