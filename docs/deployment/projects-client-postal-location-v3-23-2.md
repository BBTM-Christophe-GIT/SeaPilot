# Clients — adresse postale assistée (v3.23.2)

## Résultat

La création et la modification d’un client proposent désormais une saisie d’adresse plus fiable :

- le champ visible `Pays` est supprimé des formulaires ;
- le `Code postal` est enregistré dans Supabase ;
- un code postal français interroge le référentiel public des communes et présélectionne la ville la plus peuplée ;
- toutes les communes associées au code restent disponibles dans la liste déroulante ;
- `Autre ville…` conserve une saisie libre pour les adresses étrangères ou en cas d’indisponibilité du service ;
- le pays est résolu en arrière-plan depuis l’adresse, la ville et le code postal, puis persisté avec le client.

Les propositions de communes utilisent l’API Découpage administratif de l’État (`geo.api.gouv.fr`). La vérification d’une adresse française utilise le service de géocodage de la Géoplateforme (`data.geopf.fr`). Une panne de ces services ne bloque jamais l’enregistrement.

## Données et sécurité

La migration `20260830103000_project_client_postal_location.sql` ajoute `public.clients.postal_code` et étend la RPC contrôlée `public.clients_save`. Les politiques RLS existantes et les droits `admin` / `direction` restent inchangés.

Ce parcours n’écrit aucune donnée dans SharePoint. Les fiches clients, y compris le code postal et le pays détecté, restent stockées exclusivement dans Supabase.

## Version

- application : `3.23.2`
- build : `2026-08-30.0001`
