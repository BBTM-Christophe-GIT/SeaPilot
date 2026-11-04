-- Atomic private field patches and contract-field write boundaries, real roles.
begin;
do $$
declare
  company bigint;
  other_company bigint;
  other_person bigint;
  person bigint;
  own_person bigint;
  actor uuid;
  role_name text;
  counter integer := 0;
  merged jsonb;
  updated public.people%rowtype;
  affected integer;
begin
  select id into strict company from public.companies where code='bbtm';
  insert into public.companies(code,name) values('hr-contract-patch-other','Contract patch isolation fixture') returning id into other_company;
  insert into public.people(company_id,first_name,last_name) values(other_company,'Other','Contract fixture') returning id into other_person;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter:=counter+1;
    actor:=('ec050000-0000-4000-8000-00000000010'||counter)::uuid;
    insert into auth.users(id,email) values(actor,'hr-contract-patch-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id)
      values(actor,'hr-contract-patch-'||role_name||'@example.invalid','Contract patch fixture',company);
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    insert into public.people(company_id,user_id,first_name,last_name,contract_type,hired_on)
      values(company,actor,'Contract',role_name,'CDI','2026-01-01') returning id into own_person;
    if role_name='marin' then person:=own_person; end if;
  end loop;
  counter:=0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter:=counter+1;
    actor:=('ec050000-0000-4000-8000-00000000010'||counter)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    own_person:=public.current_person_id();
    if role_name in ('admin','direction') then
      merged:=public.patch_hr_employment_contract_details(person,'{"socialSecurityNumber":"fixture-private","grossMonthlySalary":"2500"}');
      merged:=public.patch_hr_employment_contract_details(person,'{"grossMonthlySalary":"3000"}');
      assert merged->>'socialSecurityNumber'='fixture-private', 'Saving salary erased SSN';
      merged:=public.patch_hr_employment_contract_details(person,'{"socialSecurityNumber":"fixture-updated"}');
      assert merged->>'grossMonthlySalary'='3000', 'Saving SSN erased salary';
      merged:=public.patch_hr_employment_contract_details(person,'{"grossMonthlySalary":""}');
      assert merged->>'grossMonthlySalary'='' and merged->>'socialSecurityNumber'='fixture-updated', 'Clearing salary erased SSN';
      update public.people set contract_type='CDD',departed_on='2027-01-01',departure_reason='Fixture' where id=person;
      get diagnostics affected=row_count;
      assert affected=1, 'Admin/Direction contract edit denied';
      update public.people set contract_type='CDI',departed_on=null,departure_reason=null where id=person;
      begin
        perform public.patch_hr_employment_contract_details(person,'{"unknown":"field"}');
        raise exception 'Unknown patch field accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.patch_hr_employment_contract_details(person,'{"grossMonthlySalary":null}');
        raise exception 'Nonstring patch value accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.patch_hr_employment_contract_details(other_person,'{"grossMonthlySalary":"2500"}');
        raise exception 'Cross-company patch accepted';
      exception when insufficient_privilege then null; end;
    else
      begin
        perform public.patch_hr_employment_contract_details(own_person,'{"socialSecurityNumber":"forbidden"}');
        raise exception 'Forbidden role patched sensitive fields';
      exception when insufficient_privilege then null; end;
      if role_name='armement' then
        update public.people set phone='fixture-phone' where id=own_person;
        get diagnostics affected=row_count;
        assert affected=1, 'Armement lost editing of unrelated RH fields';
        begin
          update public.people set contract_type='CDD' where id=own_person;
          raise exception 'Armement directly changed contract type';
        exception when insufficient_privilege then null; end;
        begin
          update public.people set employment_periods='[{"hiredOn":"2025-01-01","departedOn":"","contractType":"CDD","departureReason":""}]' where id=own_person;
          raise exception 'Armement changed dates through employment history';
        exception when insufficient_privilege then null; end;
        begin
          insert into public.people(company_id,first_name,last_name,contract_type,hired_on)
            values(company,'Forbidden','Contract fixture','CDI','2026-01-01');
          raise exception 'Armement inserted protected contract dates';
        exception when insufficient_privilege then null; end;
        insert into public.people(company_id,first_name,last_name) values(company,'Allowed','Blank contract fixture');
      else
        -- A partial self edit must preserve saved contract dates. An explicitly
        -- changed contract field must be rejected even through SECURITY DEFINER.
        updated:=public.update_own_hr_profile(own_person,jsonb_build_object('first_name','Contract','last_name',role_name,'phone','fixture-self-phone'));
        assert updated.phone='fixture-self-phone' and updated.hired_on='2026-01-01'::date and updated.contract_type='CDI', 'Normal self edit lost contract dates or stopped working';
        begin
          perform public.update_own_hr_profile(own_person,jsonb_build_object('first_name','Contract','last_name',role_name,'contract_type','CDD'));
          raise exception 'Restricted self RPC changed contract type';
        exception when insufficient_privilege then null; end;
      end if;
    end if;
    execute 'reset role';
  end loop;
  begin
    update public.hr_visibility_rules set visible_to_roles=array['admin','direction','armement'] where scope='section' and item_key='contract';
    raise exception 'Visibility settings granted Contract section to Armement';
  exception when check_violation then null; end;
  execute 'set local role anon';
  begin
    perform public.patch_hr_employment_contract_details(person,'{}');
    raise exception 'Anonymous contract patch accepted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
select 'PASS: atomic salary/SSN patches; five real roles; Admin/Direction contract writes; Armement ordinary edits retained; Marin/Capitaine self contract changes denied; visibility/cross-company/anonymous guards' as result;
rollback;
