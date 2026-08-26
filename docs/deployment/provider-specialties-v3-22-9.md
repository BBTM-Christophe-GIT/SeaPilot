# SeaPilot v3.22.9 — fournisseurs par spécialité

## Périmètre

- Le frais imputable commence par un fournisseur recherchable et classé par spécialité.
- Le choix historique `Saisir une nouvelle société` disparaît au profit du bouton `+ Ajouter`, placé au-dessus du sélecteur et ouvrant la fiche société complète.
- La création d'une société enregistre la fiche et sa spécialité principale dans le référentiel Supabase `service_providers` / `service_provider_specialties`.
- Le champ `Catégorie` du frais et la colonne correspondante sont remplacés par `Spécialités`, rempli automatiquement à partir du fournisseur.
- Le PDF de facturation présente désormais `Société` puis `Spécialités` et utilise l'instantané enregistré avec le frais.
- Le formulaire Planning `Nouvelle Visite / Audit` reprend le sélecteur de prestataire recherchable par spécialité.
- Le type `Arrêt Technique` ajoute le champ automatique `Spécialités` au formulaire, sans modifier les autres types de visite.

## Migration Supabase

Appliquer `20260825115428_provider_specialty_billing_and_technical_stop.sql` avant le client Vercel. La migration :

- ajoute `project_chargeable_expenses.supplier_specialties text[]` avec valeur par défaut vide et reprise des données existantes ;
- autorise `technical_stop` dans la contrainte des visites navire ;
- actualise la fonction sécurisée `save_vessel_visit` sans modifier ses privilèges.

Le test pgTAP `provider_specialty_billing_and_technical_stop_test.sql` vérifie le nouveau champ, la contrainte, la fonction et son droit d'exécution.

## Déploiement et recette

1. Exécuter le dry-run Supabase puis appliquer la migration en production.
2. Déployer le commit applicatif Vercel.
3. Dans un projet, ouvrir `Facturation` puis `Ajouter un frais imputable` : rechercher un mot de spécialité, choisir une société et vérifier le remplissage automatique.
4. Ouvrir `+ Ajouter`, enregistrer une société, puis vérifier qu'elle est sélectionnée et persistée dans Supabase.
5. Générer le PDF de facturation et contrôler l'ordre `Société`, `Spécialités`.
6. Dans Planning, ouvrir `Nouvelle Visite / Audit`, sélectionner `Arrêt Technique`, rechercher un prestataire puis contrôler la spécialité automatique.

## Retour arrière

Le client peut être remis sur v3.22.8 sans supprimer les données créées. Le nouveau champ de frais et la nouvelle valeur de visite sont additifs ; ils doivent rester en base afin de préserver les frais et arrêts techniques déjà enregistrés.
