# Registre mensuel PDF — signatures des imports XLSM approuvés

Le bloc « Marin » affiche le prénom, le nom et la signature du titulaire.
Pour un import XLSM approuvé sans événement historique de signature du marin,
le PDF charge la signature active du titulaire déjà présente dans les données
autorisées du registre. Une signature historique reste prioritaire lorsqu'elle
existe. Ce repli ne crée aucun événement de signature et n'affiche aucune date
de signature supposée. Sans image disponible, le nom reste visible avec
« Signature non apposée ».

Le bloc « Capitaine / validateur » conserve le nom, le rôle et la signature
historique. Sa date, son heure et la mention de version sont retirées du PDF.
Les preuves stockées et les droits d'accès restent inchangés ; aucune migration
de base de données n'est nécessaire.

Vérifications : tests PDF sur les imports avec et sans signature, priorité de
l'historique, sélection du titulaire depuis les contextes Marin et Capitaine,
erreurs de téléchargement, tests du module Temps de travail, lint, build de
production et inspection visuelle du PDF paysage sur une page.
