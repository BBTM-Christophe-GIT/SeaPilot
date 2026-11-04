# Certificats flotte — fichiers reçus en attente de validation

Depuis `3.64.4`, les lignes de navire dans la bibliothèque passent le nom sur une ligne distincte des compteurs sur mobile. Les noms restent lisibles à 320 et 390 px, même avec des documents à traiter et échus ; aucun compteur, document ou droit n’est masqué ou modifié.

L’ajout d’un fichier à une ligne sans document utilise le même workflow qu’un renouvellement : le fichier est téléversé dans le bucket privé `fleet-certificates`, puis `submit_fleet_certificate_renewal` enregistre une version `pending_validation`. Cette version n’est pas encore le document courant. La fiche peut donc conserver un `storage_path` vide ou celui de sa version précédente jusqu’à validation.

L’interface ne chargeait pas ces versions et ne proposait pas la validation existante. Elle annonçait un ajout réussi tout en affichant « Aucun fichier joint » pour une première pièce. Une lecture des journaux et de la fiche en production a confirmé un téléversement et une soumission réussis, avec une première version reçue sans version actuelle. Aucun fichier ni enregistrement de production n’a été modifié pendant le diagnostic.

Après ajout, l’écran récupère l’identifiant de version retourné par le dépôt et ouvre automatiquement cette version dans l’aperçu, même lorsqu’un ancien fichier officiel existe déjà. Il annonce « Document reçu, en attente de validation » ou « Nouvelle version reçue, en attente de validation ». Le nom, les dates, le type de fichier et les commandes de téléchargement de l’aperçu correspondent à la version affichée, marquée « À valider ». La bibliothèque indique le document reçu. Le panneau **Versions du document** affiche les fichiers, leur état et leurs propres dates. **Afficher** permet aussi de prévisualiser et télécharger une version reçue ou historique à partir de son chemin et de son type MIME.

À la réouverture d’un certificat en attente, la plus récente version réellement reçue et accessible est affichée par défaut, sans nouvel envoi. Un choix manuel dans l’historique ou la cible exacte retournée par son propre dépôt reste prioritaire.

Si le dépôt réussit mais que la lecture de cette version échoue, le formulaire d’envoi se ferme et la réception reste confirmée. L’ancien aperçu est masqué ; une nouvelle tentative relit uniquement l’identifiant reçu, sans renvoyer le fichier ni créer de doublon. L’interface ne devine pas le numéro de version et ne choisit pas une autre soumission arrivée en parallèle.

Les profils Administration, Direction et Armement disposent de **Valider** sur une version reçue. L’action appelle la RPC existante `validate_fleet_certificate_renewal`, puis recharge la fiche et les versions. Le document devient courant seulement après réussite. Une erreur laisse la version reçue visible, affiche le message du serveur et permet de réessayer. Capitaine et Marin peuvent consulter les versions des certificats déjà accessibles dans leur périmètre ; aucune action de validation ne leur est proposée. Les protections RLS et Storage restent appliquées par le serveur.

Le téléchargement groupé de la bibliothèque continue d’utiliser uniquement les documents courants. Une version reçue peut être téléchargée individuellement après **Afficher**. Aucun fichier courant n’est remplacé automatiquement et aucun objet Storage n’est supprimé par ce correctif.

## Validation et déploiement

Frontend uniquement, sans migration ni changement de droits. Déployer avec le client web habituel.

- Régression : ligne sans fichier et ligne avec une version actuelle → téléversement → nouvelle version reçue affichée automatiquement → aperçu signé et téléchargement de son propre fichier → validation explicite → fichier courant disponible dans la bibliothèque.
- Une erreur de lecture après dépôt réussi permet de relire la version reçue, sans nouvel envoi ; un changement de sélection ignore les réponses asynchrones obsolètes.
- Lecture seule : un profil Capitaine voit la version reçue et son aperçu, sans bouton de validation.
- Refus serveur : une erreur de validation est affichée ; la version et le document courant sont conservés.
- Le changement de certificat charge uniquement les versions du certificat sélectionné, avec annulation des résultats asynchrones obsolètes.

Retour arrière : redéployer le frontend précédent. Les données, versions et RPC restent compatibles.
