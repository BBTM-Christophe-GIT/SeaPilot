# Bibliothèque documentaire des projets

La rubrique **Projet → Documents** permet d’ajouter directement une pièce au projet, sans ouvrir l’éditeur du contrat. Le bouton **Documents Projets** des opérations ouvre cette rubrique. Le lien global vers la bibliothèque SharePoint a été retiré ; les références historiques enregistrées sont conservées.

## Ajouter et consulter

Les profils disposant des droits de gestion existants (Admin et Direction) choisissent un fichier, une catégorie active, éventuellement une sous-catégorie liée et une date d’échéance. Le nom du fichier sert de libellé. L’ajout réutilise `storeProjectAttachment`, son dépôt privé vérifié et l’enregistrement métier existant. La limite reste de 50 Mo par fichier. Aucun second stockage n’est introduit.

Un projet archivé reste consultable mais n’autorise aucun nouvel ajout. La gestion du catalogue commun reste accessible selon le rôle. L’archivage invalide également le contexte d’une opération en cours.

Un enregistrement confirmé apparaît immédiatement dans la liste, sans conditionner le succès à un nouveau chargement des projets. Les contrôles sont verrouillés dès le début de l’envoi. Une réponse tardive après changement de projet, client, compte, permission ou fermeture de la rubrique ne publie aucun message ni document dans le nouveau contexte. Une erreur conserve le dialogue et les valeurs saisies ; aucun nouvel envoi automatique n’est effectué.

Les pièces classées, les documents historiques, les documents contractuels et les documents émis ou liés aux opérations restent consultables. La rubrique affiche directement les fichiers présents, sans les anciens titres de groupes, encadrés vides ni raccourci vers « Offre & contrat ». L’ajout, la gestion des catégories et les filtres restent accessibles. Les erreurs de chargement restent signalées. Les filtres utilisent les clés du catalogue ; les liens privés sont obtenus au clic par `ProjectStoredDocumentLink`. Les références historiques indisponibles restent affichées avec leur indication d’indisponibilité.

Le client confirme une réponse d’enregistrement perdue par une lecture RLS du chemin exact, du SHA-256 et des métadonnées métier. Il conserve les octets d’une éventuelle pièce déjà enregistrée si le résultat reste incertain. Les PDF dont le téléphone ne fournit pas de MIME reçoivent le type correspondant à leur extension. Les règles de stockage, d’autorisation et d’idempotence sont détaillées dans [la gestion des catégories documentaires](project-document-categories.md).

L’ancien éditeur de projet respecte aussi un catalogue confirmé vide. Les catégories ne sont pas recréées implicitement lors de la consultation. Les offres et contrats émis directement au niveau d’un projet restent visibles même sans opération liée.

## Catégories communes aux projets

Le crayon près du nom de chaque fichier permet aussi de [modifier sa catégorie et
sa sous-catégorie](project-document-classification.md). Ce changement conserve le
fichier et s’applique immédiatement à la liste et aux filtres.

La gestion utilise le catalogue documentaire de la société et le RPC `projects_save_document_categories`. Elle permet de créer ou renommer une catégorie ou une sous-catégorie. Retirer une catégorie désactive aussi ses sous-catégories sans supprimer de documents ni modifier leurs clés historiques. Les libellés des catégories retirées restent visibles et filtrables lorsqu’elles contiennent des documents ; elles ne sont jamais proposées pour un nouvel ajout.

Un chargement du catalogue refusé ou indisponible bloque les ajouts et sa gestion, tout en conservant la consultation des documents. Le bouton de nouvelle tentative ne lance qu’une lecture du catalogue. Un catalogue vide permet de créer des catégories, sans inventer un catalogue d’envoi local.

## Vérification

Les tests de `ProjectDocumentLibrary` couvrent le circuit d’ajout existant, classification/échéance, double soumission, changements de contexte, échecs, catalogue vide ou refusé, filtres historiques et gestion commune. Les tests de `ProjectsPage` vérifient l’intégration, l’apparition immédiate du document, son lecteur privé, les documents émis au niveau du projet et les contrôles accessibles aux fixtures Marin et Capitaine. Ces fixtures et les captures locales utilisent des données fictives ; les droits réels restent imposés par les RPC/RLS serveur.

```powershell
corepack pnpm test src/features/projects/ProjectDocumentLibrary.test.tsx src/features/projects/ProjectsPage.test.tsx --pool=forks --maxWorkers=1
corepack pnpm build
```

L’interface réutilise `AppDialog`, les boutons `sp-button` et les tokens du [design system](../design/design-system.md). Les actions restent sur une rangée défilante sur mobile et les filtres/formulaires s’adaptent à la largeur disponible.
