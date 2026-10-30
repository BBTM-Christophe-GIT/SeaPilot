# Justificatifs des services refacturables

## Correction du 30 octobre 2026

L'ajout d'un justificatif pour SARL HALBOURG ET FILS dans P144 échouait : le nom
généré contenait la spécialité `Pompage Eaux / Hydrocarbures`. Le service privé
de documents refuse les séparateurs de chemin dans un nom de fichier.

`billingExpenseAttachmentName` remplace maintenant les caractères interdits par
un tiret et limite le nom à 255 caractères en conservant l'extension. La date,
le numéro de facture, les accents et les libellés lisibles sont conservés, ainsi
que le contenu, le type et la date de modification du fichier. Le même traitement
s'applique à l'ajout depuis la ligne du fournisseur et depuis le formulaire.

Exemple : `2026-09-30 - 152450 - Pompage Eaux - Hydrocarbures.pdf`.

## Déploiement et vérification

Déployer le frontend et son API habituelle sur Vercel. Aucune migration de base
de données ni modification des autorisations de stockage n'est nécessaire.
Les trois dépenses existantes HALBOURG restent inchangées ; leurs justificatifs
doivent être sélectionnés de nouveau après actualisation de l'application.

Les tests de régression couvrent le nom HALBOURG, les caractères interdits,
les noms longs, l'intégrité du fichier et l'ajout depuis le tableau de facturation.
Les tests de facturation existants vérifient également le formulaire et les mois
de refacturation.

Pour la recette : ouvrir P144 → Facturation → octobre 2026, ajouter un PDF sur la
ligne HALBOURG / facture 152450, puis vérifier la pièce affichée et sa présence
après rechargement. Ne pas utiliser les données de démonstration d'une préversion
pour conclure à une persistance en production.

Retour arrière : rétablir le commit précédent du frontend ; les pièces déjà
enregistrées restent lisibles.
