# Suivi du Temps de Travail

Le module `/modules/workingTime` conserve les intervalles horodatés comme source de vérité pour les contrôles de travail et de repos. Plusieurs phases disjointes peuvent être saisies le même jour ; elles sont contrôlées ensemble puis enregistrées atomiquement par Supabase.

## Exports mensuels

Le PDF est généré à la demande dans le navigateur et n’est pas conservé par SeaPilot. Il comprend l’identité, le navire, l’OMI, le pavillon, le validateur, les commentaires, une grille de 48 demi-heures, les totaux journaliers, le cumul glissant 7 jours calculé côté serveur, les anomalies et les deux signatures figées.

## Exposition HSE / IMCA

`working_time_intervals` porte les heures réelles. `hse_exposure_hours` est un ledger séparé qui conserve la méthodologie versionnée utilisée pour les heures d’exposition.

- Sédentaires : une affectation issue d’un Planning publié produit 8 heures d’exposition par jour. Une saisie réelle ou un import Excel sur la même personne et la même date remplace cette valeur et empêche tout double comptage.
- Offshore : les heures réelles restent utilisées pour les contrôles travail/repos. Leur conversion en exposition exige un facteur explicite dans `hse_exposure_methodologies`.
- Aucun multiplicateur de taux n’est implicite. Tant que l’administrateur ne les renseigne pas, les taux concernés restent `null` et l’interface affiche « À configurer ».

Les classifications disponibles sont `FAT`, `LWDC`, `RWC`, `MTC`, `FAC`, `NEAR_MISS` et `SAFETY_OBSERVATION`. Le RPC `hse_kpi_summary` produit LTI, LTIFR, TRIR, FAR, les taux FAC/MTC/RWC, SOFR et les taux français de fréquence et de gravité, avec filtres période, navire, bordée, personne, fonction, client, projet, zone et population.

## Exploitation

1. L’administrateur crée ou complète une méthodologie datée et versionnée.
2. L’armement, la direction ou l’administrateur lance `refresh_hse_exposure_hours` sur la période.
3. Les rôles autorisés interrogent `hse_kpi_summary` depuis le panneau HSE du module.

Les politiques RLS limitent les lectures à la société active. La gestion des méthodes est réservée à l’administrateur et le recalcul d’exposition aux rôles administrateur, direction et armement.
