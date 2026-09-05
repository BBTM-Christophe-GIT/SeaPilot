# Rapport RSE : lisibilité du fuel et impact XBEE — v3.29.4

Le rapport « RSE — consommations par projet » affiche les douze mois en toutes lettres sur le graphique journalier de fuel. La zone reste de 142 × 43 mm. Le trait et les points sont affinés, le quadrillage est léger. Les années sélectionnées sont superposées sur un calendrier commun janvier–décembre et identifiées dans la légende.

Chaque valeur journalière additionne le champ `dpr_daily_metrics.fuel_consumed_liters` des DPR du périmètre, puis divise le résultat par 1 000. Une date sans DPR reste vide ; une consommation saisie à zéro est représentée à zéro. Le calendrier conserve le 29 février des années bissextiles. Les totaux annuels restent calculés directement à partir des DPR filtrés par année, navire et projet.

L'ancien encart « Méthode de calcul » est remplacé par une carte verte « Impact environnemental · XBEE » présentant dynamiquement les émissions après réduction XBEE, la réduction obtenue et les émissions théoriques sans additif. Les chiffres de l'exemple utilisateur ne sont pas enregistrés dans le code. Les calculs utilisent les paramètres environnementaux versionnés de Supabase : facteur direct MDO et taux de réduction XBEE. Sans paramètres, le rapport conserve l'avertissement de données manquantes.

Aucune migration ni nouvelle dépendance. Le logo conserve ses dimensions et son ratio ; le PDF ne porte pas le nom du produit.

Vérification : tests du calendrier, année bissextile, jours absents, zéros réels, cumuls multiannuels et disponibilité des paramètres ; génération et inspection visuelle du PDF A4 ; tests KPI et build de production.
