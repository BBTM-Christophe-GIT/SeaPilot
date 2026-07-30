# SeaPilot v3.7.0 — Planning, facturation projets et fenêtres

Date de livraison : 30 juillet 2026.

## Périmètre

Cette version corrige la duplication de l’opération P144 dans le Planning, unifie les statuts Projet et introduit la facturation mensuelle dans le module Projets.

Le module reste nommé **Projets**. La colonne de gauche est la liste des **Contrats** ; la fiche du contrat sélectionné conserve ses opérations chronologiques et ajoute l’onglet **Facturation**.

## Planning

- Les statuts Projet sont limités à `Non validé`, `Validé`, `Stand-by météo` et `Facturé`.
- Les anciennes valeurs sont converties explicitement par la migration et par la couche TypeScript.
- L’annulation devient un état indépendant (`cancelled_at`, `cancelled_by`, `cancellation_reason`) et ne modifie plus le statut métier.
- Un clic droit sur une barre Projet ouvre un menu clavier/souris : détails, modification, duplication, changement de statut, annulation et suppression.
- Les mutations sont attendues avant mise à jour de l’écran. En cas d’échec, l’élément et la confirmation restent affichés avec un message d’erreur.
- Les opérations annulées restent visibles dans le Planning, avec une présentation atténuée et barrée.
- Le champ « Responsable » est retiré uniquement du formulaire de modification d’une opération ; la donnée historique reste lisible.

### Réconciliation P144

La migration conserve l’occurrence historique SharePoint `planning_projects.id = 13` lorsque les garde-fous métier correspondent (société 1, P144, GOURY, item SharePoint 20). Elle la rattache au contrat catalogue P144, copie le loyer du contrat si nécessaire, transfère les références documentaires et supprime uniquement la copie technique correspondante.

L’opération distincte planifiée sur LE ROZEL n’est pas concernée.

## Facturation mensuelle

Trois tables protégées par RLS sont ajoutées :

- `project_billing_periods` : une fiche par projet et mois calendaire ;
- `project_chargeable_expenses` : frais Gasoil, Port, Eau ou Autre ;
- `project_billing_documents` : métadonnées des pièces privées.

La fiche mensuelle comprend la référence client, le numéro de facture, les dates d’émission, d’envoi, d’échéance et de paiement, le montant HT et les commentaires. Elle ne modifie jamais automatiquement le statut global du Projet.

Les frais comprennent le fournisseur, la facture, les montants HT/TTC, la devise, la quantité/unité, le caractère refacturable, l’inclusion dans la facture client et un rattachement DPR optionnel.

## Fichiers et sécurité

Le bucket Supabase Storage privé `project-files` est créé avec une limite de 50 Mo et une liste de types autorisés. Les objets sont classés sous `projects/{projectId}/{billingPeriodId}/…`.

- lecture par URL signée de courte durée ;
- écriture et suppression réservées aux rôles `admin` et `direction` de la société ;
- RLS activée sur toutes les nouvelles tables ;
- aucune URL publique persistante n’est enregistrée.

## Export

L’export « Éléments de facturation » reprend la structure du document de référence P144 :

- lignes journalières d’opération ;
- frais imputables ;
- total des loyers, total des frais et total HT ;
- filtre par mois ou période personnalisée, navire et projet ;
- aperçu PDF avant téléchargement ;
- téléchargement PDF standard, PDF enrichi des annexes PDF, ou ZIP contenant toutes les pièces.

Le loyer utilisé est d’abord la valeur propre à l’opération, puis le loyer du contrat en repli.

## Système de fenêtres

Le composant partagé `AppDialog` fournit les tailles `sm`, `md`, `lg`, `xl` et `fullscreen`, ainsi que les variantes modale, tiroir et aperçu. Il gère :

- focus initial, boucle de focus et restitution du focus ;
- fermeture par Échap ou clic sur l’arrière-plan ;
- verrouillage pendant une mutation ;
- en-tête et pied fixes avec contenu central défilant ;
- adaptation mobile en panneau bas.

Le menu `AppContextMenu` ajoute le repositionnement dans le viewport, la fermeture extérieure et la navigation au clavier.

La fiche d’opération Projet, l’éditeur Planning Projet, les confirmations dangereuses et l’éditeur de frais utilisent ce socle dans cette version. Les anciennes fenêtres restent compatibles avec les styles normalisés pendant leur migration progressive.

## Migration

Migration : `supabase/migrations/20260730041602_planning_billing_dialog_standardization.sql`.

Avant application, le script a été exécuté intégralement dans une transaction de validation suivie d’un `ROLLBACK` sur le projet Supabase de production.
