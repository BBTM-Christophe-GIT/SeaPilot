-- Planning P1.1: rotations, reusable templates and vessel manning matrices.
-- Existing P0 assignments, projects, handovers and governance remain the source of truth.
--
-- Data-preserving rollback strategy:
--   1. Export the five P1.1 tables and keep planning_assignments rows whose
--      source_label = 'seapilot_rotation' if their operational history must remain visible.
--   2. Drop P1.1 RPCs, triggers, policies and tables in dependency order.
--   3. Restore the P0.4 action/entity constraints from migration 202607130007.
-- No existing row is updated or deleted by this migration.

alter table public.planning_action_permissions
  drop constraint if exists planning_action_permissions_action_check;
alter table public.planning_action_permissions
  add constraint planning_action_permissions_action_check check (
    action_key in (
      'read', 'edit_event', 'submit', 'validate', 'publish', 'reopen', 'archive',
      'view_history', 'manage_handover', 'manage_derogation', 'manage_vessels',
      'manage_permissions', 'export', 'manage_rotation', 'manage_template', 'manage_manning'
    )
  );

alter table public.planning_vessel_permissions
  drop constraint if exists planning_vessel_permissions_action_check;
alter table public.planning_vessel_permissions
  add constraint planning_vessel_permissions_action_check check (
    action_key in (
      'read', 'edit_event', 'submit', 'validate', 'publish', 'reopen', 'view_history',
      'manage_handover', 'manage_derogation', 'export', 'manage_rotation', 'manage_template',
      'manage_manning'
    )
  );

insert into public.planning_action_permissions (role_key, action_key, scope_mode)
values
  ('admin', 'manage_rotation', 'company'),
  ('admin', 'manage_template', 'company'),
  ('admin', 'manage_manning', 'company'),
  ('direction', 'manage_rotation', 'company'),
  ('direction', 'manage_template', 'company'),
  ('direction', 'manage_manning', 'company'),
  ('armement', 'manage_rotation', 'company'),
  ('armement', 'manage_template', 'company'),
  ('armement', 'manage_manning', 'company')
on conflict (role_key, action_key) do update set scope_mode = excluded.scope_mode;

alter table public.planning_change_log drop constraint if exists planning_change_log_entity_kind_check;
alter table public.planning_change_log add constraint planning_change_log_entity_kind_check
  check (entity_kind in (
    'assignment', 'day', 'period', 'project', 'vessel', 'publication', 'handover',
    'handover_position', 'derogation', 'rotation_series', 'rotation_occurrence',
    'template', 'manning_matrix'
  ));

create table if not exists public.planning_rotation_series (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  vessel_id bigint not null references public.vessels(id) on delete restrict,
  crew_person_id bigint not null references public.people(id) on delete restrict,
  captain_person_id bigint references public.people(id) on delete set null,
  name text not null,
  pattern_key text not null,
  starts_on date not null,
  onboard_days integer not null,
  rest_days integer not null,
  occurrence_count integer not null,
  assignment_role text not null,
  watch_group text,
  handover_minutes integer not null default 0,
  confirmation_status text not null default 'provisional',
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_rotation_series_name_check check (length(trim(name)) between 2 and 120),
  constraint planning_rotation_series_pattern_check check (pattern_key in ('7_7', '10_10', '14_14', 'custom')),
  constraint planning_rotation_series_onboard_check check (onboard_days between 1 and 90),
  constraint planning_rotation_series_rest_check check (rest_days between 1 and 90),
  constraint planning_rotation_series_occurrences_check check (occurrence_count between 1 and 104),
  constraint planning_rotation_series_role_check check (length(trim(assignment_role)) > 0),
  constraint planning_rotation_series_handover_check check (handover_minutes between 0 and 1440),
  constraint planning_rotation_series_confirmation_check check (confirmation_status in ('provisional', 'confirmed'))
);

create table if not exists public.planning_rotation_occurrences (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  series_id bigint not null references public.planning_rotation_series(id) on delete cascade,
  assignment_id bigint not null references public.planning_assignments(id) on delete restrict,
  occurrence_number integer not null,
  starts_on date not null,
  ends_on date not null,
  rest_starts_on date not null,
  rest_ends_on date not null,
  handover_at timestamptz not null,
  is_override boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_rotation_occurrences_number_check check (occurrence_number > 0),
  constraint planning_rotation_occurrences_dates_check check (
    ends_on >= starts_on and rest_starts_on = ends_on + 1 and rest_ends_on >= rest_starts_on
  ),
  constraint planning_rotation_occurrences_series_number_key unique (series_id, occurrence_number),
  constraint planning_rotation_occurrences_assignment_key unique (assignment_id)
);

create table if not exists public.planning_templates (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  vessel_id bigint references public.vessels(id) on delete set null,
  name text not null,
  template_kind text not null,
  description text,
  default_duration_days integer not null default 1,
  default_status text not null default 'draft',
  configuration jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_templates_name_check check (length(trim(name)) between 2 and 120),
  constraint planning_templates_kind_check check (template_kind in (
    'handover', 'maritime_campaign', 'safety_vessel', 'transit', 'maintenance',
    'provisioning', 'bunkering', 'training', 'safety_drill'
  )),
  constraint planning_templates_duration_check check (default_duration_days between 1 and 366),
  constraint planning_templates_status_check check (default_status in ('draft', 'planned', 'confirmed')),
  constraint planning_templates_configuration_check check (jsonb_typeof(configuration) = 'object')
);

create table if not exists public.planning_manning_matrices (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  vessel_id bigint not null references public.vessels(id) on delete restrict,
  name text not null,
  effective_from date not null,
  effective_to date,
  status text not null default 'draft',
  notes text,
  version integer not null default 1,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_manning_matrices_name_check check (length(trim(name)) between 2 and 120),
  constraint planning_manning_matrices_dates_check check (effective_to is null or effective_to >= effective_from),
  constraint planning_manning_matrices_status_check check (status in ('draft', 'active', 'archived')),
  constraint planning_manning_matrices_version_check check (version > 0)
);

create table if not exists public.planning_manning_requirements (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  matrix_id bigint not null references public.planning_manning_matrices(id) on delete cascade,
  function_label text not null,
  minimum_count integer not null,
  target_count integer not null,
  required_certificates text[] not null default '{}',
  required_qualifications text[] not null default '{}',
  required_authorizations text[] not null default '{}',
  required_trainings text[] not null default '{}',
  restrictions text[] not null default '{}',
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_manning_requirements_function_check check (length(trim(function_label)) > 0),
  constraint planning_manning_requirements_counts_check check (
    minimum_count >= 0 and target_count >= minimum_count and target_count <= 100
  ),
  constraint planning_manning_requirements_function_key unique (matrix_id, function_label)
);

create index if not exists planning_rotation_series_company_vessel_idx
  on public.planning_rotation_series (company_id, vessel_id, starts_on) where active;
create index if not exists planning_rotation_series_crew_idx
  on public.planning_rotation_series (company_id, crew_person_id, starts_on) where active;
create index if not exists planning_rotation_series_vessel_fkey_idx on public.planning_rotation_series (vessel_id);
create index if not exists planning_rotation_series_crew_fkey_idx on public.planning_rotation_series (crew_person_id);
create index if not exists planning_rotation_series_captain_fkey_idx on public.planning_rotation_series (captain_person_id);
create index if not exists planning_rotation_occurrences_company_dates_idx
  on public.planning_rotation_occurrences (company_id, starts_on, ends_on);
create index if not exists planning_rotation_occurrences_series_idx on public.planning_rotation_occurrences (series_id);
create index if not exists planning_templates_company_kind_idx
  on public.planning_templates (company_id, template_kind, name) where active;
create index if not exists planning_templates_vessel_fkey_idx on public.planning_templates (vessel_id);
create index if not exists planning_manning_matrices_company_vessel_idx
  on public.planning_manning_matrices (company_id, vessel_id, effective_from desc);
create unique index if not exists planning_manning_matrices_one_active_idx
  on public.planning_manning_matrices (company_id, vessel_id) where status = 'active';
create index if not exists planning_manning_matrices_vessel_fkey_idx on public.planning_manning_matrices (vessel_id);
create index if not exists planning_manning_requirements_matrix_idx on public.planning_manning_requirements (matrix_id, display_order);
create unique index if not exists planning_manning_requirements_function_normalized_idx
  on public.planning_manning_requirements (matrix_id, lower(trim(function_label)));

alter table public.planning_rotation_series enable row level security;
alter table public.planning_rotation_occurrences enable row level security;
alter table public.planning_templates enable row level security;
alter table public.planning_manning_matrices enable row level security;
alter table public.planning_manning_requirements enable row level security;

drop policy if exists planning_rotation_series_read on public.planning_rotation_series;
create policy planning_rotation_series_read on public.planning_rotation_series for select to authenticated
  using ((select public.planning_can_read_row(company_id, vessel_id, crew_person_id, starts_on, starts_on + ((onboard_days + rest_days) * occurrence_count))));
drop policy if exists planning_rotation_occurrences_read on public.planning_rotation_occurrences;
create policy planning_rotation_occurrences_read on public.planning_rotation_occurrences for select to authenticated
  using (exists (
    select 1 from public.planning_rotation_series series
    where series.id = series_id
      and (select public.planning_can_read_row(series.company_id, series.vessel_id, series.crew_person_id, starts_on, ends_on))
  ));
drop policy if exists planning_templates_read on public.planning_templates;
create policy planning_templates_read on public.planning_templates for select to authenticated
  using ((select public.planning_user_can('read', company_id, vessel_id, null, null)));
drop policy if exists planning_manning_matrices_read on public.planning_manning_matrices;
create policy planning_manning_matrices_read on public.planning_manning_matrices for select to authenticated
  using ((select public.planning_user_can('read', company_id, vessel_id, effective_from, coalesce(effective_to, effective_from))));
drop policy if exists planning_manning_requirements_read on public.planning_manning_requirements;
create policy planning_manning_requirements_read on public.planning_manning_requirements for select to authenticated
  using (exists (
    select 1 from public.planning_manning_matrices matrix
    where matrix.id = matrix_id
      and (select public.planning_user_can('read', matrix.company_id, matrix.vessel_id, matrix.effective_from, coalesce(matrix.effective_to, matrix.effective_from)))
  ));

grant select on public.planning_rotation_series, public.planning_rotation_occurrences,
  public.planning_templates, public.planning_manning_matrices, public.planning_manning_requirements to authenticated;
revoke insert, update, delete on public.planning_rotation_series, public.planning_rotation_occurrences,
  public.planning_templates, public.planning_manning_matrices, public.planning_manning_requirements from authenticated;

create or replace function public.assert_planning_p11_reference_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_company_id bigint;
begin
  if tg_table_name = 'planning_rotation_series' then
    if not exists (select 1 from public.vessels where id = new.vessel_id and company_id = new.company_id)
      or not exists (select 1 from public.people where id = new.crew_person_id and company_id = new.company_id)
      or (new.captain_person_id is not null and not exists (select 1 from public.people where id = new.captain_person_id and company_id = new.company_id)) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: rotation.';
    end if;
  elsif tg_table_name = 'planning_rotation_occurrences' then
    select company_id into parent_company_id from public.planning_rotation_series where id = new.series_id;
    if parent_company_id is distinct from new.company_id
      or not exists (select 1 from public.planning_assignments where id = new.assignment_id and company_id = new.company_id) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: occurrence.';
    end if;
  elsif tg_table_name = 'planning_templates' then
    if new.vessel_id is not null and not exists (select 1 from public.vessels where id = new.vessel_id and company_id = new.company_id) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: modele.';
    end if;
  elsif tg_table_name = 'planning_manning_matrices' then
    if not exists (select 1 from public.vessels where id = new.vessel_id and company_id = new.company_id) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: matrice.';
    end if;
  elsif tg_table_name = 'planning_manning_requirements' then
    select company_id into parent_company_id from public.planning_manning_matrices where id = new.matrix_id;
    if parent_company_id is distinct from new.company_id then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: exigence.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.assert_planning_p11_reference_company() from public, anon, authenticated;

drop trigger if exists planning_rotation_series_company_guard on public.planning_rotation_series;
create trigger planning_rotation_series_company_guard before insert or update on public.planning_rotation_series
  for each row execute function public.assert_planning_p11_reference_company();
drop trigger if exists planning_rotation_occurrences_company_guard on public.planning_rotation_occurrences;
create trigger planning_rotation_occurrences_company_guard before insert or update on public.planning_rotation_occurrences
  for each row execute function public.assert_planning_p11_reference_company();
drop trigger if exists planning_templates_company_guard on public.planning_templates;
create trigger planning_templates_company_guard before insert or update on public.planning_templates
  for each row execute function public.assert_planning_p11_reference_company();
drop trigger if exists planning_manning_matrices_company_guard on public.planning_manning_matrices;
create trigger planning_manning_matrices_company_guard before insert or update on public.planning_manning_matrices
  for each row execute function public.assert_planning_p11_reference_company();
drop trigger if exists planning_manning_requirements_company_guard on public.planning_manning_requirements;
create trigger planning_manning_requirements_company_guard before insert or update on public.planning_manning_requirements
  for each row execute function public.assert_planning_p11_reference_company();

create or replace function public.audit_planning_p11_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_row jsonb := coalesce(after_row, before_row);
  target_kind text;
  target_company_id bigint;
  target_vessel_id bigint;
  target_starts_on date;
  target_ends_on date;
  target_action text := case when tg_op = 'INSERT' then 'create' when tg_op = 'DELETE' then 'delete' else 'update' end;
begin
  target_kind := case tg_table_name
    when 'planning_rotation_series' then 'rotation_series'
    when 'planning_rotation_occurrences' then 'rotation_occurrence'
    when 'planning_templates' then 'template'
    when 'planning_manning_matrices' then 'manning_matrix'
  end;
  target_company_id := (target_row->>'company_id')::bigint;

  if tg_table_name = 'planning_rotation_occurrences' then
    select vessel_id into target_vessel_id from public.planning_rotation_series where id = (target_row->>'series_id')::bigint;
    target_starts_on := (target_row->>'starts_on')::date;
    target_ends_on := (target_row->>'ends_on')::date;
    if tg_op = 'UPDATE' and (before_row->>'starts_on' is distinct from after_row->>'starts_on'
      or before_row->>'ends_on' is distinct from after_row->>'ends_on') then target_action := 'move'; end if;
  else
    target_vessel_id := nullif(target_row->>'vessel_id', '')::bigint;
    target_starts_on := nullif(coalesce(target_row->>'starts_on', target_row->>'effective_from'), '')::date;
    target_ends_on := coalesce(nullif(target_row->>'effective_to', '')::date, target_starts_on);
  end if;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
    vessel_id, starts_on, ends_on, summary
  ) values (
    target_company_id, target_kind, (target_row->>'id')::bigint, target_action,
    jsonb_build_object('before', before_row, 'after', after_row), (select auth.uid()),
    public.planning_current_actor_name(), target_vessel_id, target_starts_on, target_ends_on,
    case target_kind
      when 'rotation_series' then 'Serie de rotation mise a jour'
      when 'rotation_occurrence' then 'Occurrence de rotation mise a jour'
      when 'template' then 'Modele de planning mis a jour'
      else 'Matrice d armement mise a jour'
    end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.audit_planning_p11_mutation() from public, anon, authenticated;

drop trigger if exists planning_rotation_series_audit on public.planning_rotation_series;
create trigger planning_rotation_series_audit after insert or update or delete on public.planning_rotation_series
  for each row execute function public.audit_planning_p11_mutation();
drop trigger if exists planning_rotation_occurrences_audit on public.planning_rotation_occurrences;
create trigger planning_rotation_occurrences_audit after update or delete on public.planning_rotation_occurrences
  for each row execute function public.audit_planning_p11_mutation();
drop trigger if exists planning_templates_audit on public.planning_templates;
create trigger planning_templates_audit after insert or update or delete on public.planning_templates
  for each row execute function public.audit_planning_p11_mutation();
drop trigger if exists planning_manning_matrices_audit on public.planning_manning_matrices;
create trigger planning_manning_matrices_audit after insert or update or delete on public.planning_manning_matrices
  for each row execute function public.audit_planning_p11_mutation();

create or replace function public.save_planning_rotation_series(
  p_vessel_id bigint,
  p_crew_person_id bigint,
  p_captain_person_id bigint,
  p_name text,
  p_pattern_key text,
  p_starts_on date,
  p_onboard_days integer,
  p_rest_days integer,
  p_occurrence_count integer,
  p_assignment_role text,
  p_watch_group text,
  p_handover_minutes integer,
  p_confirmation_status text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint;
  target_series_id bigint;
  target_assignment_id bigint;
  occurrence_start date;
  occurrence_end date;
begin
  select company_id into target_company_id from public.vessels where id = p_vessel_id;
  if target_company_id is null
    or not exists (select 1 from public.people where id = p_crew_person_id and company_id = target_company_id)
    or (p_captain_person_id is not null and not exists (select 1 from public.people where id = p_captain_person_id and company_id = target_company_id)) then
    raise exception using errcode = '23514', message = 'PLANNING_REFERENCE_INVALID: navire ou marin.';
  end if;
  if not public.planning_user_can('manage_rotation', target_company_id, p_vessel_id, p_starts_on,
    p_starts_on + ((p_onboard_days + p_rest_days) * p_occurrence_count)) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: rotation.';
  end if;
  if p_pattern_key not in ('7_7', '10_10', '14_14', 'custom')
    or p_onboard_days not between 1 and 90 or p_rest_days not between 1 and 90
    or p_occurrence_count not between 1 and 104
    or p_handover_minutes not between 0 and 1440
    or p_confirmation_status not in ('provisional', 'confirmed')
    or length(trim(coalesce(p_name, ''))) < 2 or length(trim(coalesce(p_assignment_role, ''))) = 0 then
    raise exception using errcode = '22023', message = 'PLANNING_ROTATION_INVALID: champs obligatoires ou rythme invalide.';
  end if;
  if (p_pattern_key = '7_7' and (p_onboard_days <> 7 or p_rest_days <> 7))
    or (p_pattern_key = '10_10' and (p_onboard_days <> 10 or p_rest_days <> 10))
    or (p_pattern_key = '14_14' and (p_onboard_days <> 14 or p_rest_days <> 14)) then
    raise exception using errcode = '22023', message = 'PLANNING_ROTATION_PATTERN_MISMATCH';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':rotation:' || p_crew_person_id::text, 0));

  insert into public.planning_rotation_series (
    company_id, vessel_id, crew_person_id, captain_person_id, name, pattern_key, starts_on,
    onboard_days, rest_days, occurrence_count, assignment_role, watch_group,
    handover_minutes, confirmation_status
  ) values (
    target_company_id, p_vessel_id, p_crew_person_id, p_captain_person_id, trim(p_name), p_pattern_key,
    p_starts_on, p_onboard_days, p_rest_days, p_occurrence_count, trim(p_assignment_role),
    nullif(trim(coalesce(p_watch_group, '')), ''), p_handover_minutes, p_confirmation_status
  ) returning id into target_series_id;

  for occurrence_number in 1..p_occurrence_count loop
    occurrence_start := p_starts_on + ((occurrence_number - 1) * (p_onboard_days + p_rest_days));
    occurrence_end := occurrence_start + (p_onboard_days - 1);
    if exists (
      select 1 from public.planning_assignments assignment
      where assignment.company_id = target_company_id
        and assignment.crew_person_id = p_crew_person_id
        and assignment.confirmation_status <> 'cancelled'
        and assignment.starts_on <= occurrence_end and assignment.ends_on >= occurrence_start
    ) then
      raise exception using errcode = '23P01', message = format(
        'PLANNING_ROTATION_OVERLAP: marin deja affecte du %s au %s.', occurrence_start, occurrence_end
      );
    end if;

    insert into public.planning_assignments (
      company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on, starts_at, ends_at,
      assignment_role, status_label, confirmation_status, watch_group, comments, source_label
    ) values (
      target_company_id, p_vessel_id, p_captain_person_id, p_crew_person_id, occurrence_start, occurrence_end,
      (occurrence_start + time '08:00') at time zone 'Europe/Paris',
      (occurrence_end + time '20:00') at time zone 'Europe/Paris',
      trim(p_assignment_role), 'Embarque', p_confirmation_status,
      nullif(trim(coalesce(p_watch_group, '')), ''), 'Rotation ' || trim(p_name), 'seapilot_rotation'
    ) returning id into target_assignment_id;

    insert into public.planning_rotation_occurrences (
      company_id, series_id, assignment_id, occurrence_number, starts_on, ends_on,
      rest_starts_on, rest_ends_on, handover_at
    ) values (
      target_company_id, target_series_id, target_assignment_id, occurrence_number,
      occurrence_start, occurrence_end, occurrence_end + 1, occurrence_end + p_rest_days,
      (occurrence_start + time '08:00') at time zone 'Europe/Paris'
    );
  end loop;
  return target_series_id;
end;
$$;

create or replace function public.update_planning_rotation_occurrence(
  p_occurrence_id bigint,
  p_scope text,
  p_starts_on date,
  p_ends_on date,
  p_vessel_id bigint,
  p_assignment_role text,
  p_watch_group text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  selected_occurrence public.planning_rotation_occurrences%rowtype;
  target_series public.planning_rotation_series%rowtype;
  candidate record;
  target_ids bigint[];
  target_company_id bigint;
  day_delta integer;
  duration_days integer;
  next_start date;
  next_end date;
  previous_end date;
  changed_count integer := 0;
begin
  select * into selected_occurrence from public.planning_rotation_occurrences where id = p_occurrence_id;
  if selected_occurrence.id is null then raise exception using errcode = 'P0002', message = 'PLANNING_ROTATION_OCCURRENCE_NOT_FOUND'; end if;
  select * into target_series from public.planning_rotation_series where id = selected_occurrence.series_id;
  select company_id into target_company_id from public.vessels where id = p_vessel_id;
  if p_scope not in ('occurrence', 'following', 'series') or p_ends_on < p_starts_on
    or length(trim(coalesce(p_assignment_role, ''))) = 0 then
    raise exception using errcode = '22023', message = 'PLANNING_ROTATION_UPDATE_INVALID';
  end if;
  if target_company_id is distinct from target_series.company_id then
    raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: navire cible.';
  end if;
  if not public.planning_user_can('manage_rotation', target_series.company_id, target_series.vessel_id,
    selected_occurrence.starts_on, selected_occurrence.ends_on)
    or not public.planning_user_can('manage_rotation', target_series.company_id, p_vessel_id, p_starts_on, p_ends_on) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: rotation.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_series.company_id::text || ':rotation:' || target_series.crew_person_id::text, 0));
  day_delta := p_starts_on - selected_occurrence.starts_on;
  duration_days := p_ends_on - p_starts_on;

  select array_agg(occurrence.assignment_id) into target_ids
  from public.planning_rotation_occurrences occurrence
  where occurrence.series_id = target_series.id and (
    p_scope = 'series' or occurrence.id = p_occurrence_id
    or (p_scope = 'following' and occurrence.occurrence_number >= selected_occurrence.occurrence_number)
  );

  for candidate in
    select occurrence.* from public.planning_rotation_occurrences occurrence
    where occurrence.series_id = target_series.id and (
      p_scope = 'series' or occurrence.id = p_occurrence_id
      or (p_scope = 'following' and occurrence.occurrence_number >= selected_occurrence.occurrence_number)
    ) order by occurrence.occurrence_number
  loop
    next_start := candidate.starts_on + day_delta;
    next_end := next_start + duration_days;
    if previous_end is not null and next_start <= previous_end then
      raise exception using errcode = '23P01', message = format(
        'PLANNING_ROTATION_INTERNAL_OVERLAP: occurrence precedente jusqu au %s.', previous_end
      );
    end if;
    if exists (
      select 1 from public.planning_assignments assignment
      where assignment.company_id = target_series.company_id
        and assignment.crew_person_id = target_series.crew_person_id
        and assignment.confirmation_status <> 'cancelled'
        and not (assignment.id = any(target_ids))
        and assignment.starts_on <= next_end and assignment.ends_on >= next_start
    ) then
      raise exception using errcode = '23P01', message = format(
        'PLANNING_ROTATION_OVERLAP: marin deja affecte du %s au %s.', next_start, next_end
      );
    end if;

    update public.planning_assignments set
      vessel_id = p_vessel_id, starts_on = next_start, ends_on = next_end,
      starts_at = (next_start + time '08:00') at time zone 'Europe/Paris',
      ends_at = (next_end + time '20:00') at time zone 'Europe/Paris',
      assignment_role = trim(p_assignment_role), watch_group = nullif(trim(coalesce(p_watch_group, '')), ''),
      updated_at = now()
    where id = candidate.assignment_id;

    update public.planning_rotation_occurrences set
      starts_on = next_start, ends_on = next_end, rest_starts_on = next_end + 1,
      rest_ends_on = next_end + target_series.rest_days,
      handover_at = (next_start + time '08:00') at time zone 'Europe/Paris',
      is_override = p_scope <> 'series', updated_at = now()
    where id = candidate.id;
    previous_end := next_end;
    changed_count := changed_count + 1;
  end loop;

  if p_scope = 'series' then
    update public.planning_rotation_series set
      vessel_id = p_vessel_id,
      starts_on = (select min(starts_on) from public.planning_rotation_occurrences where series_id = target_series.id),
      onboard_days = duration_days + 1,
      pattern_key = case
        when duration_days + 1 = 7 and rest_days = 7 then '7_7'
        when duration_days + 1 = 10 and rest_days = 10 then '10_10'
        when duration_days + 1 = 14 and rest_days = 14 then '14_14'
        else 'custom'
      end,
      assignment_role = trim(p_assignment_role), watch_group = nullif(trim(coalesce(p_watch_group, '')), ''),
      updated_by = (select auth.uid()), updated_at = now()
    where id = target_series.id;
  else
    update public.planning_rotation_series set updated_by = (select auth.uid()), updated_at = now()
    where id = target_series.id;
  end if;
  return changed_count;
end;
$$;

create or replace function public.save_planning_template(
  p_template_id bigint,
  p_vessel_id bigint,
  p_name text,
  p_template_kind text,
  p_description text,
  p_default_duration_days integer,
  p_default_status text,
  p_configuration jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  target_id bigint;
begin
  if p_vessel_id is not null then select company_id into target_company_id from public.vessels where id = p_vessel_id; end if;
  if target_company_id is null or not public.planning_user_can('manage_template', target_company_id, p_vessel_id, null, null) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: modele.';
  end if;
  if p_template_kind not in ('handover', 'maritime_campaign', 'safety_vessel', 'transit', 'maintenance', 'provisioning', 'bunkering', 'training', 'safety_drill')
    or p_default_duration_days not between 1 and 366 or p_default_status not in ('draft', 'planned', 'confirmed')
    or length(trim(coalesce(p_name, ''))) < 2 or jsonb_typeof(coalesce(p_configuration, '{}'::jsonb)) <> 'object' then
    raise exception using errcode = '22023', message = 'PLANNING_TEMPLATE_INVALID';
  end if;
  if p_template_id is null then
    insert into public.planning_templates (
      company_id, vessel_id, name, template_kind, description, default_duration_days, default_status, configuration
    ) values (
      target_company_id, p_vessel_id, trim(p_name), p_template_kind, nullif(trim(coalesce(p_description, '')), ''),
      p_default_duration_days, p_default_status, coalesce(p_configuration, '{}'::jsonb)
    ) returning id into target_id;
  else
    if not exists (select 1 from public.planning_templates where id = p_template_id and company_id = target_company_id) then
      raise exception using errcode = 'P0002', message = 'PLANNING_TEMPLATE_NOT_FOUND';
    end if;
    update public.planning_templates set
      vessel_id = p_vessel_id, name = trim(p_name), template_kind = p_template_kind,
      description = nullif(trim(coalesce(p_description, '')), ''), default_duration_days = p_default_duration_days,
      default_status = p_default_status, configuration = coalesce(p_configuration, '{}'::jsonb),
      updated_by = (select auth.uid()), updated_at = now()
    where id = p_template_id returning id into target_id;
  end if;
  return target_id;
end;
$$;

create or replace function public.apply_planning_template(
  p_template_id bigint,
  p_vessel_id bigint,
  p_starts_on date,
  p_title text,
  p_responsible_person_id bigint,
  p_location text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_template public.planning_templates%rowtype;
  target_company_id bigint;
  target_id bigint;
  target_event_type text;
  target_end date;
  target_handover_minutes integer;
begin
  select * into target_template from public.planning_templates where id = p_template_id and active;
  if target_template.id is null then raise exception using errcode = 'P0002', message = 'PLANNING_TEMPLATE_NOT_FOUND'; end if;
  select company_id into target_company_id from public.vessels where id = p_vessel_id;
  target_end := p_starts_on + target_template.default_duration_days - 1;
  if target_company_id is distinct from target_template.company_id
    or not public.planning_user_can('manage_template', target_company_id, p_vessel_id, p_starts_on, target_end) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: application du modele.';
  end if;
  if length(trim(coalesce(p_title, ''))) < 2 then raise exception using errcode = '22023', message = 'PLANNING_TEMPLATE_TITLE_REQUIRED'; end if;

  if target_template.template_kind = 'handover' then
    if not public.planning_user_can('manage_handover', target_company_id, p_vessel_id, p_starts_on, p_starts_on) then
      raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: releve depuis un modele.';
    end if;
    if length(trim(coalesce(p_location, ''))) = 0
      or not exists (select 1 from public.people where id = p_responsible_person_id and company_id = target_company_id) then
      raise exception using errcode = '22023', message = 'PLANNING_TEMPLATE_HANDOVER_FIELDS_REQUIRED';
    end if;
    target_handover_minutes := case
      when coalesce(target_template.configuration->>'handoverMinutes', '') ~ '^\d{1,4}$'
        then (target_template.configuration->>'handoverMinutes')::integer
      else 60
    end;
    if target_handover_minutes not between 0 and 1440 then
      raise exception using errcode = '22023', message = 'PLANNING_TEMPLATE_HANDOVER_DURATION_INVALID';
    end if;
    insert into public.planning_handovers (
      company_id, vessel_id, handover_at, location, handover_duration_minutes,
      responsible_person_id, comments, status
    ) values (
      target_company_id, p_vessel_id, (p_starts_on + time '08:00') at time zone 'Europe/Paris',
      trim(p_location), target_handover_minutes,
      p_responsible_person_id, coalesce(target_template.description, trim(p_title)), target_template.default_status
    ) returning id into target_id;
    return jsonb_build_object('entityKind', 'handover', 'entityId', target_id);
  end if;

  target_event_type := case target_template.template_kind
    when 'transit' then 'transit' when 'maintenance' then 'maintenance' else 'operation' end;
  insert into public.planning_projects (
    company_id, title, starts_on, ends_on, description, primary_vessel_id, primary_vessel_name,
    event_type, responsible_name, status, source_label
  ) select
    target_company_id, trim(p_title), p_starts_on, target_end, target_template.description,
    vessel.id, vessel.name, target_event_type,
    nullif(trim(coalesce(target_template.configuration->>'responsibleName', '')), ''),
    target_template.default_status, 'seapilot_template'
  from public.vessels vessel where vessel.id = p_vessel_id
  returning id into target_id;
  return jsonb_build_object('entityKind', 'project', 'entityId', target_id);
end;
$$;

create or replace function public.save_planning_manning_matrix(
  p_matrix_id bigint,
  p_vessel_id bigint,
  p_name text,
  p_effective_from date,
  p_effective_to date,
  p_status text,
  p_notes text,
  p_requirements jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint;
  target_id bigint;
  target_version integer := 1;
  requirement jsonb;
begin
  select company_id into target_company_id from public.vessels where id = p_vessel_id;
  if target_company_id is null or not public.planning_user_can('manage_manning', target_company_id, p_vessel_id, p_effective_from, p_effective_to) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: matrice.';
  end if;
  if length(trim(coalesce(p_name, ''))) < 2 or p_status not in ('draft', 'active', 'archived')
    or (p_effective_to is not null and p_effective_to < p_effective_from)
    or jsonb_typeof(coalesce(p_requirements, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_requirements, '[]'::jsonb)) = 0 then
    raise exception using errcode = '22023', message = 'PLANNING_MANNING_MATRIX_INVALID';
  end if;
  for requirement in select * from jsonb_array_elements(p_requirements) loop
    if length(trim(coalesce(requirement->>'functionLabel', ''))) = 0
      or coalesce((requirement->>'minimumCount')::integer, -1) < 0
      or coalesce((requirement->>'targetCount')::integer, -1) < coalesce((requirement->>'minimumCount')::integer, 0) then
      raise exception using errcode = '22023', message = 'PLANNING_MANNING_REQUIREMENT_INVALID';
    end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':manning:' || p_vessel_id::text, 0));
  if p_status = 'active' then
    update public.planning_manning_matrices set status = 'archived', updated_by = (select auth.uid()), updated_at = now()
    where company_id = target_company_id and vessel_id = p_vessel_id and status = 'active'
      and (p_matrix_id is null or id <> p_matrix_id);
  end if;

  if p_matrix_id is null then
    insert into public.planning_manning_matrices (
      company_id, vessel_id, name, effective_from, effective_to, status, notes
    ) values (
      target_company_id, p_vessel_id, trim(p_name), p_effective_from, p_effective_to, p_status,
      nullif(trim(coalesce(p_notes, '')), '')
    ) returning id into target_id;
  else
    select version + 1 into target_version from public.planning_manning_matrices
    where id = p_matrix_id and company_id = target_company_id;
    if target_version is null then raise exception using errcode = 'P0002', message = 'PLANNING_MANNING_MATRIX_NOT_FOUND'; end if;
    update public.planning_manning_matrices set
      vessel_id = p_vessel_id, name = trim(p_name), effective_from = p_effective_from,
      effective_to = p_effective_to, status = p_status, notes = nullif(trim(coalesce(p_notes, '')), ''),
      version = target_version, updated_by = (select auth.uid()), updated_at = now()
    where id = p_matrix_id returning id into target_id;
    delete from public.planning_manning_requirements where matrix_id = target_id;
  end if;

  insert into public.planning_manning_requirements (
    company_id, matrix_id, function_label, minimum_count, target_count,
    required_certificates, required_qualifications, required_authorizations,
    required_trainings, restrictions, display_order
  )
  select
    target_company_id, target_id, trim(item->>'functionLabel'), (item->>'minimumCount')::integer,
    (item->>'targetCount')::integer,
    array(select jsonb_array_elements_text(coalesce(item->'requiredCertificates', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(item->'requiredQualifications', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(item->'requiredAuthorizations', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(item->'requiredTrainings', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(item->'restrictions', '[]'::jsonb))),
    ordinal - 1
  from jsonb_array_elements(p_requirements) with ordinality as requirement_rows(item, ordinal);
  return target_id;
end;
$$;

revoke all on function public.save_planning_rotation_series(bigint, bigint, bigint, text, text, date, integer, integer, integer, text, text, integer, text) from public, anon;
revoke all on function public.update_planning_rotation_occurrence(bigint, text, date, date, bigint, text, text) from public, anon;
revoke all on function public.save_planning_template(bigint, bigint, text, text, text, integer, text, jsonb) from public, anon;
revoke all on function public.apply_planning_template(bigint, bigint, date, text, bigint, text) from public, anon;
revoke all on function public.save_planning_manning_matrix(bigint, bigint, text, date, date, text, text, jsonb) from public, anon;
grant execute on function public.save_planning_rotation_series(bigint, bigint, bigint, text, text, date, integer, integer, integer, text, text, integer, text) to authenticated;
grant execute on function public.update_planning_rotation_occurrence(bigint, text, date, date, bigint, text, text) to authenticated;
grant execute on function public.save_planning_template(bigint, bigint, text, text, text, integer, text, jsonb) to authenticated;
grant execute on function public.apply_planning_template(bigint, bigint, date, text, bigint, text) to authenticated;
grant execute on function public.save_planning_manning_matrix(bigint, bigint, text, date, date, text, text, jsonb) to authenticated;

comment on table public.planning_rotation_series is 'P1.1 rotation definitions; generated operational periods remain native planning_assignments.';
comment on table public.planning_rotation_occurrences is 'P1.1 occurrence metadata linked one-to-one to generated planning_assignments.';
comment on table public.planning_templates is 'Reusable P1.1 planning templates; application creates native projects or handovers.';
comment on table public.planning_manning_matrices is 'Versioned vessel manning matrix headers.';
comment on table public.planning_manning_requirements is 'Functions, staffing targets and documentary requirements of a manning matrix.';
