# Certificats flotte — fichiers reçus en attente de validation

Depuis `3.64.4`, les lignes de navire dans la bibliothèque passent le nom sur une ligne distincte des compteurs sur mobile. Les noms restent lisibles à 320 et 390 px, même avec des documents à traiter et échus ; aucun compteur, document ou droit n’est masqué ou modifié.

L’ajout d’un fichier à une ligne sans document utilise le même workflow qu’un renouvellement : le fichier est téléversé dans le bucket privé `fleet-certificates`, puis `submit_fleet_certificate_renewal` enregistre une version `pending_validation`. Cette version n’est pas encore le document courant. La fiche peut donc conserver un `storage_path` vide ou celui de sa version précédente jusqu’à validation.

L’interface ne chargeait pas ces versions et ne proposait pas la validation existante. Elle annonçait un ajout réussi tout en affichant « Aucun fichier joint » pour une première pièce. Une lecture des journaux et de la fiche en production a confirmé un téléversement et une soumission réussis, avec une première version reçue sans version actuelle. Aucun fichier ni enregistrement de production n’a été modifié pendant le diagnostic.

Après ajout, l’écran ouvre désormais l’aperçu du certificat sélectionné et annonce « Document reçu, en attente de validation » ou « Nouvelle version reçue, en attente de validation ». La bibliothèque indique le document reçu. Le panneau **Versions du document** affiche les fichiers, leur état et leurs propres dates. **Afficher** permet de prévisualiser et télécharger une version reçue ou historique à partir de son chemin et de son type MIME, même lorsque la fiche n’a pas encore de fichier courant.

Les profils Administration, Direction et Armement disposent de **Valider** sur une version reçue. L’action appelle la RPC existante `validate_fleet_certificate_renewal`, puis recharge la fiche et les versions. Le document devient courant seulement après réussite. Une erreur laisse la version reçue visible, affiche le message du serveur et permet de réessayer. Capitaine et Marin peuvent consulter les versions des certificats déjà accessibles dans leur périmètre ; aucune action de validation ne leur est proposée. Les protections RLS et Storage restent appliquées par le serveur.

Le téléchargement groupé de la bibliothèque continue d’utiliser uniquement les documents courants. Une version reçue peut être téléchargée individuellement après **Afficher**. Aucun fichier courant n’est remplacé automatiquement et aucun objet Storage n’est supprimé par ce correctif.

## Validation et déploiement

Frontend uniquement, sans migration ni changement de droits. Déployer avec le client web habituel.

- Régression : ligne sans fichier → téléversement → version reçue visible → aperçu signé et téléchargement → validation explicite → fichier courant disponible dans la bibliothèque.
- Lecture seule : un profil Capitaine voit la version reçue et son aperçu, sans bouton de validation.
- Refus serveur : une erreur de validation est affichée ; la version et le document courant sont conservés.
- Le changement de certificat charge uniquement les versions du certificat sélectionné, avec annulation des résultats asynchrones obsolètes.

Retour arrière : redéployer le frontend précédent. Les données, versions et RPC restent compatibles.
