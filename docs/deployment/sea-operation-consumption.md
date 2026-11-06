# Consommation après une opération en mer

Dans le registre **Opération en mer**, **Conso** ouvre le relevé de la fiche
signée. Après une navigation terminée, le capitaine signataire et les profils
bureau autorisés peuvent renseigner les heures et minutes, la vitesse moyenne
en nœuds, la jauge de départ après ravitaillement, la jauge d’arrivée, le
ravitaillement avant départ et le prix du fuel HT en €/L. Le relevé
est enregistré séparément des informations signées. Les comptes autorisés à
consulter la fiche accèdent à son récapitulatif.

La saisie regroupe le **Trajet**, les **Jauges**, puis **Avitaillement et prix**.
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
registre, avec la provenance de la distance. Les archives Suroît et Rozel
forment deux onglets distincts des relevés SeaPilot et sont indépendantes des
filtres. La courbe de jauge du Rozel occupe un onglet séparé. L’archive contient
854 relevés datés et 11 points de courbe. Les valeurs des classeurs sont
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
