-- Projects migration - phase 1: additive target model, tenant isolation and security.
-- This migration changes schema and governance only. It does not import SharePoint data.
-- SharePoint remains the physical file store; only file metadata is represented here.
--
-- Rollback strategy:
--   1. Revoke the phase-1 RPCs and restore the four previous project RLS policies.
--   2. Disable the phase-1 triggers, preserving project_change_log for audit export.
--   3. Keep company_id and provenance columns while any phase-1 rows exist.
--   4. Drop new constraints/tables/columns only after proving they contain no required data.
-- The migration is intentionally additive and uses NOT VALID where historical rows must be
-- preserved until the controlled data-reconciliation phase.

create or replace function public.is_valid_project_source_payload(value jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select value is not null
    and jsonb_typeof(value) = 'object'
    and octet_length(value::text) <= 1048576;
$$;

comment on function public.is_valid_project_source_payload(jsonb) is
  'Accepts a JSON object up to 1 MiB. Used only for immutable source traceability and unmapped historical fields.';

create or replace function public.is_valid_supplytime_data(value jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select value is not null
    and jsonb_typeof(value) = 'object'
    and octet_length(value::text) <= 1048576
    and not exists (
      select 1
      from jsonb_each(value) entry
      where entry.key <> all (array[
        'box01_owners',
        'box02_charterers',
        'box03_vessel',
        'box04_delivery_date',
        'box05_cancelling_date',
        'box06_port_delivery',
        'box07_delivery_range',
        'box08_notice_delivery',
        'box09_period',
        'box10_extension',
        'box11_continuation',
        'box12_mobilisation',
        'box13_early_termination',
        'box14_bunker_delivery',
        'box15_declaration',
        'box16_area_operation',
        'box17_employment',
        'box18_delivery_hour',
        'box19_special_fuel',
        'box20_charter_hire',
        'box21_extension_hire',
        'box22_invoice_remittance',
        'box23_payment',
        'box24_account_group',
        'box25_internal_price',
        'box26_max_price',
        'box27_war_risk',
        'box28_terror',
        'box29_notice_money',
        'box30_cancellation_clause',
        'box31_taxes',
        'box32_other_law',
        'box33_dispute_resolution',
        'box34_additional_clauses',
        'signature_owners',
        'signature_charterers'
      ]::text[])
        or jsonb_typeof(entry.value) not in ('string', 'null')
    );
$$;

comment on function public.is_valid_supplytime_data(jsonb) is
  'Validates supplytime-2017-v1: exactly the documented 34 boxes plus two signature placeholders; values are text or JSON null; no nested or unknown key; maximum 1 MiB.';

create or replace function public.normalize_project_code(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select nullif(upper(regexp_replace(trim(value), '\s+', '', 'g')), '');
$$;

-- The catalog and every project-dependent row receive an explicit tenant key.
alter table public.clients add column if not exists company_id bigint;
alter table public.projects add column if not exists company_id bigint;
alter table public.project_documents add column if not exists company_id bigint;
alter table public.contract_documents add column if not exists company_id bigint;
alter table public.dpr_items add column if not exists company_id bigint;
alter table public.dpr_archives add column if not exists company_id bigint;
alter table public.purchase_requests add column if not exists company_id bigint;
alter table public.action_items add column if not exists company_id bigint;
alter table public.action_documents add column if not exists company_id bigint;

do $$
declare
  initial_company_id bigint;
begin
  select id into initial_company_id from public.companies where code = 'bbtm';
  if initial_company_id is null then
    raise exception 'Initial company bbtm is required before the Projects phase-1 migration';
  end if;

  update public.clients set company_id = initial_company_id where company_id is null;
  update public.projects set company_id = initial_company_id where company_id is null;
  update public.project_documents set company_id = initial_company_id where company_id is null;
  update public.contract_documents set company_id = initial_company_id where company_id is null;
  update public.dpr_items set company_id = initial_company_id where company_id is null;
  update public.dpr_archives set company_id = initial_company_id where company_id is null;
  update public.purchase_requests set company_id = initial_company_id where company_id is null;
  update public.action_items set company_id = initial_company_id where company_id is null;
  update public.action_documents set company_id = initial_company_id where company_id is null;
end $$;

alter table public.clients alter column company_id set not null;
alter table public.projects alter column company_id set not null;
alter table public.project_documents alter column company_id set not null;
alter table public.contract_documents alter column company_id set not null;
alter table public.dpr_items alter column company_id set not null;
alter table public.dpr_archives alter column company_id set not null;
alter table public.purchase_requests alter column company_id set not null;
alter table public.action_items alter column company_id set not null;
alter table public.action_documents alter column company_id set not null;

alter table public.clients alter column company_id set default public.current_planning_company_id();
alter table public.projects alter column company_id set default public.current_planning_company_id();
alter table public.project_documents alter column company_id set default public.current_planning_company_id();
alter table public.contract_documents alter column company_id set default public.current_planning_company_id();
alter table public.dpr_items alter column company_id set default public.current_planning_company_id();
alter table public.dpr_archives alter column company_id set default public.current_planning_company_id();
alter table public.purchase_requests alter column company_id set default public.current_planning_company_id();
alter table public.action_items alter column company_id set default public.current_planning_company_id();
alter table public.action_documents alter column company_id set default public.current_planning_company_id();

alter table public.clients alter column source_label set default 'seapilot';
alter table public.projects alter column source_label set default 'seapilot';

alter table public.clients
  add column if not exists source_payload jsonb not null default '{}'::jsonb,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.projects
  add column if not exists delivery_at timestamptz,
  add column if not exists redelivery_at timestamptz,
  add column if not exists charter_starts_at timestamptz,
  add column if not exists charter_ends_at timestamptz,
  add column if not exists delivery_port text,
  add column if not exists redelivery_port text,
  add column if not exists contract_type text,
  add column if not exists operation_area text,
  add column if not exists is_rov_support boolean not null default false,
  add column if not exists is_diving_support boolean not null default false,
  add column if not exists source_payload jsonb not null default '{}'::jsonb,
  add column if not exists archived_at timestamptz,
  add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists archived_by uuid references public.profiles(id) on delete set null;

alter table public.project_documents
  add column if not exists sharepoint_drive_id text,
  add column if not exists sharepoint_drive_item_id text,
  add column if not exists file_name text,
  add column if not exists folder_path text,
  add column if not exists mime_type text,
  add column if not exists file_extension text,
  add column if not exists file_size_bytes bigint,
  add column if not exists source_etag text,
  add column if not exists source_ctag text,
  add column if not exists source_created_at timestamptz,
  add column if not exists is_folder boolean not null default false,
  add column if not exists source_payload jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null default auth.uid();

alter table public.contract_documents
  add column if not exists sharepoint_drive_id text,
  add column if not exists sharepoint_drive_item_id text,
  add column if not exists file_name text,
  add column if not exists folder_path text,
  add column if not exists mime_type text,
  add column if not exists file_extension text,
  add column if not exists file_size_bytes bigint,
  add column if not exists source_etag text,
  add column if not exists source_ctag text,
  add column if not exists source_created_at timestamptz,
  add column if not exists is_folder boolean not null default false,
  add column if not exists source_payload jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references public.profiles(id) on delete set null default auth.uid();

create table if not exists public.project_contracts (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id() references public.companies(id) on delete restrict,
  project_id bigint not null,
  owner_identity text,
  vessel_assignment_limit text,
  extension_count integer,
  extension_duration numeric(12, 3),
  extension_unit text,
  auto_extension_period text not null default 'Voyage',
  max_extension_days integer,
  mobilisation_fee numeric(14, 2),
  demobilisation_fee numeric(14, 2),
  fee_currency text,
  charter_hire numeric(14, 2),
  extension_hire numeric(14, 2),
  hire_currency text,
  hire_unit text,
  max_audit_period text,
  supplytime_schema_version text not null default 'supplytime-2017-v1',
  supplytime_data jsonb not null default '{}'::jsonb,
  source_label text not null default 'seapilot',
  sharepoint_site_url text,
  sharepoint_list_id text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  sharepoint_unique_id text,
  source_modified_at timestamptz,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  archived_by uuid references public.profiles(id) on delete set null,
  constraint project_contracts_project_company_key unique (project_id, company_id),
  constraint project_contracts_extension_count_check check (extension_count is null or extension_count >= 0),
  constraint project_contracts_extension_duration_check check (extension_duration is null or extension_duration >= 0),
  constraint project_contracts_max_extension_days_check check (max_extension_days is null or max_extension_days >= 0),
  constraint project_contracts_mobilisation_fee_check check (mobilisation_fee is null or mobilisation_fee >= 0),
  constraint project_contracts_demobilisation_fee_check check (demobilisation_fee is null or demobilisation_fee >= 0),
  constraint project_contracts_charter_hire_check check (charter_hire is null or charter_hire >= 0),
  constraint project_contracts_extension_hire_check check (extension_hire is null or extension_hire >= 0),
  constraint project_contracts_fee_currency_check check (
    fee_currency is null or fee_currency ~ '^[A-Z]{3}$'
  ),
  constraint project_contracts_hire_currency_check check (
    hire_currency is null or hire_currency ~ '^[A-Z]{3}$'
  ),
  constraint project_contracts_fee_currency_required_check check (
    mobilisation_fee is null and demobilisation_fee is null or fee_currency is not null
  ),
  constraint project_contracts_hire_currency_required_check check (
    charter_hire is null and extension_hire is null or hire_currency is not null
  ),
  constraint project_contracts_supplytime_schema_check check (supplytime_schema_version = 'supplytime-2017-v1'),
  constraint project_contracts_supplytime_data_check check (public.is_valid_supplytime_data(supplytime_data)),
  constraint project_contracts_source_payload_check check (public.is_valid_project_source_payload(source_payload))
);

comment on table public.project_contracts is
  'One-to-one commercial/contractual model for catalog projects. Stable queried values are typed; supplytime_data holds only the validated supplytime-2017-v1 free-text boxes.';
comment on column public.project_contracts.supplytime_data is
  'JSON object validated by is_valid_supplytime_data. It is intentionally not indexed: no current filtering/query pattern targets free-text clauses.';
comment on column public.project_contracts.source_payload is
  'Immutable SharePoint trace payload for unmapped historical values. It is not a canonical editable business model.';

create table if not exists public.project_number_counters (
  company_id bigint not null references public.companies(id) on delete cascade,
  prefix text not null default 'P',
  next_number integer not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  primary key (company_id, prefix),
  constraint project_number_counters_prefix_check check (prefix ~ '^[A-Z][A-Z0-9_-]{0,7}$'),
  constraint project_number_counters_next_number_check check (next_number > 0)
);

comment on table public.project_number_counters is
  'Transactionally locked server-side project-number allocator. Phase-3 import must raise its floor above every validated historical code before cutover.';

insert into public.project_number_counters (company_id, prefix, next_number)
select company.id, 'P', 207
from public.companies company
on conflict (company_id, prefix) do nothing;

create table if not exists public.project_change_log (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  entity_type text not null,
  entity_id bigint not null,
  action text not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles(id) on delete set null,
  old_values jsonb,
  new_values jsonb,
  transaction_id bigint not null default txid_current(),
  constraint project_change_log_entity_type_check check (
    entity_type in ('clients', 'projects', 'project_contracts', 'project_documents', 'contract_documents')
  ),
  constraint project_change_log_action_check check (action in ('insert', 'update', 'delete')),
  constraint project_change_log_old_values_check check (old_values is null or jsonb_typeof(old_values) = 'object'),
  constraint project_change_log_new_values_check check (new_values is null or jsonb_typeof(new_values) = 'object')
);

comment on table public.project_change_log is
  'Append-only audit for the Projects domain. Source payloads and client contact fields are removed from snapshots.';

-- Additive constraints are declared through pg_constraint checks for migration replay safety.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_company_id_fkey' and conrelid = 'public.clients'::regclass) then
    alter table public.clients add constraint clients_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_company_id_fkey' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_documents_company_id_fkey' and conrelid = 'public.project_documents'::regclass) then
    alter table public.project_documents add constraint project_documents_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contract_documents_company_id_fkey' and conrelid = 'public.contract_documents'::regclass) then
    alter table public.contract_documents add constraint contract_documents_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dpr_items_company_id_fkey' and conrelid = 'public.dpr_items'::regclass) then
    alter table public.dpr_items add constraint dpr_items_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dpr_archives_company_id_fkey' and conrelid = 'public.dpr_archives'::regclass) then
    alter table public.dpr_archives add constraint dpr_archives_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_requests_company_id_fkey' and conrelid = 'public.purchase_requests'::regclass) then
    alter table public.purchase_requests add constraint purchase_requests_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'action_items_company_id_fkey' and conrelid = 'public.action_items'::regclass) then
    alter table public.action_items add constraint action_items_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'action_documents_company_id_fkey' and conrelid = 'public.action_documents'::regclass) then
    alter table public.action_documents add constraint action_documents_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_id_company_key' and conrelid = 'public.clients'::regclass) then
    alter table public.clients add constraint clients_id_company_key unique (id, company_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_id_company_key' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_id_company_key unique (id, company_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dpr_items_id_company_key' and conrelid = 'public.dpr_items'::regclass) then
    alter table public.dpr_items add constraint dpr_items_id_company_key unique (id, company_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'action_items_id_company_key' and conrelid = 'public.action_items'::regclass) then
    alter table public.action_items add constraint action_items_id_company_key unique (id, company_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_client_company_fkey' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_client_company_fkey
      foreign key (client_id, company_id) references public.clients(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_primary_vessel_company_fkey' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_primary_vessel_company_fkey
      foreign key (primary_vessel_id, company_id) references public.vessels(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_secondary_vessel_company_fkey' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_secondary_vessel_company_fkey
      foreign key (secondary_vessel_id, company_id) references public.vessels(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_contracts_project_company_fkey' and conrelid = 'public.project_contracts'::regclass) then
    alter table public.project_contracts add constraint project_contracts_project_company_fkey
      foreign key (project_id, company_id) references public.projects(id, company_id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_documents_project_company_fkey' and conrelid = 'public.project_documents'::regclass) then
    alter table public.project_documents add constraint project_documents_project_company_fkey
      foreign key (project_id, company_id) references public.projects(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contract_documents_project_company_fkey' and conrelid = 'public.contract_documents'::regclass) then
    alter table public.contract_documents add constraint contract_documents_project_company_fkey
      foreign key (project_id, company_id) references public.projects(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dpr_items_project_company_fkey' and conrelid = 'public.dpr_items'::regclass) then
    alter table public.dpr_items add constraint dpr_items_project_company_fkey
      foreign key (project_id, company_id) references public.projects(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dpr_items_vessel_company_fkey' and conrelid = 'public.dpr_items'::regclass) then
    alter table public.dpr_items add constraint dpr_items_vessel_company_fkey
      foreign key (vessel_id, company_id) references public.vessels(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dpr_archives_project_company_fkey' and conrelid = 'public.dpr_archives'::regclass) then
    alter table public.dpr_archives add constraint dpr_archives_project_company_fkey
      foreign key (project_id, company_id) references public.projects(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dpr_archives_item_company_fkey' and conrelid = 'public.dpr_archives'::regclass) then
    alter table public.dpr_archives add constraint dpr_archives_item_company_fkey
      foreign key (dpr_item_id, company_id) references public.dpr_items(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'purchase_requests_project_company_fkey' and conrelid = 'public.purchase_requests'::regclass) then
    alter table public.purchase_requests add constraint purchase_requests_project_company_fkey
      foreign key (project_id, company_id) references public.projects(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'action_items_project_company_fkey' and conrelid = 'public.action_items'::regclass) then
    alter table public.action_items add constraint action_items_project_company_fkey
      foreign key (project_id, company_id) references public.projects(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'action_items_vessel_company_fkey' and conrelid = 'public.action_items'::regclass) then
    alter table public.action_items add constraint action_items_vessel_company_fkey
      foreign key (vessel_id, company_id) references public.vessels(id, company_id) on delete restrict not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'action_documents_item_company_fkey' and conrelid = 'public.action_documents'::regclass) then
    alter table public.action_documents add constraint action_documents_item_company_fkey
      foreign key (action_item_id, company_id) references public.action_items(id, company_id) on delete restrict not valid;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_source_payload_check' and conrelid = 'public.clients'::regclass) then
    alter table public.clients add constraint clients_source_payload_check
      check (public.is_valid_project_source_payload(source_payload));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_source_payload_check' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_source_payload_check
      check (public.is_valid_project_source_payload(source_payload));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_contract_dates_check' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_contract_dates_check
      check (charter_ends_at is null or charter_starts_at is null or charter_ends_at >= charter_starts_at) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_delivery_dates_check' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_delivery_dates_check
      check (redelivery_at is null or delivery_at is null or redelivery_at >= delivery_at) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_distinct_vessels_check' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_distinct_vessels_check
      check (primary_vessel_id is null or secondary_vessel_id is null or primary_vessel_id <> secondary_vessel_id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'clients_sharepoint_provenance_check' and conrelid = 'public.clients'::regclass) then
    alter table public.clients add constraint clients_sharepoint_provenance_check check (
      lower(trim(source_label)) <> 'sharepoint'
      or (nullif(trim(sharepoint_list_id), '') is not null and nullif(trim(sharepoint_item_id), '') is not null)
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_sharepoint_provenance_check' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_sharepoint_provenance_check check (
      lower(trim(source_label)) <> 'sharepoint'
      or (nullif(trim(sharepoint_list_id), '') is not null and nullif(trim(sharepoint_item_id), '') is not null)
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_contracts_sharepoint_provenance_check' and conrelid = 'public.project_contracts'::regclass) then
    alter table public.project_contracts add constraint project_contracts_sharepoint_provenance_check check (
      lower(trim(source_label)) <> 'sharepoint'
      or (nullif(trim(sharepoint_list_id), '') is not null and nullif(trim(sharepoint_item_id), '') is not null)
    ) not valid;
  end if;
end $$;

do $$
declare
  target_table regclass;
  constraint_name text;
begin
  foreach target_table in array array['public.project_documents'::regclass, 'public.contract_documents'::regclass]
  loop
    constraint_name := case target_table::text
      when 'project_documents' then 'project_documents_metadata_check'
      else 'contract_documents_metadata_check'
    end;
    if not exists (select 1 from pg_constraint where conname = constraint_name and conrelid = target_table) then
      execute format(
        'alter table %s add constraint %I check (
          file_size_bytes is null or file_size_bytes >= 0
        ) not valid', target_table, constraint_name
      );
    end if;

    constraint_name := case target_table::text
      when 'project_documents' then 'project_documents_file_only_check'
      else 'contract_documents_file_only_check'
    end;
    if not exists (select 1 from pg_constraint where conname = constraint_name and conrelid = target_table) then
      execute format('alter table %s add constraint %I check (not is_folder) not valid', target_table, constraint_name);
    end if;

    constraint_name := case target_table::text
      when 'project_documents' then 'project_documents_source_payload_check'
      else 'contract_documents_source_payload_check'
    end;
    if not exists (select 1 from pg_constraint where conname = constraint_name and conrelid = target_table) then
      execute format(
        'alter table %s add constraint %I check (public.is_valid_project_source_payload(source_payload))',
        target_table, constraint_name
      );
    end if;

    constraint_name := case target_table::text
      when 'project_documents' then 'project_documents_sharepoint_reference_check'
      else 'contract_documents_sharepoint_reference_check'
    end;
    if not exists (select 1 from pg_constraint where conname = constraint_name and conrelid = target_table) then
      execute format(
        'alter table %s add constraint %I check (
          lower(trim(source_label)) <> ''sharepoint''
          or (
            (
              nullif(trim(sharepoint_drive_id), '''') is not null
              and nullif(trim(sharepoint_drive_item_id), '''') is not null
            )
            or (
              nullif(trim(sharepoint_list_id), '''') is not null
              and nullif(trim(sharepoint_item_id), '''') is not null
            )
          )
          and coalesce(
            nullif(trim(file_url), ''''),
            nullif(trim(sharepoint_encoded_abs_url), ''''),
            nullif(trim(sharepoint_file_ref), '''')
          ) is not null
        ) not valid', target_table, constraint_name
      );
    end if;
  end loop;
end $$;

create index if not exists clients_company_name_idx
  on public.clients (company_id, public.normalize_import_label(name));
create index if not exists projects_company_status_idx
  on public.projects (company_id, status) where archived_at is null;
create index if not exists projects_company_dates_idx
  on public.projects (company_id, starts_on, ends_on) where archived_at is null;
create unique index if not exists projects_company_code_normalized_unique_idx
  on public.projects (company_id, public.normalize_project_code(project_code))
  where public.normalize_project_code(project_code) is not null;
create index if not exists project_contracts_company_project_idx
  on public.project_contracts (company_id, project_id) where archived_at is null;
create index if not exists project_change_log_entity_idx
  on public.project_change_log (company_id, entity_type, entity_id, changed_at desc);
create index if not exists project_change_log_changed_by_idx
  on public.project_change_log (changed_by) where changed_by is not null;
create unique index if not exists project_contracts_sharepoint_item_unique_idx
  on public.project_contracts (sharepoint_list_id, sharepoint_item_id)
  where sharepoint_list_id is not null and sharepoint_item_id is not null;
create unique index if not exists project_documents_drive_item_unique_idx
  on public.project_documents (sharepoint_drive_id, sharepoint_drive_item_id)
  where sharepoint_drive_id is not null and sharepoint_drive_item_id is not null;
create unique index if not exists contract_documents_drive_item_unique_idx
  on public.contract_documents (sharepoint_drive_id, sharepoint_drive_item_id)
  where sharepoint_drive_id is not null and sharepoint_drive_item_id is not null;

create index if not exists project_documents_company_project_idx on public.project_documents (company_id, project_id);
create index if not exists contract_documents_company_project_idx on public.contract_documents (company_id, project_id);
create index if not exists dpr_items_company_project_idx on public.dpr_items (company_id, project_id);
create index if not exists dpr_archives_company_project_idx on public.dpr_archives (company_id, project_id);
create index if not exists purchase_requests_company_project_idx on public.purchase_requests (company_id, project_id);
create index if not exists action_items_company_project_idx on public.action_items (company_id, project_id);
create index if not exists action_documents_company_action_idx on public.action_documents (company_id, action_item_id);

create or replace function public.touch_project_domain_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end;
$$;

revoke all on function public.touch_project_domain_row() from public, anon, authenticated;

create or replace function public.protect_project_source_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_row jsonb := to_jsonb(old);
  new_row jsonb := to_jsonb(new);
  protected_column text;
  protected_columns constant text[] := array[
    'company_id',
    'project_code',
    'source_label',
    'sharepoint_site_url',
    'sharepoint_list_id',
    'sharepoint_list_title',
    'sharepoint_item_id',
    'sharepoint_unique_id',
    'sharepoint_file_ref',
    'sharepoint_encoded_abs_url',
    'sharepoint_drive_id',
    'sharepoint_drive_item_id',
    'source_sharepoint_id',
    'source_modified_at',
    'source_created_at',
    'source_etag',
    'source_ctag',
    'source_payload'
  ];
begin
  -- Authenticated application users edit canonical business fields only. Imports use service_role.
  if (select auth.role()) = 'authenticated' then
    foreach protected_column in array protected_columns
    loop
      if old_row -> protected_column is distinct from new_row -> protected_column then
        raise exception 'Protected Projects source identity column cannot be modified: %', protected_column
          using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_project_source_identity() from public, anon, authenticated;

create or replace function public.audit_project_domain_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_snapshot jsonb;
  new_snapshot jsonb;
  target_company_id bigint;
  target_entity_id bigint;
begin
  if tg_op <> 'INSERT' then
    old_snapshot := to_jsonb(old) - 'source_payload';
    target_company_id := old.company_id;
    target_entity_id := old.id;
  end if;
  if tg_op <> 'DELETE' then
    new_snapshot := to_jsonb(new) - 'source_payload';
    target_company_id := new.company_id;
    target_entity_id := new.id;
  end if;

  if tg_table_name = 'clients' then
    old_snapshot := old_snapshot - array['email', 'phone', 'address']::text[];
    new_snapshot := new_snapshot - array['email', 'phone', 'address']::text[];
  end if;

  insert into public.project_change_log (
    company_id,
    entity_type,
    entity_id,
    action,
    changed_by,
    old_values,
    new_values
  )
  values (
    target_company_id,
    tg_table_name,
    target_entity_id,
    lower(tg_op),
    (select auth.uid()),
    old_snapshot,
    new_snapshot
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.audit_project_domain_change() from public, anon, authenticated;

do $$
declare
  target_table regclass;
  trigger_prefix text;
begin
  foreach target_table in array array[
    'public.clients'::regclass,
    'public.projects'::regclass,
    'public.project_contracts'::regclass,
    'public.project_documents'::regclass,
    'public.contract_documents'::regclass
  ]
  loop
    trigger_prefix := replace(target_table::text, 'public.', '');
    execute format('drop trigger if exists %I on %s', trigger_prefix || '_touch', target_table);
    execute format(
      'create trigger %I before update on %s for each row execute function public.touch_project_domain_row()',
      trigger_prefix || '_touch', target_table
    );
    execute format('drop trigger if exists %I on %s', trigger_prefix || '_protect_source', target_table);
    execute format(
      'create trigger %I before update on %s for each row execute function public.protect_project_source_identity()',
      trigger_prefix || '_protect_source', target_table
    );
    execute format('drop trigger if exists %I on %s', trigger_prefix || '_audit', target_table);
    execute format(
      'create trigger %I after insert or update or delete on %s for each row execute function public.audit_project_domain_change()',
      trigger_prefix || '_audit', target_table
    );
  end loop;
end $$;

create or replace function public.allocate_next_project_code(
  target_company_id bigint,
  target_prefix text default 'P'
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_prefix text := upper(trim(target_prefix));
  candidate_number integer;
  candidate_code text;
begin
  if target_company_id is null then
    raise exception 'A company is required to allocate a project code';
  end if;
  if normalized_prefix !~ '^[A-Z][A-Z0-9_-]{0,7}$' then
    raise exception 'Invalid project code prefix';
  end if;

  insert into public.project_number_counters (company_id, prefix, next_number)
  values (target_company_id, normalized_prefix, 207)
  on conflict (company_id, prefix) do nothing;

  loop
    select counter.next_number
    into candidate_number
    from public.project_number_counters counter
    where counter.company_id = target_company_id
      and counter.prefix = normalized_prefix
    for update;

    candidate_code := normalized_prefix || candidate_number::text;

    update public.project_number_counters
    set next_number = candidate_number + 1,
        updated_at = now(),
        updated_by = (select auth.uid())
    where company_id = target_company_id
      and prefix = normalized_prefix;

    if not exists (
      select 1
      from public.projects project
      where project.company_id = target_company_id
        and public.normalize_project_code(project.project_code) = public.normalize_project_code(candidate_code)
    ) then
      return candidate_code;
    end if;
  end loop;

  raise exception 'Unable to allocate a project code';
end;
$$;

comment on function public.allocate_next_project_code(bigint, text) is
  'Allocates a project code while holding a row lock on the per-company counter. The unique normalized index is the final collision guard.';
revoke all on function public.allocate_next_project_code(bigint, text) from public, anon, authenticated;

create or replace function public.assign_project_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if lower(trim(new.source_label)) <> 'sharepoint' then
    new.project_code := public.allocate_next_project_code(new.company_id, 'P');
  elsif public.normalize_project_code(new.project_code) is null then
    raise exception 'A historical SharePoint project code is required for traceability';
  end if;
  return new;
end;
$$;

revoke all on function public.assign_project_code() from public, anon, authenticated;
drop trigger if exists projects_assign_code on public.projects;
create trigger projects_assign_code
  before insert on public.projects
  for each row execute function public.assign_project_code();

create or replace function public.projects_set_number_floor(
  target_next_number integer,
  target_prefix text default 'P'
)
returns public.project_number_counters
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  normalized_prefix text := upper(trim(target_prefix));
  result public.project_number_counters;
begin
  if not (select public.user_belongs_to_company(target_company_id))
     or not (select public.has_role('admin')) then
    raise exception 'Only an administrator can set the project number floor' using errcode = '42501';
  end if;
  if target_next_number is null or target_next_number <= 0 then
    raise exception 'The next project number must be positive';
  end if;
  if normalized_prefix !~ '^[A-Z][A-Z0-9_-]{0,7}$' then
    raise exception 'Invalid project code prefix';
  end if;

  insert into public.project_number_counters (company_id, prefix, next_number, updated_by)
  values (target_company_id, normalized_prefix, target_next_number, (select auth.uid()))
  on conflict (company_id, prefix) do update
  set next_number = greatest(public.project_number_counters.next_number, excluded.next_number),
      updated_at = now(),
      updated_by = excluded.updated_by
  returning * into result;

  return result;
end;
$$;

comment on function public.projects_set_number_floor(integer, text) is
  'Admin-only monotonic counter alignment. Phase 3 calls it with a validated explicit floor; it never derives a value with max(id).';
revoke all on function public.projects_set_number_floor(integer, text) from public, anon, authenticated;
grant execute on function public.projects_set_number_floor(integer, text) to authenticated;

create or replace function public.projects_create(
  target_title text,
  target_client_id bigint default null,
  target_primary_vessel_id bigint default null,
  target_secondary_vessel_id bigint default null,
  target_status text default null,
  target_description text default null,
  target_delivery_at timestamptz default null,
  target_redelivery_at timestamptz default null,
  target_charter_starts_at timestamptz default null,
  target_charter_ends_at timestamptz default null,
  target_delivery_port text default null,
  target_redelivery_port text default null,
  target_contract_type text default null,
  target_operation_area text default null,
  target_is_rov_support boolean default false,
  target_is_diving_support boolean default false
)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  result public.projects;
begin
  if not (select public.user_belongs_to_company(target_company_id))
     or not (select public.has_any_role(array['admin', 'direction'])) then
    raise exception 'Insufficient permission to create a project' using errcode = '42501';
  end if;
  if nullif(trim(target_title), '') is null then
    raise exception 'Project title is required';
  end if;

  insert into public.projects (
    company_id,
    title,
    client_id,
    primary_vessel_id,
    secondary_vessel_id,
    status,
    description,
    delivery_at,
    redelivery_at,
    charter_starts_at,
    charter_ends_at,
    delivery_port,
    redelivery_port,
    contract_type,
    operation_area,
    is_rov_support,
    is_diving_support,
    source_label,
    created_by,
    updated_by
  ) values (
    target_company_id,
    trim(target_title),
    target_client_id,
    target_primary_vessel_id,
    target_secondary_vessel_id,
    nullif(trim(target_status), ''),
    nullif(trim(target_description), ''),
    target_delivery_at,
    target_redelivery_at,
    target_charter_starts_at,
    target_charter_ends_at,
    nullif(trim(target_delivery_port), ''),
    nullif(trim(target_redelivery_port), ''),
    nullif(trim(target_contract_type), ''),
    nullif(trim(target_operation_area), ''),
    coalesce(target_is_rov_support, false),
    coalesce(target_is_diving_support, false),
    'seapilot',
    (select auth.uid()),
    (select auth.uid())
  )
  returning * into result;

  return result;
end;
$$;

revoke all on function public.projects_create(text, bigint, bigint, bigint, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, boolean, boolean)
  from public, anon, authenticated;
grant execute on function public.projects_create(text, bigint, bigint, bigint, text, text, timestamptz, timestamptz, timestamptz, timestamptz, text, text, text, text, boolean, boolean)
  to authenticated;

create or replace function public.projects_archive(target_project_id bigint)
returns public.projects
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  result public.projects;
begin
  if not (select public.user_belongs_to_company(target_company_id))
     or not (select public.has_any_role(array['admin', 'direction'])) then
    raise exception 'Insufficient permission to archive a project' using errcode = '42501';
  end if;

  update public.projects
  set archived_at = coalesce(archived_at, now()),
      archived_by = coalesce(archived_by, (select auth.uid())),
      updated_by = (select auth.uid())
  where id = target_project_id
    and company_id = target_company_id
  returning * into result;

  if result.id is null then
    raise exception 'Project not found in the active company';
  end if;
  return result;
end;
$$;

revoke all on function public.projects_archive(bigint) from public, anon, authenticated;
grant execute on function public.projects_archive(bigint) to authenticated;

create or replace function public.projects_set_supplytime(
  target_project_id bigint,
  target_supplytime_data jsonb,
  target_schema_version text default 'supplytime-2017-v1'
)
returns public.project_contracts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  result public.project_contracts;
begin
  if not (select public.user_belongs_to_company(target_company_id))
     or not (select public.has_any_role(array['admin', 'direction'])) then
    raise exception 'Insufficient permission to update SUPPLYTIME data' using errcode = '42501';
  end if;
  if target_schema_version <> 'supplytime-2017-v1' or not public.is_valid_supplytime_data(target_supplytime_data) then
    raise exception 'Invalid supplytime-2017-v1 payload';
  end if;
  if not exists (
    select 1 from public.projects
    where id = target_project_id and company_id = target_company_id and archived_at is null
  ) then
    raise exception 'Active project not found in the active company';
  end if;

  insert into public.project_contracts (
    company_id,
    project_id,
    supplytime_schema_version,
    supplytime_data,
    source_label,
    created_by,
    updated_by
  ) values (
    target_company_id,
    target_project_id,
    target_schema_version,
    target_supplytime_data,
    'seapilot',
    (select auth.uid()),
    (select auth.uid())
  )
  on conflict (project_id, company_id) do update
  set supplytime_schema_version = excluded.supplytime_schema_version,
      supplytime_data = excluded.supplytime_data,
      updated_by = excluded.updated_by
  returning * into result;

  return result;
end;
$$;

revoke all on function public.projects_set_supplytime(bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.projects_set_supplytime(bigint, jsonb, text) to authenticated;

-- Reconciliation stays replayable but is restricted to service_role or an administrator,
-- and every match must remain inside the source row's company.
create or replace function public.resolve_sharepoint_project_links()
returns table (
  target_table text,
  resolved_clients integer,
  resolved_vessels integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_project_clients integer := 0;
  resolved_primary_vessels integer := 0;
  resolved_secondary_vessels integer := 0;
  is_service boolean := (select auth.role()) = 'service_role';
  active_company_id bigint := public.current_planning_company_id();
begin
  if not is_service and (
    not (select public.user_belongs_to_company(active_company_id))
    or not (select public.has_role('admin'))
  ) then
    raise exception 'Project reconciliation requires service_role or admin' using errcode = '42501';
  end if;

  update public.projects project
  set client_id = client.id,
      updated_at = now()
  from public.clients client
  where project.client_id is null
    and client.company_id = project.company_id
    and (is_service or project.company_id = active_company_id)
    and (
      (
        project.client_sharepoint_item_id is not null
        and client.sharepoint_item_id = project.client_sharepoint_item_id
      )
      or (
        public.normalize_import_label(project.client_name) is not null
        and (
          public.normalize_import_label(project.client_name) = public.normalize_import_label(client.name)
          or public.normalize_import_label(project.client_name) = public.normalize_import_label(client.code)
        )
      )
    );
  get diagnostics resolved_project_clients = row_count;

  update public.projects project
  set primary_vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where project.primary_vessel_id is null
    and vessel.company_id = project.company_id
    and (is_service or project.company_id = active_company_id)
    and (
      (
        project.primary_vessel_sharepoint_item_id is not null
        and vessel.sharepoint_item_id = project.primary_vessel_sharepoint_item_id
      )
      or (
        public.normalize_import_label(project.primary_vessel_name) is not null
        and (
          public.normalize_import_label(project.primary_vessel_name) = public.normalize_import_label(vessel.name)
          or public.normalize_import_label(project.primary_vessel_name) = public.normalize_import_label(vessel.acronym)
        )
      )
    );
  get diagnostics resolved_primary_vessels = row_count;

  update public.projects project
  set secondary_vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where project.secondary_vessel_id is null
    and vessel.company_id = project.company_id
    and (is_service or project.company_id = active_company_id)
    and (
      (
        project.secondary_vessel_sharepoint_item_id is not null
        and vessel.sharepoint_item_id = project.secondary_vessel_sharepoint_item_id
      )
      or (
        public.normalize_import_label(project.secondary_vessel_name) is not null
        and (
          public.normalize_import_label(project.secondary_vessel_name) = public.normalize_import_label(vessel.name)
          or public.normalize_import_label(project.secondary_vessel_name) = public.normalize_import_label(vessel.acronym)
        )
      )
    );
  get diagnostics resolved_secondary_vessels = row_count;

  return query values (
    'projects',
    resolved_project_clients,
    resolved_primary_vessels + resolved_secondary_vessels
  );
end;
$$;

revoke all on function public.resolve_sharepoint_project_links() from public, anon, authenticated;
grant execute on function public.resolve_sharepoint_project_links() to authenticated, service_role;

create or replace function public.resolve_sharepoint_project_document_links()
returns table (
  target_table text,
  resolved_documents integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_project_documents integer := 0;
  resolved_contract_documents integer := 0;
  is_service boolean := (select auth.role()) = 'service_role';
  active_company_id bigint := public.current_planning_company_id();
begin
  if not is_service and (
    not (select public.user_belongs_to_company(active_company_id))
    or not (select public.has_role('admin'))
  ) then
    raise exception 'Document reconciliation requires service_role or admin' using errcode = '42501';
  end if;

  update public.project_documents document
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where document.project_id is null
    and project.company_id = document.company_id
    and (is_service or document.company_id = active_company_id)
    and (
      (
        document.project_sharepoint_item_id is not null
        and project.sharepoint_item_id = document.project_sharepoint_item_id
      )
      or (
        public.normalize_import_label(document.project_code) is not null
        and public.normalize_import_label(document.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(document.project_title) is not null
        and public.normalize_import_label(document.project_title) = public.normalize_import_label(project.title)
      )
    );
  get diagnostics resolved_project_documents = row_count;

  update public.contract_documents document
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where document.project_id is null
    and project.company_id = document.company_id
    and (is_service or document.company_id = active_company_id)
    and (
      (
        document.project_sharepoint_item_id is not null
        and project.sharepoint_item_id = document.project_sharepoint_item_id
      )
      or (
        public.normalize_import_label(document.project_code) is not null
        and public.normalize_import_label(document.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(document.project_title) is not null
        and public.normalize_import_label(document.project_title) = public.normalize_import_label(project.title)
      )
    );
  get diagnostics resolved_contract_documents = row_count;

  return query values
    ('project_documents', resolved_project_documents),
    ('contract_documents', resolved_contract_documents);
end;
$$;

revoke all on function public.resolve_sharepoint_project_document_links() from public, anon, authenticated;
grant execute on function public.resolve_sharepoint_project_document_links() to authenticated, service_role;

create or replace function public.resolve_sharepoint_dpr_links()
returns table (
  target_table text,
  resolved_projects integer,
  resolved_vessels integer,
  resolved_dpr_items integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  dpr_item_projects integer := 0;
  dpr_item_vessels integer := 0;
  dpr_archive_projects integer := 0;
  dpr_archive_items integer := 0;
  is_service boolean := (select auth.role()) = 'service_role';
  active_company_id bigint := public.current_planning_company_id();
begin
  if not is_service and (
    not (select public.user_belongs_to_company(active_company_id))
    or not (select public.has_role('admin'))
  ) then
    raise exception 'DPR reconciliation requires service_role or admin' using errcode = '42501';
  end if;

  update public.dpr_items item
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where item.project_id is null
    and project.company_id = item.company_id
    and (is_service or item.company_id = active_company_id)
    and (
      (item.project_sharepoint_item_id is not null and project.sharepoint_item_id = item.project_sharepoint_item_id)
      or (
        public.normalize_import_label(item.project_code) is not null
        and public.normalize_import_label(item.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(item.project_title) is not null
        and public.normalize_import_label(item.project_title) = public.normalize_import_label(project.title)
      )
    );
  get diagnostics dpr_item_projects = row_count;

  update public.dpr_items item
  set vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where item.vessel_id is null
    and vessel.company_id = item.company_id
    and (is_service or item.company_id = active_company_id)
    and (
      (item.vessel_sharepoint_item_id is not null and vessel.sharepoint_item_id = item.vessel_sharepoint_item_id)
      or (
        public.normalize_import_label(item.vessel_name) is not null
        and (
          public.normalize_import_label(item.vessel_name) = public.normalize_import_label(vessel.name)
          or public.normalize_import_label(item.vessel_name) = public.normalize_import_label(vessel.acronym)
        )
      )
    );
  get diagnostics dpr_item_vessels = row_count;

  update public.dpr_archives archive
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where archive.project_id is null
    and project.company_id = archive.company_id
    and (is_service or archive.company_id = active_company_id)
    and (
      (archive.project_sharepoint_item_id is not null and project.sharepoint_item_id = archive.project_sharepoint_item_id)
      or (
        public.normalize_import_label(archive.project_code) is not null
        and public.normalize_import_label(archive.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(archive.project_title) is not null
        and public.normalize_import_label(archive.project_title) = public.normalize_import_label(project.title)
      )
    );
  get diagnostics dpr_archive_projects = row_count;

  update public.dpr_archives archive
  set dpr_item_id = item.id,
      updated_at = now()
  from public.dpr_items item
  where archive.dpr_item_id is null
    and item.company_id = archive.company_id
    and (is_service or archive.company_id = active_company_id)
    and (
      (archive.dpr_sharepoint_item_id is not null and item.sharepoint_item_id = archive.dpr_sharepoint_item_id)
      or (
        archive.report_date is not null
        and item.report_date = archive.report_date
        and (
          archive.project_id = item.project_id
          or (
            public.normalize_import_label(archive.project_code) is not null
            and public.normalize_import_label(archive.project_code) = public.normalize_import_label(item.project_code)
          )
        )
      )
    );
  get diagnostics dpr_archive_items = row_count;

  return query values
    ('dpr_items', dpr_item_projects, dpr_item_vessels, 0),
    ('dpr_archives', dpr_archive_projects, 0, dpr_archive_items);
end;
$$;

revoke all on function public.resolve_sharepoint_dpr_links() from public, anon, authenticated;
grant execute on function public.resolve_sharepoint_dpr_links() to authenticated, service_role;

create or replace function public.resolve_sharepoint_operation_links()
returns table (
  target_table text,
  resolved_projects integer,
  resolved_vessels integer,
  resolved_actions integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  purchase_projects integer := 0;
  action_projects integer := 0;
  action_vessels integer := 0;
  action_document_count integer := 0;
  is_service boolean := (select auth.role()) = 'service_role';
  active_company_id bigint := public.current_planning_company_id();
begin
  if not is_service and (
    not (select public.user_belongs_to_company(active_company_id))
    or not (select public.has_role('admin'))
  ) then
    raise exception 'Operation reconciliation requires service_role or admin' using errcode = '42501';
  end if;

  update public.purchase_requests request
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where request.project_id is null
    and project.company_id = request.company_id
    and (is_service or request.company_id = active_company_id)
    and (
      (request.project_sharepoint_item_id is not null and project.sharepoint_item_id = request.project_sharepoint_item_id)
      or (
        public.normalize_import_label(request.project_code) is not null
        and public.normalize_import_label(request.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(request.project_title) is not null
        and public.normalize_import_label(request.project_title) = public.normalize_import_label(project.title)
      )
    );
  get diagnostics purchase_projects = row_count;

  update public.action_items action
  set project_id = project.id,
      updated_at = now()
  from public.projects project
  where action.project_id is null
    and project.company_id = action.company_id
    and (is_service or action.company_id = active_company_id)
    and (
      (action.project_sharepoint_item_id is not null and project.sharepoint_item_id = action.project_sharepoint_item_id)
      or (
        public.normalize_import_label(action.project_code) is not null
        and public.normalize_import_label(action.project_code) = public.normalize_import_label(project.project_code)
      )
      or (
        public.normalize_import_label(action.project_title) is not null
        and public.normalize_import_label(action.project_title) = public.normalize_import_label(project.title)
      )
    );
  get diagnostics action_projects = row_count;

  update public.action_items action
  set vessel_id = vessel.id,
      updated_at = now()
  from public.vessels vessel
  where action.vessel_id is null
    and vessel.company_id = action.company_id
    and (is_service or action.company_id = active_company_id)
    and (
      (action.vessel_sharepoint_item_id is not null and vessel.sharepoint_item_id = action.vessel_sharepoint_item_id)
      or (
        public.normalize_import_label(action.vessel_name) is not null
        and (
          public.normalize_import_label(action.vessel_name) = public.normalize_import_label(vessel.name)
          or public.normalize_import_label(action.vessel_name) = public.normalize_import_label(vessel.acronym)
        )
      )
    );
  get diagnostics action_vessels = row_count;

  update public.action_documents document
  set action_item_id = action.id,
      updated_at = now()
  from public.action_items action
  where document.action_item_id is null
    and action.company_id = document.company_id
    and (is_service or document.company_id = active_company_id)
    and (
      (document.action_sharepoint_item_id is not null and action.sharepoint_item_id = document.action_sharepoint_item_id)
      or (
        public.normalize_import_label(document.action_title) is not null
        and public.normalize_import_label(document.action_title) = public.normalize_import_label(action.title)
      )
    );
  get diagnostics action_document_count = row_count;

  return query values
    ('purchase_requests', purchase_projects, 0, 0),
    ('action_items', action_projects, action_vessels, 0),
    ('action_documents', 0, 0, action_document_count);
end;
$$;

revoke all on function public.resolve_sharepoint_operation_links() from public, anon, authenticated;
grant execute on function public.resolve_sharepoint_operation_links() to authenticated, service_role;

-- Privileges and RLS: Projects catalog follows the validated minimal matrix.
revoke all on table public.clients from authenticated;
revoke all on table public.projects from authenticated;
revoke all on table public.project_contracts from authenticated;
revoke all on table public.project_documents from authenticated;
revoke all on table public.contract_documents from authenticated;
revoke all on table public.project_number_counters from authenticated;
revoke all on table public.project_change_log from authenticated;

grant select, insert, update on table public.clients to authenticated;
grant select, insert, update on table public.projects to authenticated;
grant select, insert, update on table public.project_contracts to authenticated;
grant select, insert, update on table public.project_documents to authenticated;
grant select, insert, update on table public.contract_documents to authenticated;
grant select on table public.project_change_log to authenticated;

grant usage on sequence public.clients_id_seq to authenticated;
grant usage on sequence public.projects_id_seq to authenticated;
grant usage on sequence public.project_contracts_id_seq to authenticated;
grant usage on sequence public.project_documents_id_seq to authenticated;
grant usage on sequence public.contract_documents_id_seq to authenticated;

alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.project_contracts enable row level security;
alter table public.project_documents enable row level security;
alter table public.contract_documents enable row level security;
alter table public.project_number_counters enable row level security;
alter table public.project_change_log enable row level security;

drop policy if exists clients_role_read on public.clients;
drop policy if exists clients_office_write on public.clients;
drop policy if exists clients_company_read on public.clients;
drop policy if exists clients_company_insert on public.clients;
drop policy if exists clients_company_update on public.clients;
create policy clients_company_read on public.clients
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );
create policy clients_company_insert on public.clients
  for insert to authenticated
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
    and lower(trim(source_label)) = 'seapilot'
    and sharepoint_site_url is null
    and sharepoint_list_id is null
    and sharepoint_list_title is null
    and sharepoint_item_id is null
    and sharepoint_unique_id is null
    and sharepoint_file_ref is null
    and sharepoint_encoded_abs_url is null
    and source_modified_at is null
    and source_payload = '{}'::jsonb
  );
create policy clients_company_update on public.clients
  for update to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  )
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );

drop policy if exists projects_role_read on public.projects;
drop policy if exists projects_office_write on public.projects;
drop policy if exists projects_company_read on public.projects;
drop policy if exists projects_company_insert on public.projects;
drop policy if exists projects_company_update on public.projects;
create policy projects_company_read on public.projects
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );
create policy projects_company_insert on public.projects
  for insert to authenticated
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
    and lower(trim(source_label)) = 'seapilot'
    and sharepoint_site_url is null
    and sharepoint_list_id is null
    and sharepoint_list_title is null
    and sharepoint_item_id is null
    and sharepoint_unique_id is null
    and sharepoint_file_ref is null
    and sharepoint_encoded_abs_url is null
    and source_modified_at is null
    and source_payload = '{}'::jsonb
  );
create policy projects_company_update on public.projects
  for update to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  )
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );

drop policy if exists project_contracts_company_read on public.project_contracts;
drop policy if exists project_contracts_company_insert on public.project_contracts;
drop policy if exists project_contracts_company_update on public.project_contracts;
create policy project_contracts_company_read on public.project_contracts
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );
create policy project_contracts_company_insert on public.project_contracts
  for insert to authenticated
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
    and lower(trim(source_label)) = 'seapilot'
    and sharepoint_site_url is null
    and sharepoint_list_id is null
    and sharepoint_list_title is null
    and sharepoint_item_id is null
    and sharepoint_unique_id is null
    and source_modified_at is null
    and source_payload = '{}'::jsonb
  );
create policy project_contracts_company_update on public.project_contracts
  for update to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  )
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );

drop policy if exists project_documents_role_read on public.project_documents;
drop policy if exists project_documents_office_write on public.project_documents;
drop policy if exists project_documents_company_read on public.project_documents;
drop policy if exists project_documents_company_insert on public.project_documents;
drop policy if exists project_documents_company_update on public.project_documents;
create policy project_documents_company_read on public.project_documents
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );
create policy project_documents_company_insert on public.project_documents
  for insert to authenticated
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_role('admin'))
    and lower(trim(source_label)) = 'sharepoint'
    and not is_folder
    and source_payload = '{}'::jsonb
  );
create policy project_documents_company_update on public.project_documents
  for update to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_role('admin'))
  )
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_role('admin'))
    and lower(trim(source_label)) = 'sharepoint'
    and not is_folder
  );

drop policy if exists contract_documents_role_read on public.contract_documents;
drop policy if exists contract_documents_office_write on public.contract_documents;
drop policy if exists contract_documents_company_read on public.contract_documents;
drop policy if exists contract_documents_company_insert on public.contract_documents;
drop policy if exists contract_documents_company_update on public.contract_documents;
create policy contract_documents_company_read on public.contract_documents
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );
create policy contract_documents_company_insert on public.contract_documents
  for insert to authenticated
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_role('admin'))
    and lower(trim(source_label)) = 'sharepoint'
    and not is_folder
    and source_payload = '{}'::jsonb
  );
create policy contract_documents_company_update on public.contract_documents
  for update to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_role('admin'))
  )
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_role('admin'))
    and lower(trim(source_label)) = 'sharepoint'
    and not is_folder
  );

drop policy if exists project_change_log_company_read on public.project_change_log;
create policy project_change_log_company_read on public.project_change_log
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction']))
  );

-- Existing dependent-module role scopes are preserved; only tenant isolation is added.
drop policy if exists dpr_items_role_read on public.dpr_items;
drop policy if exists dpr_items_office_write on public.dpr_items;
create policy dpr_items_role_read on public.dpr_items
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']))
  );
create policy dpr_items_office_write on public.dpr_items
  for all to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement']))
  )
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement']))
  );

drop policy if exists dpr_archives_role_read on public.dpr_archives;
drop policy if exists dpr_archives_office_write on public.dpr_archives;
create policy dpr_archives_role_read on public.dpr_archives
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']))
  );
create policy dpr_archives_office_write on public.dpr_archives
  for all to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement']))
  )
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement']))
  );

drop policy if exists purchase_requests_role_read on public.purchase_requests;
drop policy if exists purchase_requests_office_write on public.purchase_requests;
create policy purchase_requests_role_read on public.purchase_requests
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']))
  );
create policy purchase_requests_office_write on public.purchase_requests
  for all to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement']))
  )
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement']))
  );

drop policy if exists action_items_role_read on public.action_items;
drop policy if exists action_items_office_write on public.action_items;
create policy action_items_role_read on public.action_items
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']))
  );
create policy action_items_office_write on public.action_items
  for all to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement']))
  )
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement']))
  );

drop policy if exists action_documents_role_read on public.action_documents;
drop policy if exists action_documents_office_write on public.action_documents;
create policy action_documents_role_read on public.action_documents
  for select to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']))
  );
create policy action_documents_office_write on public.action_documents
  for all to authenticated
  using (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement']))
  )
  with check (
    (select public.user_belongs_to_company(company_id))
    and (select public.has_any_role(array['admin', 'direction', 'armement']))
  );

-- Deliberately no schema change and no foreign key on public.planning_projects in phase 1.
