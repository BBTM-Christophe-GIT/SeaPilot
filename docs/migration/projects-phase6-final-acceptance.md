# Projets — recette finale et décision de bascule (phase 6)

Date de contrôle : 16 juillet 2026.

## Décision

**NO-GO — migration non terminée.**

Le code, le modèle et la sécurité sont qualifiables, mais la reprise métier ne peut pas être déclarée conforme : la base Supabase `SeaPilot` liée contient actuellement zéro projet, zéro client et zéro métadonnée des deux bibliothèques. La session Microsoft 365 CLI est déconnectée et aucun comptage exhaustif des listes SharePoint n’est disponible. Les contrôles d’intégrité à zéro sont vacuement vrais et ne prouvent pas une migration.

La bascule reste interdite jusqu’à l’export live, le double import idempotent, la réconciliation source/cible et la validation métier formelle.

## État des sources et de la cible

| Périmètre | SharePoint live | Supabase lié | Verdict |
|---|---:|---:|---|
| `BBTM - Projets` / `projects` | Non comptable : CLI déconnectée | 0 | Bloquant |
| `BBTM - Clients` / `clients` | Non comptable : CLI déconnectée | 0 | Bloquant |
| Relations flotte | Source non exportée pendant cette recette | 14 navires disponibles | Non réconcilié |
| `Documents Projets` / `project_documents` | Bibliothèque confirmée, volume non exhaustif | 0 | Bloquant |
| `Documents Contractuels` / `contract_documents` | Bibliothèque confirmée, volume non exhaustif | 0 | Bloquant |
| `planning_projects` | Hors catalogue Projets | 18 | Séparation confirmée |

Le site `https://bbtm668.sharepoint.com/sites/QHSE` et les deux drives documentaires ont été retrouvés via la connexion SharePoint. Cette découverte confirme les emplacements, pas les volumes ni les listes. `m365 status --output json` retourne `Logged out`. Le dry-run documentaire s’arrête proprement avec `Log in to Microsoft 365 first` et n’écrit aucune donnée.

## Réconciliation Supabase

Le script `supabase/validation/projects_phase6_reconciliation.sql` ne renvoie que des agrégats. Sur la base liée :

- 0 projet, dont 0 d’origine SharePoint ;
- 0 client, dont 0 d’origine SharePoint ;
- 0 document projet et 0 document contractuel ;
- 14 navires et 18 `planning_projects` ;
- 0 doublon, identité manquante, relation non résolue ou champ critique invalide, résultat non probant puisque les tables cibles sont vides.

Le script contrôle aussi les références DPR, Achats et Plan d’action, les drives attendus, les URL SharePoint, les périodes, la double sélection navire, les codes et le compteur. Il doit être rejoué après l’import final avec les volumes source comme référence externe.

## Rôles et sécurité

La matrice testée est :

- Admin : lecture complète, écritures via RPC, import des métadonnées ;
- Direction : lecture complète et écritures via RPC, pas d’import documentaire direct ;
- Armement : aucune ligne métier sensible, catalogue minimal ID/code/titre pour les modules dépendants ;
- Capitaine et Marin : aucun accès au catalogue ni au RPC minimal ;
- aucun rôle authentifié : suppression physique interdite.

Le test `supabase/tests/projects_phase6_role_matrix_test.sql` couvre explicitement les cinq rôles avec 36 assertions. Il confirme aussi l’accès immédiat d’un nouveau projet aux modules dépendants, sans liaison à `planning_projects`.

La revue distante a détecté des privilèges historiques inutiles du rôle `anon`, bien que les RLS bloquent déjà les lignes. La migration additive `202607160003_projects_phase6_security_hardening.sql` révoque tous les privilèges de table et séquence `anon`/`public` du domaine Projets. Elle est appliquée localement et sur Supabase lié. Le contrôle agrégé confirme :

- RLS active sur les six tables du domaine ;
- aucun rôle non validé dans les policies du catalogue ;
- aucun privilège de table `anon`, contournement d’écriture authentifié ou `DELETE` authentifié ;
- aucun `EXECUTE` public/anon sur les RPC, et `search_path` fixé sur les fonctions `SECURITY DEFINER` ;
- aucun bucket Storage dédié, champ `bytea` ou liaison à `planning_projects`.

## Parcours et automatisation

La recette automatisée couvre le mapping de lecture, les filtres, la sélection, les états vide/chargement/erreur/partiel, la création et modification, les validations métier, le numéro transactionnel, les métadonnées et URL SharePoint, ainsi que les adaptateurs DPR/Achats/Plan d’action.

Résultats sur le commit candidat :

- tests ciblés Projets, permissions, DPR, Achats et Plan d’action : 45/45 ;
- tests ciblés finaux Projets, permissions et préversion : 41/41 ;
- suite applicative complète : 63 fichiers et 431/431 tests avec `--maxWorkers=2` ;
- pgTAP Supabase : 4 fichiers et 148/148 assertions ;
- ESLint applicatif et exporteur SharePoint : réussi ;
- build `tsc -b && vite build` : réussi, avec les avertissements préexistants de taille de bundle et d’import JSZip ;
- lint Supabase local et lié : aucune erreur de schéma ;
- advisors Supabase sécurité/performance : aucune erreur, avertissements globaux préexistants hors domaine Projets à traiter séparément ;
- migration locale/distante alignée jusqu’à `202607160003` ;
- recette visuelle : 1440 × 900 et 390 × 844, sans débordement global après correction, sans erreur console ; le tableau conserve un défilement horizontal interne sur petit écran ;
- filtre de statut vérifié dans le navigateur : deux projets deviennent un seul résultat `Contrat signé` ;
- deux liens `Ouvrir dans SharePoint` vérifiés avec URL HTTPS protégée et `target="_blank"`, sans ouverture ni téléchargement pendant la recette.

La préversion affichait initialement une erreur car son client de démonstration ne couvrait pas les tables Projets. Des lignes entièrement synthétiques couvrent désormais les projets, clients, navires, contrat et deux métadonnées documentaires. Elles n’activent aucune écriture. Le détail mobile débordait à cause de la taille intrinsèque d’une colonne CSS ; la grille utilise maintenant `minmax(0, 1fr)` et la page reste contenue à 390 px.

La recette live reste impossible pour les valeurs et volumes réels SharePoint, l’ouverture d’un fichier métier réel, les cinq comptes métier réels, la preuve de rejeu sur l’export de production et l’alignement du compteur sur le prochain numéro approuvé.

## Revue Git et frontière documentaire

- `.data/` est ignoré par Git ; aucun export live n’est ajouté ;
- `output/` reste un changement local hors périmètre et n’est pas versionné dans cette phase ;
- le seul export versionné existant est l’échantillon synthétique `docs/migration/sample-sharepoint-export.json` ;
- aucun PDF, Office ou binaire SharePoint n’est introduit ;
- aucun secret ou identifiant personnel n’est ajouté ;
- l’exporteur Windows transmet maintenant les arguments XML à Microsoft 365 CLI sans interprétation par `cmd.exe`, puis échoue explicitement en l’absence d’authentification.

## Conditions pour lever le No-Go

1. Authentifier Microsoft 365 avec un compte de reprise en lecture sur les cinq sources.
2. Exécuter sauvegarde, export, dry-run, import et second rejeu du runbook.
3. Prouver l’égalité des cinq volumes source/cible.
4. Traiter ou accepter par écrit chaque ligne et relation non résolue.
5. Aligner le compteur sur un prochain numéro validé, puis tester une collision concurrente.
6. Faire signer la recette Admin, Direction, Armement, Capitaine et Marin.
7. Rejouer toutes les validations et obtenir un déploiement Vercel sain du commit candidat.

Référence opérateur : `docs/migration/projects-cutover-runbook.md`.

**Arrêt de phase 6 : les contrôles automatisables et le durcissement de sécurité sont livrés, mais la migration demeure en NO-GO faute de données live réconciliées et de validation métier.**
