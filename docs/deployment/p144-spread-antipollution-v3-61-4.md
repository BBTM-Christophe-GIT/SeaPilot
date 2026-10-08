# P144 — quantité du Spread Antipollution (v3.61.4)

Pour la prestation **Spread Antipollution** du projet **P144**, le nombre d’unités est le nombre de jours calendaires du mois de facturation moins le nombre de dates distinctes portant un DPR **24/24 Weather Stand-by**. Les journées Crew Change, Stand-by, maintenance et sans DPR restent comptées. Un doublon d’un DPR météo ne soustrait pas deux fois la même journée.

Septembre 2026 : 30 jours − 1 journée météo = **29 unités**. Au tarif de 92,58 € HT, le Spread Antipollution représente **2 684,82 € HT**.

Le calcul s’applique aux lignes nouvelles et déjà enregistrées, au relevé affiché, à l’enregistrement de la prestation et au PDF/ZIP généré. Une ancienne quantité de 28 est recalculée à l’ouverture et à l’export ; elle est enregistrée avec le nouveau résultat lors de l’action Enregistrer. La quantité est en lecture seule pour cette prestation de P144. Les autres projets et catégories conservent leur saisie manuelle.

La sélection de lignes de loyer ou leur exclusion du PDF ne change pas cette règle mensuelle. Pour un export limité à une partie du mois, les DPR de tout le mois sont chargés pour compter les journées météo, tandis que la liste et le PDF des opérations restent limités à la période choisie. Les mois de 28, 29, 30 et 31 jours sont pris en charge.

Aucune migration ni modification directe de données de production n’est nécessaire. La génération du PDF recalcule également la quantité pour couvrir les appels utilisant des lignes enregistrées anciennes. Les PDF déjà exportés doivent être générés à nouveau.

Validation : règle mensuelle, DPR manquant, doublon météo, limites de mois, exclusion du loyer, période partielle, ligne existante à 28, montant HT, enregistrement, export et conservation des quantités des autres catégories/projets. Le PDF de recette est produit à partir de fixtures, sans créer de facture ou document réel.
