# Design QA — empilement des projets sur une ligne navire

## Sources et état comparé

- Vérité visuelle : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-5e879b3e-c7c7-4300-b62f-18daaaaa1dff.png`
- Capture navigateur : `C:\CODEX\SeaPilot\.design-qa\planning-project-stacks-full.png`
- Comparaison combinée : `C:\CODEX\SeaPilot\.design-qa\planning-project-stacks-comparison.png`
- Route locale : `http://127.0.0.1:4173/modules/planning?preview=1`
- Viewport : `1672 × 941` CSS px, densité 1.
- Dimensions : source `1818 × 280` px ; capture complète `1672 × 941` px ; région d’implémentation comparée `1672 × 260` px.
- État : profil Admin de démonstration, vue Flotte, ligne GOURY, projet long « AFFECTATION NAVIRE GOURY » et projet P901 planifié le 28/07/2026.

La vérité visuelle montre l’anomalie à corriger, avec deux projets placés sur la même hauteur. La capture navigateur montre le résultat demandé : les deux blocs restent sur la ligne GOURY mais occupent deux sous-lignes distinctes.

## Findings

Aucun écart P0, P1 ou P2 ne subsiste.

- Le premier projet occupe la sous-ligne `0`, de `top = 570` à `bottom = 593`.
- Le second projet occupe la sous-ligne `1`, de `top = 597` à `bottom = 620`.
- Les rectangles ne se chevauchent plus et conservent un espacement vertical de 4 px.
- La ligne déclare `data-project-stack-count="2"` et s’agrandit pour contenir les projets et les visites existantes.

## Comparaison complète et focalisée

La comparaison combinée réunit la capture fournie et la région GOURY rendue dans le navigateur. Une comparaison focalisée suffit ici : le changement ne concerne ni la navigation, ni l’en-tête, ni les autres lignes du Planning. La capture complète reste conservée pour vérifier le contexte, la hauteur de ligne et l’absence de collision avec la bordée suivante.

## Surfaces de fidélité

- **Polices et typographie** : la famille, les poids, les tailles, la troncature et le contraste des libellés de projets existants sont inchangés.
- **Espacement et rythme** : les projets sont séparés par 4 px ; chaque sous-ligne supplémentaire ajoute 27 px. La ligne navire s’étend automatiquement et les visites sont repoussées sous l’ensemble des projets.
- **Couleurs et tokens** : les bleus de statut, fonds, bordures, anneaux de sélection et états du Planning utilisent les tokens existants sans dérive.
- **Images et ressources** : aucune image n’est concernée et aucun actif de substitution n’a été ajouté. Les poignées et icônes existantes restent intactes.
- **Copie et contenu** : les codes, titres, statuts, dates et libellés accessibles restent issus des données Planning.

## Interactions, accessibilité et résilience

- Double-clic sur la case GOURY du 28/07/2026, sélection de P901 et ajout au Planning testés dans le navigateur.
- Les blocs empilés conservent leurs boutons, libellés accessibles, poignées d’extension et comportement de déplacement.
- L’algorithme réutilise la première sous-ligne disponible lorsqu’un projet suivant ne chevauche plus les précédents.
- Les visites navire sont décalées sous toutes les sous-lignes projet.
- Aucun log navigateur de niveau `error`.

## Historique de comparaison

### Itération 1 — bloquée

- [P1] Deux projets se chevauchaient sur la même ligne visuelle, masquant une partie des blocs et leurs interactions.
- Correction : calcul d’intervalles visibles, attribution automatique de la première sous-ligne libre, hauteur dynamique de la ligne, aperçu de déplacement aligné et décalage des visites.

### Itération 2 — passée

La comparaison post-correction montre deux projets lisibles sur des sous-lignes distinctes. Aucun écart P0, P1 ou P2 restant.

## Vérifications automatisées

- Test ciblé de l’algorithme : empilement de deux intervalles chevauchants et réutilisation d’une sous-ligne libérée.
- Test ciblé du rendu : sous-lignes `0` et `1`, marges verticales `7 px` et `34 px`, hauteur de ligne dynamique.
- `npm test -- --run` : 76 fichiers, 521 tests réussis.
- `npm run lint` : réussi.
- `npm run build` : réussi.

final result: passed
