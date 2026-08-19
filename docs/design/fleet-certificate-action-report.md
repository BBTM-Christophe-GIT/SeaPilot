# Rapport Certificats Flotte - Plan d'Action

Le dialogue **Générer un rapport** du module Certificats flotte propose un périmètre **Liste des documents**. Ce périmètre accepte un ou plusieurs navires et conserve les autres périmètres historiques : flotte, navire, catégorie, document et écart.

Le contenu du PDF est indépendant du périmètre. L'utilisateur peut éditer :

- la liste des documents uniquement ;
- la liste des écarts uniquement ;
- les deux listes dans le même rapport.

Au moins un contenu doit être sélectionné. Pour le périmètre Liste des documents, au moins un navire doit également être sélectionné.

## Liste documentaire

Le tableau présente le navire, la catégorie, le document, la date d'échéance et un indicateur binaire :

- **Échu** lorsque la date d'échéance est antérieure à la date d'édition du rapport ;
- **Valide** dans les autres cas, y compris lorsqu'aucune échéance n'est renseignée.

## Identité du rapport

Le titre visible et les métadonnées PDF utilisent **Certificats Flotte - Plan d'Action**. Le générateur retire sans distinction de casse le mot `Seapilot` de tous les textes injectés dans le rapport, y compris les titres documentaires, les constats, les suivis et les légendes de pièces jointes.

Le nom de fichier suit le format `BBTM-Certificats-Flotte-Plan-d-Action-AAAA-MM-JJ.pdf`.
