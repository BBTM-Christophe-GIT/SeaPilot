# SeaPilot v3.12.12 - import XLSM approuvé et registre maritime

Cette livraison traite les classeurs XLSM annuels comme des données déjà approuvées.
Elle n’exécute jamais les macros et ne transforme pas les valeurs du classeur en
seuils réglementaires implicites.

## Comportement métier

- Le serveur compare chaque journée du XLSM aux intervalles actifs déjà enregistrés.
- Une journée strictement identique (phases, navire, bordée et commentaire) est
  conservée sans créer de doublon.
- Une journée différente peut remplacer l’existant lorsque l’option de remplacement
  est explicitement activée et qu’un motif d’audit est fourni.
- Les anciens intervalles remplacés sont invalidés, jamais effacés de l’historique.
- Les registres touchés sont directement placés au statut `validated` et reçoivent
  un événement immuable `approved_import`. Aucune nouvelle signature du marin ou
  validation du capitaine n’est demandée après l’import.
- Le navire indiqué dans le XLSM reste utilisé lorsqu’aucune affectation Planning
  publiée ne fournit un navire pour la journée.

## Brouillons

La croix présente sur une carte `Brouillon` retire la carte de la liste après
confirmation. Les créneaux et commentaires non validés sont supprimés, tandis que
le registre est masqué par `discarded_at` afin de préserver la trace d’audit. Une
réouverture ultérieure de la même période réactive proprement le registre.

## PDF

Le registre mensuel est produit à la demande sur deux pages :

1. une grille A4 paysage de 31 jours et 48 demi-heures, inspirée du registre maritime
   fourni, traduite en français et complétée avec l’identité, le navire, l’OMI, le
   pavillon, le validateur, les commentaires et les contrôles 24 h / 7 jours ;
2. une synthèse A4 portrait avec non-conformités, réponses structurées, signatures
   figées ou mention d’import approuvé, puis journal d’audit.

Aucun PDF permanent n’est stocké par cette fonctionnalité.

## Migration et vérification

Migration :
`supabase/migrations/20260807002926_working_time_replace_validated_days_discard_drafts.sql`

Vérifications locales :

```text
npx supabase db reset --local
npx supabase test db --local supabase/tests/working_time_excel_import_test.sql
pnpm test
pnpm lint
pnpm build
```

Le test pgTAP couvre 44 assertions, dont la comparaison stricte, le remplacement,
la validation automatique, la traçabilité et le retrait d’un brouillon.

## Déploiement

1. appliquer les migrations Supabase sur l’environnement ciblé ;
2. déployer le client `3.12.12` ;
3. vérifier un aperçu sans remplacement, puis un import approuvé avec une journée
   identique et une journée différente ;
4. vérifier que l’identique est ignorée, que la différente est remplacée et que le
   registre reste validé ;
5. générer un registre PDF mensuel et contrôler les deux pages.

La migration est additive pour les données. Le retour arrière applicatif doit
conserver les colonnes et événements créés afin de ne pas perdre la traçabilité des
imports déjà effectués.
