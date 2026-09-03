# Projets — émission des offres et contrats v3.27.9

## Fonctionnalités

- La modification d’un projet accepte désormais tous les champs structurés utilisés par les offres commerciales, les contrats de remorquage, les contrats d’affrètement et les BIMCO P144.
- Le validateur Supabase reste strict : seules les clés contractuelles connues sont acceptées, avec des valeurs texte ou nulles et une taille maximale de 1 Mio.
- L’action documentaire ouvre un choix avant émission :
  - document généré seul ;
  - archive ZIP contenant le document généré et les pièces jointes privées classées sur le projet.
- Le document émis est classé dans l’espace privé SeaPilot avant son téléchargement. Si l’archive ne peut pas être constituée, le document seul est téléchargé et l’erreur est signalée.

## Migration

La migration `20260901141642_extend_project_contract_payload_validator.sql` remplace uniquement la fonction `public.is_valid_supplytime_data(jsonb)`. Elle ne modifie ni les données existantes, ni les droits, ni les politiques RLS.

## Vérifications

- Test pgTAP dédié au validateur contractuel.
- Tests Vitest du stockage, du contenu ZIP et du parcours d’émission.
- Vérification TypeScript, lint, suite de tests et build de production.

## Retour arrière

En cas de retour arrière applicatif, restaurer la version précédente de l’interface. Le validateur étendu peut rester en place sans modifier les données ; si une restauration SQL est nécessaire, redéployer la définition antérieure de `public.is_valid_supplytime_data(jsonb)`.
