# Lanceur Windows commun — API 2.6.0

## Configuration automatique (2.6)

À l’ouverture de Administration → Documents et Google Drive, le lanceur vérifie réellement l’existence du dossier déjà configuré. S’il est absent, il recherche `G:\Mon Drive\SeaPilot`. Un dossier détecté est préparé et enregistré avant d’afficher **Google Drive est bien configuré**. Un chemin personnalisé encore valide est conservé en priorité.

Si aucun dossier valide n’est trouvé, **Sélectionner le dossier dans Windows** ouvre le sélecteur natif de dossiers. La sélection est validée, les dossiers habituels sont préparés, puis le PC est revérifié automatiquement. Les champs de saisie, Enregistrer la racine et Vérifier ce PC sont retirés. Une annulation, une erreur ou un ancien chemin absent ne produit aucun faux message de succès. Les erreurs proposent Relancer le lanceur, notamment lorsque le navigateur nécessite une nouvelle action utilisateur pour autoriser le protocole local.

L’API 2.6 est nécessaire pour cette détection fiable et le sélecteur natif. Installer la nouvelle archive sur les PC encore en 2.5 ou antérieur ; le chemin existant est conservé. La préversion ne contacte jamais le lanceur réel. L’authentification et le rôle Administration sont contrôlés avant toute inspection du PC ou ouverture du sélecteur. Les autres modules restent compatibles avec les anciennes versions du lanceur selon leurs fonctions existantes.

Validation : détection par défaut, priorité d’un chemin personnalisé, dossier absent, annulation, nom invalide, échec de préparation et refus d’accès testés avec des dossiers temporaires ; parcours frontend automatique et nouvelle connexion après mise à jour couverts par Vitest. Les tests Windows de transferts et d’installation restent inchangés et exécutés avec la version 2.6.

## Fonctions des modules

Depuis la version 2.5, le lanceur prend en charge les documents Projets sous **SeaPilot / Projet / P144 – GUARD VESSEL EMDT**, puis Contrat, HSE, Facturation, Operations ou Offres. Le serveur fournit le dossier autorisé pour chaque projet ; le lanceur contrôle le chemin, la taille et l’empreinte SHA-256 lors de l’écriture et de la lecture. Ce module accepte jusqu’à 50 Mio, sans modifier les limites des autres modules. Les références des fichiers et les liens historiques restent conservés.

La version 2.5 reste compatible avec les dossiers renommés par numéro et nom du projet ; la 2.6 ajoute la configuration automatique décrite ci-dessus.

La version 2.2 ajoute l'écriture et la lecture des FDS dans **Produits Chimiques**.
Installer l'archive actualisée sur chaque PC ; la racine existante est conservée.
La RPC `chemical_drive_scope` contrôle le produit et, pour une lecture, la pièce exacte.
Le lanceur vérifie chemin, taille et SHA-256 avant de renvoyer un fichier au navigateur.
La lecture est limitée à ce module et aux documents enregistrés, avec les mêmes contrôles
de session, d'origine et de chemins que l'écriture. Aucun parcours générique de Drive.
PDF, PNG, JPEG, DOCX, XLSX et TXT jusqu'à 20 Mo. Détails : [Produits Chimiques](./chemical-inventory.md).


## Configuration

Un seul exécutable, protocole `seapilot-drive` et réglage `HKCU\Software\SeaPilot\Drive\SeaPilotRoot` pour tous les modules. L’interface de configuration est dans Administration → Documents et Google Drive ; elle est désactivée dans la préversion. Le réglage est propre à l’utilisateur Windows et au PC, sans chemin personnel enregistré dans Supabase.

Installer l’archive mise à jour une fois. Elle contient `Installer.cmd`, `Install-SeaPilotDrive.ps1`, `Install-SeaPilotDriveBinary.ps1`, `SeaPilotDrive.cs`, `SeaPilotDriveBridge.cs` et `LISEZ-MOI.txt`. Le compilateur .NET Framework 4 présent sur Windows produit le lanceur dans `%LOCALAPPDATA%\SeaPilotDrive`, sans installation de service. L’installation préserve les anciens réglages ; `SeaPilotRoot` devient prioritaire. L’option `-SeaPilotRoot` permet un déploiement administré sans dialogue.

Depuis v3.42.1, chaque installation compile un `SeaPilotDrive-<identifiant>.exe` distinct avant de modifier l’enregistrement du protocole commun. Cela corrige CS0016 lorsqu’un ancien exécutable est encore utilisé. Aucun processus n’est arrêté : les transferts ouverts se terminent normalement. Une compilation échouée conserve la version précédemment enregistrée ; les anciens binaires restent disponibles dans le dossier d’installation.

L’API 2.1.0 corrige l’échec de connexion après configuration lorsque Windows refuse le port choisi (socket 10013 : accès interdit, ou 10048 : port occupé). Le lanceur essaie jusqu’à 16 ports répartis dans la plage dynamique, au lieu de quitter dès le premier refus. Le navigateur découvre le port effectivement ouvert avec le même nonce, sans transmettre de jeton pendant cette recherche. L’ancien lanceur 2.0.0 reste compatible si son premier port est disponible ; installer l’archive 2.1.0 est nécessaire pour bénéficier du contournement. Aucun réglage de pare-feu ni réservation Windows n’est modifié.

Après cette mise à jour, recharger SeaPilot puis ouvrir **Documents et Google Drive** : la vérification se lance automatiquement. Le chemin enregistré est conservé. Une connexion encore refusée doit être vérifiée dans les autorisations du navigateur pour l’ouverture du protocole et la connexion locale.

Reconstruire l’archive après toute modification des fichiers distribués :

```powershell
Compress-Archive -LiteralPath scripts/drive/SeaPilotDrive.cs,scripts/drive/SeaPilotDriveBridge.cs,scripts/drive/Install-SeaPilotDrive.ps1,scripts/drive/Install-SeaPilotDriveBinary.ps1,scripts/drive/Installer.cmd,scripts/drive/LISEZ-MOI.txt -DestinationPath public/connectors/seapilot-drive-windows.zip -Force
```

La configuration authentifiée prépare les dossiers des collaborateurs en poste de l’entreprise active (dates RH à Paris). Elle exige le rôle Administration ; la création et l’écriture disciplinaires exigent les droits Administration/Direction de la même entreprise. Le dossier confidentiel parent doit exister : il n’est pas créé automatiquement avec un partage hérité potentiellement trop large. Le réglage précédent n’est remplacé qu’après réussite de la préparation ; un échec intermédiaire peut laisser des dossiers vides, réutilisés à la prochaine tentative.

## Ouverture et modules futurs

`seapilot-drive://root/open/<base64url UTF-8>` contient le chemin complet relatif à **SeaPilot**, par exemple `Procedures/URG/Procedure.docx` ou `Sanctions Disciplinaires/Prénom NOM - c1-p42/2026-09-15/fichier.docx`. Aucun chemin absolu ni commande shell n’est accepté. Les anciennes URI `open` et `disciplinary/open` restent reconnues.

Pour ajouter un module, déclarer son sous-dossier dans `DRIVE_MODULES` et utiliser `launcherOpenUri`. Le lanceur déjà installé accepte ce nouveau dossier sans mise à jour. Pour autoriser également l’écriture automatique, étendre la RPC `desktop_drive_scope` avec les droits métier et un dossier autorisé (`directory` et `folder`, ou l’identité RH). Un module inconnu est refusé par défaut. Ne pas ajouter un accès générique à tous les dossiers. Le composant natif n’a pas à changer pour les formats déjà autorisés.

## Écriture locale et contrôles

Une action utilisateur lance `connect/<port>/<nonce>` : écoute **127.0.0.1** uniquement, port initial aléatoire 49152–65535, nonce aléatoire, expiration après 3 minutes, maximum 128 requêtes. Les candidats de repli suivent `49152 + (portInitial - 49152 + essai × 1019) % 16384`, pour `essai = 0…15`, afin d’éviter les réservations Windows contiguës. Une seule écoute est ouverte ; la recherche navigateur est limitée à ces candidats et annulée dès la réponse valide. L’application réutilise brièvement la connexion en mémoire. Aucun jeton ni fichier n’est conservé dans un cache du lanceur.

- Origines exactes : production `https://sea-pilot-ten.vercel.app`, préversion de la branche de livraison, localhost 5178/5173. `Host`, nonce, méthode, taille et contenu sont vérifiés ; aucune lecture arbitraire de fichier n’est exposée.
- Les requêtes d’écriture transmettent la session Supabase et la clé publique au lanceur. Il contrôle les droits auprès du projet BBTM **fixé dans le code**, sans redirection ni URL distante fournie par la requête. La clé publique seule n’autorise aucune écriture.
- Migration `20260915115648_desktop_drive_scope.sql` : RPC en invoker, accès authentifié, droits disciplinaires et entreprise contrôlés, identité RH fournie par le serveur. La politique de rôle reste identique à celle des dossiers et pièces.
- Chemins Windows normalisés, noms réservés et traversées refusés ; destination réelle vérifiée avant chaque création pour bloquer les jonctions sortantes. `CreateNew` refuse tout écrasement. Maximum 25 Mo ; formats Office sans macros, PDF, images, texte et OpenDocument.
- Accusé de réception avec chemin et nombre d’octets vérifié avant enregistrement des métadonnées. Une erreur réseau après écriture est signalée comme incertaine et offre le chemin de récupération ; aucun nouvel essai automatique pouvant dupliquer un fichier.

Le navigateur peut demander une autorisation de connexion locale et d’ouverture du protocole. Ce sont les protections normales du navigateur ; aucun drapeau de sécurité n’est désactivé ([documentation Chrome](https://developer.chrome.com/blog/local-network-access?hl=fr)).

Les partages Google Drive et les droits locaux Windows restent indépendants de SeaPilot. Les liens d’ouverture Office sont soumis aux autorisations du compte Windows/Drive ; retirer également ces droits lors d’un retrait d’accès SeaPilot.

## Vérification

- Vitest : configuration unique, préversion isolée, URI des deux modules, authentification, refus d’écriture, accusé de réception, absence de configuration dans les dossiers individuels.
- `powershell -NoProfile -File scripts/drive/Test-SeaPilotDrive.ps1` : compilation réelle, URI existantes et futur module, dossier stable après changement de nom, écriture/non-écrasement, chemins malveillants/jonctions, connexion HTTP locale réelle et rejet d’origine/session/auth absentes.
- Mise à jour testée avec ancien exécutable verrouillé, session native active, deux installations successives et compilation volontairement invalide ; contrôle de correspondance entre l’archive distribuée et les sources.
- Repli testé sur un port réellement réservé par Windows et sur un port occupé ; erreur lisible lorsque les 16 candidats sont indisponibles. Découverte navigateur, nonce incorrect, compatibilité 2.0.0, appels simultanés et réutilisation de session couverts par Vitest.
- Sur le PC concerné, le navigateur Edge utilise le module frontend réel et le lanceur 2.1.0 installé : port réservé 49694 imposé, connexion retrouvée sur 50713 via HTTP/CORS, nonce vérifié, session réutilisée. La racine enregistrée est préservée pendant l’installation. Les PDF de test sont écrits uniquement dans un dossier temporaire.
- `supabase/tests/disciplinary_access_test.sql` : Administration et Direction autorisées ; Armement, Capitaine, Marin, anonyme, autre entreprise, module inconnu ou désactivé refusés. Transaction annulée, sans données de test persistantes.
- Contrôle de l’interface Administration et Dossier et pièces en préversion, bureau et mobile ; lint et build de production.

Limite de validation : les tests HTTP natifs et SQL vérifient séparément le transport et les droits. Aucun courrier disciplinaire réel n’est créé pour tester la chaîne navigateur authentifié → Drive.
