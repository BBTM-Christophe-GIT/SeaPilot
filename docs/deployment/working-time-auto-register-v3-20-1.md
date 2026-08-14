# Registres mensuels automatiques pour toutes les fiches RH

Cette livraison supprime l’état d’attente « registre en cours de création automatique » pour les fiches RH actives qui ne possèdent pas encore de compte Marin ou Capitaine.

## Règle de provisionnement

- Chaque fiche RH active possède un registre mensuel pour le mois courant.
- La création ne dépend plus de la liaison à un compte utilisateur ni d’un rôle applicatif.
- Le déclencheur `working_time_people_register` crée le registre lors de la création d’une fiche ou de sa réactivation.
- La migration initialise toutes les fiches RH actives déjà présentes.
- L’opération est idempotente : la contrainte unique par personne et période empêche tout doublon.
- Un ancien registre mensuel masqué est réactivé au lieu d’être dupliqué.

## Sécurité et recette

La fonction de provisionnement reste `SECURITY DEFINER`, fixe explicitement un `search_path` vide et n’est exécutable ni par `public`, ni par `anon`, ni par `authenticated`. Le test SQL couvre les rôles Marin, Capitaine, Armement, Admin et Direction ainsi qu’une fiche RH active sans compte utilisateur.
