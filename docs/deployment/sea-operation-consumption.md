# Consommation après une opération en mer

Dans le registre **Opération en mer**, **Conso** ouvre le relevé de la fiche
signée. Après une navigation terminée, le capitaine signataire et les profils
bureau autorisés peuvent renseigner les heures et minutes, la vitesse moyenne
en nœuds, la **Quantité de fuel consommée (GE + MPx)**, le ravitaillement
avant départ et le prix du fuel HT en €/L. La quantité se saisit en litres par
défaut ou en m³. Le relevé
est enregistré séparément des informations signées. Les comptes autorisés à
consulter la fiche accèdent à son récapitulatif.

## Carburant et autonomie de la flotte

Le bandeau **Carburant de la flotte** affiche le niveau de chaque navire visible
sur une rangée, hors BR71. Le chevron de la carte ouvre la provenance du stock,
l’autonomie, les moyennes et leurs tendances. Dans le ruban **Fuel**, **Soutes**
permet au Capitaine affecté ou à un responsable habilité de saisir le stock à
la date et à l’heure de la mesure. Le navire de l’affectation confirmée du jour est
présélectionné quand il est accessible en saisie. Le collaborateur peut choisir
un autre navire autorisé. La date et l’heure de Paris sont proposées par défaut.
**Export Excel** télécharge les consommations avec le périmètre habituel.
L’icône utilisée dans le ruban provient du [catalogue Microsoft](https://res.cdn.office.net/files/fabric-cdn-prod_20230815.002/assets/brand-icons/product/svg/excel_48x1.svg).
La jauge devient orange de 25 à 35 % inclus. Sous 25 %, elle devient rouge
et s’accompagne d’une pastille d’alerte en haut à droite de la carte du navire.
Dans la carte **Stock**, la jauge indique le pourcentage et le volume au
repère du niveau courant, ainsi que la capacité totale à droite. Ces volumes
s’affichent en m³ au-delà de 1 000 L et en litres jusqu’à 1 000 L inclus.
La carte affiche aussi la date, l’heure et les jauges par cuve du relevé Soutes
le plus récent par heure de mesure. Les valeurs de ce relevé restent distinctes
du stock courant recalculé avec les DPR et les avitaillements.

La carte du **SUROIT** affiche la jauge **Sludges** à côté de celle de carburant, d’après le dernier niveau
de la cuve mesuré dans **Soutes**. La capacité vient de la fiche du navire.
Le niveau est vert sous 60 %, orange de 60 % à moins de 75 %, puis rouge
avec une pastille d’alerte dès 75 %. Un relevé carburant plus récent laisse
le dernier niveau Sludges disponible.

Dans **Navires → Capacités → Carburant**, renseigner le nombre de cuves
principales, leurs noms et leurs volumes en litres. Deux cuves sont nommées par
défaut **Cuve Bâbord** et **Cuve Tribord**. La case **Caisse journalière** affiche
des champs séparés pour son nom et sa capacité. Le calcul du stock nominal
additionne les cuves principales et reprend l’ancienne capacité totale si leurs
volumes individuels ne sont pas renseignés.

Les administrateurs peuvent créer des sous-sections propres à chaque navire
et importer plusieurs plans PDF, JPEG, PNG ou WebP de 25 Mo chacun. La case
**Afficher dans Soutes** est disponible pour chaque cuve, y compris dans les
sous-sections personnalisées. Les cuves de carburant existantes sont cochées par
défaut. Cocher les nouvelles cuves des sous-sections pour les ajouter au relevé.

**Soutes**, dans le même ruban, enregistre plusieurs relevés par navire et par
jour, à des heures distinctes. Choisir une heure dans **Relevés de la journée**
pour consulter ou corriger ce relevé. Choisir **Nouveau relevé** pour ajouter
une mesure. Les anciens relevés datés correspondent à 00 h 00.
Chaque cuve sélectionnée reçoit une mesure en %, L ou m³ et un visuel de son
remplissage. Les cuves Bâbord ou repérées `P` occupent la gauche, celles
Tribord ou repérées `S` occupent la droite. La jauge en haut montre la somme
des volumes mesurés. La référence du bandeau et le décompte des DPR utilisent
la somme des cuves principales, avec la caisse journalière suivie séparément.
Seul un relevé complet des cuves principales peut actualiser la référence de
carburant. Les volumes des autres sous-sections sont conservés dans le relevé.
Pour les deux cuves calibrées du LANDEMER, une mesure en pourcentage applique
la table correspondante. Le relevé peut être rouvert à son heure avec ses valeurs
et unités d’origine. Pour un navire qui a seulement une capacité historique, la
mesure se saisit dans une cuve unique. Quand la capacité est inconnue, la saisie
en volume reste disponible.

Le stock courant soustrait le champ **Consommation de carburant en L** des DPR
validés depuis le jour de la référence à 00 h 00 ou depuis le lendemain pour
une mesure en cours de journée. Les DPR fournissent un total journalier et ne
permettent pas d’isoler la consommation après l’heure du relevé. La saisie ou la
correction d’un relevé antérieur conserve la référence la plus récente. Un seul
DPR renseigné est pris par navire et par jour. En cas de doublon, un DPR
SeaPilot prime sur un import historique, puis la validation la plus récente prévaut.

Si un relevé historique Conso sur une fiche GO signée associe un avitaillement
positif à une mesure d’arrivée, le stock à l’arrivée devient la référence
lorsqu’il est plus récent.
Le décompte reprend le lendemain de l’arrivée, dont la jauge intègre déjà le
carburant embarqué et consommé en route. L’arrivée réelle, la fin GPX ou la
date de mission déterminent l’ordre des mesures. En l’absence de référence
datée ou d’avitaillement, la dernière arrivée Conso connue fournit le niveau.
Les nouveaux relevés Conso enregistrent le volume consommé et l’avitaillement
éventuel. Les nouveaux niveaux de stock se relèvent dans **Soutes**.

L’autonomie estimée affiche deux cadrans, **Vitesse moyenne** et **Vitesse
moyenne en remorque**. Chaque vitesse divise la distance totale en milles
nautiques par la durée totale en heures du régime correspondant. Les références
proviennent des passages exploitables des archives Excel du Rozel et du Suroît
et des traces GPX enregistrées dans **Conso**. Le journal de stock du LANDEMER
ne fournit pas de distance de voyage.

Le régime des archives suit leur colonne **Remorquage**. Pour un projet SeaPilot,
un remorqué renseigné, un type **Contrat de Remorquage** ou le mot
« remorquage » dans le titre suffit à identifier ce régime. Pour une fiche sans
projet identifié et sans ce mot dans le titre, la déclaration de remorquage de
la fiche s’applique. Les passages qui se recouvrent sont dédoublonnés. Les
intervalles archivés de plus de sept jours à moins d’un nœud sont écartés des
profils de vitesse.

Pour chaque régime, le stock divisé par la consommation en L/NM donne la
distance estimée. Cette distance divisée par la vitesse moyenne donne les
heures. Les cadrans affichent les vitesses moyennes à une décimale et indiquent
les références manquantes. Le plan de passage utilise la vitesse du régime du
projet pour calculer les ETA automatiques.
Faute de référence en remorque, la fiche demande une ETA manuelle. Hors
remorquage, elle reprend alors la règle de 60 % de la Vmax, arrondis au nœud
supérieur. Les ETA manuelles et les horaires des fiches signées restent prioritaires.

### Cumul annuel par navire

Le chevron ouvre les indicateurs du navire sur toute la largeur du bandeau.
Les courbes cumulent les litres consommés et le coût HT estimé mois après mois
depuis janvier. Le filtre ouvre l’année en cours par défaut et propose les
années où le navire dispose de DPR valides. Pour l’année sélectionnée, les
courbes s’arrêtent au dernier mois renseigné et leurs étiquettes indiquent le
cumul à la date du dernier DPR validé avec une consommation renseignée.
Sélectionner un autre mois sur le graphique déplace les étiquettes.
Le tableau **Données mensuelles** reste consultable.
Sous les courbes, la jauge de stock, la vitesse et la portée estimée, puis
les barres des moyennes présentent les indicateurs du navire.
Les volumes sont affichés en m³ à partir d’une capacité totale de 3 000 L.
Ils sont affichés en litres pour les capacités inférieures ou inconnues.

Le cumul retient un seul DPR validé par jour, avec la même règle de sélection
que le stock. Le coût utilise le dernier prix HT applicable à la date du DPR
pour le navire, ou le prix de référence de la flotte à cette date. Les litres
sans tarif restent dans le cumul de consommation et sont signalés à côté du
coût estimé. Le bouton **Exporter en PNG** télécharge les courbes du navire et
de l’année affichés avec les étiquettes du mois sélectionné.

Pour le GOURY, si l’année contient des dépenses éligibles de spécialité **Fuel**
dans **Projet → Facturation**, le coût cumule leurs montants HT en euros à la
date de facture. La courbe de volume continue de s’appuyer sur les DPR. Les deux
étiquettes se placent par défaut à la plus récente des dates de DPR et de
facture Fuel retenues. Si aucune facture exploitable n’est disponible pour
cette année, le coût reprend l’estimation à partir des DPR et des prix du
carburant.

## Saisie et bilan d’un relevé

La saisie regroupe le **Trajet**, le **Carburant consommé**, puis
**Avitaillement et prix**. Un m³ correspond à 1 000 L. Les calculs et l’export
utilisent le volume en litres.
Le bouton **Enregistrer la consommation** valide directement le relevé lorsque
les champs requis sont valides.
Une trace GPX horodatée peut préremplir la durée, la vitesse moyenne et l’arrivée
en heure de Paris. Si le fichier contient plusieurs traces, sélectionner celle de
la mission. Le fichier est lu dans le navigateur. Seuls les indicateurs, les dates
et le profil de vitesse réduit sont enregistrés. La durée couvre la période
enregistrée, arrêts compris. Le calcul de distance additionne les segments
valables et laisse les coupures de plus de cinq minutes hors de la distance.
Revenir à la saisie manuelle permet d’ajuster les paramètres si la trace ne
correspond pas à la mission.

Après l’enregistrement, la fenêtre **Bilan de consommation** affiche les
indicateurs et, pour les relevés GPS, le profil de vitesse avec ses coupures.
Les relevés historiques conservent leurs jauges et les volumes comparés des
soutes. La carte reprend le relevé confirmé par le serveur.
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

La consommation totale reprend le volume saisi. Les litres par heure divisent
ce volume par la durée. Les litres par mille le divisent par la distance de
la trace ou par la distance obtenue en multipliant la durée par la vitesse
moyenne. Le coût HT multiplie le volume par le prix saisi en €/L. À distance
nulle, le taux horaire reste disponible et le taux par mille reste vide.

Pour les anciens relevés à jauge, la consommation provenait de l’écart entre
le volume de départ et celui d’arrivée. Le Rozel utilise la courbe du classeur.
Le Suroît utilise 34,3 L par
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

Le KPI Moyennes affiche d’abord la carte **Consommation moyenne**, consacrée
aux manœuvres hors remorquage. Pour Le Rozel, Landemer et le Suroît, la carte
**Consommation moyenne en opération de remorquage** apparaît en dessous.
Chaque carte indique les litres et le coût estimé en euros HT par mille nautique.
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
Le KPI Moyennes et les tendances M−1 utilisent les mêmes critères de classement
du remorquage que les profils de vitesse.

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
