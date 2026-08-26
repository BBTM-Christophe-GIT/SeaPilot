# Planning historique et modification RH personnelle v3.22.14

## Planning au mois de référence

L'ajout d'une personne dans le Planning vérifie désormais ses dates d'emploi par rapport au mois de référence sélectionné, côté interface comme côté Supabase. Une personne est éligible lorsque sa période d'emploi chevauche au moins une journée du mois.

Exemple validé : Loïc ALIX, embauché le 1er juillet 2024 et parti le 2 décembre 2025, peut être ajouté au Planning de janvier 2025. Il reste refusé pour un mois postérieur à sa date de départ.

La nouvelle fonction `add_planning_board_row_for_month` conserve les contrôles d'entreprise, de navire et de permission Planning. L'ancienne fonction reste disponible pour les versions déjà ouvertes de l'application, ce qui évite une rupture pendant le déploiement.

## Profils Capitaine et Marin

Les profils Capitaine et Marin voient le bouton **Modifier la fiche RH** sur leur propre dossier. Un capitaine conserve la consultation des membres de sa bordée, mais leurs fiches restent en lecture seule.

L'enregistrement personnel passe par la fonction Supabase `update_own_hr_profile`. Elle vérifie le compte authentifié, le rôle dans l'entreprise et le lien exact avec la fiche RH, puis ne met à jour que les colonnes exposées par le formulaire. Les champs système (`company_id`, `user_id`, `active`) ne sont jamais modifiables par ce chemin. Les informations médicales rattachées aux documents restent réservées aux rôles de gestion RH.

## Vérifications

- tests d'interface sur le mois historique janvier 2025 et l'appel RPC avec le mois sélectionné ;
- tests d'interface avec les profils réels Capitaine/Marin : modification de sa propre fiche et interdiction sur celle d'un tiers ;
- test pgTAP des permissions RPC, du chevauchement des dates et de l'isolation de la fiche personnelle ;
- lint de la base, suite automatisée et build de production.
