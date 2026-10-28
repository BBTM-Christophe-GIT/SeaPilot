# Cartes des fiches et du registre

Version 3.80.8 — 28 octobre 2026.

La fiche Projet propose un onglet **Carte**, quel que soit le type de contrat.
Il affiche la localisation enregistrée (route, points isolés et zones), même
lorsque l’annexe PDF n’est pas activée. La consultation conserve les données,
les options PDF et le cadrage enregistré. Chaque nouveau dossier repart sur un
cadrage automatique incluant les ports de départ et d’arrivée connus.

Dans Opération en Mer, le registre et la carte sont disposés côte à côte sur
ordinateur, puis l’un sous l’autre sur petit écran. Le clic sur une opération
recharge son détail autorisé et affiche ses géométries avec un cadrage automatique.
La commande **Ouvrir la fiche** conserve l’accès au formulaire complet. Les
réponses d’une sélection ou d’un compte précédent sont ignorées.

Les brouillons dont le serveur retourne `canEdit` proposent **Modifier les points**.
Les waypoints, points isolés et sommets peuvent être déplacés ou supprimés ; des
waypoints peuvent être ajoutés depuis la carte ou les ports. **Enregistrer les
points** persiste le brouillon par le RPC existant `sea_operation_save`, avec son
identifiant et sa version attendue. **Annuler** restaure les données enregistrées.
Un changement de sélection ou de page avertit si des points restent non enregistrés.
Après un conflit, cliquer de nouveau sur la même opération permet de recharger sa
version courante en confirmant l’abandon des modifications locales.

Un déplacement invalide les captures liées aux anciennes coordonnées. Les ETA
automatiques sont recalculées selon la vitesse du navire ; les ETA manuelles sont
conservées. L’enregistrement réutilise la préparation des captures météo/UKC et
des contacts VHF existante. Les fiches signées et les brouillons sans droit
d’édition sont consultables ; les mécanismes de révision des administrateurs
restent ceux du formulaire. Aucun schéma, RPC, rôle ou contrôle serveur n’est modifié.

Le mode `readOnly` de la carte partagée autorise molette, déplacement, cadrage et
plein écran sans exposer les actions de modification. Les changements de caméra
restent locaux dans ces nouvelles vues. Le verrou `disabled` existant garde son
comportement. Les annulations en cours de geste et les callbacks périmés vérifient
les droits courants avant toute modification.

Validation : onglet Projet et profils réels Marin/Capitaine ; navigation et plein
écran en consultation ; déplacement/suppression des trois types de géométrie ;
invalidation des captures ; version attendue, conflits et erreurs réessayables ;
changements de sélection et de compte pendant une requête. Recette visuelle sur
fixtures locales sans compte ni écriture métier, formats ordinateur et mobile,
puis compilation de production et contrôles CI.
