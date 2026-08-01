# SeaPilot v3.8.0 — vues de profils administrateur

Date de livraison : 1er août 2026.

## Objet

Un administrateur peut sélectionner dans la barre supérieure une vue réelle ou la simulation de chacun des profils
SeaPilot : Admin, Direction, Armement, Capitaine et Marin.

La vue sélectionnée adapte :

- la navigation et les modules visibles selon la matrice des droits du profil ;
- les actions métier affichées dans les modules, notamment les actions DPR ;
- le libellé du profil dans le menu utilisateur ;
- un badge permanent rappelant la simulation active.

## Sécurité

Cette fonctionnalité est une simulation d'interface. Elle ne modifie aucune ligne `user_roles`, aucun jeton de
session et aucune politique RLS. Les droits réels de l'administrateur restent actifs côté serveur. Le sélecteur est
construit uniquement lorsque le rôle réel `admin` a été chargé ; il n'est jamais transmis aux autres profils.

## Recette

1. Se connecter avec un compte administrateur et vérifier la présence du sélecteur « Vue ».
2. Parcourir successivement les cinq profils et contrôler le badge ainsi que la navigation correspondante.
3. En vue Capitaine puis Marin, ouvrir le DPR et confirmer que le diagnostic administrateur disparaît.
4. Revenir à la vue réelle et vérifier le retour des modules et actions administrateur.
5. Se connecter avec un compte non administrateur et confirmer l'absence totale du sélecteur.

## Retour arrière

Le retour arrière consiste à redéployer la version précédente du client. Aucune migration ou restauration de
données n'est nécessaire.
