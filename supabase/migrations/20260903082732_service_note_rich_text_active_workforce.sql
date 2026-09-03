-- Return every current employee who has an active SeaPilot account.
-- Former employees, unlinked HR records and the note author stay excluded.

create or replace function public.service_note_targeting_options(
  p_note_id bigint,
  p_on_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
  target_date date;
  result jsonb;
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id;

  if (select auth.uid()) is null
    or target_note.id is null
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_TARGETING_FORBIDDEN.';
  end if;

  target_date := coalesce(p_on_date, target_note.authored_on, current_date);

  with planned_people as (
    select assignment.crew_person_id as person_id, assignment.vessel_id
    from public.planning_assignments assignment
    where assignment.company_id = target_note.company_id
      and assignment.starts_on <= target_date
      and assignment.ends_on >= target_date
      and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
    union
    select assignment.captain_person_id, assignment.vessel_id
    from public.planning_assignments assignment
    where assignment.company_id = target_note.company_id
      and assignment.captain_person_id is not null
      and assignment.starts_on <= target_date
      and assignment.ends_on >= target_date
      and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
    union
    select period.person_id, period.vessel_id
    from public.planning_periods period
    where period.company_id = target_note.company_id
      and period.person_id is not null
      and period.vessel_id is not null
      and period.starts_on <= target_date
      and period.ends_on >= target_date
    union
    select day.person_id, day.vessel_id
    from public.planning_days day
    where day.company_id = target_note.company_id
      and day.person_id is not null
      and day.vessel_id is not null
      and day.work_date = target_date
  ), eligible_people as (
    select person.*,
      true as has_account,
      false as is_author
    from public.people person
    where person.company_id = target_note.company_id
      and person.active
      and person.user_id is not null
      and (person.hired_on is null or person.hired_on <= target_date)
      and (person.departed_on is null or person.departed_on > target_date)
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
  )
  select jsonb_build_object(
    'date', target_date,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', person.id,
        'first_name', person.first_name,
        'last_name', person.last_name,
        'function_label', coalesce(person.function_label, ''),
        'hired_on', person.hired_on,
        'departed_on', person.departed_on,
        'has_account', person.has_account,
        'is_author', person.is_author,
        'vessel_ids', coalesce((
          select jsonb_agg(planned.vessel_id order by planned.vessel_id)
          from planned_people planned
          where planned.person_id = person.id
        ), '[]'::jsonb)
      ) order by person.last_name, person.first_name)
      from eligible_people person
    ), '[]'::jsonb),
    'vessels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', vessel.id,
        'name', coalesce(nullif(trim(vessel.name), ''), vessel.acronym, format('Navire %s', vessel.id)),
        'recipient_count', (
          select count(distinct person.id)
          from eligible_people person
          join planned_people planned on planned.person_id = person.id
          where planned.vessel_id = vessel.id
        )
      ) order by coalesce(nullif(trim(vessel.name), ''), vessel.acronym, format('Navire %s', vessel.id)))
      from public.vessels vessel
      where vessel.company_id = target_note.company_id
        and vessel.active
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

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
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id;

  if (select auth.uid()) is null
    or target_note.id is null
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_TARGETING_FORBIDDEN.';
  end if;

  return query
  with planned_people as (
    select assignment.crew_person_id as person_id, assignment.vessel_id
    from public.planning_assignments assignment
    where assignment.company_id = target_note.company_id
      and assignment.starts_on <= target_note.authored_on
      and assignment.ends_on >= target_note.authored_on
      and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
    union
    select assignment.captain_person_id, assignment.vessel_id
    from public.planning_assignments assignment
    where assignment.company_id = target_note.company_id
      and assignment.captain_person_id is not null
      and assignment.starts_on <= target_note.authored_on
      and assignment.ends_on >= target_note.authored_on
      and lower(coalesce(assignment.confirmation_status, '')) <> 'cancelled'
    union
    select period.person_id, period.vessel_id
    from public.planning_periods period
    where period.company_id = target_note.company_id
      and period.person_id is not null
      and period.vessel_id is not null
      and period.starts_on <= target_note.authored_on
      and period.ends_on >= target_note.authored_on
    union
    select day.person_id, day.vessel_id
    from public.planning_days day
    where day.company_id = target_note.company_id
      and day.person_id is not null
      and day.vessel_id is not null
      and day.work_date = target_note.authored_on
  )
  select distinct person.id, person.user_id, person.first_name, person.last_name,
         coalesce(person.function_label, '')
  from public.people person
  where person.company_id = target_note.company_id
    and person.active
    and person.user_id is not null
    and (person.hired_on is null or person.hired_on <= target_note.authored_on)
    and (person.departed_on is null or person.departed_on > target_note.authored_on)
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
      target_note.scope = 'all_accounts'
      or (
        target_note.scope = 'people'
        and exists (
          select 1 from public.qhse_service_note_target_people target
          where target.note_id = target_note.id and target.person_id = person.id
        )
      )
      or (
        target_note.scope = 'vessels'
        and (
          exists (
            select 1
            from planned_people planned
            join public.qhse_service_note_target_vessels target
              on target.note_id = target_note.id and target.vessel_id = planned.vessel_id
            where planned.person_id = person.id
          )
          or exists (
            select 1 from public.qhse_service_note_target_people target
            where target.note_id = target_note.id and target.person_id = person.id
          )
        )
      )
    )
  order by person.last_name, person.first_name;
end;
$$;

revoke all on function public.service_note_targeting_options(bigint, date) from public, anon;
revoke all on function public.service_note_resolved_recipients(bigint) from public, anon;
grant execute on function public.service_note_targeting_options(bigint, date) to authenticated;
grant execute on function public.service_note_resolved_recipients(bigint) to authenticated;

comment on function public.service_note_targeting_options(bigint, date) is
  'Returns every current employee with an active SeaPilot account, excluding the author, plus planning vessel assignments.';
comment on function public.service_note_resolved_recipients(bigint) is
  'Resolves only active account holders as service-note recipients, excluding the author.';
