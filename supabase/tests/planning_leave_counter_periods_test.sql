-- Independent authenticated fixtures; no administrator profile simulation.
begin;
do $test$
declare
  company bigint; other_company bigint; actor uuid; role_name text; i integer:=0;
  people_ids bigint[]:='{}'; person bigint; other_person bigint; crew_person bigint; generic_person bigint;
  counter_id bigint; same_counter_id bigint; absence_id bigint; requested_id bigint; affected integer;
  context jsonb; legacy_period bigint; legacy_day bigint; read_scope text; today_date date:=(now() at time zone 'Europe/Paris')::date;
  crew_actor uuid:='f01e0000-0000-4000-8000-000000000006';
begin
  select id into strict company from public.companies where code='bbtm';
  insert into public.companies(code,name) values('leave-counter-fixture-'||gen_random_uuid(),'Leave counter foreign fixture') returning id into other_company;
  insert into public.people(company_id,first_name,last_name,active) values(other_company,'Foreign','LEAVE COUNTER FIXTURE',true) returning id into other_person;
  insert into public.planning_leave_counter_people(company_id,person_id) values(other_company,other_person);
  insert into public.planning_leave_counter_periods(company_id,person_id,counter_type,starts_on,ends_on,entitlement)
  values(other_company,other_person,'leave','2026-01-01','2026-12-31',25);
  update public.role_module_permissions set is_visible=true where module_key='planning';
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1; actor:=('f01e0000-0000-4000-8000-00000000000'||i)::uuid;
    insert into auth.users(id,email) values(actor,'leave-counter-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,'leave-counter-'||role_name||'@example.invalid','Leave counter '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    insert into public.people(company_id,user_id,first_name,last_name,hired_on,active)
    values(company,actor,role_name,'LEAVE COUNTER FIXTURE','2000-01-01',true) returning id into person;
    people_ids:=array_append(people_ids,person);
    insert into public.planning_leave_counter_people(company_id,person_id) values(company,person);
    insert into public.planning_leave_counter_periods(company_id,person_id,counter_type,starts_on,ends_on,entitlement)
    values(company,person,'leave','2026-01-01','2026-12-31',25),(company,person,'rtt','2026-01-01','2026-12-31',12);
  end loop;
  insert into auth.users(id,email) values(crew_actor,'leave-counter-crew@example.invalid');
  insert into public.profiles(id,email,display_name,active_company_id) values(crew_actor,'leave-counter-crew@example.invalid','Crew balance fixture',company);
  insert into public.company_memberships(company_id,user_id,active) values(company,crew_actor,true) on conflict(company_id,user_id) do update set active=true;
  insert into public.user_roles(user_id,company_id,role_key) values(crew_actor,company,'marin');
  insert into public.people(company_id,user_id,first_name,last_name,hired_on,active)
  values(company,crew_actor,'Éléonore','CREW COUNTER FIXTURE','2000-01-01',true) returning id into crew_person;
  insert into public.planning_crew_balance_checkpoints(company_id,person_id,as_of,balance)
  values(company,crew_person,today_date-2,12.5),(company,crew_person,today_date+20,80);
  insert into public.planning_periods(company_id,person_id,crew_name,starts_on,ends_on,sailor_status,comments)
  values(company,null,'crew-counter-fixture éléonore',today_date-2,today_date,'En Mer','PRIVATE PERIOD COMMENT') returning id into legacy_period;
  insert into public.planning_periods(company_id,person_id,crew_name,starts_on,ends_on,sailor_status,comments)
  values(company,null,'crew-counter-fixture éléonore',today_date-10,today_date-4,'Repos','PRIVATE OLD COMMENT'),
    (other_company,null,'crew-counter-fixture éléonore',today_date-2,today_date,'En Mer','PRIVATE FOREIGN COMMENT');
  insert into public.planning_days(company_id,person_id,crew_name,work_date,sailor_status,comments)
  values(company,null,'Éléonore CREW COUNTER FIXTURE',today_date,'A Terre','PRIVATE DAY COMMENT') returning id into legacy_day;
  insert into public.planning_days(company_id,person_id,crew_name,work_date,sailor_status,source_label,comments)
  values(company,crew_person,'Éléonore CREW COUNTER FIXTURE',today_date,'En Mer','seapilot-vessel-location','PRIVATE LOCATION COMMENT'),
    (other_company,null,'Éléonore CREW COUNTER FIXTURE',today_date,'En Mer','sharepoint','PRIVATE FOREIGN DAY COMMENT');
  insert into public.people(company_id,first_name,last_name,hired_on,active)
  values(company,'Generic','NO ENTITLEMENT FIXTURE','2000-01-01',true) returning id into generic_person;
  insert into public.planning_crew_balance_checkpoints(company_id,person_id,as_of,balance)
  values(company,generic_person,today_date+10,30);
  insert into public.planning_periods(company_id,person_id,crew_name,starts_on,ends_on,sailor_status,comments)
  values(company,generic_person,'Generic NO ENTITLEMENT FIXTURE',today_date-2,today_date,'En Mer','PRIVATE WITHOUT PAST REFERENCE');
  i:=0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1; person:=people_ids[i]; actor:=('f01e0000-0000-4000-8000-00000000000'||i)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    context:=public.get_planning_absence_balance_context(person);
    assert context->>'kind'='leave_rtt' and (context#>>'{person,id}')::bigint=person, 'Own counter context incorrect';
    assert jsonb_array_length(context->'counter_periods')=2, 'Own counter periods missing';
    assert context->'crew_checkpoints'='[]'::jsonb and context#>'{crew_sources,days}'='[]'::jsonb, 'Staff context leaked crew data';
    assert not ((context->'person') ?| array['user_id','birth_date','identity_document_number','function_label']), 'Excess personnel fields in context';
    assert not exists(select 1 from public.planning_leave_counter_periods where person_id=other_person), 'Foreign periods leaked';
    begin
      perform public.get_planning_absence_balance_context(other_person);
      raise exception 'Foreign-person context accepted';
    exception when insufficient_privilege then null; end;
    if role_name in ('admin','direction','armement') then
      counter_id:=public.save_planning_leave_counter_period(person,'leave','2026-01-01','2026-12-31',26.5);
      same_counter_id:=public.save_planning_leave_counter_period(person,'leave','2026-01-01','2026-12-31',27.25);
      assert same_counter_id=counter_id and (select entitlement=27.25 from public.planning_leave_counter_periods where id=counter_id), 'Same-boundary upsert lost precision or inserted a duplicate';
      assert (select updated_by=actor and updated_at>=created_at from public.planning_leave_counter_periods where id=counter_id), 'Period author or server modification date missing';
      perform public.save_planning_leave_counter_period(person,'rtt','2026-01-01','2026-12-31',0);
      perform public.save_planning_leave_counter_period(person,'rtt','2027-01-01','2027-12-31',12);
      begin
        perform public.save_planning_leave_counter_period(person,'leave','2026-12-31','2027-06-30',12);
        raise exception 'Inclusive overlapping periods accepted';
      exception when exclusion_violation then null; end;
      begin
        perform public.save_planning_leave_counter_period(person,'illness','2026-01-01','2026-12-31',12);
        raise exception 'Invalid counter type accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.save_planning_leave_counter_period(person,'leave','2027-01-01','2026-12-31',12);
        raise exception 'Reversed dates accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.save_planning_leave_counter_period(person,'leave','1899-12-31','1900-01-01',12);
        raise exception 'Unbounded historical period accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.save_planning_leave_counter_period(person,'leave','2027-01-01','2038-01-01',12);
        raise exception 'Excessive period span accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.save_planning_leave_counter_period(person,'leave','2027-01-01','2027-12-31',1.234);
        raise exception 'Excessive entitlement precision accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.save_planning_leave_counter_period(person,'leave','2027-01-01','2027-12-31',-1);
        raise exception 'Negative total entitlement accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.save_planning_leave_counter_period(person,'leave','2027-01-01','2027-12-31',100000);
        raise exception 'Excessive total entitlement accepted';
      exception when invalid_parameter_value then null; end;
      begin
        update public.planning_leave_counter_periods set ends_on='2027-12-31' where id=counter_id;
        raise exception 'Client changed immutable period boundary';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_planning_leave_counter_period(other_person,'leave','2027-01-01','2027-12-31',25);
        raise exception 'Foreign entitlement write accepted';
      exception when insufficient_privilege then null; end;
      context:=public.get_planning_absence_balance_context(crew_person);
      assert context->>'kind'='crew' and jsonb_array_length(context->'crew_checkpoints')=2, 'Crew reference context incorrect';
      assert jsonb_array_length(context#>'{crew_sources,periods}')=1 and jsonb_array_length(context#>'{crew_sources,days}')=1, 'Crew source floor/name/company filters incorrect';
      assert (context#>>'{crew_sources,periods,0,id}')::bigint=legacy_period and (context#>>'{crew_sources,days,0,id}')::bigint=legacy_day, 'Normalized legacy names not matched exactly';
      assert context::text not like '%PRIVATE%', 'Comments leaked into balance context';
      context:=public.get_planning_absence_balance_context(generic_person);
      assert context->>'kind'='crew' and context->'counter_periods'='[]'::jsonb, 'Unconfigured person fabricated leave/RTT rights';
      assert jsonb_array_length(context->'crew_checkpoints')=1 and context#>'{crew_sources,periods}'='[]'::jsonb,
        'Future-only reference initialized the current balance or exposed unnecessary sources';
      begin
        perform public.save_planning_leave_counter_period(generic_person,'leave','2026-01-01','2026-12-31',25);
        raise exception 'Ineligible person gained leave/RTT rights';
      exception when invalid_parameter_value then null; end;
    else
      begin
        perform public.save_planning_leave_counter_period(person,'leave','2026-01-01','2026-12-31',99);
        raise exception 'Marin/Capitaine wrote an entitlement';
      exception when insufficient_privilege then null; end;
      update public.planning_leave_counter_periods set entitlement=99 where person_id=person;
      get diagnostics affected=row_count; assert affected=0, 'Reader bypassed RPC with direct update';
      begin
        insert into public.planning_leave_counter_periods(company_id,person_id,counter_type,starts_on,ends_on,entitlement)
        values(company,person,'rtt','2027-01-01','2027-12-31',99);
        raise exception 'Reader bypassed RPC with direct insert';
      exception when insufficient_privilege then null; end;
      begin
        perform public.get_planning_absence_balance_context(people_ids[1]);
        raise exception 'Reader accessed another person context';
      exception when insufficient_privilege then null; end;
    end if;
    absence_id:=public.save_planning_absence(null,person,'rtt','2040-01-02 08:00+01','2040-01-02 18:00+01','PRIVATE ABSENCE REASON');
    context:=public.get_planning_absence_balance_context(person);
    assert exists(select 1 from jsonb_array_elements(context->'absences') a where (a->>'id')::bigint=absence_id and a->>'absence_type'='rtt'), 'RTT context not available immediately';
    assert context::text not like '%PRIVATE ABSENCE REASON%', 'Absence reason leaked';
    begin
      delete from public.planning_leave_counter_periods where person_id=person;
      raise exception 'Counter periods deletable by client';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=false where module_key='planning' and role_key=role_name;
    execute 'set local role authenticated';
    begin
      perform public.get_planning_absence_balance_context(person);
      raise exception 'Hidden Planning module still exposes balance context';
    exception when insufficient_privilege then null; end;
    assert not exists(select 1 from public.planning_leave_counter_periods where person_id=person), 'Hidden module exposes period table';
    execute 'reset role';
    update public.role_module_permissions set is_visible=true where module_key='planning' and role_key=role_name;
  end loop;
  -- Company roles may independently provide module visibility, read and management.
  insert into public.user_roles(user_id,company_id,role_key) values('f01e0000-0000-4000-8000-000000000004',company,'direction');
  delete from public.planning_action_permissions where role_key='capitaine' and action_key='read' returning scope_mode into strict read_scope;
  update public.role_module_permissions set is_visible=false where module_key='planning' and role_key='direction';
  perform set_config('request.jwt.claim.sub','f01e0000-0000-4000-8000-000000000004',true);
  perform set_config('request.jwt.claims','{"sub":"f01e0000-0000-4000-8000-000000000004","role":"authenticated"}',true);
  execute 'set local role authenticated';
  context:=public.get_planning_absence_balance_context(people_ids[1]);
  assert context->>'kind'='leave_rtt', 'Cumulative visibility/read/management roles not honored';
  perform public.save_planning_leave_counter_period(people_ids[1],'leave','2026-01-01','2026-12-31',27.25);
  execute 'reset role';
  delete from public.user_roles where user_id='f01e0000-0000-4000-8000-000000000004' and company_id=company and role_key='direction';
  insert into public.planning_action_permissions(role_key,action_key,scope_mode) values('capitaine','read',read_scope);
  update public.role_module_permissions set is_visible=true where module_key='planning' and role_key='direction';
  -- Actual self-only crew account can read its current balance inputs without the crew UI.
  perform set_config('request.jwt.claim.sub',crew_actor::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',crew_actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  context:=public.get_planning_absence_balance_context(crew_person);
  assert context->>'kind'='crew' and context::text not like '%PRIVATE%', 'Own crew context unavailable or unredacted';
  begin
    perform public.get_planning_absence_balance_context(people_ids[1]);
    raise exception 'Crew reader accesses office counters';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  -- Office decisions retain notification and admin-only move rights for RTT.
  perform set_config('request.jwt.claim.sub','f01e0000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims','{"sub":"f01e0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  execute 'set local role authenticated';
  select id into absence_id from public.planning_absences where person_id=people_ids[1] and absence_type='rtt' and status='requested' and starts_at='2040-01-02 08:00+01';
  perform public.review_planning_absence(absence_id,'approve',null);
  assert exists(select 1 from public.planning_notifications where entity_kind='absence_decision' and entity_id=absence_id and title='RTT acceptés'), 'RTT decision notice missing';
  perform public.move_planning_approved_absence(absence_id,'2040-01-03 08:00+01','2040-01-03 18:00+01');
  assert (select status='approved' from public.planning_absences where id=absence_id), 'RTT move reset decision';
  assert (select count(*)=1 from public.planning_notifications where entity_kind='absence_decision' and entity_id=absence_id), 'RTT move duplicated the decision notice';
  requested_id:=public.save_planning_absence(null,people_ids[1],'unavailability','2040-01-07 08:00+01','2040-01-07 18:00+01','Legacy alias fixture');
  assert (select absence_type='leave' from public.planning_absences where id=requested_id), 'Legacy absence alias normalization changed';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','f01e0000-0000-4000-8000-000000000002',true);
  perform set_config('request.jwt.claims','{"sub":"f01e0000-0000-4000-8000-000000000002","role":"authenticated"}',true);
  execute 'set local role authenticated';
  begin
    perform public.move_planning_approved_absence(absence_id,'2040-01-04 08:00+01','2040-01-04 18:00+01');
    raise exception 'Direction gained admin-only RTT move rights';
  exception when insufficient_privilege then null; end;
  requested_id:=public.save_planning_absence(null,people_ids[2],'rtt','2040-01-05 08:00+01','2040-01-05 18:00+01','');
  perform public.review_planning_absence(requested_id,'reject','Fixture refusal');
  assert exists(select 1 from public.planning_notifications where entity_kind='absence_decision' and entity_id=requested_id and title='RTT refusés'), 'RTT rejection notice missing';
  execute 'reset role';
  update public.company_memberships set active=false where company_id=company and user_id='f01e0000-0000-4000-8000-000000000002';
  execute 'set local role authenticated';
  begin
    perform public.get_planning_absence_balance_context(people_ids[2]);
    raise exception 'Inactive member reads a balance context';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  assert not has_function_privilege('anon','public.get_planning_absence_balance_context(bigint)','EXECUTE'), 'Anonymous context RPC executable';
  assert not has_function_privilege('anon','public.save_planning_leave_counter_period(bigint,text,date,date,numeric)','EXECUTE'), 'Anonymous save RPC executable';
end $test$;
select 'PASS: five real roles and cumulative grants, bounded immutable entitlement periods, self/company scope, private minimal crew sources, future-only/unconfigured balance, RTT requests/decisions/admin moves, legacy alias, module revocation and inactive membership' as result;
rollback;
