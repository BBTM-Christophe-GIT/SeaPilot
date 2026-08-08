-- Expose the HR metadata required by the working-time personnel catalogue.
-- Management may browse former personnel, while editable scope remains limited
-- to active people and all mutation guards remain unchanged.

create or replace function public.working_time_entry_context(
  p_starts_on date,
  p_ends_on date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_person_id bigint := public.current_person_id();
  can_browse_company boolean;
  editable_people jsonb;
  readable_people jsonb;
begin
  if (select auth.uid()) is null or target_company_id is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_COMPANY_REQUIRED.';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PERIOD_INVALID.';
  end if;

  can_browse_company := public.has_company_role(
    target_company_id,
    array['admin', 'direction', 'armement']
  );
  if actor_person_id is null and not can_browse_company then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', person.id,
    'first_name', person.first_name,
    'last_name', person.last_name,
    'function_label', person.function_label,
    'grade_label', person.grade_label,
    'departed_on', person.departed_on,
    'active', person.active,
    'is_self', person.id = actor_person_id
  ) order by person.id <> actor_person_id, person.last_name, person.first_name), '[]'::jsonb)
  into readable_people
  from public.people person
  where person.company_id = target_company_id
    and (
      can_browse_company
      or (
        person.active
        and (
          person.id = actor_person_id
          or public.working_time_captain_can_access_period(
            target_company_id, person.id, p_starts_on, p_ends_on
          )
        )
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', person.id,
    'first_name', person.first_name,
    'last_name', person.last_name,
    'function_label', person.function_label,
    'grade_label', person.grade_label,
    'departed_on', person.departed_on,
    'active', person.active,
    'is_self', person.id = actor_person_id
  ) order by person.id <> actor_person_id, person.last_name, person.first_name), '[]'::jsonb)
  into editable_people
  from public.people person
  where actor_person_id is not null
    and person.company_id = target_company_id
    and person.active
    and (
      public.working_time_can_manage_entry_scope(target_company_id)
      or (
        person.id = actor_person_id
        and public.has_company_role(target_company_id, array['marin', 'capitaine'])
      )
      or public.working_time_captain_can_access_period(
        target_company_id, person.id, p_starts_on, p_ends_on
      )
    );

  return jsonb_build_object(
    'current_person_id', actor_person_id,
    'readable_people', readable_people,
    'editable_people', editable_people
  );
end;
$$;

comment on function public.working_time_entry_context(date, date) is
  'Returns readable active/former HR catalogue metadata and the stricter active editable scope for working-time entry.';
