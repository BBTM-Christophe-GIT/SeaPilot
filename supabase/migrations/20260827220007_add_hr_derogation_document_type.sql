-- Add the administrative "Dérogation" document type to the shared HR catalogue.
--
-- The catalogue is consumed by the HR document-creation picker. Keeping this
-- change in an idempotent migration makes it available in every environment.

insert into public.stcw_certificates (
  source_list_id,
  source_item_id,
  name,
  category,
  file_name,
  stcw_rules,
  is_credential,
  active
)
values (
  '8c8561d7-9fb4-420f-8290-b66309d07e92',
  56,
  'Dérogation',
  'Ressources Humaines',
  'Dérogation',
  '{}',
  false,
  true
)
on conflict (source_list_id, source_item_id) do update set
  name = excluded.name,
  category = excluded.category,
  file_name = excluded.file_name,
  stcw_rules = excluded.stcw_rules,
  is_credential = excluded.is_credential,
  active = excluded.active,
  updated_at = now();
