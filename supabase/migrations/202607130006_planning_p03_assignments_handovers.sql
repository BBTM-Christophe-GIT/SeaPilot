-- Planning P0.3: timed assignments, handovers and audited derogations.
-- Existing assignment rows and civil dates are preserved.
--
-- Rollback strategy:
--   1. Drop the P0.3 triggers/functions and the three P0.3 tables after exporting them.
--   2. Recreate planning_assignment_overview() from 202607130005.
--   3. Drop starts_at/ends_at only after confirming no time precision must be retained.
--   4. Restore the planning_change_log entity-kind constraint from 202607120003.

alter table public.planning_assignments
  add column if not exists starts_at timestamptz,
  add column if not exists ends_at timestamptz;

update public.planning_assignments
set starts_at = starts_on::timestamp at time zone 'Europe/Paris',
    ends_at = (ends_on::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'Europe/Paris'
where starts_at is null or ends_at is null;

create or replace function public.sync_planning_assignment_dates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.starts_at is null then
    new.starts_at := new.starts_on::timestamp at time zone 'Europe/Paris';
  end if;
  if new.ends_at is null then
    new.ends_at := (new.ends_on::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'Europe/Paris';
  end if;

  new.starts_on := (new.starts_at at time zone 'Europe/Paris')::date;
  new.ends_on := (new.ends_at at time zone 'Europe/Paris')::date;
  return new;
end;
$$;

revoke all on function public.sync_planning_assignment_dates() from public, anon, authenticated;

drop trigger if exists planning_assignments_sync_dates on public.planning_assignments;
drop trigger if exists planning_assignments_00_sync_dates on public.planning_assignments;
create trigger planning_assignments_00_sync_dates
  before insert or update of starts_on, ends_on, starts_at, ends_at on public.planning_assignments
  for each row execute function public.sync_planning_assignment_dates();

alter table public.planning_assignments
  alter column starts_at set not null,
  alter column ends_at set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'planning_assignments_valid_timestamps'
      and conrelid = 'public.planning_assignments'::regclass
  ) then
    alter table public.planning_assignments
      add constraint planning_assignments_valid_timestamps
      check (ends_at > starts_at) not valid;
  end if;
end $$;

alter table public.planning_assignments
  validate constraint planning_assignments_valid_timestamps;

create index if not exists planning_assignments_crew_timestamps_idx
  on public.planning_assignments (crew_person_id, starts_at, ends_at)
  where confirmation_status <> 'cancelled';
create index if not exists planning_assignments_vessel_timestamps_idx
  on public.planning_assignments (vessel_id, starts_at, ends_at)
  where confirmation_status <> 'cancelled';

insert into public.planning_rules (
  code, name, description, scope, control_level, effective_from, source_reference
)
values
  ('crew_absence', 'Absence équipage', 'Contrôle les congés, arrêts et absences qui chevauchent une affectation.', 'availability', 'blocking', '2026-07-13', 'Règle interne configurable'),
  ('credential_expires_during_assignment', 'Titre expirant pendant l’embarquement', 'Signale un titre ou certificat valide au départ mais expirant avant le débarquement.', 'document', 'warning', '2026-07-13', 'Contrôle opérationnel configurable'),
  ('missing_qualification', 'Qualification manquante', 'Signale l’absence de qualification pont ou machine connue pour la fonction affectée.', 'document', 'warning', '2026-07-13', 'Contrôle limité aux données RH disponibles, sans matrice d’armement')
on conflict (code) do nothing;

create table if not exists public.planning_handovers (
  id bigint generated always as identity primary key,
  vessel_id bigint not null references public.vessels(id) on delete restrict,
  handover_at timestamptz not null,
  location text not null,
  handover_duration_minutes integer not null default 0,
  responsible_person_id bigint not null references public.people(id) on delete restrict,
  comments text,
  status text not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_handovers_location_check check (length(trim(location)) > 0),
  constraint planning_handovers_duration_check check (handover_duration_minutes between 0 and 1440),
  constraint planning_handovers_status_check check (status in ('draft', 'planned', 'confirmed', 'completed', 'cancelled'))
);

create table if not exists public.planning_handover_positions (
  id bigint generated always as identity primary key,
  handover_id bigint not null references public.planning_handovers(id) on delete cascade,
  position_order integer not null default 0,
  function_label text not null,
  outgoing_person_id bigint references public.people(id) on delete restrict,
  incoming_person_id bigint references public.people(id) on delete restrict,
  outgoing_assignment_id bigint references public.planning_assignments(id) on delete set null,
  incoming_assignment_id bigint references public.planning_assignments(id) on delete set null,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_handover_positions_function_check check (length(trim(function_label)) > 0),
  constraint planning_handover_positions_people_check check (outgoing_person_id is not null or incoming_person_id is not null)
);

create table if not exists public.planning_derogations (
  id bigint generated always as identity primary key,
  rule_id bigint not null references public.planning_rules(id) on delete restrict,
  assignment_id bigint references public.planning_assignments(id) on delete set null,
  person_id bigint not null references public.people(id) on delete restrict,
  vessel_id bigint not null references public.vessels(id) on delete restrict,
  reason text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  evidence_url text,
  status text not null default 'active',
  author_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  author_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planning_derogations_reason_check check (length(trim(reason)) >= 10),
  constraint planning_derogations_period_check check (ends_at > starts_at),
  constraint planning_derogations_status_check check (status in ('active', 'revoked', 'expired'))
);

create index if not exists planning_handovers_vessel_date_idx
  on public.planning_handovers (vessel_id, handover_at desc);
create index if not exists planning_handovers_responsible_person_id_idx
  on public.planning_handovers (responsible_person_id);
create index if not exists planning_handovers_created_by_idx
  on public.planning_handovers (created_by);
create index if not exists planning_handovers_updated_by_idx
  on public.planning_handovers (updated_by);
create index if not exists planning_handover_positions_handover_order_idx
  on public.planning_handover_positions (handover_id, position_order, id);
create index if not exists planning_handover_positions_outgoing_person_id_idx
  on public.planning_handover_positions (outgoing_person_id);
create index if not exists planning_handover_positions_incoming_person_id_idx
  on public.planning_handover_positions (incoming_person_id);
create index if not exists planning_handover_positions_outgoing_assignment_id_idx
  on public.planning_handover_positions (outgoing_assignment_id);
create index if not exists planning_handover_positions_incoming_assignment_id_idx
  on public.planning_handover_positions (incoming_assignment_id);
create index if not exists planning_derogations_rule_id_idx
  on public.planning_derogations (rule_id);
create index if not exists planning_derogations_assignment_id_idx
  on public.planning_derogations (assignment_id);
create index if not exists planning_derogations_author_id_idx
  on public.planning_derogations (author_id);
create index if not exists planning_derogations_scope_idx
  on public.planning_derogations (person_id, vessel_id, starts_at, ends_at)
  where status = 'active';

grant select, insert, update, delete on
  public.planning_handovers,
  public.planning_handover_positions,
  public.planning_derogations
to authenticated;
grant usage on
  public.planning_handovers_id_seq,
  public.planning_handover_positions_id_seq,
  public.planning_derogations_id_seq
to authenticated;

alter table public.planning_handovers enable row level security;
alter table public.planning_handover_positions enable row level security;
alter table public.planning_derogations enable row level security;

drop policy if exists planning_handovers_role_read on public.planning_handovers;
create policy planning_handovers_role_read on public.planning_handovers
  for select to authenticated
  using (
    (select public.has_any_role(array['admin', 'direction', 'armement']))
    or (
      (select public.has_role('capitaine'))
      and exists (
        select 1 from public.planning_assignments assignment
        where assignment.vessel_id = planning_handovers.vessel_id
          and assignment.captain_person_id = (select public.current_person_id())
          and (planning_handovers.handover_at at time zone 'Europe/Paris')::date
            between assignment.starts_on and assignment.ends_on
      )
    )
  );

drop policy if exists planning_handovers_admin_write on public.planning_handovers;
create policy planning_handovers_admin_write on public.planning_handovers
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

drop policy if exists planning_handover_positions_role_read on public.planning_handover_positions;
create policy planning_handover_positions_role_read on public.planning_handover_positions
  for select to authenticated
  using (
    exists (
      select 1 from public.planning_handovers handover
      where handover.id = planning_handover_positions.handover_id
    )
  );

drop policy if exists planning_handover_positions_admin_write on public.planning_handover_positions;
create policy planning_handover_positions_admin_write on public.planning_handover_positions
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

drop policy if exists planning_derogations_admin_read on public.planning_derogations;
create policy planning_derogations_admin_read on public.planning_derogations
  for select to authenticated
  using ((select public.has_role('admin')));

drop policy if exists planning_derogations_admin_write on public.planning_derogations;
create policy planning_derogations_admin_write on public.planning_derogations
  for all to authenticated
  using ((select public.has_role('admin')))
  with check ((select public.has_role('admin')));

create or replace function public.protect_planning_derogation_author()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := (select auth.uid());
    select coalesce(nullif(trim(profile.display_name), ''), profile.email, new.author_id::text)
    into new.author_name
    from public.profiles profile
    where profile.id = new.author_id;
    new.author_name := coalesce(nullif(trim(new.author_name), ''), new.author_id::text);
  else
    new.author_id := old.author_id;
    new.author_name := old.author_name;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_planning_derogation_author() from public, anon, authenticated;
drop trigger if exists planning_derogations_protect_author on public.planning_derogations;
create trigger planning_derogations_protect_author
  before insert or update on public.planning_derogations
  for each row execute function public.protect_planning_derogation_author();

create or replace function public.planning_has_active_derogation(
  target_rule_code text,
  target_person_id bigint,
  target_vessel_id bigint,
  target_starts_at timestamptz,
  target_ends_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.planning_derogations derogation
    join public.planning_rules rule on rule.id = derogation.rule_id
    where rule.code = target_rule_code
      and derogation.person_id = target_person_id
      and derogation.vessel_id = target_vessel_id
      and derogation.status = 'active'
      and derogation.starts_at <= target_starts_at
      and derogation.ends_at >= target_ends_at
  );
$$;

create or replace function public.planning_rule_is_blocking(target_rule_code text, target_date date)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select rule.active and rule.control_level = 'blocking' and rule.effective_from <= target_date
    from public.planning_rules rule
    where rule.code = target_rule_code
  ), false);
$$;

revoke all on function public.planning_has_active_derogation(text, bigint, bigint, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.planning_rule_is_blocking(text, date) from public, anon, authenticated;

create or replace function public.enforce_planning_assignment_blockers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  person_row public.people%rowtype;
  period_status text;
  medical_block boolean;
  target_day date := (new.starts_at at time zone 'Europe/Paris')::date;
begin
  if new.confirmation_status = 'cancelled' then
    return new;
  end if;

  select * into person_row from public.people where id = new.crew_person_id;
  if (
    not person_row.active
    or (person_row.hired_on is not null and person_row.hired_on > new.ends_on)
    or (person_row.departed_on is not null and person_row.departed_on < new.starts_on)
  ) and public.planning_rule_is_blocking('inactive_person', target_day)
    and not public.planning_has_active_derogation('inactive_person', new.crew_person_id, new.vessel_id, new.starts_at, new.ends_at) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CONTROL_BLOCKED: inactive_person';
  end if;

  select lower(coalesce(period.sailor_status, '')) into period_status
  from public.planning_periods period
  where period.person_id = new.crew_person_id
    and period.starts_on <= new.ends_on
    and period.ends_on >= new.starts_on
    and lower(coalesce(period.sailor_status, '')) ~ '(cong|absen|malad|arr.t|repos|formation|indispon)'
  order by period.starts_on
  limit 1;

  if period_status ~ '(cong|absen|malad|arr.t)'
    and public.planning_rule_is_blocking('crew_absence', target_day)
    and not public.planning_has_active_derogation('crew_absence', new.crew_person_id, new.vessel_id, new.starts_at, new.ends_at) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CONTROL_BLOCKED: crew_absence';
  elsif period_status is not null
    and public.planning_rule_is_blocking('crew_unavailability', target_day)
    and not public.planning_has_active_derogation('crew_unavailability', new.crew_person_id, new.vessel_id, new.starts_at, new.ends_at) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CONTROL_BLOCKED: crew_unavailability';
  end if;

  select exists (
    select 1 from public.hr_documents document
    where document.person_id = new.crew_person_id
      and (
        document.medical_unfit is true
        or (
          lower(concat_ws(' ', document.category_key, document.title)) ~ '(medical|médical|aptitude)'
          and (
            lower(document.status) in ('expired', 'missing')
            or document.expires_on is null
            or document.expires_on < new.ends_on
          )
        )
      )
  ) into medical_block;

  if medical_block
    and public.planning_rule_is_blocking('expired_medical', target_day)
    and not public.planning_has_active_derogation('expired_medical', new.crew_person_id, new.vessel_id, new.starts_at, new.ends_at) then
    raise exception using errcode = 'P0001', message = 'PLANNING_CONTROL_BLOCKED: expired_medical';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_planning_assignment_blockers() from public, anon, authenticated;

drop trigger if exists planning_assignments_control_guard on public.planning_assignments;
create trigger planning_assignments_control_guard
  before insert or update on public.planning_assignments
  for each row execute function public.enforce_planning_assignment_blockers();

create or replace function public.save_planning_handover(
  p_handover_id bigint,
  p_vessel_id bigint,
  p_handover_at timestamptz,
  p_location text,
  p_duration_minutes integer,
  p_responsible_person_id bigint,
  p_comments text,
  p_status text,
  p_positions jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_id bigint;
begin
  if not (select public.has_role('admin')) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: relève réservée aux administrateurs.';
  end if;
  if p_handover_at is null or length(trim(coalesce(p_location, ''))) = 0 then
    raise exception using errcode = '22023', message = 'PLANNING_HANDOVER_INVALID: date, heure et lieu obligatoires.';
  end if;
  if jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then
    raise exception using errcode = '22023', message = 'PLANNING_HANDOVER_INVALID: au moins un poste est obligatoire.';
  end if;

  if p_handover_id is null then
    insert into public.planning_handovers (
      vessel_id, handover_at, location, handover_duration_minutes,
      responsible_person_id, comments, status, created_by, updated_by
    ) values (
      p_vessel_id, p_handover_at, trim(p_location), p_duration_minutes,
      p_responsible_person_id, nullif(trim(coalesce(p_comments, '')), ''), p_status,
      (select auth.uid()), (select auth.uid())
    ) returning id into target_id;
  else
    update public.planning_handovers
    set vessel_id = p_vessel_id,
        handover_at = p_handover_at,
        location = trim(p_location),
        handover_duration_minutes = p_duration_minutes,
        responsible_person_id = p_responsible_person_id,
        comments = nullif(trim(coalesce(p_comments, '')), ''),
        status = p_status,
        updated_by = (select auth.uid()),
        updated_at = now()
    where id = p_handover_id
    returning id into target_id;
    if target_id is null then
      raise exception using errcode = 'P0002', message = 'PLANNING_HANDOVER_NOT_FOUND';
    end if;
    delete from public.planning_handover_positions where handover_id = target_id;
  end if;

  insert into public.planning_handover_positions (
    handover_id, position_order, function_label,
    outgoing_person_id, incoming_person_id,
    outgoing_assignment_id, incoming_assignment_id, comments
  )
  select
    target_id,
    (position.ordinality - 1)::integer,
    trim(position.value->>'function_label'),
    nullif(position.value->>'outgoing_person_id', '')::bigint,
    nullif(position.value->>'incoming_person_id', '')::bigint,
    nullif(position.value->>'outgoing_assignment_id', '')::bigint,
    nullif(position.value->>'incoming_assignment_id', '')::bigint,
    nullif(trim(coalesce(position.value->>'comments', '')), '')
  from jsonb_array_elements(p_positions) with ordinality as position(value, ordinality);

  return target_id;
end;
$$;

revoke all on function public.save_planning_handover(bigint, bigint, timestamptz, text, integer, bigint, text, text, jsonb) from public, anon;
grant execute on function public.save_planning_handover(bigint, bigint, timestamptz, text, integer, bigint, text, text, jsonb) to authenticated;

create or replace function public.assert_planning_handover_unlocked()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_row public.planning_handovers%rowtype;
  target_date date;
begin
  if tg_op = 'DELETE' then
    target_row := old;
  else
    target_row := new;
  end if;
  target_date := (target_row.handover_at at time zone 'Europe/Paris')::date;
  if public.planning_scope_is_locked(target_date, target_date, target_row.vessel_id) then
    raise exception using errcode = 'P0001', message = 'PLANNING_LOCKED: cette relève appartient à une période verrouillée.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.assert_planning_handover_unlocked() from public, anon, authenticated;

drop trigger if exists planning_handovers_lock_guard on public.planning_handovers;
create trigger planning_handovers_lock_guard
  before insert or update or delete on public.planning_handovers
  for each row execute function public.assert_planning_handover_unlocked();

alter table public.planning_change_log
  drop constraint if exists planning_change_log_entity_kind_check;
alter table public.planning_change_log
  add constraint planning_change_log_entity_kind_check
  check (entity_kind in ('assignment', 'day', 'period', 'project', 'vessel', 'handover', 'handover_position', 'derogation'));

create or replace function public.audit_planning_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_kind text;
  target_id bigint;
  target_action text;
begin
  target_kind := case tg_table_name
    when 'planning_assignments' then 'assignment'
    when 'planning_days' then 'day'
    when 'planning_periods' then 'period'
    when 'planning_projects' then 'project'
    when 'planning_handovers' then 'handover'
    when 'planning_handover_positions' then 'handover_position'
    when 'planning_derogations' then 'derogation'
  end;
  target_id := case when tg_op = 'DELETE' then old.id else new.id end;
  target_action := case tg_op when 'INSERT' then 'create' when 'UPDATE' then 'update' else 'delete' end;

  insert into public.planning_change_log (entity_kind, entity_id, action, payload, changed_by)
  values (
    target_kind,
    target_id,
    target_action,
    jsonb_build_object(
      'before', case when tg_op = 'INSERT' then null else to_jsonb(old) end,
      'after', case when tg_op = 'DELETE' then null else to_jsonb(new) end
    ),
    (select auth.uid())
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.audit_planning_mutation() from public, anon, authenticated;

drop trigger if exists planning_handovers_audit on public.planning_handovers;
create trigger planning_handovers_audit
  after insert or update or delete on public.planning_handovers
  for each row execute function public.audit_planning_mutation();
drop trigger if exists planning_handover_positions_audit on public.planning_handover_positions;
create trigger planning_handover_positions_audit
  after insert or update or delete on public.planning_handover_positions
  for each row execute function public.audit_planning_mutation();
drop trigger if exists planning_derogations_audit on public.planning_derogations;
create trigger planning_derogations_audit
  after insert or update or delete on public.planning_derogations
  for each row execute function public.audit_planning_mutation();

drop function if exists public.planning_assignment_overview();
create function public.planning_assignment_overview()
returns table (
  id bigint,
  vessel_id bigint,
  vessel_name text,
  captain_person_id bigint,
  captain_name text,
  crew_person_id bigint,
  crew_name text,
  starts_on date,
  ends_on date,
  starts_at timestamptz,
  ends_at timestamptz,
  assignment_role text,
  status_label text,
  confirmation_status text,
  watch_group text,
  comments text,
  source_label text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    assignment.id,
    assignment.vessel_id,
    vessel.name,
    assignment.captain_person_id,
    nullif(trim(concat_ws(' ', captain.first_name, captain.last_name)), ''),
    assignment.crew_person_id,
    nullif(trim(concat_ws(' ', crew.first_name, crew.last_name)), ''),
    assignment.starts_on,
    assignment.ends_on,
    assignment.starts_at,
    assignment.ends_at,
    assignment.assignment_role,
    assignment.status_label,
    assignment.confirmation_status,
    assignment.watch_group,
    assignment.comments,
    assignment.source_label
  from public.planning_assignments assignment
  left join public.vessels vessel on vessel.id = assignment.vessel_id
  left join public.people captain on captain.id = assignment.captain_person_id
  left join public.people crew on crew.id = assignment.crew_person_id
  where
    public.has_any_role(array['admin', 'direction', 'armement'])
    or (public.has_role('capitaine') and assignment.captain_person_id = public.current_person_id())
    or assignment.crew_person_id = public.current_person_id()
  order by assignment.starts_at, assignment.ends_at, coalesce(vessel.name, ''), coalesce(crew.last_name, '');
$$;

revoke all on function public.planning_assignment_overview() from public;
revoke execute on function public.planning_assignment_overview() from anon;
grant execute on function public.planning_assignment_overview() to authenticated;

comment on table public.planning_handovers is 'P0.3 maritime handovers with UTC timestamp, location, owner and lifecycle status.';
comment on table public.planning_handover_positions is 'Incoming/outgoing crew comparison by handover position.';
comment on table public.planning_derogations is 'Time-bounded, rule-specific Planning derogations restricted to administrators and fully audited.';
comment on column public.planning_assignments.starts_at is 'UTC instant. Display and civil-date synchronization use Europe/Paris.';
comment on column public.planning_assignments.ends_at is 'UTC instant strictly after starts_at. Display uses Europe/Paris.';
