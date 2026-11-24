# Planning — Projet rapide

Dans les vues Flotte et Projet, un double-clic sur une case de la ligne projet
ouvre « Nouvelle opération ». Le bouton « Projet rapide » affiche uniquement
le titre. La validation crée un projet numéroté Pxxx au statut Brouillon, son
contrat à compléter et une opération d'une journée sur le navire et la date de
la case. Le dialogue se ferme et le planning se met à jour sans navigation.
Le même projet est disponible dans la liste Projets et dans le catalogue.

Les droits de création restent ceux du module Projets : Admin et Direction.
Armement conserve le rattachement d'un projet existant. Les profils terrain
restent en lecture seule. Le bouton de création complète reste disponible.

Appliquer `20260925090628_planning_quick_draft_project.sql` avant le frontend.
La RPC `planning_create_quick_project` utilise SECURITY INVOKER et appelle les
fonctions métier existantes dans une transaction unique. La numérotation utilise
le compteur existant, les droits et la société sont vérifiés côté serveur et
aucune donnée financière n'est retournée. Les anciens raccourcis restent révoqués.
Le statut Brouillon est conservé par les normalisations serveur et client.
Les dates contractuelles restent à renseigner, indépendamment du jour planifié.

Vérifications : formulaire (titre seul, Entrée, erreurs, double envoi, lecture
seule), intégration dans les deux vues et maintien de l'URL ; tests SQL sous les
cinq rôles authentifiés, catalogue, contrat et navire liés, numérotation,
navire inactif ou d'une autre société, titre vide, date absente et rollback.
Les fixtures SQL sont intégralement annulées en fin de test.

## Hors Projet

Dans **Nouvelle opération**, choisissez **Hors Projet**, saisissez un nom et
validez. Le planning ajoute une opération d’une journée sur le navire et à la
date sélectionnés. Le même code **HP** et la couleur gris anthracite s’affichent
dans les vues **Flotte** et **Projet**, y compris après renommage.

Les profils Administration, Direction et Armement peuvent créer et modifier
ces opérations. Chaque opération possède son propre identifiant dans le
planning. Elle est enregistrée sans fiche commerciale ni contrat associé et
reste hors de la file **À facturer**.

Appliquer `20261124082944_planning_hors_projet.sql` avant le déploiement du frontend.
