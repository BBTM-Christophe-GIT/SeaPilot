-- Planning P1.2: absence workflow, conflict treatment and manual replacement support.
-- P0 assignments and P1.1 manning matrices remain the operational sources of truth.
-- Dates are stored as timestamptz in UTC and displayed in the user's local timezone.
--
-- Data-preserving rollback strategy:
--   1. Export planning_absences, planning_conflict_cases and
--      planning_conflict_case_history.
--   2. Drop the P1.2 RPCs, triggers, policies and tables in dependency order.
--   3. Restore the P1.1 permission and planning_change_log constraints from
--      migration 202607130009.
-- No pre-existing Planning row is updated or deleted by this migration.

alter table public.planning_action_permissions
  drop constraint if exists planning_action_permissions_action_check;
alter table public.planning_action_permissions
  add constraint planning_action_permissions_action_check check (
    action_key in (
      'read', 'edit_event', 'submit', 'validate', 'publish', 'reopen', 'archive',
      'view_history', 'manage_handover', 'manage_derogation', 'manage_vessels',
      'manage_permissions', 'export', 'manage_rotation', 'manage_template', 'manage_manning',
      'request_absence', 'review_absence', 'manage_conflict'
    )
  );

alter table public.planning_vessel_permissions
  drop constraint if exists planning_vessel_permissions_action_check;
alter table public.planning_vessel_permissions
  add constraint planning_vessel_permissions_action_check check (
    action_key in (
      'read', 'edit_event', 'submit', 'validate', 'publish', 'reopen', 'view_history',
      'manage_handover', 'manage_derogation', 'export', 'manage_rotation', 'manage_template',
      'manage_manning', 'manage_conflict'
    )
  );

insert into public.planning_action_permissions (role_key, action_key, scope_mode)
values
  ('admin', 'request_absence', 'company'),
  ('admin', 'review_absence', 'company'),
  ('admin', 'manage_conflict', 'company'),
  ('direction', 'request_absence', 'company'),
  ('direction', 'review_absence', 'company'),
  ('direction', 'manage_conflict', 'company'),
  ('armement', 'request_absence', 'company'),
  ('armement', 'review_absence', 'company'),
  ('armement', 'manage_conflict', 'company'),
  ('capitaine', 'request_absence', 'own'),
  ('capitaine', 'manage_conflict', 'assigned_vessel'),
  ('marin', 'request_absence', 'own')
on conflict (role_key, action_key) do update set scope_mode = excluded.scope_mode;

alter table public.planning_change_log drop constraint if exists planning_change_log_entity_kind_check;
alter table public.planning_change_log add constraint planning_change_log_entity_kind_check
  check (entity_kind in (
    'assignment', 'day', 'period', 'project', 'vessel', 'publication', 'handover',
    'handover_position', 'derogation', 'rotation_series', 'rotation_occurrence',
    'template', 'manning_matrix', 'absence', 'conflict_case'
  ));

create table if not exists public.planning_absences (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  person_id bigint not null references public.people(id) on delete restrict,
  absence_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null,
  status text not null default 'requested',
  requested_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint planning_absences_type_check check (absence_type in (
    'leave', 'illness', 'training', 'medical_visit', 'unavailability', 'recovery'
  )),
  constraint planning_absences_period_check check (ends_at > starts_at),
  constraint planning_absences_reason_check check (length(trim(reason)) between 3 and 1000),
  constraint planning_absences_status_check check (status in ('requested', 'approved', 'rejected', 'cancelled')),
  constraint planning_absences_review_check check (
    (status = 'requested' and reviewed_by is null and reviewed_at is null)
    or (status <> 'requested' and reviewed_by is not null and reviewed_at is not null)
  )
);

create table if not exists public.planning_conflict_cases (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  conflict_key text not null,
  conflict_type text not null,
  severity text not null,
  title text not null,
  description text not null,
  person_id bigint references public.people(id) on delete set null,
  vessel_id bigint references public.vessels(id) on delete set null,
  assignment_id bigint references public.planning_assignments(id) on delete set null,
  project_id bigint references public.planning_projects(id) on delete set null,
  handover_id bigint references public.planning_handovers(id) on delete set null,
  absence_id bigint references public.planning_absences(id) on delete set null,
  starts_on date not null,
  ends_on date not null,
  owner_id uuid references public.profiles(id) on delete set null,
  owner_name text,
  priority text not null default 'normal',
  status text not null default 'open',
  last_comment text,
  derogation_id bigint references public.planning_derogations(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint planning_conflict_cases_key_check check (length(trim(conflict_key)) between 3 and 240),
  constraint planning_conflict_cases_key_company unique (company_id, conflict_key),
  constraint planning_conflict_cases_type_check check (conflict_type in (
    'double_assignment', 'absence', 'unavailability', 'vacant_position',
    'invalid_certificate', 'missing_qualification', 'insufficient_staffing',
    'maintenance_incompatible', 'incomplete_handover'
  )),
  constraint planning_conflict_cases_severity_check check (severity in ('information', 'warning', 'blocking')),
  constraint planning_conflict_cases_title_check check (length(trim(title)) between 2 and 180),
  constraint planning_conflict_cases_description_check check (length(trim(description)) between 3 and 2000),
  constraint planning_conflict_cases_dates_check check (ends_on >= starts_on),
  constraint planning_conflict_cases_priority_check check (priority in ('low', 'normal', 'high', 'critical')),
  constraint planning_conflict_cases_status_check check (status in ('open', 'in_progress', 'resolved', 'dismissed', 'derogated')),
  constraint planning_conflict_cases_derogation_check check (status <> 'derogated' or derogation_id is not null),
  constraint planning_conflict_cases_resolution_check check (
    (status in ('resolved', 'dismissed', 'derogated') and resolved_at is not null)
    or (status in ('open', 'in_progress') and resolved_at is null)
  )
);

create table if not exists public.planning_conflict_case_history (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  case_id bigint not null references public.planning_conflict_cases(id) on delete cascade,
  action text not null,
  comment text,
  payload jsonb not null default '{}'::jsonb,
  changed_by uuid references public.profiles(id) on delete set null default auth.uid(),
  changed_by_name text not null default '',
  changed_at timestamptz not null default now(),
  constraint planning_conflict_case_history_action_check check (action in (
    'detected', 'assigned', 'priority_changed', 'status_changed', 'commented',
    'derogation_linked', 'updated'
  )),
  constraint planning_conflict_case_history_payload_check check (jsonb_typeof(payload) = 'object')
);

create index if not exists planning_absences_company_period_idx
  on public.planning_absences (company_id, starts_at, ends_at) where status in ('requested', 'approved');
create index if not exists planning_absences_person_period_idx
  on public.planning_absences (company_id, person_id, starts_at, ends_at) where status in ('requested', 'approved');
create index if not exists planning_absences_person_fkey_idx on public.planning_absences (person_id);
create index if not exists planning_absences_requested_by_idx on public.planning_absences (requested_by);
create index if not exists planning_absences_reviewed_by_idx on public.planning_absences (reviewed_by);
create index if not exists planning_absences_updated_by_idx on public.planning_absences (updated_by);
create index if not exists planning_conflict_cases_company_status_idx
  on public.planning_conflict_cases (company_id, status, priority, last_seen_at desc);
create index if not exists planning_conflict_cases_vessel_dates_idx
  on public.planning_conflict_cases (company_id, vessel_id, starts_on, ends_on);
create index if not exists planning_conflict_cases_person_dates_idx
  on public.planning_conflict_cases (company_id, person_id, starts_on, ends_on);
create index if not exists planning_conflict_cases_person_fkey_idx on public.planning_conflict_cases (person_id);
create index if not exists planning_conflict_cases_vessel_fkey_idx on public.planning_conflict_cases (vessel_id);
create index if not exists planning_conflict_cases_assignment_fkey_idx on public.planning_conflict_cases (assignment_id);
create index if not exists planning_conflict_cases_project_fkey_idx on public.planning_conflict_cases (project_id);
create index if not exists planning_conflict_cases_handover_fkey_idx on public.planning_conflict_cases (handover_id);
create index if not exists planning_conflict_cases_absence_fkey_idx on public.planning_conflict_cases (absence_id);
create index if not exists planning_conflict_cases_owner_fkey_idx on public.planning_conflict_cases (owner_id);
create index if not exists planning_conflict_cases_derogation_fkey_idx on public.planning_conflict_cases (derogation_id);
create index if not exists planning_conflict_cases_updated_by_idx on public.planning_conflict_cases (updated_by);
create index if not exists planning_conflict_case_history_case_idx
  on public.planning_conflict_case_history (case_id, changed_at desc);
create index if not exists planning_conflict_case_history_company_idx
  on public.planning_conflict_case_history (company_id, changed_at desc);
create index if not exists planning_conflict_case_history_changed_by_idx on public.planning_conflict_case_history (changed_by);

alter table public.planning_absences enable row level security;
alter table public.planning_conflict_cases enable row level security;
alter table public.planning_conflict_case_history enable row level security;

drop policy if exists planning_absences_read on public.planning_absences;
create policy planning_absences_read on public.planning_absences for select to authenticated
  using (
    (select public.planning_can_read_row(
      company_id, null, person_id,
      (starts_at at time zone 'Europe/Paris')::date,
      (ends_at at time zone 'Europe/Paris')::date
    ))
    or exists (
      select 1 from public.planning_assignments assignment
      where assignment.company_id = planning_absences.company_id
        and assignment.crew_person_id = planning_absences.person_id
        and assignment.confirmation_status <> 'cancelled'
        and assignment.starts_at < planning_absences.ends_at
        and assignment.ends_at > planning_absences.starts_at
        and (select public.planning_user_can(
          'read', assignment.company_id, assignment.vessel_id,
          assignment.starts_on, assignment.ends_on
        ))
    )
  );

drop policy if exists planning_conflict_cases_read on public.planning_conflict_cases;
create policy planning_conflict_cases_read on public.planning_conflict_cases for select to authenticated
  using ((select public.planning_can_read_row(company_id, vessel_id, person_id, starts_on, ends_on)));

drop policy if exists planning_conflict_case_history_read on public.planning_conflict_case_history;
create policy planning_conflict_case_history_read on public.planning_conflict_case_history for select to authenticated
  using (exists (
    select 1 from public.planning_conflict_cases conflict_case
    where conflict_case.id = case_id
      and (select public.planning_can_read_row(
        conflict_case.company_id, conflict_case.vessel_id, conflict_case.person_id,
        conflict_case.starts_on, conflict_case.ends_on
      ))
  ));

grant select on public.planning_absences, public.planning_conflict_cases,
  public.planning_conflict_case_history to authenticated;
revoke insert, update, delete on public.planning_absences, public.planning_conflict_cases,
  public.planning_conflict_case_history from authenticated;

create or replace function public.assert_planning_p12_reference_company()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  parent_company_id bigint;
begin
  if tg_table_name = 'planning_absences' then
    if not exists (select 1 from public.people where id = new.person_id and company_id = new.company_id) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: absence.';
    end if;
  elsif tg_table_name = 'planning_conflict_cases' then
    if (new.person_id is not null and not exists (select 1 from public.people where id = new.person_id and company_id = new.company_id))
      or (new.vessel_id is not null and not exists (select 1 from public.vessels where id = new.vessel_id and company_id = new.company_id))
      or (new.assignment_id is not null and not exists (select 1 from public.planning_assignments where id = new.assignment_id and company_id = new.company_id))
      or (new.project_id is not null and not exists (select 1 from public.planning_projects where id = new.project_id and company_id = new.company_id))
      or (new.handover_id is not null and not exists (select 1 from public.planning_handovers where id = new.handover_id and company_id = new.company_id))
      or (new.absence_id is not null and not exists (select 1 from public.planning_absences where id = new.absence_id and company_id = new.company_id))
      or (new.derogation_id is not null and not exists (select 1 from public.planning_derogations where id = new.derogation_id and company_id = new.company_id)) then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: conflit.';
    end if;
  elsif tg_table_name = 'planning_conflict_case_history' then
    select company_id into parent_company_id from public.planning_conflict_cases where id = new.case_id;
    if parent_company_id is distinct from new.company_id then
      raise exception using errcode = '23514', message = 'PLANNING_COMPANY_MISMATCH: historique de conflit.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.assert_planning_p12_reference_company() from public, anon, authenticated;

drop trigger if exists planning_absences_company_guard on public.planning_absences;
create trigger planning_absences_company_guard before insert or update on public.planning_absences
  for each row execute function public.assert_planning_p12_reference_company();
drop trigger if exists planning_conflict_cases_company_guard on public.planning_conflict_cases;
create trigger planning_conflict_cases_company_guard before insert or update on public.planning_conflict_cases
  for each row execute function public.assert_planning_p12_reference_company();
drop trigger if exists planning_conflict_case_history_company_guard on public.planning_conflict_case_history;
create trigger planning_conflict_case_history_company_guard before insert or update on public.planning_conflict_case_history
  for each row execute function public.assert_planning_p12_reference_company();

create or replace function public.audit_planning_p12_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  before_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  target_row jsonb := coalesce(after_row, before_row);
  target_kind text := case tg_table_name when 'planning_absences' then 'absence' else 'conflict_case' end;
  target_action text;
  target_starts_on date;
  target_ends_on date;
  history_action text;
  actor_name text := public.planning_current_actor_name();
begin
  if tg_op = 'INSERT' then
    target_action := 'create';
  elsif before_row->>'status' is distinct from after_row->>'status' then
    target_action := 'status_change';
  else
    target_action := 'update';
  end if;

  if tg_table_name = 'planning_absences' then
    target_starts_on := ((target_row->>'starts_at')::timestamptz at time zone 'Europe/Paris')::date;
    target_ends_on := ((target_row->>'ends_at')::timestamptz at time zone 'Europe/Paris')::date;
  else
    target_starts_on := (target_row->>'starts_on')::date;
    target_ends_on := (target_row->>'ends_on')::date;
  end if;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
    vessel_id, starts_on, ends_on, summary
  ) values (
    (target_row->>'company_id')::bigint, target_kind, (target_row->>'id')::bigint, target_action,
    jsonb_build_object('before', before_row, 'after', after_row),
    (select auth.uid()), actor_name, nullif(target_row->>'vessel_id', '')::bigint,
    target_starts_on, target_ends_on,
    case
      when target_kind = 'absence' and target_action = 'status_change' then 'Statut de la demande d’absence modifié'
      when target_kind = 'absence' then 'Demande d’absence mise à jour'
      when target_action = 'status_change' then 'Traitement du conflit mis à jour'
      else 'Dossier de conflit mis à jour'
    end
  );

  if tg_table_name = 'planning_conflict_cases' then
    history_action := case
      when tg_op = 'INSERT' then 'detected'
      when before_row->>'derogation_id' is distinct from after_row->>'derogation_id' then 'derogation_linked'
      when before_row->>'status' is distinct from after_row->>'status' then 'status_changed'
      when before_row->>'owner_id' is distinct from after_row->>'owner_id' then 'assigned'
      when before_row->>'priority' is distinct from after_row->>'priority' then 'priority_changed'
      when before_row->>'last_comment' is distinct from after_row->>'last_comment' then 'commented'
      else 'updated'
    end;
    insert into public.planning_conflict_case_history (
      company_id, case_id, action, comment, payload, changed_by, changed_by_name
    ) values (
      (target_row->>'company_id')::bigint, (target_row->>'id')::bigint, history_action,
      nullif(target_row->>'last_comment', ''),
      jsonb_build_object('before', before_row, 'after', after_row),
      (select auth.uid()), actor_name
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_planning_p12_mutation() from public, anon, authenticated;

drop trigger if exists planning_absences_audit on public.planning_absences;
create trigger planning_absences_audit after insert or update on public.planning_absences
  for each row execute function public.audit_planning_p12_mutation();
drop trigger if exists planning_conflict_cases_audit on public.planning_conflict_cases;
create trigger planning_conflict_cases_audit after insert or update on public.planning_conflict_cases
  for each row execute function public.audit_planning_p12_mutation();

create or replace function public.enforce_planning_p12_absence_blockers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  conflicting_absence public.planning_absences%rowtype;
  target_rule_code text;
  target_day date := (new.starts_at at time zone 'Europe/Paris')::date;
begin
  if new.confirmation_status = 'cancelled' then return new; end if;

  select absence.* into conflicting_absence
  from public.planning_absences absence
  where absence.company_id = new.company_id
    and absence.person_id = new.crew_person_id
    and absence.status = 'approved'
    and absence.starts_at < new.ends_at
    and absence.ends_at > new.starts_at
  order by absence.starts_at
  limit 1;

  if conflicting_absence.id is null then return new; end if;
  target_rule_code := case when conflicting_absence.absence_type = 'unavailability'
    then 'crew_unavailability' else 'crew_absence' end;

  if public.planning_rule_is_blocking(target_rule_code, target_day)
    and not public.planning_has_active_derogation(
      target_rule_code, new.crew_person_id, new.vessel_id, new.starts_at, new.ends_at
    ) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CONTROL_BLOCKED: ' || target_rule_code;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_planning_p12_absence_blockers() from public, anon, authenticated;
drop trigger if exists planning_assignments_p12_absence_guard on public.planning_assignments;
create trigger planning_assignments_p12_absence_guard
  before insert or update on public.planning_assignments
  for each row execute function public.enforce_planning_p12_absence_blockers();

create or replace function public.save_planning_absence(
  p_absence_id bigint,
  p_person_id bigint,
  p_absence_type text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint;
  target_id bigint;
  existing_absence public.planning_absences%rowtype;
  can_manage_company boolean;
begin
  select company_id into target_company_id from public.people where id = p_person_id;
  can_manage_company := target_company_id is not null
    and public.planning_user_can('request_absence', target_company_id, null, null, null);
  if target_company_id is null
    or not public.user_belongs_to_company(target_company_id)
    or (not can_manage_company and p_person_id is distinct from public.current_person_id()) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: demande d absence.';
  end if;
  if p_absence_type not in ('leave', 'illness', 'training', 'medical_visit', 'unavailability', 'recovery')
    or p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at
    or length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception using errcode = '22023', message = 'PLANNING_ABSENCE_INVALID: type, dates et motif obligatoires.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':absence:' || p_person_id::text, 0));

  if p_absence_id is not null then
    select * into existing_absence from public.planning_absences where id = p_absence_id for update;
    if existing_absence.id is null or existing_absence.company_id is distinct from target_company_id
      or existing_absence.person_id is distinct from p_person_id or existing_absence.status <> 'requested'
      or (not can_manage_company and existing_absence.requested_by is distinct from (select auth.uid())) then
      raise exception using errcode = '42501', message = 'PLANNING_ABSENCE_NOT_EDITABLE';
    end if;
  end if;

  if exists (
    select 1 from public.planning_absences absence
    where absence.company_id = target_company_id and absence.person_id = p_person_id
      and absence.status in ('requested', 'approved')
      and (p_absence_id is null or absence.id <> p_absence_id)
      and absence.starts_at < p_ends_at and absence.ends_at > p_starts_at
  ) then
    raise exception using errcode = '23P01', message = 'PLANNING_ABSENCE_OVERLAP';
  end if;

  if p_absence_id is null then
    insert into public.planning_absences (
      company_id, person_id, absence_type, starts_at, ends_at, reason
    ) values (
      target_company_id, p_person_id, p_absence_type, p_starts_at, p_ends_at, trim(p_reason)
    ) returning id into target_id;
  else
    update public.planning_absences set
      absence_type = p_absence_type, starts_at = p_starts_at, ends_at = p_ends_at,
      reason = trim(p_reason), updated_by = (select auth.uid()), updated_at = now()
    where id = p_absence_id returning id into target_id;
  end if;
  return target_id;
end;
$$;

create or replace function public.review_planning_absence(
  p_absence_id bigint,
  p_action text,
  p_comment text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_absence public.planning_absences%rowtype;
  can_review boolean;
  target_status text;
begin
  select * into target_absence from public.planning_absences where id = p_absence_id for update;
  if target_absence.id is null then
    raise exception using errcode = 'P0002', message = 'PLANNING_ABSENCE_NOT_FOUND';
  end if;
  can_review := public.planning_user_can(
    'review_absence', target_absence.company_id, null,
    (target_absence.starts_at at time zone 'Europe/Paris')::date,
    (target_absence.ends_at at time zone 'Europe/Paris')::date
  );
  if p_action in ('approve', 'reject') and not can_review then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: validation d absence.';
  end if;
  if p_action = 'cancel' and not can_review and not (
    target_absence.status = 'requested' and target_absence.requested_by = (select auth.uid())
  ) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: annulation d absence.';
  end if;
  if p_action not in ('approve', 'reject', 'cancel')
    or (p_action in ('approve', 'reject') and target_absence.status <> 'requested')
    or (p_action = 'cancel' and target_absence.status not in ('requested', 'approved')) then
    raise exception using errcode = '22023', message = 'PLANNING_ABSENCE_TRANSITION_INVALID';
  end if;
  if p_action in ('reject', 'cancel') and length(trim(coalesce(p_comment, ''))) < 3 then
    raise exception using errcode = '22023', message = 'PLANNING_ABSENCE_COMMENT_REQUIRED';
  end if;

  target_status := case p_action when 'approve' then 'approved' when 'reject' then 'rejected' else 'cancelled' end;
  update public.planning_absences set
    status = target_status, reviewed_by = (select auth.uid()), reviewed_at = now(),
    review_comment = nullif(trim(coalesce(p_comment, '')), ''),
    updated_by = (select auth.uid()), updated_at = now()
  where id = p_absence_id;
  return p_absence_id;
end;
$$;

create or replace function public.ensure_planning_conflict_case(
  p_conflict_key text,
  p_conflict_type text,
  p_severity text,
  p_title text,
  p_description text,
  p_person_id bigint,
  p_vessel_id bigint,
  p_assignment_id bigint,
  p_project_id bigint,
  p_handover_id bigint,
  p_absence_id bigint,
  p_starts_on date,
  p_ends_on date
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
  if target_company_id is null or not public.planning_user_can(
    'manage_conflict', target_company_id, p_vessel_id, p_starts_on, p_ends_on
  ) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: dossier de conflit.';
  end if;
  if p_conflict_type not in (
      'double_assignment', 'absence', 'unavailability', 'vacant_position',
      'invalid_certificate', 'missing_qualification', 'insufficient_staffing',
      'maintenance_incompatible', 'incomplete_handover'
    ) or p_severity not in ('information', 'warning', 'blocking')
    or length(trim(coalesce(p_conflict_key, ''))) not between 3 and 240
    or length(trim(coalesce(p_title, ''))) not between 2 and 180
    or length(trim(coalesce(p_description, ''))) not between 3 and 2000
    or p_starts_on is null or p_ends_on < p_starts_on then
    raise exception using errcode = '22023', message = 'PLANNING_CONFLICT_INVALID';
  end if;

  insert into public.planning_conflict_cases (
    company_id, conflict_key, conflict_type, severity, title, description,
    person_id, vessel_id, assignment_id, project_id, handover_id, absence_id,
    starts_on, ends_on
  ) values (
    target_company_id, trim(p_conflict_key), p_conflict_type, p_severity, trim(p_title), trim(p_description),
    p_person_id, p_vessel_id, p_assignment_id, p_project_id, p_handover_id, p_absence_id,
    p_starts_on, p_ends_on
  )
  on conflict (company_id, conflict_key) do update set
    conflict_type = excluded.conflict_type, severity = excluded.severity,
    title = excluded.title, description = excluded.description,
    person_id = excluded.person_id, vessel_id = excluded.vessel_id,
    assignment_id = excluded.assignment_id, project_id = excluded.project_id,
    handover_id = excluded.handover_id, absence_id = excluded.absence_id,
    starts_on = excluded.starts_on, ends_on = excluded.ends_on,
    last_seen_at = now(), updated_by = (select auth.uid()), updated_at = now()
  returning id into target_id;
  return target_id;
end;
$$;

create or replace function public.update_planning_conflict_case(
  p_case_id bigint,
  p_assign_to_me boolean,
  p_priority text,
  p_status text,
  p_comment text,
  p_derogation_id bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_case public.planning_conflict_cases%rowtype;
  actor_name text := public.planning_current_actor_name();
begin
  select * into target_case from public.planning_conflict_cases where id = p_case_id for update;
  if target_case.id is null then
    raise exception using errcode = 'P0002', message = 'PLANNING_CONFLICT_NOT_FOUND';
  end if;
  if not public.planning_user_can(
    'manage_conflict', target_case.company_id, target_case.vessel_id,
    target_case.starts_on, target_case.ends_on
  ) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: traitement du conflit.';
  end if;
  if p_priority not in ('low', 'normal', 'high', 'critical')
    or p_status not in ('open', 'in_progress', 'resolved', 'dismissed', 'derogated') then
    raise exception using errcode = '22023', message = 'PLANNING_CONFLICT_TREATMENT_INVALID';
  end if;
  if p_status in ('resolved', 'dismissed', 'derogated') and length(trim(coalesce(p_comment, ''))) < 3 then
    raise exception using errcode = '22023', message = 'PLANNING_CONFLICT_COMMENT_REQUIRED';
  end if;
  if p_status = 'derogated' and (
    p_derogation_id is null or not exists (
      select 1 from public.planning_derogations derogation
      where derogation.id = p_derogation_id and derogation.company_id = target_case.company_id
        and derogation.status = 'active'
    )
  ) then
    raise exception using errcode = '22023', message = 'PLANNING_CONFLICT_DEROGATION_REQUIRED';
  end if;

  update public.planning_conflict_cases set
    owner_id = case when p_assign_to_me then (select auth.uid()) else owner_id end,
    owner_name = case when p_assign_to_me then actor_name else owner_name end,
    priority = p_priority, status = p_status,
    last_comment = nullif(trim(coalesce(p_comment, '')), ''),
    derogation_id = case when p_status = 'derogated' then p_derogation_id else null end,
    resolved_at = case when p_status in ('resolved', 'dismissed', 'derogated') then now() else null end,
    last_seen_at = now(), updated_by = (select auth.uid()), updated_at = now()
  where id = p_case_id;
  return p_case_id;
end;
$$;

revoke all on function public.save_planning_absence(bigint, bigint, text, timestamptz, timestamptz, text) from public, anon;
revoke all on function public.review_planning_absence(bigint, text, text) from public, anon;
revoke all on function public.ensure_planning_conflict_case(text, text, text, text, text, bigint, bigint, bigint, bigint, bigint, bigint, date, date) from public, anon;
revoke all on function public.update_planning_conflict_case(bigint, boolean, text, text, text, bigint) from public, anon;
grant execute on function public.save_planning_absence(bigint, bigint, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.review_planning_absence(bigint, text, text) to authenticated;
grant execute on function public.ensure_planning_conflict_case(text, text, text, text, text, bigint, bigint, bigint, bigint, bigint, bigint, date, date) to authenticated;
grant execute on function public.update_planning_conflict_case(bigint, boolean, text, text, text, bigint) to authenticated;

comment on table public.planning_absences is
  'P1.2 UTC absence requests with explicit review workflow; approved rows block future overlapping assignments.';
comment on table public.planning_conflict_cases is
  'P1.2 persistent treatment state linked to deterministic conflicts detected from operational Planning data.';
comment on table public.planning_conflict_case_history is
  'Append-only audit trail for conflict ownership, priority, comments, resolution and derogation.';
comment on function public.save_planning_absence(bigint, bigint, text, timestamptz, timestamptz, text) is
  'Creates or edits a requested absence with tenant, ownership, range and overlap validation.';
comment on function public.review_planning_absence(bigint, text, text) is
  'Approves, rejects or cancels an absence with server-side transition authorization.';
comment on function public.ensure_planning_conflict_case(text, text, text, text, text, bigint, bigint, bigint, bigint, bigint, bigint, date, date) is
  'Persists treatment metadata for a deterministic conflict without changing the underlying planning item.';
