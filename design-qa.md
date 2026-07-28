# Design QA — ordre numérique décroissant des projets

## Sources et état comparé

- Vérité visuelle — sélecteur Planning : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-d56e0543-44d5-48b7-b507-ea4db32f963f.png`
- Vérité visuelle — portefeuille Projets : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-34c8263a-7c11-4a95-b7e2-61578c1a5763.png`
- Capture navigateur — sélecteur Planning : `C:\CODEX\SeaPilot\.design-qa\project-number-order-planning-picker.png`
- Capture navigateur — portefeuille Projets : `C:\CODEX\SeaPilot\.design-qa\project-number-order-portfolio.png`
- Comparaison combinée : `C:\CODEX\SeaPilot\.design-qa\project-number-order-comparison.png`
- Routes locales :
  - `http://127.0.0.1:4173/modules/planning?preview=1`
  - `http://127.0.0.1:4173/modules/projects?preview=1`
- Viewport navigateur : `1253 × 705` CSS px, densité 1.
- Dimensions : sources `1372 × 1888` px et `1368 × 1531` px ; captures navigateur `1253 × 705` px ; comparaison combinée `1600 × 1050` px.
- État : profil Admin de démonstration, portefeuille sans filtre et sélecteur Planning ouvert sur GOURY au 28/07/2026.

Les sources montrent les deux emplacements à corriger. Elles contiennent davantage de données de production que la prévisualisation locale ; la comparaison porte donc sur l’ordre visible, la structure et les surfaces UI, sans comparer les intitulés dynamiques ligne à ligne.

## Findings

Aucun écart P0, P1 ou P2 ne subsiste.

- Le portefeuille affiche `P902` avant `P901`.
- Le sélecteur Planning affiche également `P902` avant `P901`.
- Les tests avec préfixes mixtes confirment l’ordre `P266`, `P265`, `SP-52`, `SP-49`.
- Les codes sans partie numérique sont placés après les codes numérotés.

## Comparaison complète et focalisée

La comparaison combinée présente les deux sources et les deux implémentations dans un même visuel. Les régions focalisées couvrent les premières lignes de chaque liste, ce qui suffit à contrôler le sens du tri, la conservation des cartes, les statuts, les actions et la densité. Les captures navigateur complètes conservent le contexte SeaPilot et confirment l’absence de régression autour des listes.

## Surfaces de fidélité

- **Polices et typographie** : familles, graisses, tailles, hiérarchie, troncature et lisibilité des codes et titres sont inchangées.
- **Espacement et rythme** : hauteurs de lignes, marges, séparateurs, rayons, badges et alignements restent identiques ; seul l’ordre des enregistrements change.
- **Couleurs et tokens** : bleu marine, bleu d’action, fonds, bordures et couleurs sémantiques des statuts utilisent les tokens existants.
- **Images et ressources** : aucune image produit n’est concernée. Les icônes existantes sont conservées ; aucun actif de substitution n’a été ajouté.
- **Copie et contenu** : les codes, titres, clients, durées, navires et statuts restent issus des données ; aucun libellé fonctionnel n’a été modifié.

## Interactions, accessibilité et résilience

- Portefeuille Projets chargé sans filtre et ordre des boutons vérifié.
- Double-clic sur une case navire, ouverture du sélecteur et ordre des options vérifié.
- Recherche, sélection et ajout restent couverts par les tests existants.
- Les boutons et options conservent leurs rôles et noms accessibles.
- Le comparateur accepte les préfixes mixtes, les zéros initiaux et les numéros dépassant la précision entière JavaScript.
- Aucun log navigateur de niveau `error`.

## Historique de comparaison

### Itération 1 — bloquée

- [P1] Le portefeuille était trié par date et le catalogue Planning par chaîne de caractères. Des codes comme `P266`, `P260` et `SP-52` pouvaient donc apparaître dans un ordre incohérent.
- Correction : comparateur partagé fondé sur la partie numérique, tri décroissant côté portefeuille et catalogue Planning, puis alignement de la RPC Supabase.

### Itération 2 — passée

Les deux captures post-correction présentent le numéro le plus élevé en premier. Aucun écart P0, P1 ou P2 restant.

## Vérifications automatisées

- Tests ciblés : 4 fichiers, 13 tests réussis.
- `npm test -- --run` : 78 fichiers, 554 tests réussis.
- `npm run lint` : réussi.
- `npm run build` : réussi.
- `npx supabase db lint --linked --level warning` : aucune erreur de schéma.

final result: passed
