# Validation directe des DPR

La version `3.19.3` retire l’étape de soumission du parcours Daily Progress Report.

## Règle d’accès

- Tout utilisateur dont un rôle actif rend le module `dpr` visible peut valider un DPR de sa société.
- Le rôle ne sélectionne plus un validateur et aucune séparation entre soumission et validation n’est appliquée.
- L’isolation entre sociétés et l’absence d’historique pour un profil Marin restent inchangées.

## Parcours utilisateur

- Le bouton « Soumettre le DPR » est supprimé.
- « Valider le DPR » enregistre le formulaire et appelle directement `dpr_validate`.
- La validation directe accepte un brouillon, un DPR réouvert ou un ancien DPR soumis.
- Elle attribue le numéro DPR, contrôle les champs obligatoires et finalise le rapport en une seule transition.
- Une erreur de complétude est affichée dans la modale et ouvre automatiquement l’étape concernée.

## Sécurité et compatibilité

- `dpr_validate` contrôle côté serveur l’accès au module et l’appartenance à la société du DPR.
- L’ancien RPC `dpr_submit` reste présent pour la compatibilité de schéma et un déploiement progressif, mais le nouveau parcours ne l’appelle plus.
- Les fichiers encore en attente bloquent la validation jusqu’à la fin de leur téléversement.

## Recette

- Les tests React vérifient l’absence du bouton de soumission, l’erreur visible dans la modale et l’appel direct de validation.
- La matrice pgTAP vérifie la validation directe Marin et Capitaine, la validation par un autre auteur autorisé et l’isolation société.
