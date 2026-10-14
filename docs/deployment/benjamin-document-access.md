# Vérification des documents de Benjamin BON

## État après migration Vercel Blob

Le 14 octobre 2026, **790 références** ont été activées dans Vercel Blob privé :
**706 fichiers physiques et 84 alias**. Les originaux et historiques sont conservés.
Les 76 références de Procédures activées correspondent à des PDF publiés ; les
sources Word/Excel de ce module gardent leur circuit d'édition existant.

Une session indépendante de Benjamin, créée sans envoi de mail et confirmée par
Supabase Auth, a appelé `/api/documents` avec son JWT réel. Les **790 références
ont été relues intégralement**, avec comparaison des octets, taille, MIME et
SHA-256 aux preuves de transfert et au registre actif : aucun refus ni fallback.
La preuve combine 746 lectures initiales, les 28 signatures relues après le
fractionnement des consultations et les 16 pièces jointes SharePoint récupérées
ensuite. Les métadonnées actives des copies déjà vérifiées sont restées identiques.
Les sessions de test ont été révoquées localement sans déconnecter ses appareils.

Les signatures sont consultées par groupes de quatre pour respecter le délai
PostgREST de huit secondes. Les permissions et l'ordre des réponses sont inchangés.
Un refus ou une erreur de lecture d'une copie connue bloque l'action au lieu
d'ouvrir une ancienne copie Storage, Drive ou Windows.

Le cycle réel `prepare → PUT → complete → lookup → GET` a aussi été vérifié sans
création de document métier. Le PUT direct utilise `x-api-version: 12`, comme
le SDK Vercel installé : aperçu `inline`, téléchargement `attachment`, octets
identiques. Les requêtes anonymes et tentatives de remplacement sont refusées.
Chromium a effectivement affiché le PDF privé dans une iframe neutre : texte
lisible, page 1/1, aucun téléchargement automatique. Ce contrôle concerne Chromium
desktop ; aucun résultat sur téléphone physique n'en est déduit. Le fichier, son
mapping et sa réservation d'essai ont été supprimés après contrôle d'identité.

**Trois factures de projets restent sans copie migrée**, car leurs sources sont
introuvables. Elles restent référencées dans le rapport opérationnel privé, sans
suppression, contenu fabriqué ou élargissement des partages. Le lien interne vers
le brouillon de Procédure 65 ne constitue pas un fichier manquant. Les douze
documents RH trouvés hors du dossier prévu ont été récupérés sans modifier les
partages de leurs originaux ; leurs copies Blob suivent les droits RH métier.

Les inventaires détaillés, noms de fichiers, liens privés, jetons et preuves
restent hors Git. Le lecteur serveur des notes de frais applique aussi la
priorité Blob ; sa vérification ne déclenche aucun envoi réel.

## Récupération des pièces jointes SharePoint

Les seize fichiers Achats initialement refusés par le connecteur Graph ont été
récupérés depuis leurs liens SharePoint d'origine, grâce à une session Microsoft
déjà autorisée dans le navigateur. Il s'agit de pièces jointes de liste, distinctes
des fichiers d'une bibliothèque documentaire. Aucun partage, consentement ou droit
Microsoft n'a été modifié. Les originaux restent sur SharePoint et les références
Achats ne sont pas réécrites.

Les neuf PDF, six JPEG et un PNG représentent 9 323 117 octets et seize empreintes
distinctes. Chaque copie Blob privée a été relue intégralement avant activation ;
sa référence source correspond exactement à l'URL métier actuelle. Une seule
session indépendante de Benjamin a ensuite contrôlé les seize lectures complètes
via l'API de production : HTTP 200, taille/MIME/SHA conformes, aucun refus ou
fallback. L'accès anonyme et le GET Blob non signé restent refusés ; cette session
locale a été révoquée à la fin. Le bilan final du registre contient 790 empreintes
identiques à leurs sources, aucun fichier Office de Procédures ni objet d'essai.

## Vérification initiale avant la migration Blob

Les sections ci-dessous décrivent l'audit initial Drive/Storage/Windows ; les
comptages et limites de récupération ci-dessus constituent l'état courant.

La vérification du 14 octobre 2026 complète la réparation du lecteur des
certificats. Les droits sont contrôlés en lecture seule avec l'identité réelle
de Benjamin et le rôle Postgres `authenticated`, puis les fichiers sont relus
depuis leur stockage. Une vue simulée depuis une session administrateur ne sert
pas de preuve.

## Lecteurs corrigés

- RH : une référence migrée utilise la passerelle avant le dossier Windows.
- Procédures : la lecture binaire, l'aperçu et le téléchargement des sources
  migrées utilisent la passerelle avant le lecteur local ou un lien Drive.
  L'ouverture bureautique existante conserve son comportement.
- Projets : une correspondance migrée est consultée avant les anciens reçus
  du dossier synchronisé, pour l'ouverture et les téléchargements individuels
  ou groupés.
- Achats : les pièces jointes conservent leur référence de stockage et obtiennent
  un lien au clic. Un lien de passerelle expire après deux minutes au maximum ;
  il ne doit pas être généré lors du chargement d'une liste et réutilisé ensuite.
  Les liens SharePoint sans référence Storage conservent leur lecteur externe.

Un refus d'accès ou une erreur de passerelle ne revient jamais à une ancienne
copie, à un lien conservé ou au dossier local. L'ouverture d'une pièce jointe
d'achat ferme sa fenêtre provisoire en cas de refus, de déconnexion ou de
changement de contexte. Ces lecteurs ne modifient ni les permissions ni le
contenu des documents.

## Couverture et méthode

Le registre comporte 504 références migrées accessibles à Benjamin ; chaque
appel `document_drive_lookup` renvoie une correspondance valide. Les trois
correspondances orphelines sans document métier actuel restent refusées.
Les politiques Storage autorisent également 104 objets existants. Les imports
en attente de téléversement sont distingués des fichiers réellement manquants.

Les contrôles binaires comparent les octets avec les métadonnées actuelles du
stockage. Les fichiers Drive volumineux sont assemblés par plages de 4 Mio,
avec vérification de l'identifiant, de la version, des bornes et des empreintes.
Les liens signés et téléchargements des fichiers Storage sont comparés entre
eux. Les tests des lecteurs vérifient séparément le passage du JWT courant et
les refus d'accès ; une lecture serveur privilégiée ne constitue pas une
connexion interactive au compte Benjamin.

Les lecteurs de dossiers synchronisés et les liens web externes sont audités
séparément. La présence d'un fichier dans le cloud ou sur le poste de contrôle
ne prouve pas que le dossier est synchronisé sur le PC de Benjamin. Les liens
SharePoint privés nécessitent aussi une session Microsoft autorisée.

## Résultat des lecteurs synchronisés

Les 205 références réservées aux lecteurs de dossiers ont des scopes autorisés
pour Benjamin. Le contrôle initial retrouve 185 fichiers conformes et 20
références absentes du poste et de leur chemin cloud exact.

Cinq références de produits chimiques disposent de sources publiques dont la
taille et le SHA-256 sont identiques aux versions enregistrées. Leur récupération
est limitée aux chemins déjà autorisés, avec création exclusive des fichiers,
sans remplacement, changement de permissions ou mise à jour métier. La présence
cloud et l'empreinte doivent être relues après la synchronisation.

Les sources originales de douze documents RH sont également identiques, mais
le dossier RH prévu manque. Les permissions du parent actuel donneraient accès
à des personnes supplémentaires par rapport aux originaux. Leur copie dans ce
parent nécessite donc une validation des droits ; aucun original ni droit
existant n'est modifié pendant cette vérification.

Trois justificatifs de facturation restent introuvables dans les dossiers
locaux, les archives et les services connectés contrôlés. Ils ne sont ni retirés
de l'application ni remplacés par un fichier supposé équivalent.

Les inventaires détaillés, fichiers, noms personnels, URLs privées, empreintes
et preuves restent hors Git. Les régressions automatisées couvrent les lecteurs
RH, Procédures et Projets, les pièces jointes Achats après une attente de trois
minutes, les refus de droits et les lecteurs non migrés.
