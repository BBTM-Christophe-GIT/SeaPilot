# Points isolés et dates du Passage Plan

Version 3.80.2 — 27 octobre 2026.

Les points isolés de la localisation Projet et de l’Opération en Mer affichent
uniquement le numéro, la description et les coordonnées. Les aperçus et les PDF
utilisent les mêmes quatre colonnes. Les anciennes données de navigation restent
conservées dans les enregistrements ; aucun changement de schéma ni de droits
n’est nécessaire. Les waypoints de la route conservent ETA, UKC, trafic et VHF.

Le calendrier distingue le seul jour sélectionné des jours non sélectionnés,
même lorsque le style général des boutons du module est chargé après lui.

Lors de l’ajout du premier waypoint d’une nouvelle route, la date et l’heure
courantes de Paris sont proposées, à la tranche de cinq minutes en cours.
Dans Projet, ce défaut renseigne l’ETD de localisation uniquement s’il est vide.
Une modification ultérieure de cet ETD actualise les ETA automatiques ; une ETA
modifiée manuellement reste prioritaire.

Lors de la sélection explicite d’un projet dans une nouvelle Opération en Mer,
une route importée sans ETD et sans première ETA reçoit aussi ce défaut. L’ETD
explicite de la localisation Projet et les premières ETA déjà renseignées sont conservés. L’ETD
commercial du planning ne sert pas à dater les waypoints d’un projet de plusieurs
jours. Les points suivants continuent à utiliser le calcul distance/vitesse.
Sans coordonnées ou vitesse exploitables, aucune durée n’est inventée.

La relecture d’une fiche sauvegardée ou signée ne déclenche pas ce défaut. Une ETA
manuelle effacée reste vide. Les heures ambiguës au changement d’heure de Paris
continuent à être refusées par le contrat existant.

Vérification : fixtures Capitaine et Marin, modification des dates, conservation
des historiques et du projet source, styles du calendrier et tableaux PDF des
deux modules. Vérifier également le rendu mobile et les deux alias de production
sur le commit déployé.
