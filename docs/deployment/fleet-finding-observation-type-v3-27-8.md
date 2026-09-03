# Certificats flotte — type Observation v3.27.8

La fenêtre « Déclarer un écart » propose désormais le type `Observation`. La contrainte de validation Supabase accepte la valeur technique `observation`, qui est restituée avec le libellé « Observation » dans l’interface et les rapports.

Les écarts sont classés selon l’ordre métier des types affichés dans le formulaire :

1. Non-conformité majeure ;
2. Non-conformité mineure ;
3. Condition de Classe ;
4. Remarque ;
5. Observation ;
6. Prescription ;
7. Findings.

À l’intérieur d’un même type, le classement existant est conservé : année d’échéance croissante, puis ordre naturel du champ « Objet ».
