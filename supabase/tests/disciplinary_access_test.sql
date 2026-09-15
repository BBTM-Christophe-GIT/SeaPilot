-- Real authenticated-role fixtures; never relies on the application's role simulator.
begin;
do $$
declare
  company bigint;
  target_person bigint;
  actor uuid;
  role_name text;
  test_case_id uuid := 'db540000-0000-4000-8000-000000000001';
  counter integer := 0;
begin
  select id into strict company from public.companies where code = 'bbtm';
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter := counter + 1;
    actor := ('db540000-0000-4000-8000-00000000010' || counter)::uuid;
    insert into auth.users(id,email) values(actor,'disciplinary-' || role_name || '@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,'disciplinary-' || role_name || '@example.invalid','Disciplinary fixture',company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
  end loop;
  insert into public.people(company_id,first_name,last_name,function_label,hired_on,active)
  values(company,'Fixture','DISCIPLINARY','Matelot',current_date-365,true) returning id into target_person;
  perform set_config('request.jwt.claim.sub','db540000-0000-4000-8000-000000000102',true);
  perform set_config('request.jwt.claims','{"sub":"db540000-0000-4000-8000-000000000102","role":"authenticated"}',true);
  execute 'set local role authenticated';
  assert public.disciplinary_has_access(company), 'Direction should have access';
  insert into public.disciplinary_cases(id,company_id,person_id,data)
  values(test_case_id,company,target_person,'{"employeeName":"Fixture DISCIPLINARY","fault":"simple","sanction":"avertissement","reason":"impregnation_presumee"}');
  insert into public.disciplinary_documents(case_id,file_name,drive_path,document_date,kind)
  values(test_case_id,'fixture.docx','1/Fixture DISCIPLINARY/2026-09-15/fixture.docx',current_date,'letter');
  assert (select count(*)=1 from public.disciplinary_cases where id=test_case_id), 'Direction reads its company case';
  begin
    update public.disciplinary_cases set person_id=person_id+1 where id=test_case_id;
    raise exception 'Case identity was mutable';
  exception when check_violation then null;
  end;
  execute 'reset role';
  counter := 0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    counter := counter+1;
    actor := ('db540000-0000-4000-8000-00000000010' || counter)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if role_name in ('admin','direction') then
      assert public.disciplinary_has_access(company), 'Allowed role denied';
      assert public.desktop_drive_scope('disciplinary',company,target_person)->>'directory' = 'Sanctions Disciplinaires', 'Launcher scope denied';
      assert (select count(*)=1 from public.disciplinary_documents where disciplinary_documents.case_id=test_case_id), 'Allowed role cannot read attachment metadata';
      update public.disciplinary_cases set data=data || '{"facts":"Updated by authorized fixture"}'::jsonb where id=test_case_id;
    else
      assert not public.disciplinary_has_access(company), 'Forbidden role access';
      begin
        perform public.desktop_drive_scope('disciplinary',company,target_person);
        raise exception 'Launcher scope leaked';
      exception when insufficient_privilege then null; end;
      assert (select count(*)=0 from public.disciplinary_cases where id=test_case_id), 'Confidential case leaked';
      assert (select count(*)=0 from public.disciplinary_documents where disciplinary_documents.case_id=test_case_id), 'Confidential attachment leaked';
      begin
        insert into public.disciplinary_documents(case_id,file_name,drive_path,document_date,kind)
        values(test_case_id,'forbidden.pdf','forbidden-' || role_name || '.pdf',current_date,'attachment');
        raise exception 'Unauthorized attachment insert succeeded';
      exception when insufficient_privilege then null;
      end;
    end if;
    assert not public.disciplinary_has_access(-987654), 'Cross-company permission leaked';
    begin perform public.desktop_drive_scope('disciplinary',-987654,target_person); raise exception 'Cross-company launcher scope leaked'; exception when insufficient_privilege then null; end;
    begin perform public.desktop_drive_scope('unknown',company,target_person); raise exception 'Unknown module allowed'; exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
  update public.role_module_permissions set is_visible=false where module_key='disciplinary' and role_key='direction';
  perform set_config('request.jwt.claim.sub','db540000-0000-4000-8000-000000000102',true);
  execute 'set local role authenticated';
  assert not public.disciplinary_has_access(company), 'Revoked permission still grants access';
  begin perform public.desktop_drive_scope('disciplinary',company,target_person); raise exception 'Revoked launcher scope leaked'; exception when insufficient_privilege then null; end;
  assert (select count(*)=0 from public.disciplinary_documents where disciplinary_documents.case_id=test_case_id), 'Revoked permission still reads files';
  execute 'reset role';
  begin
    update public.role_module_permissions set is_visible=true where module_key='disciplinary' and role_key='marin';
    raise exception 'The Admin UI can grant access to a forbidden profile';
  exception when check_violation then null;
  end;
  execute 'set local role anon';
  begin perform public.desktop_drive_scope('disciplinary',company,target_person); raise exception 'Anonymous launcher scope leaked'; exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.disciplinary_documents;
    raise exception 'Anonymous table access allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;
select 'PASS: Admin/Direction read and write; Armement/Capitaine/Marin, anonymous, wrong company and revoked permissions denied; document metadata protected; case identity immutable' as result;
rollback;
