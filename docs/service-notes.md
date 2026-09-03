# Notes de Service QHSE

## Périmètre fonctionnel

Le module `Notes de Service` est placé dans la famille QHSE. Les profils `Administrateur` et `Direction` peuvent créer, modifier, diffuser, rappeler et supprimer un brouillon. Les autres profils ne voient que les notes diffusées ou archivées dont ils sont destinataires; ils disposent uniquement de la lecture, du téléchargement PDF et de leur propre signature.

La création enregistre immédiatement un brouillon privé dans `qhse_service_notes`, sans lui réserver de numéro. Le bouton `Enregistrer le brouillon` permet de revenir à la bibliothèque sans diffuser. L'émetteur choisit tous les utilisateurs, un ou plusieurs navires, ou une liste nominative. Pour un ciblage par navire, les destinataires sont résolus depuis les affectations du Planning à la date de la note (`planning_assignments`, `planning_periods` et `planning_days`). Dans tous les cas, seules les fiches RH liées à un compte, embauchées au plus tard ce jour-là et non parties à cette date sont retenues; l'émetteur est exclu.

La diffusion, depuis l'éditeur ou directement depuis la fiche d'un brouillon, appelle `publish_service_note` : sous verrou transactionnel, elle attribue le prochain chrono annuel `NS NN-AA`, fige la signature de l'émetteur et crée le registre de destinataires calculé. La cloche affiche uniquement les notes diffusées que le compte courant doit encore signer. La bibliothèque regroupe les notes par année du chrono puis par navire et les trie du numéro le plus récent au plus ancien. Une note nominative sans navire reste directement sous son année et une note multi-navires apparaît sous chacun de ses navires. Le filtre `Navire` restreint la bibliothèque au bâtiment ou lieu choisi; chaque ligne et le panneau de détail signalent les non-signataires par leur nom.

La signature appelle `sign_service_note`. Cette opération ajoute une ligne immuable dans `qhse_service_note_signatures` avec l'identité du destinataire, la version active de sa signature de profil et l'heure du serveur. Le registre est commun à tous les destinataires : aucune copie individuelle du document n'est créée.

Les profils `Administrateur` et `Direction` peuvent rappeler uniquement la note actuellement diffusée la plus récente. `recall_service_note` retire son numéro chrono actif, la place au statut `Rappelée` et la rend immédiatement invisible aux autres profils, y compris dans la cloche. Le dernier numéro est conservé séparément pour l'audit de gestion. Une note rappelée peut être diffusée de nouveau : un nouveau numéro chrono est alors attribué et le registre des destinataires/signatures repart à zéro.

Un brouillon privé peut être supprimé après confirmation. Les fichiers stockés sont retirés du bucket avant l'appel protégé à `delete_service_note_draft`; les autres enregistrements associés disparaissent par cascade.

## Pièces jointes et références

Les fichiers sont déposés dans le bucket privé `service-note-files` avec une limite de 50 Mo. Les politiques RLS autorisent le dépôt uniquement sur un brouillon géré par un profil `Administrateur` ou `Direction`. Les lecteurs d'une note diffusée peuvent télécharger ses pièces jointes.

Une note peut aussi référencer une procédure QHSE publiée, un élément du plan d'action ou un certificat flotte. Le sélecteur classe les procédures par chapitre ISM, le plan d'action par navire/lieu puis type d'écart, et les certificats selon la hiérarchie navire, catégorie et sous-catégorie. Chaque résultat propose séparément l'ouverture de l'élément et son ajout à la note. Le PDF et l'aperçu inventorient toujours le nom sans extension.

Le document et son PDF utilisent le logo dédié `public/bbtm-service-note-logo.png`, issu du fichier vectorisé fourni. Le cartouche d'instruction « Lecture et signature obligatoires » et la mention générique « Document généré par SeaPilot » ne figurent plus dans le document. Le PDF à deux pages (note puis registre commun) est téléchargeable par tout destinataire autorisé, y compris pour une archive SharePoint; le lien Word reste un accès source complémentaire lorsqu'il existe.

## Archives SharePoint

La source Power Query `Notes de Service.iqy` pointe vers la liste `cca511f3-7021-4167-a738-cfd05f9f4012`, vue `EB2E36B5-E003-4708-8EC0-777F4261142A`, de la bibliothèque SharePoint `Notes de Service`.

L'inventaire initial contenait 16 fichiers. Les documents historiques sont classés au statut `Archivée` et conservent leur lien d'ouverture Microsoft Word bureau. `NS 07-26-KROKDUR` reste un brouillon sans numéro actif et ne déclenche aucune notification tant qu'elle n'est pas diffusée. La fiche exacte `NS 03-26 - Transmission et formation interne` a été supprimée; l'autre note `NS 03-26 - Entrée dans les 500 m` est conservée.

Chaque archive contient un destinataire et une validation historique pour toute personne disposant d'un compte et employée à la date de la note, hors émetteur lorsqu'il est connu. Aucune date de signature n'est créée. Si une image de signature existe dans le profil, sa dernière version est reprise; sinon l'identité reste marquée comme validation historique sans image artificielle.

## Sécurité et limites

- Les tables `qhse_service_notes`, `qhse_service_note_attachments`, `qhse_service_note_recipients`, `qhse_service_note_signatures` et les deux tables de ciblage ont RLS activé.
- Les fonctions de diffusion, rappel, suppression de brouillon et signature sont `SECURITY DEFINER`, sans accès `anon`, avec `search_path` vide et contrôles de société/rôle explicites.
- Les nouvelles tables reçoivent explicitement les droits Data API pour le rôle `authenticated`.
- Un compte sans fiche `people` liée n'entre pas dans un nouveau périmètre de diffusion. Un destinataire sans signature de profil active peut lire la note mais ne peut pas la signer; l'interface l'oriente vers son profil RH.
- Le PDF est généré à partir du même enregistrement de note et du registre partagé au moment du téléchargement.
