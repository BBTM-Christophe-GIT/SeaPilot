# Notes de frais — v3.43.0

## Parcours

Le module **Achats → Notes de frais** (`/modules/expenseNotes`) reprend NDF : dépenses, indemnités kilométriques, pièces JPG/PNG/WebP/PDF et dossier PDF réunissant les justificatifs puis le récapitulatif.

- Marin, Capitaine et Armement consultent les notes créées depuis leur compte. Le nom d'émetteur déclaré est modifiable sans modifier le compte créateur utilisé pour les droits d'accès.
- Admin et Direction consultent toutes les notes émises de leur société active, regroupées par navire puis par émetteur, avec filtres cumulables navire/personne et recherche.
- « Hors navire » couvre l'armement, le chantier et les autres dépenses à terre.
- L'émetteur est présélectionné à partir du personnel lié au compte ; à défaut, le nom du compte est proposé en saisie libre. Le navire vient de l'affectation actuelle lorsqu'elle est disponible. Les deux champs sont modifiables.
- Le bouton **Paramétrage**, réservé à Admin, permet d'ajouter, renommer et retirer les moyens de paiement et de sélectionner la carte proposée par défaut. Les listes de navires et de personnes proviennent des référentiels SeaPilot. Les libellés historiques sont conservés sur chaque note.
- La règle métier du projet NDF est conservée : 0,606 €/km, maximum 100 € par déplacement thermique/hybride, montant saisi pour l'électrique, plus péages. Il ne s'agit pas d'une présentation du barème fiscal légal. Le serveur recalcule le total.

## Données et droits

Migration : `20260917092601_expense_notes.sql`.

`expense_notes` conserve le créateur immuable (`created_by`, `creator_name`), l'émetteur choisi (`issuer_person_id`, `issuer_name`), le navire, les montants et les détails kilométriques. La RLS impose société active + adhésion active + compte créateur ; seuls Admin/Direction ont une lecture élargie aux notes émises de cette société. Le changement de libellé d'émetteur n'étend jamais les accès.

`expense_note_settings` est lisible dans la société et modifiable uniquement par Admin. Le RPC `expense_note_people` expose seulement les identifiants et noms actifs de la société pour le choix de l'émetteur, sans ouvrir les dossiers RH.

Le bucket privé `expense-note-pdfs` suit les mêmes règles de lecture. Un PDF peut être téléversé uniquement sur le chemin calculé par le serveur pour une note en préparation du compte connecté. Les documents émis ne peuvent être remplacés ni supprimés par les utilisateurs. Le client ne peut modifier ni le créateur, ni les montants enregistrés, ni l'état de livraison.

L'émission se fait en trois étapes : préparation en base, création/téléversement du PDF, puis passage à `issued` après contrôle de l'objet Storage. Le formulaire conserve son UUID pendant les reprises réseau pour éviter une double émission. Les préparations interrompues restent invisibles dans l'historique des notes émises ; elles peuvent être nettoyées ultérieurement après vérification. Aucune ancienne note n'est importée : le projet NDF d'origine ne contient pas de base d'historique.

## Envoi comptable

Déployer `supabase/functions/expense-note-send` avec validation JWT activée et son `deno.json`. La fonction vérifie le compte puis lit la note/PDF via les règles RLS du demandeur. La clé de service n'est utilisée qu'après cette vérification pour verrouiller et enregistrer le résultat de transmission.

Le relais existant, fourni par le propriétaire, est conservé : `https://bbtm-ndfv2.netlify.app/.netlify/functions/send`, projet Netlify `12a15b20-b760-4e12-b076-505b123cd351` (`bbtm-ndfv2`). Il conserve les identifiants Gmail et le destinataire Inexweb de NDF. Aucun secret Gmail n'est copié dans SeaPilot et aucun destinataire/URL arbitraire n'est accepté du navigateur. **Ce site Netlify doit rester actif pour l'envoi.**

Limites : 20 justificatifs, 15 Mo par fichier source, 50 Mo cumulés avant conversion, et **4 Mo pour le PDF final**, compatible avec la limite de transport JSON/base64 du relais NDF. Les photos sont orientées par le décodeur navigateur, réduites à 1 600 pixels et compressées.

États : `pending`, `sending`, `sent`, `failed`, `unknown`. Une erreur d'envoi ne supprime pas une note émise. Les refus certains avant envoi permettent une reprise ; un délai dépassé ou une erreur SMTP ambiguë impose une vérification de réception. Le verrou d'envoi empêche les transmissions concurrentes. Un résultat `unknown` ou un verrou resté `sending` doit être rapproché du journal Netlify et d'Inexweb avant correction administrative de son statut, afin de ne pas créer une double pièce comptable.

## Vérification

- Tests React avec fixtures distinctes Admin, Direction, Armement, Capitaine et Marin ; aucune vue simulée de la session de l'administrateur ne sert de preuve de droits.
- `supabase/tests/expense_notes_access_test.sql` : transaction annulée en fin de test ; vérifie les cinq rôles, une deuxième société, les PDF privés, l'émetteur modifiable, le créateur immuable, le paramétrage et les calculs serveur.
- `supabase/tests/expense_note_send.test.ts` : tests du service d'envoi avec relais simulé (authentification, RLS, doublons, succès, refus et résultats ambigus). Ils restent avec le serveur, exclu de l'artefact Vercel par `.vercelignore` ; ils sont exécutés par Vitest en local et en CI.
- Tests PDF réels pour l'ordre des pages, les fichiers invalides et les descriptions longues.
- Vérification visuelle sur ordinateur et mobile ; la préversion n'enregistre ni ne transmet de note.
- La réception d'un premier document réel dans Inexweb reste à constater en exploitation. Les tests automatisés n'envoient pas de faux justificatif à la comptabilité.

## Déploiement et retour arrière

Appliquer la migration, déployer l'Edge Function, puis livrer le frontend. Vérifier le code HTTP 401 de la fonction sans session, l'ouverture du module authentifié et les permissions de navigation. Le contrôle Supabase de sécurité ne signale pas d'anomalie sur les objets de ce module.

Un retour arrière frontend est compatible avec les tables ajoutées. Conserver les données et les PDF émis ; masquer le module par les permissions de navigation si nécessaire.
