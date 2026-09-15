# Planning — cases Équipages (3.39.8)

Les extrémités et les cases centrales des périodes de la vue Équipages ont une hauteur commune de 28 px. Les poignées de redimensionnement restent accessibles et prennent la couleur du statut journalier correspondant. Le libellé général d’une affectation ne se superpose plus au libellé journalier retenu dans Flotte.

Le simple clic sur une case vide ne crée plus de carré vert. Le double clic ajoute une journée sur le dernier navire connu dans la période affichée, ou le prochain si aucun ne précède la case ; le formulaire complet reste disponible lorsque le navire n’est pas connu. La saisie reprend la bordée et la fonction du contexte. Le statut initial est En Mer, ou A Terre pour un sédentaire ou une ligne Armement. Les périodes historiques dont le navire n’était identifié que par son nom sont raccordées au navire existant pour cette saisie.

Arrêt Maladie est disponible dans les formulaires complets de création et de modification, en plus du menu journalier existant.

## Christophe MINASSIAN

La lecture des données de production montre une affectation active 545 du 3 au 11 septembre 2026, avec neuf corrections journalières Arrêt Maladie. Le statut général historique Arrêt de travail apparaissait encore en rouge derrière ces corrections. Le rendu affiche désormais leur statut Arrêt Maladie sur toute la période, y compris ses extrémités. L’affectation 594, déjà annulée, reste exclue. Aucune suppression de données ni migration n’est nécessaire.

## Validation

Tests d’intégration du simple/double clic, du statut Arrêt Maladie et des anciennes périodes ; tests du rendu uniforme ou mixte des statuts journaliers et de la conservation des véritables conflits. Vérification des dimensions dans le navigateur, lint et build de production.
