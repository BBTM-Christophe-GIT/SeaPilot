# Plan d'action — centre de contrôle (v3.34.0)

## Changement livré

- applique la direction visuelle « option 3 » : synthèse compacte, file priorisée, dossier détaillé et catalogue des types dans un écran unique ;
- rend toutes les informations factuelles d'une fiche corrigibles par le seul profil `Administrateur`, avec motif et journal d'audit obligatoires ;
- conserve strictement les statuts, signatures, approbations, affectations et étapes de traitement existants ;
- permet à l'Administrateur de renommer, classer, ordonner, activer ou désactiver un type d'évènement ;
- protège les clés techniques, les rattachements KPI/HSE et la confidentialité lors des changements de libellé ;
- remplace la liste codée en dur des types nécessitant un écart par le catalogue administrable ;
- ajoute les politiques RLS, RPC et tests SQL associés.

## Déploiement

La migration `20260906113000_action_plan_admin_control_center.sql` doit être appliquée avant le déploiement de l'interface. Elle est additive et ne réécrit aucune fiche existante.

## Validation attendue

- un Administrateur voit `Modifier la fiche` et `Gérer les types` ;
- Direction, Armement, Capitaine et Marin ne voient pas ces commandes ;
- une correction factuelle conserve le statut, le workflow, les affectations et les signatures ;
- un changement de libellé conserve la clé technique et la classification KPI/HSE ;
- un type désactivé reste lisible sur les fiches historiques mais n'est plus proposé à la création ;
- les parcours de création, approbation, traitement, clôture et export PDF restent inchangés ;
- la version affichée par l'application est `3.34.0`.
