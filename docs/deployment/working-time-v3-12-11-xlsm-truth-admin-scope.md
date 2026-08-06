# SeaPilot v3.12.11 — total XLSM et périmètre de saisie administrateur

Cette version corrige les deux blocages observés dans `/modules/workingTime`.

- Le compte administrateur relié à une fiche RH voit désormais toutes les personnes RH actives de sa société et peut préparer ou corriger leurs registres en brouillon. L’Armement dispose du même périmètre opérationnel. La Direction reste en lecture seule.
- L’interface ne conserve plus un identifiant de personne masqué lorsque le serveur ne renvoie aucun choix : le sélecteur et le bouton d’ouverture sont alors désactivés avec un message explicite.
- Le parseur `seapilot-xlsm-v2` considère le total journalier déclaré comme la vérité métier et aligne correctement les 48 cases entre les deux bornes `00h`. Les phases ne sont plus décalées de 30 minutes et la case se terminant à `24:00` n’est plus omise.
- Les autres écarts de total restent bloquants et doivent être corrigés ; aucune journée validée n’est remplacée.

## Déploiement

1. appliquer `20260806233355_working_time_management_entry_scope.sql` ;
2. déployer le client `3.12.11` ;
3. actualiser la session administrateur et vérifier que le sélecteur « Personne » contient les fiches RH actives ;
4. recharger `Pierre LEPRETRE - 2026.xlsm` : l’aperçu doit annoncer 41 journées et 551 h déclarées ; le 27 mai doit afficher `00:00-01:00, 09:00-12:30, 15:30-24:00` ;
5. lancer le contrôle serveur : aucune des 41 journées ne doit être classée `total_mismatch`.

La signature du marin reste explicite, l’auto-validation du capitaine reste interdite et les registres validés restent verrouillés.
