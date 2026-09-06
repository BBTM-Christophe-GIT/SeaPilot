# Plan d'action — suivi signé et clôture contre-validée (v3.36.1)

## Droits fonctionnels

| Fonction | Administrateur | Direction | Armement | Capitaine | Marin |
| --- | --- | --- | --- | --- | --- |
| Créer une fiche | Oui | Oui | Oui | Oui | Oui |
| Ajouter un commentaire ou une pièce jointe signée | Oui | Oui | Oui | Oui | Oui |
| Demander une clôture | Clôture directe | Clôture directe | Oui | Oui | Oui |
| Contre-valider ou refuser une clôture | Oui | Oui | Non | Non | Non |
| Traiter l'action | Oui | Oui | Non | Non | Non |
| Gérer les types d'évènement | Oui | Oui | Non | Non | Non |
| Modifier les informations factuelles | Oui, si activé | Oui, si activé | Non | Non | Non |

La lecture et l'écriture restent limitées aux fiches accessibles au profil. Le signalement `discrimination_human_rights` conserve son périmètre strict : émetteur et Christophe MINASSIAN uniquement.

## Traçabilité et notifications

- Chaque commentaire, pièce jointe, demande, validation ou refus de clôture fige le Prénom NOM, l'heure serveur et la version active de la signature RH.
- Une signature active dans le dossier RH est obligatoire pour enregistrer une nouvelle entrée ou une décision.
- Une clôture demandée par Armement, Capitaine ou Marin laisse la fiche ouverte jusqu'à la contre-signature d'un Administrateur ou de la Direction.
- Un refus remet la fiche à l'état ouvert et notifie le demandeur.
- Une décision de validation ou de refus notifie l'émetteur, les responsables individuels, l'équipage actuellement affecté et les auteurs du suivi via la cloche.
- La notification ouvre directement la fiche concernée et est marquée comme lue.

## Réglage Administration

Le menu `Administration` contient désormais `Réglages des fiches` avec l'interrupteur `Afficher « Modifier la fiche »`. Il masque ou réaffiche le bouton pour les profils Administrateur et Direction sans modifier le workflow, les données ni la protection de la RPC de correction.

## Déploiement et retour arrière

1. appliquer `20260906194500_action_plan_signed_closure_workflow.sql`, puis `20260906200000_action_plan_management_editor_roles.sql` ;
2. déployer le client `3.36.1` (`2026-09-06.008`) ;
3. vérifier les profils réels avec les tests RLS/RPC, en particulier Capitaine et Marin ;
4. contrôler une demande de clôture, un refus, une nouvelle demande et une validation.

La migration est additive. En cas de retour arrière du client, conserver les colonnes, le journal signé et les notifications déjà émises ; ne pas restaurer l'ancienne clôture directe pour les rôles non gestionnaires.
