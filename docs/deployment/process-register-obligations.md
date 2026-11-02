# Radar — objectifs des exercices et registres obligatoires

La migration `20261102074236_process_exercise_monthly_performance.sql` ajoute un RPC de lecture `emergency_exercises_performance(target_year)` : un seul appel renvoie les comptes mensuels autorisés, utilisables pour le global et chaque unité. Le RPC ne retourne ni contenu de DPR ni donnée clinique.

## Exercices

L’objectif est **un exercice de protection contre l’incendie et un exercice d’évacuation/abandon du navire, par personne et par mois**. Les deux critères ont le même poids. Plusieurs exercices de même catégorie dans un mois ne compensent pas une autre catégorie ou un autre mois : chaque obligation rapporte au maximum un point.

Seuls les **mois clos** entrent dans la note. Le mois courant apparaît dans les actions « à organiser » avec une échéance au dernier jour du mois ; ses absences ne sont pas marquées en retard. Les mois futurs ne sont pas comptés. Sans mois clos exigible, la note reste non applicable.

La population est celle des navigants autorisés encore en emploi à la date courante Paris. L’emploi courant et l’éligibilité mensuelle utilisent toutes les périodes d’emploi, avec repli sur les dates historiques. Une réembauche future déjà enregistrée ne fait pas disparaître une période qui couvre encore la date courante. Les mois avant embauche, après départ ou dans une interruption sont exclus. Une présence en Planning confirmée, recoupant au moins un jour d’emploi dans le mois, est nécessaire ; les affectations annulées ou provisoires ne créent pas d’obligation.

Le périmètre compagnie déduplique les mois-personnes présents sur plusieurs navires. Une participation réelle à un DPR soumis ou validé, non supprimé, satisfait l’objectif personnel du mois, même sur une autre unité autorisée. Le détail d’une unité mesure uniquement les participations sur cette unité et les mois-personnes effectivement affectés à celle-ci : le global n’est donc pas une somme des pourcentages d’unités. Les doublons de fonctions d’un même équipier dans un DPR ne multiplient pas la participation.

Les mêmes gardes de module, compagnie et identités autorisées que le registre existant s’appliquent. Un Marin reste limité à ses comptes personnels ; un Capitaine à sa bordée autorisée. Pour les profils terrain, une unité hors de la fenêtre de lecture autorisée est exclue : son éligibilité n’est pas supposée et aucune absence n’est inventée.

## LSA, levage et remorques

Un registre LSA absent sur un navire actif autorisé vaut **0**, avec une action « Registre LSA à renseigner ». Les pourcentages sont calculés par navire avant agrégation, afin qu’un gros inventaire renseigné ne masque pas un navire sans registre. Les dates inconnues valent zéro pour la traçabilité, sans affirmer que les équipements sont périmés. Une source inaccessible reste indisponible ; un bureau/quai sans obligation reste non applicable.

Les **apparaux de levage** et le **registre des remorques** forment désormais deux processus indépendants sous la permission existante du module Levage. Ils partagent la même lecture de l’inventaire. Un registre de remorques absent sur un navire autorisé vaut **0**, même si les apparaux du navire sont à jour. L’absence d’apparaux identifiés peut rester non applicable. Les actions ouvrent les sous-menus existants `apparaux` et `remorques`.

Le registre médical est retiré du radar. Son module, ses droits et ses données ne changent pas. Aucun contenu clinique n’est interrogé pour ces indicateurs.

## Vérification et livraison

`exercise_monthly_performance_test.sql` teste les cinq profils réels, le tenant, les fenêtres de lecture, la confidentialité du module, la déduplication et les réembauches. Toutes les données de test sont transactionnelles et annulées. Cette suite est ajoutée aux assertions SQL de la CI profils. Les tests frontend couvrent le mois courant, les limites 0–100, les deux objectifs, les registres absents, les axes séparés et le cache réutilisé.

Le RPC est additionnel et doit être appliqué avant le déploiement du frontend qui le consomme. Aucun repli vers des requêtes par personne/navire n’est effectué si le RPC est indisponible : le radar indique alors l’indisponibilité du processus.
