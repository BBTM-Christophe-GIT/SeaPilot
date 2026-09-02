# Migration des procédures QSMS

## Périmètre audité

Le module SharePoint `Portail-BBTM---Armement.aspx` expose une bibliothèque de 127 documents de travail QSMS, classés dans les chapitres ISM 01 à 13 et dans « Documents non contrôlés ». L’interface comprend la recherche, les filtres Projet/Navire, la sélection, la création, la modification des métadonnées, le téléchargement, la suppression et la publication d’un PDF dans la bibliothèque `QSMS - PDF`.

Les métadonnées reprises dans SeaPilot sont : catégorie, date de diffusion, description, exigence réglementaire, chapitre ISM, navire, numéro, projet, restrictions, revue annuelle, statut d’approbation, thème, titre, type de document, veille passerelle et version.

Sources identifiées :

- QSMS : liste `958cf50b-779a-4002-811c-0ed8bb41f7b5`, vue IQY `056611E1-DC3F-4B98-A56C-027300FCF8B8` ;
- QSMS - PDF : liste `1a9cd5f9-77a6-45fc-8705-d35005729774` ;
- fichier Power Query fourni : `QSMS.iqy`.

## Modèle SeaPilot

Le module est accessible à l’URL `/modules/procedures` et figure dans le sous-menu `QHSE` de la barre latérale.

| Profil | Documents de travail | Métadonnées | Publier/retirer un PDF | PDF publiés |
| --- | --- | --- | --- | --- |
| Administration | lecture/écriture | lecture/écriture | oui | oui |
| Direction | lecture/écriture | lecture/écriture | oui | oui |
| Armement | aucun accès | aucun accès aux sources | non | lecture/téléchargement |
| Capitaine | aucun accès | aucun accès aux sources | non | lecture/téléchargement |
| Marin | aucun accès | aucun accès aux sources | non | lecture/téléchargement |

Les sources et les PDF sont conservés dans le bucket privé Supabase Storage `procedure-documents` :

- `sources/…` contient les fichiers Word, Excel, PowerPoint ou OpenDocument modifiables ;
- `published/…` contient uniquement les PDF explicitement diffusés.

Les URLs signées ont une durée de cinq minutes. Les règles RLS protègent à la fois les tables et `storage.objects`. La publication crée un instantané des métadonnées afin qu’un PDF diffusé reste traçable indépendamment des modifications ultérieures de la source.

La conversion Office vers PDF n’est pas exécutée dans le navigateur : le responsable sélectionne le PDF approuvé au moment de cliquer sur « Publier PDF ». Cela évite une conversion non maîtrisée et conserve la version signée ou validée par QHSE.

## Déploiement

1. Appliquer la migration `20260902051953_qsms_procedure_document_workflow.sql`.
2. Exporter puis importer les métadonnées SharePoint avec les sources `library-qsms` et `library-qsms-pdf`.
3. Résoudre les liens source/publication avec `--resolve-published-procedure-links`.
4. Contrôler le plan de copie des fichiers :

   ```powershell
   $env:SUPABASE_URL = 'https://<projet>.supabase.co'
   $env:SUPABASE_SERVICE_ROLE_KEY = '<secret de déploiement>'
   corepack pnpm migrate:qsms
   ```

5. Après validation du rapport, fournir un jeton Microsoft Graph ayant accès aux deux bibliothèques et lancer la copie :

   ```powershell
   $env:MS_GRAPH_ACCESS_TOKEN = '<jeton temporaire>'
   corepack pnpm migrate:qsms:apply
   ```

Le script ne journalise aucun secret, refuse les publications dont le contenu n’est pas un PDF, n’écrase aucun objet Storage et supprime l’objet nouvellement copié si l’enregistrement de ses métadonnées échoue. Les URLs SharePoint historiques restent présentes pendant la transition et servent de repli jusqu’à la fin de la copie.

## Contrôles de recette

- Administration et Direction voient l’onglet « Documents de travail », peuvent ajouter/remplacer une source et publier un PDF.
- Armement, Capitaine et Marin ne déclenchent aucune requête vers `public.procedures` et ne voient que `public.published_procedures`.
- Un téléchargement passe par une URL Storage signée ; aucun bucket n’est public.
- Les filtres par texte, projet, navire et chapitre ISM sont cohérents avec les métadonnées importées.
- Un PDF retiré disparaît immédiatement de la vue opérationnelle.

## Retour arrière

La migration est additive et conserve les colonnes et URLs SharePoint existantes. En cas de retour arrière, repointer l’interface vers `file_url`, désactiver le nouveau module, puis restaurer les anciennes politiques après avoir vérifié qu’aucun profil opérationnel ne peut lire `procedures`. Ne pas supprimer le bucket avant d’avoir exporté les objets créés exclusivement dans SeaPilot.
