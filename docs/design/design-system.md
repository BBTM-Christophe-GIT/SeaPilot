# Règles de design SeaPilot

Le design de chaque module doit reprendre le même socle visuel. Les besoins métier déterminent la disposition du contenu ; ils ne créent pas une nouvelle charte graphique.

## Sources communes

- `src/styles/design-tokens.css` : valeurs de référence `--sp-*`.
- `src/styles/module-design.css` : composants visuels et adaptations des modules existants.
- `ModuleRibbon`, `AppDialog`, `AppContextMenu` et `UserAvatar` : composants existants à réutiliser.
- [Audit de tous les modules](./module-design-audit.md) : inventaire et périmètre des corrections.

Les deux feuilles communes sont chargées après les styles historiques dans `src/main.tsx`. Les règles d'adaptation ont une spécificité explicite pour rester applicables après le chargement différé d'un module.

## Valeurs obligatoires pour l'interface

| Élément | Règle |
| --- | --- |
| Sidebar, barre supérieure, fond du logo | `--sp-shell` = `#000000`, fond uni |
| Fond de travail | `--sp-canvas` = `#f3f6f9` |
| Panneaux | `--sp-surface` = blanc, bordure `--sp-border`, rayon 8 px |
| Texte / titre / texte secondaire | `--sp-text` / `--sp-heading` / `--sp-muted` |
| Action principale | `--sp-primary` = `#0c5598`, texte blanc |
| Survol / sélection / focus | `--sp-primary-hover` / `--sp-primary-soft` / `--sp-focus` |
| Typographie d'interface | `--sp-font`, pile Inter et polices système |
| Titre de module visible | 28 px, 24 px sous 720 px ; interligne 1,25 |
| Description du module | 14 px, interligne 1,5 |
| Bouton ou champ ordinaire | hauteur minimale 40 px, 44 px au pointeur tactile ; rayon 6 px |
| Espacement | multiples de 4 px ; intervalles habituels 8, 12, 16, 20 et 24 px |
| Ombre | `--sp-shadow`, discrète ; pas d'ombre décorative forte |

Une action identique a la même couleur d'un module à l'autre. Les actions secondaires restent sur fond blanc ; les onglets et filtres actifs utilisent la même famille bleue. Les états désactivés restent visibles. Le focus clavier est toujours visible.

## Modules futurs

1. Réutiliser le shell et sa marge extérieure ; ne pas cumuler des marges de page propres au module.
2. Utiliser `sp-module-header` pour l'en-tête, `sp-panel` pour un panneau, `sp-filters` pour les filtres et `sp-toolbar` pour une barre simple. Utiliser `ModuleRibbon` pour les commandes regroupées et `AppDialog` pour les fenêtres.
3. Utiliser `sp-button` avec `sp-button--primary` ou `sp-button--secondary` pour une action ordinaire. Consommer les tokens `--sp-*` dans les styles spécifiques. Ne pas recopier une palette, police, ombre ou rayon indépendant pour l'interface.
4. Conserver la même hiérarchie : titre et description, commandes existantes, filtres, contenu. La densité, le positionnement et les dimensions des rubans, grilles et frises peuvent répondre aux besoins métier.
5. Vérifier un écran desktop et mobile, le clavier, les actions désactivées, le chargement, les états vide/erreur et les vrais profils concernés avant livraison.

Les adaptations des anciens sélecteurs sont une transition. Un nouveau module doit utiliser les composants/classes communs directement au lieu d'ajouter une nouvelle liste d'exceptions.

## Exceptions métier à préserver

Les urgences, validations, statuts Planning, couleurs des catégories et graphiques conservent leur sens et leur légende. Les PDF, rapports imprimés, courriers, éditeurs de document et modèles A4 conservent leur typographie et leur géométrie propres. Ne pas modifier la taille des cases des grilles temporelles ni rendre visible un titre volontairement masqué.

Une correction de design ne change aucun libellé, action, workflow, donnée, accès, RPC ou règle RLS. La photo du compte utilise le portrait RH privé existant, puis la photo déjà associée au compte ; en son absence ou en cas d'échec, les initiales restent affichées.
