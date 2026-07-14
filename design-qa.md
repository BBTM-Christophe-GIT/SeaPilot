# Design QA — Planning flotte v3.1.1

## Sources

- Référence utilisateur : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-cd4d6665-107a-41b8-b306-bb9d1b68d0a4.png`
- Implémentation : `https://sea-pilot-jmpos7i12-bbtm-app.vercel.app/modules/planning`
- Capture de la préversion : `C:\Users\chris\.codex\visualizations\2026\07\14\sea-pilot-planning-v3-1-1\preview-login-blocker.png`

## État et viewport

- Référence : 2331 × 1260, vue Flotte mensuelle avec arborescence navire / bordée / marin.
- Préversion : capture Chrome au viewport courant après réinitialisation de l'override responsive.
- État atteint : redirection vers `/login` ; la session de production n'est pas partagée avec l'hôte de préversion.
- Console de la page de connexion : aucune erreur ni alerte.

## Comparaison

### Vue complète

La référence et la capture de préversion ont été ouvertes ensemble dans la même entrée de comparaison. La capture de préversion ne contient que l'écran de connexion SeaPilot ; la vue Planning authentifiée n'est donc pas comparable.

### Zones ciblées

- Arborescence navire / bordée / marin : non observable sur la préversion sans authentification.
- Masquage des navires sans marin : non observable sur la préversion sans authentification.
- Libellé `Nouveau projet` : non observable sur la préversion sans authentification.
- Composition du menu `Actions` : non observable sur la préversion sans authentification.

## Preuves automatisées

- Tests React : présence de la hiérarchie, masquage des navires sans équipage, repli/dépli des niveaux et contenu du menu `Actions`.
- Tests ciblés : 40 réussis.
- Suite complète : 342 réussis.
- TypeScript, lint et build de production : réussis.

## Findings

- [P1] La préversion nécessite une nouvelle authentification SeaPilot. Cette barrière empêche la comparaison visuelle et les interactions manuelles sur la vue Planning déployée.
- Aucun finding visuel de sévérité P0/P1/P2 ne peut être établi sur l'interface Planning tant que cette authentification n'est pas réalisée.

## Historique de comparaison

1. Itération 1 — préversion ouverte à la taille de la référence ; redirection immédiate vers `/login`.
2. Capture du blocage enregistrée ; DOM confirmé sur le formulaire de connexion ; console sans erreur.
3. Contrôle visuel interrompu avant la vue Planning afin de ne pas utiliser ni demander de secrets.

## Résultat

final result: blocked

Blocker : authentification requise sur l'hôte de préversion avant de pouvoir capturer et valider la vue Planning.
