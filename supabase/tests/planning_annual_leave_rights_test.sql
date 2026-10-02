-- Independent real Auth identities; all fixtures and writes roll back.
begin;
do $test$
declare
  company bigint; foreign_company bigint; foreign_person bigint;
  actor uuid; role_name text; i integer:=0; person bigint; colleague bigint; invalid_person bigint;
  person_ids bigint[]:='{}'; colleague_ids bigint[]:='{}'; invalid_ids bigint[]:='{}';
  context jsonb; leave_id bigint; rtt_id bigint; count_before integer;
begin
  select id into strict company from public.companies where code='bbtm';
  insert into public.companies(code,name) values('annual-rights-'||gen_random_uuid(),'Annual rights foreign fixture') returning id into foreign_company;
  insert into public.people(company_id,first_name,last_name,active)
  values(foreign_company,'Foreign','ANNUAL RIGHTS FIXTURE',true) returning id into foreign_person;
  update public.role_module_permissions set is_visible=true where module_key='planning';
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1; actor:=('f02c0000-0000-4000-8000-00000000000'||i)::uuid;
    insert into auth.users(id,email) values(actor,'annual-rights-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id)
    values(actor,'annual-rights-'||role_name||'@example.invalid','Annual rights '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true)
    on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    insert into public.people(company_id,user_id,first_name,last_name,hired_on,active)
    values(company,actor,role_name,'ANNUAL RIGHTS FIXTURE','2000-01-01',true) returning id into person;
    insert into public.people(company_id,first_name,last_name,hired_on,active)
    values(company,'Selected '||role_name,'ANNUAL RIGHTS FIXTURE','2000-01-01',true) returning id into colleague;
    insert into public.people(company_id,first_name,last_name,active)
    values(company,'Invalid '||role_name,'ANNUAL RIGHTS FIXTURE',true) returning id into invalid_person;
    person_ids:=array_append(person_ids,person);
    colleague_ids:=array_append(colleague_ids,colleague);
    invalid_ids:=array_append(invalid_ids,invalid_person);
    -- Legacy periods retain their bounds, totals and ability to be adjusted.
    if role_name in ('admin','direction','armement') then
      insert into public.planning_leave_counter_people(company_id,person_id) values(company,person);
      insert into public.planning_leave_counter_periods(company_id,person_id,counter_type,starts_on,ends_on,entitlement)
      values(company,person,'leave','2025-01-01','2025-12-31',18),
        (company,person,'rtt','2027-05-30','2027-06-02',4);
    end if;
  end loop;
  i:=0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1; actor:=('f02c0000-0000-4000-8000-00000000000'||i)::uuid;
    person:=person_ids[i]; colleague:=colleague_ids[i]; invalid_person:=invalid_ids[i];
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if role_name in ('admin','direction','armement') then
      context:=public.get_planning_absence_balance_context(colleague);
      assert context->>'kind'='crew', 'Unconfigured collaborator fabricated annual rights';
      perform public.save_planning_leave_rights_period(colleague,'2026-06-01','2027-05-31',25.5,0);
      context:=public.get_planning_absence_balance_context(colleague);
      assert context->>'kind'='leave_rtt' and jsonb_array_length(context->'counter_periods')=2, 'Selected collaborator was not enrolled with both counters';
      select id into strict leave_id from public.planning_leave_counter_periods where person_id=colleague and counter_type='leave';
      select id into strict rtt_id from public.planning_leave_counter_periods where person_id=colleague and counter_type='rtt';
      assert (select entitlement=0 from public.planning_leave_counter_periods where id=rtt_id), 'Explicit zero RTT entitlement lost';
      perform public.save_planning_leave_rights_period(colleague,'2026-06-01','2027-05-31',28.25,9.5);
      assert (select count(*)=2 from public.planning_leave_counter_periods where person_id=colleague), 'Annual adjustment duplicated periods';
      assert (select entitlement=28.25 and updated_by=actor from public.planning_leave_counter_periods where id=leave_id), 'Leave adjustment changed id or omitted author';
      assert (select entitlement=9.5 from public.planning_leave_counter_periods where id=rtt_id), 'RTT adjustment changed id';
      perform public.save_planning_leave_rights_period(colleague,'2027-06-01','2028-05-31',26,10);
      assert (select count(*)=4 from public.planning_leave_counter_periods where person_id=colleague), 'Adjacent annual periods rejected';
      begin
        perform public.save_planning_leave_rights_period(invalid_person,'2026-01-01','2026-12-31',25,10);
        raise exception 'Calendar-year period accepted by annual RPC';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.save_planning_leave_rights_period(invalid_person,'2026-06-01','2027-05-31',25,null);
        raise exception 'Missing RTT total accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.save_planning_leave_rights_period(invalid_person,'2026-06-01','2027-05-31',25,-1);
        raise exception 'Negative RTT total accepted';
      exception when invalid_parameter_value then null; end;
      assert not exists(select 1 from public.planning_leave_counter_people where person_id=invalid_person), 'Invalid combined save enrolled a collaborator';
      select count(*) into count_before from public.planning_leave_counter_periods where person_id=person;
      begin
        perform public.save_planning_leave_rights_period(person,'2027-06-01','2028-05-31',25,8);
        raise exception 'Overlap with legacy RTT accepted';
      exception when exclusion_violation then null; end;
      assert (select count(*)=count_before from public.planning_leave_counter_periods where person_id=person), 'Failed RTT write left a partially saved leave period';
      assert not exists(select 1 from public.planning_leave_counter_periods where person_id=person and counter_type='leave' and starts_on='2027-06-01'), 'Atomic annual rollback incomplete';
      perform public.save_planning_leave_counter_period(person,'leave','2025-01-01','2025-12-31',19.5);
      assert exists(select 1 from public.planning_leave_counter_periods where person_id=person and starts_on='2025-01-01' and ends_on='2025-12-31' and entitlement=19.5), 'Legacy rights or boundaries lost';
      begin
        perform public.save_planning_leave_rights_period(foreign_person,'2026-06-01','2027-05-31',25,10);
        raise exception 'Foreign collaborator enrolled';
      exception when insufficient_privilege then null; end;
    else
      context:=public.get_planning_absence_balance_context(person);
      assert context->>'kind'='crew', 'Real self-only reader missing own context';
      begin
        perform public.save_planning_leave_rights_period(person,'2026-06-01','2027-05-31',25,10);
        raise exception 'Marin/Capitaine enrolled themselves';
      exception when insufficient_privilege then null; end;
      begin
        insert into public.planning_leave_counter_people(company_id,person_id) values(company,person);
        raise exception 'Marin/Capitaine bypassed enrollment RPC via direct insert';
      exception when insufficient_privilege then null; end;
      begin
        perform public.get_planning_absence_balance_context(colleague_ids[1]);
        raise exception 'Marin/Capitaine read another collaborator rights';
      exception when insufficient_privilege then null; end;
    end if;
    execute 'reset role';
    -- Once a manager configures them, actual Marin/Capitaine accounts see only their own totals.
    if role_name in ('capitaine','marin') then
      insert into public.planning_leave_counter_people(company_id,person_id) values(company,person);
      insert into public.planning_leave_counter_periods(company_id,person_id,counter_type,starts_on,ends_on,entitlement)
      values(company,person,'leave','2026-06-01','2027-05-31',25),(company,person,'rtt','2026-06-01','2027-05-31',10);
      execute 'set local role authenticated';
      context:=public.get_planning_absence_balance_context(person);
      assert context->>'kind'='leave_rtt' and jsonb_array_length(context->'counter_periods')=2, 'Real reader cannot read own manager-configured annual counters';
      begin
        perform public.save_planning_leave_rights_period(person,'2026-06-01','2027-05-31',99,99);
        raise exception 'Reader changed configured annual rights';
      exception when insufficient_privilege then null; end;
      execute 'reset role';
    end if;
    update public.role_module_permissions set is_visible=false where module_key='planning' and role_key=role_name;
    execute 'set local role authenticated';
    begin
      perform public.save_planning_leave_rights_period(person,'2026-06-01','2027-05-31',25,10);
      raise exception 'Hidden Planning module allowed annual rights management';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=true where module_key='planning' and role_key=role_name;
  end loop;
  assert not has_function_privilege('anon','public.save_planning_leave_rights_period(bigint,date,date,numeric,numeric)','EXECUTE'), 'Anonymous annual RPC executable';
  assert not has_table_privilege('authenticated','public.planning_leave_counter_people','DELETE'), 'Client can erase enrolled collaborators';
end $test$;
select 'PASS: annual combined rights, collaborator enrollment, adjustments, zero RTT, adjacent years, atomic overlap rollback, preserved legacy periods, real Marin/Capitaine self access and management denial' as result;
rollback;
