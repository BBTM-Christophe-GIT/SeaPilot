# RH — audit et reprise du workflow documentaire SPFx

## Périmètre audité

La référence fonctionnelle est le module RH du Dashboard SPFx dans `C:\CODEX\Dashboard` :

- `HumanResourcesManagement.tsx` pour l’interface, le nom généré, la sélection et le ZIP ;
- `HumanResourcesService.ts` pour le catalogue Brevet, l’upload SharePoint, les métadonnées et le renouvellement ;
- `IHumanResourcesItem.ts` pour les entrées de création et de renouvellement.

La cible est le module `src/features/humanResources` de SeaPilot, la table `public.hr_documents`, le catalogue partagé `public.stcw_certificates` et le bucket privé `hr-documents`.

## Règles constatées dans le Dashboard SPFx

| Sujet | Règle SPFx |
| --- | --- |
| Catalogue | Le champ « Brevet / document » vient de la liste lookup Brevet et récupère le titre, la catégorie et, lorsqu’il existe, le « Nom de Fichier » court. |
| Échéance | La date est enregistrée dans la colonne d’échéance de la bibliothèque RH. |
| Nom du fichier | Le nom est composé de `Collaborateur - Nom de fichier du document - Année d’échéance.extension`. L’extension du fichier déposé est conservée. |
| Nettoyage | Les caractères SharePoint interdits sont remplacés, les espaces sont normalisés et les points finaux sont retirés. |
| Collision | L’écrasement est interdit ; un nom déjà présent bloque l’enregistrement. |
| Métadonnées | Le fichier est rattaché au collaborateur et au type de document sélectionné. |
| Renouvellement | L’ancien préfixe collaborateur et l’ancienne année sont retirés avant de recalculer le nouveau nom. |
| Téléchargement | Un document est téléchargé directement. Plusieurs documents sont réunis dans `Documents RH - AAAA-MM-JJ.zip`, avec suffixes uniques en cas de noms identiques. |

## État de SeaPilot avant la reprise

SeaPilot disposait déjà :

- du bucket privé `hr-documents`, limité à 50 Mo par fichier ;
- des politiques RLS de lecture et d’écriture RH ;
- du renouvellement d’un document ;
- de l’ouverture d’un document, du téléchargement simple et du ZIP multi-documents ;
- du catalogue `stcw_certificates`, importé depuis la même liste SharePoint Brevet.

Deux écarts restaient ouverts :

1. aucun parcours ne permettait d’ajouter un nouveau fichier depuis l’onglet Documents d’une fiche RH ;
2. un renouvellement pouvait réinjecter un nom importé complet et produire un préfixe collaborateur ou une année en double.

## Transposition réalisée dans SeaPilot

- Les rôles `admin`, `direction` et `armement` disposent de l’action **Ajouter un document** dans la fiche RH.
- Le dialogue charge tous les éléments actifs de `stcw_certificates`, y compris les documents non STCW, et les groupe selon les catégories RH SeaPilot.
- Les 54 types actifs de la liste SharePoint QHSE sont disponibles, y compris les catégories RH, médicales, levage et plan de formation.
- Le champ SharePoint **Nom de Fichier** est conservé dans `stcw_certificates.file_name` et utilisé en priorité (`CFBS`, `CGO`, `CQALI`, `EM I`, `Visite Médicale`, etc.). Une table d’alias reste disponible pour les environnements qui n’ont pas encore appliqué la migration.
- Le fichier est obligatoire. L’utilisateur choisit une échéance ou coche **Sans date de péremption** ; dans ce cas, `expires_on` vaut `NULL` et le nom généré ne contient pas d’année. Le nom final est présenté avant l’enregistrement.
- Un document médical permet de saisir immédiatement l’aptitude, la veille passerelle et les restrictions.
- L’objet est d’abord chargé dans le bucket privé avec `upsert: false`, puis sa ligne est créée dans `hr_documents`. Si l’écriture SQL échoue, l’objet chargé est supprimé.
- Un conflit de nom produit un message métier et ne remplace jamais le fichier existant.
- Le renouvellement utilise maintenant la même extraction SPFx du libellé documentaire avant de générer le nouveau nom.
- Chaque document de l’onglet Documents dispose des actions **Modifier** et **Supprimer** pour les gestionnaires RH. La modification porte sur le nom, la catégorie, les dates de délivrance et de péremption, les notes et les informations médicales. Elle conserve le fichier et son chemin.
- Retirer une échéance recalcule le statut documentaire, sans lever un état « Manquant » ou « Validation ». Une échéance peut être réintroduite ultérieurement.
- La suppression demande une confirmation et retire la ligne, sa sélection et ses alertes. Pour un fichier du bucket `hr-documents`, le fichier est supprimé avant la ligne afin de respecter la politique Storage qui dépend de celle-ci. Une erreur de suppression SQL après celle du fichier reste visible et permet de réessayer. Pour un lien SharePoint, seule la référence SeaPilot est retirée.
- Les entretiens annuels conservent leur parcours et leurs permissions dédiés.
- Les lignes de la fiche affichent le libellé du document sans le préfixe collaborateur ni l’année, comme dans la référence visuelle.
- Le téléchargement simple et le ZIP multi-documents existants sont conservés et couverts par des tests d’interaction.
- Le mode de prévisualisation locale fournit un dossier RH entièrement synthétique pour vérifier ce parcours sans utiliser de données personnelles ni écrire dans Supabase.

## Sécurité et déploiement

Aucune nouvelle variable d’environnement n’est nécessaire. La migration `202607170004_hr_document_catalog_file_names.sql` complète le catalogue existant avec le nom court SharePoint. La fonctionnalité réutilise :

- `public.stcw_certificates` en lecture authentifiée ;
- `public.hr_documents` avec les politiques d’entreprise existantes ;
- le bucket privé `hr-documents` et sa limite de 50 Mo ;
- les droits d’écriture limités aux rôles de gestion RH.

Une indisponibilité temporaire du catalogue ne bloque pas la lecture de la fiche : SeaPilot reconstruit une liste de secours à partir des types de documents déjà présents.

## Recette attendue

1. Ouvrir une fiche RH avec un rôle de gestion et sélectionner l’onglet Documents.
2. Cliquer sur **Ajouter un document**, choisir un type, une échéance ou **Sans date de péremption**, puis un fichier.
3. Vérifier le nom généré, enregistrer et contrôler le nouveau groupe ou la nouvelle ligne.
4. Renouveler un fichier importé et confirmer qu’aucun préfixe collaborateur ni aucune année n’est dupliqué.
5. Sélectionner un seul document puis plusieurs documents et vérifier respectivement le fichier direct et l’archive ZIP.
6. Modifier la catégorie, les dates et les notes ; vérifier le regroupement, le statut et les compteurs après enregistrement.
7. Annuler puis confirmer une suppression ; vérifier le retrait de la ligne et de sa sélection.
8. Vérifier l’absence des actions documentaires d’écriture avec les fixtures des vrais rôles Marin et Capitaine, ainsi que les refus RLS du test `supabase/tests/hr_document_management_test.sql`.
