-- Real authenticated profiles; all fixtures and mutations are rolled back.
begin;
do $$
declare
  company bigint := (select id from public.companies where code = 'bbtm');
  office uuid := '82000000-0000-0000-0000-000000000101';
  sailor uuid := '82000000-0000-0000-0000-000000000102';
  captain uuid := '82000000-0000-0000-0000-000000000103';
  actor uuid;
  ship bigint;
  crew bigint;
  assignment bigint;
  matrix bigint;
  denied boolean;
  board jsonb;
begin
  if has_function_privilege('anon', 'public.save_planning_assignment_day_details(bigint,date,text,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.save_planning_assignment_day_details_range(bigint,date,date,text,text,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.planning_assignment_function_on_date(bigint,date)', 'EXECUTE') then
    raise exception 'anonymous execution must be denied';
  end if;
  insert into auth.users(id, email) values
    (office, 'daily-function-office@example.invalid'),
    (sailor, 'daily-function-sailor@example.invalid'),
    (captain, 'daily-function-captain@example.invalid');
  insert into public.profiles(id, email, display_name, active_company_id)
    select id, email, 'Daily function fixture', company from auth.users where id in (office, sailor, captain);
  insert into public.user_roles(user_id, company_id, role_key)
    values (office, company, 'armement'), (sailor, company, 'marin'), (captain, company, 'capitaine');
  insert into public.vessels(company_id, name, acronym, active)
    values (company, 'DAILY FUNCTION FIXTURE', 'DFF', true) returning id into ship;
  insert into public.people(company_id, user_id, first_name, last_name, function_label, active)
    values (company, sailor, 'Crew', 'DAILY FUNCTION', 'Capitaine', true) returning id into crew;
  insert into public.people(company_id, user_id, first_name, last_name, function_label, active)
    values (company, captain, 'Captain', 'DAILY FUNCTION', 'Capitaine', true);
  insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, assignment_role, status_label, watch_group, confirmation_status)
    values (company, ship, crew, current_date, current_date + 6, 'Capitaine', 'En Mer', 'Daily function', 'confirmed') returning id into assignment;
  insert into public.planning_manning_matrices(company_id, vessel_id, name, effective_from, status)
    values (company, ship, 'Daily function staffing', current_date, 'active') returning id into matrix;
  insert into public.planning_manning_requirements(company_id, matrix_id, function_label, minimum_count, target_count)
    values (company, matrix, 'Capitaine', 1, 1), (company, matrix, '2nd Capitaine', 1, 1);

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', office::text, true);
  execute 'set local role authenticated';
  perform public.save_planning_assignment_day_details(assignment, current_date + 1, 'En Mer', '', '2nd Capitaine');
  if public.planning_assignment_function_on_date(assignment, current_date + 1) <> '2nd Capitaine'
    or public.planning_assignment_function_on_date(assignment, current_date) <> 'Capitaine'
    or public.planning_assignment_function_on_date(assignment, current_date + 2) <> 'Capitaine' then
    raise exception 'single-day function must not leak into adjacent dates';
  end if;
  if (select function_label from public.people where id = crew) <> 'Capitaine'
    or (select assignment_role from public.planning_assignments where id = assignment) <> 'Capitaine' then
    raise exception 'RH and assignment function must remain unchanged';
  end if;
  board := public.planning_staffing_board_status(ship, 'Daily function', current_date + 1);
  if board->'composition'->0->>'planning_function_label' <> '2nd Capitaine'
    or board->'composition'->0->>'hr_function_label' <> 'Capitaine' then
    raise exception 'staffing must use the exercised function separately from RH: %', board;
  end if;
  if not exists (select 1 from jsonb_array_elements(board->'discrepancies') gap where gap->>'type' = 'captain_missing')
    or exists (select 1 from jsonb_array_elements(board->'discrepancies') gap where gap->>'type' = 'minimum_staffing' and gap->>'function_label' = '2nd Capitaine') then
    raise exception 'staffing counts must use the temporary role, including captain eligibility: %', board;
  end if;
  perform public.save_planning_assignment_day_state(assignment, current_date + 1, 'Repos', 'Escale');
  perform public.save_planning_assignment_day_note(assignment, current_date + 1, 'Commentaire');
  if not exists (select 1 from public.planning_days where slot365 = 'assignment:' || assignment
    and work_date = current_date + 1 and function_label = '2nd Capitaine' and sailor_status = 'Repos' and comments = 'Commentaire') then
    raise exception 'legacy status/comment updates must preserve the daily function';
  end if;
  perform public.save_planning_assignment_day_states(assignment, current_date, current_date + 2, 'En Mer', '');
  if public.planning_assignment_function_on_date(assignment, current_date + 1) <> '2nd Capitaine' then
    raise exception 'legacy batch must preserve distinct daily functions';
  end if;
  perform public.save_planning_assignment_day_details_range(assignment, current_date + 2, current_date + 4, 'En Mer', '', '2nd Capitaine');
  if (select count(*) from public.planning_days where slot365 = 'assignment:' || assignment and function_label = '2nd Capitaine') <> 4
    or public.planning_assignment_function_on_date(assignment, current_date + 5) <> 'Capitaine' then
    raise exception 'range function must apply to its inclusive dates only';
  end if;
  denied := false;
  begin
    perform public.save_planning_assignment_day_details_range(assignment, current_date + 4, current_date + 7, 'En Mer', '', 'Matelot');
  exception when foreign_key_violation then denied := true;
  end;
  if not denied or public.planning_assignment_function_on_date(assignment, current_date + 4) <> '2nd Capitaine' then
    raise exception 'an invalid range must fail atomically';
  end if;
  denied := false;
  begin
    perform public.save_planning_assignment_day_details(assignment, current_date + 1, 'En Mer', '', '  ');
  exception when invalid_parameter_value then denied := true;
  end;
  if not denied then raise exception 'blank explicit function must fail'; end if;
  perform public.apply_planning_grid_cells(jsonb_build_array(jsonb_build_object(
    'assignmentId', assignment, 'personId', crew, 'vesselId', ship, 'workDate', current_date + 5,
    'watchGroup', 'Daily function', 'status', 'En Mer', 'note', '', 'functionLabel', '2nd Capitaine'
  )));
  if public.planning_assignment_function_on_date(assignment, current_date + 5) <> '2nd Capitaine' then
    raise exception 'grid writes must retain a role-only override';
  end if;
  perform public.save_planning_assignment_day_details(assignment, current_date + 1, 'En Mer', '', 'Capitaine');
  if exists(select 1 from public.planning_days where slot365 = 'assignment:' || assignment and work_date = current_date + 1) then
    raise exception 'returning to the base function must remove a redundant daily override';
  end if;
  execute 'reset role';
  foreach actor in array array[sailor, captain] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    execute 'set local role authenticated';
    denied := false;
    begin
      perform public.save_planning_assignment_day_details(assignment, current_date + 1, 'En Mer', '', 'Matelot');
    exception when insufficient_privilege or foreign_key_violation then denied := true;
    end;
    if not denied then raise exception 'Marin/Capitaine daily writes must remain denied'; end if;
    denied := false;
    begin
      perform public.save_planning_assignment_day_details_range(assignment, current_date, current_date + 1, 'En Mer', '', 'Matelot');
    exception when insufficient_privilege or foreign_key_violation then denied := true;
    end;
    if not denied then raise exception 'Marin/Capitaine range writes must remain denied'; end if;
    execute 'reset role';
  end loop;
end;
$$;
rollback;
select 'planning_daily_functions_test: passed (fixtures rolled back)' as result;
