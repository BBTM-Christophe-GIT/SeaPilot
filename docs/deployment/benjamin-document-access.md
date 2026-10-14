# Vérification des documents de Benjamin BON

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
