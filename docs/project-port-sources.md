# Référentiel des ports SeaPilot

Le référentiel officiel embarqué dans `src/features/projects/projectPortsData.ts` contient 871 entrées :

- 669 ports maritimes français, métropolitains et ultramarins ;
- 202 ports anglais majeurs, mineurs et ports de déclaration rattachés à un port statistique.

Les libellés historiques déjà utilisés par SeaPilot restent utilisables comme termes de recherche.
Lorsqu'un LOCODE est déjà couvert par le référentiel officiel, l'alias générique n'est pas ajouté à
la liste : la forme officielle commençant par `Port…` est conservée. Les alias dont le LOCODE n'est
pas représenté par une entrée officielle restent disponibles pour préserver la compatibilité avec
les projets et les offres existants.

## Sources

- France : [Ports - Espace maritime français](https://www.data.gouv.fr/datasets/ports-espace-maritime-francais), référentiel SANDRE/SHOM mis à jour le 25 août 2026. Le jeu comprend les ports maritimes et fluvio-maritimes, y compris les petits ports sans LOCODE propre.
- Angleterre : [Major and minor port list for freight statistics](https://www.gov.uk/government/statistical-data-sets/port-and-domestic-waterborne-freight-statistics-port), Department for Transport, publication 2025 mise à jour le 29 juillet 2026. Le catalogue conserve le lien entre un port de déclaration et son port statistique publié.
- Codes : [UN/LOCODE 2025-1](https://unece.org/trade/cefact/UNLOCODE-Download), UNECE. Les LOCODE propres sont distingués des LOCODE associés à une commune ou à un port publié.

## Règles d’affichage

- La liste conserve le classement par département pour la France, puis par subdivision administrative pour l’Angleterre.
- Un port sans LOCODE propre affiche explicitement `sans LOCODE dédié`.
- Lorsqu’un LOCODE de commune ou de port publié est utilisé comme rattachement, l’interface affiche le port ou la commune de rattachement.
- Les codes EUERS présents dans le référentiel maritime français sont conservés comme codes de référence, sans être présentés comme des UN/LOCODE.
- Les mêmes données et les mêmes règles de recherche alimentent les ports de livraison/restitution, les escales DPR et les lieux de visite des certificats flotte.
