-- Real Armement, Marin and Capitaine accounts; all fixtures are rolled back.
begin;

do $$
declare
  company bigint := (select id from public.companies where code = 'bbtm');
  office uuid := '83000000-0000-0000-0000-000000000101';
  sailor uuid := '83000000-0000-0000-0000-000000000102';
  captain uuid := '83000000-0000-0000-0000-000000000103';
  actor uuid;
  ship bigint;
  crew bigint;
  assignment bigint;
  grid_assignment bigint;
  draft public.planning_generic_crew_rows;
  function_signature regprocedure;
  denied boolean;
  saved_days integer;
  result jsonb;
begin
  foreach function_signature in array array[
    'public.save_planning_assignment_day_details(bigint,date,text,text,text)'::regprocedure,
    'public.save_planning_assignment_day_details_range(bigint,date,date,text,text,text)'::regprocedure,
    'public.save_planning_assignment_day_state(bigint,date,text,text)'::regprocedure,
    'public.save_planning_assignment_day_states(bigint,date,date,text,text)'::regprocedure,
    'public.apply_planning_grid_cells(jsonb)'::regprocedure,
    'public.planning_save_generic_crew_row(bigint,text,text,bigint,integer,jsonb)'::regprocedure
  ] loop
    if has_function_privilege('anon', function_signature, 'EXECUTE') then
      raise exception 'Anonymous Planning execution must be denied: %', function_signature;
    end if;
  end loop;
  if exists (select 1 from pg_proc where oid in (
    'public.save_planning_assignment_day_details(bigint,date,text,text,text)'::regprocedure,
    'public.apply_planning_grid_cells(jsonb)'::regprocedure
  ) and prosecdef) then
    raise exception 'Daily and grid functions must remain security invoker';
  end if;

  insert into auth.users(id, email) values
    (office, 'paternity-office@example.invalid'),
    (sailor, 'paternity-sailor@example.invalid'),
    (captain, 'paternity-captain@example.invalid');
  insert into public.profiles(id, email, display_name, active_company_id)
    select id, email, 'Paternity fixture', company from auth.users where id in (office, sailor, captain);
  insert into public.user_roles(user_id, company_id, role_key)
    values (office, company, 'armement'), (sailor, company, 'marin'), (captain, company, 'capitaine');
  insert into public.vessels(company_id, name, acronym, active)
    values (company, 'PATERNITY FIXTURE', 'PTF', true) returning id into ship;
  insert into public.people(company_id, user_id, first_name, last_name, function_label, active)
    values (company, sailor, 'Crew', 'PATERNITY', 'Matelot', true) returning id into crew;
  insert into public.people(company_id, user_id, first_name, last_name, function_label, active)
    values (company, captain, 'Captain', 'PATERNITY', 'Capitaine', true);
  insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on,
    assignment_role, status_label, watch_group, confirmation_status)
    values (company, ship, crew, current_date, current_date + 6,
      'Matelot', 'En Mer', 'Paternity fixture', 'confirmed') returning id into assignment;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', office::text, true);
  execute 'set local role authenticated';

  perform public.save_planning_assignment_day_state(assignment, current_date + 1, 'Congés Paternités', 'Naissance');
  saved_days := public.save_planning_assignment_day_states(assignment, current_date + 2, current_date + 3, 'Congés Paternités', 'Famille');
  if saved_days <> 2 then raise exception 'Grouped state update must include both dates'; end if;
  saved_days := public.save_planning_assignment_day_details_range(assignment, current_date + 4, current_date + 5,
    'Congés Paternités', '', 'Matelot');
  if saved_days <> 2 then raise exception 'Details range must include both dates'; end if;
  result := public.apply_planning_grid_cells(jsonb_build_array(jsonb_build_object(
    'assignmentId', assignment, 'personId', crew, 'vesselId', ship, 'workDate', current_date + 6,
    'watchGroup', 'Paternity fixture', 'status', 'Congés Paternités', 'note', 'Grille', 'functionLabel', 'Matelot'
  )));
  if (result->>'savedCells')::integer <> 1
    or (select count(*) from public.planning_days where slot365 = 'assignment:' || assignment
      and work_date between current_date + 1 and current_date + 6
      and sailor_status = 'Congés Paternités' and function_label = 'Matelot') <> 6
    or exists (select 1 from public.planning_days where slot365 = 'assignment:' || assignment and work_date = current_date)
    or (select status_label from public.planning_assignments where id = assignment) <> 'En Mer' then
    raise exception 'Day, grouped and grid overrides must persist only on the requested dates';
  end if;

  result := public.apply_planning_grid_cells(jsonb_build_array(
    jsonb_build_object('personId', crew, 'vesselId', ship, 'workDate', current_date + 8,
      'watchGroup', 'Paternity fixture', 'status', 'Congés Paternités', 'note', '', 'functionLabel', 'Matelot'),
    jsonb_build_object('personId', crew, 'vesselId', ship, 'workDate', current_date + 9,
      'watchGroup', 'Paternity fixture', 'status', 'Congés Paternités', 'note', '', 'functionLabel', 'Matelot')
  ));
  select id into grid_assignment from public.planning_assignments where company_id = company
    and crew_person_id = crew and vessel_id = ship and starts_on = current_date + 8
    and ends_on = current_date + 9 and status_label = 'Congés Paternités';
  if grid_assignment is null or (result->>'savedCells')::integer <> 2
    or (result->>'createdAssignments')::integer <> 1 then
    raise exception 'Painting adjacent paternity cells must create a persisted assignment';
  end if;

  draft := public.planning_save_generic_crew_row(ship, 'Paternity generic', 'Matelot', null, null,
    jsonb_build_array(jsonb_build_object('id', 'paternity', 'startsOn', current_date + 11,
      'endsOn', current_date + 12, 'status', 'Congés Paternités', 'comments', 'Famille')));
  if draft.periods->0->>'status' <> 'Congés Paternités' then
    raise exception 'Generic paternity period must persist';
  end if;
  perform public.planning_resolve_generic_crew_row(draft.id, draft.revision, crew, date_trunc('month', current_date)::date);
  if not exists (select 1 from public.planning_assignments where company_id = company
    and crew_person_id = crew and vessel_id = ship and starts_on = current_date + 11
    and ends_on = current_date + 12 and status_label = 'Congés Paternités' and comments = 'Famille') then
    raise exception 'Resolving a generic row must retain its paternity period';
  end if;

  denied := false;
  begin
    perform public.save_planning_assignment_day_state(assignment, current_date, 'Statut inconnu', '');
  exception when invalid_parameter_value then denied := true;
  end;
  if not denied then raise exception 'Unknown statuses must remain rejected'; end if;
  execute 'reset role';

  foreach actor in array array[sailor, captain] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    execute 'set local role authenticated';
    denied := false;
    begin
      perform public.save_planning_assignment_day_state(assignment, current_date, 'Congés Paternités', '');
    exception when insufficient_privilege or foreign_key_violation then denied := true;
    end;
    if not denied then raise exception 'Marin/Capitaine daily state writes must remain denied'; end if;
    denied := false;
    begin
      perform public.save_planning_assignment_day_details(assignment, current_date, 'Congés Paternités', '', 'Matelot');
    exception when insufficient_privilege or foreign_key_violation then denied := true;
    end;
    if not denied then raise exception 'Marin/Capitaine daily details writes must remain denied'; end if;
    denied := false;
    begin
      perform public.save_planning_assignment_day_states(assignment, current_date, current_date + 1, 'Congés Paternités', '');
    exception when insufficient_privilege or foreign_key_violation then denied := true;
    end;
    if not denied then raise exception 'Marin/Capitaine grouped writes must remain denied'; end if;
    denied := false;
    begin
      perform public.save_planning_assignment_day_details_range(assignment, current_date, current_date + 1,
        'Congés Paternités', '', 'Matelot');
    exception when insufficient_privilege or foreign_key_violation then denied := true;
    end;
    if not denied then raise exception 'Marin/Capitaine details range writes must remain denied'; end if;
    denied := false;
    begin
      perform public.apply_planning_grid_cells(jsonb_build_array(jsonb_build_object(
        'assignmentId', assignment, 'personId', crew, 'vesselId', ship, 'workDate', current_date,
        'watchGroup', 'Paternity fixture', 'status', 'Congés Paternités', 'note', '', 'functionLabel', 'Matelot'
      )));
    exception when insufficient_privilege or foreign_key_violation then denied := true;
    end;
    if not denied then raise exception 'Marin/Capitaine grid writes must remain denied'; end if;
    denied := false;
    begin
      perform public.planning_save_generic_crew_row(ship, 'Paternity forbidden', 'Matelot', null, null,
        jsonb_build_array(jsonb_build_object('id', 'paternity', 'startsOn', current_date + 14,
          'endsOn', current_date + 15, 'status', 'Congés Paternités')));
    exception when insufficient_privilege then denied := true;
    end;
    if not denied then raise exception 'Marin/Capitaine generic writes must remain denied'; end if;
    execute 'reset role';
  end loop;
  if exists (select 1 from public.planning_days where slot365 = 'assignment:' || assignment and work_date = current_date) then
    raise exception 'Forbidden profile writes must not mutate Planning';
  end if;
end;
$$;

rollback;
select 'planning_paternity_status_test: passed (fixtures rolled back)' as result;
