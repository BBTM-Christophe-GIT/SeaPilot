# SeaPilot v3.12.10 — saisie multi-périodes responsive

Cette version améliore l’éditeur journalier de `/modules/workingTime` :

- les 24 heures et les 48 cellules de demi-heure utilisent toute la largeur disponible, sans largeur minimale forcée ni défilement horizontal sur un panneau de 516 px ;
- les cartes Travail 7 jours, Repos consécutif, Alertes et Statut ainsi que la recommandation sont regroupées au-dessus de la frise ;
- chaque clic-glissé ajoute directement une période à la sélection, sans action intermédiaire « Conserver cette phase » ;
- plusieurs périodes disjointes sont enregistrées par une seule action atomique ;
- les périodes adjacentes ou superposées sont fusionnées et chaque période sélectionnée reste modifiable ou retirable ;
- les champs de saisie passent automatiquement sur deux colonnes lorsque le panneau est étroit afin de conserver des dates et heures lisibles.

## Vérification

1. ouvrir un registre brouillon et choisir une journée libre ;
2. sélectionner deux plages disjointes par clic-glissé ;
3. vérifier que « 2 périodes prêtes » apparaît sans bouton de conservation intermédiaire ;
4. vérifier que la frise affiche `00:00` à gauche et `24:00` à droite sans barre de défilement ;
5. enregistrer la sélection et confirmer la création des deux intervalles ;
6. contrôler la même vue avec une largeur d’écran de 1280 px.

Aucune migration Supabase n’est requise : le modèle d’intervalles et l’enregistrement atomique existants sont réutilisés.
