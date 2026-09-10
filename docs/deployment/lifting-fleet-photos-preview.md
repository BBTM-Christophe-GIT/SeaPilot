# Illustrations de flotte et sélection du module Levage

Les neuf illustrations sont ajoutées à Flotte BBTM sans remplacer les photos principales. Elles correspondent aux huit navires fournis et au Yard du Havre. Le doublon archivé HIRONDELLE reste inchangé.

## Référentiel partagé

La table `public.vessels` conserve deux médias indépendants :

| Usage | Colonnes |
| --- | --- |
| Photo principale existante | `photo_url`, `photo_storage_bucket`, `photo_storage_path` |
| Illustration originale supplémentaire | `illustration_storage_bucket`, `illustration_storage_path` |
| Vignette de cette illustration | `illustration_thumbnail_url` |

Les originaux restent dans le bucket privé `fleet-media`, avec un chemin contenant société, navire et empreinte SHA-256. Leur contenu est vérifié par téléchargement et comparaison d'empreinte. Le modèle partagé `FleetVessel` expose les nouvelles références pour de futurs usages.

La migration `20260910222711_fleet_illustrations_and_lightweight_thumbnails.sql` ajoute ces champs et corrige le premier import. Elle déplace ses références dans les champs d'illustration et restaure les anciennes photos depuis la sauvegarde antérieure. Elle compare société, nom, acronyme et chemin exact du PNG importé : une photo modifiée depuis par un utilisateur n'est pas remplacée. Aucun objet de stockage n'est supprimé.

## Performance

- Neuf WebP de **256 × 171 pixels**, entre **3 468 et 6 374 octets**.
- **39 928 octets au total**, contre **16 417 114 octets** : réduction de **99,76 %**.
- Seules les vignettes sont livrées dans `public/vessels/bbtm/`; aucun original PNG de ce catalogue n'est déployé.
- Noms contenant l'empreinte du contenu; cache Vercel public d'un an avec `immutable`.
- Levage utilise directement `illustration_thumbnail_url` du RPC existant `lifting_available_vessels()`. Aucun appel de signature ni téléchargement d'original ou de photo principale.
- Chargement différé, décodage asynchrone et dimensions intrinsèques. Une vignette absente laisse le filtre utilisable avec une icône nommée.

Un test impose 20 Ko maximum par vignette, 120 Ko pour la flotte, vérifie les empreintes et interdit des fichiers supplémentaires dans ce répertoire.

## Préparation et import

Générer les vignettes avec Python et Pillow 12.3.0, sans modifier les sources :

```powershell
python scripts/prepare-bbtm-fleet-thumbnails.py --source-dir '<dossier des PNG>'
```

Le script lit `scripts/bbtm-fleet-photo-sources.json` et génère les WebP et le catalogue TypeScript. Ces fichiers sont commités; Python et Pillow ne sont pas nécessaires au build Vercel. Lors d'une future mise à jour, coordonner le déploiement de la nouvelle vignette avec sa référence en base et conserver l'ancienne jusqu'à cette bascule.

Appliquer d'abord la migration. Utiliser pnpm 10.34.5 et fournir `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans l'environnement du processus, sans les enregistrer dans Git :

```powershell
corepack pnpm exec node --experimental-strip-types scripts/import-bbtm-fleet-photos.ts --source-dir '<dossier des PNG>'
corepack pnpm exec node --experimental-strip-types scripts/import-bbtm-fleet-photos.ts --source-dir '<dossier des PNG>' --backup-file '<nouvelle sauvegarde JSON hors dépôt>' --apply
```

Le mode sans `--apply` valide les correspondances actives par société, nom et acronyme, les originaux et leurs vignettes. L'import exige une nouvelle sauvegarde, vérifie le contenu stocké puis met à jour uniquement les champs `illustration_*`. Les objets existants de même empreinte sont réutilisés. Les vignettes référencées doivent être déployées avec ce commit.

## Interface et droits

La rangée de photos nommées remplace la liste déroulante. Bordure dorée et coche indiquent la sélection; défilement au toucher, au clavier et avec les flèches. Le filtre est commun à l'inventaire et aux rapports, et la vue choisie est conservée au changement de navire. Les modifications non enregistrées empêchent le changement de contexte.

La route locale `/modules/lifting?preview=1` et les déploiements de préversion proposent neuf unités avec données fictives distinctes. La route connectée conserve les droits RPC/RLS existants. Écrehouel reste accessible selon ces droits avec une icône de remplacement.

## Vérifications

- 55 tests ciblés réussis : Levage, requêtes Flotte et budget des vignettes.
- ESLint ciblé et compilation de production réussis.
- `supabase/tests/lifting_inventory_workflow_test.sql` réussi avec véritables rôles PostgreSQL et affectations RH Marin/Capitaine, puis transaction annulée. Vérifie les références supplémentaires indépendantes des photos principales et les périmètres de navire et stockage.
- Neuf originaux présents et anciennes références principales restaurées vérifiés dans la base.
- Navigateur : décodage des WebP en 256 × 171, sélection Inventaire/Rapports conservée, rendu desktop/mobile et contrôle des téléchargements.

Les captures et sauvegardes restent hors du dépôt. La préversion ne sert pas de preuve des droits des profils réels.
