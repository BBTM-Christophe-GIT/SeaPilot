# Zones de l’Opération en Mer dans les documents

Version 3.80.3 — 27 octobre 2026.

L’aperçu imprimable et l’export PDF affichent un tableau par zone, sous son nom.
Les colonnes « Sommet » et « Coordonnées » présentent les références Z1.1,
Z1.2… puis Z2.1… selon l’ordre enregistré des zones et de leurs sommets. Les
positions utilisent les degrés et minutes décimales avec N/S et E/W. Une zone
vide garde son titre et une ligne explicite ; les zones suivantes ne sont pas
renumérotées. Les coordonnées incomplètes restent visibles sans être inventées.

Un cadre manuel n’enregistre que son centre et son étendue en longitude.
Lorsque le document est plus plat que l’éditeur, sa couverture en latitude
diminue et peut couper des zones pourtant visibles dans l’éditeur. Pour les
documents Opération en Mer, `ensureZonesVisible` conserve le centre et élargit
uniquement l’étendue nécessaire pour contenir les polygones complets avec une
marge. Le cadre manuel enregistré n’est jamais modifié. Le cadrage automatique
reste automatique ; les vues de navigation et l’annexe Projet conservent leur
comportement existant.

Les contours des zones PDF sont tracés après tous les fonds pour conserver leur
lisibilité en cas de chevauchement. Les repères des sommets correspondent aux
tableaux ; les plans très denses conservent toutes les lignes des tableaux, avec
au plus 120 repères de sommets sur la carte PDF. Le rendu reste vectoriel. Les points isolés et les zones restent hors
calcul des distances et durées de navigation.

Aucun changement de schéma, de droit d’accès ou de fiche signée n’est nécessaire.
Vérification : deux zones de six sommets reproduisant le signalement, cadres de
document étroits et paysage, conservation des coordonnées et du cadrage source,
zones vides/incomplètes, aperçu et PDF, absence d’images ajoutées pour la carte,
tests automatisés et build de production.
