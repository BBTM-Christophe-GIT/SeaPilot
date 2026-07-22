-- DPR phases 3 and 4: normalized model, controlled workflow, tenant RLS,
-- migration traceability and private Storage buckets.

create or replace function public.has_company_role(target_company_id bigint, required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_company_id is not null
    and public.user_belongs_to_company(target_company_id)
    and exists (
      select 1
      from public.user_roles role_assignment
      where role_assignment.user_id = (select auth.uid())
        and role_assignment.company_id = target_company_id
        and role_assignment.role_key = any(required_roles)
    );
$$;

revoke all on function public.has_company_role(bigint, text[]) from public, anon;
grant execute on function public.has_company_role(bigint, text[]) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'people_id_company_key'
      and conrelid = 'public.people'::regclass
  ) then
    alter table public.people add constraint people_id_company_key unique (id, company_id);
  end if;
end $$;

create table if not exists public.migration_batches (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  migration_key text not null,
  source_kind text not null default 'sharepoint',
  source_site_url text not null,
  mode text not null,
  status text not null default 'pending',
  manifest_sha256 text,
  git_commit text,
  rules_version text not null,
  started_at timestamptz,
  completed_at timestamptz,
  counters jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint migration_batches_mode_check check (mode in ('inventory', 'dry-run', 'apply', 'resume', 'reconcile', 'verify-idempotence', 'historical-load')),
  constraint migration_batches_status_check check (status in ('pending', 'running', 'completed', 'completed-with-warnings', 'failed', 'cancelled')),
  constraint migration_batches_manifest_sha256_check check (manifest_sha256 is null or manifest_sha256 ~ '^[0-9a-f]{64}$'),
  constraint migration_batches_counters_check check (jsonb_typeof(counters) = 'object'),
  constraint migration_batches_dates_check check (completed_at is null or started_at is null or completed_at >= started_at),
  constraint migration_batches_company_key unique (id, company_id),
  constraint migration_batches_natural_key unique (company_id, migration_key)
);

create table if not exists public.migration_records (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  batch_id bigint not null,
  entity_type text not null,
  source_site_id text not null,
  source_container_id text not null,
  source_item_id text not null,
  target_table text,
  target_id bigint,
  state text not null default 'discovered',
  action text,
  source_size_bytes bigint,
  source_sha256 text,
  target_size_bytes bigint,
  target_sha256 text,
  attempts integer not null default 0,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint migration_records_batch_company_fkey
    foreign key (batch_id, company_id) references public.migration_batches(id, company_id) on delete cascade,
  constraint migration_records_state_check check (state in ('discovered', 'normalized', 'db-loaded', 'file-verified', 'storage-loaded', 'linked', 'reconciled', 'excluded', 'error')),
  constraint migration_records_action_check check (action is null or action in ('inserted', 'updated', 'unchanged', 'excluded', 'error')),
  constraint migration_records_sizes_check check (coalesce(source_size_bytes, 0) >= 0 and coalesce(target_size_bytes, 0) >= 0),
  constraint migration_records_attempts_check check (attempts >= 0),
  constraint migration_records_source_sha256_check check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint migration_records_target_sha256_check check (target_sha256 is null or target_sha256 ~ '^[0-9a-f]{64}$'),
  constraint migration_records_source_unique unique (company_id, source_site_id, source_container_id, source_item_id, entity_type)
);

create table if not exists public.migration_errors (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  batch_id bigint not null,
  migration_record_id bigint references public.migration_records(id) on delete cascade,
  stage text not null,
  entity_type text not null,
  source_site_id text,
  source_container_id text,
  source_item_id text,
  error_code text not null,
  severity text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  retryable boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_notes text,
  created_at timestamptz not null default now(),
  constraint migration_errors_batch_company_fkey
    foreign key (batch_id, company_id) references public.migration_batches(id, company_id) on delete cascade,
  constraint migration_errors_severity_check check (severity in ('warning', 'error', 'blocking')),
  constraint migration_errors_context_check check (jsonb_typeof(context) = 'object')
);

create table if not exists public.migration_source_snapshots (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  batch_id bigint not null,
  migration_record_id bigint not null references public.migration_records(id) on delete cascade,
  source_payload jsonb not null,
  payload_sha256 text not null,
  created_at timestamptz not null default now(),
  constraint migration_source_snapshots_batch_company_fkey
    foreign key (batch_id, company_id) references public.migration_batches(id, company_id) on delete cascade,
  constraint migration_source_snapshots_payload_check check (jsonb_typeof(source_payload) = 'object'),
  constraint migration_source_snapshots_sha256_check check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  constraint migration_source_snapshots_record_unique unique (migration_record_id)
);

create table if not exists public.dpr_reports (
  id bigint generated always as identity primary key,
  company_id bigint not null default public.current_planning_company_id() references public.companies(id) on delete restrict,
  dpr_number bigint,
  status text not null default 'draft',
  report_date date not null,
  project_id bigint,
  unlisted_project_name text,
  vessel_id bigint,
  issuer_user_id uuid references public.profiles(id) on delete restrict,
  issuer_name_snapshot text not null,
  description text,
  qhse_note text,
  version_no integer not null default 1,
  reopened_from_version integer,
  reopen_reason text,
  created_by uuid references public.profiles(id) on delete restrict,
  updated_by uuid references public.profiles(id) on delete restrict,
  submitted_by uuid references public.profiles(id) on delete restrict,
  validated_by uuid references public.profiles(id) on delete restrict,
  reopened_by uuid references public.profiles(id) on delete restrict,
  deleted_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  validated_at timestamptz,
  reopened_at timestamptz,
  deleted_at timestamptz,
  deletion_reason text,
  source_label text not null default 'seapilot',
  sharepoint_site_id text,
  sharepoint_site_url text,
  sharepoint_list_id text,
  sharepoint_item_id text,
  sharepoint_unique_id text,
  source_modified_at timestamptz,
  migration_batch_id bigint references public.migration_batches(id) on delete restrict,
  source_payload jsonb,
  constraint dpr_reports_company_key unique (id, company_id),
  constraint dpr_reports_status_check check (status in ('draft', 'submitted', 'validated', 'reopened')),
  constraint dpr_reports_number_check check (dpr_number is null or dpr_number > 0),
  constraint dpr_reports_version_check check (version_no > 0),
  constraint dpr_reports_project_choice_check check (project_id is null or unlisted_project_name is null),
  constraint dpr_reports_project_name_check check (unlisted_project_name is null or length(trim(unlisted_project_name)) > 0),
  constraint dpr_reports_issuer_name_check check (length(trim(issuer_name_snapshot)) > 0),
  constraint dpr_reports_native_issuer_check check (source_label = 'sharepoint' or issuer_user_id is not null),
  constraint dpr_reports_submitted_check check (
    status = 'draft'
    or (source_label = 'sharepoint' and migration_batch_id is not null and dpr_number is not null)
    or (dpr_number is not null and submitted_by is not null and submitted_at is not null)
  ),
  constraint dpr_reports_validated_check check (
    status <> 'validated'
    or (source_label = 'sharepoint' and migration_batch_id is not null)
    or (validated_by is not null and validated_at is not null)
  ),
  constraint dpr_reports_deleted_check check (
    (deleted_at is null and deleted_by is null and deletion_reason is null)
    or (deleted_at is not null and deleted_by is not null and length(trim(deletion_reason)) > 0)
  ),
  constraint dpr_reports_source_payload_check check (source_payload is null or jsonb_typeof(source_payload) = 'object'),
  constraint dpr_reports_project_company_fkey
    foreign key (project_id, company_id) references public.projects(id, company_id) on delete restrict,
  constraint dpr_reports_vessel_company_fkey
    foreign key (vessel_id, company_id) references public.vessels(id, company_id) on delete restrict
);

create table if not exists public.dpr_number_counters (
  company_id bigint primary key references public.companies(id) on delete cascade,
  next_number bigint not null,
  updated_at timestamptz not null default now(),
  constraint dpr_number_counters_next_check check (next_number > 0)
);

create table if not exists public.dpr_daily_metrics (
  dpr_id bigint not null,
  company_id bigint not null,
  fuel_consumed_liters numeric(14,3),
  fuel_on_board_liters numeric(14,3),
  primary key (dpr_id),
  constraint dpr_daily_metrics_report_fkey foreign key (dpr_id, company_id) references public.dpr_reports(id, company_id) on delete cascade,
  constraint dpr_daily_metrics_values_check check (coalesce(fuel_consumed_liters, 0) >= 0 and coalesce(fuel_on_board_liters, 0) >= 0)
);

create table if not exists public.dpr_crew_members (
  id bigint generated always as identity primary key,
  dpr_id bigint not null,
  company_id bigint not null,
  person_id bigint not null,
  crew_function text not null,
  roster_group text,
  display_name_snapshot text not null,
  display_order integer not null default 0,
  constraint dpr_crew_members_report_fkey foreign key (dpr_id, company_id) references public.dpr_reports(id, company_id) on delete cascade,
  constraint dpr_crew_members_person_fkey foreign key (person_id, company_id) references public.people(id, company_id) on delete restrict,
  constraint dpr_crew_members_function_check check (crew_function in ('captain', 'chief-engineer', 'second-captain', 'execution')),
  constraint dpr_crew_members_order_check check (display_order >= 0),
  constraint dpr_crew_members_unique unique (dpr_id, person_id, crew_function)
);

create table if not exists public.dpr_other_people (
  id bigint generated always as identity primary key,
  dpr_id bigint not null,
  company_id bigint not null,
  person_id bigint,
  display_name_snapshot text not null,
  display_order integer not null default 0,
  constraint dpr_other_people_report_fkey foreign key (dpr_id, company_id) references public.dpr_reports(id, company_id) on delete cascade,
  constraint dpr_other_people_person_fkey foreign key (person_id, company_id) references public.people(id, company_id) on delete restrict,
  constraint dpr_other_people_name_check check (length(trim(display_name_snapshot)) > 0),
  constraint dpr_other_people_order_check check (display_order >= 0)
);

create table if not exists public.dpr_incidents (
  id bigint generated always as identity primary key,
  dpr_id bigint not null,
  company_id bigint not null,
  category text not null,
  level text not null,
  notes text,
  constraint dpr_incidents_report_fkey foreign key (dpr_id, company_id) references public.dpr_reports(id, company_id) on delete cascade,
  constraint dpr_incidents_category_check check (category in ('person', 'equipment', 'environment')),
  constraint dpr_incidents_level_check check (level in ('T0', 'T1', 'T2')),
  constraint dpr_incidents_unique unique (dpr_id, category)
);

create table if not exists public.dpr_hse_actions (
  dpr_id bigint primary key,
  company_id bigint not null,
  tbt_performed boolean not null default false,
  tbt_theme text,
  hse_visit_performed boolean not null default false,
  hse_audit_performed boolean not null default false,
  good_practices_count integer not null default 0,
  dangerous_situations_count integer not null default 0,
  stop_work_count integer not null default 0,
  constraint dpr_hse_actions_report_fkey foreign key (dpr_id, company_id) references public.dpr_reports(id, company_id) on delete cascade,
  constraint dpr_hse_actions_counts_check check (good_practices_count >= 0 and dangerous_situations_count >= 0 and stop_work_count >= 0),
  constraint dpr_hse_actions_tbt_check check ((not tbt_performed and tbt_theme is null) or (tbt_performed and length(trim(tbt_theme)) > 0))
);

create table if not exists public.emergency_exercise_types (
  key text primary key,
  label text not null unique,
  display_order integer not null,
  active boolean not null default true,
  constraint emergency_exercise_types_order_check check (display_order >= 0)
);

insert into public.emergency_exercise_types (key, label, display_order)
values
  ('fire-protection', 'Protection contre l''incendie', 10),
  ('abandon-ship', 'Évacuation et abandon du navire', 20),
  ('onboard-evacuation', 'Évacuation à bord', 30),
  ('sea-rescue', 'Sauvetage en mer', 40),
  ('loss-of-propulsion', 'Perte de propulsion – manœuvrabilité', 50),
  ('loss-of-power', 'Perte d''énergie', 60),
  ('injured-person', 'Évacuation et prise en charge d''un blessé', 70),
  ('flooding-control', 'Lutte contre l''envahissement', 80)
on conflict (key) do update set label = excluded.label, display_order = excluded.display_order;

create table if not exists public.dpr_emergency_exercises (
  dpr_id bigint not null,
  company_id bigint not null,
  exercise_type_key text not null references public.emergency_exercise_types(key) on delete restrict,
  notes text,
  primary key (dpr_id, exercise_type_key),
  constraint dpr_emergency_exercises_report_fkey foreign key (dpr_id, company_id) references public.dpr_reports(id, company_id) on delete cascade
);

create table if not exists public.dpr_port_calls (
  id bigint generated always as identity primary key,
  dpr_id bigint not null,
  company_id bigint not null,
  port_name text,
  arrival_at timestamptz,
  departure_at timestamptz,
  display_order integer not null default 0,
  constraint dpr_port_calls_company_key unique (id, company_id),
  constraint dpr_port_calls_report_fkey foreign key (dpr_id, company_id) references public.dpr_reports(id, company_id) on delete cascade,
  constraint dpr_port_calls_dates_check check (departure_at is null or arrival_at is null or departure_at >= arrival_at),
  constraint dpr_port_calls_order_check check (display_order >= 0)
);

create table if not exists public.port_call_reason_types (
  key text primary key,
  label text not null unique,
  display_order integer not null,
  active boolean not null default true,
  constraint port_call_reason_types_order_check check (display_order >= 0)
);

insert into public.port_call_reason_types (key, label, display_order)
values
  ('crew-change', 'Crew Change', 10),
  ('weather-standby', 'Stand-by météo', 20),
  ('breakdown', 'Avarie', 30),
  ('standby', 'Stand-by', 40)
on conflict (key) do update set label = excluded.label, display_order = excluded.display_order;

create table if not exists public.dpr_port_call_reasons (
  port_call_id bigint not null,
  company_id bigint not null,
  reason_type_key text not null references public.port_call_reason_types(key) on delete restrict,
  primary key (port_call_id, reason_type_key),
  constraint dpr_port_call_reasons_call_fkey foreign key (port_call_id, company_id) references public.dpr_port_calls(id, company_id) on delete cascade
);

create table if not exists public.dpr_supplies (
  dpr_id bigint primary key,
  company_id bigint not null,
  fuel_m3 numeric(14,3),
  oil_liters numeric(14,3),
  water_m3 numeric(14,3),
  constraint dpr_supplies_report_fkey foreign key (dpr_id, company_id) references public.dpr_reports(id, company_id) on delete cascade,
  constraint dpr_supplies_values_check check (coalesce(fuel_m3, 0) >= 0 and coalesce(oil_liters, 0) >= 0 and coalesce(water_m3, 0) >= 0)
);

create table if not exists public.waste_types (
  key text primary key,
  label text not null unique,
  unit text not null,
  display_order integer not null,
  active boolean not null default true,
  constraint waste_types_unit_check check (unit in ('kg', 'l')),
  constraint waste_types_order_check check (display_order >= 0)
);

insert into public.waste_types (key, label, unit, display_order)
values
  ('black-bin', 'Poubelle noire', 'kg', 10),
  ('recyclable', 'Déchets recyclables', 'kg', 20),
  ('bilge-water-oil', 'Eaux de cale et huiles', 'l', 30),
  ('wastewater', 'Eaux usées', 'l', 40)
on conflict (key) do update set label = excluded.label, unit = excluded.unit, display_order = excluded.display_order;

create table if not exists public.dpr_waste_records (
  dpr_id bigint not null,
  company_id bigint not null,
  waste_type_key text not null references public.waste_types(key) on delete restrict,
  quantity numeric(14,3) not null,
  unit text not null,
  primary key (dpr_id, waste_type_key),
  constraint dpr_waste_records_report_fkey foreign key (dpr_id, company_id) references public.dpr_reports(id, company_id) on delete cascade,
  constraint dpr_waste_records_quantity_check check (quantity >= 0),
  constraint dpr_waste_records_unit_check check (unit in ('kg', 'l'))
);

create table if not exists public.dpr_files (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  dpr_id bigint not null,
  file_kind text not null,
  bucket_name text not null,
  object_path text not null,
  original_filename text not null,
  display_filename text not null,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  status text not null default 'pending',
  version_no integer,
  is_current boolean not null default false,
  display_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete restrict,
  sharepoint_site_id text,
  sharepoint_drive_id text,
  sharepoint_item_id text,
  source_modified_at timestamptz,
  migration_batch_id bigint references public.migration_batches(id) on delete restrict,
  constraint dpr_files_company_key unique (id, company_id),
  constraint dpr_files_report_fkey foreign key (dpr_id, company_id) references public.dpr_reports(id, company_id) on delete cascade,
  constraint dpr_files_kind_check check (file_kind in ('pdf', 'photo', 'attachment')),
  constraint dpr_files_bucket_check check (
    (file_kind = 'pdf' and bucket_name = 'dpr-pdfs')
    or (file_kind = 'photo' and bucket_name = 'dpr-photos')
    or (file_kind = 'attachment' and bucket_name = 'dpr-attachments')
  ),
  constraint dpr_files_pdf_mime_check check (file_kind <> 'pdf' or mime_type = 'application/pdf'),
  constraint dpr_files_size_check check (size_bytes >= 0),
  constraint dpr_files_sha256_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint dpr_files_status_check check (status in ('pending', 'ready', 'error')),
  constraint dpr_files_version_check check ((file_kind = 'pdf' and version_no is not null and version_no > 0) or (file_kind <> 'pdf' and version_no is null)),
  constraint dpr_files_current_check check (not is_current or file_kind = 'pdf'),
  constraint dpr_files_order_check check (display_order >= 0)
);

create table if not exists public.dpr_audit_events (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  dpr_id bigint not null,
  version_no integer not null,
  event_type text not null,
  actor_user_id uuid references public.profiles(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  reason text,
  correlation_id uuid not null default gen_random_uuid(),
  metadata jsonb not null default '{}'::jsonb,
  constraint dpr_audit_events_report_fkey foreign key (dpr_id, company_id) references public.dpr_reports(id, company_id) on delete cascade,
  constraint dpr_audit_events_type_check check (event_type in ('created', 'updated', 'submitted', 'validated', 'reopened', 'pdf-generated', 'file-registered', 'signed-url-issued', 'soft-deleted', 'restored', 'imported', 'migration-corrected')),
  constraint dpr_audit_events_version_check check (version_no > 0),
  constraint dpr_audit_events_metadata_check check (jsonb_typeof(metadata) = 'object')
);

alter table public.mgo_prices add column if not exists company_id bigint;
alter table public.mgo_prices add column if not exists unit text not null default 'l';
alter table public.mgo_prices add column if not exists tax_basis text not null default 'HT';
update public.mgo_prices
set company_id = (select id from public.companies where code = 'bbtm'),
    currency = coalesce(currency, 'EUR')
where company_id is null or currency is null;
alter table public.mgo_prices alter column company_id set not null;
alter table public.mgo_prices alter column company_id set default public.current_planning_company_id();
alter table public.mgo_prices alter column currency set default 'EUR';
alter table public.mgo_prices alter column currency set not null;
alter table public.mgo_prices
  add constraint mgo_prices_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
alter table public.mgo_prices
  add constraint mgo_prices_business_unit_check check (currency = 'EUR' and tax_basis = 'HT' and unit = 'l') not valid;
alter table public.mgo_prices validate constraint mgo_prices_business_unit_check;
alter table public.mgo_prices
  add constraint mgo_prices_price_nonnegative_check check (price_ht is null or price_ht >= 0) not valid;
alter table public.mgo_prices validate constraint mgo_prices_price_nonnegative_check;

create unique index if not exists dpr_reports_number_unique_idx
  on public.dpr_reports (company_id, dpr_number) where dpr_number is not null;
create unique index if not exists dpr_reports_sharepoint_unique_idx
  on public.dpr_reports (company_id, sharepoint_site_id, sharepoint_list_id, sharepoint_item_id)
  where sharepoint_site_id is not null and sharepoint_list_id is not null and sharepoint_item_id is not null;
create index if not exists dpr_reports_company_date_idx on public.dpr_reports (company_id, report_date desc);
create index if not exists dpr_reports_company_vessel_date_idx on public.dpr_reports (company_id, vessel_id, report_date desc) where vessel_id is not null;
create index if not exists dpr_reports_company_project_date_idx on public.dpr_reports (company_id, project_id, report_date desc) where project_id is not null;
create index if not exists dpr_reports_company_status_date_idx on public.dpr_reports (company_id, status, report_date desc);
create index if not exists dpr_reports_company_author_status_idx on public.dpr_reports (company_id, created_by, status);
create index if not exists dpr_reports_migration_batch_idx on public.dpr_reports (migration_batch_id);
create index if not exists dpr_crew_members_dpr_idx on public.dpr_crew_members (dpr_id);
create index if not exists dpr_crew_members_person_idx on public.dpr_crew_members (person_id);
create index if not exists dpr_other_people_dpr_idx on public.dpr_other_people (dpr_id);
create index if not exists dpr_other_people_person_idx on public.dpr_other_people (person_id);
create index if not exists dpr_incidents_dpr_idx on public.dpr_incidents (dpr_id);
create index if not exists dpr_port_calls_dpr_idx on public.dpr_port_calls (dpr_id);
create index if not exists dpr_files_dpr_kind_version_idx on public.dpr_files (dpr_id, file_kind, version_no);
create index if not exists dpr_files_sha256_idx on public.dpr_files (sha256);
create index if not exists dpr_files_object_path_idx on public.dpr_files (bucket_name, object_path);
create unique index if not exists dpr_files_current_pdf_unique_idx on public.dpr_files (dpr_id) where file_kind = 'pdf' and is_current and deleted_at is null;
create unique index if not exists dpr_files_sharepoint_unique_idx
  on public.dpr_files (company_id, sharepoint_site_id, sharepoint_drive_id, sharepoint_item_id)
  where sharepoint_site_id is not null and sharepoint_drive_id is not null and sharepoint_item_id is not null;
create index if not exists dpr_audit_events_dpr_time_idx on public.dpr_audit_events (dpr_id, occurred_at desc);
create index if not exists migration_records_batch_state_idx on public.migration_records (batch_id, state);
create index if not exists migration_errors_batch_severity_idx on public.migration_errors (batch_id, severity) where resolved_at is null;
create index if not exists mgo_prices_company_date_idx on public.mgo_prices (company_id, price_date desc);

create or replace function public.dpr_allocate_next_number(target_company_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allocated_number bigint;
begin
  insert into public.dpr_number_counters (company_id, next_number)
  values (
    target_company_id,
    greatest(coalesce((select max(report.dpr_number) + 1 from public.dpr_reports report where report.company_id = target_company_id), 1), 1)
  )
  on conflict (company_id) do nothing;

  select counter.next_number
  into allocated_number
  from public.dpr_number_counters counter
  where counter.company_id = target_company_id
  for update;

  update public.dpr_number_counters
  set next_number = allocated_number + 1,
      updated_at = now()
  where company_id = target_company_id;

  return allocated_number;
end;
$$;

revoke all on function public.dpr_allocate_next_number(bigint) from public, anon, authenticated;

create or replace function public.dpr_create_draft(
  target_report_date date,
  target_project_id bigint default null,
  target_unlisted_project_name text default null,
  target_vessel_id bigint default null,
  target_description text default null,
  target_qhse_note text default null
)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  profile_name text;
  created_report public.dpr_reports;
begin
  if target_report_date is null or not public.has_company_role(target_company_id, array['admin', 'direction', 'armement', 'capitaine', 'marin']) then
    raise exception 'Insufficient permission to create a DPR draft' using errcode = '42501';
  end if;

  select nullif(trim(profile.display_name), '') into profile_name
  from public.profiles profile where profile.id = auth.uid();
  if profile_name is null then
    raise exception 'The authenticated profile must have a display name' using errcode = '23514';
  end if;

  insert into public.dpr_reports (
    company_id, report_date, project_id, unlisted_project_name, vessel_id,
    issuer_user_id, issuer_name_snapshot, description, qhse_note, created_by, updated_by
  ) values (
    target_company_id, target_report_date, target_project_id, nullif(trim(target_unlisted_project_name), ''), target_vessel_id,
    auth.uid(), profile_name, nullif(trim(target_description), ''), nullif(trim(target_qhse_note), ''), auth.uid(), auth.uid()
  ) returning * into created_report;

  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (target_company_id, created_report.id, created_report.version_no, 'created', auth.uid());
  return created_report;
end;
$$;

create or replace function public.dpr_update_draft(
  target_dpr_id bigint,
  target_report_date date,
  target_project_id bigint default null,
  target_unlisted_project_name text default null,
  target_vessel_id bigint default null,
  target_description text default null,
  target_qhse_note text default null
)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  if current_report.id is null
     or not public.user_belongs_to_company(current_report.company_id)
     or current_report.deleted_at is not null
     or current_report.status not in ('draft', 'reopened')
     or not (
       public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement', 'capitaine'])
       or (public.has_company_role(current_report.company_id, array['marin']) and current_report.created_by = auth.uid())
     ) then
    raise exception 'Insufficient permission to update this DPR draft' using errcode = '42501';
  end if;

  update public.dpr_reports
  set report_date = target_report_date,
      project_id = target_project_id,
      unlisted_project_name = nullif(trim(target_unlisted_project_name), ''),
      vessel_id = target_vessel_id,
      description = nullif(trim(target_description), ''),
      qhse_note = nullif(trim(target_qhse_note), ''),
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_dpr_id
  returning * into current_report;

  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (current_report.company_id, current_report.id, current_report.version_no, 'updated', auth.uid());
  return current_report;
end;
$$;

create or replace function public.dpr_submit(target_dpr_id bigint)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  if current_report.id is null
     or current_report.deleted_at is not null
     or current_report.status not in ('draft', 'reopened')
     or not (
       public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement', 'capitaine'])
       or (public.has_company_role(current_report.company_id, array['marin']) and current_report.created_by = auth.uid())
     ) then
    raise exception 'Insufficient permission to submit this DPR' using errcode = '42501';
  end if;

  update public.dpr_reports
  set dpr_number = coalesce(dpr_number, public.dpr_allocate_next_number(company_id)),
      status = 'submitted',
      submitted_by = auth.uid(),
      submitted_at = now(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = target_dpr_id
  returning * into current_report;

  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (current_report.company_id, current_report.id, current_report.version_no, 'submitted', auth.uid());
  return current_report;
end;
$$;

create or replace function public.dpr_validate(target_dpr_id bigint)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  if current_report.id is null
     or current_report.deleted_at is not null
     or current_report.status <> 'submitted'
     or not public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement', 'capitaine']) then
    raise exception 'Insufficient permission to validate this DPR' using errcode = '42501';
  end if;

  update public.dpr_reports
  set status = 'validated', validated_by = auth.uid(), validated_at = now(), updated_by = auth.uid(), updated_at = now()
  where id = target_dpr_id returning * into current_report;
  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id)
  values (current_report.company_id, current_report.id, current_report.version_no, 'validated', auth.uid());
  return current_report;
end;
$$;

create or replace function public.dpr_reopen(target_dpr_id bigint, target_reason text)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  if current_report.id is null
     or current_report.deleted_at is not null
     or current_report.status <> 'validated'
     or nullif(trim(target_reason), '') is null
     or not public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement', 'capitaine']) then
    raise exception 'Insufficient permission to reopen this DPR' using errcode = '42501';
  end if;

  update public.dpr_reports
  set status = 'reopened', reopened_from_version = version_no, version_no = version_no + 1,
      reopened_by = auth.uid(), reopened_at = now(), reopen_reason = trim(target_reason),
      updated_by = auth.uid(), updated_at = now()
  where id = target_dpr_id returning * into current_report;
  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id, reason)
  values (current_report.company_id, current_report.id, current_report.version_no, 'reopened', auth.uid(), trim(target_reason));
  return current_report;
end;
$$;

create or replace function public.dpr_soft_delete(target_dpr_id bigint, target_reason text)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  if current_report.id is null
     or current_report.deleted_at is not null
     or nullif(trim(target_reason), '') is null
     or not public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement']) then
    raise exception 'Insufficient permission to delete this DPR' using errcode = '42501';
  end if;
  update public.dpr_reports
  set deleted_at = now(), deleted_by = auth.uid(), deletion_reason = trim(target_reason), updated_by = auth.uid(), updated_at = now()
  where id = target_dpr_id returning * into current_report;
  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id, reason)
  values (current_report.company_id, current_report.id, current_report.version_no, 'soft-deleted', auth.uid(), trim(target_reason));
  return current_report;
end;
$$;

create or replace function public.dpr_restore(target_dpr_id bigint, target_reason text)
returns public.dpr_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_report public.dpr_reports;
begin
  select * into current_report from public.dpr_reports where id = target_dpr_id for update;
  if current_report.id is null
     or current_report.deleted_at is null
     or nullif(trim(target_reason), '') is null
     or not public.has_company_role(current_report.company_id, array['admin', 'direction', 'armement']) then
    raise exception 'Insufficient permission to restore this DPR' using errcode = '42501';
  end if;
  update public.dpr_reports
  set deleted_at = null, deleted_by = null, deletion_reason = null, updated_by = auth.uid(), updated_at = now()
  where id = target_dpr_id returning * into current_report;
  insert into public.dpr_audit_events (company_id, dpr_id, version_no, event_type, actor_user_id, reason)
  values (current_report.company_id, current_report.id, current_report.version_no, 'restored', auth.uid(), trim(target_reason));
  return current_report;
end;
$$;

revoke all on function public.dpr_create_draft(date, bigint, text, bigint, text, text) from public, anon;
revoke all on function public.dpr_update_draft(bigint, date, bigint, text, bigint, text, text) from public, anon;
revoke all on function public.dpr_submit(bigint) from public, anon;
revoke all on function public.dpr_validate(bigint) from public, anon;
revoke all on function public.dpr_reopen(bigint, text) from public, anon;
revoke all on function public.dpr_soft_delete(bigint, text) from public, anon;
revoke all on function public.dpr_restore(bigint, text) from public, anon;
grant execute on function public.dpr_create_draft(date, bigint, text, bigint, text, text) to authenticated;
grant execute on function public.dpr_update_draft(bigint, date, bigint, text, bigint, text, text) to authenticated;
grant execute on function public.dpr_submit(bigint) to authenticated;
grant execute on function public.dpr_validate(bigint) to authenticated;
grant execute on function public.dpr_reopen(bigint, text) to authenticated;
grant execute on function public.dpr_soft_delete(bigint, text) to authenticated;
grant execute on function public.dpr_restore(bigint, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('dpr-pdfs', 'dpr-pdfs', false, null, array['application/pdf']::text[]),
  ('dpr-photos', 'dpr-photos', false, null, array['image/jpeg', 'image/png', 'image/webp', 'image/heic']::text[]),
  ('dpr-attachments', 'dpr-attachments', false, null, null)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'migration_batches', 'migration_records', 'migration_errors', 'migration_source_snapshots',
    'dpr_reports', 'dpr_number_counters', 'dpr_daily_metrics', 'dpr_crew_members', 'dpr_other_people',
    'dpr_incidents', 'dpr_hse_actions', 'dpr_emergency_exercises', 'dpr_port_calls',
    'dpr_port_call_reasons', 'dpr_supplies', 'dpr_waste_records', 'dpr_files', 'dpr_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

grant select on
  public.dpr_reports, public.dpr_daily_metrics, public.dpr_crew_members, public.dpr_other_people,
  public.dpr_incidents, public.dpr_hse_actions, public.emergency_exercise_types,
  public.dpr_emergency_exercises, public.dpr_port_calls, public.port_call_reason_types,
  public.dpr_port_call_reasons, public.dpr_supplies, public.waste_types, public.dpr_waste_records,
  public.dpr_files, public.dpr_audit_events, public.mgo_prices
to authenticated;

revoke insert, update, delete on
  public.dpr_reports, public.dpr_daily_metrics, public.dpr_crew_members, public.dpr_other_people,
  public.dpr_incidents, public.dpr_hse_actions, public.dpr_emergency_exercises, public.dpr_port_calls,
  public.dpr_port_call_reasons, public.dpr_supplies, public.dpr_waste_records, public.dpr_files,
  public.dpr_audit_events, public.migration_batches, public.migration_records, public.migration_errors,
  public.migration_source_snapshots
from authenticated;
revoke delete on public.mgo_prices from authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'dpr_reports', 'dpr_daily_metrics', 'dpr_crew_members', 'dpr_other_people', 'dpr_incidents',
    'dpr_hse_actions', 'dpr_emergency_exercises', 'dpr_port_calls', 'dpr_port_call_reasons',
    'dpr_supplies', 'dpr_waste_records', 'dpr_files', 'dpr_audit_events'
  ] loop
    execute format('drop policy if exists %I on public.%I', table_name || '_company_read', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_company_role(company_id, array[''admin'', ''direction'', ''armement'', ''capitaine'', ''marin'']))',
      table_name || '_company_read', table_name
    );
  end loop;
end $$;

drop policy if exists migration_batches_office_read on public.migration_batches;
create policy migration_batches_office_read on public.migration_batches for select to authenticated
using (public.has_company_role(company_id, array['admin', 'direction', 'armement']));
drop policy if exists migration_records_office_read on public.migration_records;
create policy migration_records_office_read on public.migration_records for select to authenticated
using (public.has_company_role(company_id, array['admin', 'direction', 'armement']));
drop policy if exists migration_errors_office_read on public.migration_errors;
create policy migration_errors_office_read on public.migration_errors for select to authenticated
using (public.has_company_role(company_id, array['admin', 'direction', 'armement']));
drop policy if exists migration_source_snapshots_office_read on public.migration_source_snapshots;
create policy migration_source_snapshots_office_read on public.migration_source_snapshots for select to authenticated
using (public.has_company_role(company_id, array['admin', 'direction', 'armement']));

drop policy if exists dpr_number_counters_office_read on public.dpr_number_counters;
create policy dpr_number_counters_office_read on public.dpr_number_counters for select to authenticated
using (public.has_company_role(company_id, array['admin', 'direction', 'armement']));

drop policy if exists mgo_prices_role_read on public.mgo_prices;
drop policy if exists mgo_prices_office_write on public.mgo_prices;
create policy mgo_prices_company_read on public.mgo_prices for select to authenticated
using (public.has_company_role(company_id, array['admin', 'direction', 'armement', 'capitaine', 'marin']));
create policy mgo_prices_office_insert on public.mgo_prices for insert to authenticated
with check (public.has_company_role(company_id, array['admin', 'direction', 'armement']));
create policy mgo_prices_office_update on public.mgo_prices for update to authenticated
using (public.has_company_role(company_id, array['admin', 'direction', 'armement']))
with check (public.has_company_role(company_id, array['admin', 'direction', 'armement']));

drop policy if exists dpr_storage_company_read on storage.objects;
create policy dpr_storage_company_read on storage.objects
for select to authenticated
using (
  bucket_id in ('dpr-pdfs', 'dpr-photos', 'dpr-attachments')
  and exists (
    select 1
    from public.dpr_files file
    where file.bucket_name = storage.objects.bucket_id
      and file.object_path = storage.objects.name
      and file.status = 'ready'
      and file.deleted_at is null
      and public.has_company_role(file.company_id, array['admin', 'direction', 'armement', 'capitaine', 'marin'])
  )
);

comment on table public.dpr_reports is 'Canonical tenant-scoped DPR header and lifecycle. Legacy dpr_items remains staging-only.';
comment on table public.dpr_files is 'Private Storage metadata. Object paths are built by trusted server-side migration and file workflows.';
comment on table public.dpr_audit_events is 'Append-only DPR lifecycle audit. Authenticated clients have no write privilege.';
