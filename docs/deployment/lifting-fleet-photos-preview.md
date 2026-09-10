# Photos de flotte et sélection du module Levage

Les neuf PNG fournis sont conservés sans retouche. Les huit navires et le Yard du Havre sont associés par nom, acronyme, société et statut actif : GOURY, HIRONDELLE DE LA MANCHE, HOLENN EUSA, KROKDUR, LANDEMER, LE ROZEL, BBTM TENDER 1, SUROIT et YARD - Le Havre. Le doublon archivé HIRONDELLE n'est pas modifié.

## Référentiel partagé

Les originaux sont dans le bucket privé existant `fleet-media`. La table `public.vessels` (Flotte BBTM) porte leurs références dans `photo_storage_bucket` et `photo_storage_path`; `photo_url` est remis à `null`. Le chemin inclut l'identifiant de société, celui de l'unité et une empreinte SHA-256 du contenu. Aucun changement de schéma ou de politique RLS n'est nécessaire.

Levage utilise le même résolveur d'URL signée que le module Navires. Il résout uniquement les photos des unités renvoyées par `lifting_available_vessels()`. Une photo absente ou indisponible affiche une icône de navire sans bloquer la sélection. Écrehouel reste donc accessible selon les droits existants, même sans photo fournie. Les anciennes images ne sont pas supprimées du stockage.

## Import reproductible

Exécuter avec pnpm 10.34.5. Fournir `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans l'environnement du processus, sans les enregistrer dans Git.

```powershell
corepack pnpm exec node --experimental-strip-types scripts/import-bbtm-fleet-photos.ts --source-dir '<dossier des PNG>'
corepack pnpm exec node --experimental-strip-types scripts/import-bbtm-fleet-photos.ts --source-dir '<dossier des PNG>' --backup-file '<sauvegarde JSON hors dépôt>' --apply
```

La première commande vérifie les correspondances et les fichiers. L'application exige un nouveau fichier de sauvegarde des anciennes références, charge les images puis vérifie leur contenu par téléchargement et comparaison SHA-256 avant de mettre à jour les fiches. Une reprise réutilise les objets déjà chargés avec la même empreinte. Pour revenir aux anciennes photos, restaurer uniquement les trois champs photo depuis la sauvegarde pour les identifiants concernés.

L'option `--copy-preview` copie les originaux dans `public/vessels/bbtm/`, pour une préversion autonome. Le catalogue commun est `src/features/fleet/fleetPhotoCatalog.ts`. Aucun inventaire, rapport client ou signature n'est incorporé dans les données de démonstration.

## Interface et préversion

- Une rangée de photos nommées remplace la liste déroulante; bordure dorée et coche identifient la sélection. La rangée défile au toucher, au clavier ou avec les flèches.
- La sélection reste commune à l'inventaire et aux rapports. Le choix de vue est conservé lorsque l'utilisateur change de navire; recherche et année sont réinitialisées.
- Les boutons Inventaire et Rapports de contrôle affichent leurs icônes et compteurs. Les modifications de contrôle non enregistrées empêchent le changement de navire.
- La route locale `/modules/lifting?preview=1` et les déploiements Vercel de préversion utilisent neuf unités avec données fictives séparées par navire. La route connectée conserve le filtrage RPC/RLS existant.

## Vérification

- `corepack pnpm test src/features/lifting src/features/fleet/fleetQueries.test.ts --maxWorkers=2` : 53 tests réussis sur les huit suites Levage et Flotte.
- ESLint sur les fichiers modifiés : réussi. Compilation de production : réussie.
- `supabase/tests/lifting_inventory_workflow_test.sql` : réussi sur les véritables rôles PostgreSQL avec fixtures Marin/Capitaine et affectations RH, puis annulation de la transaction. Vérifie les références photo accessibles, l'exclusion des unités sans affectation et hors société, les inventaires, les contrôles et leur publication.
- Import distant : neuf associations et neuf fichiers vérifiés, originaux strictement identiques.
- Chromium : sélection du navire, conservation de la vue Rapports, photos chargées et défilement mobile, aux formats 1536 × 1080 et 390 × 844. Aucune erreur applicative après rechargement; une première requête locale au favicon absent a retourné 404.

Les captures et la sauvegarde des anciennes références restent hors du dépôt. La préversion ne remplace pas les tests de profils réels.
