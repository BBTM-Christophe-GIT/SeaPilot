-- Allow a vessel-targeted note to include explicitly selected people while
-- retaining its vessel classification in the service-note library.

create or replace function public.save_service_note_draft(
  p_note_id bigint,
  p_subject text,
  p_body text,
  p_authored_on date,
  p_scope text,
  p_vessel_ids bigint[],
  p_person_ids bigint[]
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
  normalized_vessel_ids bigint[] := coalesce(p_vessel_ids, '{}'::bigint[]);
  normalized_person_ids bigint[] := coalesce(p_person_ids, '{}'::bigint[]);
  target_count integer;
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id
  for update;

  if (select auth.uid()) is null
    or target_note.id is null
    or target_note.status <> 'draft'
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_DRAFT_FORBIDDEN.';
  end if;
  if p_scope not in ('all_accounts', 'vessels', 'people') then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_SCOPE_INVALID.';
  end if;

  select count(*) into target_count
  from unnest(normalized_vessel_ids) requested(id)
  join public.vessels vessel on vessel.id = requested.id
  where vessel.company_id = target_note.company_id;
  if target_count <> (select count(distinct id) from unnest(normalized_vessel_ids) requested(id)) then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_VESSEL_SCOPE_INVALID.';
  end if;

  select count(*) into target_count
  from unnest(normalized_person_ids) requested(id)
  join public.people person on person.id = requested.id
  where person.company_id = target_note.company_id;
  if target_count <> (select count(distinct id) from unnest(normalized_person_ids) requested(id)) then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_PEOPLE_SCOPE_INVALID.';
  end if;

  update public.qhse_service_notes
  set subject = trim(coalesce(p_subject, '')),
      body = coalesce(p_body, ''),
      authored_on = coalesce(p_authored_on, current_date),
      scope = p_scope,
      vessel_id = case
        when p_scope = 'vessels' and cardinality(normalized_vessel_ids) = 1 then normalized_vessel_ids[1]
        else null
      end,
      updated_at = clock_timestamp()
  where id = target_note.id;

  delete from public.qhse_service_note_target_vessels target
  where target.note_id = target_note.id;
  delete from public.qhse_service_note_target_people target
  where target.note_id = target_note.id;

  if p_scope = 'vessels' then
    insert into public.qhse_service_note_target_vessels (company_id, note_id, vessel_id)
    select target_note.company_id, target_note.id, requested.id
    from (select distinct unnest(normalized_vessel_ids) as id) requested;
  end if;

  if p_scope in ('vessels', 'people') then
    insert into public.qhse_service_note_target_people (company_id, note_id, person_id)
    select target_note.company_id, target_note.id, requested.id
    from (select distinct unnest(normalized_person_ids) as id) requested;
  end if;

  return target_note.id;
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
    and person.user_id is not null
    and person.hired_on is not null
    and person.hired_on <= target_note.authored_on
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

revoke all on function public.save_service_note_draft(bigint, text, text, date, text, bigint[], bigint[]) from public, anon;
revoke all on function public.service_note_resolved_recipients(bigint) from public, anon;
grant execute on function public.save_service_note_draft(bigint, text, text, date, text, bigint[], bigint[]) to authenticated;
grant execute on function public.service_note_resolved_recipients(bigint) to authenticated;

comment on function public.service_note_resolved_recipients(bigint) is
  'Resolves recipients as all accounts, named people, or the union of vessel planning and named additions.';
