# QA visuelle - Offre commerciale projet

## Référence et captures

- Référence utilisateur : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-56ba82ae-e35a-4961-98ac-6dce2a8e3ec4.png`
- Comparaison référence / implémentation : `docs/design/project-offer-reservations-comparison.png`
- Formulaire Offre Commerciale : `docs/design/project-offer-reservations-form.png`
- Carte Réserves commerciales et aperçu conditionnel : `docs/design/project-offer-reservations-operation.png`
- Bas de l’aperçu avec réserves et signatures : `docs/design/project-offer-reservations-preview.png`
- Vérification desktop : 1530 x 949 px, identique à la capture de référence.

## Contrôles réalisés

- La structure visuelle existante de la fenêtre Nouveau projet, la navigation latérale et l’aperçu A4 sont conservés.
- L’aperçu redondant sous Identité armateur est supprimé.
- L’ordre vertical demandé est respecté : Identité armateur, Loyer d’affrètement, Frais de mobilisation, Frais de démobilisation, Devise des frais, Fuel.
- Chaque champ de cette séquence occupe toute la largeur de la carte.
- La carte Réserves commerciales est intégrée dans Opérations avec les deux cases à cocher et le champ Autre réserve.
- Le cartouche orangé n’apparaît que lorsqu’au moins une réserve est sélectionnée ou saisie.
- Le rectangle Budget indicatif de la mission est absent de l’aperçu et du PDF généré.
- La zone finale est divisée en deux cadres Armateur et Client. Le cadre Armateur reprend l’émetteur et sa fonction RH, avec sa signature active lorsqu’elle existe.
- Le PDF de contrôle a été rendu avec Poppler : format A4, une seule page, marges régulières, aucun chevauchement et aucun texte coupé.
- Le scénario sans réserve a également été rendu : aucun cartouche orangé vide n’est produit et les signatures restent alignées.

## Écarts intentionnels par rapport à la référence

- Les champs tarifaires sont désormais empilés sur toute la largeur conformément à la demande, alors que la référence utilisait deux colonnes.
- Le panneau PDF remplace le budget par une présentation directe des conditions commerciales et ajoute les deux cadres de signature.

final result: passed
