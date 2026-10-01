# Audits documentaires

Les entrées **OVID**, **eCMID**, **Audit ISM Externe** et **Audit Client** utilisent un module commun. Chaque société conserve un seul dossier par type, année de campagne et navire. Les sélecteurs reprennent les vrais navires actifs de la flotte ; aucun site, planning ou audit ISM interne n’est créé ou modifié pour ce module.

Le dossier contient un titre, une date d’audit facultative, le nom de l’auditeur et plusieurs rapports ou pièces jointes. Après création, le type, le navire et l’année restent conservés ; le titre, la date et l’auditeur peuvent être corrigés par un gestionnaire. Plusieurs écarts peuvent être enregistrés sur chaque dossier, avec une référence, une description et des pièces justificatives.

## Écarts et traitement

Les catégories sont **Findings**, **Non Conformité Majeure**, **Non Conformité Mineure** et **Remarque**. Un responsable est obligatoire dans tous les cas : une personne active de la société ou une fonction sur un navire actif, parmi Capitaines, Chefs Mécaniciens et Équipage. Le serveur reconstruit son libellé depuis les données réelles.

Une majeure propose une semaine de traitement, une mineure un mois calendaire. Les durées sont modifiables en jours, semaines ou mois. L’échéance est calculée par le serveur depuis la date d’ouverture à Paris ; la fin de mois est ajustée, par exemple du 31 janvier au 28 ou 29 février. La date d’ouverture d’un nouvel écart et sa date de clôture ne proviennent jamais du navigateur. Un Finding peut avoir un délai facultatif. Une Remarque n’a aucune échéance et sa clôture reste facultative.

Les vrais comptes Capitaine et Marin peuvent enregistrer le traitement de leurs écarts personnels ou collectifs. Pour une fonction collective, le serveur vérifie un embarquement confirmé et en cours sur le navire désigné dans la société active. Le rôle générique du planning utilise la fonction RH ; une fonction explicite du planning est prioritaire. Un Matelot n’obtient donc pas un écart réservé au Chef Mécanicien, et une affectation provisoire n’accorde aucun accès collectif.

Le traitement accepte un commentaire, des photos ou des fichiers. Le responsable peut proposer l’état **Traité, à vérifier** ; Administrateur, Direction ou Armement vérifie ensuite la clôture. Une Remarque peut être clôturée directement par un gestionnaire. Les autres catégories passent d’abord par la résolution. Un écart clos doit être rouvert au moyen d’un événement de suivi avant correction de son constat. Le journal conserve l’auteur authentifié, le commentaire, l’état et l’horodatage serveur de chaque création, modification, traitement, clôture et réouverture. Les états ne peuvent pas être modifiés par la sauvegarde du formulaire de constat.

## Fichiers privés

Le bucket `documentary-audit-files` reste privé. Les formats acceptés sont PDF, DOCX, XLSX, PPTX, TXT, CSV, JPEG, PNG et WebP. Les documents sont limités à **25 MiB**, les images à **10 MiB**. Le bucket applique son plafond de 25 MiB et sa liste MIME ; la validation du client et des références serveur applique le plafond plus strict des images. Un enregistrement ajoute au maximum 10 nouveaux fichiers et un dossier, constat ou événement contient au maximum 100 références. Les anciens formats Office binaires, SVG et HEIC ne sont pas acceptés.

Les chemins suivent `société/audit/enregistrement/nature/auteur/UUID.extension`. La nature est `audit`, `finding`, `treatment` ou `closure`. Pour un rapport, l’identifiant d’enregistrement est celui du dossier ; pour les autres pièces, c’est celui de l’écart. Le dossier est créé avant tout téléversement. Un gestionnaire peut préparer les pièces d’un nouveau constat sous son dossier existant. Les traitements exigent un écart autorisé existant ; la clôture et ses fichiers exigent un gestionnaire et un état permettant la clôture.

Le serveur vérifie pour chaque référence nouvelle le chemin exact, l’auteur, la société, le dossier, le format, la taille et les métadonnées de l’objet de stockage appartenant à cet auteur. Les identifiants et chemins des fichiers sont uniques dans leur liste. Les références enregistrées ne contiennent aucune URL de téléchargement. Le client obtient des URL signées temporaires après vérification des droits de lecture.

Une fois rattachée, une preuve doit rester dans son dossier, son constat ou son événement : elle ne peut plus être supprimée, remplacée ou déplacée par le client. Le bucket ne possède aucune politique UPDATE. Seuls les fichiers personnels encore non rattachés peuvent être nettoyés après un échec de sauvegarde. Une réponse réseau perdue après une sauvegarde réussie peut empêcher ce nettoyage ; le client doit comparer les chemins effectivement supprimés et proposer un rechargement si l’issue reste incertaine.

## Rapports PDF

Le rapport du dossier rassemble la liste des écarts visibles, leurs responsables et échéances, tout l’historique autorisé et les preuves du constat, du traitement et de la clôture. L’export **un seul écart** reprend exclusivement ce constat et son historique ; il exclut les documents annuels et les autres écarts du dossier.

Les photos sont visibles dans les pages du rapport. Les pages des PDF joints sont ajoutées après une couverture d’annexe. Tous les fichiers originaux, y compris Word, Excel, PowerPoint, CSV et photos, sont aussi attachés dans le PDF et restent récupérables avec un lecteur gérant les pièces jointes. Le téléchargement privé est effectué au moment de l’export ; aucune URL temporaire n’est enregistrée dans le rapport. Un fichier inaccessible, vide ou un PDF protégé/invalide bloque l’export avec une explication, afin de ne pas produire un rapport incomplet.

## Autorisations et API

Les trois tables publiques `documentary_audits`, `documentary_audit_findings` et `documentary_audit_events` ont RLS et des droits SELECT explicites pour les utilisateurs authentifiés. Elles ne donnent aucun droit direct INSERT, UPDATE ou DELETE au client. Les fonctions contrôlées du schéma non exposé `documentary_audit_private` réutilisent les vérifications de société et d’affectation réelle du module interne.

Administrateur, Direction et Armement gèrent les dossiers et écarts de leur société active. Un responsable lit son dossier parent et les seuls écarts et événements qui lui sont affectés. Une présence à bord sans affectation à un écart n’autorise aucune lecture supplémentaire. Les fichiers du dossier parent sont visibles aux responsables ayant accès à ce dossier ; les pièces d’un constat ou d’un événement suivent exclusivement les droits de cet écart. Un administrateur d’une autre société n’a aucun accès aux données ou preuves du dossier.

Les cinq RPC publiques utilisent `SECURITY INVOKER` et sont interdites aux anonymes :

- `documentary_audits_overview(p_kind)` retourne société, navires actifs, personnes assignables pour les gestionnaires, dossiers, écarts, événements et permissions serveur.
- `documentary_audit_save(p_payload)` crée le dossier ou corrige son titre, sa date, son auditeur et ajoute ses rapports.
- `documentary_audit_save_finding(p_payload)` crée ou modifie le constat, son responsable et sa durée sans modifier son état.
- `documentary_audit_add_treatment(p_finding_id,p_status,p_treatment,p_files)` ajoute un événement et actualise l’état contrôlé.
- `documentary_audit_upload_scope(p_audit_id,p_finding_id,p_kind)` vérifie les droits avant téléversement et retourne les identifiants de société et de dossier.

Les types serveur sont `ovid`, `ecmid`, `external_ism` et `client`. Le contrat client conserve `siteId` sous forme de chaîne ; il représente ici l’identifiant numérique réel du navire. Les références JSON de fichiers utilisent `id`, `fileName`, `storagePath`, `mimeType` et `sizeBytes`. Le champ client temporaire `url` est retiré avant persistance. Les permissions de navigation OVID sont enregistrées pour les cinq profils, indépendamment des autorisations RLS de données.

## Déploiement et recette

Appliquer `supabase/migrations/20261001060641_documentary_audits.sql` après les deux migrations du module interne. Déployer le client seulement une fois les tables, RPC, bucket et politiques vérifiés. Les migrations ISM internes déjà publiées restent inchangées.

La suite `supabase/tests/documentary_audits_test.sql` passe localement avec **121 contrôles pgTAP** et des comptes distincts Armement, Capitaine, Marin, Chef Mécanicien, responsable personnel, affectation provisoire et administrateur d’une autre société. Elle couvre les quatre types, la clé annuelle unique, les données falsifiées, les délais, la clôture automatique, l’immuabilité des pièces et du journal, les limites de taille et de lot, les chemins, MIME, propriété, le scope de téléversement depuis un écart et les refus de lecture et d’écriture. Les créations concurrentes avec le même UUID sont rejetées avant de pouvoir écraser des preuves. Les fixtures et leurs métadonnées de stockage sont intégralement annulées par `ROLLBACK`. Leurs éventuels rétablissements de droits manquants dans une ancienne base locale ne constituent aucune modification de production.

Les **111 contrôles SQL** existants du module interne passent également. Le conseiller de sécurité local Supabase ne signale aucune anomalie. Avant application distante, contrôler l’absence de politiques Storage génériques donnant accès à ce nouveau bucket ; après application, vérifier RLS sur les trois tables, le bucket privé, les trois politiques SELECT/INSERT/DELETE et les cinq signatures RPC. Les recettes Capitaine et Marin utilisent des comptes et fixtures réels, jamais les vues de profil simulées d’un administrateur. Le parent de livraison exécute les tests client, la compilation de production et la vérification du déploiement Vercel.

La migration finale `20261001060641_documentary_audits.sql` est appliquée au projet SeaPilot `szlvyrrmvdvhzixilymh`. Le contrôle distant confirme les trois tables avec RLS, les cinq RPC invoker interdites aux anonymes, le bucket privé et ses trois politiques, ainsi que les permissions OVID pour les cinq profils. Aucun dossier, écart ou événement fictif n’est créé en production. Aucun objet documentaire n’est signalé par le conseiller de sécurité ; les index récemment créés restent logiquement inutilisés tant que le module ne contient aucune donnée.

Les tests client couvrent les quatre interfaces, les permissions reçues du serveur, les mutations avec récupération après erreur, les fichiers privés, les délais et les exports PDF complets/individuels. Les PDF sont chargés réellement pour comparer les pièces originales et les pages annexées. La recette navigateur de démonstration vérifie plusieurs fichiers ajoutés au dossier, une majeure avec photo, traitement puis clôture avec preuves, export individuel et complet, ainsi que les pages à 390 pixels sans débordement. La compilation de production de la version 3.64.0 passe avec pnpm 10.34.5.

En cas de retour arrière du client, conserver les tables, les fichiers et l’historique. Ne pas supprimer les preuves rattachées pour revenir à la version précédente de l’interface.
