-- Real independent Auth subjects. Every test row and permission change rolls back.
begin;
do $test$
declare
  company bigint; foreign_company bigint; vessel bigint; foreign_person bigint; unknown_person bigint; named_person bigint;
  actor uuid; role_name text; person bigint; office_person bigint; i integer:=0; affected integer;
  people_ids bigint[]:='{}'; assignment_ids bigint[]:='{}'; day_ids bigint[]:='{}'; assignment_id bigint; day_id bigint;
  context jsonb; today_date date:=(now() at time zone 'Europe/Paris')::date;
begin
  select id into strict company from public.companies where code='bbtm';
  assert (select count(*)=2 from public.planning_leave_counter_people where request_balance_kind='leave_rtt'), 'Bootstrap must flag exactly two persisted people';
  assert not has_column_privilege('authenticated','public.planning_leave_counter_people','request_balance_kind','INSERT'), 'Client can insert the display mode';
  assert not has_column_privilege('authenticated','public.planning_leave_counter_people','request_balance_kind','UPDATE'), 'Client can update the display mode';
  insert into public.companies(code,name) values('request-balance-'||gen_random_uuid(),'Request balance foreign fixture') returning id into foreign_company;
  insert into public.people(company_id,first_name,last_name,active) values(foreign_company,'Foreign','REQUEST BALANCE FIXTURE',true) returning id into foreign_person;
  insert into public.vessels(company_id,name,active) values(company,'REQUEST BALANCE FIXTURE',true) returning id into vessel;
  insert into public.people(company_id,first_name,last_name,hired_on,active)
    values(company,'Future only','REQUEST BALANCE FIXTURE','2000-01-01',true) returning id into unknown_person;
  insert into public.planning_crew_balance_checkpoints(company_id,person_id,as_of,balance) values(company,unknown_person,today_date+10,80);
  -- A matching display name cannot acquire the mode bootstrapped by ID.
  insert into public.people(company_id,first_name,last_name,hired_on,active)
    values(company,'Christophe','MINASSIAN','2000-01-01',true) returning id into named_person;
  insert into public.planning_leave_counter_people(company_id,person_id) values(company,named_person);
  insert into public.people(company_id,first_name,last_name,hired_on,active)
    values(company,'Dedicated renamed','REQUEST BALANCE OFFICE FIXTURE','2000-01-01',true) returning id into office_person;
  insert into public.planning_leave_counter_people(company_id,person_id,request_balance_kind) values(company,office_person,'leave_rtt');
  update public.role_module_permissions set is_visible=true where module_key='planning';
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1; actor:=('f02e0000-0000-4000-8000-00000000000'||i)::uuid;
    insert into auth.users(id,email) values(actor,'request-balance-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id)
      values(actor,'request-balance-'||role_name||'@example.invalid','Request balance '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true)
      on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    insert into public.people(company_id,user_id,first_name,last_name,hired_on,active)
      values(company,actor,role_name,'REQUEST BALANCE FIXTURE','2000-01-01',true) returning id into person;
    people_ids:=array_append(people_ids,person);
    insert into public.planning_leave_counter_people(company_id,person_id) values(company,person);
    -- Existing crew rights remain readable but cannot be used or adjusted as annual counters.
    insert into public.planning_leave_counter_periods(company_id,person_id,counter_type,starts_on,ends_on,entitlement)
      values(company,person,'leave','2026-06-01','2027-05-31',25),(company,person,'rtt','2026-06-01','2027-05-31',10);
    insert into public.planning_crew_balance_checkpoints(company_id,person_id,as_of,balance)
      values(company,person,today_date-2,12.5),(company,person,today_date+20,80);
    insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,status_label,confirmation_status)
      values(company,vessel,person,today_date-1,today_date,'En Mer','confirmed') returning id into assignment_id;
    assignment_ids:=array_append(assignment_ids,assignment_id);
    insert into public.planning_days(company_id,vessel_id,person_id,crew_name,work_date,sailor_status,source_label,slot365,comments)
      values(company,vessel,person,role_name||' REQUEST BALANCE FIXTURE',today_date,'À Terre','seapilot-assignment-note','assignment:'||assignment_id,'PRIVATE DAY COMMENT') returning id into day_id;
    day_ids:=array_append(day_ids,day_id);
    insert into public.planning_periods(company_id,person_id,crew_name,starts_on,ends_on,sailor_status,comments)
      values(company,person,role_name||' REQUEST BALANCE FIXTURE',today_date-2,today_date,'En Mer','PRIVATE PERIOD COMMENT'),
        (company,person,role_name||' REQUEST BALANCE FIXTURE',today_date-20,today_date-10,'Repos','PRIVATE OLD COMMENT');
    insert into public.planning_days(company_id,person_id,work_date,sailor_status,source_label,comments)
      values(company,person,today_date,'En Mer','seapilot-vessel-location','PRIVATE LOCATION COMMENT');
  end loop;
  i:=0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1; actor:=('f02e0000-0000-4000-8000-00000000000'||i)::uuid; person:=people_ids[i];
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    context:=public.get_planning_absence_balance_context(person);
    assert context->>'kind'='leave_rtt' and context->>'request_balance_kind'='crew', 'Enrolled crew incorrectly switched request display to annual counters';
    assert jsonb_array_length(context->'counter_periods')=2, 'Legacy rights erased from management context';
    assert jsonb_array_length(context->'crew_checkpoints')=2, 'Past/future checkpoints missing';
    assert jsonb_array_length(context#>'{crew_sources,assignments}')=1
      and (context#>>'{crew_sources,assignments,0,id}')::bigint=assignment_ids[i], 'Selected-person assignment missing or foreign source leaked';
    assert jsonb_array_length(context#>'{crew_sources,periods}')=1, 'Current crew period or source floor incorrect';
    assert jsonb_array_length(context#>'{crew_sources,days}')=1
      and (context#>>'{crew_sources,days,0,id}')::bigint=day_ids[i], 'Daily edit missing or vessel-location source leaked';
    assert context::text not like '%PRIVATE%', 'Private comments leaked';
    assert not ((context->'person') ?| array['user_id','birth_date','identity_document_number','function_label']), 'Private HR fields leaked';
    begin
      perform public.save_planning_leave_rights_period(person,'2027-06-01','2028-05-31',25,10);
      raise exception 'Crew gained annual rights through combined RPC';
    exception when insufficient_privilege then null; end;
    begin
      perform public.save_planning_leave_counter_period(person,'leave','2026-06-01','2027-05-31',99);
      raise exception 'Crew adjusted annual rights through legacy RPC';
    exception when insufficient_privilege then null; end;
    update public.planning_leave_counter_periods set entitlement=99 where person_id=person;
    get diagnostics affected=row_count; assert affected=0, 'Direct update bypassed dedicated-counter mode';
    begin
      insert into public.planning_leave_counter_periods(company_id,person_id,counter_type,starts_on,ends_on,entitlement)
        values(company,person,'leave','2027-06-01','2028-05-31',99);
      raise exception 'Direct insert bypassed dedicated-counter mode';
    exception when insufficient_privilege then null; end;
    begin
      update public.planning_leave_counter_people set request_balance_kind='leave_rtt' where person_id=person;
      raise exception 'Client changed server display mode';
    exception when insufficient_privilege then null; end;
    begin
      perform public.get_planning_absence_balance_context(foreign_person);
      raise exception 'Foreign company context readable';
    exception when insufficient_privilege then null; end;
    if role_name in ('admin','direction','armement') then
      context:=public.get_planning_absence_balance_context(people_ids[5]);
      assert context->>'request_balance_kind'='crew', 'Manager cannot select another crew balance';
      context:=public.get_planning_absence_balance_context(unknown_person);
      assert context->>'request_balance_kind'='crew' and jsonb_array_length(context->'crew_checkpoints')=1
        and context#>'{crew_sources,assignments}'='[]'::jsonb, 'Future-only checkpoint fabricated a current balance';
      context:=public.get_planning_absence_balance_context(named_person);
      assert context->>'request_balance_kind'='crew', 'Display mode recomputed from a matching name';
      context:=public.get_planning_absence_balance_context(office_person);
      assert context->>'request_balance_kind'='leave_rtt' and context->'crew_checkpoints'='[]'::jsonb, 'Persisted office mode depends on display name';
      perform public.save_planning_leave_rights_period(office_person,'2026-06-01','2027-05-31',25,10);
    else
      begin
        perform public.get_planning_absence_balance_context(people_ids[1]);
        raise exception 'Real Marin/Capitaine read another person balance';
      exception when insufficient_privilege then null; end;
    end if;
    execute 'reset role';
    update public.role_module_permissions set is_visible=false where module_key='planning' and role_key=role_name;
    execute 'set local role authenticated';
    begin
      perform public.get_planning_absence_balance_context(person);
      raise exception 'Hidden module exposed crew balance';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=true where module_key='planning' and role_key=role_name;
  end loop;
  update public.company_memberships set active=false where company_id=company and user_id=actor;
  execute 'set local role authenticated';
  begin
    perform public.get_planning_absence_balance_context(people_ids[5]);
    raise exception 'Inactive membership exposed crew balance';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  assert not has_function_privilege('anon','public.get_planning_absence_balance_context(bigint)','EXECUTE'), 'Anonymous context RPC executable';
end $test$;
rollback;
select 'PASS: persisted display modes, enrolled crew sources and preserved legacy data, annual crew refusal via RPC/direct write, five real roles/self/company/module scope, no fabricated balance or private fields' as result;
