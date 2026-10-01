# Planning — ajout d’un marin avec des affectations passées

Depuis la version 3.64.5, le filtre actif reconnaît également un mois de référence révolu, indépendamment des jours supplémentaires de la grille. Les affectations historiques existantes restent donc visibles sans devoir ajouter à nouveau le marin. Voir [l’audit des mois de référence](./planning-reference-month-audit.md).

L’ajout manuel dans une bordée conserve sa ligne pour la saisie même lorsque le filtre actif est activé et que ses affectations visibles sont toutes terminées. Les affectations passées restent consultables sur cette ligne ; les autres marins et bordées restent soumis au filtre actif. Les filtres sélectionnés et le mois de référence ne changent pas.

Les événements présents avant l’ajout ne terminent plus immédiatement cette exception. Une nouvelle affectation visible la termine ; supprimer ensuite cette affectation ne réactive pas la ligne vide. Le bouton Actualiser conserve l’exception dans la session et la période en cours. Comme auparavant, elle ne survit pas à la fermeture ou au rechargement complet de la page et ne s’applique pas aux autres périodes.

Un navire sans événement visible conserve son en-tête lorsqu’une ligne de bordée est en attente de saisie. Les restrictions de lecture des profils, les dates d’emploi et les filtres explicites restent appliqués. L’exception de saisie reste réservée aux profils pouvant modifier le planning.

## Déploiement et vérification

Modification frontend uniquement, sans migration ni configuration supplémentaire.

- Avec le filtre actif activé, ajouter Gary LEFEVRE sur LE ROZEL, Bordée 1, alors qu’une affectation passée recouvre encore la grille.
- Vérifier la ligne, ses cases éditables et leur maintien après Actualiser, sans modifier les filtres.
- Saisir une nouvelle affectation, puis la supprimer et vérifier que la ligne vide n’est pas réaffichée.
- Refaire le scénario avec le filtre actif désactivé et vérifier l’en-tête d’un navire sans événement.

Retour arrière : redéployer le frontend précédent ; les données restent compatibles.
