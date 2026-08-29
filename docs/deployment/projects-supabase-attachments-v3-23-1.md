# Projets — pièces jointes privées Supabase v3.23.1

## Périmètre

- La bibliothèque documentaire du formulaire **Nouveau projet** comprend désormais la catégorie racine
  **Toilette de Mer** et sa sous-catégorie **Attestation Expert/BV**.
- Les nouvelles pièces jointes classées depuis ce formulaire sont stockées dans le bucket privé Supabase
  `project-files`, sous `projects/{projectId}/attachments/{categorie}/{sousCategorie}/…`.
- Elles sont consultables depuis l’onglet **Documents contractuels** de la fiche projet grâce à un lien signé de
  courte durée.
- Les documents historiques et les documents générés déjà classés dans SharePoint restent inchangés et
  consultables depuis leurs liens existants.

## Sécurité et données

La migration `20260829060042_project_attachments_supabase_storage.sql` ajoute l’emplacement Supabase au registre
`project_generated_documents`. L’enregistrement des métadonnées passe exclusivement par la fonction
`projects_register_storage_attachment`, qui valide la société active, le rôle Admin/Direction, le projet, la
hiérarchie documentaire et le chemin Storage. La table de registre reste en lecture seule pour les clients.

Les règles RLS du bucket autorisent la lecture d’un objet uniquement lorsqu’il est référencé par un document de la
société de l’utilisateur. Une pièce envoyée mais non enregistrée peut uniquement être nettoyée par son propriétaire
Admin/Direction dans le périmètre du projet.

## Vérification après déploiement

1. Ouvrir **Projets → Nouveau projet → Documents** et vérifier **Toilette de Mer → Attestation Expert/BV**.
2. Ajouter un PDF, enregistrer le projet puis rouvrir sa fiche.
3. Dans **Documents contractuels**, vérifier la présence du fichier et son ouverture via le lien sécurisé Supabase.
4. Vérifier qu’un document historique SharePoint reste accessible depuis la même fiche.
