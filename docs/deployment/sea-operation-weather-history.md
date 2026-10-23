# Prévisions signées et mesures météo après passage

La fiche signée conserve les prévisions que le Capitaine a validées, avec leur
date de consultation et l'heure de signature. Une mesure collectée après le
passage appartient à une annexe distincte : elle ne remplace jamais la prévision,
la décision, le JSON signé, sa version, sa signature ou ses dates d'audit.

## Migration et configuration

- Migration : `20261023125817_sea_operation_weather_observations.sql`.
- Appliquer et vérifier cette migration avant d'activer le nouveau worker.
- Configurer dans **Vercel Production** `SUPABASE_URL` et une clé serveur
  `SUPABASE_SECRET_KEY` ou `SUPABASE_SERVICE_ROLE_KEY`, déjà employée par les
  opérations serveur documentaires. Ne jamais utiliser de préfixe `VITE_` pour
  cette clé.
- Ajouter `CRON_SECRET`, une valeur aléatoire forte, exclusivement côté serveur.
  Vercel transmet `Authorization: Bearer <CRON_SECRET>` au cron. Ne pas placer la
  valeur réelle dans Git, une URL ou les journaux.
- Aucune clé Météo-France, Met Office ou abonnement météo n'est nécessaire pour
  ces archives publiques. Aucun appel de réanalyse ne complète une mesure absente.
- `vercel.json` programme `GET /api/sea-operation-weather-observations` chaque jour
  à **09:30 UTC**. Cette cadence est compatible avec un cron quotidien ; le
  passage à une cadence plus fréquente doit tenir compte du plan Vercel.

Le déploiement ne crée aucune requête météo historique dans le navigateur.
`POST` et les autres méthodes reçoivent 405. Un appel sans le secret exact ne
peut ni lire la file ni interroger un fournisseur. Ne pas utiliser un vrai jeton
Capitaine pour tester l'accès privilégié au worker.

## Collecte et disponibilité

La transition réelle `draft → signed` crée un travail par waypoint possédant
latitude, longitude et ETA date/heure interprétable en heure de Paris. Les points
futurs sont également mis en file. Les anciennes ETA ne contenant qu'une heure
sont exclues : leur date ne peut pas être inventée.

Un point devient éligible une heure après son ETA, au prochain passage quotidien
du cron. La cadence quotidienne peut ajouter jusqu'à 24 heures de délai, même si
une mesure britannique est déjà publiée. Les archives officielles peuvent être publiées avec
retard. Une tentative sans donnée reste explicite et sera renouvelée chaque jour,
pendant une fenêtre de **sept jours après l'ETA**. Les relances deviennent
éligibles après 23 heures, ce qui réserve une heure de marge avant le cron du
lendemain et évite qu'un décalage de quelques secondes produise un délai de 48 h.
Une fois la fenêtre expirée,
les mesures déjà acquises sont conservées et les absences restent signalées.
La migration initialise aussi les annexes des fiches déjà signées, sans les
modifier ; une ETA trop ancienne sera indiquée indisponible.

Les sources sont les observations publiques de bouées **Météo-France** et les
observations marines du **Met Office**. Chaque composante conserve station,
coordonnées, distance au waypoint, instant mesuré, source, licence et information
de qualité disponible. La station doit être à **50 km maximum** et l'observation
à **30 minutes maximum** de l'ETA. Une mesure à proximité ne décrit pas
nécessairement les conditions exactes au waypoint.

Le vent mesuré ne devient pas automatiquement un vent standard à 10 m. La hauteur
instrumentale est conservée lorsqu'elle est connue. Une hauteur, une période ou
une direction de houle manquante reste absente. L'état de mer total mesuré est
identifié comme tel et n'est pas assimilé à la seule houle MFWAM de la prévision.
Les rafales ne sont pas ajoutées.

Une composante partielle reste visible et continue d'être recherchée jusqu'à la
fin de la fenêtre. Une nouvelle tentative ne supprime pas une composante déjà
mesurée. Pour la même source, la même station, le même instant et la même hauteur
instrumentale — ou, pour la houle, la même composante et le même type de période —
seuls les champs encore absents peuvent être complétés. Sinon, seul un composant
plus complet peut remplacer son prédécesseur. Les mesures de stations ou d'heures
différentes ne sont pas fusionnées dans un même composant. Quand les deux
composantes sont complètes, le travail est terminé.

## Droits et limites

`sea_operation_private.weather_observations` est une table privée avec RLS, sans
accès direct pour `anon`, `authenticated` ou le worker. La lecture passe par
`sea_operation_weather_observations(p_id uuid)` et reprend exactement
`sea_operation_private.can_read(company_id)` : appartenance active, société active,
profil réel autorisé et permission du module. Le résultat est
`{ operationId, points: ObservationResult[] }`. Le détail et l'overview existants
des opérations restent inchangés.

Seul `service_role` peut appeler les RPC de réservation et de résultat. Les
coordonnées, l'ETA et le point proviennent de la fiche signée, jamais d'une URL ou
d'un corps de requête utilisateur. Une réservation possède un identifiant unique,
expire après cinq minutes au maximum et ne peut être consommée qu'une fois.
Une réponse retardée ne peut écraser une réservation plus récente. Le serveur et
la base vérifient identité, coordonnées, dates, sources et bornes des mesures.

Chaque passage traite au plus **40 waypoints**, avec une répartition de **30
premières recherches et au moins 10 relances** quand les deux files sont remplies.
Les places non utilisées par un groupe sont réattribuées à l'autre, dans la même
limite de 40. Les relances partielles ne peuvent ainsi occuper toute la capacité
lorsque de nouveaux points attendent. Le worker utilise au plus **deux recherches
simultanées** et un budget de travail de **45 secondes** dans une fonction limitée
à 60 secondes. Les réservations différées seront reprises après expiration de
leur bail. Les RPC appliquent également la limite de 40 et les index de file
évitent de parcourir les annexes déjà terminées. Les expirations sont traitées
par lots bornés. Cette répartition garantit une capacité aux deux files, sans
augmenter le plafond quotidien de 40 ; surveiller le volume avant d'étendre
la cadence ou la capacité.

La réponse du cron contient uniquement les compteurs de travaux réservés,
enregistrés, en attente, indisponibles, différés, en erreur ou devenus obsolètes.
Elle n'expose ni clé ni nom de personne. Une panne temporaire de fournisseur ne
doit pas être présentée comme une valeur météo réelle.

## Vérification

- `seaOperationWeatherObservationsGateway.test.ts` : authentification du cron,
  absence de configuration, sources invalides, réponse d'un autre point,
  panne fournisseur/base, bail obsolète, budget et concurrence.
- `supabase/tests/sea_operation_weather_observations_test.sql` : comptes réels des
  cinq profils, isolation entre sociétés, signature Capitaine, mise en file passée
  et future, idempotence, baux, garde des sources, relances partielles, expiration
  et invariance exacte de la ligne signée. Le test termine par `ROLLBACK`.
- Après déploiement, vérifier la version et le commit exacts, la présence du cron
  et le refus 401 sans secret. Un appel de collecte authentifié en production
  écrit des annexes réelles : ne pas le lancer comme simple smoke test.

Validation de la livraison 3.77.15 : la migration serveur
`20261023125817` est appliquée. Les 60 assertions SQL ont également été
exécutées dans la base déployée avec des helpers temporaires, sous
`BEGIN/ROLLBACK` (pgTAP n'y est pas installé). Aucun utilisateur, société, navire
ou dossier de recette ne subsiste ; l'empreinte de la fiche signée existante
est inchangée. Les contrôles de sécurité ne signalent aucun nouvel avertissement
ni erreur ; l'information « RLS sans politique » de l'annexe privée est attendue,
puisque tout accès direct est révoqué et que seules les RPC contrôlées y accèdent.

La recette visuelle utilise une fixture de compte Capitaine distincte, sans
simulation d'une session administrateur et sans données réelles : lecture d'une
fiche signée, distinction prévision/mesures, bouton de relecture actif et absence
de débordement des cartes à 390 px. Les exports ont été rendus avec le modèle
Word d'origine, y compris les libellés longs, stations, horaires et licences.
