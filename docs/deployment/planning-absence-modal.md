# Planning — fenêtre Absences et conflits

Le bouton « Demander des congés » utilise désormais un formulaire dédié décrit dans
[planning-leave-request.md](./planning-leave-request.md). La modale ci-dessous reste
le centre de consultation et de traitement des demandes et conflits.

La surface « Planification opérationnelle · P1.2 — Absences et conflits » utilise
la modale centrée commune (`AppDialog`, taille XL). Le titre, les indicateurs et
les onglets restent visibles pendant le défilement des demandes. Sur mobile,
la fenêtre conserve une marge et les actions de validation passent sur deux colonnes.

Les boutons ont une bordure, une hauteur et des espacements cohérents. Les actions
Valider, Refuser et Supprimer affichent du texte blanc sur un fond vert ou rouge
foncé. Le survol, le focus clavier et l'état désactivé possèdent des styles explicites.
L'actualisation reste accessible à droite des onglets.

Échap, la croix et le clic sur le fond ferment la fenêtre. Le focus clavier reste
dans la modale et revient au déclencheur à sa fermeture. Une décision en cours
d'enregistrement bloque la fermeture et l'actualisation.

Cette évolution concerne uniquement l'interface. Aucun changement de dépendances,
de configuration d'environnement, de RPC ou de règles RLS n'est nécessaire.
Les autorisations de chaque profil restent celles du Planning.

## Vérification

- `corepack pnpm test src/features/planning --reporter=dot --maxWorkers=1`
- `corepack pnpm lint`
- `corepack pnpm build`
- Recette Playwright locale sur données de démonstration administrateur : ouvrir
  « Demander des congés », vérifier le contraste au repos et au survol, les onglets,
  l'ouverture/fermeture du formulaire, le défilement, Échap et le retour du focus.
- Rendu contrôlé en 1440 × 1100, 390 × 844 et 320 × 740, sans débordement horizontal.
  Contraste mesuré de Refuser et Supprimer : 6,57:1 au repos, 8,96:1 au survol.
  Aucune erreur dans la console pendant la recette.
- Les profils Marin et Capitaine sont
  couverts par les fixtures et tests d'autorisations existants, sans utiliser une
  vue simulée depuis la session administrateur pour valider leurs droits.
