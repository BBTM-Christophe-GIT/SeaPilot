-- Planning P1.3: configurable work/rest controls, in-app notifications and dependencies.
-- Existing Planning rows are preserved. No regulatory threshold is seeded or hard-coded.
--
-- Data-preserving rollback strategy:
--   1. Export the three P1.3 tables and the new planning_days metric columns.
--   2. Drop P1.3 triggers/RPCs/policies, then the tables in dependency order.
--   3. Restore action, planning_rules scope and planning_change_log constraints from P1.2.
--   4. Drop the nullable planning_days columns only after their values have been exported.

alter table public.planning_action_permissions
  drop constraint if exists planning_action_permissions_action_check;
alter table public.planning_action_permissions
  add constraint planning_action_permissions_action_check check (
    action_key in (
      'read', 'edit_event', 'submit', 'validate', 'publish', 'reopen', 'archive',
      'view_history', 'manage_handover', 'manage_derogation', 'manage_vessels',
      'manage_permissions', 'export', 'manage_rotation', 'manage_template', 'manage_manning',
      'request_absence', 'review_absence', 'manage_conflict', 'manage_work_rest',
      'read_notifications', 'manage_dependency'
    )
  );

alter table public.planning_vessel_permissions
  drop constraint if exists planning_vessel_permissions_action_check;
alter table public.planning_vessel_permissions
  add constraint planning_vessel_permissions_action_check check (
    action_key in (
      'read', 'edit_event', 'submit', 'validate', 'publish', 'reopen', 'view_history',
      'manage_handover', 'manage_derogation', 'export', 'manage_rotation', 'manage_template',
      'manage_manning', 'manage_conflict', 'read_notifications', 'manage_dependency'
    )
  );

insert into public.planning_action_permissions (role_key, action_key, scope_mode)
values
  ('admin', 'manage_work_rest', 'company'),
  ('admin', 'read_notifications', 'company'),
  ('admin', 'manage_dependency', 'company'),
  ('direction', 'read_notifications', 'company'),
  ('direction', 'manage_dependency', 'company'),
  ('armement', 'read_notifications', 'company'),
  ('armement', 'manage_dependency', 'company'),
  ('capitaine', 'read_notifications', 'assigned_vessel'),
  ('capitaine', 'manage_dependency', 'assigned_vessel'),
  ('marin', 'read_notifications', 'own')
on conflict (role_key, action_key) do update set scope_mode = excluded.scope_mode;

alter table public.planning_change_log drop constraint if exists planning_change_log_entity_kind_check;
alter table public.planning_change_log add constraint planning_change_log_entity_kind_check
  check (entity_kind in (
    'assignment', 'day', 'period', 'project', 'vessel', 'publication', 'handover',
    'handover_position', 'derogation', 'rotation_series', 'rotation_occurrence',
    'template', 'manning_matrix', 'absence', 'conflict_case', 'work_rest_policy', 'dependency'
  ));

alter table public.planning_rules drop constraint if exists planning_rules_scope_check;
alter table public.planning_rules add constraint planning_rules_scope_check
  check (scope in ('assignment', 'document', 'availability', 'medical', 'work_rest'));

insert into public.planning_rules (
  company_id, code, name, description, scope, control_level, effective_from, source_reference
)
select company.id, rule.code, rule.name, rule.description, 'work_rest', 'warning', current_date,
       'Politique administrable SeaPilot P1.3 — aucun seuil réglementaire embarqué'
from public.companies company
cross join (values
  ('work_24h', 'Travail sur 24 heures', 'Compare le travail déclaré au seuil administré pour 24 heures.'),
  ('rest_24h', 'Repos sur 24 heures', 'Compare le repos déclaré au seuil administré pour 24 heures.'),
  ('work_7d', 'Travail sur 7 jours', 'Compare le cumul de travail au seuil administré pour 7 jours.'),
  ('rest_7d', 'Repos sur 7 jours', 'Compare le repos calculé au seuil administré pour 7 jours.'),
  ('consecutive_rest', 'Repos consécutif', 'Contrôle la plus longue période de repos consécutif déclarée.'),
  ('rest_periods', 'Périodes de repos', 'Contrôle le nombre de périodes de repos déclaré sur 24 heures.'),
  ('night_work', 'Travail de nuit', 'Contrôle le travail déclaré dans la fenêtre de nuit administrée.')
) as rule(code, name, description)
on conflict (company_id, code) do nothing;

alter table public.planning_days
  add column if not exists consecutive_rest_hours numeric(8, 2),
  add column if not exists rest_period_count integer,
  add column if not exists night_work_hours numeric(8, 2);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'planning_days_consecutive_rest_check' and conrelid = 'public.planning_days'::regclass) then
    alter table public.planning_days add constraint planning_days_consecutive_rest_check
      check (consecutive_rest_hours is null or consecutive_rest_hours between 0 and 24) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'planning_days_rest_period_count_check' and conrelid = 'public.planning_days'::regclass) then
    alter table public.planning_days add constraint planning_days_rest_period_count_check
      check (rest_period_count is null or rest_period_count between 0 and 24) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'planning_days_night_work_check' and conrelid = 'public.planning_days'::regclass) then
    alter table public.planning_days add constraint planning_days_night_work_check
      check (night_work_hours is null or night_work_hours between 0 and 24) not valid;
  end if;
end $$;
alter table public.planning_days validate constraint planning_days_consecutive_rest_check;
alter table public.planning_days validate constraint planning_days_rest_period_count_check;
alter table public.planning_days validate constraint planning_days_night_work_check;

create table if not exists public.planning_work_rest_policies (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade default public.current_planning_company_id(),
  name text not null,
  scope text not null,
  vessel_id bigint references public.vessels(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  max_work_24h numeric(6, 2) not null,
  min_rest_24h numeric(6, 2) not null,
  max_work_7d numeric(7, 2) not null,
  min_rest_7d numeric(7, 2) not null,
  min_consecutive_rest_hours numeric(6, 2) not null,
  max_rest_periods_24h integer not null,
  night_starts_at time not null,
  night_ends_at time not null,
  max_night_work_24h numeric(6, 2) not null,
  include_handover boolean not null default true,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint planning_work_rest_policy_name_check check (length(trim(name)) between 2 and 160),
  constraint planning_work_rest_policy_scope_check check (scope in ('company', 'vessel')),
  constraint planning_work_rest_policy_vessel_check check ((scope = 'company' and vessel_id is null) or (scope = 'vessel' and vessel_id is not null)),
  constraint planning_work_rest_policy_dates_check check (effective_to is null or effective_to >= effective_from),
  constraint planning_work_rest_policy_24h_check check (max_work_24h between 0 and 24 and min_rest_24h between 0 and 24),
  constraint planning_work_rest_policy_7d_check check (max_work_7d between 0 and 168 and min_rest_7d between 0 and 168),
  constraint planning_work_rest_policy_rest_check check (min_consecutive_rest_hours between 0 and 24 and max_rest_periods_24h between 1 and 24),
  constraint planning_work_rest_policy_night_check check (max_night_work_24h between 0 and 24)
);

create table if not exists public.planning_notifications (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null,
  severity text not null default 'information',
  title text not null,
  body text not null,
  entity_kind text not null,
  entity_id bigint,
  person_id bigint references public.people(id) on delete set null,
  vessel_id bigint references public.vessels(id) on delete set null,
  due_on date,
  fingerprint text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint planning_notifications_type_check check (notification_type in (
    'new_assignment', 'assignment_modified', 'publication', 'handover', 'absence',
    'critical_conflict', 'expiring_certificate', 'vacant_position'
  )),
  constraint planning_notifications_severity_check check (severity in ('information', 'warning', 'critical')),
  constraint planning_notifications_title_check check (length(trim(title)) between 2 and 180),
  constraint planning_notifications_body_check check (length(trim(body)) between 2 and 2000),
  constraint planning_notifications_fingerprint_check check (length(trim(fingerprint)) between 3 and 300),
  constraint planning_notifications_recipient_fingerprint_unique unique (company_id, recipient_user_id, fingerprint)
);

create table if not exists public.planning_dependencies (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade default public.current_planning_company_id(),
  dependency_type text not null,
  predecessor_kind text not null,
  predecessor_id bigint not null,
  successor_kind text not null,
  successor_id bigint not null,
  lag_minutes integer not null default 0,
  vessel_id bigint references public.vessels(id) on delete set null,
  person_id bigint references public.people(id) on delete set null,
  starts_on date not null,
  ends_on date not null,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  constraint planning_dependencies_type_check check (dependency_type in ('operation_sequence', 'maintenance_recommission', 'training_assignment', 'delivery_operation')),
  constraint planning_dependencies_predecessor_kind_check check (predecessor_kind in ('project', 'assignment', 'absence', 'handover')),
  constraint planning_dependencies_successor_kind_check check (successor_kind in ('project', 'assignment', 'absence', 'handover')),
  constraint planning_dependencies_self_check check (predecessor_kind <> successor_kind or predecessor_id <> successor_id),
  constraint planning_dependencies_lag_check check (lag_minutes between 0 and 525600),
  constraint planning_dependencies_dates_check check (ends_on >= starts_on),
  constraint planning_dependencies_edge_unique unique (company_id, predecessor_kind, predecessor_id, successor_kind, successor_id, dependency_type)
);

create index if not exists planning_work_rest_policies_company_dates_idx on public.planning_work_rest_policies (company_id, active, effective_from, effective_to);
create index if not exists planning_work_rest_policies_vessel_idx on public.planning_work_rest_policies (vessel_id) where vessel_id is not null;
create index if not exists planning_notifications_recipient_unread_idx on public.planning_notifications (recipient_user_id, created_at desc) where read_at is null;
create index if not exists planning_notifications_company_due_idx on public.planning_notifications (company_id, due_on, notification_type);
create index if not exists planning_notifications_person_idx on public.planning_notifications (person_id) where person_id is not null;
create index if not exists planning_notifications_vessel_idx on public.planning_notifications (vessel_id) where vessel_id is not null;
create index if not exists planning_dependencies_company_dates_idx on public.planning_dependencies (company_id, active, starts_on, ends_on);
create index if not exists planning_dependencies_vessel_idx on public.planning_dependencies (vessel_id) where vessel_id is not null;
create index if not exists planning_dependencies_person_idx on public.planning_dependencies (person_id) where person_id is not null;

alter table public.planning_work_rest_policies enable row level security;
alter table public.planning_notifications enable row level security;
alter table public.planning_dependencies enable row level security;

drop policy if exists planning_work_rest_policies_read on public.planning_work_rest_policies;
create policy planning_work_rest_policies_read on public.planning_work_rest_policies for select to authenticated
  using ((select public.user_belongs_to_company(company_id)));
drop policy if exists planning_notifications_read on public.planning_notifications;
create policy planning_notifications_read on public.planning_notifications for select to authenticated
  using (recipient_user_id = (select auth.uid()) and (select public.user_belongs_to_company(company_id)));
drop policy if exists planning_dependencies_read on public.planning_dependencies;
create policy planning_dependencies_read on public.planning_dependencies for select to authenticated
  using ((select public.planning_can_read_row(company_id, vessel_id, person_id, starts_on, ends_on)));

grant select on public.planning_work_rest_policies, public.planning_notifications, public.planning_dependencies to authenticated;
revoke insert, update, delete on public.planning_work_rest_policies, public.planning_notifications, public.planning_dependencies from authenticated;
grant usage on public.planning_work_rest_policies_id_seq, public.planning_notifications_id_seq, public.planning_dependencies_id_seq to authenticated;

create or replace function public.planning_p13_entity_metadata(p_kind text, p_id bigint)
returns table(company_id bigint, vessel_id bigint, person_id bigint, starts_on date, ends_on date, label text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_kind = 'project' then
    return query select project.company_id, project.primary_vessel_id, null::bigint,
      coalesce(project.starts_on, current_date), coalesce(project.ends_on, project.starts_on, current_date), project.title
    from public.planning_projects project where project.id = p_id;
  elsif p_kind = 'assignment' then
    return query select assignment.company_id, assignment.vessel_id, assignment.crew_person_id,
      assignment.starts_on, assignment.ends_on, assignment.assignment_role
    from public.planning_assignments assignment where assignment.id = p_id;
  elsif p_kind = 'absence' then
    return query select absence.company_id, null::bigint, absence.person_id,
      (absence.starts_at at time zone 'Europe/Paris')::date,
      ((absence.ends_at - interval '1 millisecond') at time zone 'Europe/Paris')::date,
      absence.absence_type
    from public.planning_absences absence where absence.id = p_id;
  elsif p_kind = 'handover' then
    return query select handover.company_id, handover.vessel_id, handover.responsible_person_id,
      (handover.handover_at at time zone 'Europe/Paris')::date,
      (handover.handover_at at time zone 'Europe/Paris')::date,
      handover.location
    from public.planning_handovers handover where handover.id = p_id;
  end if;
end;
$$;
revoke all on function public.planning_p13_entity_metadata(text, bigint) from public, anon, authenticated;

create or replace function public.save_planning_work_rest_policy(
  p_policy_id bigint,
  p_name text,
  p_scope text,
  p_vessel_id bigint,
  p_effective_from date,
  p_effective_to date,
  p_max_work_24h numeric,
  p_min_rest_24h numeric,
  p_max_work_7d numeric,
  p_min_rest_7d numeric,
  p_min_consecutive_rest_hours numeric,
  p_max_rest_periods_24h integer,
  p_night_starts_at time,
  p_night_ends_at time,
  p_max_night_work_24h numeric,
  p_include_handover boolean,
  p_active boolean,
  p_notes text
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
  if target_company_id is null or not public.planning_user_can('manage_work_rest', target_company_id, p_vessel_id, p_effective_from, p_effective_to) then
    raise exception using errcode = '42501', message = 'Vous ne pouvez pas administrer les seuils de travail et repos.';
  end if;
  if p_scope not in ('company', 'vessel') or (p_scope = 'company' and p_vessel_id is not null) or (p_scope = 'vessel' and p_vessel_id is null) then
    raise exception using errcode = '22023', message = 'La portée de la politique est invalide.';
  end if;
  if p_scope = 'vessel' and not exists (select 1 from public.vessels where id = p_vessel_id and company_id = target_company_id) then
    raise exception using errcode = '23503', message = 'Le navire ne fait pas partie de l’entreprise active.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(target_company_id::text || ':work-rest:' || p_scope || ':' || coalesce(p_vessel_id::text, 'company'), 0));
  if p_active and exists (
    select 1 from public.planning_work_rest_policies policy
    where policy.company_id = target_company_id and policy.active
      and policy.scope = p_scope and policy.vessel_id is not distinct from p_vessel_id
      and policy.id is distinct from p_policy_id
      and daterange(policy.effective_from, coalesce(policy.effective_to, 'infinity'::date), '[]')
          && daterange(p_effective_from, coalesce(p_effective_to, 'infinity'::date), '[]')
  ) then
    raise exception using errcode = '23P01', message = 'Une politique active couvre déjà cette portée et cette période.';
  end if;
  if p_policy_id is null then
    insert into public.planning_work_rest_policies (
      company_id, name, scope, vessel_id, effective_from, effective_to, max_work_24h,
      min_rest_24h, max_work_7d, min_rest_7d, min_consecutive_rest_hours,
      max_rest_periods_24h, night_starts_at, night_ends_at, max_night_work_24h,
      include_handover, active, notes
    ) values (
      target_company_id, trim(p_name), p_scope, p_vessel_id, p_effective_from, p_effective_to,
      p_max_work_24h, p_min_rest_24h, p_max_work_7d, p_min_rest_7d,
      p_min_consecutive_rest_hours, p_max_rest_periods_24h, p_night_starts_at,
      p_night_ends_at, p_max_night_work_24h, p_include_handover, p_active,
      nullif(trim(coalesce(p_notes, '')), '')
    ) returning id into target_id;
  else
    update public.planning_work_rest_policies set
      name = trim(p_name), scope = p_scope, vessel_id = p_vessel_id,
      effective_from = p_effective_from, effective_to = p_effective_to,
      max_work_24h = p_max_work_24h, min_rest_24h = p_min_rest_24h,
      max_work_7d = p_max_work_7d, min_rest_7d = p_min_rest_7d,
      min_consecutive_rest_hours = p_min_consecutive_rest_hours,
      max_rest_periods_24h = p_max_rest_periods_24h,
      night_starts_at = p_night_starts_at, night_ends_at = p_night_ends_at,
      max_night_work_24h = p_max_night_work_24h, include_handover = p_include_handover,
      active = p_active, notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now(), updated_by = auth.uid()
    where id = p_policy_id and company_id = target_company_id returning id into target_id;
    if target_id is null then raise exception using errcode = 'P0002', message = 'Politique introuvable.'; end if;
  end if;
  insert into public.planning_change_log (company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name, vessel_id, starts_on, ends_on, summary)
  values (target_company_id, 'work_rest_policy', target_id, case when p_policy_id is null then 'create' else 'update' end,
    jsonb_build_object('name', trim(p_name), 'scope', p_scope, 'active', p_active), auth.uid(), public.planning_current_actor_name(),
    p_vessel_id, p_effective_from, coalesce(p_effective_to, p_effective_from), 'Politique de travail et repos enregistrée');
  return target_id;
end;
$$;

create or replace function public.save_planning_dependency(
  p_dependency_id bigint,
  p_dependency_type text,
  p_predecessor_kind text,
  p_predecessor_id bigint,
  p_successor_kind text,
  p_successor_id bigint,
  p_lag_minutes integer,
  p_notes text,
  p_active boolean
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  source_metadata record;
  target_metadata record;
  target_id bigint;
begin
  select * into source_metadata from public.planning_p13_entity_metadata(p_predecessor_kind, p_predecessor_id);
  select * into target_metadata from public.planning_p13_entity_metadata(p_successor_kind, p_successor_id);
  if source_metadata.company_id is null or target_metadata.company_id is null then
    raise exception using errcode = '23503', message = 'Un élément de la dépendance est introuvable.';
  end if;
  if source_metadata.company_id <> target_metadata.company_id or source_metadata.company_id <> public.current_planning_company_id() then
    raise exception using errcode = '42501', message = 'Les éléments doivent appartenir à l’entreprise active.';
  end if;
  if not public.planning_user_can('manage_dependency', source_metadata.company_id, coalesce(target_metadata.vessel_id, source_metadata.vessel_id), least(source_metadata.starts_on, target_metadata.starts_on), greatest(source_metadata.ends_on, target_metadata.ends_on)) then
    raise exception using errcode = '42501', message = 'Vous ne pouvez pas gérer cette dépendance.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(source_metadata.company_id::text || ':dependency', 0));
  if p_dependency_id is null then
    insert into public.planning_dependencies (
      company_id, dependency_type, predecessor_kind, predecessor_id, successor_kind,
      successor_id, lag_minutes, vessel_id, person_id, starts_on, ends_on, notes, active
    ) values (
      source_metadata.company_id, p_dependency_type, p_predecessor_kind, p_predecessor_id,
      p_successor_kind, p_successor_id, p_lag_minutes,
      coalesce(target_metadata.vessel_id, source_metadata.vessel_id),
      coalesce(target_metadata.person_id, source_metadata.person_id),
      least(source_metadata.starts_on, target_metadata.starts_on),
      greatest(source_metadata.ends_on, target_metadata.ends_on),
      nullif(trim(coalesce(p_notes, '')), ''), p_active
    ) returning id into target_id;
  else
    update public.planning_dependencies set
      dependency_type = p_dependency_type, predecessor_kind = p_predecessor_kind,
      predecessor_id = p_predecessor_id, successor_kind = p_successor_kind,
      successor_id = p_successor_id, lag_minutes = p_lag_minutes,
      vessel_id = coalesce(target_metadata.vessel_id, source_metadata.vessel_id),
      person_id = coalesce(target_metadata.person_id, source_metadata.person_id),
      starts_on = least(source_metadata.starts_on, target_metadata.starts_on),
      ends_on = greatest(source_metadata.ends_on, target_metadata.ends_on),
      notes = nullif(trim(coalesce(p_notes, '')), ''), active = p_active,
      updated_at = now(), updated_by = auth.uid()
    where id = p_dependency_id and company_id = source_metadata.company_id returning id into target_id;
    if target_id is null then raise exception using errcode = 'P0002', message = 'Dépendance introuvable.'; end if;
  end if;
  if p_active and exists (
    with recursive path(kind, entity_id) as (
      select p_successor_kind, p_successor_id
      union
      select dependency.successor_kind, dependency.successor_id
      from public.planning_dependencies dependency
      join path on dependency.predecessor_kind = path.kind and dependency.predecessor_id = path.entity_id
      where dependency.company_id = source_metadata.company_id and dependency.active
    ) select 1 from path where kind = p_predecessor_kind and entity_id = p_predecessor_id
  ) then
    raise exception using errcode = '23P01', message = 'Cette dépendance créerait un cycle.';
  end if;
  insert into public.planning_change_log (company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name, vessel_id, starts_on, ends_on, summary)
  values (source_metadata.company_id, 'dependency', target_id, case when p_dependency_id is null then 'create' else 'update' end,
    jsonb_build_object('type', p_dependency_type, 'source', p_predecessor_kind || ':' || p_predecessor_id, 'target', p_successor_kind || ':' || p_successor_id),
    auth.uid(), public.planning_current_actor_name(), coalesce(target_metadata.vessel_id, source_metadata.vessel_id),
    least(source_metadata.starts_on, target_metadata.starts_on), greatest(source_metadata.ends_on, target_metadata.ends_on), 'Dépendance Planning enregistrée');
  return target_id;
end;
$$;

create or replace function public.delete_planning_dependency(p_dependency_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare target public.planning_dependencies%rowtype;
begin
  select * into target from public.planning_dependencies where id = p_dependency_id and company_id = public.current_planning_company_id();
  if target.id is null then raise exception using errcode = 'P0002', message = 'Dépendance introuvable.'; end if;
  if not public.planning_user_can('manage_dependency', target.company_id, target.vessel_id, target.starts_on, target.ends_on) then
    raise exception using errcode = '42501', message = 'Vous ne pouvez pas supprimer cette dépendance.';
  end if;
  delete from public.planning_dependencies where id = target.id;
  insert into public.planning_change_log (company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name, vessel_id, starts_on, ends_on, summary)
  values (target.company_id, 'dependency', target.id, 'delete', to_jsonb(target), auth.uid(), public.planning_current_actor_name(), target.vessel_id, target.starts_on, target.ends_on, 'Dépendance Planning supprimée');
  return target.id;
end;
$$;

create or replace function public.planning_queue_notification(
  p_company_id bigint,
  p_notification_type text,
  p_severity text,
  p_title text,
  p_body text,
  p_entity_kind text,
  p_entity_id bigint,
  p_person_id bigint,
  p_vessel_id bigint,
  p_due_on date,
  p_fingerprint text,
  p_all_members boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare inserted_count integer;
begin
  with recipients as (
    select person.user_id
    from public.people person
    where p_person_id is not null and person.id = p_person_id and person.company_id = p_company_id and person.user_id is not null
    union
    select role.user_id from public.user_roles role
    where role.company_id = p_company_id and role.role_key in ('admin', 'direction', 'armement')
    union
    select membership.user_id from public.company_memberships membership
    where p_all_members and membership.company_id = p_company_id and membership.active
  )
  insert into public.planning_notifications (
    company_id, recipient_user_id, notification_type, severity, title, body,
    entity_kind, entity_id, person_id, vessel_id, due_on, fingerprint
  )
  select p_company_id, recipient.user_id, p_notification_type, p_severity, trim(p_title), trim(p_body),
    p_entity_kind, p_entity_id, p_person_id, p_vessel_id, p_due_on, p_fingerprint
  from recipients recipient where recipient.user_id is not null
  on conflict (company_id, recipient_user_id, fingerprint) do update set
    severity = excluded.severity, title = excluded.title, body = excluded.body,
    due_on = excluded.due_on, person_id = excluded.person_id, vessel_id = excluded.vessel_id;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;
revoke all on function public.planning_queue_notification(bigint, text, text, text, text, text, bigint, bigint, bigint, date, text, boolean) from public, anon, authenticated;

create or replace function public.planning_notify_assignment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then
    perform public.planning_queue_notification(new.company_id, 'new_assignment', 'information', 'Nouvelle affectation',
      new.assignment_role || ' · du ' || new.starts_on::text || ' au ' || new.ends_on::text,
      'assignment', new.id, new.crew_person_id, new.vessel_id, new.starts_on,
      'assignment:' || new.id || ':created', false);
  elsif to_jsonb(old) - array['updated_at', 'updated_by'] is distinct from to_jsonb(new) - array['updated_at', 'updated_by'] then
    perform public.planning_queue_notification(new.company_id, 'assignment_modified', 'warning', 'Affectation modifiée',
      new.assignment_role || ' · du ' || new.starts_on::text || ' au ' || new.ends_on::text,
      'assignment', new.id, new.crew_person_id, new.vessel_id, new.starts_on,
      'assignment:' || new.id || ':modified:' || md5((to_jsonb(new) - array['updated_at', 'updated_by'])::text), false);
  end if;
  return new;
end; $$;
revoke all on function public.planning_notify_assignment() from public, anon, authenticated;
drop trigger if exists planning_assignments_p13_notify on public.planning_assignments;
create trigger planning_assignments_p13_notify after insert or update on public.planning_assignments for each row execute function public.planning_notify_assignment();

create or replace function public.planning_notify_publication()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from new.status or old.current_version is distinct from new.current_version) then
    perform public.planning_queue_notification(new.company_id, 'publication', 'information', 'Planning publié',
      'Version ' || new.current_version::text || ' · du ' || new.starts_on::text || ' au ' || new.ends_on::text,
      'publication', new.id, null, new.vessel_id, new.starts_on,
      'publication:' || new.id || ':version:' || new.current_version, true);
  end if;
  return new;
end; $$;
revoke all on function public.planning_notify_publication() from public, anon, authenticated;
drop trigger if exists planning_publications_p13_notify on public.planning_publications;
create trigger planning_publications_p13_notify after insert or update on public.planning_publications for each row execute function public.planning_notify_publication();

create or replace function public.planning_notify_handover()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.planning_queue_notification(new.company_id, 'handover', 'information', 'Relève planifiée',
    new.location || ' · ' || new.handover_at::text, 'handover', new.id, new.responsible_person_id,
    new.vessel_id, (new.handover_at at time zone 'Europe/Paris')::date,
    'handover:' || new.id || ':' || md5((to_jsonb(new) - array['updated_at', 'updated_by'])::text), false);
  return new;
end; $$;
revoke all on function public.planning_notify_handover() from public, anon, authenticated;
drop trigger if exists planning_handovers_p13_notify on public.planning_handovers;
create trigger planning_handovers_p13_notify after insert or update on public.planning_handovers for each row execute function public.planning_notify_handover();

create or replace function public.planning_notify_absence()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.planning_queue_notification(new.company_id, 'absence', case when new.status = 'approved' then 'warning' else 'information' end,
    'Absence ' || new.status, new.absence_type || ' · du ' || new.starts_at::date::text || ' au ' || new.ends_at::date::text,
    'absence', new.id, new.person_id, null, (new.starts_at at time zone 'Europe/Paris')::date,
    'absence:' || new.id || ':' || new.status, false);
  return new;
end; $$;
revoke all on function public.planning_notify_absence() from public, anon, authenticated;
drop trigger if exists planning_absences_p13_notify on public.planning_absences;
create trigger planning_absences_p13_notify after insert or update on public.planning_absences for each row execute function public.planning_notify_absence();

create or replace function public.planning_notify_conflict()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare target_type text;
begin
  if new.status in ('resolved', 'dismissed') then return new; end if;
  if new.conflict_type = 'vacant_position' then target_type := 'vacant_position';
  elsif new.priority = 'critical' or new.severity = 'blocking' then target_type := 'critical_conflict';
  else return new; end if;
  perform public.planning_queue_notification(new.company_id, target_type, 'critical', new.title, new.description,
    'conflict_case', new.id, new.person_id, new.vessel_id, new.starts_on,
    'conflict:' || new.conflict_key || ':' || new.status || ':' || new.priority, false);
  return new;
end; $$;
revoke all on function public.planning_notify_conflict() from public, anon, authenticated;
drop trigger if exists planning_conflict_cases_p13_notify on public.planning_conflict_cases;
create trigger planning_conflict_cases_p13_notify after insert or update on public.planning_conflict_cases for each row execute function public.planning_notify_conflict();

create or replace function public.refresh_planning_notifications(p_reference_date date)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  item record;
  affected integer := 0;
begin
  if target_company_id is null or not public.has_any_role(array['admin', 'direction', 'armement']) then
    raise exception using errcode = '42501', message = 'Vous ne pouvez pas actualiser les notifications.';
  end if;
  for item in
    select document.id, document.person_id, null::bigint as vessel_id, document.title, document.expires_on
    from public.hr_documents document
    where document.company_id = target_company_id and document.person_id is not null
      and document.expires_on between p_reference_date and p_reference_date + 30
    union all
    select certificate.id, null::bigint, certificate.vessel_id, certificate.title, certificate.expires_on
    from public.fleet_certificates certificate
    where certificate.company_id = target_company_id and certificate.vessel_id is not null
      and certificate.expires_on between p_reference_date and p_reference_date + 30
  loop
    affected := affected + public.planning_queue_notification(target_company_id, 'expiring_certificate',
      case when item.expires_on <= p_reference_date + 7 then 'critical' else 'warning' end,
      'Échéance documentaire', item.title || ' expire le ' || item.expires_on::text,
      'certificate', item.id, item.person_id, item.vessel_id, item.expires_on,
      'certificate:' || coalesce(item.person_id::text, 'vessel:' || item.vessel_id::text) || ':' || item.id || ':' || item.expires_on::text, false);
  end loop;
  return affected;
end;
$$;

create or replace function public.mark_planning_notification_read(p_notification_id bigint, p_read boolean)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare target_id bigint;
begin
  update public.planning_notifications set read_at = case when p_read then now() else null end
  where id = p_notification_id and recipient_user_id = auth.uid()
    and company_id = public.current_planning_company_id()
  returning id into target_id;
  if target_id is null then raise exception using errcode = 'P0002', message = 'Notification introuvable.'; end if;
  return target_id;
end;
$$;

revoke all on function public.save_planning_work_rest_policy(bigint, text, text, bigint, date, date, numeric, numeric, numeric, numeric, numeric, integer, time, time, numeric, boolean, boolean, text) from public, anon;
revoke all on function public.save_planning_dependency(bigint, text, text, bigint, text, bigint, integer, text, boolean) from public, anon;
revoke all on function public.delete_planning_dependency(bigint) from public, anon;
revoke all on function public.refresh_planning_notifications(date) from public, anon;
revoke all on function public.mark_planning_notification_read(bigint, boolean) from public, anon;
grant execute on function public.save_planning_work_rest_policy(bigint, text, text, bigint, date, date, numeric, numeric, numeric, numeric, numeric, integer, time, time, numeric, boolean, boolean, text) to authenticated;
grant execute on function public.save_planning_dependency(bigint, text, text, bigint, text, bigint, integer, text, boolean) to authenticated;
grant execute on function public.delete_planning_dependency(bigint) to authenticated;
grant execute on function public.refresh_planning_notifications(date) to authenticated;
grant execute on function public.mark_planning_notification_read(bigint, boolean) to authenticated;

comment on table public.planning_work_rest_policies is 'Company/vessel work and rest thresholds configured by authorized users; no regulatory values are seeded.';
comment on table public.planning_notifications is 'Recipient-specific in-app Planning notifications generated by operational triggers and the expiry refresh RPC.';
comment on table public.planning_dependencies is 'Manual finish-to-start dependencies between Planning operations, maintenance, training, deliveries and assignments.';
comment on column public.planning_days.consecutive_rest_hours is 'Optional imported or declared longest consecutive rest period; null means not evaluable.';
comment on column public.planning_days.rest_period_count is 'Optional imported or declared number of rest periods over 24 hours; null means not evaluable.';
comment on column public.planning_days.night_work_hours is 'Optional imported or declared work in the configured night window; null means not evaluable.';
