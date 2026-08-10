# Opérations Planning rattachées aux Projets/Contrats

Le Planning utilise désormais le Projet comme contrat de référence et chaque exécution comme une opération distincte. Une opération peut concerner un nombre quelconque de navires ; elle apparaît sur chaque ligne concernée et les modifications portent sur l'unique opération partagée.

## Parcours et droits

- Le double-clic dans une ligne de navire propose de rattacher l'opération à un Projet/Contrat existant.
- Admin et Direction peuvent ouvrir l'assistant Projet complet pour créer le contrat et sa première opération. L'utilisateur reste ensuite dans le module Projets.
- Armement peut créer et modifier une opération rattachée à un Projet existant, mais ne peut pas créer de Projet commercial.
- Le loyer d'affrètement de l'opération est visible et modifiable uniquement par Admin et Direction. Cette restriction est appliquée à la fois dans l'interface, dans les RPC et dans les droits de colonnes Postgres.

## Rapprochement historique

La migration extrait uniquement un code exact de forme `P<nombre>` dans le titre ou la description des anciennes opérations non liées. Elle rattache automatiquement une opération lorsqu'un unique Projet actif de la même société porte exactement ce code. Aucun rapprochement approximatif par titre n'est effectué.

Les cas `code_not_found`, `ambiguous` et `no_code` restent non liés et sont consignés dans `planning_operation_project_reconciliation` pour traitement manuel par Admin ou Direction. Le script agrégé de contrôle est `supabase/validation/planning_contract_operations.sql`.
