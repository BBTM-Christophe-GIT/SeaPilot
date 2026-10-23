# Ajout de documents RH par les capitaines

Le profil Capitaine peut ajouter un nouveau document dans son dossier RH et ceux de sa bordée. Le bouton **Documents → Ajouter un document** utilise le même formulaire et le même stockage privé que les profils de gestion. Marin conserve ses droits documentaires existants.

Appliquer `20261021101557_hr_document_self_service_upload.sql` avant le client. La migration a été appliquée au projet SeaPilot lié avant le client. Elle ne modifie aucune donnée RH existante.

Le serveur utilise `hr_document_can_add` dans le RPC `hr_document_drive_scope`, la préparation/revalidation des téléversements Vercel Blob et les règles INSERT de Storage et `hr_documents`. Le périmètre réutilise `captain_shares_watch_with_person`, identique au périmètre de lecture RH : même société active, même navire, même bordée et affectations se chevauchant, avec une affectation capitaine non annulée dont la date de fin n'est pas passée. Le capitaine conserve aussi l'accès à son propre dossier.

La fiche créée doit référencer un fichier privé actif, téléversé par le même compte et vérifié par le serveur (personne du chemin, taille et type MIME correspondants). Les entretiens annuels restent dans leur parcours dédié. Le capitaine n'obtient aucun droit supplémentaire de modification, renouvellement ou suppression des documents existants.

Validation : `supabase/tests/hr_document_captain_upload_test.sql` crée de vrais comptes et affectations synthétiques dans une transaction annulée. Il vérifie les ajouts personnels et de bordée, les RPC Blob, la lecture, ainsi que les refus hors bordée, autre société, Marin, membre inactif, fichier absent/inactif/d'un autre émetteur, référence réattribuée et entretien annuel. Les fixtures frontend vérifient aussi le formulaire complet et les actions autorisées pour les profils Capitaine, Marin et Armement.

Depuis la version 3.77.14, l'ouverture de **Ajouter un document** ne dépend plus de l'enregistrement d'une autre fiche RH. Un Capitaine qui enregistre sa propre fiche peut changer de rubrique puis ouvrir et remplir l'ajout de document pendant que cette sauvegarde termine. Le bouton reprend le style primaire commun pour rendre son état actif explicite. Le téléversement possède son propre état d'attente : pendant l'ajout, ses champs et sa fermeture restent bloqués, les soumissions répétées sont ignorées et les autres mutations conservent leur protection. Une sauvegarde de fiche terminée ne réactive donc pas prématurément un téléversement en cours.

Les fixtures d'interface couvrent le bouton actif au repos, l'ouverture au clavier et à la souris, l'annulation, la création par le bouton du formulaire et le cas de sauvegarde de fiche différée. Les gardes serveur existants restent inchangés ; aucune nouvelle migration ni modification de données RH n'est nécessaire. La vue simulée Capitaine d'un compte de gestion ne remplace pas une vérification avec les fixtures de rôle et les règles serveur.
