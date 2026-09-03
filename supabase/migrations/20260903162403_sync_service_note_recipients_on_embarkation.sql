-- Keep active vessel service-note registers aligned with new Planning embarkations.
-- Recipients are only added: existing signatures and the audit trail are never removed.

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
begin
  if p_company_id is null or p_vessel_id is null or p_person_id is null then
    return 0;
  end if;

  insert into public.qhse_service_note_recipients (
    company_id,
    note_id,
    user_id,
    person_id,
    first_name_snapshot,
    last_name_snapshot,
    function_snapshot
  )
  select
    note.company_id,
    note.id,
    person.user_id,
    person.id,
    coalesce(person.first_name, ''),
    coalesce(person.last_name, ''),
    coalesce(person.function_label, '')
  from public.people person
  join public.qhse_service_notes note
    on note.company_id = person.company_id
   and note.status = 'published'
   and note.scope = 'vessels'
   and note.author_person_id is distinct from person.id
  join public.qhse_service_note_target_vessels target
    on target.company_id = note.company_id
   and target.note_id = note.id
   and target.vessel_id = p_vessel_id
  where person.company_id = p_company_id
    and person.id = p_person_id
    and person.active
    and person.user_id is not null
    and (person.hired_on is null or person.hired_on <= coalesce(p_embarks_on, current_date))
    and (person.departed_on is null or person.departed_on > coalesce(p_embarks_on, current_date))
    and (
      exists (
        select 1
        from public.company_memberships membership
        where membership.company_id = p_company_id
          and membership.user_id = person.user_id
          and membership.active
      )
      or exists (
        select 1
        from public.profiles profile
        where profile.id = person.user_id
          and profile.active_company_id = p_company_id
      )
    )
  on conflict (note_id, user_id) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function private.sync_service_note_recipients_on_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.confirmation_status, '')) = 'cancelled'
    or new.ends_on < current_date then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.company_id is not distinct from new.company_id
    and old.vessel_id is not distinct from new.vessel_id
    and old.crew_person_id is not distinct from new.crew_person_id
    and old.captain_person_id is not distinct from new.captain_person_id
    and old.starts_on is not distinct from new.starts_on
    and old.ends_on is not distinct from new.ends_on
    and old.confirmation_status is not distinct from new.confirmation_status then
    return new;
  end if;

  perform private.add_active_vessel_service_note_recipient(
    new.company_id,
    new.vessel_id,
    new.crew_person_id,
    new.starts_on
  );

  if new.captain_person_id is distinct from new.crew_person_id then
    perform private.add_active_vessel_service_note_recipient(
      new.company_id,
      new.vessel_id,
      new.captain_person_id,
      new.starts_on
    );
  end if;

  return new;
end;
$$;

revoke all on function private.add_active_vessel_service_note_recipient(bigint, bigint, bigint, date)
  from public, anon, authenticated;
revoke all on function private.sync_service_note_recipients_on_assignment()
  from public, anon, authenticated;

drop trigger if exists planning_assignments_sync_service_note_recipients on public.planning_assignments;
create trigger planning_assignments_sync_service_note_recipients
  after insert or update on public.planning_assignments
  for each row execute function private.sync_service_note_recipients_on_assignment();

-- Bring existing current and future embarkations into the same invariant immediately.
with assigned_people as (
  select distinct
    assignment.company_id,
    assignment.vessel_id,
    assignment.crew_person_id as person_id,
    assignment.starts_on
  from public.planning_assignments assignment
  where assignment.ends_on >= current_date
    and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
  union
  select distinct
    assignment.company_id,
    assignment.vessel_id,
    assignment.captain_person_id,
    assignment.starts_on
  from public.planning_assignments assignment
  where assignment.captain_person_id is not null
    and assignment.ends_on >= current_date
    and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
)
select private.add_active_vessel_service_note_recipient(
  assigned.company_id,
  assigned.vessel_id,
  assigned.person_id,
  assigned.starts_on
)
from assigned_people assigned;

comment on function private.add_active_vessel_service_note_recipient(bigint, bigint, bigint, date) is
  'Adds one active account to every still-published service note targeted at the vessel, without duplicating recipients.';
comment on function private.sync_service_note_recipients_on_assignment() is
  'Keeps vessel service-note signature registers aligned when a current or future Planning assignment is inserted or changed.';
