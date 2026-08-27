# Plan d’action Capitaine et alertes Achats — v3.22.17

## Comportement livré

- Le profil applicatif `capitaine` dispose du bouton **Traiter** sur chaque action non soldée. La création d’une action reste réservée aux rôles de bureau.
- Le traitement passe par la RPC `action_item_treat`, limitée aux commentaires, à l’action réalisée, à la preuve de clôture, au statut et à la date de clôture. Un Capitaine ne reçoit aucun droit de modification générale sur `action_items`.
- Le bucket privé `action-plan-evidence` accepte les preuves déposées par les Capitaines dans le dossier de leur société active.
- Une demande d’achat urgente au stade `completed` n’alimente plus la pastille **Urgences** et disparaît de la vue **Urgences uniquement**.

## Déploiement

Appliquer `20260827085307_captain_action_treatment.sql` avant d’exposer la version frontend. La migration ajoute la RPC de traitement et remplace uniquement la politique d’insertion du bucket de preuves ; elle ne modifie aucune donnée existante.

## Vérifications

- Vitest couvre le bouton et la RPC avec un profil Capitaine réel injecté dans le composant, sans utiliser la simulation de profil de la session courante.
- Le cas Achats associe une urgence ouverte et une urgence soldée, puis vérifie une pastille à `1` et un onglet **Traitées** vide sous le filtre d’urgence.
- `action_plan_captain_treatment_test.sql` vérifie le profil Capitaine, le refus du profil Marin, l’impossibilité de contourner la RPC, le refus des actions déjà soldées et le chemin de preuve limité à la société/action.
