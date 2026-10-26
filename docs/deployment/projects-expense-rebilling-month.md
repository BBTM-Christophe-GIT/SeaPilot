# Projet — mois de refacturation d'un frais imputable

Version `3.78.0`, build `2026-10-26.005`.

Les fenêtres « Ajouter un frais imputable » et « Modifier le frais imputable »
proposent le champ obligatoire « À refacturer sur le mois », avec un sélecteur
de mois et d'année. À la création, le mois affiché dans la facturation est
présélectionné. À la modification, le mois de la fiche liée au frais est repris.

La date de facture est indépendante : une facture du 1er août 2026 peut être
refacturée en octobre 2026. L'enregistrement rattache le frais à la fiche du mois
choisi, réutilisée si elle existe ou créée automatiquement. Les paramètres et le
brouillon de la facture actuellement affichée sont conservés. Le frais apparaît
alors dans le tableau, le compteur, les totaux et l'export du mois choisi.
Un message confirme le mois de refacturation après l'enregistrement.

Les justificatifs suivent l'identifiant du frais : ils restent accessibles dans
le formulaire, le tableau du nouveau mois et ses exports, même si leurs anciennes
métadonnées mentionnent encore le mois d'origine. Leurs fichiers et leurs liens
de stockage restent utilisables. Les nouvelles pièces sont enregistrées avec la
fiche du mois choisi ; une erreur partielle de téléversement conserve le frais
et permet de réessayer uniquement les pièces restantes.

Le rattachement utilise `project_chargeable_expenses.billing_period_id` existant.
Aucune migration, colonne, nouvelle dépendance ou modification des droits n'est
nécessaire. Les contrôles RLS et les clés étrangères conservent les limites de
société, de projet et de profil.

Validation : tests d'ajout, de déplacement entre août et octobre, de conservation
de la date de facture et des pièces jointes, de réouverture et d'export après
rechargement ; contrôle du mois obligatoire et des profils en lecture seule ;
recette du formulaire sur ordinateur et mobile ; compilation de production.
