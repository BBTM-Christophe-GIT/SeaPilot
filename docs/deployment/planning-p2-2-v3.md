# SeaPilot Planning P2.2 — déploiement V3

## Périmètre

La version `3.0.0` ajoute des analyses descriptives de charge, un classement explicable des périodes de tension et deux simulations locales : absence d’un marin et immobilisation d’un navire. Toutes les sorties restent consultatives, séparent faits, règles et estimations et exigent une validation humaine.

Le déploiement ne crée aucune table, migration, RPC ni politique RLS. Il réutilise en lecture les données P0/P1 déjà autorisées et l’accès pilote P2.1. Les données existantes ne sont pas modifiées.

## Prérequis et ordre d’application

1. appliquer et vérifier les 36 migrations existantes jusqu’à `202607140003_planning_p21_maritime_assistant.sql` ;
2. déployer le client `3.0.0` avec le flag P2.2 désactivé ;
3. exécuter la recette données, permissions et rendu ;
4. activer le flag uniquement pour l’environnement validé.

```powershell
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db lint --linked --level warning
```

Aucune commande `db push` n’est nécessaire si les 36 migrations locales et distantes sont alignées.

## Variables d’environnement

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
VITE_PLANNING_ASSISTANT_ENABLED=false
VITE_PLANNING_PREDICTIONS_ENABLED=false
```

Les deux flags sont indépendants. `VITE_PLANNING_PREDICTIONS_ENABLED=true` rend le point d’entrée P2.2 éligible, mais l’interface exige toujours l’autorisation retournée par `get_planning_assistant_access`. Le flag assistant peut donc rester désactivé lorsque seuls les scénarios P2.2 doivent être évalués.

## Contrôles avant déploiement

```powershell
npm ci
npx tsc -b --pretty false
npm run lint -- --max-warnings=0
npx vitest run --maxWorkers=2
npm run build
git diff --check
```

Vérifier aussi :

- aucune donnée personnelle, clé, secret ou export de lignes Supabase n’est ajouté au dépôt ;
- le rapport de qualité indique clairement les fonctions limitées et bloquées ;
- aucune migration P2.2 n’existe ;
- le chunk P2.2 reste chargé dynamiquement ;
- aucune action d’application, publication ou dérogation n’existe dans les scénarios ;
- le flag reste `false` en Production jusqu’à validation du pilote P2.1 et de la recette V3.

## Recette après déploiement

1. Avec le flag `false`, vérifier l’absence du bouton « Prévisions et scénarios V3 » et de requête d’accès dédiée à P2.2.
2. Avec le flag `true` mais sans accès serveur, vérifier que le bouton reste absent.
3. Avec le flag et l’accès, ouvrir le panneau sur ordinateur 15 pouces et iPad 12,9 pouces.
4. Vérifier charge navire, charge marin et fenêtres de tension sur la période affichée.
5. Vérifier que chaque fenêtre expose les faits, la formule, le seuil et les limites.
6. Simuler une absence ; comparer référence et scénario, puis vérifier les deux alternatives manuelles.
7. Simuler une immobilisation ; vérifier les événements/affectations impactés et l’avertissement de compatibilité technique inconnue.
8. Vérifier qu’aucun bouton n’applique un scénario et qu’aucune ligne Supabase ne change.
9. Ouvrir Qualité des données et vérifier que sous-effectif, intégrations et cache persistant restent bloqués lorsque leurs prérequis manquent.
10. Contrôler l’absence d’erreur console et les cibles tactiles de 44 px.

## Fonctions volontairement non déployées

- prévision statistique des sous-effectifs, faute de matrices d’armement actives dans l’instantané distant contrôlé ;
- prévision de fatigue, faute de politiques et métriques détaillées suffisantes ;
- prévision de fréquence d’absence ou d’immobilisation, faute d’historique suffisant ;
- intégrations calendrier/RH/maintenance entrantes ou bidirectionnelles, faute de contrat d’interface et d’identité externe ;
- cache hors connexion persistant, faute de politique de chiffrement et de résolution des conflits.

## Retour arrière

Le retour arrière ne nécessite aucune opération SQL :

1. remettre `VITE_PLANNING_PREDICTIONS_ENABLED=false` et redéployer ;
2. conserver le flag assistant P2.1 dans son état approuvé ;
3. revenir au client `2.3.0` si le retrait du code est nécessaire.

Comme P2.2 n’écrit ni schéma ni donnée, les données et journaux P0/P1 restent inchangés. Ne supprimer aucune migration P2.1 lors du retour arrière V3.
