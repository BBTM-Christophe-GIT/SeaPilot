# Correctifs DPR et Suivi du temps de travail — v3.20.4

## Périmètre

- Préremplissage du projet DPR depuis le Planning pour les profils terrain, sans élargir leur accès au catalogue complet des projets.
- Non-régression d'accès direct au module DPR pour les rôles Marin et Capitaine lorsque la permission DPR est active.
- Correction du débordement horizontal de l'écran Suivi du temps de travail.

## Données et sécurité

La fonction `dpr_entry_context(date, bigint)` renvoie désormais un instantané limité du projet Planning sélectionné (`id`, code et titre). La fonction conserve ses contrôles d'authentification, d'appartenance à la compagnie et de permission au module DPR. Les politiques RLS de la table `projects` ne sont pas élargies.

Le personnel embarqué reste limité aux personnes actives, présentes dans leur période d'emploi et dont le statut Planning effectif est travaillé (`En mer` ou `À terre`).

## Interface

Le projet daté renvoyé par le Planning est fusionné dans les références du formulaire DPR. Il reste donc visible dans le sélecteur même lorsque le profil terrain ne peut pas lire le catalogue complet.

Dans le Suivi du temps de travail, les conteneurs de créneaux et d'actions ne reçoivent plus le style réservé aux boutons. Des contraintes `min-width: 0` empêchent les cartes de forcer la largeur de la page.

## Recette attendue

1. Ouvrir le DPR avec un profil Marin affecté à un navire et un projet Planning actifs : navire, projet et personnel embarqué sont préremplis.
2. Ouvrir directement `/modules/dpr` avec un profil Capitaine autorisé : le module est affiché.
3. Ouvrir `/modules/workingTime` sur un écran 1920 px : aucun débordement horizontal n'est généré par les créneaux enregistrés.
