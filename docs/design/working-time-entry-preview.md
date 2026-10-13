# Préversion de saisie du temps de travail

Cette préversion autonome est disponible à `/previews/working-time.html` (et à
`/previews/working-time` sur Vercel). Elle utilise les composants SeaPilot, le
tableau de saisie existant et des personnes fictives. Aucune requête réseau,
écriture Supabase ou modification des politiques de production n'est effectuée.
Les données et les seuils restent en mémoire jusqu'au rechargement de la page.

## Essai proposé

L'exemple du 13 octobre 2026 comporte une période enregistrée de 06:00 à 12:00
et une sélection de 13:00 à 20:00. Le cumul de 13 heures sur la fenêtre glissante
du 12 octobre à 20:00 au 13 octobre à 20:00 dépasse le seuil de 12 heures :
le repère apparaît à 19:00 et la bande d'écart couvre 19:00–20:00. Les valeurs
sont recalculées dès la saisie, sans attendre la recommandation asynchrone.
Le total de la journée et le cumul glissant sont affichés séparément.

Dans **Conformité → Modifier les seuils**, huit paramètres sont réglables :

- travail maximal sur 24 heures et sur sept jours ;
- repos minimal sur 24 heures et sur sept jours ;
- repos continu minimal ;
- nombre maximal de périodes de repos ;
- intervalle maximal entre repos ;
- amplitude maximale de la journée.

Passer le travail maximal de 12 à 14 heures supprime l'écart de l'exemple sans
modifier ses heures. Le nombre de périodes peut être augmenté pour essayer un
fractionnement prévu par un accord collectif. Les seuils initiaux sont
respectivement 12 h, 84 h, 10 h, 77 h, 6 h, 2 périodes, 14 h et 14 h. Ils sont
illustratifs et ne constituent pas une sélection automatique du régime applicable.
Le coefficient **congés/repos demeure 1,05** et ne fait pas partie des réglages.
La moyenne de 11 heures nécessite un cycle défini : elle n'est pas transformée
en plafond quotidien dans cet essai.

## Calculs et couverture

Les périodes qui se chevauchent sont fusionnées pour la projection. Les contrôles
du repos total, du repos continu et du fractionnement sont distincts. Une période
de repos de six heures ne remet pas le cumul de travail à zéro. Les fenêtres
glissantes de 24 h et de 168 h se terminent à la dernière période sélectionnée,
ou à la dernière période enregistrée du jour lorsqu'il n'y a pas de sélection.
La frise utilise l'horloge locale ; les calculs glissants utilisent le temps écoulé.

Le jeu fictif atteste une couverture du 6 octobre à 00:00 au 14 octobre à 00:00.
En dehors de ces bornes, les règles restent « À confirmer » ; les jours sans
donnée ne sont pas déclarés conformes par défaut. Le contrôle porte sur la fenêtre
affichée, pas sur toutes les fenêtres possibles du registre. Le moteur de politique
et les RPC de production restent les autorités pour les vrais comptes.

## Parcours disponibles

La sélection de plusieurs périodes, le clavier, le brouillon, la correction,
le retrait motivé, la navigation jour/mois et le choix d'un membre de l'équipage
fonctionnent en mémoire. La soumission d'une journée avec écarts demande une
justification complète ; la validation n'efface pas les écarts. La réouverture
historise les signatures de démonstration précédentes. Les retraits conservent
la période et son motif avec une identité distincte.

L'import XLSM réutilise le parseur local SeaPilot et propose les lignes valides au
brouillon ; les journées signées restent verrouillées. Les signatures sont des
états d'essai, sans portée réelle. Cet écran ne sert pas à vérifier les droits
Marin/Capitaine : ces droits se vérifient dans le code, les RPC/RLS et les fixtures
des vrais profils.

## PDF

Les deux exports de la préversion reçoivent uniquement les périodes enregistrées,
leurs commentaires et les états/signataires courants. Les périodes en attente,
les seuils, les diagnostics, les repères rouges et les bandes d'écart ne leur sont
jamais transmis. Les commentaires réellement saisis restent exportés. Les exports
du module de production ne changent pas. Les heures du PDF représentent les plages
de l'horloge locale et le temps hors plages n'est pas présenté comme un repos attesté.

## Développement et vérification

Utiliser pnpm 10.34.5 via Corepack : `corepack pnpm dev --host 127.0.0.1 --port 5192
--strictPort`, puis ouvrir `http://127.0.0.1:5192/previews/working-time.html`.
La page dispose de son entrée Vite ; les réécritures Vercel précèdent celle de la SPA.
Aucune migration, dépendance ou variable d'environnement nouvelle n'est nécessaire.

Vérifications : suite du module temps de travail, lint des fichiers modifiés,
compilation TypeScript et build de production ; contrôles navigateur desktop
1440 × 1024 et mobile 390 × 844, changement de seuils, conservation des heures,
console sans erreur et absence de débordement horizontal de la page.
Le rapport de comparaison visuelle est conservé dans `design-qa.md` à la racine.
