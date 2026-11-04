-- Rollback-only fixtures use real linked accounts and actual database roles.
begin;
-- A broad future permissive rule must not bypass the contract bucket guard.
create policy hr_employment_contract_test_broad on storage.objects for all to authenticated
using (true) with check (true);
do $$
declare
  company bigint;
  other_company bigint;
  person bigint;
  fixture_person bigint;
  actor uuid;
  role_name text;
  counter integer := 0;
  path text;
  inserted_contract bigint;
  affected integer;
begin
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies(code, name) values('hr-contract-isolation-test', 'Contract isolation fixture') returning id into other_company;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter := counter + 1;
    actor := ('ec040000-0000-4000-8000-00000000010' || counter)::uuid;
    insert into auth.users(id,email) values(actor,'employment-contract-' || role_name || '@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id)
      values(actor,'employment-contract-' || role_name || '@example.invalid','Contract fixture',company);
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    insert into public.people(company_id,user_id,first_name,last_name,active)
      values(company,actor,'Contract',role_name,true) returning id into fixture_person;
    if role_name = 'marin' then person := fixture_person; end if;
  end loop;
  path := company || '/people/' || person || '/ec040000-0000-4000-8000-000000000001.pdf';
  perform set_config('request.jwt.claim.sub','ec040000-0000-4000-8000-000000000101',true);
  perform set_config('request.jwt.claims','{"sub":"ec040000-0000-4000-8000-000000000101","role":"authenticated"}',true);
  execute 'set local role authenticated';
  assert public.hr_employment_contract_path_allowed(path), 'Admin may upload into the employee profile';
  insert into storage.objects(bucket_id,name,metadata)
    values('hr-employment-contracts',path,'{"mimetype":"application/pdf","size":100}');
  insert into public.hr_employment_contracts(company_id,person_id,contract_type,title,file_name,storage_path,file_size_bytes,input_data)
    values(company,person,'CDI','Contrat fixture','Contrat.pdf',path,100,'{"salary":"2500"}') returning id into inserted_contract;
  insert into public.hr_employment_contract_details(company_id,person_id,input_data)
    values(company,person,'{"salary":"2500","socialSecurityNumber":"fixture-private-number"}');
  execute 'reset role';

  counter := 0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter := counter + 1;
    actor := ('ec040000-0000-4000-8000-00000000010' || counter)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if role_name in ('admin','direction') then
      assert public.hr_employment_contract_path_allowed(path), 'Admin/Direction Storage access denied';
      assert (select count(*)=1 from public.hr_employment_contracts c where c.id=inserted_contract), 'Admin/Direction cannot read contract metadata';
      assert (select count(*)=1 from storage.objects o where o.bucket_id='hr-employment-contracts' and o.name=path), 'Admin/Direction cannot read private file';
      assert (select count(*)=1 from public.hr_employment_contract_details d where d.person_id=person), 'Admin/Direction cannot read sensitive RH details';
      update public.hr_employment_contract_details set input_data=input_data || '{"salary":"2600"}' where person_id=person;
      get diagnostics affected = row_count;
      assert affected=1, 'Admin/Direction cannot edit RH contract fields';
      begin
        update public.hr_employment_contracts set input_data='{}' where id=inserted_contract;
        raise exception 'An issued contract was modified';
      exception when insufficient_privilege then null; end;
    else
      assert not public.hr_employment_contract_path_allowed(path), 'Forbidden role can access Storage path';
      assert (select count(*)=0 from public.hr_employment_contracts c where c.id=inserted_contract), 'Contract data leaked to Armement/Capitaine/Marin (including employee owner)';
      assert (select count(*)=0 from storage.objects o where o.bucket_id='hr-employment-contracts' and o.name=path), 'Private file leaked to forbidden profile';
      assert (select count(*)=0 from public.hr_employment_contract_details d where d.person_id=person), 'Salary or social-security number leaked to forbidden profile';
      update public.hr_employment_contract_details set input_data='{}' where person_id=person;
      get diagnostics affected = row_count;
      assert affected=0, 'Forbidden role changed sensitive RH details';
      begin
        insert into public.hr_employment_contract_details(company_id,person_id,input_data)
          values(company,public.current_person_id(),'{}') on conflict(person_id) do update set input_data='{}';
        raise exception 'Forbidden role saved sensitive RH details';
      exception when insufficient_privilege then null; end;
      update storage.objects set metadata='{}' where bucket_id='hr-employment-contracts' and name=path;
      get diagnostics affected = row_count;
      assert affected=0, 'Forbidden role changed Storage despite restrictive guard';
      begin
        insert into storage.objects(bucket_id,name,metadata)
          values('hr-employment-contracts',company || '/people/' || person || '/ec040000-0000-4000-8000-000000000002.pdf','{}');
        raise exception 'Unauthorized Storage upload succeeded';
      exception when insufficient_privilege then null; end;
      begin
        insert into public.hr_employment_contracts(company_id,person_id,contract_type,title,file_name,storage_path,file_size_bytes,input_data)
          values(company,person,'CDD','Forbidden contract','forbidden.pdf',path,100,'{}');
        raise exception 'Unauthorized contract insertion succeeded';
      exception when insufficient_privilege then null; end;
      delete from public.hr_employment_contracts where id=inserted_contract;
      get diagnostics affected = row_count;
      assert affected=0, 'Forbidden role deleted contract metadata';
    end if;
    assert not public.hr_employment_contract_path_allowed(other_company || '/people/' || person || '/ec040000-0000-4000-8000-000000000001.pdf'), 'Cross-company path accepted';
    assert not public.hr_employment_contract_path_allowed('invalid/people/not-a-number/file.pdf'), 'Malformed Storage path accepted';
    execute 'reset role';
  end loop;

  -- Removing membership immediately revokes an existing Admin's contract access.
  update public.company_memberships set active=false where company_id=company and user_id='ec040000-0000-4000-8000-000000000101';
  perform set_config('request.jwt.claim.sub','ec040000-0000-4000-8000-000000000101',true);
  execute 'set local role authenticated';
  assert (select count(*)=0 from public.hr_employment_contracts c where c.id=inserted_contract), 'Inactive membership retains metadata access';
  assert not public.hr_employment_contract_path_allowed(path), 'Inactive membership retains Storage access';
  assert (select count(*)=0 from public.hr_employment_contract_details d where d.person_id=person), 'Inactive membership retains sensitive RH details';
  execute 'reset role';
  execute 'set local role anon';
  begin
    perform 1 from public.hr_employment_contracts;
    raise exception 'Anonymous contract metadata access granted';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.hr_employment_contract_details;
    raise exception 'Anonymous sensitive RH details access granted';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  assert not (select public from storage.buckets where id='hr-employment-contracts'), 'Contract bucket must remain private';
end $$;
select 'PASS: Admin/Direction access; Armement/Capitaine/Marin including employee owner, inactive membership, cross-company and anonymous access denied; issued contracts immutable' as result;
rollback;
