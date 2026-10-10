# Règles de design SeaPilot

Le design de chaque module doit reprendre le même socle visuel. Les besoins métier déterminent la disposition du contenu ; ils ne créent pas une nouvelle charte graphique.

## Sources communes

- `src/styles/design-tokens.css` : valeurs de référence `--sp-*`.
- `src/styles/module-ribbon.css` : dessin commun des rubans de commandes, issu du Planning.
- `src/styles/module-design.css` : composants visuels et adaptations des modules existants.
- `ModuleRibbon`, `AppDialog`, `AppContextMenu` et `UserAvatar` : composants existants à réutiliser.
- [Audit de tous les modules](./module-design-audit.md) : inventaire et périmètre des corrections.

Les feuilles communes sont chargées après les styles historiques dans `src/main.tsx`. Les règles d'adaptation ont une spécificité explicite pour rester applicables après le chargement différé d'un module. Une entrée autonome, comme la préversion Projets, charge également les tokens et les styles de ruban lorsqu'elle utilise ces composants.

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

## Boutons et menus dans toutes les pages

Le ruban du module Planning est la référence pour les commandes de module. Cette règle s'applique à toute nouvelle page et à toute barre de commandes retravaillée. Elle ne déclenche pas une refonte automatique des modules existants et ne modifie pas les dimensions du Planning.

### Commandes de module : un ruban commun

Regrouper les commandes de même niveau dans une seule barre placée sous le titre du module, en privilégiant toujours une seule rangée de boutons pour les nouvelles utilisations et les barres retravaillées. Utiliser `ModuleRibbon` avec la propriété `singleRow`, `ModuleRibbonGroup` et `ModuleRibbonCommand` ; ne pas créer une famille de boutons propre à chaque page. Un groupe correspond à une famille métier de commandes, par exemple « Catalogue », la gestion du projet ou les documents. Les onglets de navigation et les filtres conservent leurs composants dédiés.

| Élément | Règle du ruban Planning |
| --- | --- |
| Barre | Fond blanc `--sp-surface`, bordure fine de 1 px `--sp-border`, rayon de panneau `--sp-panel-radius`, ombre discrète `--sp-shadow` |
| Groupes | Séparateur vertical de 1 px ; aucun séparateur après le dernier groupe ; espacement de base 3 px en haut et 4 px sur les côtés |
| Commande | Icône centrée au-dessus du texte ; fond transparent et bordure transparente au repos ; rayon `--sp-control-radius` ; aucune tuile pleine bleue dans le ruban |
| Dimensions de référence | Colonne de 78 px, commande d'au moins 65 px de haut ; zone d'icône de 28 × 25 px avec pictogramme de 22 px dans Planning |
| Texte de commande | Libellé visible, centré, court, pouvant occuper jusqu'à trois lignes ; reprendre la typographie du composant commun |
| Nom de groupe | Sous les commandes, sur une ligne de 20 px ; centré, en capitales, couleur secondaire `--sp-muted` |
| Couleurs | Icônes `--sp-primary`, texte de la charte ; survol et sélection `--sp-primary-soft` avec bordure `--sp-border-strong` |
| Organisation | Une rangée de 65 px avec `singleRow`, dans une barre d'au moins 90 px ; conserver les deux rangées existantes du Planning et les exceptions justifiées par les besoins métier |

L'icône aide à reconnaître la commande ; elle ne remplace pas son libellé. Conserver les pictogrammes existants lorsqu'ils représentent déjà la bonne action. Le badge de compteur reste attaché à l'icône et conserve son sens métier ; il ne sert pas de décoration.

La propriété `singleRow` applique le mode commun `.is-single-row`. Sur une largeur insuffisante, les commandes restent sur la même rangée et le ruban défile horizontalement. Ne pas provoquer un retour automatique sur une deuxième rangée ni réduire les dimensions des boutons pour faire entrer toutes les commandes. Le Planning actuel garde son organisation sur deux rangées ; une exception métier existante n'est pas modifiée par l'ajout de cette règle.

Une commande qui ouvre un menu garde le même dessin que les autres commandes du ruban. Son état ouvert est visible, son bouton expose `aria-expanded` et `aria-haspopup`, et son menu utilise les composants de menu existants. Les entrées du menu conservent leurs libellés, ordre métier et conditions d'accès. Une commande directement disponible n'acquiert pas un menu inutile pour satisfaire le dessin.

### Actions dans le contenu et les formulaires

Réserver `sp-button` aux actions du contenu, aux formulaires et aux confirmations : enregistrer une fenêtre, annuler, confirmer une opération ou agir sur une ligne. Utiliser `sp-button--primary` pour l'action principale de ce contexte, en bleu `--sp-primary` avec texte blanc ; utiliser `sp-button--secondary` pour les actions secondaires sur fond blanc avec bordure. Garder une hauteur minimale de 40 px, 44 px au pointeur tactile, et le rayon `--sp-control-radius`.

Les barres d'actions locales, comme celle de la facturation mensuelle, gardent leur disposition compacte horizontale. Privilégier également une seule ligne de boutons et, si nécessaire, un défilement horizontal contenu sur petit écran. Le ruban organise les commandes du module ; il ne remplace pas chaque barre d'actions située dans son contenu.

Un bouton du contenu peut placer une icône à gauche du texte. Les actions destructrices gardent leur traitement et leur confirmation existants. Les boutons qui n'affichent qu'une icône sont réservés aux actions locales déjà explicites dans leur contexte ; ils ont un nom accessible et une cible de taille suffisante. Les onglets et cellules du Planning conservent leur rôle métier ; une pastille de statut interactive suit l'exception explicite du portefeuille Projets ci-dessous.

### Actions contextuelles des cartes Projet

Le portefeuille Projets place Modifier et Favori sur chaque carte pour agir directement sur ce projet, indépendamment du dossier sélectionné. Modifier garde un libellé visible ; Favori peut utiliser une étoile, avec un nom accessible comprenant l'action et le projet, ainsi que `aria-pressed`. Séparer ces commandes du bouton qui sélectionne la carte : aucun `button` ne contient un autre bouton, une pastille interactive ou une commande de favori.

Les cartes reprennent le dessin dense existant : Modifier et les pastilles interactives peuvent mesurer 32 px de haut sur ordinateur. Les commandes de carte conservent une cible d'au moins 44 px au pointeur tactile, y compris l'étoile. Cette exception locale ne réduit ni les boutons ordinaires de 40 px ni les commandes du ruban. Le focus utilise les tokens communs, et les états chargement/désactivé restent visibles.

À la demande explicite de l'utilisateur, la pastille de statut Projet peut devenir un vrai bouton pour ouvrir le choix de statut. Elle conserve la forme et le sens de la pastille métier, son libellé, ses couleurs de statut et un indicateur d'ouverture. La préversion utilise un menu avec `aria-haspopup` et `aria-expanded` ; le module réel utilise son dialogue existant. Le libellé accessible identifie le projet, Échap ferme le choix et le focus revient au déclencheur. Les comptes qui ne peuvent pas gérer le projet voient le statut en lecture seule.

Le choix reprend les cinq statuts métier existants et une commande Clôturer, confirmée. Clôturé est l'affichage d'un projet archivé, pas un nouveau statut métier ; Réactiver conserve le statut précédent. Ces actions, leurs droits et leurs contrôles serveur sont documentés et testés comme des changements fonctionnels autorisés, distincts d'une simple harmonisation des boutons.

### États, clavier et petits écrans

- Utiliser un vrai `button` pour une action et un lien pour une navigation. Donner un nom accessible au ruban et à chaque groupe, comme le font les composants communs.
- Afficher le focus avec `--sp-focus`. Les commandes restent accessibles par Tab ; un menu permet l'ouverture au clavier, la fermeture par Échap et le retour du focus sur son bouton.
- Une action désactivée conserve son emplacement et reste identifiable, avec `disabled` et le traitement atténué du composant. Une action interdite par les droits conserve sa règle de visibilité existante. Un chargement expose son état sans autoriser une deuxième exécution.
- Sur petit écran, conserver la rangée unique, les groupes, leurs noms et l'ordre des commandes ; faire défiler le ruban horizontalement dans son propre conteneur sans élargir la page. Les exceptions existantes, dont les deux rangées du Planning, gardent leur organisation. Ne pas compacter en supprimant les libellés ou en rétrécissant les cibles tactiles.
- Vérifier les commandes au repos, au survol, au focus, désactivées et avec un menu ouvert sur desktop et mobile. Une harmonisation visuelle préserve les gestionnaires d'action, les données, les confirmations, les droits et les règles métier.

## Modules futurs

1. Réutiliser le shell et sa marge extérieure ; ne pas cumuler des marges de page propres au module.
2. Utiliser `sp-module-header` pour l'en-tête, `sp-panel` pour un panneau, `sp-filters` pour les filtres et `sp-toolbar` pour une barre simple. Utiliser `ModuleRibbon` avec `singleRow` pour les commandes regroupées et `AppDialog` pour les fenêtres.
3. Utiliser `sp-button` avec `sp-button--primary` ou `sp-button--secondary` pour une action ordinaire. Consommer les tokens `--sp-*` dans les styles spécifiques. Ne pas recopier une palette, police, ombre ou rayon indépendant pour l'interface.
4. Conserver la même hiérarchie : titre et description, commandes existantes, filtres, contenu. La densité, le positionnement et les dimensions des rubans, grilles et frises peuvent répondre aux besoins métier.
5. Vérifier un écran desktop et mobile, le clavier, les actions désactivées, le chargement, les états vide/erreur et les vrais profils concernés avant livraison.

Les adaptations des anciens sélecteurs sont une transition. Un nouveau module doit utiliser les composants/classes communs directement au lieu d'ajouter une nouvelle liste d'exceptions.

## Exceptions métier à préserver

Les urgences, validations, statuts Planning, couleurs des catégories et graphiques conservent leur sens et leur légende. Les PDF, rapports imprimés, courriers, éditeurs de document et modèles A4 conservent leur typographie et leur géométrie propres. Ne pas modifier la taille des cases des grilles temporelles ni rendre visible un titre volontairement masqué.

Une correction strictement visuelle ne change aucun libellé, action, workflow, donnée, accès, RPC ou règle RLS. Une demande explicite portant sur le fonctionnement, comme les statuts interactifs et la clôture/réactivation des projets, se traite avec ses contrôles et validations métier. La photo du compte utilise le portrait RH privé existant, puis la photo déjà associée au compte ; en son absence ou en cas d'échec, les initiales restent affichées.
