# Design QA — Planning SeaPilot 1.2.0

- Source visual truth: `C:\Users\chris\AppData\Local\Temp\codex-clipboard-f177a116-cec1-4428-a082-e9b9f4d843a7.png`
- Implementation: `http://127.0.0.1:4173/modules/planning`
- Target viewport: desktop 2048 × 1073, planning mensuel, juillet 2026
- State: cockpit chargé avec projets, navires, bordées, équipages et panneau Certificats

## Full-view comparison evidence

La capture source a été ouverte et analysée. L’implémentation locale est compilée et ses interactions sont couvertes par les tests, mais la capture navigateur du rendu réel est temporairement bloquée : la session Supabase disponible sur l’origine locale ne peut pas charger les droits d’accès.

## Focused region comparison evidence

La comparaison ciblée de la barre d’outils, de la grille temporelle et du panneau latéral est différée jusqu’au déploiement Vercel authentifié. Aucun jugement de fidélité final n’est posé depuis le code seul.

## Findings

- [P0] Capture d’implémentation authentifiée manquante.
  - Location: module Planning local.
  - Evidence: le navigateur affiche `Impossible de charger vos droits d'accès` avant le rendu du cockpit.
  - Impact: impossible de valider visuellement la densité, le cadrage, les alignements et les états interactifs.
  - Fix: contrôler le déploiement Vercel avec la session SeaPilot existante, capturer le cockpit mensuel, comparer avec la source puis corriger les écarts P0/P1/P2.

## Comparison history

- Itération 0 : source ouverte ; rendu local bloqué par l’authentification. Aucun correctif visuel spéculatif appliqué.

## Implementation checklist

- Capturer la version Vercel authentifiée à un viewport desktop comparable.
- Tester Mois/Semaine/An, filtres, zoom, panneau latéral, ouverture d’une fiche et plein écran.
- Vérifier les erreurs console.
- Effectuer une comparaison pleine page et des régions barre d’outils/grille/panneau.
- Mettre ce rapport à jour avec `final result: passed` uniquement après correction des écarts bloquants.

## Follow-up polish

- Aucun P3 classé avant la première comparaison visuelle réelle.

final result: blocked
