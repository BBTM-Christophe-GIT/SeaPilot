# RH / Brevets — cohérence des effectifs et sorties v3.6.14

Cette version harmonise l'effectif affiché, la courbe d'évolution et les
indicateurs de sorties autour des dates d'embauche et de départ.

## Population de référence

Une personne est comptée dans l'effectif à la date `J` si :

- sa date d'embauche est renseignée et antérieure ou égale à `J` ;
- sa date de départ est absente ou strictement postérieure à `J`.

Le statut technique `active` ne pilote plus le calcul. Une embauche future ou
une fiche sans date d'embauche n'est donc pas incluse dans l'effectif courant.
Un ancien collaborateur doit disposer d'un intervalle de dates cohérent :
embauche renseignée, départ postérieur ou égal à l'embauche et déjà intervenu.

Cette même règle alimente la liste **En poste**, les cartes d'effectif et les
courbes annuelles ou mensuelles.

## Catégories exclusives

Chaque personne présente appartient à une seule catégorie, selon la priorité
suivante :

1. **Stagiaires** ;
2. **Sédentaires**, hors stagiaires ;
3. **Navigants**, hors sédentaires et stagiaires.

La somme des trois cartes est ainsi toujours égale à l'effectif RH.

## Deux indicateurs distincts

Le panneau du graphe affiche maintenant :

- le **Turnover CDI**, soit les départs de personnes en CDI divisés par
  l'effectif CDI moyen quotidien de la période ; les stagiaires sont exclus ;
- le **Taux de sorties tous contrats**, soit tous les départs divisés par
  l'effectif total moyen quotidien de la même période.

Pour le mode 12 mois, la période commence un an avant la date du jour. La borne
de début est exclue des départs et la borne de fin est incluse. L'effectif moyen
est calculé à partir de chaque journée de la période, bornes incluses, et non
plus à partir de la simple moyenne des effectifs de début et de fin.

Un départ n'entre dans le numérateur que si ses dates d'embauche et de départ
forment un intervalle valide. Il appartient ainsi à la même population que le
dénominateur.

## Détail et qualité des données

Le bouton **Voir le détail** présente les sorties :

- par type de contrat ;
- par cause de départ.

Les anciennes valeurs `Démissions` sont regroupées avec `Démission`. Un
avertissement signale le nombre de fiches sans type de contrat afin que les
données à compléter soient visibles sans fausser silencieusement le turnover
CDI.

## Valeurs de contrôle au 24 juillet 2026

Sur les données de production auditées avant livraison :

- effectif RH : **21** = 5 sédentaires + 16 navigants + 0 stagiaire ;
- turnover CDI 12 mois : **11,6 %** = 2 départs / 17,28 personnes en moyenne ;
- sorties tous contrats 12 mois : **82,2 %** = 18 sorties / 21,89 personnes en moyenne.

Ces valeurs servent de contrôle fonctionnel après déploiement. Elles évoluent
naturellement dès qu'une date, un contrat ou une cause de départ est modifié.
