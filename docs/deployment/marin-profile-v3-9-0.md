# SeaPilot v3.9.0 — profil Marin

La version 3.9.0 applique un périmètre personnel au profil `marin` dans les modules RH, Planning et DPR.

## Ressources humaines

- La vue ne charge et n’affiche que la fiche RH liée au compte connecté.
- Les indicateurs collectifs, les graphiques d’effectifs et la liste « Marins par fonction » sont masqués.
- La fiche et ses documents restent en lecture seule ; l’ouverture et le téléchargement des documents personnels restent autorisés.

## Planning

- Le Planning diffusé reste en lecture seule.
- Le ruban contient uniquement « Demander des congés ».
- Le panneau « Affectation rapide » et les outils opérationnels collectifs sont masqués.
- Le centre des absences est limité aux demandes de la personne connectée.
- Un clic droit sur une affectation personnelle ouvre la saisie d’une demande.
- Les demandes demandées, validées, refusées et annulées restent visibles sur la frise ; seule une suppression définitive les retire.
- Une déduplication défensive empêche le rendu multiple d’une même opération, notamment P144 sur GOURY.

## Daily Progress Report

- Un Marin n’accède au module que si sa fonction RH active est `2nd Capitaine` ou `Second Capitaine`.
- Il ne lit et ne modifie que les DPR dont il est l’auteur.
- Il ne dispose d’aucune action de validation, de prévisualisation PDF, de production PDF ou d’export ZIP.
- Les règles sont appliquées côté interface et côté Supabase (RLS et garde d’écriture).
- Aucun PDF DPR n’est stocké : les métadonnées PDF courantes et le bucket `dpr-pdfs` doivent rester vides.

## Contrôles de production

1. Vérifier la migration `20260801164437_marin_profile_permissions.sql`.
2. Vérifier que les 13 gardes d’écriture DPR sont présentes.
3. Vérifier que `dpr_files` ne contient aucun PDF courant et que `storage.objects` ne contient aucun objet dans `dpr-pdfs`.
4. Tester les vues administrateur « Marin » et « Capitaine » après déploiement.
