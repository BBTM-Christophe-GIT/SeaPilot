# Projets — commandes du dossier (3.60.5)

Les actions **Archiver** et **Sources SharePoint historiques** sont retirées de la barre du dossier projet, à la demande de l’utilisateur. Le gestionnaire d’archivage de cette page est également retiré. Aucun projet, statut d’archivage, historique ou document n’est supprimé ni modifié ; les projets déjà archivés restent consultables dans Tous les projets et Mes favoris. Les références historiques attachées aux documents restent conservées.

Les autres commandes du dossier, ses onglets et le classement Google Drive restent disponibles. Aucune migration de base de données n’est requise.

Le lanceur Windows reste en API **2.5.0**, compatible avec le classement par numéro et nom de projet. La notice du paquet et la documentation de déploiement sont actualisées ; l’archive distribuée est reconstruite avec les mêmes sources du lanceur. Vérification : tests Windows de compilation, installation, lecture/écriture et contrôle de l’archive ; tests existants du module Projets, lint, compilation de production et contrôle visuel des commandes.
