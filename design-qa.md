# Design QA — Tableau de bord RH, proposition 2

## Référence et état contrôlé

- Référence sélectionnée : `C:/CODEX/SeaPilot/docs/design/hr-dashboard-option-2.png`
- Capture de l'implémentation : `C:/CODEX/SeaPilot/docs/design/hr-dashboard-implementation.png`
- Comparaison côte à côte : `C:/CODEX/SeaPilot/docs/design/hr-dashboard-comparison.png`
- Viewport : 1536 × 1024
- État : administrateur, tableau de bord RH, filtres par défaut, groupes métier dépliés, aucune modale ouverte.

## Contrôles effectués

- Hiérarchie visuelle : bandeau d'indicateurs, analyses, filtres puis liste des marins.
- Ordre métier : Capitaine, Chef Mécanicien, 2nd Capitaine, Maître d'Equipage, Matelot polyvalent, Matelot Qualifié, Stagiaire.
- Libellés : préfixes numériques masqués et fonctions vides omises.
- Responsive : mise en page desktop à la largeur cible et règles mobiles vérifiées dans la feuille de style.
- Interactions : ouverture du paramétrage des accès, ouverture d'une fiche marin, passage en modification, accès à Santé et habilitations, édition des informations médicales, action d'enregistrement visible.
- Champs contrôlés : type de document d'identité, fonction, rôle, registre, sexe et type de contrat sont proposés sous forme de listes adaptées.
- Console navigateur : aucune erreur ni alerte sur les parcours vérifiés.

## Itérations issues de la comparaison

- P1 — Le pied de formulaire de la fiche marin pouvait être masqué : grille corrigée pour conserver l'action « Enregistrer la fiche » visible.
- P1 — Un préfixe numérique pouvait réapparaître dans la fiche détaillée : normalisation appliquée à la lecture et à l'édition.
- P2 — Un espace vertical inutile subsistait sans message système : zone de notification rendue conditionnelle.
- P2 — Le filtre par fonction manquait dans la barre de recherche : filtre ajouté.

## Écarts acceptés

- La référence inclut la navigation globale SeaPilot ; la capture QA isole volontairement la page RH. L'implémentation reste rendue dans le shell existant en production.
- Les valeurs d'indicateurs et les personnes diffèrent de la maquette, car l'interface calcule les données réelles. La structure et les priorités visuelles sont conservées.

final result: passed
