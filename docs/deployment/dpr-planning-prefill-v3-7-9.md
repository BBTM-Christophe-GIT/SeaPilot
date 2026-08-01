# SeaPilot v3.7.9 — saisie DPR assistée par le Planning

Date de livraison : 1er août 2026.

## Objet

La saisie d'un Daily Progress Report exploite désormais la situation du Planning à la date du rapport. À l'ouverture
du formulaire, SeaPilot propose le navire, le projet et les membres de la bordée de l'émetteur. Ces valeurs restent
modifiables avant l'enregistrement.

La carte « Personnel embarqué » et la liste « Autres personnes » excluent les personnes inactives ou sorties des
effectifs à la date sélectionnée. Les autres personnes sont proposées par fonction, avec les sédentaires en premier,
et plusieurs noms libres peuvent être ajoutés en une seule saisie (séparateur point-virgule ou nouvelle ligne).

L'émetteur est affiché sous la forme `Prénom NOM`. Le champ « Projet non référencé » a été retiré de la saisie. Le
motif d'escale `Off-Hire` a été ajouté.

## PDF

La section « Contact Radio » n'est plus produite. La « Description de la Journée » peut occuper toute la hauteur
libérée jusqu'à la section QHSE. Le PDF reste généré uniquement à la demande dans le navigateur et n'est jamais
stocké dans Supabase.

## Base de données

La migration `20260801142931_dpr_planning_prefill_off_hire.sql` :

- ajoute le motif actif `off-hire` au référentiel des escales ;
- crée la fonction sécurisée `dpr_entry_context(date)` ;
- contrôle l'authentification, l'appartenance à la compagnie et l'accès au module DPR ;
- ne retourne que l'identité et la fonction des personnes en poste à la date demandée ;
- réserve l'exécution de la fonction au rôle `authenticated`.

## Recette

1. Ouvrir « Saisir un DPR » et vérifier le navire, le projet, l'émetteur et la bordée proposés.
2. Changer la date et confirmer que le préremplissage Planning est recalculé sans verrouiller les champs.
3. Confirmer qu'une personne sortie des effectifs ne figure dans aucune liste.
4. Ouvrir « Autres personnes », contrôler le classement par fonction et ajouter plusieurs noms libres.
5. Ouvrir l'étape « Escale » et sélectionner `Off-Hire`.
6. Générer un PDF avec une description longue et vérifier l'absence de « Contact Radio ».

## Retour arrière

Le client peut être redéployé dans sa version précédente. Le motif `off-hire` peut être désactivé sans supprimer les
données historiques. La fonction `dpr_entry_context(date)` n'écrit aucune donnée métier et peut être supprimée après
le retour arrière du client.
