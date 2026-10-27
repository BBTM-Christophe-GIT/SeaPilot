# Localisation facultative des projets — v3.79.0

Tous les contrats disposent d’une étape **5 Localisation**, facultative. Elle
conserve un passage plan ordonné, des points isolés et des zones nommées. Les
trois couches coexistent sur la carte. Seul le passage plan contribue aux
segments, distances, durées et ETA calculées. La vitesse de référence reste
`ceil(vitesse maximale du navire × 0,60)` ; aucune vitesse n’est inventée si
le navire n’en possède pas.

L’ETD est une saisie distincte des dates commerciales de livraison. Les
waypoints reprennent les champs d’Opérations en mer : numéro, description,
position WGS84 affichée en degrés/minutes, ETA, UKC et trafic dense. Les
prévisions et calculs automatiques sont consultés et enregistrés dans la fiche
Opération en mer ; ils ne constituent pas des validations dans le projet.
Un tracé incomplet peut être conservé en brouillon. Une zone n’est dessinée
comme polygone qu’avec au moins trois sommets valides et distincts.

La localisation n’apparaît pas dans le contrat PDF par défaut. Le bouton
**Joindre la localisation au PDF** ajoute une annexe en paysage, avec carte,
récapitulatif de navigation et tableaux. Les pages contractuelles existantes
restent intactes. Les longues listes continuent sur des pages supplémentaires
pour rester lisibles ; aucun point n’est supprimé pour tenir sur une page.
Le modèle de prestation intellectuelle reste soumis à sa disponibilité
existante : cette fonction n’ajoute pas de nouveau modèle contractuel.

## Sauvegarde et droits

La migration `20261027083912_project_location_plan.sql` ajoute
`public.projects.location_plan`, nullable, versionné et distinct de
`source_payload` (provenance SharePoint). `projects_save_with_location` appelle
le writer existant puis écrit la localisation dans la même transaction, avec
le jeton de concurrence final. Les anciens clients `projects_save` préservent
la colonne. `undefined` conserve le chemin ancien ; `null` efface explicitement
la localisation via le nouveau writer.

Les règles Admin/Direction et entreprise active sont conservées. Aucun droit
d’écriture directe sur `projects` n’est ajouté. La validation limite le poids,
les textes, les collections et les identifiants. Les captures de météo, radio
et UKC ne font pas partie du modèle Projet.

Le plan Projet est limité à 256 Kio de JSON compact (200 waypoints, 200 points
isolés, 50 zones et 200 sommets par zone au maximum), pour conserver une réserve
pour les données opérationnelles lors de la copie. Le budget historique de
500000 octets reste appliqué à la fiche SeaOps hors géométries complémentaires ;
celles-ci possèdent leur propre budget de 512 Kio. Les validateurs refusent
les captures ou clés inattendues dans cette extension.

La migration a été appliquée sur SeaPilot et son historique est aligné avec
le nom de fichier versionné. La vérification distante confirme la colonne
JSONB, les fonctions de contexte/validation et le droit d’exécution du writer,
sans ajout de droit UPDATE direct à `authenticated`. Les ancres de fonctions
préexistantes sont normalisées en LF pour accepter aussi leurs corps CRLF.

## Copie vers Opérations en mer

Le contexte du planning expose la localisation du projet autorisé. À la
sélection de cette mission, le passage plan, les cartes marines, les points
isolés, les zones et l’ETD explicitement saisi sont copiés dans le brouillon.
Les identifiants des points sont renouvelés et les captures ne sont pas
réutilisées. La première ETA issue de l’ETD devient une ancre conservée ;
toutes les dates et géométries restent modifiables par les profils autorisés.

La copie est indépendante : modifier ensuite le projet ne réécrit pas une
fiche Opération en mer existante ou signée. Les points isolés et zones ne
créent pas de segments de navigation. Leur présence est conservée dans
l’aperçu et l’export de la fiche.

## Vérifications

Les tests couvrent les contrats, l’option PDF désactivée/activée, la pagination,
les trois couches, la copie indépendante, les ETA manuelles, les versions
concurrentes et les droits réels Admin/Direction/Capitaine/Marin. Les fixtures
SQL sont exécutées en transaction avec `ROLLBACK`, sans données métier
persistées. Le rendu PDF est vérifié sur des données fictives.
