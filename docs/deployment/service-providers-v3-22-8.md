# SeaPilot v3.22.8 — fournisseurs et sous-traitants

## Périmètre

- Nouveau module Achats `Gestion des Sous-Traitants`, réservé par défaut aux rôles Admin et Direction.
- Répertoire des sociétés classé par catégorie puis par nom, avec recherche, filtre d’état et fiche détaillée.
- Création et modification des sociétés, ajout de spécialités et de contacts.
- Le formulaire de frais Projet utilise le référentiel `Administration - Prestataires - Fournisseurs` et permet d’y ajouter une société absente.
- Le champ `Montant HT` est vide à la création pour permettre une saisie immédiate, sans devoir remplacer un zéro initial ; une valeur existante est sélectionnée à la prise de focus.
- Le champ `Unité` propose `Unité`, `m²`, `m³` et `L`, tout en acceptant de nouvelles valeurs.
- Les cases `Refacturable au client` et `Inclus à la facture client` sont supprimées. Les anciens champs SQL sont conservés uniquement pour compatibilité ; ils ne participent plus au calcul ni à la génération du PDF.

## Migration Supabase

Appliquer `20260825101557_service_provider_management.sql` avant de déployer l’interface. La migration :

- ajoute les politiques RLS d’insertion et de mise à jour pour Admin et Direction ;
- accorde les privilèges Data API nécessaires sans accorder la suppression physique ;
- initialise la visibilité du nouveau module pour Admin et Direction ;
- documente les deux anciens indicateurs de frais comme champs de compatibilité.

Le test pgTAP `service_provider_management_test.sql` couvre RLS, privilèges, visibilité de navigation et matrice des rôles.

## Déploiement

1. Vérifier la liste des migrations locale et distante.
2. Pousser la migration Supabase et exécuter le test de sécurité fournisseur.
3. Déployer le commit applicatif Vercel en production.
4. Contrôler `/modules/serviceProviders` avec un compte Admin ou Direction.
5. Dans un projet, ouvrir Facturation, créer un frais, vérifier le classement du fournisseur, la saisie directe du montant et l’ajout d’une unité libre.
6. Générer un PDF avec `Inclure les services refacturables dans le PDF` activé puis désactivé.

## Retour arrière

L’interface peut être rétablie sur la version précédente sans supprimer les données créées. En base, désactiver les trois politiques `*_manager_insert` et `*_manager_update` si l’écriture du référentiel doit être suspendue. Ne pas supprimer les sociétés, spécialités ou contacts créés en production.
