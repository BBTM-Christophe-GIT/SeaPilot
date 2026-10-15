# Recherche et sélection d’une personne dans le suivi du temps

La recherche et la sélection d’un registre pouvaient démonter toute l’application lorsqu’un calcul serveur contenait une alerte `amplitude` ou `rest_interval`. Le moteur de calcul v4 émet ces codes ; l’interface supposait que toutes les alertes appartenaient à son ancien catalogue et tentait de lire une règle absente.

Le catalogue d’affichage prend désormais en charge les deux motifs. Il conserve le verdict de conformité et lit les seuils `max_amplitude_hours` et `max_interval_between_rests_hours` de la politique applicable. Les durées mesurées de ces deux alertes ne sont pas stockées dans les fenêtres de calcul : elles restent indisponibles dans l’affichage, sans substitution par le temps travaillé, une valeur zéro ou un seuil par défaut. Les autres motifs conservent leurs mesures, leur attribution et leur fenêtre d’analyse existantes.

Un code serveur futur ou inconnu reste une alerte visible avec le verdict reçu. Son attribution utilise la date explicite du calcul ; aucune fenêtre d’analyse ni durée n’est inventée. La résolution d’une règle vérifie les propriétés propres du catalogue, y compris pour des codes ressemblant à des propriétés JavaScript héritées. Cette protection s’applique aussi à la vue mensuelle, qui utilise les mêmes fonctions de conformité.

Les lecteurs conservent les codes bruts dans le suivi et le rapport de conformité. Aucun calcul, créneau, registre, commentaire, signature ou droit d’accès n’est modifié ou recalculé par cette correction. Aucune migration n’est nécessaire : les deux colonnes de seuils existent depuis la migration du moteur v4.

## Vérifications

- Tests des deux motifs serveur, seuils non standards, mesures absentes, anciens motifs et codes inconnus.
- Tests des parcours recherche et clic sur une personne, puis retour à une autre personne, sans écriture d’heures ni validation.
- Régressions des requêtes, du rapport et du PDF ; recette navigateur avec données synthétiques sur ordinateur et mobile.

```powershell
corepack pnpm test src/features/workingTime/workingTimeCompliance.test.ts src/features/workingTime/workingTimeQueries.test.ts src/features/workingTime/WorkingTimeWorkflowPanel.test.tsx src/features/workingTime/WorkingTimeEntryBoard.test.tsx src/features/workingTime/workingTimePdf.test.ts src/features/workingTime/workingTimeComplianceReportModel.test.ts --pool=threads --maxWorkers=1
corepack pnpm build
```
