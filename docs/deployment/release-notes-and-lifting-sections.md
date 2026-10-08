# Version 3.51.0 — Levage et notes de mise à jour

## Navigation Levage

Le menu Registres contient directement les trois rubriques suivantes. Le menu Levage est supprimé :

- Registre des Apparaux de levage : `/modules/lifting/apparaux`.
- Registre des Remorques : `/modules/lifting/remorques`.
- Examen à Fond - Grue : `/modules/lifting/grue`.

L'ancien lien `/modules/lifting` redirige vers les apparaux. Les trois routes héritent de la permission `lifting` existante : aucune nouvelle permission ni modification des RPC/RLS Levage. Les composants, inventaires, filtres navires, rapports, contrôles, documents, fiches papier et règles par profil sont conservés. La sélection du navire est conservée entre rubriques ; un contrôle modifié doit être enregistré avant de changer de rubrique. L'ajout d'une remorque depuis les apparaux ouvre le bon registre après enregistrement. Grue conserve son écran d'accès aux certificats flotte existants.

## Demande enregistrée et comportement des notes

À la demande explicite de l'utilisateur, ajouter une note au catalogue `src/features/releaseNotes/releaseNotesCatalog.ts`. Ne pas produire automatiquement une note à chaque changement. La première note décrit cette version.

Après connexion, une nouvelle note ouvre la fenêtre « Note de mise à jour ». Toutes les notes non lues s'y succèdent de la plus récente à la plus ancienne : date décroissante, puis version décroissante pour une même date. Cet ordre s'applique aussi à l'historique.

Une note peut préciser `roles` pour cibler certains profils. Elle n'entre dans la fenêtre, le compteur ou les accusés de lecture que si le compte possède au moins un de ces rôles. Les notes sans ciblage restent visibles à tous les comptes. La note Planning 3.56.0 vise Administrateur, Direction et Armement.

- **Ok** marque les notes affichées comme lues et ferme la fenêtre. Elles ne se rouvrent pas automatiquement.
- **Lire plus tard**, la croix, Échap ou un clic hors de la fenêtre enregistrent le report et ferment la fenêtre. Elle ne se rouvre pas pour les mêmes notes au prochain lancement.
- Une pastille rouge près de la version affiche le nombre exact de notes non lues. Cliquer sur la version permet de les consulter. Quand tout est lu, ce bouton ouvre l'historique.
- Une nouvelle note déclenche à nouveau l'ouverture automatique, avec les notes précédemment reportées après elle.
- Les choix sont privés et persistés par compte dans `user_release_note_states`, y compris entre appareils. Le retour dans l'onglet revalide cet état. Un report concurrent ne peut pas effacer une lecture enregistrée ailleurs.
- En cas d'échec d'enregistrement, la fenêtre reste ouverte avec une erreur et permet de réessayer. Aucun succès n'est simulé.
- La démonstration utilise uniquement un stockage local séparé, sans écrire en production.

## Déploiement et vérification

Appliquer `supabase/migrations/20260923043157_user_release_note_states.sql` avant le client (appliquée au projet SeaPilot le 23 septembre 2026). La table ajoute seulement l'état de lecture ; elle ne modifie aucune donnée métier. Les politiques autorisent uniquement la lecture, l'insertion et la mise à jour de ses propres lignes. Aucun accès anonyme ni suppression côté client.

Exécuter les tests des notes, de la navigation, des permissions et du module Levage, le lint et le build. Le test SQL `supabase/tests/release_note_states_access_test.sql` vérifie l'isolation par compte et l'impossibilité de transférer l'état d'un autre utilisateur, dans une transaction annulée.

Recette navigateur : ordinateur 1440 × 1000 et mobile 390 × 844, sur `/modules/lifting/apparaux?preview=1`. Ouverture automatique, report puis rechargement sans réouverture, compteur exact, navigation vers remorques et grue, Ok puis nouvelle ouverture sans note ni pastille, historique accessible depuis la version, ancien lien redirigé et absence de débordement horizontal. Les profils Marin/Capitaine sont validés via les fixtures authentifiées et les tests SQL, sans simulation depuis une session administrateur.

Pour un retour arrière, redéployer le client précédent ; conserver la table et le catalogue afin de préserver les lectures.
