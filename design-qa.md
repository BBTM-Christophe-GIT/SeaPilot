# Design QA — Planning SeaPilot 1.4.0

- Source visuelle : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-6bd8309b-8891-47c5-be97-460bb1c28778.png`
- Implémentation contrôlée : `https://sea-pilot-ten.vercel.app/modules/planning`
- Capture d’implémentation : `docs/design/planning-dialog-production.png`
- Comparaison normalisée : `docs/design/planning-dialog-comparison.png`
- Viewport de production : 2560 × 1249.
- Comparaison focalisée : fenêtre `Modifier · Benjamin BON`, normalisée à 1128 × 841 comme la référence.
- État : production authentifiée en Administrateur, vue mensuelle juillet 2026, éditeur d’une affectation ouvert, version 1.4.0.

## Comparaison visuelle

La référence et l’implémentation ont été réunies dans la même image de comparaison. La fenêtre conserve la hiérarchie, les dimensions relatives, les espacements, les champs, les actions et les couleurs SeaPilot de la référence. L’implémentation reste un dialogue centré au-dessus du planning afin de conserver le contexte de travail.

Le contrôle focalisé confirme que `Bordée / groupe` est maintenant un sélecteur cohérent avec les autres champs. Les options visibles en production sont `Affectation`, `Armement`, `Bordée 1`, `Bordée 2` et `Flying Crew`.

## Surfaces de fidélité obligatoires

- Typographie : famille, graisse, hiérarchie des libellés et lisibilité des valeurs conformes au système SeaPilot ; aucune troncature dans le dialogue.
- Espacement et rythme : grille Navire / dates / statut, fonction, bordée, annotation et actions alignée ; marges, rayons et hauteur des champs homogènes.
- Couleurs et tokens : bleu primaire, fonds de champs, danger Supprimer et voile modal cohérents ; vert `En Mer`, jaune `À Terre` et rouge conflit visibles dans le planning derrière la fenêtre.
- Images et icônes : icônes Lucide du produit conservées ; aucun actif de référence n’a été remplacé par un dessin CSS ou un glyphe improvisé.
- Copie et contenu : libellés métier français conservés ; `Bordée / groupe` devient un choix contrôlé sans modifier les autres contenus.

## Interactions vérifiées

- La version `v1.4.0` et le build `2026-07-13.0737` sont visibles en production.
- Une période de Benjamin BON ouvre bien la fenêtre de modification.
- Le champ `Bordée / groupe` est exposé comme `combobox` avec cinq options issues du planning.
- La légende `En mer · À terre · Conflit` et l’aide `Clic = ajouter · Glisser = déplacer · Poignées = étendre` sont visibles.
- Les actions Supprimer, Annuler et Enregistrer sont présentes et accessibles.
- Les écritures réelles de clic, déplacement et redimensionnement n’ont pas été déclenchées pendant le contrôle visuel de production afin de ne pas modifier les données ; elles sont couvertes par les tests automatisés.
- Aucun message d’erreur applicatif SeaPilot observé. Les messages de console restants proviennent du canal de l’extension Chrome.

## Vérifications automatisées

- 197 tests Vitest réussis avec `npm test -- --maxWorkers=2`.
- Build TypeScript/Vite de production réussi.
- GitHub Actions, pull request #13 et déploiement Vercel de `df48510fcbce3234e5b9bc69edd4f05585ce7f38` réussis.

## Historique de comparaison

- Passage 1 : source et production comparées dans le même visuel ; aucun écart P0, P1 ou P2 relevé.
- Aucun correctif visuel supplémentaire requis après la comparaison focalisée. La valeur `Affectation` diffère de la valeur `Armement` de la référence car elle correspond à la donnée réellement enregistrée pour Benjamin BON, pas à un écart de composant.

## Constats

- Aucun écart P0, P1 ou P2 restant.
- Aucun cadrage focalisé supplémentaire requis : tous les champs, la liste de bordée, l’annotation et les actions sont lisibles dans la comparaison principale.
- P3 possible : enrichir ultérieurement l’aide gestuelle par une aide contextuelle au premier usage.

final result: passed
