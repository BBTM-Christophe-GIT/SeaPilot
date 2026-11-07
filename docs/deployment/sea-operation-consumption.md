# Consommation après une opération en mer

Dans le registre **Opération en mer**, **Conso** ouvre le relevé de la fiche
signée. Après une navigation terminée, le capitaine signataire et les profils
bureau autorisés peuvent renseigner les heures et minutes, la vitesse moyenne
en nœuds, la jauge de départ après ravitaillement, la jauge d’arrivée, le
ravitaillement avant départ et le prix du fuel HT en €/L. Le relevé
est enregistré séparément des informations signées. Les comptes autorisés à
consulter la fiche accèdent à son récapitulatif.

## Carburant et autonomie de la flotte

Le bandeau **Carburant et autonomie** du registre affiche le dernier niveau
connu de chaque navire visible. Le Capitaine affecté ou un responsable habilité
peut saisir un état de départ en litres ou en pourcentage de la capacité des
cuves principales. La saisie date le relevé à l’enregistrement. Les profils en
lecture seule consultent le niveau et sa provenance.

Dans **Navires**, la section **Carburant** permet de déclarer le nombre de cuves
principales et la capacité de chacune en litres. La case **Caisse journalière**
affiche un champ séparé pour sa capacité. Le calcul du stock nominal additionne
les cuves principales. Il reprend l’ancienne capacité totale si leurs volumes
individuels ne sont pas renseignés.

Après un relevé Conso sur une fiche GO signée, la dernière arrivée connue
alimente le bandeau avec son volume converti selon le calibrage du navire.
L’heure d’arrivée réelle ou la fin GPX date la mesure. Sans ces données, la
première saisie Conso date la mesure lorsqu’elle intervient le jour de la
mission. Un relevé ancien saisi tardivement conserve sa date de mission et
laisse la priorité à un état de départ plus récent.

L’autonomie estimée utilise la moitié de la vitesse maximale renseignée dans
Navires. Elle divise le stock par la consommation horaire observée en transit
sans remorquage, sur les trajets comparables entre 40 et 60 % de la vitesse
maximale. Les passages valides des classeurs Rozel et Suroît peuvent aussi
alimenter ce calcul. Le total des litres rapporté au total des heures pondère
ces relevés par leur durée. Les heures estimées multipliées par la vitesse cible donnent
les milles nautiques. Le bandeau indique les données manquantes quand un calcul
est impossible.

## Saisie et bilan d’un relevé

La saisie regroupe le **Trajet**, les **Jauges**, puis **Avitaillement et prix**.
Le bouton **Enregistrer la consommation** valide directement le relevé lorsque
les champs requis sont valides.
Une trace GPX horodatée peut préremplir la durée, la vitesse moyenne et l’arrivée
en heure de Paris. Si le fichier contient plusieurs traces, sélectionner celle de
la mission. Le fichier est lu dans le navigateur. Seuls les indicateurs, les dates
et le profil de vitesse réduit sont enregistrés. La durée couvre la période
enregistrée, arrêts compris. Le calcul de distance additionne les segments
valables et laisse les coupures de plus de cinq minutes hors de la distance.
Revenir à la saisie manuelle permet d’ajuster les paramètres si la trace ne
correspond pas à la mission. Les jauges restent saisies à bord.

Après l’enregistrement, la fenêtre **Bilan de consommation** affiche les
indicateurs, les volumes comparés des soutes et, pour les relevés GPS, le profil
de vitesse avec ses coupures. La carte reprend le relevé confirmé par le serveur.
Le bouton **Consos Excel** exporte les relevés correspondant aux filtres du
registre, avec la provenance de la distance. Chaque navire possède son onglet.
Les archives Suroît et Rozel sont intégrées à l’onglet de leur navire et restent
indépendantes des filtres. La colonne Source distingue les relevés historiques
des relevés SeaPilot. La courbe de jauge est en annexe dans l’onglet du Rozel identifié par son
immatriculation. Les conversions des autres navires suivent leur propre
calibrage. Le classeur exporte les volumes enregistrés.
L’archive contient 854 relevés datés et 11 points de courbe. Les valeurs des classeurs sont
conservées, y compris leurs anomalies historiques, et les lignes de préparation
sans date sont écartées.

La soute de départ est estimée à partir de la jauge. La consommation totale
correspond à l’écart entre les soutes de départ et d’arrivée. Le ravitaillement
d’avant départ est déjà compris dans la jauge de départ. Les litres par heure
utilisent la durée du relevé. Les litres par mille utilisent la distance de la
trace ou, en saisie manuelle, le produit de la durée et de la vitesse moyenne. Le montant en euros multiplie les litres
consommés par le prix du relevé. Un trajet à vitesse nulle conserve les
litres par heure et laisse le taux par mille indisponible.

Le Rozel utilise la courbe du classeur. Le Suroît utilise 34,3 L par
centimètre dans son mode de saisie natif. Une jauge linéaire en pourcentage
correspond à la part du volume nominal des soutes renseigné dans Navires.
Une capacité absente ou une conversion incohérente laisse les volumes
concernés indisponibles. Les valeurs restent estimées à partir de jauges.

Le premier prix saisi dans un relevé ou sa correction actualise le prix
du fuel pour le navire à la date de saisie en heure de Paris. Les cartes
Projet et Opération en mer utilisent le dernier prix applicable du navire.
Pour les navires sans prix propre, les cartes reprennent le dernier prix
applicable saisi dans la flotte.
Une correction de durée,
de vitesse ou de jauge conserve le tarif de référence si le prix du
relevé est inchangé.

La carte d’Opération en mer regroupe en bas à droite du tracé la navigation,
le fuel, le coût HT estimé, le CO₂ de combustion et la consommation moyenne.
Sur mobile, ces indicateurs s’affichent dans un bandeau sous le tracé.
Les valeurs de fuel et de consommation du relevé sont prioritaires
lorsqu’elles existent. Sinon, la carte estime ces valeurs à partir de la
distance prévue et de la référence du navire dans le régime retenu.
Le coût estimé de la carte utilise le prix de référence. Le tableau Conso
utilise le prix saisi dans le relevé. Le facteur CO₂ reste de 2,7251 kg/L.
Voir [le calcul des estimations Projet](./project-voyage-fuel.md).

Une arrivée réelle renseignée permet de vérifier le trajet avant d’ajouter
un échantillon à la référence Projet. Sont retenus les trajets distincts
entre deux ports, d’au moins 10 NM, avec un volume positif, une conversion
documentée, un régime identifié et des dates qui évitent le double comptage
avec les classeurs et les relevés existants. Les autres relevés restent
consultables dans l’opération.

Pour la version 3.86.0, appliquer les migrations
`20261106210524_sea_operation_consumption_gps_trace.sql` et
`20261106210623_sea_operation_consumption_history.sql` avant le frontend. Charger
l’archive de la société en base depuis les fichiers source, hors du dépôt.
Préparer le JSON dans un emplacement privé avec
`python scripts/prepare-sea-operation-consumption-history.py --suroit <classeur-suroit.xlsx> --rozel <classeur-rozel.xlsx> --output <archive-privee.json>`.
Le JSON est chargé dans `sea_operation_private.consumption_history`
pour la société correspondante. Contrôler les trois nombres de lignes avant et
après chargement. L’archive suit le même droit de consultation que le registre.
Le chargement est indépendant des relevés signés et des références Projet.


## Registre par navire et fiche à télécharger

Le registre groupe les opérations par navire, année et mois, selon la date de
l’opération et le calendrier de Paris. L’année et le mois en cours s’ouvrent par
défaut. Une recherche ou un filtre ouvre les branches correspondantes.
La pastille Conso indique la présence d’un relevé sur les fiches GO signées.

Le graphique au-dessus du registre affiche les autres manœuvres pour chaque
navire, ainsi que le remorquage pour Le Rozel, Landemer et le Suroît. Il affiche
les litres par mille nautique et le coût estimé en euros HT par mille nautique.
Le coût multiplie la consommation moyenne par le dernier prix HT du navire,
ou par le dernier prix de la flotte si le navire n’a pas de tarif propre. Dans chaque régime, la moyenne divise le volume total par
la distance totale. Pour le Rozel et le Suroît, elle utilise les trajets de
référence. Pour les autres navires, elle inclut aussi les relevés de missions
GO avec une arrivée réelle, une distance positive et un volume calculable,
en écartant les doublons de trajet. Une absence de données reste distincte
d’une consommation nulle. Les indicateurs de tendance comparent les relevés
du mois en cours à ceux du mois précédent, selon la date d’arrivée à Paris.
La consommation est pondérée par la distance parcourue. La tendance de coût
utilise les coûts enregistrés et la distance des passages correspondants.
La tendance reste indisponible lorsqu’un des deux mois est sans donnée.

Entre Carte et Documents, l’onglet Fiche affiche la fiche conservée et les
actions de consultation et de modification autorisées. Le volet **Sections PDF** de la barre compacte permet de choisir Armement, Documents, Contrôle avant appareillage, Passage Plan
et Décision du Capitaine. La rubrique Documents liste les références visibles
des pièces du projet. Les fichiers se consultent et se téléchargent dans
l’onglet Documents.

Pour la version 3.87.0, appliquer `20261107063257_sea_operation_register_consumption.sql` et
`20261107064910_sea_operation_live_fleet_consumption.sql`, puis
`20261107065640_sea_operation_fleet_consumption_prices.sql` et
`20261107070210_sea_operation_monthly_consumption_trends.sql` avant le frontend. Le RPC du registre utilise les droits de consultation
existants et lit le statut des opérations par lots de 200.
