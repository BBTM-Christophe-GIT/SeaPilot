# Design QA — Planning flotte v3.1.2

## Sources

- Référence utilisateur : `C:\Users\chris\AppData\Local\Temp\codex-clipboard-cd4d6665-107a-41b8-b306-bb9d1b68d0a4.png`
- Implémentation : `https://sea-pilot-dlhxv1131-bbtm-app.vercel.app/modules/planning`
- Capture ordinateur : `C:\Users\chris\.codex\visualizations\2026\07\14\sea-pilot-planning-v3-1-2\planning-preview-desktop-1440x900.png`
- Capture menu Actions : `C:\Users\chris\.codex\visualizations\2026\07\14\sea-pilot-planning-v3-1-2\planning-preview-actions-open-1440x900.png`
- Capture iPad 12,9 pouces : `C:\Users\chris\.codex\visualizations\2026\07\14\sea-pilot-planning-v3-1-2\planning-preview-ipad-1366x1024.png`

## État et viewports

- Référence : 2331 × 1260, vue Flotte mensuelle avec arborescence navire / bordée / marin.
- Ordinateur : 1440 × 900, vue Flotte mensuelle du 29/06/2026 au 16/08/2026.
- iPad 12,9 pouces : 1366 × 1024, même vue et mêmes données.
- Préversion : ouverture de `/login` redirigée directement vers `/modules/planning`, sans formulaire d'authentification SeaPilot.
- Données : jeu de démonstration local et non persistant ; aucune lecture ou écriture dans Supabase de production.

La référence a une largeur supérieure aux captures de contrôle. La comparaison porte donc sur la hiérarchie visuelle, la densité, les alignements et les comportements responsives, pas sur une superposition pixel à pixel.

## Comparaison

### Vue complète

La référence et les captures de la préversion ont été ouvertes ensemble dans la même entrée de comparaison. L'implémentation conserve la structure attendue : calendrier en colonnes, première colonne fixe, navires en niveau 1, bordées en niveau 2 et marins en niveau 3. Les barres bleues représentent les projets navire et les barres vertes les affectations équipage.

L'application conserve son shell SeaPilot, ses contrôles de publication et ses composants existants. Cette différence avec la maquette isolée est intentionnelle et ne dégrade pas la lecture de la grille.

### Zones ciblées

- Arborescence : `ARMEMENT - CHERBOURG` et `GOURY` sont visibles avec leurs bordées et leurs marins.
- Masquage : le navire de démonstration sans marin n'est pas affiché ; le compteur indique deux navires avec équipage.
- Création : le bouton principal porte le libellé `Nouveau projet`.
- Affectation rapide : la liste `Marins non affectés` reste visible à droite avec l'instruction de glisser-déposer.
- Menu `Actions` : l'ouverture affiche clairement l'action disponible, son rôle et l'absence d'autre action au statut courant.
- Responsive : à 1366 × 1024, la grille, la liste des marins non affectés, les actions et la navigation restent accessibles ; le calendrier conserve son défilement horizontal.
- États repliés : le repli de `GOURY` masque ses bordées et marins, puis le dépliage les restaure.

## Preuves automatisées et manuelles

- TypeScript : réussi.
- Lint : réussi.
- Tests ciblés : 36 réussis, puis 12 réussis après les derniers ajustements.
- Suite complète : 55 fichiers, 346 tests réussis.
- Build de production : réussi ; avertissement Vite non bloquant sur le poids du bundle principal (~928,59 kB).
- Console navigateur sur la préversion : aucune erreur ni alerte.
- GitHub Actions : contrôles de test et build réussis.
- Vercel : déploiement du commit `72ec55b6b1983ba14d11294b3522813e3588e978` réussi.

## Findings

- Aucun défaut P0, P1 ou P2 observé sur le parcours contrôlé.
- [P3] La référence est une maquette pleine largeur, alors que la préversion inclut le shell SeaPilot et le panneau d'affectation rapide. La grille est donc visuellement plus compacte à largeur identique ; le défilement horizontal compense cette densité.
- [P3] La préversion Vercel peut encore demander l'authentification de protection Vercel dans un navigateur qui n'est pas connecté à Vercel. Ce contrôle est extérieur à l'authentification SeaPilot et au code de l'application.

## Historique de comparaison

1. Itération 1 — préversion v3.1.1 redirigée vers la connexion SeaPilot ; contrôle visuel bloqué.
2. Itération 2 — ajout d'un mode de prévisualisation sûr : accès direct au Planning et données locales non persistantes.
3. Itération 3 — validation de l'ouverture directe, du menu `Actions`, du repli/dépli de `GOURY`, de la console et des viewports ordinateur/iPad.

## Résultat

final result: passed
