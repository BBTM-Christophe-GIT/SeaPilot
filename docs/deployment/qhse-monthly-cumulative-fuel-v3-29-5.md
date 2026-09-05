# Fuel : cumul mensuel avec points journaliers — v3.29.5

Dans « RSE — consommations par projet », la courbe de fuel montre désormais la somme des consommations DPR enregistrées depuis le début de chaque mois, en m³. Le cumul revient à zéro à chaque frontière mensuelle. Les valeurs journalières proviennent toujours de `dpr_daily_metrics.fuel_consumed_liters / 1000` et respectent les filtres du rapport.

Les douze mois restent affichés en toutes lettres sur une année complète, dans la même zone graphique. Le dernier cumul de chaque mois est étiqueté en m³, avec jusqu'à deux décimales. Les litres sont additionnés avant conversion pour éviter les erreurs d'arrondi cumulées. Pour le mois en cours, l'étiquette est placée au dernier DPR disponible. Entre deux DPR d'un même mois, le cumul connu est conservé ; un mois entier sans données et les dates après le dernier DPR restent vides.

Les années sélectionnées restent comparables sur un même calendrier. Les totaux annuels et le calcul des émissions/XBEE utilisent les consommations brutes, jamais la somme des points cumulés.

Tests : addition journalière, frontière mensuelle à zéro, absence de report du cumul entre mois, 29 février, mois sans données, mois partiel, étiquettes des totaux mensuels et invariance des totaux annuels. Contrôle du rendu PDF et build de production. Aucune migration ni dépendance supplémentaire.
