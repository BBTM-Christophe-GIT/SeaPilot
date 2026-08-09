-- Unify SharePoint Plan d'Action and Indicateurs QHSE records while keeping
-- safety-rate events linked to the versioned HSE exposure ledger.

alter table public.action_items
  add column if not exists company_id bigint references public.companies(id) on delete restrict
    default public.current_planning_company_id(),
  add column if not exists issuer_name text,
  add column if not exists action_type_key text,
  add column if not exists deviation_type text,
  add column if not exists level_label text,
  add column if not exists location_detail text,
  add column if not exists closed_on date,
  add column if not exists realized_action text,
  add column if not exists anomaly_cause text,
  add column if not exists comments text,
  add column if not exists photo_1_path text,
  add column if not exists photo_2_path text,
  add column if not exists closure_photo_path text,
  add column if not exists victim_person_id bigint references public.people(id) on delete set null,
  add column if not exists victim_sharepoint_item_id text,
  add column if not exists lost_days numeric(12,2) not null default 0,
  add column if not exists safety_event_details jsonb not null default '{}'::jsonb;

update public.action_items
set company_id = public.current_planning_company_id()
where company_id is null;

alter table public.action_items alter column company_id set not null;

create table if not exists public.action_type_catalog (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade
    default public.current_planning_company_id(),
  type_key text not null,
  label text not null,
  family text not null,
  hse_classification text,
  tracks_exposure_rate boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_type_catalog_family_check check (family in ('action','audit','visit','event')),
  constraint action_type_catalog_hse_classification_check check (
    hse_classification is null or hse_classification in ('FAT','LWDC','RWC','MTC','FAC','NEAR_MISS','SAFETY_OBSERVATION')
  ),
  unique (company_id, type_key)
);

insert into public.action_type_catalog (
  company_id, type_key, label, family, hse_classification, tracks_exposure_rate, sort_order
)
select company.id, seed.type_key, seed.label, seed.family, seed.hse_classification, seed.tracks_exposure_rate, seed.sort_order
from public.companies company
cross join (values
  ('action_progress', 'Action de Progrès - BBTM', 'action', null, false, 10),
  ('audit_client', 'Audit Client', 'audit', null, false, 20),
  ('audit_ecmid', 'Audit eCMID - IMCA', 'audit', null, false, 30),
  ('audit_internal', 'Audit Interne - BBTM', 'audit', null, false, 40),
  ('decarbonation_plan', 'Plan de décarbonation', 'action', null, false, 50),
  ('visit_davit', 'Visite Bossoir', 'visit', null, false, 60),
  ('visit_crane', 'Visite Grue', 'visit', null, false, 70),
  ('visit_hse', 'Visite HSE/Exploitation', 'visit', null, false, 80),
  ('visit_radio', 'Visite Radio', 'visit', null, false, 90),
  ('visit_classification', 'Visite Société de Classification', 'visit', null, false, 100),
  ('technical_stop', 'Arrêt Technique', 'action', null, false, 110),
  ('fatality', 'Décès (FAT)', 'event', 'FAT', true, 200),
  ('lost_time_injury', 'Accident avec Arrêt de Travail (LTI)', 'event', 'LWDC', true, 210),
  ('restricted_work_case', 'Blessure - Travail adapté (RWC)', 'event', 'RWC', true, 220),
  ('medical_treatment_case', 'Accident avec traitement médical (MTC)', 'event', 'MTC', true, 230),
  ('first_aid_case', 'Accident sans arrêt de travail (FAC)', 'event', 'FAC', true, 240),
  ('near_miss', 'Presqu’accident', 'event', 'NEAR_MISS', true, 250),
  ('safety_observation', 'Observation sécurité', 'event', 'SAFETY_OBSERVATION', true, 260),
  ('dangerous_situation', 'Situation dangereuse', 'event', null, false, 270),
  ('material_damage', 'Dommage / casse matérielle', 'event', null, false, 280),
  ('equipment_failure_t1', 'Avarie équipement T1', 'event', null, false, 290),
  ('equipment_failure_t2', 'Avarie équipement T2', 'event', null, false, 300),
  ('commuting_accident', 'Accident de trajet', 'event', null, false, 310),
  ('marine_report', 'Rapport de mer', 'event', null, false, 320),
  ('environmental_event', 'Événement environnemental', 'event', null, false, 330)
) as seed(type_key, label, family, hse_classification, tracks_exposure_rate, sort_order)
on conflict (company_id, type_key) do update set
  label = excluded.label,
  family = excluded.family,
  hse_classification = excluded.hse_classification,
  tracks_exposure_rate = excluded.tracks_exposure_rate,
  sort_order = excluded.sort_order,
  active = true,
  updated_at = now();

alter table public.action_items drop constraint if exists action_items_action_type_key_fkey;
alter table public.action_items add constraint action_items_action_type_key_fkey
  foreign key (company_id, action_type_key)
  references public.action_type_catalog(company_id, type_key)
  on update cascade;

alter table public.action_items drop constraint if exists action_items_lost_days_check;
alter table public.action_items add constraint action_items_lost_days_check check (lost_days >= 0);

alter table public.hse_safety_events
  add column if not exists action_item_id bigint references public.action_items(id) on delete cascade;

create unique index if not exists hse_safety_events_action_item_unique_idx
  on public.hse_safety_events(action_item_id)
  where action_item_id is not null;

create index if not exists action_items_company_filters_idx
  on public.action_items(company_id, status, vessel_id, action_type_key, opened_on, due_on);

create index if not exists action_type_catalog_active_idx
  on public.action_type_catalog(company_id, active, sort_order);

insert into public.sharepoint_sources (
  key, title, source_type, module_key, related_module_keys, site_url, list_id,
  server_relative_url, browser_url, target_table, import_priority, confirmed, notes
)
values
  (
    'list-audit', 'Plan d''Action', 'list', 'actionPlan', array['qhse'],
    'https://bbtm668.sharepoint.com/sites/QHSE',
    '8a1a31f5-e212-4a03-ae6b-bcc855ea029b',
    '/sites/QHSE/Lists/Audit',
    'https://bbtm668.sharepoint.com/sites/QHSE/Lists/Audit/Plan%20d%27Action.aspx',
    'action_items', 140, true,
    'Source Power Query Plan d''Action.iqy, vue 059A2677-1C55-4153-8AF4-8F5923C1C5DD.'
  ),
  (
    'list-indicateurs-qhse', 'Indicateurs QHSE', 'list', 'actionPlan', array['qhse','workingTime'],
    'https://bbtm668.sharepoint.com/sites/QHSE',
    '833e4b0f-0f5a-4e9b-b1b0-885224a41282',
    '/sites/QHSE/Lists/Indicateurs QHSE', null,
    'action_items', 141, true,
    'Source Power Query Indicateurs QHSE.iqy, vue 70AE0C15-3C2D-4D30-B87F-4F1C5A24A65B.'
  )
on conflict (key) do update set
  title = excluded.title,
  source_type = excluded.source_type,
  module_key = excluded.module_key,
  related_module_keys = excluded.related_module_keys,
  site_url = excluded.site_url,
  list_id = excluded.list_id,
  server_relative_url = excluded.server_relative_url,
  browser_url = excluded.browser_url,
  target_table = excluded.target_table,
  import_priority = excluded.import_priority,
  confirmed = excluded.confirmed,
  notes = excluded.notes,
  updated_at = now();

create or replace function public.sync_action_item_hse_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_classification text;
begin
  select catalog.hse_classification into target_classification
  from public.action_type_catalog catalog
  where catalog.company_id = new.company_id
    and catalog.type_key = new.action_type_key
    and catalog.active;

  if target_classification is null then
    return new;
  end if;

  insert into public.hse_safety_events (
    company_id,
    action_item_id,
    occurred_on,
    classification,
    person_id,
    vessel_id,
    project_id,
    lost_days,
    title,
    description,
    created_by
  ) values (
    new.company_id,
    new.id,
    coalesce(new.opened_on, new.created_at::date, current_date),
    target_classification,
    new.victim_person_id,
    new.vessel_id,
    new.project_id,
    new.lost_days,
    new.title,
    coalesce(new.description, new.comments),
    auth.uid()
  )
  on conflict (action_item_id) where action_item_id is not null do update set
    occurred_on = excluded.occurred_on,
    classification = excluded.classification,
    person_id = excluded.person_id,
    vessel_id = excluded.vessel_id,
    project_id = excluded.project_id,
    lost_days = excluded.lost_days,
    title = excluded.title,
    description = excluded.description;

  return new;
end;
$$;

drop trigger if exists action_items_sync_hse_event on public.action_items;
create trigger action_items_sync_hse_event
after insert or update of action_type_key, opened_on, victim_person_id, vessel_id, project_id, lost_days, title, description, comments
on public.action_items
for each row execute function public.sync_action_item_hse_event();

alter table public.action_type_catalog enable row level security;
revoke all on public.action_type_catalog from anon, authenticated;
grant select on public.action_type_catalog to authenticated;

create policy action_type_catalog_company_read
on public.action_type_catalog for select to authenticated
using (
  company_id = public.current_planning_company_id()
  and public.has_any_role(array['admin','direction','armement','capitaine','marin'])
);

drop policy if exists action_items_role_read on public.action_items;
create policy action_items_role_read on public.action_items
  for select to authenticated
  using (
    company_id = public.current_planning_company_id()
    and public.has_any_role(array['admin','direction','armement','capitaine','marin'])
  );

drop policy if exists action_items_office_write on public.action_items;
create policy action_items_office_write on public.action_items
  for all to authenticated
  using (
    company_id = public.current_planning_company_id()
    and public.has_any_role(array['admin','direction','armement'])
  )
  with check (
    company_id = public.current_planning_company_id()
    and public.has_any_role(array['admin','direction','armement'])
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'action-plan-evidence', 'action-plan-evidence', false, 10485760,
  array['image/png','image/jpeg','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy action_plan_evidence_storage_read
on storage.objects for select to authenticated
using (
  bucket_id = 'action-plan-evidence'
  and split_part(name, '/', 1) = public.current_planning_company_id()::text
  and public.has_any_role(array['admin','direction','armement','capitaine','marin'])
);

create policy action_plan_evidence_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'action-plan-evidence'
  and split_part(name, '/', 1) = public.current_planning_company_id()::text
  and public.has_any_role(array['admin','direction','armement'])
);

comment on table public.action_type_catalog is
  'SeaPilot action and HSE-event categories. hse_classification links reportable events to the exposure-hour KPI ledger.';
comment on column public.action_items.safety_event_details is
  'Source-preserving JSON for SharePoint Indicateurs QHSE fields that are not common action-plan dimensions.';
