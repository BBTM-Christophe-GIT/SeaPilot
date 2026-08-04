# SeaPilot v3.12.8 — import XLSM et recette du temps de travail

Cette livraison ajoute à `/modules/workingTime` l’assistant annuel réservé à l’administrateur et à l’armement. Le classeur est déposé dans un bucket privé, prévisualisé et corrigé avant que le serveur ne décide ligne par ligne ce qui peut être importé. Les macros ne sont jamais exécutées et les journées existantes ou verrouillées ne sont jamais remplacées.

## Déploiement

1. appliquer `20260804224824_working_time_excel_import.sql` ;
2. vérifier le bucket privé `working-time-imports` et ses politiques RLS ;
3. déployer l’application React ;
4. ouvrir `/modules/workingTime` avec un rôle administrateur ;
5. déposer un XLSM de recette, contrôler les statuts puis valider uniquement les lignes prêtes ;
6. vérifier le registre créé, ses intervalles `excel_import` et la traçabilité du lot.

## Retour arrière

Revenir au commit applicatif précédent masque l’assistant sans supprimer les données. La migration est additive ; les lots et fichiers sources doivent être conservés pour l’audit. Une suppression éventuelle doit faire l’objet d’une décision métier distincte.
