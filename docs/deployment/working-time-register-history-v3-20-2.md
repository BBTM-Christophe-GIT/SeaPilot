# Historique mensuel depuis la date d’embauche

Cette livraison complète le provisionnement automatique des registres de temps de travail. Un seul registre courant ne suffisait pas lorsque l’utilisateur consultait un mois antérieur.

## Règle métier

- Un registre mensuel est créé pour chaque mois depuis le mois de la date d’embauche RH.
- Pour une personne sortie, le dernier registre correspond au mois de sa date de départ.
- Pour une personne toujours employée, la série va jusqu’au mois courant.
- Une nouvelle fiche RH reçoit immédiatement toute sa série historique, même sans compte utilisateur.
- Une modification des dates d’embauche ou de départ complète les mois manquants sans supprimer les données existantes.
- Le chargement du module provisionne d’abord la période demandée, afin de gérer automatiquement chaque nouveau mois.
- Les conflits sur la contrainte unique sont réutilisés : aucun doublon n’est créé.
- Une fiche sans date d’embauche est ignorée, car aucun premier mois fiable ne peut être déterminé.

## Reprise de données

La migration initialise les registres historiques de toutes les fiches RH qui possèdent une date d’embauche. Elle conserve les intervalles, validations et imports existants.
