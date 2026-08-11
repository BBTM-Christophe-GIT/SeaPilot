# Certificats Flotte v3.14.0 — migration SharePoint vers Supabase

## Refonte opérationnelle v3.15.0

La version `3.15.0` remplace la présentation historique par un espace de travail centré sur l'action : documents échus, échéances à 90 jours et écarts ouverts apparaissent dès l'arrivée. Chaque ligne de la bibliothèque ouvre une fiche certificat avec accès direct au document, renouvellement, suppression contrôlée, versions et suivi des écarts.

Un écart peut être une non-conformité majeure ou mineure, une condition de classe, une remarque ou une prescription. Il conserve la description, le délai et la date de traitement, le responsable, l'état, l'avancement, les pièces du constat, les preuves de traitement et un historique horodaté. Les responsables affectés peuvent mettre à jour leurs actions et déposer des preuves ; les rôles `admin`, `direction` et `armement` gardent les droits de gestion complets.

Les rapports PDF avec identité BBTM peuvent couvrir un écart, un certificat, une sélection de documents ou toute la flotte. Ils incluent le résumé exécutif, les échéances, responsables, états, pièces et historique de traitement.

Nouveaux objets Supabase :

- `fleet_certificate_findings` pour les écarts et leur workflow ;
- `fleet_certificate_finding_attachments` pour les constats et preuves ;
- `fleet_certificate_finding_events` pour l'historique immuable ;
- RPC `delete_fleet_certificate_findings` pour la suppression coordonnée des métadonnées et objets Storage ;
- chemin Storage `{company_id}/{acronyme}/findings/{finding_id}/{finding|treatment}/{uuid}-{nom}`.

La migration `20260811144207_fleet_certificate_findings_and_reports.sql` active le RLS, les droits Data API explicites, les politiques Storage par société et responsable, ainsi que les déclencheurs d'audit. La migration `20260811151248_fleet_certificate_findings_advisor_indexes.sql` ajoute les index de couverture recommandés par le conseiller de performance Supabase.

## Résultat livré

Le module `Certificats flotte` reprend la structure visuelle du webpart BBTM : indicateurs d'alerte, filtres navire/échéance, recherche documentaire et timeline annuelle dépliable par navire.

La version corrective `3.14.1` ajoute la bibliothèque de téléchargement du webpart : arborescence navire/catégorie/document, sélection unitaire ou globale, téléchargement simple ou ZIP, suppression contrôlée et ajout d'un nouveau document. Les nouveaux fichiers appliquent automatiquement le référentiel de renommage avant leur stockage privé dans Supabase.

La migration de production du 11 août 2026 contient :

- 120 certificats et 120 versions documentaires courantes ;
- 118 certificats affichés dans la flotte opérationnelle ;
- 10 certificats expirés, 3 échéances dans les 90 jours et 4 visites déjà planifiées à la date de migration ;
- 120 objets dans le bucket privé `fleet-certificates`, sans lien de base manquant ;
- les documents d'`ECREHOUEL` et de `YARD - Le Havre` conservés dans Supabase, mais exclus de la timeline active comme dans le webpart de référence.

## Source SharePoint

| Élément | Valeur |
| --- | --- |
| Site | `https://bbtm668.sharepoint.com/sites/QHSE` |
| Bibliothèque | `Certificats Flotte BBTM` |
| Identifiant liste | `fff33cda-20da-4a9b-8b55-46630ee5e8b0` |
| Identifiant vue IQY | `A8B4D82A-023E-45DA-8762-0B211CCFA652` |
| Identifiant drive | `b!j0eX05ggd0iS7a1x5WccnspY9pQFywFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw` |

Les champs transférés sont le navire, la section/catégorie, le titre documentaire, l'échéance, la planification, le prestataire, le lieu de visite, les commentaires, l'alarme, le nom d'origine et les métadonnées SharePoint. Les coordonnées nominatives des contacts prestataires ne sont pas intégrées au fichier de migration.

## Workflow de renouvellement

1. L'alarme est calculée à `échéance - 90 jours`.
2. Armement, Direction ou Admin planifie la visite avec date, prestataire, lieu et commentaire.
3. Le nouveau fichier est déposé dans le bucket privé et enregistré comme version `pending_validation`.
4. Une version en attente n'écrase jamais le document courant.
5. Armement, Direction ou Admin valide la version ; l'ancienne devient `archived`, la nouvelle devient `active` et les dates du certificat sont actualisées atomiquement.
6. Chaque étape alimente `fleet_certificate_renewal_events` ; toutes les versions restent dans `fleet_certificate_versions`.

Les fonctions SQL `plan_fleet_certificate_renewal`, `submit_fleet_certificate_renewal` et `validate_fleet_certificate_renewal` appliquent ce workflow. Les capitaines et marins disposent d'un accès en lecture ; les écritures restent limitées aux rôles de bureau.

## Référentiel de renommage

Les noms historiques montrent une convention stable par acronyme de navire. La convention SeaPilot normalisée est :

```text
ACRONYME - TITRE DU DOCUMENT - ANNÉE ÉCHÉANCE.extension
```

Exemple :

```text
GRY - Certificat de Franc-Bord - 2027.pdf
```

Les noms d'origine restent conservés pour l'audit. Seuls les caractères interdits par les systèmes de fichiers sont retirés du titre ; l'objet Supabase reçoit en plus un identifiant unique dans son chemin pour éviter tout écrasement.

## Stockage et sécurité

- Bucket privé : `fleet-certificates`.
- Chemin historique : `{company_id}/{acronyme}/legacy/{index}-{nom sécurisé}`.
- Chemin des renouvellements : `{company_id}/{acronyme}/{certificate_id}/renewals/{uuid}-{nom normalisé}`.
- Chemin des nouveaux documents : `{company_id}/{acronyme}/documents/{uuid}-{nom normalisé}`.
- Taille maximale : 50 Mo.
- Formats autorisés : PDF, PNG, JPEG et XLSX. La détection temporaire `application/zip` utilisée par le client de migration pour le classeur XLSX est retirée après l'import.
- Les politiques Storage vérifient le premier segment `company_id` et le rôle de l'utilisateur.

## Rejouer la préparation d'import

Le script ne publie pas directement de données. Il prépare une migration SQL idempotente et une arborescence d'objets à charger :

```powershell
corepack pnpm import:sharepoint:fleet-certificates -- `
  --iqy .data/sharepoint-certificates-iqy-20260811.json `
  --drive .data/sharepoint-certificates-drive-20260811.json `
  --documents .data/fleet-certificates-source `
  --staging .data/fleet-certificates-upload `
  --migration supabase/migrations/<timestamp>_fleet_certificates_import.sql
```

Les dossiers `.data/` restent ignorés par Git. Les migrations versionnées constituent la source de vérité du schéma et de l'import initial.

## Contrôles de production

Après migration et chargement Storage, les contrôles attendus sont :

- `fleet_certificates` : 120 lignes, dont 118 avec `is_active_fleet = true` ;
- `fleet_certificate_versions` : 120 lignes courantes ;
- `storage.objects` : 120 objets sous le préfixe société `1/` ;
- aucun certificat dont `storage_bucket/storage_path` ne correspond à un objet Storage.
