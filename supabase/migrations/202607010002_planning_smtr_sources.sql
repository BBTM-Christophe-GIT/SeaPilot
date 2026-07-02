create table if not exists public.planning_days (
  id bigint generated always as identity primary key,
  person_id bigint references public.people(id) on delete set null,
  vessel_id bigint references public.vessels(id) on delete set null,
  crew_name text not null default '',
  captain_name text,
  vessel_name text,
  manual_vessel_name text,
  work_date date not null,
  disembark_on date,
  year_number integer,
  month_number integer,
  month_label text,
  day_number integer,
  function_label text,
  sailor_status text,
  day_status text,
  rhythm_label text,
  watch_group text,
  slot365 text,
  departure_on date,
  worked_hours numeric(8, 2),
  rest_24h numeric(8, 2),
  cumulative_7d numeric(8, 2),
  comments text,
  source_label text not null default 'sharepoint',
  sharepoint_site_url text,
  sharepoint_list_id text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  sharepoint_unique_id text,
  sharepoint_file_ref text,
  sharepoint_encoded_abs_url text,
  source_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_days_worked_hours_check check (worked_hours is null or worked_hours >= 0),
  constraint planning_days_rest_24h_check check (rest_24h is null or rest_24h >= 0),
  constraint planning_days_cumulative_7d_check check (cumulative_7d is null or cumulative_7d >= 0)
);

create table if not exists public.planning_periods (
  id bigint generated always as identity primary key,
  person_id bigint references public.people(id) on delete set null,
  vessel_id bigint references public.vessels(id) on delete set null,
  crew_name text not null default '',
  vessel_name text,
  manual_vessel_name text,
  watch_group text,
  function_label text,
  sailor_status text,
  starts_on date not null,
  ends_on date not null,
  year_number integer,
  comments text,
  slot365_source_id text,
  slot365_source_key text,
  source_label text not null default 'sharepoint',
  sharepoint_site_url text,
  sharepoint_list_id text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  sharepoint_unique_id text,
  sharepoint_file_ref text,
  sharepoint_encoded_abs_url text,
  source_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_periods_valid_dates check (ends_on >= starts_on)
);

create table if not exists public.planning_projects (
  id bigint generated always as identity primary key,
  title text not null,
  starts_on date,
  ends_on date,
  description text,
  client_name text,
  primary_vessel_id bigint references public.vessels(id) on delete set null,
  primary_vessel_name text,
  secondary_vessel_id bigint references public.vessels(id) on delete set null,
  secondary_vessel_name text,
  status text,
  source_label text not null default 'sharepoint',
  sharepoint_site_url text,
  sharepoint_list_id text,
  sharepoint_list_title text,
  sharepoint_item_id text,
  sharepoint_unique_id text,
  sharepoint_file_ref text,
  sharepoint_encoded_abs_url text,
  source_modified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_projects_valid_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create index if not exists planning_days_person_id_idx on public.planning_days (person_id);
create index if not exists planning_days_vessel_id_idx on public.planning_days (vessel_id);
create index if not exists planning_days_work_date_idx on public.planning_days (work_date);
create index if not exists planning_days_slot365_idx on public.planning_days (slot365);
create index if not exists planning_days_sharepoint_item_idx on public.planning_days (sharepoint_list_id, sharepoint_item_id);
create unique index if not exists planning_days_sharepoint_item_unique_idx
  on public.planning_days (sharepoint_list_id, sharepoint_item_id)
  where sharepoint_list_id is not null and sharepoint_item_id is not null;

create index if not exists planning_periods_person_id_idx on public.planning_periods (person_id);
create index if not exists planning_periods_vessel_id_idx on public.planning_periods (vessel_id);
create index if not exists planning_periods_dates_idx on public.planning_periods (starts_on, ends_on);
create index if not exists planning_periods_slot365_source_key_idx on public.planning_periods (slot365_source_key);
create index if not exists planning_periods_sharepoint_item_idx on public.planning_periods (sharepoint_list_id, sharepoint_item_id);
create unique index if not exists planning_periods_sharepoint_item_unique_idx
  on public.planning_periods (sharepoint_list_id, sharepoint_item_id)
  where sharepoint_list_id is not null and sharepoint_item_id is not null;

create index if not exists planning_projects_primary_vessel_id_idx on public.planning_projects (primary_vessel_id);
create index if not exists planning_projects_secondary_vessel_id_idx on public.planning_projects (secondary_vessel_id);
create index if not exists planning_projects_dates_idx on public.planning_projects (starts_on, ends_on);
create index if not exists planning_projects_status_idx on public.planning_projects (status);
create index if not exists planning_projects_sharepoint_item_idx on public.planning_projects (sharepoint_list_id, sharepoint_item_id);
create unique index if not exists planning_projects_sharepoint_item_unique_idx
  on public.planning_projects (sharepoint_list_id, sharepoint_item_id)
  where sharepoint_list_id is not null and sharepoint_item_id is not null;

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
  ('list-smtr-journees-planning', 'Titre', 'Title', 'Text', 'planning_days', 'comments', false, 'Stored as comments when no richer title field is needed.'),
  ('list-smtr-journees-planning', 'Date debarque', 'DateDebarque', 'DateTime', 'planning_days', 'disembark_on', false, null),
  ('list-smtr-journees-planning', 'Annee', 'Annee', 'Number', 'planning_days', 'year_number', false, null),
  ('list-smtr-journees-planning', 'Mois numero', 'MoisNo', 'Number', 'planning_days', 'month_number', false, null),
  ('list-smtr-journees-planning', 'Mois libelle', 'MoisLibelle', 'Text', 'planning_days', 'month_label', false, null),
  ('list-smtr-journees-planning', 'Jour numero', 'JourNo', 'Number', 'planning_days', 'day_number', false, null),
  ('list-smtr-journees-planning', 'Capitaine', 'NomCapitaine', 'Text', 'planning_days', 'captain_name', false, null),
  ('list-smtr-journees-planning', 'Navire', 'NomNavire', 'Text', 'planning_days', 'vessel_name', false, null),
  ('list-smtr-journees-planning', 'Navire manuel', 'NavireManuel', 'Text', 'planning_days', 'manual_vessel_name', false, null),
  ('list-smtr-journees-planning', 'Fonction', 'Fonction', 'Choice/Text', 'planning_days', 'function_label', false, null),
  ('list-smtr-journees-planning', 'Statut marin', 'StatutMarin', 'Choice/Text', 'planning_days', 'sailor_status', false, null),
  ('list-smtr-journees-planning', 'Statut jour', 'StatutJour', 'Choice/Text', 'planning_days', 'day_status', false, null),
  ('list-smtr-journees-planning', 'Rythme', 'Rythme', 'Choice/Text', 'planning_days', 'rhythm_label', false, null),
  ('list-smtr-journees-planning', 'Bordee', 'Bord_x00e9_e', 'Choice/Text', 'planning_days', 'watch_group', false, null),
  ('list-smtr-journees-planning', 'Date depart', 'DateDepart', 'DateTime', 'planning_days', 'departure_on', false, 'Aliases observed: datedepart, Datedepart.'),
  ('list-smtr-journees-planning', 'Heures travaillees', 'HeuresTravaillees', 'Number', 'planning_days', 'worked_hours', false, null),
  ('list-smtr-journees-planning', 'Repos 24h', 'Repos24h', 'Number/Boolean', 'planning_days', 'rest_24h', false, null),
  ('list-smtr-journees-planning', 'Cumul 7j', 'Cumul7j', 'Number', 'planning_days', 'cumulative_7d', false, null),
  ('list-smtr-journees-planning', 'Commentaires', 'Commentaires', 'Note/Text', 'planning_days', 'comments', false, null),
  ('list-smtr-planning-periodes', 'Titre', 'Title', 'Text', 'planning_periods', 'comments', false, 'Stored as comments when no richer title field is needed.'),
  ('list-smtr-planning-periodes', 'Navire', 'NomNavire', 'Text', 'planning_periods', 'vessel_name', false, null),
  ('list-smtr-planning-periodes', 'Navire manuel', 'NavireManuel', 'Text', 'planning_periods', 'manual_vessel_name', false, null),
  ('list-smtr-planning-periodes', 'Bordee', 'Bord_x00e9_e', 'Choice/Text', 'planning_periods', 'watch_group', false, null),
  ('list-smtr-planning-periodes', 'Fonction', 'Fonction', 'Choice/Text', 'planning_periods', 'function_label', false, null),
  ('list-smtr-planning-periodes', 'Statut marin', 'StatutMarin', 'Choice/Text', 'planning_periods', 'sailor_status', false, null),
  ('list-smtr-planning-periodes', 'Annee', 'Annee', 'Number', 'planning_periods', 'year_number', false, null),
  ('list-smtr-planning-periodes', 'Commentaires', 'Commentaires', 'Note/Text', 'planning_periods', 'comments', false, null),
  ('list-smtr-planning-periodes', 'Source Slot365 ID', 'Slot365SourceId', 'Text/Number', 'planning_periods', 'slot365_source_id', false, null),
  ('list-smtr-planning-periodes', 'Source Slot365 key', 'Slot365SourceKey', 'Text', 'planning_periods', 'slot365_source_key', false, null),
  ('list-kpi-projets-planning', 'Titre', 'Title', 'Text', 'planning_projects', 'title', true, null),
  ('list-kpi-projets-planning', 'Date debut', 'Dated_x00e9_but', 'DateTime', 'planning_projects', 'starts_on', false, null),
  ('list-kpi-projets-planning', 'Date fin', 'Datefin', 'DateTime', 'planning_projects', 'ends_on', false, null),
  ('list-kpi-projets-planning', 'Description', 'Description', 'Note/Text', 'planning_projects', 'description', false, null),
  ('list-kpi-projets-planning', 'Client', 'Client', 'Text', 'planning_projects', 'client_name', false, null),
  ('list-kpi-projets-planning', 'Navire 1', 'Navire', 'Text/Lookup', 'planning_projects', 'primary_vessel_name', false, null),
  ('list-kpi-projets-planning', 'Navire 2', 'Navire_x0020_2', 'Text/Lookup', 'planning_projects', 'secondary_vessel_name', false, null)
on conflict (source_key, internal_name, target_table, target_column) do update
set field_label = excluded.field_label,
    data_type = excluded.data_type,
    required = excluded.required,
    notes = excluded.notes,
    updated_at = now();

grant select on
  public.planning_days,
  public.planning_periods,
  public.planning_projects
to authenticated;

grant insert, update, delete on
  public.planning_days,
  public.planning_periods,
  public.planning_projects
to authenticated;

grant usage on
  public.planning_days_id_seq,
  public.planning_periods_id_seq,
  public.planning_projects_id_seq
to authenticated;

alter table public.planning_days enable row level security;
alter table public.planning_periods enable row level security;
alter table public.planning_projects enable row level security;

drop policy if exists planning_days_role_read on public.planning_days;
create policy planning_days_role_read on public.planning_days
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']));

drop policy if exists planning_days_office_write on public.planning_days;
create policy planning_days_office_write on public.planning_days
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));

drop policy if exists planning_periods_role_read on public.planning_periods;
create policy planning_periods_role_read on public.planning_periods
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine', 'marin']));

drop policy if exists planning_periods_office_write on public.planning_periods;
create policy planning_periods_office_write on public.planning_periods
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));

drop policy if exists planning_projects_role_read on public.planning_projects;
create policy planning_projects_role_read on public.planning_projects
  for select to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement', 'capitaine']));

drop policy if exists planning_projects_office_write on public.planning_projects;
create policy planning_projects_office_write on public.planning_projects
  for all to authenticated
  using (public.has_any_role(array['admin', 'direction', 'armement']))
  with check (public.has_any_role(array['admin', 'direction', 'armement']));
