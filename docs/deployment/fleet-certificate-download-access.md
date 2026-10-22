# Téléchargement des certificats flotte

La version `3.76.4` autorise le téléchargement individuel et groupé des
certificats flotte aux profils Admin, Direction, Armement et Capitaine ayant une
adhésion active à leur société. Un compte uniquement Marin conserve les
métadonnées et le suivi, mais ne peut obtenir ni les fichiers courants ni les
versions historiques, y compris via un lien d’aperçu.

Appliquer `20261022075326_fleet_certificate_download_roles.sql` avant le client.
La migration protège les lectures Storage et les registres de correspondance
Drive et Blob. Les autres documents du bucket partagé (pièces d’écart et
registres) conservent leurs règles métier. Le contrôle côté serveur complète
les boutons et la sélection masqués pour Marin dans l’interface.

Le téléchargement groupé utilise au plus trois lectures simultanées. Pendant sa
préparation, les commandes de téléchargement sont désactivées et une indication
est affichée. Si un fichier ne peut être lu, le message nomme le certificat
concerné et aucune archive partielle n’est enregistrée.

La vérification utilise les rôles PostgreSQL authentifiés et les droits du
compte réel d’Adrien BOIS, sans vue simulée depuis un compte administrateur.
Les 28 certificats courants du GOURY possèdent des correspondances migrées ;
l’absence de leurs anciens objets Storage est normale.

Les tests couvrent les quatre profils autorisés, Marin, l’absence de rôle,
les sociétés différentes, les versions historiques et les chemins de lecture
des fichiers migrés. Les preuves opérationnelles et les jetons de vérification
restent hors Git.

Validation du 22 octobre 2026 : 214 tests ciblés passent, les trois suites SQL
d’accès (certificats, Drive et Blob) passent sur le schéma appliqué, et le build
de production réussit. Les résolutions Drive et Blob des 28 certificats du
GOURY sont autorisées sous l’identité d’Adrien ; un compte Marin réel est refusé.
