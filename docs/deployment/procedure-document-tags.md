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

## Vérification

Les tests du module couvrent l'enregistrement, la suppression, les PDF autonomes,
la recherche par tag seul, les accents, les résultats multiples et les droits
des profils. `supabase/tests/procedure_document_tags_test.sql` vérifie les
triggers et les règles RLS avec des comptes distincts dans une transaction
annulée à la fin.

La migration a été appliquée au projet SeaPilot lié le 7 octobre 2026. Les
assertions ont réussi sur ce projet et les comptes/documents de test ont été
supprimés par le rollback de leur transaction.
