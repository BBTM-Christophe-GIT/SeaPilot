# Estimations de trajet dans Projet

La carte Projet calcule la consommation, le coût et le CO₂ à partir de la
distance prévue des waypoints et de la référence du navire principal. Un
contrat de remorquage utilise la référence avec remorque. Les autres contrats
utilisent la référence sans remorquage. Chaque taux divise le total des litres
par le total des milles nautiques pour le navire et le régime correspondants.

La référence initiale du Rozel et du Suroît provient des relevés de soutes.
Elle retient les voyages d’au moins 10 NM entre deux ports, avec des dates et
des jauges cohérentes. Les volumes et les distances s’additionnent séparément.
La base accepte des lots vérifiés supplémentaires, identifiés par leur source.
Une correction remplace son lot et les nouveaux lots doivent couvrir des
trajets distincts. Pour intégrer un DPR à la référence, le volume consommé et
les milles parcourus doivent couvrir le même trajet. Avec une route complète,
la carte indique quand la référence du navire et du régime est indisponible.

Le prix du **fuel** est un prix fournisseur en €/L HT, daté et accompagné
d’une référence de devis ou de facture. Le produit de référence est le
Zaphir TAXABLE - GASOIL Pêche UN1202.
Administration et Direction peuvent le renseigner depuis la carte Projet.
Le tarif est enregistré pour le navire principal du projet. Sans navire
principal, la saisie fixe le tarif de référence de la flotte. Les cartes et
le PDF utilisent le prix applicable le plus récent du navire, puis celui
de la flotte si le navire n’a pas de tarif propre. Les relevés Conso mettent
à jour le prix de leur navire. Le Rozel démarre à 1,254 €/L HT au 31/10/2026
et le Suroît à 1,115 €/L HT au 22/09/2026, selon leurs classeurs.
L’absence de prix laisse le coût indisponible et permet
toujours le calcul du volume et du CO₂. Aucun flux fournisseur accessible
ne fournit le prix contractuel exact à ce jour. Le prix au litre du gazole
routier et les moyennes de gazole pêche ne représentent pas ce tarif.
Voir [le produit Zaphir](https://www.armorine.fr/zaphir-f13.html) et
[les conditions de vente Armorine](https://www.armorine.fr/cgv-c9.html).

Le CO₂ estimé couvre la combustion. Il applique **3,206 kg de CO₂ par kg
de diesel/gazole**, avec une masse volumique indicative de **0,85 kg/L**,
soit **2,7251 kg de CO₂ par litre**. Voir
[le facteur de conversion OMI](https://wwwcdn.imo.org/localresources/fr/OurWork/Environment/Documents/resolution%20MEPC.346%2878%29fr.pdf)
et [la fiche technique du Zaphir](https://www.armorine.fr/upload/carburants/ft-zaphir-novembre-2025.pdf).

Dans les options de l’annexe Localisation, choisir le contenu du récapitulatif
PDF. L’option complète inclut le carburant, le coût et le CO₂ en plus des
distances et durées. L’option Navigation conserve les distances et les durées.
L’option Sans récapitulatif conserve le tracé et les tableaux de localisation.
Les projets existants conservent le mode Navigation par défaut. Le coût et le
CO₂ sont ajoutés aux nouveaux exports uniquement sur choix explicite. La
fenêtre d’émission reprend le réglage enregistré et permet de le modifier
pour ce seul fichier, y compris de retirer entièrement l’annexe.

Appliquer `20261106085837_project_voyage_estimate_pdf.sql` et
`20261106085847_project_voyage_fuel_references.sql` avant le frontend.
