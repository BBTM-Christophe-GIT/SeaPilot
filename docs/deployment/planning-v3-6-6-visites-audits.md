# Planning v3.6.6 — Visites, audits et absences

## Résultat livré

La version 3.6.6 ajoute les visites et audits directement sur la ligne du navire dans le planning, généralise la suppression administrateur à toutes les demandes d’absence et affiche les congés validés sous la forme d’un bandeau noir « Vacances ».

Le design implémenté reprend les trois prévisualisations validées avant codage :

- formulaire latéral Visite / Audit ;
- fiche de détail avec coordonnées cliquables du prestataire ;
- bouton destructif rouge à texte blanc lisible.

## Audit de départ

- La suppression définitive était limitée au type `leave` dans l’interface et dans la RPC `delete_planning_leave`.
- Le style tardif du bouton rouge écrasait seulement le fond, sans rétablir la couleur du texte ; le texte rouge sur fond rouge était illisible.
- Aucun catalogue de prestataires n’existait dans Supabase.
- Le fichier IQY désigne la liste SharePoint `5e29f7db-a85e-4147-9c54-b00f0e588f7e`.
- La source SharePoint contient 40 éléments réconciliables par identifiant. Les 32 éléments déjà matérialisés dans la vue ouverte ont aussi été contrôlés, notamment SOCOTEC, DNV, Bureau Veritas, ANFR, APAVE, LABEO et AgroQual.
- Les pièces jointes Visite / Audit n’avaient ni bucket privé ni politique RLS.

## Migration par phases

### Phase 0 — Source et traçabilité

- Enregistrer la source `list-administration-prestataires-fournisseurs` dans l’inventaire SharePoint.
- Conserver le List ID, l’Item ID et la date du relevé pour chaque prestataire.
- Importer aussi les éléments sans catégorie afin de ne pas exclure SOCOTEC.

### Phase 1 — Modèle Supabase

- Créer `service_providers`.
- Créer `vessel_visits`, `vessel_visit_occurrences` et `vessel_visit_attachments`.
- Autoriser 1 à 10 occurrences par demande ; plusieurs horaires identiques sur une même journée restent représentables dès lors que l’heure diffère.
- Créer les RPC sécurisées `save_vessel_visit`, `delete_vessel_visit` et `delete_planning_absence`.
- Ajouter les écritures au journal Planning.

### Phase 2 — Sécurité et stockage

- Activer RLS sur les quatre tables.
- Limiter la lecture au périmètre Planning de l’utilisateur.
- Limiter création et modification aux rôles autorisés à éditer le planning.
- Limiter la suppression définitive des visites/audits et des absences aux administrateurs.
- Stocker les fichiers dans le bucket privé `vessel-visits`, limité à 20 Mo par fichier et aux formats PDF, image, Word et Excel.
- Délivrer les fichiers par URL signée de cinq minutes.

### Phase 3 — Import prestataires

- Charger l’instantané vérifié des 40 éléments SharePoint.
- Utiliser une montée de version idempotente sur `(sharepoint_list_id, sharepoint_item_id)`.
- Laisser le pipeline SharePoint reprendre ensuite la synchronisation avec les vrais identifiants.

### Phase 4 — Interface Planning

- Ajouter une action violette Visite / Audit sur chaque ligne navire.
- Afficher et empiler les occurrences au niveau du navire, y compris deux ou trois visites le même jour.
- Ouvrir la fiche prestataire en cliquant sur une occurrence.
- Permettre l’ajout de plusieurs dates/heures dans un même formulaire.
- Afficher les coordonnées téléphoniques et e-mails sous forme de liens.
- Afficher les pièces jointes privées et leur téléchargement.

### Phase 5 — Absences et lisibilité

- Afficher les congés validés en noir, avec le libellé blanc « Vacances ».
- Exposer la suppression de chaque type de demande uniquement à l’administrateur.
- Conserver l’instantané supprimé et les dépendances associées dans l’historique Planning.
- Forcer le texte blanc du bouton rouge, y compris au survol et au focus.

### Phase 6 — Validation et production

- Appliquer les migrations sur Supabase.
- Vérifier le catalogue importé : 40 prestataires, dont 22 avec au moins une adresse e-mail.
- Exécuter les tests unitaires, le lint Supabase, le lint frontend et le build de production.
- Contrôler visuellement en vue flotte : action navire, empilement des visites, détail prestataire et bandeau Vacances.
- Pousser la branche, ouvrir la pull request puis vérifier le déploiement Vercel.

## Repli

En cas d’anomalie frontend, revenir au déploiement Vercel précédent sans supprimer les tables. Les nouvelles données restent isolées dans les tables `vessel_visit_*`. En cas d’anomalie de stockage, désactiver les ajouts de fichiers côté interface tout en conservant les métadonnées et le bucket privé pour analyse.
