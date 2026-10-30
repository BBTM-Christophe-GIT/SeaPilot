# Bibliothèque documentaire des projets

La rubrique **Projet → Documents** permet d’ajouter directement une pièce au projet, sans ouvrir l’éditeur du contrat. Le bouton **Documents Projets** des opérations ouvre cette rubrique. Le lien global vers la bibliothèque SharePoint a été retiré ; les références historiques enregistrées sont conservées.

## Ajouter et consulter

Les profils disposant des droits de gestion existants (Admin et Direction) choisissent un fichier, une catégorie active, éventuellement une sous-catégorie liée et une date d’échéance. Le nom du fichier sert de libellé. L’ajout réutilise `storeProjectAttachment`, son dépôt privé vérifié et l’enregistrement métier existant. La limite reste de 50 Mo par fichier. Aucun second stockage n’est introduit.

Un projet archivé reste consultable mais n’autorise aucun nouvel ajout. La gestion du catalogue commun reste accessible selon le rôle. L’archivage invalide également le contexte d’une opération en cours.

Un enregistrement confirmé apparaît immédiatement dans la liste, sans conditionner le succès à un nouveau chargement des projets. Les contrôles sont verrouillés dès le début de l’envoi. Une réponse tardive après changement de projet, client, compte, permission ou fermeture de la rubrique ne publie aucun message ni document dans le nouveau contexte. Une erreur conserve le dialogue et les valeurs saisies ; aucun nouvel envoi automatique n’est effectué.

Les pièces classées, les documents historiques, les documents contractuels et les documents émis ou liés aux opérations restent consultables. La rubrique les regroupe par catégorie du catalogue, dans son ordre d’affichage, sans séparer les fichiers selon leur provenance. Chaque catégorie présente une icône, un repère coloré et son nombre de documents. Les catégories personnalisées conservent un repère stable. Les catégories personnalisées ou retirées conservent leur libellé ; les fichiers sans catégorie connue restent visibles.

Chaque fichier apparaît dans une chip réunissant sa vignette, son nom complet cliquable, le crayon de classification et une action de téléchargement individuel. Le nom et la vignette ouvrent le document ; aucun bouton **Ouvrir** ni volet **Détails** supplémentaire n’est affiché. Les images et les formats pris en charge affichent un aperçu du contenu ; une vignette indisponible reste signalée sans bloquer l’accès au fichier. Le nom revient à la ligne si nécessaire, y compris sur mobile.

La case **Afficher dans « Opération en Mer »** reste réservée aux documents éligibles selon le serveur ; elle utilise la sélection existante, indépendamment de la sélection pour télécharger. Plusieurs fichiers sélectionnés sont regroupés dans une archive ZIP. Une case permet de sélectionner tous les fichiers accessibles d’une catégorie, et son action de téléchargement les réunit directement. Un fichier seul conserve son format d’origine. Le téléchargement d’une catégorie réunit tous ses fichiers accessibles ; un fichier sans emplacement exploitable reste visible et ne peut pas être sélectionné. Les téléchargements réutilisent les accès privés existants. Si une pièce sélectionnée est illisible, l’archive complète est annulée et le message identifie les fichiers concernés. Un changement de projet ou de compte annule la préparation et ignore ses réponses tardives.

L’ajout, la gestion des catégories et les filtres restent accessibles. Les erreurs de chargement restent signalées. Les filtres utilisent les clés du catalogue ; les liens privés sont obtenus au clic par `ProjectStoredDocumentLink`. Les références historiques indisponibles restent affichées avec leur indication d’indisponibilité.

Le client confirme une réponse d’enregistrement perdue par une lecture RLS du chemin exact, du SHA-256 et des métadonnées métier. Il conserve les octets d’une éventuelle pièce déjà enregistrée si le résultat reste incertain. Les PDF dont le téléphone ne fournit pas de MIME reçoivent le type correspondant à leur extension. Les règles de stockage, d’autorisation et d’idempotence sont détaillées dans [la gestion des catégories documentaires](project-document-categories.md).

L’ancien éditeur de projet respecte aussi un catalogue confirmé vide. Les catégories ne sont pas recréées implicitement lors de la consultation. Les offres et contrats émis directement au niveau d’un projet restent visibles même sans opération liée.

## Supprimer un document

Chaque chip propose une corbeille aux gestionnaires du projet (Admin et Direction). Elle est absente pour les profils lecteurs et les projets archivés. La confirmation **Supprimer le document ?** charge d’abord la version actuelle du document auprès du serveur ; le bouton de suppression reste désactivé tant que cette lecture n’est pas confirmée. **Annuler** ne modifie rien. Une lecture refusée peut être relancée avec **Réessayer**, sans déclencher de suppression.

La suppression retire uniquement l’entrée documentaire confirmée de la fiche Projet et d’**Opération en Mer**. Les fichiers, leur historique et les références partagées restent conservés : aucun octet Blob, Drive ou Storage n’est effacé. Les documents de facturation ou autres références encore actives sur les mêmes octets conservent leur propre accès. La sélection de téléchargement et les documents affichés sont mis à jour après confirmation du serveur, sans rechargement global du dossier.

Le serveur vérifie le rôle réel, la société, le projet actif, l’identifiant avec sa provenance (`generated`, `project` ou `contract`) et les métadonnées de la version confirmée. Une pièce modifiée entre la confirmation et la requête n’est pas supprimée. En cas de refus, la ligne et sa sélection restent en place. Un changement de projet, de compte, de client, de permission ou de version source ferme la confirmation et ignore ses réponses tardives.

La migration `20261030070155_project_document_soft_delete.sql` ajoute la suppression logique auditée et ses contrôles de lecture. Les accès nouvellement demandés à une référence supprimée sont refusés, sauf si une référence métier encore active autorise le même fichier partagé. Les liens privés déjà émis conservent leur durée de validité limitée.

## Catégories communes aux projets

Le crayon près du nom de chaque fichier permet aussi de [modifier sa catégorie et
sa sous-catégorie](project-document-classification.md). Ce changement conserve le
fichier et s’applique immédiatement à la liste et aux filtres.

La gestion utilise le catalogue documentaire de la société et le RPC `projects_save_document_categories`. Elle permet de créer ou renommer une catégorie ou une sous-catégorie. Retirer une catégorie désactive aussi ses sous-catégories sans supprimer de documents ni modifier leurs clés historiques. Les libellés des catégories retirées restent visibles et filtrables lorsqu’elles contiennent des documents ; elles ne sont jamais proposées pour un nouvel ajout.

Un chargement du catalogue refusé ou indisponible bloque les ajouts et sa gestion, tout en conservant la consultation des documents. Le bouton de nouvelle tentative ne lance qu’une lecture du catalogue. Un catalogue vide permet de créer des catégories, sans inventer un catalogue d’envoi local.

## Vérification

Les tests de `ProjectDocumentLibrary` couvrent le circuit d’ajout existant, classification/échéance, double soumission, changements de contexte, échecs, catalogue vide ou refusé, filtres historiques et gestion commune. Le catalogue complet est transmis au rendu pour respecter les libellés et l’ordre des catégories. Les tests de `ProjectDocumentChips` et `ProjectsPage` vérifient le regroupement des différentes sources, le déplacement immédiat d’une chip après classification, ses vignettes, ses actions, la sélection de fichiers et catégories pour les téléchargements, la sélection Opération en Mer, l’apparition immédiate du document et son lecteur privé. Les tests des téléchargements et vignettes couvrent les octets privés, les erreurs groupées, le ZIP complet, les aperçus de contenu et leur annulation. Les contrôles accessibles aux fixtures Marin et Capitaine restent couverts. Les tests de suppression couvrent la confirmation de version, les refus, les doubles clics, les changements de contexte et les trois provenances documentaires partageant un même identifiant numérique. Ces fixtures et les captures locales utilisent des données fictives ; les droits réels restent imposés par les RPC/RLS serveur.

```powershell
corepack pnpm test src/features/projects/ProjectDocumentChips.test.tsx src/features/projects/ProjectDocumentLibrary.test.tsx src/features/projects/ProjectsPage.test.tsx --pool=threads --maxWorkers=1
corepack pnpm test src/features/projects/projectDocumentAssets.test.ts src/features/projects/projectDocumentThumbnailRenderer.test.ts src/features/projects/ProjectDocumentThumbnail.test.tsx --pool=threads --maxWorkers=1
corepack pnpm test src/features/projects/ProjectDocumentDeleteDialog.test.tsx src/features/projects/projectDocumentDeletion.test.ts --pool=threads --maxWorkers=1
corepack pnpm build
```

L’interface réutilise `AppDialog`, les boutons `sp-button` et les tokens du [design system](../design/design-system.md). Les actions restent sur une rangée défilante sur mobile et les filtres/formulaires s’adaptent à la largeur disponible.
