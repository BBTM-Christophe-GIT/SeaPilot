# SeaPilot v3.10.0 — profil Capitaine

Date de livraison : 1er août 2026.

La version 3.10.0 applique au profil `capitaine` un périmètre opérationnel fondé sur ses affectations Planning.

## Daily Progress Report

- Le Capitaine voit tous les DPR des navires auxquels il est actuellement affecté.
- Il peut saisir un DPR sur un navire affecté, modifier un brouillon, un DPR soumis ou rouvert, puis soumettre le DPR.
- Il peut valider un DPR soumis sur un navire affecté et rouvrir un DPR validé.
- Il peut prévisualiser, produire et télécharger les PDF ou les exports ZIP autorisés.
- Le bouton « Diagnostic » reste visible uniquement pour les administrateurs.
- Les contrôles sont appliqués dans l’interface, dans les politiques RLS et dans les fonctions transactionnelles Supabase.

Les PDF DPR restent strictement générés à la demande dans le navigateur. La table `dpr_files` ne conserve aucun PDF
et le bucket `dpr-pdfs` doit rester vide.

## Ressources humaines

- La liste est limitée aux personnes qui partagent une affectation chevauchante sur le même navire et dans la même bordée.
- Les cartes collectives et les indicateurs RH globaux sont masqués.
- Les fiches et documents de la bordée sont en lecture seule ; l’ouverture et le téléchargement restent autorisés.

## Planning

- Le Planning publié reste en lecture seule.
- Le ruban contient uniquement « Demander des congés » et « Générer une crew list ».
- Les affectations rapides, la publication et les outils opérationnels collectifs sont masqués.
- Le centre des absences ne montre que les demandes du Capitaine connecté.

## Déploiement et recette

1. Appliquer `supabase/migrations/20260801175252_captain_profile_permissions.sql`.
2. Vérifier que `captain_has_assigned_vessel`, `captain_shares_watch_with_person` et `dpr_captain_can_access_report`
   sont exécutables uniquement par les utilisateurs authentifiés.
3. Avec un compte Capitaine affecté, vérifier qu’un autre navire et les DPR associés ne sont jamais retournés.
4. Vérifier que les personnes hors bordée et leurs documents RH ne sont jamais retournés.
5. Confirmer que le Planning n’expose que les deux actions prévues et que les demandes restent personnelles.
6. Confirmer que `dpr_files` ne contient aucune métadonnée PDF et que `storage.objects` ne contient aucun objet dans
   `dpr-pdfs` après prévisualisation, téléchargement et export ZIP.

## Retour arrière

Le client peut être redéployé dans sa version précédente. Un retour arrière de la migration doit être préparé comme
une nouvelle migration rétablissant explicitement les politiques et fonctions antérieures ; ne jamais recréer le
stockage persistant des PDF DPR.
