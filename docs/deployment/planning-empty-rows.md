# Planning — masquer les marins sans affectation dans la période

Dans la vue Flotte, une ligne de marin est affichée uniquement si au moins une affectation, période ou journée non annulée recouvre la plage de dates du calendrier. Les jours visibles du mois suivant comptent également. Une ligne enregistrée dans une bordée ne suffit plus à afficher un marin sans événement dans cette plage.

« Ajouter un marin » maintient temporairement sa ligne vide dans la bordée et la période en cours, y compris si ce marin avait déjà des affectations anciennes. La bordée est dépliée pour permettre la saisie. Plusieurs ajouts restent visibles simultanément ; le bouton Actualiser conserve les lignes en attente.

L’exception prend fin dès qu’une affectation apparaît sur cette ligne. Elle ne s’applique pas à une autre période ni après fermeture ou rechargement de la page. Un marin masqué reste disponible dans « Ajouter un marin ». Les bordées restent accessibles pour effectuer cet ajout. Aucun enregistrement métier n’est supprimé par le masquage.

La vue Équipages conserve ses lignes nécessaires à la consultation des compteurs. Les droits de modification, dates d’emploi et règles de lecture des profils Marin et Capitaine restent appliqués ; l’exception de saisie est réservée aux profils autorisés à modifier le planning.

## Déploiement et vérification

Modification frontend uniquement, sans migration ni nouvelle variable d’environnement.

- Contrôler les limites inclusives de la période, les affectations annulées et les lignes persistantes sans événement.
- Ajouter un marin déjà affecté dans le passé, actualiser, puis saisir une affectation sur sa ligne vide.
- Vérifier qu’une autre période sans affectation masque le marin et que la suppression de sa nouvelle affectation ne réactive pas l’exception de saisie.
- Vérifier les tests du planning, les profils Marin/Capitaine et la compilation de production.

Retour arrière : redéployer le frontend précédent ; les données restent compatibles.
