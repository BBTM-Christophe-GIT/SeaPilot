-- Run against the migrated database as postgres. All fixtures and writes roll
-- back; no pgTAP extension or persistent helper function is required.
begin;
do $$
declare
  company bigint := (select id from public.companies where code = 'bbtm');
  office uuid := '81000000-0000-0000-0000-000000000101';
  sailor uuid := '81000000-0000-0000-0000-000000000102';
  captain uuid := '81000000-0000-0000-0000-000000000103';
  actor uuid;
  ship bigint;
  crew bigint;
  master bigint;
  outsider bigint;
  assignment bigint;
  period bigint;
  initial_assignment jsonb;
  first_read jsonb;
  next_read jsonb;
  expected_people bigint[];
  expected_docs bigint[];
  actual_ids bigint[];
  expected_periods jsonb;
  saved integer;
  denied boolean;
begin
  if has_function_privilege('anon', 'public.read_planning_periods(text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.save_planning_assignment_day_states(bigint,date,date,text,text)', 'EXECUTE') then
    raise exception 'anonymous RPC execution must remain denied';
  end if;
  insert into auth.users(id, email) values
    (office, 'planning-perf-office@example.invalid'),
    (sailor, 'planning-perf-sailor@example.invalid'),
    (captain, 'planning-perf-captain@example.invalid');
  insert into public.profiles(id, email, display_name, active_company_id)
    select id, email, 'Planning performance fixture', company
    from auth.users where id in (office, sailor, captain);
  insert into public.user_roles(user_id, company_id, role_key)
    values (office, company, 'armement'), (sailor, company, 'marin'), (captain, company, 'capitaine');
  insert into public.vessels(company_id, name, acronym, active)
    values (company, 'PLANNING PERFORMANCE FIXTURE', 'PPF', true) returning id into ship;
  insert into public.people(company_id, user_id, first_name, last_name, function_label, active)
    values (company, sailor, 'Crew', 'PERFORMANCE FIXTURE', 'Matelot', true) returning id into crew;
  insert into public.people(company_id, user_id, first_name, last_name, function_label, active)
    values (company, captain, 'Captain', 'PERFORMANCE FIXTURE', 'Capitaine', true) returning id into master;
  insert into public.people(company_id, first_name, last_name, active)
    values (company, 'Outside watch', 'PERFORMANCE FIXTURE', true) returning id into outsider;
  insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, watch_group)
    values (company, ship, crew, current_date, current_date + 29, 'Performance') returning id into assignment;
  insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, watch_group)
    values (company, ship, master, current_date, current_date + 29, 'Performance');
  insert into public.hr_documents(company_id, person_id, title, category_key)
    values (company, crew, 'Performance crew', 'administrative'),
      (company, master, 'Performance captain', 'administrative'),
      (company, outsider, 'Performance other watch', 'administrative');
  insert into public.planning_periods(company_id, person_id, vessel_id, crew_name, starts_on, ends_on)
    values (company, crew, ship, 'PERFORMANCE FIXTURE', current_date - 365, current_date - 360)
    returning id into period;
  select to_jsonb(a) into initial_assignment from public.planning_assignments a where id = assignment;

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  -- Compare the complete result with the previous predicates for each real
  -- role, including the captain's correlated watch membership check.
  foreach actor in array array[office, sailor, captain] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    select array_agg(id order by id) into expected_people from public.people
      where company_id = public.current_planning_company_id() and (
        user_id = auth.uid() or public.has_any_role(array['admin','direction','armement'])
        or (public.has_role('capitaine') and public.captain_shares_watch_with_person(company_id, id)));
    select array_agg(id order by id) into expected_docs from public.hr_documents
      where company_id = public.current_planning_company_id() and (
        person_id = public.current_person_id() or public.has_any_role(array['admin','direction','armement'])
        or (public.has_role('capitaine') and public.captain_shares_watch_with_person(company_id, person_id)));
    execute 'set local role authenticated';
    select array_agg(id order by id) into actual_ids from public.people;
    if actual_ids is distinct from expected_people then raise exception 'people RLS changed for %', actor; end if;
    if actor = sailor and actual_ids <> array[crew] then raise exception 'Marin must see only their own HR profile'; end if;
    if actor = captain and (not (crew = any(actual_ids)) or outsider = any(actual_ids)) then
      raise exception 'Capitaine watch scope changed';
    end if;
    select array_agg(id order by id) into actual_ids from public.hr_documents;
    if actual_ids is distinct from expected_docs then raise exception 'HR document RLS changed for %', actor; end if;
    select coalesce(jsonb_agg(to_jsonb(p) order by p.starts_on, p.crew_name, p.id), '[]'::jsonb)
      into expected_periods from (
        select id, person_id, vessel_id, crew_name, vessel_name, manual_vessel_name, watch_group,
          function_label, sailor_status, starts_on, ends_on, year_number, comments,
          slot365_source_id, slot365_source_key, source_label from public.planning_periods
      ) p;
    first_read := public.read_planning_periods();
    if first_read->'periods' is distinct from expected_periods then raise exception 'RPC changed visible periods'; end if;
    next_read := public.read_planning_periods(first_read->>'revision');
    if next_read->'periods' <> 'null'::jsonb or next_read->>'revision' <> first_read->>'revision' then
      raise exception 'unchanged revision should suppress the repeated payload';
    end if;
    if actor <> office then
      denied := false;
      begin
        perform public.save_planning_assignment_day_states(assignment, current_date, current_date + 29, 'Repos', 'Forbidden');
      exception when insufficient_privilege or foreign_key_violation then denied := true;
      end;
      if not denied then raise exception 'Marin/Capitaine batch editing must remain denied'; end if;
    end if;
    execute 'reset role';
  end loop;

  perform set_config('request.jwt.claim.sub', office::text, true);
  execute 'set local role authenticated';
  -- A different authenticated identity must invalidate the revision even when
  -- its visible periods happen to be identical.
  next_read := public.read_planning_periods(first_read->>'revision');
  if next_read->'periods' = 'null'::jsonb then raise exception 'identity change must invalidate the cache'; end if;
  first_read := next_read;
  update public.planning_periods set comments = 'Cache invalidation fixture' where id = period;
  next_read := public.read_planning_periods(first_read->>'revision');
  if next_read->'periods' = 'null'::jsonb then raise exception 'period update must invalidate the cache'; end if;
  first_read := next_read;
  delete from public.planning_periods where id = period;
  next_read := public.read_planning_periods(first_read->>'revision');
  if next_read->'periods' = 'null'::jsonb then raise exception 'period deletion must invalidate the cache'; end if;
  saved := public.save_planning_assignment_day_states(assignment, current_date, current_date + 29, 'Repos', 'Escale');
  if saved <> 30 or (select count(*) from public.planning_days where slot365 = 'assignment:' || assignment
      and sailor_status = 'Repos' and comments = 'Escale') <> 30 then raise exception '30-day batch differs from daily semantics'; end if;
  if (select to_jsonb(a) from public.planning_assignments a where id = assignment) <> initial_assignment then
    raise exception 'batch must not modify or split the original assignment';
  end if;
  denied := false;
  begin
    perform public.save_planning_assignment_day_states(assignment, current_date, current_date + 30, 'A Terre', 'Outside');
  exception when foreign_key_violation then denied := true;
  end;
  if not denied or (select count(*) from public.planning_days where slot365 = 'assignment:' || assignment
      and sailor_status = 'Repos') <> 30 then raise exception 'out-of-range batch must fail atomically'; end if;
  perform public.save_planning_assignment_day_states(assignment, current_date, current_date + 29, 'En Mer', '');
  if exists (select 1 from public.planning_days where slot365 = 'assignment:' || assignment) then
    raise exception 'restoring the assignment default must remove daily overrides';
  end if;
  execute 'reset role';
end;
$$;
rollback;
select 'Planning performance RPC/RLS fixtures passed; all fixture data rolled back' as result;
