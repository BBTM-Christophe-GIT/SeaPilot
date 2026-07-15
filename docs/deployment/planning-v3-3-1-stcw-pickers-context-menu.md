# Planning v3.3.1 — sélecteurs STCW et menu au clic droit

Version cible : `3.3.1`.

## Périmètre

- le champ **Fonction** de la Décision d’effectif est limité aux fonctions Pont et Machine validées par le métier ;
- le champ **Brevets** est un sélecteur multiple limité aux titres des catégories `Pont`, `Machine` et `Formation de Sécurité`, affichées dans cet ordre ;
- le champ **Habilitations** est un sélecteur multiple contenant tous les autres titres actifs du catalogue `stcw_certificates`, regroupés par catégorie ;
- un clic gauche sur une affectation ou une case colorée la sélectionne sans ouvrir de fenêtre ;
- un clic droit ouvre le menu **Statut et commentaire** pour le jour ou le groupe concerné ;
- le double-clic continue d’ouvrir le formulaire complet.
- la prévisualisation locale fournit un catalogue STCW de démonstration en lecture seule pour contrôler ces sélecteurs sans authentification.

## Données et compatibilité

Aucune migration SQL supplémentaire n’est nécessaire. La table `public.stcw_certificates` introduite par `202607140006_planning_stcw_board_daily_state.sql` contient déjà les 54 titres et leur catégorie source.

Le client charge désormais toutes les lignes actives de ce référentiel. La séparation Brevets/Habilitations est effectuée à partir de `category` :

- Brevets : `Pont`, `Machine`, `Formation de Sécurité` ;
- Habilitations : toute autre catégorie.

Lorsqu’une décision existante est ouverte pour modification, une valeur anciennement rangée dans Brevets mais appartenant à une autre catégorie est déplacée dans Habilitations. Les valeurs libres absentes du catalogue ne sont pas proposées comme nouveaux choix, mais restent conservées lors de l’enregistrement afin de ne pas altérer les données existantes. La base n’est modifiée qu’au moment où l’utilisateur enregistre la décision.

## Contrôles avant production

1. Vérifier les deux groupes Fonction et l’ordre exact de leurs options.
2. Vérifier l’ordre Pont, Machine, Formation de Sécurité dans Brevets.
3. Vérifier qu’un titre hors de ces catégories apparaît uniquement dans Habilitations.
4. Vérifier qu’un clic gauche sélectionne sans ouvrir le menu.
5. Vérifier qu’un clic droit ouvre le menu pour un jour et pour une période complète.
6. Vérifier que le double-clic ouvre toujours le formulaire complet.
7. Exécuter TypeScript, lint, tests, build et `supabase db lint --linked`.

## Retour arrière

Redéployer le client `3.3.0`. Aucune restauration de base n’est nécessaire, car cette version ne crée ni table, ni colonne, ni fonction SQL.
