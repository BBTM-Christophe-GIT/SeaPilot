# Procédures QSMS — fiche information v3.27.14

## Livraison

- Version : `3.27.14`
- Build : `2026-09-02.0016`
- Route : `/modules/procedures`
- Profils concernés : Administration et Direction pour l’édition ; tous les profils autorisés pour la consultation des PDF.

## Changements

- nouvelle fiche information structurée en quatre sections ;
- référence calculée automatiquement avec `Thème Numéro-Version` et affichée avec le titre dans l’en-tête ;
- suppression visuelle des champs Type document, Catégorie, Code procédure, Restrictions, Notes et Veille Passerelle ;
- recherche de projet alimentée par les projets actifs du catalogue SeaPilot ;
- échéance annuelle calculée à un an après la date de diffusion ;
- alerte à partir de J-90 dans la bibliothèque QSMS et sur l’accueil Administration/Direction ;
- suppression de la ligne technique `Type · Thème · Version` sous le nom du document.

## Données

Aucune migration SQL n’est requise. Les alertes reposent sur `procedures.annual_review` et `procedures.diffusion_on`, et la liste de projets lit les enregistrements actifs de `public.projects`.

## Recette

1. Ouvrir une procédure en Administration ou Direction.
2. Vérifier que le titre de la fenêtre suit `Code - Titre` et réagit aux champs Thème, Numéro et Version.
3. Rechercher un projet par code ou nom et sélectionner sa valeur.
4. Activer Revue annuelle avec une date de diffusion et contrôler la date calculée à un an.
5. Vérifier qu’une échéance à 90 jours ou moins est visible dans la bibliothèque et dans « Priorités & échéances » de l’accueil.
6. Contrôler que les profils Armement, Capitaine et Marin conservent uniquement l’accès aux PDF publiés.

## Retour arrière

Revenir au commit précédent de l’application. Aucune donnée ni structure Supabase n’est à restaurer.
