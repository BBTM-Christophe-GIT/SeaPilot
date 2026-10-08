# Offre commerciale Projet — version 3.39.0

## Périmètre

La saisie de l’offre commerciale propose désormais deux présentations exclusives, sans supprimer les données de l’autre présentation :

- **Conditions détaillées** : loyer, mobilisation et démobilisation, avec une description enrichie pour chaque prestation incluse.
- **Description libre et annexes** : un grand champ enrichi « Description des conditions » et des pièces jointes classées dans `Offre Commerciale / Prestation annexe`.

Les quatre contenus enrichis sont nettoyés avant affichage. Leur typographie PDF est rendue en **Aptos** avant insertion dans le document, afin de conserver les listes, emphases et niveaux de titres. La génération s’arrête avec un message explicite si Aptos n’est pas disponible sur le poste ; aucune police propriétaire n’est redistribuée avec SeaPilot.

## Offre anglaise

La fenêtre « Émettre le document » permet de choisir **Français** ou **English** pour l’offre commerciale. La version anglaise traduit les libellés standards du document, les valeurs monétaires (`excl. VAT`), les réserves standards et le nom du fichier. Les textes libres saisis par l’utilisateur restent volontairement inchangés pour permettre leur validation métier.

## Données et migration

La migration `supabase/migrations/20260907062022_project_offer_rich_conditions.sql` étend le validateur strict du payload contractuel avec :

- `commercial_conditions_mode` (`structured` ou `free_text`) ;
- `commercial_conditions_description` ;
- les trois descriptions enrichies existantes, conservées sous leurs clés actuelles.

Appliquer la migration avant la version client 3.39.0. Le mode par défaut reste `structured`, ce qui préserve toutes les offres historiques.

## Recette

1. Ouvrir un projet de type Offre Commerciale et modifier l’offre.
2. Vérifier les trois barres de mise en forme et l’enregistrement du HTML nettoyé.
3. Basculer sur « Description libre et annexes », saisir un texte, joindre plusieurs fichiers et enregistrer.
4. Revenir aux conditions détaillées et vérifier que les montants et descriptions précédents sont toujours présents.
5. Émettre les versions française et anglaise ; contrôler la police Aptos, les libellés, les montants, les sauts de page et les noms de fichiers.
6. Choisir l’archive avec annexes et vérifier que les pièces classées accompagnent le PDF.

## Retour arrière

Le client précédent ignore les nouvelles clés et continue d’afficher la présentation détaillée. La migration peut rester en place : elle n’altère aucune ligne existante et évite de perdre les descriptions libres déjà enregistrées.
