# SeaPilot v3.22.12 — éligibilité des marins au mois de référence

## Évolution

La fenêtre « Ajouter un marin » du module Planning propose désormais les personnes dont la période d’emploi recouvre le mois de référence sélectionné.

La règle est inclusive : une personne embauchée ou partie pendant le mois reste disponible. Une date d’embauche vide est considérée comme antérieure au mois et une date de départ vide comme postérieure au mois.

La liste s’appuie sur les champs Supabase `people.hired_on` et `people.departed_on` déjà chargés par le module. Aucune migration de base de données n’est nécessaire.

## Recette

1. Ouvrir le module Planning et sélectionner janvier 2025 comme mois de référence.
2. Ouvrir « Ajouter un marin » sur une bordée.
3. Vérifier que Loïc ALIX est proposé si ses dates d’embauche et de départ recouvrent janvier 2025.
4. Vérifier qu’une personne embauchée après le 31 janvier 2025 ou partie avant le 1er janvier 2025 n’est pas proposée.
5. Ajouter la personne et contrôler la création de sa ligne vide dans la bordée.
