create table if not exists public.sharepoint_sources (
  key text primary key,
  title text not null,
  source_type text not null,
  module_key text not null,
  related_module_keys text[] not null default '{}'::text[],
  site_url text not null,
  drive_id text,
  list_id text,
  server_relative_url text,
  browser_url text,
  target_table text,
  import_priority integer not null default 100,
  confirmed boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sharepoint_sources_source_type_check
    check (source_type in ('list', 'library', 'lookup', 'external_link'))
);

create table if not exists public.sharepoint_import_steps (
  key text primary key,
  label text not null,
  display_order integer not null,
  target_tables text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sharepoint_field_mappings (
  id bigint generated always as identity primary key,
  source_key text not null references public.sharepoint_sources(key) on delete cascade,
  field_label text not null,
  internal_name text not null,
  data_type text not null,
  target_table text,
  target_column text,
  required boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sharepoint_field_mappings_unique_target'
      and conrelid = 'public.sharepoint_field_mappings'::regclass
  ) then
    alter table public.sharepoint_field_mappings
      add constraint sharepoint_field_mappings_unique_target
      unique (source_key, internal_name, target_table, target_column);
  end if;
end $$;

alter table public.people
  add column if not exists sharepoint_site_url text,
  add column if not exists sharepoint_list_id text,
  add column if not exists sharepoint_list_title text,
  add column if not exists sharepoint_item_id text,
  add column if not exists sharepoint_unique_id text,
  add column if not exists sharepoint_file_ref text,
  add column if not exists sharepoint_encoded_abs_url text,
  add column if not exists source_modified_at timestamptz;

alter table public.vessels
  add column if not exists type_label text,
  add column if not exists unit_type_label text,
  add column if not exists fleet_exit_on date,
  add column if not exists registration_number text,
  add column if not exists imo_number text,
  add column if not exists registration_port text,
  add column if not exists call_sign text,
  add column if not exists mmsi text,
  add column if not exists gross_tonnage text,
  add column if not exists max_people integer,
  add column if not exists crew_members text,
  add column if not exists medical_dotation text,
  add column if not exists length_overall text,
  add column if not exists sharepoint_site_url text,
  add column if not exists sharepoint_list_id text,
  add column if not exists sharepoint_list_title text,
  add column if not exists sharepoint_item_id text,
  add column if not exists sharepoint_unique_id text,
  add column if not exists sharepoint_file_ref text,
  add column if not exists sharepoint_encoded_abs_url text,
  add column if not exists source_modified_at timestamptz;

alter table public.planning_assignments
  add column if not exists sharepoint_site_url text,
  add column if not exists sharepoint_list_id text,
  add column if not exists sharepoint_list_title text,
  add column if not exists sharepoint_item_id text,
  add column if not exists sharepoint_unique_id text,
  add column if not exists sharepoint_file_ref text,
  add column if not exists sharepoint_encoded_abs_url text,
  add column if not exists source_modified_at timestamptz;

alter table public.hr_documents
  add column if not exists sharepoint_site_url text,
  add column if not exists sharepoint_list_id text,
  add column if not exists sharepoint_list_title text,
  add column if not exists sharepoint_item_id text,
  add column if not exists sharepoint_unique_id text,
  add column if not exists sharepoint_file_ref text,
  add column if not exists sharepoint_encoded_abs_url text,
  add column if not exists source_modified_at timestamptz;

create index if not exists sharepoint_sources_module_key_idx on public.sharepoint_sources (module_key);
create index if not exists sharepoint_sources_source_type_idx on public.sharepoint_sources (source_type);
create index if not exists sharepoint_sources_target_table_idx on public.sharepoint_sources (target_table);
create index if not exists sharepoint_sources_import_priority_idx on public.sharepoint_sources (import_priority, key);
create index if not exists sharepoint_field_mappings_source_key_idx on public.sharepoint_field_mappings (source_key);
create index if not exists sharepoint_field_mappings_target_table_idx on public.sharepoint_field_mappings (target_table);
create index if not exists people_sharepoint_item_idx on public.people (sharepoint_list_id, sharepoint_item_id);
create index if not exists vessels_sharepoint_item_idx on public.vessels (sharepoint_list_id, sharepoint_item_id);
create index if not exists planning_assignments_sharepoint_item_idx
  on public.planning_assignments (sharepoint_list_id, sharepoint_item_id);
create index if not exists hr_documents_sharepoint_item_idx on public.hr_documents (sharepoint_list_id, sharepoint_item_id);
create index if not exists hr_documents_sharepoint_file_ref_idx on public.hr_documents (sharepoint_file_ref);

insert into public.sharepoint_import_steps (key, label, display_order, target_tables)
values
  ('catalogs', 'Catalogues', 10, array['roles', 'modules', 'vessels', 'clients', 'stcw_certificates']),
  ('personnel', 'Personnel', 20, array['people']),
  ('planning', 'Planning', 30, array['planning_assignments', 'planning_days', 'planning_periods', 'planning_projects']),
  ('hr-documents-certificates', 'Documents RH et certificats', 40, array['hr_documents', 'fleet_certificates']),
  ('procedures', 'Procedures QHSE', 50, array['procedures', 'published_procedures']),
  ('dpr', 'Daily Progress Report', 60, array['dpr_items', 'dpr_archives', 'mgo_prices']),
  ('operations', 'Achats, audit, projets et contrats', 70, array['purchase_requests', 'action_items', 'projects', 'contract_documents']),
  ('kpi-definitions', 'Definitions KPI', 80, array['kpi_definitions'])
on conflict (key) do update
set label = excluded.label,
    display_order = excluded.display_order,
    target_tables = excluded.target_tables,
    updated_at = now();

insert into public.sharepoint_sources (
  key,
  title,
  source_type,
  module_key,
  related_module_keys,
  site_url,
  drive_id,
  list_id,
  server_relative_url,
  browser_url,
  target_table,
  import_priority,
  confirmed,
  notes
)
values
  ('list-kpi-definitions', 'Dashboard - KPI Definitions', 'list', 'kpi', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', null, null, null, null, 'kpi_definitions', 180, false, 'List ID must be exported live.'),
  ('list-indicateurs-projet-p144emdt', 'Indicateurs Projet P144EMDT', 'list', 'dpr', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', null, '3c26ee87-5f55-4018-a93e-634080cfc55e', '/sites/QHSE/Lists/Indicateurs Projet  P144EMDT', null, 'dpr_items', 120, true, null),
  ('list-demande-achat', 'Demande d''Achat', 'list', 'purchaseRequests', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', null, null, null, null, 'purchase_requests', 140, false, 'List ID and exact choice values must be exported live.'),
  ('list-audit', 'Audit', 'list', 'actionPlan', array['qhse'], 'https://bbtm668.sharepoint.com/sites/QHSE', null, null, '/sites/QHSE/Lists/Audit', null, 'action_items', 140, false, 'List ID and choice values must be exported live.'),
  ('list-rh-personnel-bbtm', 'RH - Personnel BBTM', 'list', 'humanResources', array['planning', 'dpr'], 'https://bbtm668.sharepoint.com/sites/QHSE', null, '3b6f504c-908a-4d3e-8319-a595acb54efe', '/sites/QHSE/Lists/RH%20%20Personnel%20BBTM', 'https://bbtm668.sharepoint.com/sites/QHSE/Lists/RH Personnel BBTM/Personnel Actif.aspx', 'people', 20, true, null),
  ('lookup-brevet', 'Brevet', 'lookup', 'humanResources', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', null, null, null, null, 'stcw_certificates', 10, false, 'Lookup target must be exported from BrevetPont field metadata.'),
  ('list-bbtm-flotte', 'BBTM - Flotte', 'list', 'fleet', array['planning', 'certificates', 'actionPlan', 'projects'], 'https://bbtm668.sharepoint.com/sites/QHSE', null, null, '/sites/QHSE/Lists/BBTM%20%20Flotte', null, 'vessels', 10, false, 'List ID and choice values must be exported live.'),
  ('list-kpi-projets-planning', 'KPI - Projets-Planning', 'list', 'planning', array['projects'], 'https://bbtm668.sharepoint.com/sites/QHSE', null, 'e1c7e91f-8fb3-4b2e-9c9a-015396cf49c9', '/sites/QHSE/Lists/KPI ProjetsPlanning', null, 'planning_projects', 30, true, null),
  ('list-bbtm-projets', 'BBTM - Projets', 'list', 'projects', array['dpr', 'planning'], 'https://bbtm668.sharepoint.com/sites/QHSE', null, null, '/sites/QHSE/Lists/BBTM  Projets', null, 'projects', 130, false, 'List ID and all editable fields must be exported live.'),
  ('list-bbtm-clients', 'BBTM Clients / BBTM - Clients', 'list', 'projects', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', null, null, '/sites/QHSE/Lists/BBTM Clients', null, 'clients', 10, false, 'Historic alias: /sites/QHSE/Lists/BBTM  Clients.'),
  ('list-remorque', 'Remorque', 'list', 'projects', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', null, null, '/sites/QHSE/Lists/Remorqu', null, 'towage_options', 15, false, null),
  ('list-smtr-journees-planning', 'SMTR - Journees - Planning', 'list', 'planning', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', null, 'e711a664-6c52-4e4e-95cc-0843ac7c5253', null, null, 'planning_days', 40, true, null),
  ('list-smtr-planning-periodes', 'SMTR - Planning Periodes', 'list', 'planning', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', null, 'c03eb1f4-1d24-4d86-b91e-9afaaa45870b', null, null, 'planning_periods', 41, true, null),
  ('list-mgo', 'MGO', 'list', 'dpr', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', null, null, null, null, 'mgo_prices', 10, false, 'List ID must be exported live.'),
  ('library-logos-systeme', 'Logos_Systeme', 'library', 'assets', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_OpWjZZ3tZsSZsJCs7hACGw', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Logos_Systeme', 'document_assets', 10, true, null),
  ('library-qsms', 'QSMS', 'library', 'procedures', array['dpr'], 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_ML9YyVmncCQIEcDti7Qfe1', '958cf50b-779a-4002-811c-0ed8bb41f7b5', '/sites/QHSE/QSMS', 'https://bbtm668.sharepoint.com/sites/QHSE/QSMS', 'procedures', 50, true, null),
  ('library-vehicules', 'Vehicules', 'library', 'fleet', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_MVOaWxW3m4TaRaHxYv5oSN', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Vhicules', 'fleet_documents', 70, true, null),
  ('library-permis-travail', 'Permis de Travail', 'library', 'qhse', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_Ps3Dtm4LyKR6K4I4H7P9e_', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Permis%20de%20Travail', 'work_permits', 80, true, null),
  ('library-dpr', 'DPR', 'library', 'dpr', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_PdxO_2G3U9Qp6tLqHQRY59', 'f6efc4dd-751b-423d-9ead-2ea1d0458e7d', '/sites/QHSE/DPR', 'https://bbtm668.sharepoint.com/sites/QHSE/DPR', 'dpr_archives', 60, true, null),
  ('library-certificats-flotte', 'Certificats Flotte BBTM', 'library', 'certificates', array['planning'], 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_PaPPP_2iCbSotVRmMO5eiw', 'fff33cda-20da-4a9b-8b55-46630ee5e8b0', '/sites/QHSE/Certificats%20Flotte%20BBTM', 'https://bbtm668.sharepoint.com/sites/QHSE/Certificats%20Flotte%20BBTM', 'fleet_certificates', 50, true, null),
  ('library-fiche-progres', 'Fiche de Progres', 'library', 'actionPlan', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_Mj5CrSdglTRb4MaXXyMXJH', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Fiche%20de%20Progrs', 'action_documents', 90, true, null),
  ('library-suivi-temps-travail', 'Suivi du Temps de Travail', 'library', 'humanResources', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_Ou6ZoCxQsvRqr8gJTNvSGV', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Suivi%20du%20Temps%20de%20Travail', 'work_time_documents', 95, true, null),
  ('library-archive-documentaire', 'Archive Documentaire', 'library', 'documents', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_NwHhKNAtGiS5T4iB5KLSdP', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Archive%20Documentaire', 'document_archive', 120, true, null),
  ('library-documents-projets', 'Documents Projets', 'library', 'projects', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_Ou31l1uVoWRrtjl4GcYGNl', null, '/sites/QHSE/Documents%20Projets', 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets', 'project_documents', 100, true, null),
  ('library-brevets-visites-medicales', 'Brevets et Visites Medicales', 'library', 'humanResources', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_MxKjjFptv3QpsTtkjX4xBr', 'c5382a31-dba6-42f7-9b13-b648d7e3106b', '/sites/QHSE/Brevets%20et%20Visites%20Mdicales', 'https://bbtm668.sharepoint.com/sites/QHSE/Brevets%20et%20Visites%20Mdicales', 'hr_documents', 40, true, null),
  ('library-documents-contractuels', 'Documents Contractuels', 'library', 'projects', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_OWUUcnVo9hTIk_y0nRfdyl', null, '/sites/QHSE/Documents Contractuels', 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels', 'contract_documents', 100, true, null),
  ('library-notes-service', 'Notes de Service', 'library', 'documents', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_PzEaXMIXBnQac4z9Bfn0AS', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service', 'service_notes', 115, true, null),
  ('library-qsms-pdf', 'QSMS - PDF', 'library', 'procedures', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_P51Zwapnf8RYcF01AFcpd0', '1a9cd5f9-77a6-45fc-8705-d35005729774', '/sites/QHSE/QSMS%20%20PDF', 'https://bbtm668.sharepoint.com/sites/QHSE/QSMS%20%20PDF', 'published_procedures', 55, true, null),
  ('library-alerte-securite', 'Alerte Securite', 'library', 'qhse', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_PrBPRtCQLYTZnX40aQXEEw', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Alerte%20Scurit', 'safety_alerts', 85, true, null),
  ('library-documentation-technique', 'Documentation Technique', 'library', 'maintenance', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_N1vCc4AjvBTp0F6ucDchlT', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Documentation%20Technique', 'technical_documents', 100, true, null),
  ('library-fiche-navire-equipement', 'Fiche Navire / Equipement', 'library', 'maintenance', array['fleet'], 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_OQ_OYJbt-iQIXI7zbswTBI', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Fiche%20Navire%20%20Equipement', 'vessel_equipment_documents', 90, true, null),
  ('library-registre-apparaux-levage', 'Registre des Apparaux de Levage - Rapports', 'library', 'lifting', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_ObdT_qMKkoToMJ-tmxTuel', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Registre%20des%20Apparaux%20de%20Levage%20%20Rapports', 'lifting_reports', 90, true, null),
  ('library-documents-partages', 'Documents', 'library', 'documents', '{}', 'https://bbtm668.sharepoint.com/sites/QHSE', 'b!j0eX05ggd0iS7a1x5WccnspY9pQFKhPc9dkTkf_NP6M6l0cHfTa_D_bfxAB9T', null, null, 'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20partages', 'shared_documents', 120, true, null)
on conflict (key) do update
set title = excluded.title,
    source_type = excluded.source_type,
    module_key = excluded.module_key,
    related_module_keys = excluded.related_module_keys,
    site_url = excluded.site_url,
    drive_id = excluded.drive_id,
    list_id = excluded.list_id,
    server_relative_url = excluded.server_relative_url,
    browser_url = excluded.browser_url,
    target_table = excluded.target_table,
    import_priority = excluded.import_priority,
    confirmed = excluded.confirmed,
    notes = excluded.notes,
    updated_at = now();

insert into public.sharepoint_field_mappings (
  source_key,
  field_label,
  internal_name,
  data_type,
  target_table,
  target_column,
  required,
  notes
)
values
  ('list-rh-personnel-bbtm', 'Nom', 'Title', 'Text', 'people', 'last_name', true, null),
  ('list-rh-personnel-bbtm', 'Prenom', 'Pr_x00e9_nom', 'Text', 'people', 'first_name', true, null),
  ('list-rh-personnel-bbtm', 'Email', 'Email', 'Text/Url', 'people', 'email', false, 'Alias possible: Mail.'),
  ('list-rh-personnel-bbtm', 'Numero de Marin', 'NumerodeMarin', 'Text', 'people', 'sailor_number', false, null),
  ('list-rh-personnel-bbtm', 'Fonction', 'Fonction', 'Choice', 'people', 'function_label', false, null),
  ('list-rh-personnel-bbtm', 'Grade', 'Grade', 'Choice', 'people', 'grade_label', false, null),
  ('list-rh-personnel-bbtm', 'Registre', 'Registre', 'Choice', 'people', 'register_label', false, null),
  ('library-brevets-visites-medicales', 'Collaborateur', 'CollaborateurId', 'Lookup', 'hr_documents', 'person_id', false, null),
  ('library-brevets-visites-medicales', 'Nom fichier', 'FileLeafRef', 'Text', 'hr_documents', 'title', false, null),
  ('library-brevets-visites-medicales', 'Date echeance', 'DateEch_x00e9_ance', 'DateTime', 'hr_documents', 'expires_on', false, null),
  ('list-bbtm-flotte', 'Nom navire', 'Title', 'Text', 'vessels', 'name', true, null),
  ('list-bbtm-flotte', 'Acronyme', 'Acronyme', 'Text', 'vessels', 'acronym', false, null),
  ('list-bbtm-flotte', 'Navire actif', 'NavireActif', 'Boolean', 'vessels', 'active', false, null),
  ('list-smtr-journees-planning', 'Marin', 'NomMarin', 'Text', 'planning_days', 'crew_name', false, null),
  ('list-smtr-journees-planning', 'Date travail', 'DateTravail', 'DateTime', 'planning_days', 'work_date', false, null),
  ('list-smtr-journees-planning', 'Slot365', 'Slot365', 'Text', 'planning_days', 'slot365', false, 'Critical field for planning reconstruction.'),
  ('list-smtr-planning-periodes', 'Marin', 'NomMarin', 'Text', 'planning_periods', 'crew_name', false, null),
  ('list-smtr-planning-periodes', 'Date debut', 'DateDebut', 'DateTime', 'planning_periods', 'starts_on', false, null),
  ('list-smtr-planning-periodes', 'Date fin', 'DateFin', 'DateTime', 'planning_periods', 'ends_on', false, null),
  ('list-kpi-projets-planning', 'Statut', 'Statut', 'Choice', 'planning_projects', 'status', false, 'Known values include Offre Transmise, Contrat Signe, A planifier, Valide, Facture.')
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

grant select on
  public.sharepoint_sources,
  public.sharepoint_import_steps,
  public.sharepoint_field_mappings
to authenticated;

grant insert, update, delete on
  public.sharepoint_sources,
  public.sharepoint_import_steps,
  public.sharepoint_field_mappings
to authenticated;

grant usage on public.sharepoint_field_mappings_id_seq to authenticated;

alter table public.sharepoint_sources enable row level security;
alter table public.sharepoint_import_steps enable row level security;
alter table public.sharepoint_field_mappings enable row level security;

drop policy if exists sharepoint_sources_authenticated_read on public.sharepoint_sources;
create policy sharepoint_sources_authenticated_read on public.sharepoint_sources
  for select to authenticated
  using (true);

drop policy if exists sharepoint_sources_admin_write on public.sharepoint_sources;
create policy sharepoint_sources_admin_write on public.sharepoint_sources
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists sharepoint_import_steps_authenticated_read on public.sharepoint_import_steps;
create policy sharepoint_import_steps_authenticated_read on public.sharepoint_import_steps
  for select to authenticated
  using (true);

drop policy if exists sharepoint_import_steps_admin_write on public.sharepoint_import_steps;
create policy sharepoint_import_steps_admin_write on public.sharepoint_import_steps
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists sharepoint_field_mappings_authenticated_read on public.sharepoint_field_mappings;
create policy sharepoint_field_mappings_authenticated_read on public.sharepoint_field_mappings
  for select to authenticated
  using (true);

drop policy if exists sharepoint_field_mappings_admin_write on public.sharepoint_field_mappings;
create policy sharepoint_field_mappings_admin_write on public.sharepoint_field_mappings
  for all to authenticated
  using (public.has_role('admin'))
  with check (public.has_role('admin'));
