# Migration des procédures QSMS

## Périmètre audité

Le module SharePoint `Portail-BBTM---Armement.aspx` expose 127 documents de travail et 64 PDF publiés, classés dans les chapitres ISM 01 à 12 et dans « Documents non contrôlés ». Ce décompte provient directement des deux listes SharePoint REST. La recherche Microsoft Graph n’en retournait que 125 et 45 : elle omettait notamment un modèle Word `.dotx`, un fichier `.html` et 19 PDF. L’interface comprend la recherche, les filtres Projet/Navire, la sélection, la création, la modification des métadonnées, le téléchargement, la suppression et la publication d’un PDF dans la bibliothèque `QSMS - PDF`.

Les métadonnées reprises dans SeaPilot sont : catégorie, date de diffusion, description, exigence réglementaire, chapitre ISM, navire, numéro, projet, restrictions, revue annuelle, statut d’approbation, thème, titre, type de document, veille passerelle et version. Le projet provient exclusivement du lookup multiple SharePoint `Projet_LK` ; l’ancienne colonne de choix `Projet` n’est pas utilisée.

La fiche information SeaPilot expose uniquement les métadonnées encore utiles à l’exploitation. Les colonnes historiques `type de document`, `catégorie`, `restrictions`, `notes` et `veille passerelle` restent conservées en base pour la traçabilité de la migration, mais ne sont plus éditables dans cette fenêtre. La référence affichée et enregistrée est calculée sous la forme `Thème Numéro-Version`, puis présentée avec le titre sous la forme `Code - Titre`.

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

Un clic sur le nom d'une source Word, Excel ou PowerPoint invoque désormais l'application Microsoft 365 installée sur le poste en mode lecture, au moyen du schéma URI bureau correspondant. Le bouton Télécharger reste disponible pour récupérer une copie locale. Les autres formats conservent leur ouverture directe par URL signée.

Les en-têtes de chapitres reprennent les pictogrammes du portail QSMS d'origine. Les documents classés explicitement dans « Documents non contrôlés » et ceux dont le chapitre ISM n'est pas renseigné sont présentés dans deux groupes distincts.

Le champ Projet de la fiche information est une liste avec recherche alimentée par les projets actifs du catalogue SeaPilot (`public.projects`). La valeur enregistrée reprend le code et le nom du projet, par exemple `P231 - NETTOYAGE CHENAL CNPEF`, afin de rester cohérente avec les filtres et les pastilles de la bibliothèque.

Lorsque « Revue annuelle » est activé et qu’une date de diffusion est renseignée, l’échéance est calculée à `Date diffusion + 1 an`. À partir de J-90, la procédure est mise en évidence dans la bibliothèque et ajoutée aux « Priorités & échéances » de l’accueil Administration/Direction. Le calcul est dérivé des colonnes `annual_review` et `diffusion_on` existantes : aucune duplication ni migration de schéma n’est nécessaire.

Le bucket accepte jusqu’à 100 Mio afin de préparer la migration des sources volumineuses. La limite globale du projet Supabase reste toutefois prioritaire : sur l’offre gratuite elle est de 50 Mio. Deux sources SharePoint (`Démarrage et arrêt de KROKDUR.docx`, environ 71,3 Mio, et `Manuel de Sécurité et des Limites Opérationnelles - LE ROZEL.docx`, environ 50,3 Mio) nécessitent donc le passage à une offre permettant une limite globale d’au moins 100 Mio avant leur copie sans altération.

État contrôlé au 2 septembre 2026 :

- 125 sources sur 127 sont copiées dans Storage ; les deux seules absentes sont `Démarrage et arrêt de KROKDUR.docx` (74 754 491 octets, 71,3 Mio) et `Manuel de Sécurité et des Limites Opérationnelles - LE ROZEL.docx` (52 749 640 octets, 50,3 Mio) ;
- 64 PDF sur 64 sont copiés, y compris le PDF publié `Démarrage et arrêt de KROKDUR.pdf` ;
- le lookup Navire renseigne 34 sources SharePoint et 19 PDF ; après exclusion des deux sources trop volumineuses, SeaPilot contient 32 sources associées à un navire ;
- `Projet_LK` renseigne 18 sources avec 6 libellés de projet distincts et 7 PDF avec 4 libellés distincts. Un document peut référencer plusieurs projets : chaque libellé est alors affiché et filtrable séparément ;
- les 125 sources et les 64 PDF ont une référence SharePoint renseignée ;
- SharePoint classe explicitement 21 sources dans « Documents non contrôlés » ; les 3 sources sans chapitre apparaissent séparément dans « ISM - Chapitre non renseigné » ;
- le bucket contient exactement 125 objets sources et 64 objets publiés.

Les formats historiques `.dotx` et `.html` sont autorisés dans le bucket afin de conserver les deux sources que la recherche Graph ignorait. Ils ne changent pas la règle de diffusion : seuls les PDF publiés sont accessibles aux profils opérationnels.

La conversion Office vers PDF n’est pas exécutée dans le navigateur : le responsable sélectionne le PDF approuvé au moment de cliquer sur « Publier PDF ». Cela évite une conversion non maîtrisée et conserve la version signée ou validée par QHSE.

## Déploiement

1. Appliquer les migrations `20260902051953_qsms_procedure_document_workflow.sql`, `20260902113123_increase_procedure_document_file_limit.sql` et `20260902144500_allow_legacy_procedure_document_mime.sql`.
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

Le script ne journalise aucun secret, refuse les publications dont le contenu n’est pas un PDF, n’écrase aucun objet Storage et supprime l’objet nouvellement copié si l’enregistrement de ses métadonnées échoue. Un fichier supérieur à 50 Mio est ignoré avec son nom et sa taille dans le rapport `file-too-large`, sans tentative d’import. Les URLs SharePoint historiques restent présentes pendant la transition et servent de repli jusqu’à la fin de la copie.

## Contrôles de recette

- Administration et Direction voient l’onglet « Documents de travail », peuvent ajouter/remplacer une source et publier un PDF.
- Armement, Capitaine et Marin ne déclenchent aucune requête vers `public.procedures` et ne voient que `public.published_procedures`.
- Un téléchargement passe par une URL Storage signée ; aucun bucket n’est public.
- Un clic sur une source Office lance Word, Excel ou PowerPoint bureau en lecture, sans passage par Office Online.
- Les filtres par texte, projet, navire et chapitre ISM sont cohérents avec les métadonnées importées.
- La fiche information propose une recherche dans les projets actifs et recalcule immédiatement la référence `Thème Numéro-Version`.
- Une revue annuelle apparaît dans la bibliothèque et sur l’accueil dès J-90 ; le 29 février est reporté au 28 février l’année suivante si nécessaire.
- Un PDF retiré disparaît immédiatement de la vue opérationnelle.

## Retour arrière

La migration est additive et conserve les colonnes et URLs SharePoint existantes. En cas de retour arrière, repointer l’interface vers `file_url`, désactiver le nouveau module, puis restaurer les anciennes politiques après avoir vérifié qu’aucun profil opérationnel ne peut lire `procedures`. Ne pas supprimer le bucket avant d’avoir exporté les objets créés exclusivement dans SeaPilot.
