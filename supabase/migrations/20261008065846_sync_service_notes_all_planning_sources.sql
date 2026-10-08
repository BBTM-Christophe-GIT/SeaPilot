-- Current-year vessel notes remain applicable to current and future crew,
-- including when their Planning assignment predates publication but follows
-- the authored date. Older notes retain their original authored-date scope.
-- Existing recipients and signatures are retained throughout synchronization.

create or replace function public.service_note_resolved_recipients(p_note_id bigint)
returns table (
  person_id bigint,
  user_id uuid,
  first_name text,
  last_name text,
  function_label text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
  include_current_planning boolean;
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id;

  if (select auth.uid()) is null
    or target_note.id is null
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_TARGETING_FORBIDDEN.';
  end if;

  include_current_planning :=
    target_note.authored_on >= date_trunc('year', current_date)::date
    and target_note.authored_on < (date_trunc('year', current_date) + interval '1 year')::date;

  return query
  with planning_events as (
    select assigned.person_id, assignment.vessel_id, assignment.starts_on, assignment.ends_on
    from public.planning_assignments assignment
    cross join lateral (
      values (assignment.crew_person_id), (assignment.captain_person_id)
    ) assigned(person_id)
    where assignment.company_id = target_note.company_id
      and assigned.person_id is not null
      and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
      and (
        (include_current_planning and assignment.ends_on >= current_date)
        or target_note.authored_on between assignment.starts_on and assignment.ends_on
      )
    union
    select period.person_id, period.vessel_id, period.starts_on, period.ends_on
    from public.planning_periods period
    where period.company_id = target_note.company_id
      and period.person_id is not null
      and period.vessel_id is not null
      and (
        (include_current_planning and period.ends_on >= current_date)
        or target_note.authored_on between period.starts_on and period.ends_on
      )
    union
    select day.person_id, day.vessel_id, day.work_date, day.work_date
    from public.planning_days day
    where day.company_id = target_note.company_id
      and day.person_id is not null
      and day.vessel_id is not null
      and coalesce(day.slot365, '') not like 'assignment:%'
      and (
        (include_current_planning and day.work_date >= current_date)
        or day.work_date = target_note.authored_on
      )
  ), planned_people as (
    select distinct event.person_id, event.vessel_id, eligibility.on_date
    from planning_events event
    cross join lateral (
      values (target_note.authored_on), (greatest(event.starts_on, current_date))
    ) eligibility(on_date)
    where eligibility.on_date between event.starts_on and event.ends_on
      and (eligibility.on_date = target_note.authored_on or include_current_planning)
  )
  select distinct person.id, person.user_id, person.first_name, person.last_name,
         coalesce(person.function_label, '')
  from public.people person
  where person.company_id = target_note.company_id
    and person.active
    and person.user_id is not null
    and person.id is distinct from target_note.author_person_id
    and (
      exists (
        select 1 from public.company_memberships membership
        where membership.company_id = target_note.company_id
          and membership.user_id = person.user_id
          and membership.active
      )
      or exists (
        select 1 from public.profiles profile
        where profile.id = person.user_id
          and profile.active_company_id = target_note.company_id
      )
    )
    and (
      (
        (person.hired_on is null or person.hired_on <= target_note.authored_on)
        and (person.departed_on is null or person.departed_on > target_note.authored_on)
        and (
          target_note.scope = 'all_accounts'
          or (
            target_note.scope in ('people', 'vessels')
            and exists (
              select 1 from public.qhse_service_note_target_people target
              where target.note_id = target_note.id and target.person_id = person.id
            )
          )
        )
      )
      or (
        target_note.scope = 'vessels'
        and exists (
          select 1
          from planned_people planned
          join public.qhse_service_note_target_vessels target
            on target.note_id = target_note.id and target.vessel_id = planned.vessel_id
          where planned.person_id = person.id
            and (person.hired_on is null or person.hired_on <= planned.on_date)
            and (person.departed_on is null or person.departed_on > planned.on_date)
        )
      )
    )
  order by person.last_name, person.first_name;
end;
$$;

create or replace function private.add_active_vessel_service_note_recipient(
  p_company_id bigint,
  p_vessel_id bigint,
  p_person_id bigint,
  p_embarks_on date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
  eligibility_date date := greatest(coalesce(p_embarks_on, current_date), current_date);
begin
  if p_company_id is null or p_vessel_id is null or p_person_id is null then
    return 0;
  end if;

  insert into public.qhse_service_note_recipients (
    company_id, note_id, user_id, person_id,
    first_name_snapshot, last_name_snapshot, function_snapshot
  )
  select
    note.company_id, note.id, person.user_id, person.id,
    coalesce(person.first_name, ''), coalesce(person.last_name, ''),
    coalesce(person.function_label, '')
  from public.people person
  join public.qhse_service_notes note
    on note.company_id = person.company_id
   and note.status = 'published'
   and note.scope = 'vessels'
   and note.authored_on >= date_trunc('year', current_date)::date
   and note.authored_on < (date_trunc('year', current_date) + interval '1 year')::date
   and note.author_person_id is distinct from person.id
  join public.qhse_service_note_target_vessels target
    on target.company_id = note.company_id
   and target.note_id = note.id
   and target.vessel_id = p_vessel_id
  where person.company_id = p_company_id
    and person.id = p_person_id
    and person.active
    and person.user_id is not null
    and (person.hired_on is null or person.hired_on <= eligibility_date)
    and (person.departed_on is null or person.departed_on > eligibility_date)
    and (
      exists (
        select 1 from public.company_memberships membership
        where membership.company_id = p_company_id
          and membership.user_id = person.user_id
          and membership.active
      )
      or exists (
        select 1 from public.profiles profile
        where profile.id = person.user_id
          and profile.active_company_id = p_company_id
      )
    )
  on conflict (note_id, user_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function private.sync_service_note_recipients_on_period()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ends_on < current_date or new.person_id is null or new.vessel_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.company_id is not distinct from new.company_id
    and old.vessel_id is not distinct from new.vessel_id
    and old.person_id is not distinct from new.person_id
    and old.starts_on is not distinct from new.starts_on
    and old.ends_on is not distinct from new.ends_on then
    return new;
  end if;

  perform private.add_active_vessel_service_note_recipient(
    new.company_id, new.vessel_id, new.person_id, new.starts_on
  );
  return new;
end;
$$;

create or replace function private.sync_service_note_recipients_on_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Derived assignment annotations can remain after their parent is cancelled.
  -- The parent assignment owns that eligibility and is synchronized separately.
  if new.work_date < current_date or new.person_id is null or new.vessel_id is null
    or coalesce(new.slot365, '') like 'assignment:%' then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.company_id is not distinct from new.company_id
    and old.vessel_id is not distinct from new.vessel_id
    and old.person_id is not distinct from new.person_id
    and old.work_date is not distinct from new.work_date
    and old.slot365 is not distinct from new.slot365 then
    return new;
  end if;

  perform private.add_active_vessel_service_note_recipient(
    new.company_id, new.vessel_id, new.person_id, new.work_date
  );
  return new;
end;
$$;

create or replace function private.sync_service_note_recipients_on_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  embarkation record;
begin
  if not new.active or new.user_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and old.company_id is not distinct from new.company_id
    and old.user_id is not distinct from new.user_id
    and old.active is not distinct from new.active
    and old.hired_on is not distinct from new.hired_on
    and old.departed_on is not distinct from new.departed_on then
    return new;
  end if;

  for embarkation in
    select assignment.vessel_id, assignment.starts_on as embarks_on
    from public.planning_assignments assignment
    where assignment.company_id = new.company_id
      and (assignment.crew_person_id = new.id or assignment.captain_person_id = new.id)
      and assignment.ends_on >= current_date
      and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
    union
    select period.vessel_id, period.starts_on
    from public.planning_periods period
    where period.company_id = new.company_id
      and period.person_id = new.id
      and period.vessel_id is not null
      and period.ends_on >= current_date
    union
    select day.vessel_id, day.work_date
    from public.planning_days day
    where day.company_id = new.company_id
      and day.person_id = new.id
      and day.vessel_id is not null
      and coalesce(day.slot365, '') not like 'assignment:%'
      and day.work_date >= current_date
  loop
    perform private.add_active_vessel_service_note_recipient(
      new.company_id, embarkation.vessel_id, new.id, embarkation.embarks_on
    );
  end loop;
  return new;
end;
$$;

revoke all on function public.service_note_resolved_recipients(bigint) from public, anon;
grant execute on function public.service_note_resolved_recipients(bigint) to authenticated;
revoke all on function private.add_active_vessel_service_note_recipient(bigint, bigint, bigint, date)
  from public, anon, authenticated;
revoke all on function private.sync_service_note_recipients_on_period()
  from public, anon, authenticated;
revoke all on function private.sync_service_note_recipients_on_day()
  from public, anon, authenticated;
revoke all on function private.sync_service_note_recipients_on_person()
  from public, anon, authenticated;

drop trigger if exists planning_periods_sync_service_note_recipients on public.planning_periods;
create trigger planning_periods_sync_service_note_recipients
  after insert or update on public.planning_periods
  for each row execute function private.sync_service_note_recipients_on_period();

drop trigger if exists planning_days_sync_service_note_recipients on public.planning_days;
create trigger planning_days_sync_service_note_recipients
  after insert or update on public.planning_days
  for each row execute function private.sync_service_note_recipients_on_day();

drop trigger if exists people_sync_service_note_recipients on public.people;
create trigger people_sync_service_note_recipients
  after insert or update on public.people
  for each row execute function private.sync_service_note_recipients_on_person();

-- Repair missing recipient rows for current-year notes already published. This only adds
-- obligations and never resets a register or changes a recorded signature.
with assigned_people as (
  select assignment.company_id, assignment.vessel_id,
         assigned.person_id, assignment.starts_on as embarks_on
  from public.planning_assignments assignment
  cross join lateral (
    values (assignment.crew_person_id), (assignment.captain_person_id)
  ) assigned(person_id)
  where assigned.person_id is not null
    and assignment.ends_on >= current_date
    and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
  union
  select period.company_id, period.vessel_id, period.person_id, period.starts_on
  from public.planning_periods period
  where period.person_id is not null
    and period.vessel_id is not null
    and period.ends_on >= current_date
  union
  select day.company_id, day.vessel_id, day.person_id, day.work_date
  from public.planning_days day
  where day.person_id is not null
    and day.vessel_id is not null
    and coalesce(day.slot365, '') not like 'assignment:%'
    and day.work_date >= current_date
)
select coalesce(sum(private.add_active_vessel_service_note_recipient(
  assigned.company_id, assigned.vessel_id, assigned.person_id, assigned.embarks_on
)), 0) as added_service_note_recipients
from assigned_people assigned;

comment on function public.service_note_resolved_recipients(bigint) is
  'Resolves current-year vessel recipients from note-date and current or future Planning; older notes and named/all-account scopes retain authored-date eligibility.';
comment on function private.add_active_vessel_service_note_recipient(bigint, bigint, bigint, date) is
  'Adds an active account to published current-year vessel notes using current or future embarkation employment eligibility, preserving existing recipients and signatures.';
comment on function private.sync_service_note_recipients_on_period() is
  'Adds current or future period assignees to active current-year vessel service-note registers.';
comment on function private.sync_service_note_recipients_on_day() is
  'Adds current or future daily assignees to active current-year vessel service-note registers.';
comment on function private.sync_service_note_recipients_on_person() is
  'Synchronizes current or future vessel assignments with current-year notes when an employee is linked to or reactivates an active SeaPilot account.';
