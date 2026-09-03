# Notes de Service QHSE

## Périmètre fonctionnel

Le module `Notes de Service` est placé dans la famille QHSE. Les profils `Administrateur` et `Direction` peuvent créer et modifier un brouillon. Les autres profils ne voient que les notes diffusées.

La création enregistre immédiatement un brouillon privé dans `qhse_service_notes`, sans lui réserver de numéro. Le bouton `Enregistrer le brouillon` permet de revenir à la bibliothèque sans diffuser. La diffusion appelle `publish_service_note` : sous verrou transactionnel, elle attribue le prochain chrono annuel `NS NN-AA`, fige la signature de l'émetteur et crée un destinataire pour chaque compte actif de la société. La cloche affiche les notes diffusées que le compte courant n'a pas encore signées.

La signature appelle `sign_service_note`. Cette opération ajoute une ligne immuable dans `qhse_service_note_signatures` avec l'identité du destinataire, la version active de sa signature de profil et l'heure du serveur. Le registre est commun à tous les destinataires : aucune copie individuelle du document n'est créée.

Les profils `Administrateur` et `Direction` peuvent rappeler uniquement la note actuellement diffusée la plus récente. `recall_service_note` retire son numéro chrono actif, la place au statut `Rappelée` et la rend immédiatement invisible aux autres profils, y compris dans la cloche. Le dernier numéro est conservé séparément pour l'audit de gestion. Une note rappelée peut être diffusée de nouveau : un nouveau numéro chrono est alors attribué et le registre des destinataires/signatures repart à zéro.

Un brouillon privé peut être supprimé après confirmation. Les fichiers stockés sont retirés du bucket avant l'appel protégé à `delete_service_note_draft`; les autres enregistrements associés disparaissent par cascade.

## Pièces jointes et références

Les fichiers sont déposés dans le bucket privé `service-note-files` avec une limite de 50 Mo. Les politiques RLS autorisent le dépôt uniquement sur un brouillon géré par un profil `Administrateur` ou `Direction`. Les lecteurs d'une note diffusée peuvent télécharger ses pièces jointes.

Une note peut aussi référencer une procédure QHSE publiée, un élément du plan d'action ou un certificat flotte. Le sélecteur classe les procédures par chapitre ISM, le plan d'action par navire/lieu puis type d'écart, et les certificats selon la hiérarchie navire, catégorie et sous-catégorie. Chaque résultat propose séparément l'ouverture de l'élément et son ajout à la note. Le PDF et l'aperçu inventorient toujours le nom sans extension.

## Archives SharePoint

La source Power Query `Notes de Service.iqy` pointe vers la liste `cca511f3-7021-4167-a738-cfd05f9f4012`, vue `EB2E36B5-E003-4708-8EC0-777F4261142A`, de la bibliothèque SharePoint `Notes de Service`.

L'inventaire vérifié contient 16 fichiers. La migration importe leurs métadonnées comme archives publiées et conserve un lien d'ouverture Microsoft Word bureau. `NS 07-26-KROKDUR` est ensuite replacée en brouillon à la demande de l'administrateur et ne déclenche aucune notification tant qu'elle n'est pas rediffusée. Deux documents distincts portent le code `NS 03-26`; ils sont volontairement conservés sans contrainte d'unicité sur le numéro chrono. Le manifeste vérifié est intégré à la migration afin que le chargement reste reproductible.

## Sécurité et limites

- Les tables `qhse_service_notes`, `qhse_service_note_attachments`, `qhse_service_note_recipients` et `qhse_service_note_signatures` ont RLS activé.
- Les fonctions de diffusion, rappel, suppression de brouillon et signature sont `SECURITY DEFINER`, sans accès `anon`, avec `search_path` vide et contrôles de société/rôle explicites.
- Les nouvelles tables reçoivent explicitement les droits Data API pour le rôle `authenticated`.
- Un compte sans fiche `people` liée ou sans signature de profil active peut lire la note, mais ne peut pas signer; l'interface l'oriente vers son profil RH.
- Le PDF est généré à partir du même enregistrement de note et du registre partagé au moment du téléchargement.
