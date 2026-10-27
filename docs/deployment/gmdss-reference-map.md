# Carte documentaire des zones radio SMDSM

La carte Projet et Opération en Mer propose un volet « Carte officielle des
zones radio SMDSM ». Il affiche le document original MCA à la demande, dans
son propre cadre. Aucune surface radio n’est ajoutée au fond géoréférencé,
aucun waypoint n’est classé automatiquement et aucune donnée métier n’est
modifiée. Le composant est exclu des documents et masqué à l’impression.

## Provenance et droits

- Éditeur : Maritime and Coastguard Agency (MCA), Royaume-Uni.
- Publication : *GMDSS VHF DSC procedures for small boat users*, mise à jour
  le 24 juillet 2024.
- [Publication officielle et licence](https://www.gov.uk/government/publications/gmdss-sea-areas-and-procedures-for-small-boat-users/gmdss-vhf-dsc-procedures-for-small-boat-users).
- [SVG original](https://assets.publishing.service.gov.uk/media/669a22da49b9c0597fdb0025/GMDSS_Map_2024.svg).
- Copie locale inchangée : `public/maps/gmdss/mca-2024.svg`.
- SHA256 : `cad0e07a71337b70034ae173bd1dd2c8e1b500a72b81f4e54f8d442569596f11`.

La publication indique © Crown copyright 2024 et l’Open Government Licence
v3.0, sauf mention contraire. Le composant conserve l’attribution suivante :

> Source : Maritime and Coastguard Agency, carte GMDSS 2024. © Crown copyright 2024. Contains public sector information licensed under the Open Government Licence v3.0.

Le lien de source et le lien vers [OGLv3](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)
restent accessibles près de la carte. La phrase anglaise est l’attribution
par défaut de cette licence. Les droits de tiers que l’éditeur ne peut pas
concéder et les usages séparés des logos officiels ne sont pas couverts.
Aucun tiers n’est nommé pour cette carte sur sa page de publication ; cela
ne constitue pas une garantie générale sur d’éventuels droits non signalés.
SeaPilot ne revendique aucune approbation par MCA.

Le SVG mentionne la famille Aeonik sans embarquer de fichier de police.
Aucune police propriétaire n’est distribuée par SeaPilot pour ce document.
L’image n’est montée dans le DOM qu’à l’ouverture du volet ; la consultation
utilise la copie locale, sans requête à un service tiers.

## Portée et limites

La carte couvre le Royaume-Uni et les côtes européennes voisines. Le
[PDF de la publication](https://assets.publishing.service.gov.uk/media/66a1076d0808eaf43b50d670/MCA070_GMDSS_sea_areas_map_FINAL.pdf)
précise que la carte est illustrative. Aucun CRS, précision de position ou
résolution géographique n’est publié ; les graticules SVG sont courbes.
Cette image n’est donc pas calée sur les positions de la route et ne permet
pas de conclure à une couverture radio garantie en un point.

A1 et A2 reposent sur les couvertures VHF/MF ASN déclarées par les autorités.
Ils ne sont pas reconstruits par une distance au littoral ou par des
cercles de portée théoriques. La couverture A1 illustrée par MCA se rapporte
à une antenne de navire à 4 m ; une antenne plus basse peut la réduire.

Selon [SOLAS IV/2, résolution MSC.496(105)](https://wwwcdn.imo.org/localresources/en/KnowledgeCentre/IndexofIMOResolutions/MSCResolutions/MSC.496(105).pdf),
la zone A3 dépend du service mobile satellite reconnu et du terminal à bord,
et A4 est la zone restante. La légende Inmarsat de ce document ne définit
donc pas une classification actuelle universelle. Aucune bande fixe de
latitude A3/A4 n’est calculée.

## Vérification

Les tests vérifient l’ouverture native du volet, l’absence d’image montée
avant ouverture, les liens et l’attribution, les limites d’utilisation et
l’identité binaire du SVG original. Les cartes de navigation, exports PDF,
droits et enregistrements restent indépendants de cette référence.
