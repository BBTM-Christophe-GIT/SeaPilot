# Rapport Certificats Flotte - Plan d'Action

Le dialogue **Générer un rapport** du module Certificats flotte propose un périmètre **Liste des documents**. Ce périmètre accepte un ou plusieurs navires et conserve les autres périmètres historiques : flotte, navire, catégorie, document et écart.

Le contenu du PDF est indépendant du périmètre. L'utilisateur peut éditer :

- la liste des documents uniquement ;
- la liste des écarts uniquement ;
- les deux listes dans le même rapport.

Au moins un contenu doit être sélectionné. Pour le périmètre Liste des documents, au moins un navire doit également être sélectionné.

## Liste documentaire

Le rapport commence par une page de synthèse. Chaque navire commence ensuite sur une nouvelle page et aucun autre navire ne partage ses pages. Si le contenu d'un navire dépasse une feuille, les pages suivantes portent la mention **Suite**.

Dans chaque navire, les documents sont regroupés par catégorie dans un tableau **Suivi documentaire** présentant le document, l'échéance et un indicateur binaire :

- **Échu** lorsque la date d'échéance est antérieure à la date d'édition du rapport ;
- **Valide** dans les autres cas.

Lorsqu'aucune date d'échéance n'est renseignée, la colonne Échéance affiche **Validité illimitée** et l'état reste **Valide**.

## Écarts et actions

Lorsque la liste des écarts est incluse, chaque catégorie enchaîne immédiatement après son tableau documentaire :

- une synthèse **Écarts & actions** liée aux documents de cette catégorie ;
- le détail de chaque écart ;
- son suivi de traitement et ses éventuelles preuves photographiques.

La liste globale des écarts séparée des navires et catégories n'est plus utilisée. En mode **Liste des écarts uniquement**, la même organisation par navire et catégorie est conservée sans afficher le tableau documentaire.

## Identité du rapport

Le titre visible et les métadonnées PDF utilisent **Certificats Flotte - Plan d'Action**. Le générateur retire sans distinction de casse le mot `Seapilot` de tous les textes injectés dans le rapport, y compris les titres documentaires, les constats, les suivis et les légendes de pièces jointes.

Le nom de fichier suit le format `BBTM-Certificats-Flotte-Plan-d-Action-AAAA-MM-JJ.pdf`.
