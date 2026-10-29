# Ports du projet depuis une opération en mer

La fiche utilise le même `ProjectPortCombobox` que Projet. Les changements restent
locaux pendant la saisie et l’annulation ne modifie aucune donnée du projet.
Dans la fiche, la liste s’ouvre du côté offrant le plus de place et sa hauteur
est limitée à la partie visible du volet, pour garder les options accessibles
au-dessus de la barre d’actions. Le placement par défaut dans Projet est conservé.
L’enregistrement d’un brouillon peut synchroniser uniquement le port de livraison
(`projects.delivery_port`) et le port de restitution (`projects.redelivery_port`).
Les autres champs commerciaux, les opérations du planning et les instantanés
SharePoint ne sont pas réécrits.

## Contrat serveur

Appliquer `20261029083027_sea_operation_project_ports.sql` avant le client qui
appelle `sea_operation_save_with_project_ports(p_id, p_version, p_draft,
p_project_ports)`. La RPC publique reste `SECURITY INVOKER` ; son exécuteur privé
vérifie le compte authentifié, la société et les droits opérationnels existants.
Aucun droit générique d’écriture Projet n’est ajouté. Les profils réels Marin et
Capitaine utilisent les mêmes contrôles d’édition et d’affectation que la fiche.

`p_project_ports` est un objet `{ projectId, departurePort, arrivalPort }` dont les
trois valeurs sont des chaînes. C’est le relevé des ports du projet lors de sa
sélection ou de l’ouverture de la fiche, transmis séparément de `p_draft`.
Les réponses détail, registre et enregistrement exposent le relevé courant dans
`project_ports` pour les brouillons liés à un projet actif. Cette propriété vaut
`null` pour Transit, les fiches signées, retirées ou les projets archivés.
Le lien de ce relevé est lu dans la ligne enregistrée, jamais dans un composite
fourni par l’appelant. Il ne fait pas partie du formulaire signé ni du PDF.

L’exécuteur verrouille d’abord le brouillon, vérifie sa version et appelle le
writer existant avec tous ses contrôles de préparation, capitaine, signature et
captures. Il verrouille ensuite le seul projet lié, dans la même transaction.
Pour un brouillon déjà lié au même projet, seuls les ports différents de son
ancienne valeur enregistrée sont synchronisés. À la création ou au changement
de projet, la comparaison utilise le relevé du projet sélectionné. Un champ non
modifié ne remplace jamais une modification simultanée du projet.

Chaque port modifié est comparé au relevé : un conflit retourne `40001` et annule
l’écriture du brouillon et du projet. Une valeur déjà identique est acceptée.
Les triggers Projet existants conservent auteur, date et historique avant/après.
L’ancienne RPC `sea_operation_save` reste disponible sans synchronisation pour
les anciens clients. Un relevé `null` dans la nouvelle RPC suit aussi ce chemin.
Les fiches signées restent immuables ; une révision administrative reste requise.

Le client conserve le relevé dans la récupération locale du brouillon, séparément
du formulaire, et le rattache au compte et au projet sélectionnés. Après un
enregistrement, le relevé et les ports du catalogue Planning déjà chargé sont
actualisés. Un échec conserve les saisies pour permettre une correction.

## Vérifications

`supabase/tests/sea_operation_project_ports_test.sql` couvre les cinq profils
opérationnels, l’isolation inter-sociétés et les comptes inactifs, la validation
du relevé, les conflits par port et par version, l’annulation atomique d’une
création, les changements de projet, Transit, le chemin historique, les
coordonnées commerciales conservées, l’audit et les relevés après écriture.
Exécuter aussi les suites préparation Transit, planning, cycle administratif et
localisation Projet après la migration. Les fixtures sont annulées par `ROLLBACK`.

Pour la version 3.80.17, les huit suites SQL concernées ont validé 492 assertions
locales. La migration a également été vérifiée sur la base déployée par une sonde
de 59 assertions avec `ROLLBACK` intégral : aucun projet ni compte de test ne
subsiste. Les avis de sécurité avant et après migration sont inchangés.
