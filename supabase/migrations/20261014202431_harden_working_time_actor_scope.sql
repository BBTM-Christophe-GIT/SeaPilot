-- An authenticated company member without a linked HR person produces NULL in
-- owner comparisons. Require explicit true authorization before any read/write.
-- Preserve deployed roles, grant lists, calendars, approval rules and calculations.

CREATE OR REPLACE FUNCTION public.working_time_can_manage_signature_person(target_company_id bigint, target_person_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(auth.uid() is not null
    and public.user_belongs_to_company(target_company_id)
    and exists (
      select 1
      from public.people person
      where person.id = target_person_id
        and person.company_id = target_company_id
        and person.active
    )
    and (
      target_person_id = public.current_person_id()
      or public.has_company_role(target_company_id, array['admin', 'armement'])
    ), false);
$function$;

CREATE OR REPLACE FUNCTION public.working_time_day_context(p_person_id bigint, p_local_work_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_person public.people%rowtype;
  target_assignment public.planning_assignments%rowtype;
  effective_status text;
  candidates jsonb := '[]'::jsonb;
  preferred_approver_id bigint;
  target_register_id bigint;
  actor_can_edit boolean;
begin
  select * into target_person from public.people person where person.id = p_person_id;
  if (select auth.uid()) is null or target_person.id is null or p_local_work_date is null
    or not public.user_belongs_to_company(target_person.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: contexte planning.';
  end if;
  if not coalesce((
    public.current_person_id() = target_person.id
    or public.has_company_role(target_person.company_id, array['admin', 'direction', 'armement'])
    or public.working_time_captain_can_access_period(target_person.company_id, target_person.id, p_local_work_date, p_local_work_date)
  ), false) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: contexte planning.';
  end if;

  -- Bind the daily permission to the unique monthly register used by the entry board.
  -- An old weekly register must not authorize a different monthly register.
  select register.id into target_register_id
  from public.working_time_registers register
  where register.company_id = target_person.company_id
    and register.person_id = target_person.id
    and register.period_kind = 'monthly'
    and register.period_start = date_trunc('month', p_local_work_date)::date
    and p_local_work_date between register.period_start and register.period_end
    and register.discarded_at is null;
  actor_can_edit := coalesce(public.working_time_actor_can_edit_day(target_register_id, p_local_work_date), false);

  select assignment.* into target_assignment
  from public.planning_assignments assignment
  where assignment.company_id = target_person.company_id
    and p_local_work_date between assignment.starts_on and assignment.ends_on
    and coalesce(assignment.confirmation_status, '') <> 'cancelled'
    and assignment.crew_person_id = target_person.id
    and public.planning_status_is_working(public.planning_effective_person_status(
      assignment.company_id, target_person.id, p_local_work_date, assignment.vessel_id, assignment.status_label
    ))
  order by (assignment.confirmation_status = 'confirmed') desc, assignment.id desc
  limit 1;

  if target_assignment.id is null then
    return jsonb_build_object(
      'register_id', target_register_id, 'actor_can_edit_day', actor_can_edit,
      'assignment_id', null, 'vessel_id', null, 'watch_group', null,
      'status_label', null, 'approver_person_id', null, 'captain_candidates', '[]'::jsonb
    );
  end if;
  effective_status := public.planning_effective_person_status(
    target_assignment.company_id, target_person.id, p_local_work_date,
    target_assignment.vessel_id, target_assignment.status_label
  );

  if public.planning_assignment_is_captain(target_assignment.id, p_local_work_date) then
    preferred_approver_id := target_person.id;
    candidates := jsonb_build_array(jsonb_build_object(
      'person_id', target_person.id,
      'first_name', target_person.first_name,
      'last_name', target_person.last_name,
      'name', trim(target_person.first_name || ' ' || target_person.last_name)
    ));
  else
    with eligible as (
      select distinct candidate.id, candidate.first_name, candidate.last_name
      from public.people candidate
      join public.planning_assignments captain_assignment
        on captain_assignment.company_id = candidate.company_id
       and captain_assignment.crew_person_id = candidate.id
       and captain_assignment.vessel_id = target_assignment.vessel_id
       and lower(trim(coalesce(captain_assignment.watch_group, '')))
         = lower(trim(coalesce(target_assignment.watch_group, '')))
       and p_local_work_date between captain_assignment.starts_on and captain_assignment.ends_on
       and coalesce(captain_assignment.confirmation_status, '') = 'confirmed'
      where candidate.company_id = target_person.company_id
        and public.planning_assignment_is_captain(captain_assignment.id, p_local_work_date)
        and candidate.active
        and candidate.user_id is not null
        and public.planning_status_is_working(public.planning_effective_person_status(
          captain_assignment.company_id, candidate.id, p_local_work_date,
          captain_assignment.vessel_id, captain_assignment.status_label
        ))
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'person_id', eligible.id,
        'first_name', eligible.first_name,
        'last_name', eligible.last_name,
        'name', trim(eligible.first_name || ' ' || eligible.last_name)
      ) order by eligible.last_name, eligible.first_name), '[]'::jsonb),
      case when count(*) = 1 then min(eligible.id) else null end
    into candidates, preferred_approver_id
    from eligible;
  end if;

  return jsonb_build_object(
    'register_id', target_register_id, 'actor_can_edit_day', actor_can_edit,
    'assignment_id', target_assignment.id,
    'vessel_id', target_assignment.vessel_id,
    'watch_group', nullif(trim(coalesce(target_assignment.watch_group, '')), ''),
    'status_label', effective_status,
    'approver_person_id', preferred_approver_id,
    'captain_candidates', candidates
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.discard_working_time_draft(p_register_id bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  target_register public.working_time_registers%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: authentification requise.';
  end if;

  select * into target_register
  from public.working_time_registers register
  where register.id = p_register_id
  for update;

  if target_register.id is null
    or not public.user_belongs_to_company(target_register.company_id) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: registre.';
  end if;

  if target_register.status <> 'draft'
    or exists (
      select 1
      from public.working_time_validations validation
      where validation.register_id = target_register.id
    )
    or exists (
      select 1
      from public.working_time_day_approvals approval
      where approval.register_id = target_register.id
    )
    or exists (
      select 1
      from public.working_time_intervals work_interval
      where work_interval.register_id = target_register.id
    )
    or exists (
      select 1
      from public.working_time_day_comments day_comment
      where day_comment.register_id = target_register.id
    ) then
    raise exception using errcode = '55000', message = 'WORKING_TIME_DRAFT_DISCARD_FORBIDDEN.';
  end if;

  if not coalesce((
    public.working_time_can_manage_entry_scope(target_register.company_id)
    or target_register.person_id = public.current_person_id()
    or public.working_time_captain_can_access_period(
      target_register.company_id,
      target_register.person_id,
      target_register.period_start,
      target_register.period_end
    )
  ), false) then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PERMISSION_DENIED: suppression du brouillon.';
  end if;

  update public.working_time_registers
  set discarded_at = clock_timestamp(),
      discarded_by = (select auth.uid()),
      discard_reason = 'Brouillon vide abandonne',
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = target_register.id;

  return target_register.id;
end;
$function$;

notify pgrst, 'reload schema';
