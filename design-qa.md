# Design QA — harmonisation Flotte / Équipages

## Sources

- Référence Flotte avant harmonisation : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-653befc2-a574-4cd0-9be8-323eff4bca01.png`
- Référence visuelle Équipages : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-75546dae-4306-4c62-bba9-74af28a3c33e.png`
- Capture utilisateur des cases vertes avant correction : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-5ccc95d5-1ca3-4f49-816d-a54f93cd54cc.png`
- Référence ciblée de barre continue : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-f3edcf54-4aea-4954-88ef-a91cfc7ade79.png`
- Implémentation : `https://sea-pilot-git-codex-flotte-design-equipages-bbtm-app.vercel.app/modules/planning`
- Capture navigateur de l’implémentation : non disponible dans cette session.

## État et viewport

- État cible : vue Flotte active, échelle Mois, arborescence navire → bordée → marin dépliée.
- Viewport cible principal : 1235 × 658, dimensions de la référence fournie.
- Viewports complémentaires prévus : 1440 × 900 et 1366 × 1024.
- Déploiement Vercel Preview : prêt et route directe en HTTP 200.
- Données : jeu de démonstration local et non persistant du mode Preview SeaPilot.

## Comparaison complète

Les deux images de référence ont été ouvertes et inspectées. La capture navigateur de l’implémentation n’a pas pu être produite : le navigateur intégré est listé mais son outil de contrôle n’est pas exposé dans cette session. L’autorisation d’utiliser Playwright comme solution de repli a été demandée à l’utilisateur et n’a pas encore été reçue.

La comparaison visuelle source / rendu ne peut donc pas être déclarée réussie à partir du code, des tests ou du statut du déploiement seuls.

## Zones ciblées

- Typographie : implémentation préparée avec les mêmes tailles compactes que la vue Équipages ; contrôle visuel bloqué.
- Espacement et rythme : lignes Flotte réduites à 50 px, bordées et marins à 42 px ; contrôle visuel bloqué.
- Couleurs : accent vert d’eau et compteurs harmonisés avec Équipages ; contrôle visuel bloqué.
- Barres : projets réduits à 23 px avec libellé centré et poignées compactes ; contrôle visuel bloqué.
- Cases quotidiennes : hauteur de 23 px, aucun séparateur entre les jours d’un même segment, fond continu, poignées aux extrémités et nom du navire centré en l’absence de commentaire visible ; contrôle visuel après correction bloqué.
- Copie : aucun libellé métier ajouté, retiré ou renommé.
- Icônes : les icônes Lucide existantes sont conservées ; aucune ressource de substitution n’a été créée.
- Responsive : règles existantes conservées, mais les viewports cible n’ont pas été capturés.

## Validation fonctionnelle

- `npm run lint` : réussi.
- `npm test` : 64 fichiers et 447 tests réussis.
- `npm run build` : réussi.
- Clic gauche sur un projet Flotte : sélection testée.
- Double-clic sur un projet Flotte : ouverture du formulaire complet testée.
- Clic gauche, clic droit et double-clic sur les affectations Flotte : tests existants réussis.
- Vercel Preview : la branche `codex/flotte-design-equipages` est redéployée après chaque mise à jour de cette QA.

## Findings

- [P1] Comparaison visuelle de l’implémentation indisponible.
  - Emplacement : vue Flotte complète et barres de projet.
  - Évidence : les références sont disponibles, mais aucune capture navigateur du rendu ne peut être ouverte dans la même comparaison.
  - Impact : la densité, les alignements, les débordements et la fidélité des couleurs ne peuvent pas recevoir un sign-off visuel fiable.
  - Correctif : capturer la Preview aux trois viewports prévus avec le navigateur intégré ou Playwright autorisé, ouvrir les captures avec les références, puis corriger les écarts P0/P1/P2.

## Historique de comparaison

1. Références Flotte et Équipages ouvertes à leur résolution d’origine.
2. Implémentation, tests et build terminés.
3. Déploiement Vercel Preview réussi et route vérifiée en HTTP 200.
4. Capture navigateur bloquée par l’absence de l’outil de contrôle du navigateur intégré ; autorisation Playwright en attente.
5. La capture utilisateur suivante a isolé un P2 visuel : cases vertes encore trop épaisses et carrées. Le CSS a été aligné sur les barres Équipages ; une nouvelle capture reste nécessaire pour confirmer la correction.
6. La référence ciblée suivante demande une barre totalement continue. Les bordures et ombres par case ont été retirées ; une couche de barre et un libellé non interactifs ont été ajoutés derrière/au-dessus des boutons quotidiens afin de préserver tous les gestes.

## Résultat

final result: blocked
