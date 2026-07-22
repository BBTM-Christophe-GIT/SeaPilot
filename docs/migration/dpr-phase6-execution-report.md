# DPR - Rapport d'execution de la phase 6

Date d'execution : 22 juillet 2026

Projet Supabase : `szlvyrrmvdvhzixilymh`

Compagnie : `bbtm` (`company_id = 1`)

Lot : `3`

Cle de migration : `dpr-sharepoint-58d32d050bdb0129`

SHA-256 du manifeste : `58d32d050bdb01293fe51cb7590f9bde7b96dca571a73a6e752857d84d8c6b6d`

## Decision technique

La reprise historique est techniquement valide. Les donnees et fichiers attendus sont stockes dans Supabase, le replay est idempotent et la reconciliation automatisee est verte. La signature de recette metier reste une decision humaine distincte.

## Resultats

| Controle | Resultat |
|---|---:|
| DPR SharePoint importes | 981 / 981 |
| PDF importes et accessibles | 325 / 325 |
| Photos importees | 10 / 10 |
| DPR historiques sans PDF | 656, aucun PDF genere |
| HTML temporaires exclus | 15 / 15 |
| Fichiers orphelins | 0 |
| Erreurs de migration | 0 |
| Identifiants SharePoint dupliques | 0 |
| Ecarts de taille ou SHA-256 Storage | 0 |
| Ecarts de totaux par navire | 0 |
| Ecarts de totaux par projet | 0 |
| Tests SQL modele et permissions | 58 / 58 |

Les dix pieces jointes image de SharePoint sont classees comme `photo`. Il n'existe donc aucune piece jointe generique dans ce lot.

## Preuve d'idempotence

Le replay final du meme manifeste a produit :

- 0 DPR insere ;
- 0 DPR mis a jour ;
- 981 DPR inchanges ;
- 0 fichier televerse ;
- 335 fichiers reutilises ;
- reconciliation finale `ok = true`.

Le rapport machine est genere localement par `npm run validate:dpr:phase6`. Il controle les volumes, les fichiers, les identites source, les totaux navire/projet et le replay.

## Transformations et anomalies traitees

- Le projet SharePoint supprime `28` est rattache a `Hors Projet` (`52`) pour 57 DPR.
- Le navire source `17`, inutilise par les DPR, est exclu.
- Les deux DPR sans navire restent avec `vessel_id = NULL`.
- Les doublons de Tanguy SIMONET sont consolides logiquement, sans suppression physique.
- Les dates historiques signalees restent importees telles quelles pour correction manuelle ulterieure.
- Six chronologies d'escale dont l'appareillage precedait l'accostage sont conservees sous deux mouvements partiels traces, afin de respecter la contrainte temporelle sans perdre l'information source.
- Lorsque TBT est coche sans theme, la valeur `Non renseigne dans SharePoint` est utilisee et le JSON brut reste conserve.
- Pour le DPR source `155`, un theme TBT etait present alors que la case etait fausse. La presence du theme rend `tbt_performed = true`; la valeur source brute est conservee dans le snapshot.
- Aucun des 656 PDF manquants n'a ete genere, conformement a la decision approuvee.

## Controle representatif

Le validateur a selectionne neuf DPR couvrant plusieurs navires et projets, un equipage multiple, un incident QHSE T1/T2, une escale, une photo et un PDF. Les numeros inclus sont notamment `DPR-40`, `DPR-754`, `DPR-192`, `DPR-1002`, `DPR-370`, `DPR-162`, `DPR-186`, `DPR-536` et `DPR-823`.

Un controle visuel complementaire a ete effectue sur :

- `DPR-1000 - GOURY - 01-07-2026.pdf` : lisible, donnees mission/equipage/QHSE visibles ;
- `DPR-1001 - SUROIT - 01-07-2026.pdf` : lisible, avec un rognage historique visible en haut et a gauche de la premiere page ; le fichier Supabase est identique au fichier SharePoint par SHA-256 ;
- `DPR-1003 - LE ROZEL - 02-07-2026.pdf` : lisible, projet Hors Projet, equipage et informations QHSE visibles ;
- `IMG_2802.jpg` : photo lisible et exploitable.

La reserve visuelle de `DPR-1001` appartient au document historique source. Aucun PDF n'a ete regenere ni corrige pendant la migration.

## Securite

- Les buckets `dpr-pdfs`, `dpr-photos` et `dpr-attachments` sont prives.
- Les chemins Storage sont construits a partir de la compagnie et du DPR cibles.
- Les politiques RLS isolent les lignes par `company_id` et appliquent les roles Admin, Direction, Armement, Capitaine et Marin.
- Les tests positifs et negatifs couvrent la lecture de compagnie, le refus inter-compagnies, les brouillons Marin, la validation Capitaine, la reouverture, la suppression logique et le refus des suppressions physiques.
- Les 335 objets ont ete relus depuis Storage et compares a leur taille et SHA-256 source avant validation du lot.

## Commandes de verification

```powershell
npm run migrate:dpr:dry-run -- --input .data/sharepoint-dpr-full.json
npm run verify:dpr:source-files -- .data/dpr-migration-manifest.json .data/dpr-source-files .data/dpr-source-files-inventory.json
npm run migrate:dpr:apply -- --input .data/sharepoint-dpr-full.json --source-files .data/dpr-source-files
npm run validate:dpr:phase6
supabase test db supabase/tests/dpr_core_model_test.sql supabase/tests/dpr_role_matrix_test.sql
```

Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont requises pour les commandes distantes. La cle de service ne doit jamais etre ecrite dans un fichier ou un commit.
