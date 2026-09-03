# Projets — descriptions des prestations de l’offre commerciale v3.27.10

## Fonctionnalités

- L’étape « Offre Commerciale » propose trois descriptions facultatives, placées sous le loyer d’affrètement, les frais de mobilisation et les frais de démobilisation.
- Les descriptions sont enregistrées dans le payload contractuel existant du projet et restent modifiables avec les autres données de l’offre.
- L’aperçu et le PDF affichent uniquement les descriptions renseignées. Une description vide ou composée d’espaces est totalement omise.
- Le générateur PDF conserve le texte complet et crée une page de continuation lorsque la longueur des descriptions ne permet pas de garder une mise en page lisible.

## Migration

La migration `20260901150549_allow_commercial_offer_service_descriptions.sql` étend la liste stricte des clés acceptées par `public.is_valid_supplytime_data(jsonb)` avec les trois descriptions commerciales. Elle ne modifie ni les données existantes, ni les droits, ni les politiques RLS.

## Vérifications

- Tests d’interface sur l’ordre, la saisie, l’aperçu conditionnel et la persistance des champs.
- Tests unitaires sur le nettoyage des valeurs et leur présence conditionnelle dans les données de génération.
- Test pgTAP du validateur contractuel, suite Vitest complète, lint, vérification TypeScript et build de production.

## Retour arrière

Restaurer la version applicative précédente pour masquer les champs. Le validateur étendu peut rester déployé sans effet sur les données existantes ; pour un retour arrière SQL strict, restaurer la définition précédente de `public.is_valid_supplytime_data(jsonb)`.
