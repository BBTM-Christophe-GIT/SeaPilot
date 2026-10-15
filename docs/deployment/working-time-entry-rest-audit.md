# Saisie, sauvegarde et validation des heures

## Sélection effectivement enregistrée

La sélection soumise par la grille est la source des phases à enregistrer. Une sélection au clavier ou un glissé interrompu avant la création d’une puce de période doit être sauvegardé exactement comme la période analysée. Le brouillon ne peut pas annoncer un succès sans avoir enregistré une sélection non vide ; la soumission de la journée attend la sauvegarde des nouvelles phases. La soumission ou l’approbation de périodes déjà enregistrées reste possible sans nouvelle phase.

Le glissé suit la position réelle du doigt ou de la souris, y compris pendant la capture du pointeur. Une sélection tactile de quatre heures ne peut plus être réduite au premier créneau de trente minutes. Le relâchement hors de la grille termine le geste ; un survol ultérieur ne prolonge pas la période. Une annulation du geste restaure la sélection précédente.

Pendant l’enregistrement, les sélections, corrections, retraits de périodes et champs de justification sont verrouillés pour conserver le contenu envoyé. Les gardes de contexte et de double soumission restent appliquées. Une réponse tardive ne suit pas un autre collaborateur ou une autre journée.

## Repos continu et repos sur 24 heures

La règle confirmée le 15 octobre 2026 exige le repos total minimum sur 24 heures **et** un repos continu atteignant le minimum configuré. Pour la politique BBTM, il faut au moins **10 heures de repos sur 24 heures, dont 6 heures consécutives**. Les autres périodes de repos peuvent être séparées par des périodes de travail. Six heures consécutives avec seulement 7 h 30 de repos au total ne suffisent pas : le motif `rest_24h` reste justifié. Inversement, 10 heures cumulées avec seulement 5 h 59 continues ne remplissent pas le contrôle de repos consécutif.

Le modèle des journées de calcul conserve sa version 4 : travail des journées pertinentes, repos consécutif, travail et repos sur sept jours, fractionnement, nuit, amplitude et intervalle maximal entre repos restent contrôlés. Le cumul et le repos consécutif restent deux composants indépendants ; le verdict global exige leur conformité. Les calculs enregistrés, les recommandations simples et multiphases et leurs recherches de reprise doivent appliquer les mêmes seuils.

Aucune migration de règle ou réconciliation des alertes n’est nécessaire pour cette livraison : la règle serveur existante respecte ces deux conditions. Les heures, registres, signatures, approbations et instantanés de validation restent conservés.

## Recette et limites

La recette distingue les identités Marin, Capitaine, Admin, Armement et Direction et leurs droits effectifs. Elle couvre les périodes disjointes, brouillons, corrections, soumissions, validations avec et sans capitaine Planning, écarts à justifier et journées déjà validées. Les erreurs de calcul ou d’enregistrement, les doubles clics et les changements de contexte sont vérifiés.

Les transactions SQL de mutation utilisent des profils synthétiques dans une base locale et sont annulées. Les contrôles des comptes réels en production sont des lectures ; aucune journée réelle n’est créée ou signée pour la recette. Les essais navigateur de saisie utilisent un serveur et des données synthétiques, sur ordinateur et en émulation mobile. Ils ne constituent pas des essais sur tous les téléphones physiques.

Une signature de profil absente est un prérequis à compléter par son titulaire, et ne doit jamais être contournée ou fabriquée par l’audit. La consultation et la sauvegarde d’un brouillon restent distinctes de la signature et de l’approbation.

Vérifications reproductibles :

```powershell
corepack pnpm test src/features/workingTime --pool=threads --maxWorkers=1
corepack pnpm build
```

La suite du module comporte **173 tests**. Les nouvelles régressions couvrent la sélection transmise par la grille, sa sauvegarde avant soumission, les contrôles verrouillés pendant une écriture, la capture tactile et les gestes terminés hors de la grille ou annulés.
