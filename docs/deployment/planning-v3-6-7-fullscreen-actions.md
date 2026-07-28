# Planning v3.6.7 — plein écran et actions de grille

## Résultat livré

- Le ruban de commandes et la carte de diffusion restent visibles en plein écran.
- La carte calendrier occupe uniquement la hauteur disponible ; son ascenseur horizontal reste accessible.
- L’annulation d’une affectation et la suppression depuis le menu contextuel utilisent une confirmation intégrée, sans quitter le plein écran.
- Le clic droit sur une case colorée propose la suppression de la case ou de tout le groupe.
- Un administrateur peut déplacer par glisser-déposer une période de vacances déjà validée. Le statut validé, les heures locales et l’historique sont conservés.
- Les congés validés restent affichés avec un bandeau noir libellé « Vacances ».

## Données et sécurité

La migration `202607230005_planning_admin_move_approved_absence.sql` ajoute la RPC `move_planning_approved_absence`.
Elle est limitée au rôle `admin`, à l’entreprise Planning active, aux absences de type `leave` déjà validées et refuse tout chevauchement avec une autre absence active du marin.

## Validation attendue

1. Exécuter les tests Planning, le lint et le build de production.
2. Appliquer la migration Supabase.
3. Vérifier en plein écran que le ruban, la diffusion, le calendrier et l’ascenseur horizontal sont visibles simultanément.
4. Vérifier la suppression d’une case et d’un groupe depuis le menu contextuel.
5. Déplacer une vacance validée avec un compte administrateur et confirmer que le bandeau reste noir avec le libellé « Vacances ».
