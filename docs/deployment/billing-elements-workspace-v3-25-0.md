# Facturation — espace Éléments de facturation (v3.25.0)

## Interface

- Nouvelle section `Facturation` dans la navigation principale.
- Nouvelle entrée `Éléments de facturation`, visible pour les profils Admin et Direction.
- La fenêtre dédiée permet de sélectionner un projet, un mois et les catégories à afficher :
  - Services refacturables ;
  - Prestation BBTM ;
  - Éléments de facturation.
- Le contenu réutilise la facturation mensuelle de la fiche projet : frais, pièces, prestation BBTM, loyers, aperçu et export.

## Données et permissions

- Aucune nouvelle donnée métier n’est dupliquée.
- La migration `20260831123457_billing_elements_navigation.sql` ajoute le nouveau module aux autorisations Admin et Direction.
