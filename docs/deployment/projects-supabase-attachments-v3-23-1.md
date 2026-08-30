# Projets — pièces jointes privées Supabase v3.23.1

## Périmètre

- La bibliothèque documentaire du formulaire **Nouveau projet** comprend désormais la catégorie racine
  **Toilette de Mer** et sa sous-catégorie **Attestation Expert/BV**.
- Les nouvelles pièces jointes classées depuis ce formulaire sont stockées dans le bucket privé Supabase
  `project-files`, sous `projects/{projectId}/attachments/{categorie}/{sousCategorie}/…`.
- Elles sont consultables depuis l’onglet **Documents contractuels** de la fiche projet grâce à un lien signé de
  courte durée.
- Les documents contractuels historiques peuvent être copiés dans le même bucket privé. Leur URL et leurs
  identifiants SharePoint sont conservés comme provenance, tandis que l’application ouvre en priorité la copie
  Supabase avec un lien signé.

## Sécurité et données

La migration `20260829060042_project_attachments_supabase_storage.sql` ajoute l’emplacement Supabase au registre
`project_generated_documents`. L’enregistrement des métadonnées passe exclusivement par la fonction
`projects_register_storage_attachment`, qui valide la société active, le rôle Admin/Direction, le projet, la
hiérarchie documentaire et le chemin Storage. La table de registre reste en lecture seule pour les clients.

Les règles RLS du bucket autorisent la lecture d’un objet uniquement lorsqu’il est référencé par un document de la
société de l’utilisateur. Une pièce envoyée mais non enregistrée peut uniquement être nettoyée par son propriétaire
Admin/Direction dans le périmètre du projet.

La migration `20260829064017_project_contract_documents_supabase_storage.sql` ajoute aux documents contractuels
leur bucket, leur chemin privé, leur empreinte SHA-256 et la date de copie. Le script
`pnpm migrate:project-contract-documents --project-code P144 --source-dir <dossier> --apply` est idempotent : il
contrôle l’empreinte d’un objet déjà présent avant de le déclarer migré et ne modifie jamais la provenance
SharePoint.

## Reprise P144

Le 29 août 2026, les huit documents contractuels de **P144 — GUARD VESSEL EMDT** ont été copiés dans
`project-files/projects/2/contract-documents/`. Les huit objets (6 697 410 octets au total) ont été relus depuis
Storage et comparés aux empreintes SHA-256 des fichiers sources. Les huit URL SharePoint d’origine ont été
conservées.

## Vérification après déploiement

1. Ouvrir **Projets → Nouveau projet → Documents** et vérifier **Toilette de Mer → Attestation Expert/BV**.
2. Ajouter un PDF, enregistrer le projet puis rouvrir sa fiche.
3. Dans **Documents contractuels**, vérifier la présence du fichier et son ouverture via le lien sécurisé Supabase.
4. Sur P144, vérifier que les huit documents contractuels affichent **Ouvrir le document** et que chaque lien signé
   Supabase s’ouvre correctement.
5. Vérifier qu’un document historique non encore migré reste accessible via son lien SharePoint de secours.
