# Certificats flotte — espace documentaire unifié (v3.19.5)

La version `3.19.5` remplace le tableau de bord et l’écran détail séparé par un espace documentaire unique.

## Interface

- La bibliothèque documentaire est affichée en tête, à côté d’une carte de travail à onglets.
- Les anciennes cartes KPI sont supprimées.
- Les onglets regroupent le pilotage du traitement, les échéances, les visites prestataires et l’aperçu du document sélectionné.
- La recherche et les filtres sont intégrés à la bibliothèque.
- Chaque ligne documentaire propose la sélection, la suppression, le renouvellement et le téléchargement selon les droits du profil.
- Le clic sur une ligne ouvre l’aperçu et les métadonnées du document sans changer de page.
- Le ruban reprend le composant du Planning et centralise l’ajout, la programmation d’une visite, le téléchargement multiple et la génération de rapports.
- Un téléchargement multiple produit une archive ZIP ; un document unique conserve son format d’origine.

## Nommage et échéances

Les nouveaux documents et les renouvellements utilisent désormais le nom normalisé :

`Navire - Nom du document - YYYY-MM-DD.extension`

La date utilisée est la date d’émission. Elle est obligatoire pour les nouveaux dépôts et les renouvellements.

À la saisie d’une date d’émission, la date d’échéance est proposée à plus un an. Elle reste modifiable et peut être supprimée pour les documents sans échéance. Le 29 février est ramené au 28 février lorsque l’année suivante n’est pas bissextile.

## Base de données

Migration : `20260813123524_fleet_certificate_issued_date_naming.sql`.

Elle définit `vessel-title-issued-on` comme stratégie de nommage active dans `fleet_certificates.renaming_rule_key`. Aucun fichier historique n’est renommé ; la règle s’applique aux insertions et renouvellements futurs.

## Validation attendue

- Tests du module et du routage applicatif.
- Vérification TypeScript, lint et build de production.
- Recette navigateur desktop et mobile sur la préversion locale puis sur Vercel.
