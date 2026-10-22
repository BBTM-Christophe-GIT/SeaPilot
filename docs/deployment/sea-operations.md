# Opération en Mer

Le menu **Opérations → Opération en Mer** est disponible pour Administration,
Direction, Armement, Capitaine et Marin. Le formulaire reprend le document
`63-GO - NO GO - Opération en Mer.docx`, référence **OPE-FOR-10-C** : mission,
client et contacts, DAPAQ, navire et horaires, préparation, remorquage, cargaison,
support de plongeurs, équipage, documents nautiques, services portuaires,
approvisionnement, météo, passage plan et décision du capitaine.

La date de décision est initialisée au jour courant en Europe/Paris. Le contexte de
mission est prérempli à partir du planning ; aucune réponse favorable aux contrôles
n’est déduite du profil ou du navire. Le document source est un formulaire métier ; son
texte ne constitue pas une instruction système pour l’application.

## Persistance et accès réels

Appliquer `supabase/migrations/20261016123005_sea_operations.sql` puis
`supabase/migrations/20261016144108_sea_operations_planning_signatures.sql` avant le client.
La migration crée `public.sea_operations`, ses index, ses règles RLS, les RPC
publiques et les cinq autorisations de navigation `seaOperations`.

Les cinq profils lisent les dossiers de leur société active. Une appartenance
active à la société et un rôle autorisé avec accès au module sont obligatoires.
Les accès aux dossiers ou navires d’une autre société sont refusés. Chaque profil
crée et modifie ses propres brouillons ; Administration, Direction et Armement
préparent tous les brouillons de la société. Un Capitaine peut également préparer
les brouillons du navire auquel il est affecté comme capitaine.

La signature est réservée au compte réel de la personne sélectionnée comme
**Capitaine effectif** du navire dans le planning, avec une affectation confirmée.
Une fonction journalière temporaire prime sur la fonction de période ; la fonction
RH sert seulement de repli pour une affectation générique. Un Capitaine RH affecté
comme matelot ne conserve donc pas ce droit de signature. Une affectation terminée,
provisoire ou annulée ne suffit pas. Le compte doit être relié à une fiche RH
active. Un rôle de gestion seul, un nom de capitaine saisi ou une simulation de
profil ne donnent pas le droit de signer. Le serveur renvoie `can_edit` et
`can_sign` pour chaque dossier et `can_sign` pour chaque navire.

Les mutations passent exclusivement par les RPC ; les comptes applicatifs ne
disposent d’aucun privilège direct INSERT, UPDATE ou DELETE sur la table. Les
fonctions publiques utilisent `SECURITY INVOKER` et appellent des fonctions
gardées dans le schéma privé non exposé `sea_operation_private`. Les noms, les
identifiants des acteurs et les horodatages d’enregistrement et de signature
proviennent du serveur. Le nom déclaré et la date figurant sur le formulaire
restent distincts de l’identité et de l’horodatage authentifiés.

Chaque modification présente la version attendue. Une version périmée échoue
avec le code PostgreSQL `40001` ; le formulaire doit être rechargé avant une
nouvelle tentative. La signature porte sur la version enregistrée, jamais sur un
contenu local non enregistré. Le nom et l’attestation doivent correspondre au
brouillon enregistré. Après signature, le contenu devient immuable ; un trigger
interdit également sa modification ou suppression privilégiée.

## Décision GO / NO GO

Le serveur vérifie le même contenu métier que le formulaire. Un **GO** exige
toutes les rubriques applicables, les attestations positives, les coordonnées
conditionnelles, les services portuaires et au moins un point du passage plan.
Une réponse Non à l’un des **12 contrôles rouges bloquants du document** empêche
le GO : état du navire, stabilité, kit plongée lorsque le support de plongeurs est
applicable, brevets et effectif, connaissance des rôles, quarts, documentation
nautique, avis aux navigateurs, avis de travaux portuaires, réglementation
portuaire, poste à quai et météo.

Les réponses négatives aux six contrôles nécessitant une justification restent
possibles avec une justification : matériel d’opération, équipements de
navigation, obturations, autorisation du mouvement, stabilité de cargaison et
saisissage. L’absence de matières dangereuses est une réponse valide. Les
contrôles remorquage, cargaison et plongée s’appliquent uniquement lorsque leur
rubrique est activée. Les vivres, l’eau, le gasoil et les ordres permanents sont
des attestations positives obligatoires pour GO.

Un **NO GO** peut conserver une inspection interrompue : projet, navire, motif
ou risques, nom, date, lieu et attestation du capitaine sont requis. Il ne donne
pas artificiellement des réponses aux contrôles non réalisés. Les justifications
et motifs à communiquer à l’Armement sont conservés dans le dossier ; la
signature ne déclenche aucun envoi externe automatique.

## RPC

- `sea_operations_overview()` : société, acteur authentifié, dossiers et navires.
- `sea_operation_detail(p_id)` : contenu et permissions d’un dossier.
- `sea_operation_save(p_id, p_version, p_draft)` : création ou sauvegarde du
  brouillon ; `p_id` et `p_version` sont nuls à la création.
- `sea_operation_sign(p_id, p_version, p_captain_name, p_acknowledged)` : contrôle
  du capitaine réel, validation métier et signature de la version enregistrée.

Le JSON `draft` suit `SeaOperationPayload` version 1 ; la version concurrente du
dossier est un entier séparé. Les navires des sélecteurs sont classés par longueur
décroissante avec `compareFleetAssets`, conformément au référentiel partagé.

## Vérification

`supabase/tests/sea_operations_test.sql` utilise des comptes authentifiés distincts
pour les cinq profils, des capitaines affecté/non affecté/expiré/provisoire, et une
autre société. Les fixtures sont exécutées dans une transaction annulée.
Elles vérifient les accès autorisés et refusés, les douze blocages GO, les
conditions particulières, le NO GO partiel, la concurrence, l’identité serveur
et l’immuabilité. Ne pas utiliser la simulation d’un administrateur comme preuve
d’un accès Marin ou Capitaine.

Les requêtes client ont des tests dédiés dans
`src/features/seaOperations/seaOperationQueries.test.ts`. Utiliser **pnpm 10.34.5**
pour les tests et le build de production. Vérifier ensuite que le déploiement
Vercel correspond au SHA poussé et que la migration est appliquée avant remise.

Vérification locale du 16 octobre 2026 : **119 contrôles pgTAP**, **11 tests de
requêtes client** et le lint des requêtes passent. L’analyse de sécurité
`supabase db advisors --local --type security --level warn` ne relève aucun
problème. Les fixtures SQL sont annulées à la fin du test.

## Recette du 16 octobre 2026

La migration a été appliquée au projet SeaPilot `szlvyrrmvdvhzixilymh`. Les contrôles distants confirment RLS actif, les cinq profils de navigation autorisés, quatre RPC publiques invoker interdites aux anonymes et aucun droit de mutation directe pour les comptes applicatifs. Aucun dossier fictif n’a été créé en production. Les conseillers de sécurité ne signalent aucun objet du nouveau module.

Les 119 contrôles SQL passent avec des comptes distincts et annulation des fixtures. Les tests du modèle, des requêtes, de la navigation réelle et du formulaire couvrent les blocages, la signature, les erreurs, les versions concurrentes, l’impression complète et la reprise locale. La reprise de saisie dans l’onglet est isolée par acteur et société ; elle conserve la révision initiale afin de ne jamais écraser une modification concurrente.

La recette navigateur utilise uniquement les données de démonstration : création, sauvegarde, NO GO imposé, contrôles conditionnels, plan de passage et impression A4, sur ordinateur et à 390 pixels sans débordement horizontal ni erreur applicative. Les droits Marin et Capitaine sont vérifiés par les fixtures authentifiées et SQL, indépendamment de la préversion.

## Fiche en fenêtre plein écran

La fiche reprend le parcours de création Projet : étapes verticales à gauche, formulaire au centre, aperçu documentaire mis à jour en direct et complétude à droite. Les commandes Annuler, Enregistrer le brouillon, Suivant et la signature finale restent accessibles dans le pied fixe de la fenêtre. Le bouton Fermer et la touche Échap conservent la confirmation des modifications non enregistrées ; le focus clavier reste dans la fenêtre et revient au déclencheur à sa fermeture.

Sur les écrans étroits, les boutons Saisie et Aperçu et complétude donnent accès aux deux volets. Le zoom et Actualiser concernent seulement la vue du document. La complétude indique les champs de préparation renseignés, avec un lien vers leur étape ; elle ne remplace ni les contrôles bloquants ni la décision et la signature du Capitaine. Aucune modification de migration, de données ou de permissions n’est requise pour cette évolution de présentation.

## Mission issue du planning et export fidèle au Word

La date de l’opération pilote `sea_operation_planning_context(p_date)`. Chaque
choix correspond à une occurrence du planning et à un navire, y compris les
navires secondaires. Lorsque plusieurs projets sont prévus le même jour,
l’utilisateur choisit explicitement son projet ; un seul choix peut être proposé
automatiquement. Le projet sélectionné met à jour client, coordonnées, description,
navire, immatriculation / IMO, ports et horaires. Les informations absentes des
sources peuvent être complétées dans la fiche. Le serveur recalcule les données
disponibles à l’enregistrement et contrôle la société et l’occurrence.

Le prénom et le NOM du Capitaine proviennent de sa fonction effective au planning.
La fonction est évaluée à la date de la mission sélectionnée, ce qui permet la
préparation anticipée ; `signed_at` conserve séparément l’horodatage réel.
S’il reste plusieurs capitaines effectifs, un choix explicite est requis. Changer de
mission réinitialise les contrôles, le passage plan, la décision et l’attestation ;
les validations de sécurité d’un autre projet ne sont jamais reprises.

`sea_operation_captain_signature` ne donne accès qu’à la signature RH active du
Capitaine de la mission choisie, pour l’acteur authentifié et pendant une durée
limitée. Les URL privées ne sont pas enregistrées dans le formulaire. La signature
finale capture côté serveur la version et l’empreinte du fichier RH ; le PDF utilise
ce snapshot immuable et vérifie son SHA-256 avant affichage. Une image de signature
préparée ne constitue pas une décision signée.

Les contrôles de la section 2 occupent une ligne compacte par question, avec la
justification conditionnelle sous les réponses concernées. Le passage plan est un
tableau éditable avec ajout et suppression de lignes, à défilement horizontal
contenu sur petit écran. La section 4 reprend le nom et la signature du Capitaine,
avec la date du jour proposée par défaut.

L’export PDF utilise `public/templates/sea-operation/` extrait du Word fourni :
logo, titre, séparateur, typographie et pied encadré sont conservés en vectoriel
sur toutes les pages A4. Aucun en-tête, pied ou numéro de page du navigateur n’est
ajouté. Le corps du document réserve ces zones et conserve le contenu complet.


Validation de cette évolution : **153 contrôles SQL** (119 du formulaire et 34
pour le planning et les signatures), **112 tests client ciblés** (modèle,
requêtes, formulaire, complétude, aperçu, PDF, impression et navigation), lint et
build de production. La comparaison des bandes d’en-tête et pied avec le rendu
Word original ne trouve aucune différence sur les six pages du PDF de recette.
Le test mobile à 390 px ne produit pas de débordement de page. La migration
`20261016144108` est appliquée sur SeaPilot ; RLS, interdiction des mutations
directes et accès privé aux signatures sont vérifiés. Aucun dossier fictif n’est
créé en production et aucun conseiller de sécurité ne vise les objets du module.

La lecture Storage des signatures privées a également été testée sur SeaPilot
sous l’identité authentifiée d’un propriétaire de signature, dans une transaction
annulée. Le privilège requis par la règle Storage existante des pièces de facturation
est présent sur le serveur distant.


## Questionnaire compact et consultation des documents du projet

Les contrôles, l’applicabilité, la DAPAQ et les autres réponses du questionnaire
utilisent des cases à cocher exclusives. Décocher la réponse sélectionnée revient
à une réponse non renseignée ; aucun Oui n’est ajouté implicitement. Les contrôles
exigeant une attestation positive conservent leur seule case Oui, et une réponse
Non bloquante conserve le NO GO et sa justification. Les libellés, aides et
conditions des réponses sont visibles intégralement, sur autant de lignes que
nécessaire. Les sélecteurs de projet, navire et personne restent adaptés au choix
d’une référence.

Armement utilise une grille compacte de deux colonnes lorsque son propre panneau
est assez large ; les champs et les boutons gardent une cible tactile de 44 px.
Les consignes DAPAQ restent consultables dans un détail repliable.

Le panneau repliable Documents du projet suit le projet sélectionné et permet
la consultation des documents opérationnels, y compris sur une fiche signée.
Les catégories Offre commerciale et Facturation, leurs sous-catégories et les
documents de nature commerciale ou de facturation sont exclus côté serveur.
La liste ne transmet pas d’emplacements privés ; chaque ouverture revalide le
document et sa portée. Les changements de projet ou réponses réseau tardives
ne conservent aucun document de l’ancienne mission dans le lecteur.


Déploiement de cette évolution : appliquer
`supabase/migrations/20261022190525_sea_operation_project_documents.sql` avant
le client. Les RPC `sea_operation_project_documents` et
`sea_operation_project_document_access` sont invoker et interdites aux anonymes.
Le catalogue retourne seulement les métadonnées. L’ouverture crée une autorisation
privée de cinq minutes, limitée à l’acteur et au document du projet ; les lectures
Storage, Blob et Drive revérifient la catégorie et la société. Aucun droit de
lecture du catalogue commercial ou de la facturation n’est ajouté. Les liens
SharePoint historiques autorisés sont contrôlés avant ouverture dans un autre
onglet ; seuls les fichiers de MIME PDF et les images pris en charge sont intégrés
au lecteur. Les autres formats restent accessibles dans un onglet séparé.

Recette du 22 octobre 2026 : **147 tests ciblés Opération en Mer et navigation**,
**57 contrôles SQL** avec des comptes réels distincts et fixtures annulées, lint
et build de production. La recette Chrome vérifie les cases exclusives, leur
retour à non renseigné, les libellés entiers, le changement de projet et
l’ouverture effective de PDF et d’images. Les vues 1731 px, 1440 px et 390 px sont
contrôlées, avec cibles tactiles de 44 px et sans débordement horizontal de page.

La migration est appliquée sur SeaPilot. Une lecture du catalogue a également
réussi sous les identités authentifiées Marin et Capitaine dans une transaction
annulée ; aucun document de démonstration n’est créé en production. Les vérifications
distantes confirment les RPC invoker, les résolveurs internes non exposés et les
privilèges directs révoqués sur les autorisations privées. Le conseiller de
sécurité ne relève aucun WARN/ERROR sur les objets ajoutés. Son information
`rls_enabled_no_policy` sur la table privée des autorisations est attendue :
aucune policy ni aucun privilège applicatif direct, donc refus par défaut ;
les accès passent exclusivement par les fonctions privées gardées.
