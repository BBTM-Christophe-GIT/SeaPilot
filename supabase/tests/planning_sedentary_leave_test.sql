-- Independent Auth identities exercise the same rights checks as the API.
begin;

do $test$
declare
  company bigint;
  foreign_company bigint;
  foreign_person bigint;
  office_person bigint;
  new_office_person bigint;
  person bigint;
  company_roles text[] := array['admin', 'direction', 'armement', 'capitaine', 'marin', 'marin'];
  actors uuid[] := '{}';
  people_ids bigint[] := '{}';
  actor uuid;
  context jsonb;
  period jsonb;
  saved_id bigint;
  weekdays smallint[] := array[1, 3, 5];
begin
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies(code, name)
  values ('sedentary-leave-' || gen_random_uuid(), 'Sédentaire leave foreign fixture') returning id into foreign_company;
  insert into public.people(company_id, first_name, last_name, role_label, active)
  values (foreign_company, 'Foreign', 'SEDENTARY LEAVE FIXTURE', 'Sédentaire', true) returning id into foreign_person;
  insert into public.people(company_id, first_name, last_name, role_label, active)
  values (company, 'New', 'SEDENTARY LEAVE FIXTURE', 'Sedentaire', true) returning id into new_office_person;
  update public.role_module_permissions set is_visible = true where module_key = 'planning';

  for i in 1..cardinality(company_roles) loop
    actor := gen_random_uuid();
    insert into auth.users(id, email) values (actor, 'sedentary-leave-' || i || '@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
    values (actor, 'sedentary-leave-' || i || '@example.invalid', 'Leave fixture ' || i, company);
    insert into public.company_memberships(company_id, user_id, active) values (company, actor, true)
    on conflict(company_id, user_id) do update set active = true;
    insert into public.user_roles(user_id, company_id, role_key) values (actor, company, company_roles[i]);
    insert into public.people(company_id, user_id, first_name, last_name, role_label, active)
    values (company, actor, 'Sedentary leave', 'FIXTURE ' || i,
      case when i = 6 then 'Sédentaire' else 'Navigant' end, true) returning id into person;
    actors := array_append(actors, actor);
    people_ids := array_append(people_ids, person);
  end loop;

  office_person := people_ids[6];
  insert into public.planning_leave_counter_people(company_id, person_id, request_balance_kind)
  values (company, office_person, 'leave_rtt');
  insert into public.planning_leave_counter_periods(company_id, person_id, counter_type, starts_on, ends_on, entitlement)
  values (company, office_person, 'leave', '2026-06-01', '2027-05-31', 25),
         (company, office_person, 'rtt', '2026-06-01', '2027-05-31', 8);

  assert not has_table_privilege('authenticated', 'planning_leave_private.sedentary_periods', 'SELECT'),
    'Authenticated users must use the scoped projection';
  assert not has_function_privilege('authenticated', 'planning_leave_private.get_planning_absence_balance_context(bigint)', 'EXECUTE'),
    'Legacy balance wrapper must be internal';
  assert not has_function_privilege('anon',
    'public.save_planning_sedentary_leave_period(bigint,date,date,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,date[],smallint[])', 'EXECUTE'),
    'Anonymous users must have no write access';

  for i in 1..cardinality(company_roles) loop
    actor := actors[i];
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    if i <= 3 then
      context := public.get_planning_absence_balance_context(new_office_person);
      if i = 1 then
        assert context->'sedentary_leave' = '[]'::jsonb and context->>'request_balance_kind' = 'crew',
          'New sedentary personnel must be eligible with no fabricated balance';
      end if;

      perform public.save_planning_sedentary_leave_period(new_office_person, '2026-06-01', '2026-06-01',
        0, 0, 5, 22, 4.4, 1.25, 0, 0, 0, '{}', weekdays);
      context := public.get_planning_absence_balance_context(new_office_person);
      assert (context#>>'{sedentary_leave,0,acquired_days}')::integer = 4, 'Use the more favorable monthly result';

      if i = 1 then
        saved_id := public.save_planning_sedentary_leave_period(office_person, '2026-06-01', '2026-08-01',
          -1.25, 3.5, 5, 100, 18, 4, 0, 0, 0, '{2026-08-15,2026-07-14,2026-08-15}', '{5,1,3}');
        context := public.get_planning_absence_balance_context(office_person);
        period := context#>'{sedentary_leave,0}';
        assert (period->>'id')::bigint = saved_id and (period->>'opening_balance')::numeric = -1.25
          and (period->>'opening_accrued')::numeric = 3.5, 'Preserve payroll opening balances and initial credit';
        assert (period->>'acquired_days')::integer = 13 and (period->>'normal_days')::numeric = 100,
          'Choose the daily result and round once without adding opening credit';
        assert period->>'starts_on' = '2026-06-01' and period->>'ends_on' = '2027-05-31'
          and period->>'debit_from' = '2026-08-01', 'Persist inclusive June–May bounds and cutover';
        assert period->'worked_holidays' = '["2026-07-14","2026-08-15"]'::jsonb
          and period->'working_weekdays' = '[1,3,5]'::jsonb, 'Normalize holidays and weekly schedule';
        assert context->>'request_balance_kind' = 'leave_rtt' and jsonb_array_length(context->'counter_periods') = 2,
          'Preserve both legacy counters and their display semantics';
        assert (select entitlement = 25 from public.planning_leave_counter_periods
          where person_id = office_person and counter_type = 'leave'), 'Legacy days must never be converted implicitly';

        assert public.save_planning_sedentary_leave_period(office_person, '2026-06-01', '2026-08-01',
          -1.25, 3.5, 5, 4, 4, 0, 0, 4, 0, '{2026-07-14,2026-08-15}', weekdays) = saved_id,
          'Retry replaces the existing period without adding a credit row';
        context := public.get_planning_absence_balance_context(office_person);
        assert jsonb_array_length(context->'sedentary_leave') = 1
          and (context#>>'{sedentary_leave,0,acquired_days}')::integer = 5,
          'Combine both rates under the weekly method and round the aggregate';

        perform public.save_planning_sedentary_leave_period(office_person, '2027-06-01', '2027-06-01',
          0, 0, 5, 0, 0, 0, 250, 52, 12, '{}', weekdays);
        perform public.save_planning_sedentary_leave_period(office_person, '2028-06-01', '2028-06-01',
          0, 0, 5, 245, 49, 12, 0, 0, 0, '{}', weekdays);
        context := public.get_planning_absence_balance_context(office_person);
        assert jsonb_array_length(context->'sedentary_leave') = 3
          and (context#>>'{sedentary_leave,0,acquired_days}')::integer = 30
          and (context#>>'{sedentary_leave,1,acquired_days}')::integer = 24,
          'New cycles are independent and honor the overall and illness ceilings';

        begin
          perform public.save_planning_sedentary_leave_period(office_person, '2026-05-31', '2026-06-01',
            0, 0, 5, 0, 0, 0, 0, 0, 0, '{}', weekdays);
          raise exception 'A non-June period was saved';
        exception when invalid_parameter_value then null; end;
        begin
          perform public.save_planning_sedentary_leave_period(office_person, '2026-06-01', '2026-05-31',
            0, 0, 5, 0, 0, 0, 0, 0, 0, '{}', weekdays);
          raise exception 'A cutoff outside the period was saved';
        exception when invalid_parameter_value then null; end;
        begin
          perform public.save_planning_sedentary_leave_period(office_person, '2026-06-01', '2026-06-01',
            0, 0, 5, 0, 0, 0, 0, 0, 0, '{2027-06-01}', weekdays);
          raise exception 'A holiday outside the period was saved';
        exception when invalid_parameter_value then null; end;
        begin
          perform public.save_planning_sedentary_leave_period(office_person, '2026-06-01', '2026-06-01',
            0, 0, 5, 0, 0, 0, 0, 0, 0, '{}', '{1,1,7}');
          raise exception 'Invalid working weekdays were saved';
        exception when invalid_parameter_value then null; end;
        begin
          perform public.save_planning_sedentary_leave_period(people_ids[5], '2026-06-01', '2026-06-01',
            0, 0, 5, 0, 0, 0, 0, 0, 0, '{}', weekdays);
          raise exception 'Navigant received sedentary rights';
        exception when insufficient_privilege then null; end;
      end if;
    else
      context := public.get_planning_absence_balance_context(people_ids[i]);
      if i = 6 then
        assert jsonb_array_length(context->'sedentary_leave') = 3, 'Sedentary self-service must read its period totals';
        assert (context#>>'{sedentary_leave,2,acquired_days}')::integer = 5, 'Self-service did not receive the updated total';
        assert not ((context#>'{sedentary_leave,2}') ?| array['normal_days','illness_days','illness_months']),
          'Self-service payload disclosed manager-only payroll inputs';
      else
        assert context->'sedentary_leave' = 'null'::jsonb and context->>'request_balance_kind' = 'crew',
          'Real Navigant profile must retain crew balances';
        begin
          perform public.get_planning_absence_balance_context(office_person);
          raise exception 'Navigant can access another person’s payroll';
        exception when insufficient_privilege then null; end;
      end if;
      begin
        perform public.save_planning_sedentary_leave_period(office_person, '2026-06-01', '2026-06-01',
          0, 0, 5, 0, 0, 0, 0, 0, 0, '{}', weekdays);
        raise exception 'Non-manager can save payroll inputs';
      exception when insufficient_privilege then null; end;
    end if;

    begin
      perform public.get_planning_absence_balance_context(foreign_person);
      raise exception 'Other-company payroll was readable';
    exception when insufficient_privilege then null; end;
    begin
      perform public.save_planning_sedentary_leave_period(foreign_person, '2026-06-01', '2026-06-01',
        0, 0, 5, 0, 0, 0, 0, 0, 0, '{}', weekdays);
      raise exception 'Other-company payroll was writeable';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
end;
$test$;

rollback;
