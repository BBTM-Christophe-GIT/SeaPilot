# Planning — barre d’actions et lignes vides

## Contenu livré

- La barre `Outils`, `Demander des congés`, `Demandes en attente` et `Actualiser` est placée au-dessus de la carte calendrier et reprend sa largeur.
- Le bandeau `Diffusion du planning` occupe la colonne du volet `Marins non affectés`.
- Le volet latéral est masqué lorsque le calendrier passe en plein écran.
- `Ajouter un marin` ouvre la liste des marins dont `departed_on` est strictement antérieure à la date du jour.
- Le marin ajouté apparaît sur une ligne persistante sans événement coloré.
- La suppression est proposée uniquement tant que cette ligne ne possède aucune affectation, période ou journée.

## Migration Supabase

Appliquer `supabase/migrations/202607170001_planning_empty_board_rows.sql` avant de déployer le frontend. La migration crée :

- la table RLS `planning_board_rows` ;
- la fonction `add_planning_board_row`, limitée aux marins déjà partis ;
- la fonction `delete_planning_board_row`, qui refuse une suppression si un enregistrement de planning est lié à la ligne.

Les deux fonctions exigent la capacité Planning `edit_event`. Les accès directs en écriture à la table restent révoqués.

## Vérification après déploiement

1. Ouvrir le module Planning avec un rôle autorisé à modifier les événements.
2. Vérifier l’alignement de la barre d’actions avec le calendrier et du bandeau de diffusion avec le volet droit.
3. Passer en plein écran et vérifier que le volet `Marins non affectés` disparaît.
4. Cliquer sur `Ajouter un marin` dans une bordée et contrôler que seuls les profils avec une date de départ passée sont proposés.
5. Ajouter un profil, vérifier sa ligne vide, puis la supprimer.
6. Ajouter un enregistrement sur une telle ligne et vérifier que le bouton de suppression n’est plus affiché.

## Retour arrière

Revenir d’abord au frontend précédent. La table peut être conservée sans impact. Si sa suppression est nécessaire, révoquer et supprimer les deux fonctions, puis supprimer `planning_board_rows` après vérification qu’aucune ligne métier ne doit être conservée.
