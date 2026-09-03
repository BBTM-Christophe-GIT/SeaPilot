# Certificats flotte - action corrective et pagination du rapport

## Livraison

- ajout du champ enrichi **Action corrective** dans les dialogues de création et de modification d’un écart ;
- ajout multiple de pièces jointes à l’action corrective, dans le stockage privé existant ;
- ajout de l’action corrective et de l’inventaire des pièces au PDF ;
- synthèse **1 - Liste des écarts et état du traitement** avant les fiches ;
- démarrage de chaque écart sur une nouvelle page ;
- remplacement de l’accent orange du rapport par le bleu BBTM.

## Base de données

Appliquer `supabase/migrations/20260903123000_fleet_finding_corrective_action.sql` avant le déploiement du client. La migration est additive et initialise les écarts existants avec une action corrective vide.

## Vérification

1. Ouvrir un document dans **Certificats flotte**, puis l’onglet **Pilotage du traitement**.
2. Modifier un écart, saisir une action corrective enrichie et joindre une image ainsi qu’un PDF.
3. Enregistrer, rouvrir l’écart et vérifier le contenu et les pièces.
4. Générer un rapport au périmètre **Un document** avec la liste des écarts.
5. Vérifier la page de synthèse, le début de chaque écart sur une nouvelle page, l’absence de bandeaux orange et la présence des pièces jointes.
