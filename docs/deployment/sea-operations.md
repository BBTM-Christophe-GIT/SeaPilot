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
tableau éditable avec ajout et suppression de lignes, adapté sans défilement
horizontal. La section 4 reprend le nom et la signature du Capitaine,
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

Les contrôles et l’applicabilité utilisent maintenant des interrupteurs Oui/Non.
Les contrôles des nouvelles fiches proposent Oui par défaut. Les quatre rubriques
Remorquage, Chargement de marchandise, Navire de support de plongeur et
Approvisionnement / Avitaillement proposent **Non** par défaut depuis la 3.77.4 ;
les activer sur Oui affiche leurs contrôles. La restauration conserve les
réponses existantes et les réponses vides restent « À vérifier ». La décision GO
et l’attestation finale ne sont jamais prévalidées. Les contrôles exigeant une
affirmation positive acceptent Non en brouillon mais empêchent toujours GO.
La DAPAQ et les choix de décision conservent leurs choix exclusifs. Une réponse
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

## Passage Plan, tirant d’eau et prévisions par ETA — 3.77.6

L’étape est nommée **Passage Plan**, y compris dans l’aperçu et le PDF. Ses points
sont regroupés en lignes de champs adaptatives, sans largeur minimale ni
défilement horizontal. Le premier champ est nommé **Waypoint**. Les contacts VHF
et les prévisions de vent moyen / houle significative Hs figurent dans chaque
ligne, avec les coordonnées et l’ETA correspondantes. La clé historique
`descriptionVhf` conserve la description des fiches existantes.
Depuis la version 3.77.12, un clic sur l’ETA ouvre directement un calendrier
mensuel et un champ heure, explicitement à l’heure de Paris. Une ETA vide ouvre
le mois courant en Europe/Paris sans présélectionner de date ni d’heure ; une
ETA existante ouvre son mois. **Appliquer** renseigne les deux valeurs ensemble,
**Annuler**, Échap ou un clic extérieur abandonne la saisie en cours. Les heures
inexistantes ou ambiguës lors du changement d’heure sont refusées. Le format
persisté reste `YYYY-MM-DDTHH:mm` ; une valeur inchangée conserve ses secondes
éventuelles. Une ancienne ETA `HH:mm` reste intacte ; le bouton Appliquer la date
de l’opération permet une conversion volontaire. Aucune fiche signée n’est migrée.

La fiche regroupe ses champs en une ou deux rangées sur les panneaux larges et
s’adapte aux petits écrans sans défilement horizontal. Les contacts VHF gardent
une ligne par contact et la carte météo de saisie est plus dense, sans doublon
de l’indicateur sous Waypoint. Ces styles ne modifient pas le PDF ni l’impression.

Les nouvelles réponses par défaut sont produites par `newSeaOperation()` ;
`emptySeaOperation()` reste neutre pour les anciens payloads et les fixtures.
Un changement de mission recrée les valeurs par défaut et remet à zéro décision,
attestation, justifications et route. Un brouillon modifiable lié au planning dont
le nom du signataire est vide récupère le Capitaine effectif sélectionné ; aucune
identité déjà renseignée ni fiche signée n’est remplacée.

La migration `20261022204736_sea_operation_vessel_draft.sql` ajoute
`public.vessels.draft_m`, numérique facultatif, strictement positif et inférieur
ou égal à 50 m. Aucun défaut ni remplissage des vrais navires n’est appliqué.
Le module Navires permet de renseigner cette mesure selon ses droits existants.
L’overview Opération en Mer expose seulement la référence du navire autorisé,
reprise dans Passage Plan par `draftMeters`. Une valeur inconnue reste absente,
jamais zéro. Cette référence actuelle ne modifie aucun payload signé et ne
remplace pas la mesure du tirant d’eau réel d’exploitation.

### Répertoire VHF géolocalisé

Les contacts sont proposés à partir des coordonnées WGS84 des points **et des
segments** entre points consécutifs. Les degrés décimaux, degrés/minutes et
degrés/minutes/secondes sont acceptés avec contrôle de l’axe et des bornes.
Un point invalide coupe la route : aucun segment n’est inventé au-dessus du point
manquant. Les entrées sont dédupliquées ; une route hors du répertoire reste sans
contact proposé.

Le répertoire initial couvre des centres/ports de Manche, d’Atlantique français
et du sud de l’Angleterre, avec des coordonnées de repère arrondies. Le filtre de
proximité (80 M pour les centres, 10 M pour les ports) **n’est pas une zone SAR,
une limite VTS ni une portée radio**. La liste est explicitement non exhaustive.
Les sources officielles de chaque canal et contact sont accessibles depuis la
fiche. Téléphones et MMSI ne sont affichés que lorsqu’ils ont été vérifiés ; par
exemple les notices UKHO juillet/août 2026 pour Falmouth, Dover et le JRCC UK.
L’annuaire ne déduit ni hôpital adapté ni consigne d’appel obligatoire d’une simple
distance.

Chaque ligne du tableau présente les contacts proches de ce waypoint. La copie
des contacts, des canaux et des sources est conservée dans la fiche lors de son
enregistrement. Le répertoire global par route reste une aide à la préparation
des brouillons. L’export d’une fiche signée utilise exclusivement ses copies
enregistrées ; un historique sans copie reste explicitement non renseigné.
L’export ne consulte aucun service réseau pour remplacer ces contacts.

### Météo : vent et houle significative Hs

`SeaOperationWeatherPanel` consulte automatiquement les coordonnées et l’ETA de
chaque point lorsque Passage Plan est ouvert. Les changements de point/projet
annulent les requêtes précédentes ; les réponses tardives ne réapparaissent pas.
Trois points sont chargés en parallèle au maximum et les modifications sont
temporisées. Les ETA incomplètes, heures inexistantes/ambiguës de changement
d’heure, dates passées ou hors horizon restent explicitement indisponibles.

Le fournisseur par défaut est **Météo-France MFWAM 0,025°, forcé par AROME**.
Le [catalogue officiel](https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg)
et ses fichiers GRIB2 sont publics, sous Licence Ouverte 2.0 : cette voie ne
requiert ni abonnement payant, ni compte API, ni clé. Le serveur découvre les
réseaux/échéances disponibles puis décode les paquets CCSDS/AEC avec ecCodes-WASM.
Les téléchargements sont limités aux URL HTTPS du répertoire MFWAM 0025 / SP1
attendu, sans redirection ; les tailles sont plafonnées à 2 Mo pour le catalogue
et 20 Mo par fichier. Le WASM reste exclusivement dans la fonction serveur.

Les champs `WIND` / `DWI` fournissent le vent moyen à 10 m en nœuds et degrés de
provenance. **Houle significative (Hs)** reprend `SHS` / `MPS` / `MDS` : hauteur
en mètres, période en secondes et provenance en degrés de la houle totale,
distincte de la mer totale `SWH` et de la mer du vent. Les rafales ne sont pas
affichées. Le réseau, l’heure prévue réelle et la maille du modèle sont visibles.
La maille la plus proche est utilisée pour tous les champs ; une maille terrestre
masquée reste indisponible, sans déplacement silencieux vers la mer.

Le domaine couvre 38–53° N et 8° O–12° E, dont la Manche, l’Atlantique français
et le sud de l’Angleterre. L’horizon dépend des fichiers effectivement publiés
(48 h depuis le réseau dans le catalogue contrôlé le 22 octobre 2026), sans
extrapolation. L’ETA est convertie d’Europe/Paris vers UTC. L’écart à l’heure du
modèle reste inférieur ou égal à 30 minutes, sans interpolation cachée. Une
donnée absente n’est jamais assimilée à zéro. Ces prévisions ne valident aucun
contrôle GO / NO GO. Les réponses reçues pour le projet, le compte, les coordonnées
et l’ETA encore sélectionnés peuvent être conservées dans le brouillon. Elles
incluent les heures du modèle en UTC, le réseau, la maille, la source et l’heure
de consultation. La sauvegarde puis la signature conservent cette copie. Une
nouvelle recherche ne réécrit jamais une fiche signée ; un ancien historique
sans copie indique « prévisions non enregistrées », sans reconstituer sa météo.

### Placement des waypoints sur la carte — 3.77.9

Dans un brouillon modifiable, **Placer les waypoints** ouvre la carte en mode
placement, y compris lorsque le tableau est vide. Un clic ou toucher ajoute un
point à la fin du tableau avec un nouvel identifiant et un numéro disponible ;
latitude et longitude WGS84 sont reportées en degrés décimaux. Le tableau reste
modifiable pour affiner ces positions et compléter description, ETA et UKC.
Aucune ETA, UKC, météo ou validation n’est copiée d’un autre waypoint.

Le cadrage est conservé pendant le placement pour éviter qu’il saute après chaque
ajout. Les boutons permettent de zoomer, déplacer la vue ou **Cadrer le parcours**.
Faire glisser déplace seulement la carte et ne crée pas de point. Le clavier et
**Ajouter au centre** offrent une autre façon de placer un point ; **Terminer le
placement** revient à la carte de consultation. Changer de vue ne modifie pas le
brouillon ; ajouter un point le marque comme non enregistré. **Enregistrer le
brouillon** conserve les points dans le fonctionnement de sauvegarde habituel.

Depuis **3.77.11**, le bouton **Plein écran** agrandit cette carte pour placer
les waypoints plus facilement. Le zoom, le cadrage et les points restent
conservés à l’aller et au retour. **Quitter le plein écran** ou Échap ramène
à la fiche sans terminer le placement ; un nouvel Échap termine le placement.
Le plein écran n’ajoute ni n’enregistre de waypoint à lui seul.
**Terminer le placement** revient directement à la fiche. Si le navigateur
refuse le plein écran natif, la carte occupe la fenêtre disponible.

Le callback contrôle les droits et refuse les ajouts pendant sauvegarde/export,
après signature et en lecture seule. Les fiches Capitaine/Marin utilisent les
permissions renvoyées par le serveur. L’impression et le PDF restent des cartes
de consultation, sans commandes de placement. Le fond indicatif Natural Earth
embarqué et les limites de précision décrites ci-dessous restent identiques.
Aucune migration, API de carte, dépendance applicative, clé ou note de mise à jour.

### Carte du parcours au-dessus du tableau — 3.77.8

La fiche, son aperçu et le PDF présentent une **Carte du parcours** avant le
tableau du Passage Plan. Le cadrage suit automatiquement les positions WGS84
saisies, avec le nord en haut, une grille de coordonnées et une échelle indicative
en milles nautiques. Les repères reprennent l’ordre des lignes du tableau et les
segments relient seulement deux lignes consécutives dont les coordonnées sont
valides. Une ligne manquante ou invalide interrompt le tracé ; elle n’est jamais
contournée par une liaison inventée. Sans position valide, un message invite à
renseigner latitude et longitude. Les repères confondus restent identifiables.

Le fond terrestre est embarqué depuis Natural Earth, sans clé, tuiles distantes
ni transmission des coordonnées à un tiers. Sa provenance, ses tolérances de
simplification et son script de reconstruction sont dans
[`mapData/README.md`](../../src/features/seaOperations/mapData/README.md).
Cette carte de situation représente le tracé saisi ; elle ne calcule pas de route
navigable, ne fournit pas de sonde et ne remplace pas les cartes SHOM identifiées.
Les géométries sont partagées par le SVG de la fiche et le dessin vectoriel PDF.
Le chapitre 3 reste en paysage et conserve ses dix colonnes et les éléments Word.
La carte utilise uniquement le contenu courant ou enregistré de la fiche, y
compris signée ; elle ne modifie ni la signature, ni les permissions, ni les RPC.
Aucune migration, dépendance applicative, clé ou nouvelle note de mise à jour.

### Matrice Hs × période par navire — 3.77.7

Dans **Navires → fiche du navire → Conditions météo limites**, la matrice se
consulte pour chaque navire. L’édition utilise le droit de modification de la
fiche Navire existant, réservé à l’administration. Marin et Capitaine consultent
la matrice sans l’éditer. Bureaux et quais n’affichent pas cette section.

`vessels.weather_matrix` est nullable. Le modèle v1 contient sept bornes basses
Hs, une borne Hs supérieure, six bornes basses de période et 42 cellules, chacune
vide ou parmi Confortable, Peu confortable, Fatiguant, 12 heures max et Rude.
Les axes sont modifiables ; appliquer des bornes conserve les cellules à leur
position, ce qui est explicitement indiqué dans le formulaire. Les bornes basses
sont incluses et les hautes exclues, sauf la dernière borne Hs incluse. La
dernière tranche de période est ouverte vers le haut. Aucune interpolation ni
extrapolation des cellules n’est effectuée.

La référence GOURY fournie par l’utilisateur est transcrite dans le navire
`id=1`, société `id=1`, uniquement si son nom est GOURY et sa matrice encore
absente. Les autres navires restent sans matrice. La référence initiale utilise
les tranches Hs de 0 à 3,5 m par pas de 0,5 m et les périodes <5 s, 5 à <7 s,
7 à <9 s, 9 à <11 s, 11 à <13 s et ≥13 s. Le bouton modèle GOURY ne sauvegarde
rien sans l’action Enregistrer de la fiche.

Chaque waypoint présente une carte météo avec Hs, **période moyenne de la houle**
en secondes, provenance, vent moyen sans rafales et horaires UTC. Le décodage
MFWAM déjà utilisé récupère la période GRIB2 `10/0/9`, définie comme la période
moyenne des houles par la
[table officielle des paramètres](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_table4-2-10-0.shtml).
L’indicateur est calculé à partir des valeurs non arrondies de Hs et de période.
Une matrice absente ou sans cellule définie, et une cellule vide pour la tranche
concernée, n’affichent aucun indicateur ; la carte météo reste visible. Une
prévision Hs / période absente ou Hs hors bornes dans une matrice définie sont
signalées explicitement, jamais assimilées à un niveau confortable.
La catégorie 12 heures max ne déduit pas la durée d’exposition du trajet et ne
remplace pas la décision du Capitaine. Aucun seuil de vent n’est ajouté.

À la sauvegarde d’un brouillon, le serveur copie la configuration canonique du
navire et de sa société dans `draft.vessel.weatherMatrix`. Une autre matrice
fournie par un client ne peut pas remplacer celle de Navires. La signature garde
la copie sauvegardée, même si la configuration du navire change ensuite.
Les anciennes fiches signées sans copie restent sans évaluation ; aucune fiche
historique n’est réécrite. Le tableau HTML et le PDF paysage reprennent la carte
météo, avec leurs sources et horaires conservés. Depuis la version **3.77.10**,
l’indicateur du document apparaît dans la carte **Météo à l’ETA** de chaque
waypoint ; la colonne séparée **Conditions de vie à bord** est supprimée.
L’indicateur n’est pas répété dans la colonne Waypoint.

La migration `20261023051322_vessel_weather_limits.sql` doit précéder le
frontend. Elle ajoute la validation de la matrice et sa capture canonique,
ainsi que son exposition dans les contextes Navires / Opération en Mer,
sans modifier les règles de société, RLS, affectation ou signature existantes.

### Tableau du document en paysage

Le chapitre 3 du PDF utilise une page **A4 paysage** : environ 744 points utiles
contre 497 en portrait. Les colonnes Waypoint, Description, Latitude, Longitude,
UKC, ETA, Contacts VHF, Prévisions météo et Trafic dense restent lisibles sans
réduire excessivement la police. Les neuf colonnes donnent plus de largeur à
la carte météo et à son indicateur. Les en-têtes du tableau sont répétés à chaque
page. Les sources et horaires des copies sont détaillés sous le tableau.
Les autres chapitres restent en portrait. Les fragments vectoriels d’en-tête et
de pied du formulaire Word sont réutilisés à leurs dimensions d’origine et
centrés sur les pages paysage, sans déformer le logo ou la typographie.
L’aperçu et l’impression reprennent ce chapitre en paysage ; la saisie conserve
ses lignes adaptatives sur ordinateur et mobile.

Les propriétés facultatives `waypoints[].weather` et `waypoints[].radio`
conservent les copies validées. La migration
`20261023042059_sea_operation_waypoint_captures.sql` ajoute un guard privé avant
écriture : types, tailles, coordonnées WGS84, ETA convertie depuis Europe/Paris,
horaires UTC et sources attendues. Les heures ambiguës/inexistantes de changement
d’heure sont rejetées. Les anciennes fiches sans ces propriétés restent valides.
Aucune donnée existante n’est réécrite ; RLS, sociétés, rôle temporaire,
sauvegarde avec révision et immutabilité après signature conservent leurs règles.

En production, `/api/sea-operation-weather` vérifie le JWT et l’accès au projet
par `sea_operation_project_documents` avant les caches. Les environnements
Supabase habituels restent nécessaires. Le cache final est borné à 128 entrées /
15 minutes, les appels à 30/minute/acteur et la concurrence à quatre par instance.
Le catalogue et au plus quatre fichiers / 64 Mo sont conservés cinq minutes.
Les téléchargements identiques sont mutualisés ; le décodeur unique travaille
séquentiellement et libère les handles et son fichier mémoire après chaque point.

La démonstration publique de météo serveur exige à la fois `VERCEL_ENV=preview`
et `?preview=1` sur l’API. Elle ne lit aucune donnée de société/projet ; son quota
de 30 appels/minute est commun à l’instance. Ce drapeau client n’ouvre aucun accès
anonyme en production. Le développement Vite local utilise encore le mode
d’évaluation publique Open-Meteo, distinctement attribué ; les déploiements de
préversion utilisent Météo-France comme les comptes réels.

Le serveur et la CI utilisent **Node 24**, déjà configuré sur Vercel, pour
`@meri-imperiumi/eccodes-wasm@2.48.2` (Apache-2.0, libaec BSD-2-Clause). Le paquet
inclut son binaire et n’a aucun script d’installation ; les scripts de dépendances
restent bloqués selon `pnpm-workspace.yaml`. `vercel.json` inclut explicitement les
fichiers du paquet dans cette seule fonction. Les imports serveur portent leur
extension `.js` pour l’exécution ESM après compilation Vercel.
Le motif `includeFiles` cible le dossier physique dans `.pnpm`, afin de ne pas
empaqueter les enfants d’un alias symbolique. Il doit suivre la version exacte
du paquet lors d’une mise à jour.

#### Autres accès et fournisseurs

L’[API ciblée Météo-France](https://portail-api.meteofrance.fr/web/fr/) est également
gratuite mais requiert un compte et une clé ; elle n’est pas nécessaire au
connecteur par fichiers publics livré ici. Aucun compte n’est créé.
Le fournisseur optionnel `SEA_OPERATION_WEATHER_PROVIDER=open-meteo` exige une
clé professionnelle `OPEN_METEO_API_KEY`, exclusivement serveur. Sans cette clé,
ce mode renvoie un message de configuration et ne bascule pas vers son API
gratuite. Par défaut ou avec `meteo-france`, aucune clé météo n’est requise.

L’[API Point Forecast Windy.com](https://api4.windy.com/point-forecast/pricing)
est disponible à 990 €/an au 22 octobre 2026. Sa formule Testing gratuite renvoie
des données mélangées et légèrement modifiées : elle est réservée aux essais et
ne doit pas alimenter une fiche opérationnelle. Aucun achat n’est effectué.

Recette de cette évolution : tests ciblés de la page, de l’aperçu, du modèle,
des requêtes, de Navires, de la préversion, de la météo, des coordonnées, des
contacts et de l’export réussis ; **165 contrôles SQL** réussis. Lint ciblé et
build de production réussis. Chrome vérifie le rendu desktop / 390 px, les
prévisions réelles en démonstration, la sauvegarde du tirant d’eau et l’export
PDF A4 avec les en-têtes / pieds du Word conservés.

### Bases profondeur et marée identifiées

Recherche vérifiée le 22 octobre 2026 :

| Source | Accès et données | Limite pour l’UKC |
| --- | --- | --- |
| [EMODnet Bathymetry 2024](https://erddap.emodnet.eu/erddap/info/bathymetry_dtm_2024/index.html) | ERDDAP/WCS public, grille 1/960°, environ 115 m N-S, élévation relative au LAT | La métadonnée interdit l’usage pour navigation/sécurité en mer ; grille indicative, pas sonde minimale certifiée |
| [MNT Shom façade Atlantique](https://diffusion.shom.fr/donnees/bathymerie/mnt-facade-atl-homonim.html) | Licence ouverte, environ 111 m, NM ou PBMA selon le produit | Produit de modélisation ; restrictions de navigation du descriptif à respecter |
| [Shom SUPMarée / SAPM](https://services.data.shom.fr/support/en/services/spm) | Abonnement, clé et identifiants ; ports ou points du modèle en mer, prédictions au zéro hydrographique | Autorisation de réutilisation et correspondance datum/localité à vérifier ; niveau réel affecté par la météo |
| [UKHO Tidal API](https://admiraltyapi.developer.azure-api.net/docs/technicalOverview) | Abonnement/clé ; hauteurs à des stations selon le niveau d’offre, dates GMT/CD | Pas d’extrapolation arbitraire d’une station à tous les points ; CD et LAT ne sont pas universellement interchangeables |
| [Copernicus NWS](https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/description) | Compte et données de modèle, environ 1,5 km | Niveau rapporté au géoïde ; aucune addition directe à une sonde LAT |

Les jeux S-102/S-104 publics Shom/UKHO identifiés sont des jeux de test, pas un
flux hydrographique opérationnel général. WorldTides propose des datums et une
API, mais ses conditions excluent les usages de navigation/sécurité ; ce service
n’est donc pas branché au calcul d’UKC.

L’UKC reste une saisie validée par le Capitaine. Pour automatiser son calcul, il
faut des sondes ENC/S-102 ou levés portuaires autorisés, l’incertitude verticale,
une marée au même datum et à l’ETA, le tirant d’eau réel, ainsi que squat,
mouvements et marges de l’armement. La proximité d’un point sur un MNT ouvert et
une hauteur de marée approximative ne suffisent pas. Le volet repliable Profondeur,
marée et calcul de l’UKC expose ces références dans la fiche sans fabriquer une
valeur d’UKC.

### Cartes SHOM retrouvées par coordonnées et ajout automatique — v3.77.5

Dans Passage Plan, `SeaOperationChartsPanel` recherche automatiquement les cartes
papier du catalogue SHOM aux coordonnées WGS84 de chaque waypoint. Les coordonnées
décimales et degrés/minutes/secondes utilisent le parseur commun ; aucune ETA
n’est nécessaire. Les cinq références les plus détaillées sont visibles en
premier, les autres restent accessibles dans un volet repliable. Chaque résultat
donne le numéro exact (y compris un zéro initial), le titre, l’échelle et un lien
de recherche vers le catalogue officiel. À la fin des recherches des points,
tous les numéros identifiés sont ajoutés automatiquement au champ des cartes,
sans clic et sans doublon, y compris ceux du volet repliable. Les références
saisies manuellement sont conservées ; les références sont séparées par
` - `, par exemple `7399 - 7398 - 7400`. Les anciens séparateurs `;` sont
harmonisés lors de cet ajout. La recherche ne retire aucune référence déjà
présente. Le champ existant conserve ses circuits habituels d’enregistrement,
d’aperçu et d’export PDF ; aucun champ ni format d’export supplémentaire n’est créé.

`/api/sea-operation-charts` vérifie le compte réel et
`sea_operation_project_documents` pour le projet sélectionné avant toute
consultation, y compris lorsque le provider dispose déjà d’un cache. Les droits
du module, de la société active et du projet suivent donc les contrôles existants
des cinq profils. L’ajout automatique exige le droit d’édition de la fiche ;
une fiche signée ou en lecture seule n’est jamais modifiée par la recherche.
La consultation et sa relance restent disponibles en lecture seule, hors du
fieldset désactivé.
Aucune migration, clé SHOM ou nouvelle dépendance n’est requise. La démonstration
anonyme exige `VERCEL_ENV=preview` côté serveur et `?preview=1` sur l’API.

Le provider serveur interroge le [WFS officiel](https://services.data.shom.fr/INSPIRE/wfs)
2.0, les quatre couches `GRILLES_CARTES_PAPIER:grille_cartespapier_30`,
`_30_300`, `_300_800`, `_800`, par filtre FES `Intersects(geometry, Point)` en
CRS84 (longitude puis latitude). Le point est aussi vérifié dans les polygones
GeoJSON, en respectant les trous et cadres disjoints. Un simple BBOX aurait ajouté
des faux positifs au test Brest. Les emprises restent celles déclarées dans le
catalogue : certaines cartes générales ou projections spéciales ont de très
grands rectangles ; cette recherche n’établit ni la pertinence nautique de toutes
les références ni la couverture continue de la route entre les points.

Les requêtes sont temporisées et annulées lors d’un changement de projet ou de
point ; les réponses périmées restent masquées. Deux points sont traités en
parallèle. Le serveur limite à 30 appels/minute/acteur et quatre requêtes actives
par instance. Le cache provider conserve 128 positions pendant une heure, avec
mutualisation des téléchargements et 16 recherches en cours au plus. Chaque couche
est bornée à 64 objets, 2 Mo et 12 secondes. Une couche en erreur, un résultat
tronqué ou un GeoJSON invalide provoque une erreur explicite, jamais une fausse
absence de cartes. Les URLs et couches sont fixes, aucun hôte n’est fourni par le
navigateur. Le corps entrant est lu en flux avec un plafond de 4 Ko.

Essai réel le 23 octobre 2026 à Brest (48,36 N ; 4,53 O) : les quatre couches
répondent HTTP 200 en 0,66 seconde, avec 19 références dédupliquées ; les premières
sont 7399, 7398, 7400, 7401 et 7148. Une deuxième consultation utilise le cache.
Les éditions et corrections des cartes doivent toujours être vérifiées dans le
catalogue ; le service ne télécharge ni image complète de carte ni sonde.

### État de la recherche UKC automatique

Le [service public ncWMS SHOM](https://services.data.shom.fr/ncwms2/wms?service=WMS&version=1.3.0&request=GetCapabilities)
expose les hauteurs TOLOSA `ssh`, marée et surcote réunies, au niveau moyen du
modèle, et leurs heures réellement disponibles. Le test Brest du 23 octobre à
00 UTC retourne 1,73138094 m ; les mailles masquées restent sans valeur. Les
variables de profondeur native ne sont pas publiées dans ce service.

Les archives du MNT façade HOMONIM sont accessibles, environ 464 Mo pour la
version PBMA testée, mais la couche WMS testée n’offre pas de profondeur numérique
par `GetFeatureInfo`. Une extraction géographique nécessite un prétraitement
hors ligne. Surtout, l’égalité de réalisation entre le NM de cette archive et
celui de TOLOSA n’est pas établie. La notice publique CRV mentionne encore HYCOM ;
son incertitude de conversion ne représente pas l’erreur totale de TOLOSA.

Le [descriptif SHOM du MNT, §5.1](https://services.data.shom.fr/static/specifications/Descriptif_Contenu_MNT_facade_2020.pdf)
exclut la navigation. Son ordre de grandeur d’incertitude, 1 % de la maille, ne
constitue ni écart-type, ni intervalle de couverture à 95 %, ni borne garantie.
La [présentation SHOM TOLOSA de juillet 2024](https://refmar.shom.fr/sites/default/files/2024-07/J3-14h15-14h45_Didier_JOURDAN.pdf)
présente des statistiques de validation multi-stations ; elles ne qualifient pas
l’incertitude d’une prévision ponctuelle à chaque ETA. Le tirant du module Navires
reste une référence, sans précision ni état de chargement attachés.

L’UKC automatique n’est donc pas activé par cette livraison. Pour une estimation
avec incertitude justifiable, il reste à disposer d’une profondeur numérique
appropriée, du raccordement vertical vérifié et d’un budget explicitant tirant
réel, marée, fond, position, squat et mouvements. Aucun zéro, marge arbitraire ou
intervalle de confiance inventé ne remplace ces données manquantes. Les cartes
retrouvées ne fournissent pas ces sondes par leur seule emprise.
