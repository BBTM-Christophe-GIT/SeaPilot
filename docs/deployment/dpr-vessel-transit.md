# DPR : navire en transit

Dans la fenêtre de saisie du Daily Progress Report, la liste Projet propose
`Navire en transit` immédiatement après `Navire à quai`.

Comme `Navire à quai`, cette valeur est enregistrée avec `projectId: null` et
le libellé dans `unlistedProjectName`. Elle est reconnue à la réouverture du
rapport sans créer de doublon dans la liste. La sélection d’un projet du
catalogue efface ce libellé.

Le préremplissage issu du Planning reste identique. Aucune migration de base
de données ni configuration supplémentaire n’est nécessaire.

## Vérifications

- Les 38 tests existants du module DPR passent, ainsi que le build de production.
- Le contrôle Chrome sur les données locales de démonstration vérifie l’ordre
  des options, les changements de sélection, l’absence de doublon et le contenu
  envoyé à la sauvegarde, intercepté sans écriture en base.
- Le formulaire a été contrôlé aux formats bureau et mobile.
