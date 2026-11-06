# Consommation après une opération en mer

Dans le registre **Opération en mer**, **Conso** ouvre le relevé de la fiche
signée. Après une navigation terminée, le capitaine signataire et les profils
bureau autorisés peuvent renseigner les heures et minutes, la vitesse moyenne
en nœuds, la jauge de départ après ravitaillement, la jauge d’arrivée, le
ravitaillement avant départ et le prix du fuel HT en €/L. Le relevé
est enregistré séparément des informations signées. Les comptes autorisés à
consulter la fiche accèdent à son récapitulatif.

Après l’enregistrement, la carte de l’opération reprend immédiatement le
relevé confirmé par le serveur. Le bouton **Consos Excel** du ruban exporte
un fichier `.xlsx` avec les relevés enregistrés des opérations correspondant
aux filtres du registre. Les groupes Voyage, Jauges, Consommation et
Avitaillement reprennent les données du relevé et les calculs enregistrés.

La soute de départ est estimée à partir de la jauge. La consommation totale
correspond à l’écart entre les soutes de départ et d’arrivée. Le ravitaillement
d’avant départ est déjà compris dans la jauge de départ. Les litres par heure
utilisent la durée saisie. Les litres par mille utilisent la distance déduite
de la durée et de la vitesse moyenne. Le montant en euros multiplie les litres
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

Appliquer `20261106092442_sea_operation_consumption.sql` avant le frontend.
