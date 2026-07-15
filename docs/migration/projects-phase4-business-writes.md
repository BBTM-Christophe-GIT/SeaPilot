# Projets — écritures métier SeaPilot (phase 4)

Date : 16 juillet 2026
Périmètre : création/modification des projets et clients, archivage logique, contrat SUPPLYTIME et rattachement aux modules dépendants.

## Architecture livrée

Supabase est l'unique cible d'écriture des données structurées. L'interface appelle des fonctions transactionnelles ; elle n'écrit ni dans les listes SharePoint, ni dans Supabase Storage. Les fichiers existants restent dans SharePoint et les écrans continuent seulement d'ouvrir leurs URL.

| Workflow | Contrat serveur | Rôles | Effet |
|---|---|---|---|
| Créer/modifier un projet et son contrat | `projects_save` | `admin`, `direction` | transaction unique sur `projects` et `project_contracts` |
| Créer/modifier un client | `clients_save` | `admin`, `direction` | nom normalisé, contrôle de doublon actif et verrou anti-course |
| Archiver un projet | `projects_archive` | `admin`, `direction` | renseigne `archived_at/by`, sans suppression physique |
| Lire les choix projet dans DPR/Achats/Plan d'action | `projects_catalog_options` | `admin`, `direction`, `armement` | expose seulement `id`, code et titre des projets non archivés |

Les privilèges `INSERT`/`UPDATE` directs d'`authenticated` sont retirés sur `clients`, `projects` et `project_contracts`. Les RLS restent activées, et chaque fonction `security definer` revalide l'appartenance à la société active et le rôle. Le `service_role` conserve le chemin d'import contrôlé de la phase 2.

## Numérotation et concurrence

Le navigateur ne propose et ne calcule jamais un code projet. À la création :

1. le trigger `assign_project_code` appelle l'allocateur livré en phase 1 ;
2. le compteur de la société est verrouillé dans la transaction ;
3. le prochain code libre est cherché sans utiliser `max(id)` ;
4. l'index unique normalisé constitue la dernière protection contre une collision ;
5. le projet et son contrat sont validés ou annulés ensemble.

Les projets importés gardent leur code, leurs identifiants SharePoint, leur payload source et leur provenance. Ces valeurs ne font pas partie des paramètres modifiables des RPC.

## Règles de validation

Les mêmes règles importantes existent côté interface pour un retour rapide et côté base pour l'autorité :

- titre de projet et nom de client non vides ;
- dates de fin postérieures ou égales aux dates de début ;
- navires principal et secondaire distincts et appartenant à la société active ;
- client actif de la société active, avec conservation autorisée d'une relation historique devenue inactive ;
- nombre, durée et unité de prolongation fournis ensemble, avec valeurs positives ;
- maximum de jours non négatif ;
- devise ISO alphabétique sur trois lettres dès qu'un frais ou loyer est renseigné ;
- JSON SUPPLYTIME limité aux 36 clés du schéma `supplytime-2017-v1` et à des valeurs texte/null ;
- verrou optimiste par `updated_at` pour refuser l'écrasement d'une modification concurrente.

Les statuts et types de contrat proposés par l'interface sont dérivés des données Supabase existantes. Aucun choix SharePoint non confirmé n'a été inventé. Les valeurs par défaut validées restent : reconduction `Voyage`, support ROV/plongée à `false`, client actif à `true`.

## Formulaires

Le module existant `src/features/projects` est étendu, sans nouvelle application parallèle :

- Identification : titre, client/affréteur, statut, description ;
- Planning : dates projet, livraison/restitution, affrètement et ports ;
- Offre commerciale : type de contrat, armateur, frais, loyers, devises et unité ;
- Opérations : navires, zone, options ROV et plongée ;
- Contrat SUPPLYTIME : prolongations, limite d'affectation, audit et les 36 zones éditables ;
- Clients : identité, code, contacts, adresse, activation ;
- Archivage : confirmation explicite et transition logique uniquement.

Les erreurs réseau, validations et conflits concurrents restent visibles dans le formulaire. Une erreur Supabase n'est jamais convertie en succès ou en liste vide.

## Modules dépendants

DPR, Achats et Plan d'action chargent le catalogue minimal par RPC en parallèle de leurs propres données. À la sélection, ils enregistrent :

- `project_id`, référence canonique vers `projects` ;
- `project_code` et `project_title`, snapshots nécessaires à la lecture des historiques.

Il n'existe aucune copie de table projet et aucun import supplémentaire. Un nouveau projet non archivé devient donc un choix dès le prochain chargement de ces modules. `planning_projects` reste indépendant : aucune colonne, clé étrangère ou synchronisation implicite n'est ajoutée.

## Audit et données historiques

Les triggers de `project_change_log` journalisent les créations, modifications et archivages importants. Les contacts client et `source_payload` restent exclus des snapshots d'audit. Les identifiants et timestamps SharePoint ne sont pas modifiables par ces workflows.

## Vérification et retour arrière

La migration additive est `supabase/migrations/202607160001_projects_phase4_business_writes.sql`. Elle ajoute des contraintes `NOT VALID`, remplace les fonctions applicatives et resserre les privilèges sans supprimer de donnée. Les tests pgTAP sont dans `supabase/tests/projects_phase4_business_writes_test.sql` et la non-régression phase 1 reste couverte par `projects_phase1_model_test.sql`.

Un retour applicatif consiste à restaurer la version précédente de l'interface. Avant tout retour SQL, il faut maintenir les protections de provenance, la non-suppression et la numérotation transactionnelle ; ne pas réaccorder des écritures directes sans nouvelle revue de sécurité.

Ordre de déploiement :

```powershell
supabase migration list --linked
supabase db push --dry-run --linked
supabase db push --linked
supabase migration list --linked
supabase db lint --linked --level warning
```

La migration doit précéder le client Vercel, car celui-ci appelle les nouvelles RPC et sélectionne `updated_at` ainsi que le référentiel navires. Le dry-run ne doit annoncer que `202607160001_projects_phase4_business_writes.sql`. Après déploiement, vérifier une lecture Projets, une création/édition/archivage sur un jeu de recette et la présence du nouveau projet dans DPR, Achats et Plan d'action.

## Risques restants

- les choix métier exacts restant non confirmés doivent être validés sur le catalogue SharePoint live avant de les transformer en contraintes fermées ;
- la validation utilisateur sur les données réconciliées reste nécessaire ;
- les modules dépendants conservent volontairement leurs snapshots historiques : leur réconciliation d'anciennes références ambiguës relève de la migration de données, pas de cette phase ;
- le Planning ne reçoit volontairement aucun nouveau projet catalogue sans relation déterministe validée.

**Arrêt de phase 4 : les workflows structurés sont fournis et sécurisés ; aucune double écriture SharePoint, copie de fichier ou suppression physique n'est introduite.**
