# Modification libre du suivi du temps de travail

Le réglage **Administration → Accès et rôles → Modification libre du suivi du temps de travail**
est désactivé par défaut. Les Administrateurs peuvent l’activer ou le désactiver pour leur société.
Conformément à la portée demandée, **seul le compte de Christophe MINASSIAN** bénéficie de
la modification libre. Les autres Administrateurs, RH, Capitaines et Marins conservent leurs règles habituelles.

## Effet sur les tableaux

Lorsque le réglage est actif pour ce compte, la saisie, la correction et le retrait de plages restent
disponibles au-delà du délai de saisie, sur les journées validées et dans les registres clôturés.
Les commentaires de non-conformité et les motifs de correction ou de retrait sont facultatifs.
Les calculs de repos et les alertes de conformité continuent à s’actualiser.

Une modification effective conserve l’audit de l’auteur, des valeurs précédentes et des nouvelles valeurs.
Le retrait reste un retrait historisé : la plage n’est pas effacée définitivement.
Une journée dont les heures signées ont changé revient à l’état brouillon ; un registre signé concerné
est rouvert. Les anciennes validations, les heures qu’elles approuvaient et les signatures correspondantes
restent dans l’historique. Une nouvelle validation s’applique aux heures corrigées.
Un enregistrement sans changement ne retire pas une validation.

## Contrat serveur

- `working_time_edit_settings` conserve un réglage par société et l’identifiant du compte autorisé.
  La migration résout le compte Christophe MINASSIAN depuis sa fiche RH et son rôle Administrateur ;
  elle n’inscrit aucun identifiant utilisateur en dur dans le code.
- `working_time_get_edit_settings()` renvoie `unrestricted_editing_enabled` et
  `can_use_unrestricted_editing` pour la session authentifiée. La seconde valeur est décidée côté serveur.
- `working_time_save_edit_settings(p_unrestricted_editing_enabled)` exige le rôle Administrateur,
  cible la société de la session et renvoie les deux mêmes valeurs. La modification du réglage est auditée.
  Ce RPC ne permet pas de changer le compte autorisé.
- Les RPC métier contrôlent l’identité autorisée et le réglage au moment de chaque écriture.
  L’authentification, le périmètre de société, la cohérence des dates et la protection des données
  ne dépendent pas de l’interrupteur affiché dans le navigateur.

Le client conserve le dernier état confirmé pendant une sauvegarde et désactive l’interrupteur
jusqu’à la réponse du serveur. Si la lecture échoue, le réglage est affiché comme indisponible,
les modifications sont bloquées et **Réessayer le chargement** permet une nouvelle lecture.
Une erreur de sauvegarde laisse l’état précédent affiché et ne confirme pas la modification.

## Déploiement et vérification

Appliquer `20261012140304_working_time_unrestricted_editing.sql` avant le frontend qui expose le réglage.
Le déploiement de la fonctionnalité n’active pas le mode en production : le réglage reste désactivé
tant qu’un Administrateur ne l’active pas explicitement.

Vérifier les fixtures réelles du compte autorisé et des autres Administrateurs, RH, Capitaines et Marins,
les contrôles serveur en mode actif et inactif, les journées validées, les registres signés,
le retrait sans motif et la conservation de l’historique. Les vues de rôle simulées à partir d’une session
Administrateur ne remplacent pas ces fixtures. Vérifier aussi l’interrupteur au clavier et sur mobile,
ses états de chargement et ses erreurs, puis le build de production.
