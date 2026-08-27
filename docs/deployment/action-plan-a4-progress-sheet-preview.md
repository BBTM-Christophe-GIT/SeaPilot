# Plan d'action — fiche A4 et suivi de complétude

## Comportement livré

- La création d'une action devient un formulaire continu organisé en cinq sections : identification, qualification, constat, action proposée et photos.
- Une fiche A4 se met à jour pendant la saisie et reprend les informations adaptées au type d'action, ainsi que deux photos du constat.
- Le panneau de complétude suit neuf jalons, dont les quatre étapes de traitement et de validation qui restent à compléter après la création.
- L'aperçu avant création présente la fiche en pleine page et propose le téléchargement du PDF A4.
- Une action existante peut également produire sa fiche PDF avec les photos du constat et, lorsqu'elles existent, la preuve et les informations de clôture.
- L'enregistrement en brouillon conserve un statut distinct de l'action créée.

## Préversion

La préversion utilise le mode de démonstration SeaPilot (`?preview=1`) afin de présenter le formulaire rempli, les preuves photographiques et la fiche A4 sans dépendre d'une session réelle.

## Vérifications

- Vitest couvre la création d'une action, les neuf jalons de complétude, la référence de fiche et la génération du PDF.
- Le rendu a été contrôlé aux formats 1488 × 1058 et 390 × 844 dans le navigateur intégré, sans erreur console.
- Le PDF généré a été rendu avec Poppler : une page, format A4, avec logo, données, photos et pied de page.
