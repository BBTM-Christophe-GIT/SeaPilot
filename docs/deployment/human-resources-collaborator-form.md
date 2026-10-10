# Module RH — création d’un collaborateur

La fenêtre **Ajouter un collaborateur** reprend les huit sections de la fiche RH :

1. Identité et poste
2. Contrat et dates
3. Coordonnées
4. Contact urgence
5. Documents administratifs
6. Santé et habilitations
7. Tenues et mensurations
8. Documents

Les champs structurés sont enregistrés directement dans la table Supabase `public.people`. La création utilise les mêmes colonnes que la modification d’une fiche RH existante, notamment les coordonnées, dates de contrat, contacts d’urgence, informations d’identité, habilitations et mensurations.

Les fichiers de l’onglet **Documents** sont ajoutés après la création du collaborateur : ils nécessitent l’identifiant Supabase de la ligne `people` pour être rattachés dans `public.hr_documents` et stockés dans le bucket RH prévu par l’application.

La suppression définitive d'une personne est proposée uniquement au profil **Administrateur**. La même restriction est appliquée par la politique RLS `people_company_admin_delete` ; Direction et Armement conservent la création et la modification, mais ne peuvent pas supprimer. Une suppression reste refusée si des données opérationnelles protégées référencent encore la personne.

Depuis la fiche d’un collaborateur existant, les rôles de gestion disposent de l’action **Ajouter un document**. Le type vient du catalogue partagé `public.stcw_certificates`, la date d’échéance est obligatoire et le fichier est renommé selon la règle du Dashboard SPFx : `Collaborateur - Document - Année.extension`. Les fichiers restent dans le bucket privé `hr-documents`; un nom existant n’est jamais écrasé.

La cloche de notifications affiche à chaque utilisateur les documents RH et brevets rattachés à son propre profil dont l’échéance se situe entre la date du jour et J+40 inclus. Cette liste est recalculée à la connexion, au retour sur l’application et après l’ajout ou le renouvellement d’un document. Les règles RLS de `hr_documents` restent la barrière d’accès aux données personnelles.

Le catalogue RH reprend les **54 éléments actifs** de la liste SharePoint QHSE `8c8561d7-9fb4-420f-8290-b66309d07e92`. La colonne Supabase `file_name` conserve désormais le champ SharePoint **Nom de Fichier** et devient prioritaire pour le renommage automatique. Le mode de prévisualisation utilise le même catalogue complet.

La sélection par cases à cocher permet de télécharger un fichier directement ou plusieurs fichiers dans une archive ZIP datée. Le détail complet de l’audit et des règles reprises est documenté dans `docs/migration/human-resources-spfx-document-workflow.md`.

L’indicateur **Sédentaires** classe un collaborateur à partir du grade, du rôle ou de la fonction. La valeur `Sédentaire` dans la colonne `grade_label` est donc comptabilisée même lorsque `role_label` n’est pas renseigné ou contient une autre valeur.

Les contrôles d’administration « Paramétrer les accès » et le résumé « Visibilité par rôle — Fonctions, documents et sections » ne sont plus affichés dans l’en-tête du module RH. Les règles de lecture déjà enregistrées restent appliquées aux données chargées.

## Liste des marins et date de départ

La carte **Marins par fonction** n’utilise plus le booléen technique `people.active` pour déterminer la population affichée. Par défaut, elle présente les personnes dont `departed_on` est vide, égale à la date du jour ou postérieure. Une date strictement antérieure à aujourd’hui classe la personne dans **Anciens**.

Le raccourci **Voir les anciens** permet de basculer immédiatement vers cette population. Le panneau repliable **Filtres** propose également les vues **En poste**, **Anciens** et **Tous**, ainsi que les filtres collaborateur, fonction, catégorie documentaire, statut et échéance. Le libellé « Actif » n’est plus répété dans les lignes de la liste.

## Fiche collaborateur PDF

Le menu **…** en haut à droite de chaque fiche RH propose **Fiche Collaborateur** à tous les profils qui peuvent consulter cette personne. La fenêtre permet de sélectionner une section complète ou chaque information individuellement, puis de télécharger la fiche en PDF A4. Le nom du collaborateur identifie toujours le document.

Toutes les informations accessibles sont sélectionnées à l'ouverture. La liste **Brevets et visites médicales** propose uniquement les champs **Catégorie**, **Document**, **Échéance** et **Statut**, dans cet ordre. Elle exclut les fichiers de catégorie **Documents administratifs** et les entretiens annuels, puis classe les éléments par catégorie et par nom complet affiché. Les dates d'émission, sources et notes n'apparaissent plus dans cette liste, même si une ancienne sélection les demandait. La section **Documents administratifs** contenant les champs d'identité du collaborateur reste disponible selon ses droits.

Dans l'aperçu et le PDF, la liste apparaît en arborescence : chaque **catégorie** forme une ligne parent de rang 1 et ses **documents** apparaissent en retrait au rang 2, avec leur nom complet, échéance et statut lorsqu'ils sont sélectionnés. Les quatre champs restent sélectionnables séparément. Lorsque **Catégorie** est décochée, l'export présente un tableau plat contenant uniquement les colonnes choisies. Si seule **Catégorie** est sélectionnée, il affiche uniquement les lignes parents, sans documents, dates ni statuts. Cette présentation s'applique aussi aux fiches séparées et regroupées.

Les en-têtes **Document**, **Échéance** et **Statut** ont un fond blanc dans l'aperçu et le PDF ; les catégories gardent un fond clair distinct pour repérer les groupes.

Le nom complet d'un brevet vient du catalogue documentaire déjà chargé : les alias **Nom de Fichier** (`fileName`) et **Nom** (`name`) sont rapprochés du titre nettoyé du document, avec sa catégorie exacte. Lorsqu'une correspondance unique est disponible, le PDF affiche le nom du catalogue au lieu du sigle. Sans correspondance, ou en cas d'ambiguïté, il conserve le titre nettoyé sans inventer un intitulé. Cette présentation s'applique à la fiche individuelle comme aux fiches séparées et regroupées ; elle ne modifie ni le fichier ni les données enregistrées et ne déclenche aucune lecture supplémentaire.

Les anciennes lignes portant le sigle erroné **CQUALI** sont rapprochées de **CQALI** dans le catalogue pour afficher **Certificat de Qualification Avancée à la Lutte contre l'Incendie**, lorsque la correspondance est unique dans la même catégorie. Cette correction concerne uniquement l'affichage du PDF : aucun fichier n'est renommé et aucune donnée n'est écrite en base.

Le libellé historique **HSE Induction** est rapproché de **LEMS — HSE Induction**, conformément au choix de l'utilisateur, lorsque le catalogue fournit une correspondance unique dans la même catégorie ; les fichiers et données enregistrés restent inchangés.

Les listes **Visites médicales** et **Entretien Annuel** conservent leurs colonnes et apparaissent dans la fenêtre et dans le PDF lorsque leurs informations sont sélectionnées. Les dates, statuts, habilitations, aptitude médicale, veille à la passerelle et restrictions peuvent être inclus séparément. Les longues listes sont réparties sur plusieurs pages avec en-tête et pagination.

La case **Inclure la photo**, cochée à l'ouverture, permet de choisir si la photo disponible doit apparaître à gauche de **Fiche Collaborateur** et du prénom et nom, sur chaque page. Décocher cette case conserve le titre et le nom, sans photo. Une photo absente ou indisponible n'empêche pas l'export. Ce choix est indépendant des sections et ne permet pas de générer une fiche sans information sélectionnée.

La section **Signature** est exclue des choix et du PDF. L'export réutilise les documents du collaborateur et les sections déjà autorisées au profil connecté, sans lecture supplémentaire ni modification des données. Les détails médicaux sont limités à la section **Santé et habilitations** ; la liste générale des documents ne les réintroduit pas lorsqu'ils sont décochés. La suppression d'une personne reste réservée à l'Administrateur.

### Export de plusieurs collaborateurs

Le bouton **Exporter les fiches**, au-dessus de la liste RH, permet de cocher
plusieurs collaborateurs parmi ceux affichés par les filtres et autorisés au
profil connecté. Il propose deux formats au choix : **Fiches séparées (ZIP)**,
avec un PDF par personne dans une seule archive, ou **Fiches regroupées (PDF)**,
avec une nouvelle page au début de chaque fiche. Les personnes sont identifiées
sur leurs pages ; les homonymes conservent des noms de fichiers distincts.

Le pied de page conserve la date de génération et la pagination **Page x / y**
de chaque collaborateur. Le PDF regroupé n'ajoute aucun décompte **Fiche x / n**,
y compris lorsqu'un seul collaborateur est exporté.

Les choix de sections, d'informations et d'inclusion de la photo s'appliquent à
toutes les fiches. Le sélecteur d'aperçu permet de consulter les valeurs d'un collaborateur sélectionné
sans changer les informations choisies. Aucun fichier n'est généré si aucune
personne ou aucune information n'est sélectionnée. La génération bloque une
seconde soumission et laisse les choix disponibles après une erreur.

Cet export utilise les mêmes personnes, documents et sections déjà chargés et
autorisés que la fiche individuelle, sans lecture supplémentaire ni écriture RH.
Le profil Marin conserve son export individuel ; le profil Capitaine sélectionne
uniquement les collaborateurs que son compte réel peut consulter.

Aucune migration, dépendance ou variable d'environnement supplémentaire n'est nécessaire. Les tests couvrent la sélection, les deux formats, les homonymes, les listes, les exports longs, les erreurs de génération et les fixtures propres aux profils Marin et Capitaine.

## Déploiement

- Aucune nouvelle variable d’environnement n’est requise.
- Appliquer `202607170004_hr_document_catalog_file_names.sql` pour ajouter et renseigner `public.stcw_certificates.file_name`. La migration vérifie que les 54 éléments SharePoint attendus sont actifs.
- Exécuter la suite de tests, le lint et le build de production avant déploiement.
