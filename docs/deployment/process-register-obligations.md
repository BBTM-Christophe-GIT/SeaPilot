# Radar — objectifs des exercices et registres obligatoires

La migration `20261102074236_process_exercise_monthly_performance.sql` ajoute le RPC de lecture `emergency_exercises_performance(target_year)`. La migration `20261102093000_process_exercise_crew_obligations.sql` étend sa réponse en version 2 : catalogue des exercices obligatoires, participations par personne/mois et effectifs quotidiens agrégés par navire. Un seul appel alimente le global et chaque unité ; aucun contenu de DPR, détail d’absence ou donnée clinique n’est retourné.

## Exercices

L’objectif est **un incendie et un abandon par marin et par mois**, dès un jour de présence à bord. **Chaque autre exercice actif est exigé une fois par marin sur une période fixe de deux mois** : janvier–février, mars–avril, mai–juin, juillet–août, septembre–octobre, novembre–décembre. Une journée de présence dans la période suffit à créer l’obligation. Chaque obligation rapporte au maximum un point ; plusieurs participations au même exercice ne compensent pas un autre exercice, une autre période ou un autre marin.

La note est le nombre d’obligations **closes** remplies divisé par le nombre d’obligations closes attendues. Le poids affiché de chaque catégorie correspond à sa part de ces obligations, et le score final est calculé sur les comptes avant arrondi. Les périodes ouvertes génèrent des actions avec une échéance au dernier jour du mois ou du bimestre ; elles ne dégradent pas la note avant cette échéance. Les mois futurs sont exclus. Sans obligation close exigible, la note reste non applicable. Les **TBT sont un complément**, affichés en nombre de participations individuelles hors calcul de la conformité.

L’effectif est reconstitué **jour par jour depuis le Planning**, avec déduplication des personnes, des rotations et des remplacements. La personne embarquée est celle de la ligne d’équipage ; le capitaine responsable ne devient pas présent sans sa propre ligne. Les états quotidiens effectifs, affectations confirmées, périodes importées et absences approuvées sont rapprochés selon la priorité du Planning. Repos, terre, formation, absence et affectations annulées ou provisoires ne créent pas de présence à bord.

Seules les lignes rattachées à une personne identifiée sont retenues. Aucun rapprochement approximatif par nom ne crée une présence ni une obligation.

L’emploi est vérifié **à la date de chaque journée**, à partir des périodes d’emploi ou des dates historiques. Les jours avant embauche, après départ et pendant une interruption sont exclus ; un marin parti depuis reste compté pour les journées qu’il a effectivement effectuées dans la période observée. Les jours restants du mois courant figurent comme prévisions du Planning confirmé, afin de préparer les obligations des deux bordées ; leurs participations ne sont créditées qu’une fois déclarées, jusqu’à la date courante Paris.

Exemple : deux bordées de quatre marins sur GOURY représentent **huit marins distincts sur le mois**, normalement **quatre présents par jour**. Pour un mois où les huit sont affectés au moins un jour, il faut huit participations incendie et huit participations abandon, avec chaque marin couvert. Quatre marins répétant l’exercice ne valident pas l’autre bordée. Le détail du radar permet de choisir une date et de rapprocher les présents du jour, les personnes distinctes du mois et les journées de présence cumulées.

Le périmètre compagnie déduplique les personnes par période sur plusieurs navires. Une participation à un DPR soumis ou validé, non supprimé, n’est créditée que si la personne est présente sur ce navire à la date du DPR. Le détail d’une unité mesure uniquement ses participations et sa population affectée : le global n’est donc pas une somme des pourcentages d’unités. Les doublons de fonctions d’un équipier dans un DPR ne multiplient pas sa participation. Un navire affecté autorisé sans premier DPR conserve ses obligations à zéro réalisation.

Les mêmes gardes de module, compagnie et identités autorisées que le registre existant s’appliquent. Un Marin reste limité à ses comptes personnels ; un Capitaine à sa bordée autorisée. Pour les profils terrain, une unité hors de la fenêtre de lecture autorisée est exclue : son éligibilité n’est pas supposée et aucune absence n’est inventée.

## LSA, levage et remorques

Un registre LSA absent sur un navire actif autorisé vaut **0**, avec une action « Registre LSA à renseigner ». Les pourcentages sont calculés par navire avant agrégation, afin qu’un gros inventaire renseigné ne masque pas un navire sans registre. Les dates inconnues valent zéro pour la traçabilité, sans affirmer que les équipements sont périmés. Une source inaccessible reste indisponible ; un bureau/quai sans obligation reste non applicable.

Les **apparaux de levage** et le **registre des remorques** forment désormais deux processus indépendants sous la permission existante du module Levage. Ils partagent la même lecture de l’inventaire. Un registre de remorques absent sur un navire autorisé vaut **0**, même si les apparaux du navire sont à jour. L’absence d’apparaux identifiés peut rester non applicable. Les actions ouvrent les sous-menus existants `apparaux` et `remorques`.

Le registre médical est retiré du radar. Son module, ses droits et ses données ne changent pas. Aucun contenu clinique n’est interrogé pour ces indicateurs.

## Vérification et livraison

`exercise_monthly_performance_test.sql` et `exercise_crew_obligations_test.sql` testent les cinq profils réels, le tenant, les fenêtres de lecture, la confidentialité du module, les périodes d’emploi et les présences quotidiennes. Les données de test sont transactionnelles et annulées. Les tests frontend couvrent les deux bordées, les obligations mensuelles et bimestrielles, les frontières de période, les TBT hors score et le détail des effectifs. Les vérifications des autres registres, des axes et du cache restent conservées.

La réponse conserve les champs de la version 1 pour le frontend déjà déployé. La migration version 2 doit être appliquée avant le nouveau frontend. Celui-ci exige la nouvelle réponse : une source manquante ou invalide suspend le score, sans repli vers l’ancien calcul ni vers des requêtes par personne/navire.
