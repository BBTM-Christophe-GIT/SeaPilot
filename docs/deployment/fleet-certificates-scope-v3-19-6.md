# Certificats flotte — périmètres documentaires (v3.19.6)

La version `3.19.6` affine l’espace documentaire unifié livré en `3.19.5`.

## Interface

- Le bouton de téléchargement multiple se trouve dans la barre de la bibliothèque, à côté de « Tout déplier ».
- Le ruban de gestion documentaire tient sur une seule ligne et conserve l’ajout de document, la programmation d’une visite et la génération de rapports.
- Le volet droit affiche par défaut les données de toute la flotte, classées par navire, catégorie puis document.
- Un clic sur un navire limite les écarts, échéances et visites à ce navire.
- Un clic sur une catégorie limite ces trois onglets à la catégorie du navire sélectionné.
- Le périmètre actif est affiché au-dessus du volet droit et peut être réinitialisé vers toute la flotte.

## Nommage des fichiers

Les nouveaux documents et les renouvellements utilisent :

`Navire - Nom du document - YYYY.extension`

L’année provient de la date d’émission obligatoire. La date d’échéance reste initialisée à plus un an, modifiable et facultative ; le texte d’aide redondant a été retiré des formulaires.

## Base de données

Migration : `20260813140634_fleet_certificate_issued_year_naming.sql`.

Elle définit `vessel-title-issued-year` comme stratégie active et convertit les anciennes clés de stratégie. Les fichiers déjà stockés ne sont pas renommés ; la règle s’applique aux insertions et renouvellements futurs.

## Validation

- Tests automatisés du module, du filtrage hiérarchique et du nommage.
- Vérification TypeScript, lint et build de production.
- Recette navigateur locale puis contrôle du déploiement Vercel.
