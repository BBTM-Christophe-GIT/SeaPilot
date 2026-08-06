# SeaPilot v3.12.9 — correctifs de l’import XLSM

Cette version corrige trois blocages du module `/modules/workingTime` :

- les profils et fiches RH historiques sont reliés lorsque leur e-mail normalisé est unique dans la même société ;
- le bucket privé accepte les deux casses équivalentes du type MIME XLSM émises par Windows ;
- un écart de total n’empêche plus le contrôle serveur, mais interdit toujours la validation tant que la journée
  n’est pas corrigée ou exclue.

## Déploiement

1. appliquer `20260806222704_link_profiles_and_unlock_working_time_import.sql` ;
2. vérifier que `christophe@bbtm.fr` est relié à la fiche RH correspondante ;
3. contrôler que le bucket `working-time-imports` accepte le type MIME XLSM en minuscules ;
4. déployer le client `3.12.9`, actualiser la session et relancer l’import ;
5. vérifier que « Contrôler l’import » reste actif avec des écarts de total et que « Valider l’import » reste
   désactivé tant que les lignes incohérentes ne sont pas corrigées ou exclues.

## Retour arrière

Le client précédent peut être redéployé sans annuler les associations RH déjà réparées. Conserver les deux valeurs
MIME dans le bucket est sans impact sur la sécurité : elles désignent le même format XLSM. Toute dissociation d’un
compte et d’une fiche RH doit être une opération métier explicite et auditée.
