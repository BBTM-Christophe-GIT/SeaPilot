# Projets — runbook de reprise, contrôle et bascule

Date : 16 juillet 2026.

Ce runbook est la procédure opérateur de la migration du catalogue métier Projets. Il ne constitue pas une autorisation de bascule : tous les critères « Go / No-Go » doivent être validés avant d’ouvrir les écritures SeaPilot.

## Frontière de responsabilité

| Donnée ou action | Système de référence | Règle opératoire |
|---|---|---|
| Projets, clients, statuts, champs métier, contrats et relations navires | Supabase | Création et modification dans SeaPilot uniquement après bascule |
| Métadonnées documentaires et rattachement au projet | Supabase | Import idempotent depuis SharePoint ; aucune suppression implicite |
| Contenu, version, déplacement, suppression et droits des fichiers | SharePoint | Les fichiers ne quittent jamais `Documents Projets` ou `Documents Contractuels` |
| Consultation d’un fichier | SharePoint | SeaPilot ouvre l’URL protégée d’origine ; Microsoft 365 authentifie l’utilisateur |
| Planning opérationnel | `planning_projects` dans Supabase | Table distincte ; lien explicite optionnel vers `projects`, plusieurs occurrences autorisées par projet |
| DPR, Achats et Plan d’action | Supabase | Référence `projects.id` si résolue et conserve les instantanés historiques sinon |

Il est interdit de créer un bucket Supabase Storage, de copier un binaire dans Vercel ou Git, de rendre une URL SharePoint publique, ou de réactiver une double écriture vers les listes SharePoint.

## Prérequis

- branche et déploiement candidats identifiés ; migrations locale et distante alignées ;
- projet Supabase lié affiché comme `SeaPilot` par `npx supabase projects list --output pretty` ;
- compte Microsoft 365 technique autorisé en lecture sur les cinq sources ;
- compte SeaPilot `admin` pour la recette et l’alignement explicite du compteur ;
- répertoire de sauvegarde chiffré hors du dépôt et hors de tout dossier synchronisé publiquement ;
- fenêtre de gel des modifications des listes `BBTM - Projets` et `BBTM - Clients` décidée avec le métier ;
- aucune clé service, session Microsoft 365, sauvegarde ou export dans le dépôt.

Les sources attendues sont `list-bbtm-clients`, `list-bbtm-flotte`, `list-bbtm-projets`, `library-documents-projets` et `library-documents-contractuels`.

## 1. Authentifier et vérifier les cibles

Depuis `C:\CODEX\SeaPilot` :

```powershell
pnpm --package=@pnp/cli-microsoft365 dlx m365 login --authType browser
m365 status --output json
npx supabase projects list --output pretty
npx supabase migration list
npx supabase db push --linked --dry-run
```

Arrêter si Microsoft 365 est déconnecté, si le projet lié n’est pas `SeaPilot`, si une migration manque, ou si le dry-run propose une migration non revue.

## 2. Sauvegarder Supabase

Créer une sauvegarde `public` complète, car l’outil Supabase ne filtre pas les tables individuellement. Le chemin est volontairement hors du dépôt :

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = "C:\SeaPilot-secure-backups\projects-cutover-$stamp.sql"
npx supabase db dump --linked --data-only --schema public --use-copy --file $backup
Get-Item $backup | Select-Object FullName, Length, LastWriteTimeUtc
Get-FileHash $backup -Algorithm SHA256
```

Protéger ce fichier comme une donnée métier sensible. Ne jamais le joindre à une issue ou une PR. Seule son empreinte peut être copiée dans le journal sécurisé de bascule.

## 3. Exporter les données et uniquement les métadonnées des fichiers

```powershell
npm run export:sharepoint:list -- `
  --source-key list-bbtm-clients `
  --source-key list-bbtm-flotte `
  --source-key list-bbtm-projets `
  --source-key library-documents-projets `
  --source-key library-documents-contractuels `
  --output .data/sharepoint-projects-cutover.json
```

Le fichier `.data/sharepoint-projects-cutover.json` peut contenir des données métier et reste ignoré par Git. L’exporteur appelle les listes et bibliothèques ; il n’appelle aucune API de téléchargement du contenu des fichiers. Contrôler les cinq `sourceKey` et relever seulement les volumes agrégés dans le rapport partageable.

## 4. Dry-run obligatoire

```powershell
npm run import:sharepoint -- --file .data/sharepoint-projects-cutover.json --dry-run
```

Le dry-run doit reconnaître cinq sources. Arrêter en présence d’un mapping inconnu, d’un identifiant SharePoint de liste/item/drive/drive-item manquant, d’un dossier interprété comme fichier, ou d’un volume inattendu.

## 5. Import contrôlé et rejeu

Fournir `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` dans la session opérateur ou le coffre de déploiement, jamais dans un fichier versionné. Exécuter :

```powershell
npm run import:sharepoint -- `
  --file .data/sharepoint-projects-cutover.json `
  --resolve-project-links `
  --resolve-project-document-links `
  --resolve-dpr-links `
  --resolve-operation-links
```

Le bundle place les clients et la flotte avant les projets, puis les documents. L’import effectue des upserts fondés sur les identifiants SharePoint stables. Il ne purge, ne prune et ne supprime aucune ligne.

Rejouer exactement la même commande. Les volumes et nombres de doublons doivent rester identiques. Une variation sans changement de source, un nouveau doublon ou une suppression est un No-Go. Ne pas appeler `--resolve-planning-links` pour rapprocher les lignes historiques : seul le lien explicite créé par `projects_create_planning_occurrence` est autorisé.

## 6. Aligner le numéro de projet

Le responsable métier valide par écrit le prochain numéro explicite à partir des codes historiques importés. Ne pas utiliser `max(id)` et ne pas déduire un numéro du volume de lignes.

Un utilisateur SeaPilot `admin` appelle ensuite `projects_set_number_floor(<prochain_numéro_validé>, 'P')` dans une session authentifiée. La fonction est monotone, ne peut pas diminuer le compteur et l’allocation concurrente utilise un verrou base de données. Le contrôle `counter_not_above_existing_codes` doit être à zéro avant d’autoriser une création.

## 7. Réconcilier et contrôler

```powershell
npx supabase db query --linked --file supabase/validation/projects_phase6_reconciliation.sql --output table
npx supabase db query --linked --file supabase/validation/projects_phase6_security.sql --output table
npx supabase db lint --linked --schema public --level error --fail-on error
npx supabase db advisors --linked --type security --level warn --fail-on error
```

Comparer les volumes source et cible pour chacun des cinq jeux. Un `PASS` sur une table vide n’est pas une preuve. Les critères sont :

- volumes projets, clients et documents égaux aux sources correspondantes ;
- aucune identité source manquante ou dupliquée ;
- aucun projet sans titre/code, période invalide ou double sélection du même navire ;
- chaque client/navire/document résolu, ou anomalie traitée hors Git et acceptée par écrit ;
- références DPR, Achats et Plan d’action résolues ou explicitement acceptées ;
- drive `Documents Projets` égal à `b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_Ou31l1uVoWRrtjl4GcYGNl` ;
- drive `Documents Contractuels` égal à `b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_OWUUcnVo9hTIk_y0nRfdyl` ;
- URL documentaires sous `https://bbtm668.sharepoint.com/sites/QHSE/` ;
- aucun bucket ou champ binaire Projets, privilège `anon` ou droit de suppression directe.

Conserver les détails nominatifs dans le journal sécurisé ; le rapport Git ne contient que des agrégats.

## 8. Recette fonctionnelle et rôles

| Rôle | Catalogue complet | Écriture projet/client | Options des modules dépendants | Métadonnées SharePoint |
|---|---:|---:|---:|---:|
| Admin | Oui | Oui | Oui | Import/rafraîchissement autorisé |
| Direction | Oui | Oui | Oui | Lecture uniquement |
| Armement | Non | Non | Oui, ID/code/titre uniquement | Non |
| Capitaine | Non | Non | Non | Non |
| Marin | Non | Non | Non | Non |

Avec cinq comptes dédiés, vérifier liste, recherche, filtres, sélection, détail, sections métier, aperçu SUPPLYTIME, création, modification, validations, archivage, collision concurrente et erreurs réseau. Générer une offre et un contrat, contrôler leur contenu puis déposer les versions validées dans SharePoint. Créer deux occurrences Planning depuis le même projet et confirmer deux identifiants Planning distincts portant le même `catalog_project_id`. Ouvrir un document de chaque bibliothèque avec une session Microsoft 365 valide, puis vérifier le message attendu sans session. Tester en desktop et mobile. Confirmer qu’un nouveau projet est disponible dans DPR, Achats et Plan d’action via le catalogue minimal, sans duplication.

La génération navigateur ne publie aucun fichier : elle télécharge un PDF de travail. Le dépôt, la version, les droits et la signature restent gérés dans SharePoint.

## 9. Go / No-Go

La bascule est `GO` uniquement si :

- les cinq volumes source/cible sont connus et réconciliés ;
- le rejeu est idempotent ;
- aucune anomalie critique ou haute n’est ouverte ;
- les cinq rôles et tous les parcours sont validés ;
- tests ciblés, suite complète, lint, build, pgTAP, lint/advisors Supabase et responsive sont verts ;
- la validation métier formelle est consignée hors Git ;
- le commit candidat est déployé par Vercel et le déploiement est sain.

Sinon, conserver SharePoint comme source active et noter `NO-GO`. Ne jamais transformer une cible vide en validation réussie.

## 10. Retour arrière

1. Fermer les écritures Projets SeaPilot en redéployant le dernier déploiement connu en lecture seule ou en retirant temporairement l’accès au module.
2. Ne supprimer ni fichier ni métadonnée automatiquement. SharePoint est resté intact et demeure la source de repli.
3. Réactiver les écritures SPFx seulement sur décision métier explicite, sans laisser deux sources d’écriture actives simultanément.
4. En cas d’import incorrect, privilégier un correctif additif ou un nouvel upsert. Une restauration/PITR exige une fenêtre dédiée et doit préserver toute donnée SeaPilot créée après la sauvegarde.
5. Restaurer l’application par un nouveau commit ou le rollback Vercel. Ne pas exécuter de migration destructive.
6. Rejouer les deux SQL de validation et documenter l’incident avant toute nouvelle tentative.

## 11. Rafraîchissement documentaire après bascule

Dry-run normal :

```powershell
npm run refresh:sharepoint:project-documents
```

Après contrôle des volumes :

```powershell
npm run refresh:sharepoint:project-documents -- --apply
```

La commande exporte uniquement les métadonnées et résout les rattachements. Un fichier déplacé ou supprimé peut laisser une référence obsolète : elle est signalée et traitée manuellement, jamais supprimée par un prune implicite.
