# Phase 7 — Mise à niveau fonctionnelle du module DPR

## Décision de coexistence

SeaPilot utilise Supabase comme source des nouveaux DPR, de leurs relations et de leurs fichiers privés. SharePoint reste actif et fonctionnel pendant toute la phase de transition. Cette livraison ne désactive, ne supprime et ne modifie aucun flux SharePoint.

## Périmètre livré

- Tableau de bord connecté aux tables normalisées `dpr_*`, avec filtres navire, projet, période et recherche.
- Regroupement navire puis projet, sélection et téléchargement du PDF courant.
- Assistant en six étapes : projet/personnel, journée, QHSE, escale, photos et pièces jointes.
- Référentiels Supabase pour projets, navires, personnes, exercices d'urgence et motifs d'escale.
- Choix uniques pour projet, navire et niveaux d'incident ; choix multiples pour équipage, exercices, motifs d'escale et fichiers.
- Cycle de vie brouillon, soumis, validé, réouvert et suppression logique.
- Le Marin consulte uniquement les DPR dont il est l'émetteur et peut modifier ses propres DPR pendant les trois jours suivant leur création ; après cette échéance, seuls les autres profils DPR autorisés peuvent les modifier.
- Verrouillage des DPR soumis ou validés ; réouverture obligatoire et versionnée avant correction.
- Ajout, prévisualisation par URL signée et retrait logique des fichiers privés.
- Deux photos maximum par DPR, contrôlé dans l'interface et dans le RPC Supabase.
- Génération d'un PDF à la demande à partir des données Supabase, sans stockage du PDF.
- Diagnostic réservé au rôle Admin.
- Alerte navigateur et confirmation de fermeture en présence de modifications non enregistrées.

## Contrôles métier

- Date obligatoire pour enregistrer un brouillon.
- Projet référencé ou projet hors liste, jamais les deux.
- Projet, navire et description obligatoires avant soumission.
- Thème obligatoire lorsqu'un TBT est déclaré.
- Appareillage postérieur ou égal à l'accostage.
- Quantités et compteurs non négatifs.
- Unicité d'une personne pour une même fonction d'équipage.
- Aucun fichier en attente au moment de la soumission.

## Sécurité et fichiers

Les chemins Storage sont alloués par `dpr_prepare_file_upload`; le navigateur ne peut pas choisir un chemin appartenant à une autre entreprise. Les métadonnées sont enregistrées avant l'envoi, puis confirmées après la présence de l'objet. Les téléchargements utilisent des URL signées de cinq minutes et sont journalisés. Le retrait d'un fichier est logique ; l'objet physique est conservé conformément à la règle de conservation indéfinie.

## Recette fonctionnelle requise

La bascule ne doit être validée qu'après exécution des cas suivants par les utilisateurs métier :

1. Marin : créer et valider un DPR, puis vérifier qu'il reste visible dans « Mes DPR ».
2. Marin : vérifier la modification de son propre brouillon avant trois jours, son passage en consultation après trois jours et l'absence des DPR d'autres émetteurs.
3. Capitaine : consulter tous les DPR, modifier un brouillon, valider tout DPR soumis et télécharger le PDF généré.
4. Admin/Direction/Armement : modifier, valider, réouvrir avec motif et supprimer logiquement avec motif.
5. Admin : ouvrir le diagnostic ; vérifier que les autres rôles ne voient pas le bouton.
6. Capitaine/Admin/Direction/Armement : consulter tous les DPR de la compagnie et reprendre la modification d'un DPR Marin après sa fenêtre de trois jours.
7. Vérifier les trois incidents en choix unique T0/T1/T2 et les exercices/motifs d'escale en choix multiples.
8. Vérifier le rejet des nombres négatifs, d'un appareillage antérieur, d'un TBT sans thème et d'une troisième photo.
9. Modifier une valeur puis fermer la fenêtre ou l'onglet ; vérifier l'avertissement de données non enregistrées.
10. Comparer le PDF généré aux données affichées et confirmer qu'aucun objet ni métadonnée PDF n'est créé dans Supabase.

## Point de validation

Le code et le schéma sont prêts pour une recette métier. La phase 7 n'autorise pas l'arrêt de SharePoint ; une décision de bascule distincte restera nécessaire à la date cible évolutive du 31/08/2026.
