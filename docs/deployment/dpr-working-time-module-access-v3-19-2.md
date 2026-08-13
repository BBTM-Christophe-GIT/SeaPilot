# Accès DPR et simplification du suivi du temps

Cette livraison remplace les anciennes règles DPR basées sur le rôle et sur un validateur nominatif par une règle unique : tout profil dont le module `dpr` est visible dans `role_module_permissions` peut saisir, soumettre et valider un DPR.

## DPR

- Un Marin autorisé peut créer, modifier, soumettre et valider son propre DPR par les RPC sécurisés.
- Un Marin ne reçoit aucune ligne d’historique DPR, y compris ses propres rapports après enregistrement.
- Un Capitaine autorisé voit tous les DPR non supprimés de sa société.
- Admin, Direction et Armement conservent la vue complète selon l’accès au module.
- Les champs et contrôles de validateur désigné sont retirés du nouveau parcours. Les anciennes colonnes restent nullables pour conserver les données historiques.
- Les politiques RLS des rapports, métriques, incidents, fichiers et événements d’audit appliquent la même règle d’accès au module.

## Suivi du temps

- Un registre mensuel courant est créé automatiquement pour chaque fiche RH active liée à un compte Marin ou Capitaine.
- Le formulaire ne saisit plus manuellement Début, Fin, Navire ou Bordée. Les heures proviennent de la frise et le contexte opérationnel provient du Planning actif.
- Les périodes sélectionnées apparaissent sous la frise sous forme de boutons supprimables.
- Le commentaire est requis si l’analyse serveur renvoie `alerte` ou `non_conforme`.
- Le Marin choisit un Capitaine affecté au même navire et à la même bordée le jour sélectionné, puis demande sa signature.
- Le Capitaine valide les demandes qui lui sont adressées et peut approuver ses propres saisies.
- La barre supérieure ne contient plus « Gestion des congés », « Actualiser », « Ouvrir un registre », « Enregistrer le brouillon » ni « Demander la signature ». Les actions de brouillon et de signature/validation sont placées au niveau du formulaire quotidien.

## Contrôles de recette

- `dpr_role_matrix_test.sql` vérifie les accès Marin, Capitaine, Admin, Direction, Armement, l’isolation société et la désactivation du module.
- `working_time_workflow_permissions_test.sql` vérifie l’ouverture automatique, le contexte Planning, la demande au Capitaine de bordée et l’auto-validation Capitaine.
- Les tests React contrôlent l’absence des anciens champs et commandes, les périodes, le commentaire obligatoire et les actions selon le profil.
