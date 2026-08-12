# Saisie DPR par les marins et validation nominative

Date de livraison : 12 août 2026.

## Objet

Tout utilisateur avec le profil `Marin` peut désormais ouvrir le module Daily Progress Report, créer et modifier ses
propres brouillons, puis les soumettre à une personne active possédant le profil `Capitaine`. Le Capitaine choisi est
enregistré sur le DPR et lui seul, avec les profils bureau autorisés, peut valider le rapport ou le réouvrir pour
correction.

Le tableau de bord limite également les lectures des métriques, incidents et pièces jointes aux identifiants des DPR
déjà visibles. Cette réduction évite les requêtes globales qui pouvaient dépasser le délai PostgreSQL.

## Base de données

La migration `20260812113412_allow_marin_dpr_captain_validation.sql` :

- ajoute le Capitaine valideur et son nom figé au DPR ;
- expose uniquement les personnes actives ayant le profil `Capitaine` dans le contexte de saisie ;
- autorise un marin à gérer exclusivement les DPR dont il est l'auteur ;
- impose un Capitaine valideur actif avant toute soumission ;
- réserve la validation et la réouverture au Capitaine désigné ou à un profil bureau autorisé ;
- conserve le comportement historique des anciens DPR sans valideur désigné.

## Recette

1. Avec un profil `Marin`, ouvrir `Opérations > Daily Progress Report` puis `Saisir un DPR`.
2. Vérifier que le champ `Capitaine valideur` ne propose que des profils Capitaine actifs.
3. Enregistrer le brouillon, compléter les données obligatoires et le soumettre.
4. Vérifier que le marin peut suivre le DPR sans pouvoir le valider.
5. Avec le Capitaine désigné, valider le DPR ou le réouvrir avec un motif de correction.
6. Avec un autre Capitaine, vérifier que le DPR est consultable uniquement selon son périmètre navire et qu'aucune
   action de validation nominative n'est proposée.

## Retour arrière

Le client peut être redéployé dans sa version précédente. Les deux colonnes de validation sont additives et peuvent
rester en base sans perturber les anciens écrans. Avant de retirer les fonctions de la migration, rétablir les règles
de soumission et de validation de la migration Capitaine précédente.
