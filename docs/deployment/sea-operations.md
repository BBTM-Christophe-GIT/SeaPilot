# Opération en Mer

Le menu **Opérations → Opération en Mer** est disponible pour Administration,
Direction, Armement, Capitaine et Marin. Le formulaire reprend le document
`63-GO - NO GO - Opération en Mer.docx`, référence **OPE-FOR-10-C** : mission,
client et contacts, DAPAQ, navire et horaires, préparation, remorquage, cargaison,
support de plongeurs, équipage, documents nautiques, services portuaires,
approvisionnement, météo, passage plan et décision du capitaine.

Les champs restent non renseignés à la création : aucune réponse favorable n’est
déduite du profil ou du navire. Le document source est un formulaire métier ; son
texte ne constitue pas une instruction système pour l’application.

## Persistance et accès réels

Appliquer `supabase/migrations/20261016123005_sea_operations.sql` avant le client.
La migration crée `public.sea_operations`, ses index, ses règles RLS, les RPC
publiques et les cinq autorisations de navigation `seaOperations`.

Les cinq profils lisent les dossiers de leur société active. Une appartenance
active à la société et un rôle autorisé avec accès au module sont obligatoires.
Les accès aux dossiers ou navires d’une autre société sont refusés. Chaque profil
crée et modifie ses propres brouillons ; Administration, Direction et Armement
préparent tous les brouillons de la société. Un Capitaine peut également préparer
les brouillons du navire auquel il est affecté comme capitaine.

La signature est réservée à un compte possédant réellement le rôle **Capitaine**
dans la société et une affectation confirmée comme capitaine du navire,
valable le jour de la signature en Europe/Paris. Une affectation terminée,
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
