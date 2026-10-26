# Mesures météo après l’ETA

## Comparaison dans la fiche enregistrée

Le chapitre Passage Plan affiche une carte par waypoint après le premier
enregistrement. Elle utilise exclusivement `record.draft`, indépendamment de
la saisie non enregistrée. Un message identifie la dernière version sauvegardée
lorsque le formulaire a été modifié.

Un brouillon affiche « Prévisions du brouillon » et « Non signé » ; la recherche
des mesures n’est annoncée qu’après la signature et le passage. Une fiche signée
affiche « Données prévues à la signature du Capitaine », uniquement avec une
capture compatible consultée avant sa signature. Les mesures restent une
annexe distincte, avec leur heure effective et la distance de la station.
Une indisponibilité de lecture est distinguée de l’absence de mesures.

Les trois métriques sont Hs, période et vent moyen, sans rafales. Houle / mer
totale, période moyenne / de pic et hauteur instrumentale du vent ne sont pas
assimilées. Les sources, stations, licences et précisions restent disponibles
dans les détails repliables. La relecture des mesures enregistrées reste
accessible aux comptes réels autorisés sur une fiche en lecture seule.

La saisie ETA garde le mois visible dans un calendrier compact, avec deux
sélecteurs heures/minutes et une validation complète par Appliquer. Aucun
changement partiel n’invalide les captures avant cette validation. Les cibles
des jours font 32 px sur ordinateur et 44 px au pointeur tactile. Une fiche en
lecture seule présente directement son ETA et le mode UKC sans commandes de
modification. Ces adaptations concernent l’écran ; les exports sont conservés.

Les minutes proposées avancent de cinq en cinq (00, 05, …, 55). Une minute
historique hors pas reste affichée avec la mention « actuelle » et ne change
pas automatiquement, y compris à l’ouverture ou à la validation sans édition.
La valeur UKC automatique s’affiche une seule fois dans une pilule accessible,
sur une barre dédiée ; ses hypothèses et sources restent dans les détails.

## Conservation et collecte

Les mesures officielles sont enregistrées séparément des prévisions conservées
à la validation du Capitaine. Elles ne remplacent pas la copie signée et ne sont
jamais reconstituées avec une prévision, une analyse de modèle, une réanalyse ou
une interpolation. Une station voisine reste identifiée comme telle : la mesure
ne devient pas une observation faite par le navire au waypoint.

## Sources publiques vérifiées le 23 octobre 2026

### Météo-France — observations des bouées ancrées

- [Catalogue officiel et licence](https://www.data.gouv.fr/datasets/archives-annuelles-des-observations-bouees).
- [Description officielle des observations in situ](https://confluence-meteofrance.atlassian.net/wiki/spaces/OpenDataMeteoFrance/pages/888143886/Observations%2Bin%2Bsitu).
- [Spécification des champs, juin 2026](https://static.data.gouv.fr/resources/archives-annuelles-des-observations-bouees/20260701-093527/observations-descriptif-technique-donnees-bouees-20260630.pdf).
- [Stations officielles](https://static.data.gouv.fr/resources/archive-observations-bouees/20260416-154543/observations-liste-postes-bouees-20251217.csv).
- [Documentation de l’API tabulaire data.gouv.fr](https://www.data.gouv.fr/dataservices/api-tabulaire-data-gouv-fr-beta).

L’archive annuelle est publiée gratuitement sous Licence Ouverte 2.0. Le serveur
découvre la ressource `marine_<année>` dans le catalogue et interroge sa copie
officielle via `tabular-api.data.gouv.fr`, avec filtres de date/heure et de
coordonnées, sélection des seules colonnes utiles et 50 lignes maximum. Il ne
télécharge pas le fichier annuel CSV compressé à chaque waypoint. Aucun compte
API ou abonnement n’est nécessaire pour cette voie publique. Cette API est en
bêta ; une panne reste une absence temporaire de mesures.

Le fichier annuel observé le 23 octobre était actualisé quotidiennement et
contenait les observations jusqu’au 22 octobre à 23:00 UTC. La disponibilité est
contrôlée à chaque collecte : aucune mesure n’est promise dès que l’ETA passe.

Les champs sont : `validity_time` (instant réel de mesure, avec son décalage UTC),
`lat`, `lon`, `geo_id_wmo`, `name`, `ff` (vent moyen sur 10 minutes en m/s), `dd`
(direction en degrés), `haut_vag` (hauteur significative H1/3 de la **mer totale**,
m), `per_moy_vag` (période **moyenne**, s), `dir_vag` (direction moyenne, degrés).
Le vent est converti de m/s en nœuds. La hauteur de l’anémomètre n’étant pas
fournie par observation, elle reste inconnue ; cette mesure n’est pas présentée
comme un vent mesuré à 10 m. Les valeurs H1/3/Tm ne deviennent pas SHS/Tp de houle.
Cette archive ne contient pas de code qualité par champ : la qualité enregistrée
est `not_provided`, sans lui attribuer artificiellement le statut « good ».

La liste actuelle contient dix bouées, principalement en Méditerranée, plus
Gascogne et Antilles. Elle ne couvre donc pas toute la Manche ni le sud de
l’Angleterre. Les coordonnées de découverte proviennent de la liste officielle ;
les coordonnées réelles de chaque observation sont à nouveau contrôlées.

### Met Office — UK Marine Observations

- [Documentation officielle Met Office](https://www.metoffice.gov.uk/binaries/content/assets/metofficegovuk/pdf/services/data/pdf-documentation_met-office-uk-marine-observations-on-asdi.pdf).
- [Canaux officiels de diffusion](https://www.metoffice.gov.uk/services/data/external-data-channels).
- [Catalogue officiel du producteur et accès public](https://registry.opendata.aws/met-office-uk-marine-observations/).
- [Observations et unités affichées par le Met Office](https://weather.metoffice.gov.uk/specialist-forecasts/coast-and-sea/observations).
- [Licence CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Les fichiers horaires sont accessibles sans compte AWS ni clé dans le bucket
public `met-office-marine-observations-data`, région `eu-west-2`. La rétention
annoncée est de sept jours glissants. La diffusion est horaire à H+15 ; par
exemple, la livraison 09:15 contient les mesures produites entre 08:00 et 08:59.
Le véritable champ `timestep` reste la référence, jamais l’heure du dossier S3.
Une observation retardée peut être complétée par le producteur dans les 24 h.

Le serveur répertorie un seul préfixe horaire, puis télécharge au maximum les
trois stations fixes pertinentes les plus proches. La découverte couvre les
bouées Brittany, Channel Test, E1, K1, K2, L4, PAP et les bateaux-feux F3,
Greenwich, Sandettie et Seven Stones. Les navires mobiles sont exclus pour ne pas
associer leur position actuelle à une mesure passée. Les stations/positions sont
vérifiées contre les CSV officiels du 23 octobre 2026 puis contre les coordonnées
réelles de chaque réponse.

Le CSV utilise `|` comme séparateur. Les champs `*_qc` sont eux-mêmes du JSON,
par exemple `{"good": []}`. Une valeur n’est utilisée que si son propre code ne
contient que `good`. `suspect`, `erroneous`, champ vide, JSON invalide ou contrôle
absent restent indisponibles indépendamment des autres champs.

La houle utilise `significant_wave_height_hm_0_swell`, `wave_peak_period_swell`
et `wave_peak_direction_swell` : Hs spectral, période **de pic** et direction de
pic. À défaut de partition houle, la **mer totale** peut être enregistrée avec sa
composante distincte : `significant_wave_height_hm_0`, `..._h_third` ou
`..._heave`, et période moyenne `wave_mean_period_tm_02`, `..._tz` ou `..._heave`.
Une période de pic totale n’est utilisée qu’avec `periodKind: 'peak'`.

La documentation publique du CSV ne précise pas l’unité de
`wind_speed_marine`. Cette vitesse n’est donc pas convertie ni enregistrée sous
une unité supposée. Seule la direction mesurée et contrôlée peut être conservée,
avec vitesse et hauteur d’instrument inconnues. Il faudra une référence du
producteur confirmant l’unité avant d’activer la vitesse du vent de cette source.

Les mesures diffusées par le Met Office sont © Crown copyright, Met Office,
sous CC BY-SA 4.0. Cette licence permet l’usage commercial avec attribution,
lien vers la licence, indication des modifications et conservation de la licence
sur les données adaptées distribuées. Chaque composante enregistrée conserve
source, licence et qualité ; les affichages/exports doivent les attribuer. La
sélection, la mise en forme et l’éventuelle conversion sont des modifications
explicites des données d’origine ; elles ne constituent pas une mesure nouvelle.

## Bornes et traçabilité

`loadSeaOperationWeatherObservations` reçoit `{pointId, latitude, longitude,
etaUtc}`. `ObservationResult` expose séparément vent et état de mer avec la
station, ses coordonnées, la distance au waypoint, l’heure réelle de mesure, la
source, la licence, la qualité et l’heure d’enregistrement. Le champ `component`
distingue houle/mer totale et `periodKind` pic/moyenne.

Une composante doit être située à **50 km maximum** et **30 minutes maximum**
de l’ETA, et sa mesure doit déjà être passée. Ces bornes de rapprochement ne sont
pas une garantie de représentativité locale ni une incertitude instrumentale.
Une donnée manquante reste vide, jamais zéro. Aucune rafale n’est collectée dans
le résultat métier. Une réponse partielle reste partielle et peut être retentée.

Les catalogues sont limités à 2 Mo (Météo-France) / 256 Ko (S3), la réponse
tabulaire à 256 Ko et chaque CSV à 64 Ko. Les URL sont construites à partir des
origines officielles et de ressources validées ; les redirections, entités XML
et objets S3 non conformes sont refusés. Les requêtes ont un délai de 12 s et un
cache partagé borné de dix minutes (catalogue annuel : une heure). Les requêtes
identiques simultanées sont regroupées. Une erreur n’est pas conservée dans le
cache. L’annulation d’un écran n’annule pas un téléchargement partagé.

`pending` signale une publication attendue ou un service temporairement
indisponible ; `unavailable` signale l’absence de mesure exploitable dans les
bornes ; `recorded` peut contenir une seule composante ou des champs partiels.
Ces statuts ne modifient ni GO/NO GO ni la décision/signature du Capitaine.
