-- Five independent authenticated profiles, two tenant fixtures, no simulated roles.
begin;
do $test$
declare
  company bigint; foreign_company bigint; actor uuid; role_name text; i integer:=0;
  shared_process uuid; foreign_process uuid; foreign_objective uuid;
  own_process uuid; objective uuid; update_id uuid; context jsonb; settings_revision integer;
  valid_publication bigint; invalid_publication bigint; history_count integer; started timestamptz;
  today_date date:=(now() at time zone 'Europe/Paris')::date;
begin
  insert into public.companies(code,name) values('qhse-policy-fixture-'||gen_random_uuid(),'QHSE policy fixture') returning id into company;
  insert into public.companies(code,name) values('qhse-policy-foreign-'||gen_random_uuid(),'QHSE policy foreign fixture') returning id into foreign_company;
  insert into public.qhse_policy_processes(company_id,name) values(company,'Shared process fixture') returning id into shared_process;
  insert into public.qhse_policy_processes(company_id,name) values(foreign_company,'Foreign process fixture') returning id into foreign_process;
  insert into public.qhse_policy_objectives(company_id,process_id,title,progress)
  values(foreign_company,foreign_process,'Foreign objective fixture',50) returning id into foreign_objective;
  insert into public.qhse_policy_objective_updates(company_id,objective_id,kind,progress,occurred_on,note,actor_id,actor_name)
  values(foreign_company,foreign_objective,'initial',50,today_date,'Foreign private history','a0400000-0000-4000-8000-000000000001','Foreign fixture');
  insert into public.qhse_policy_settings(company_id,document_url) values(foreign_company,'https://drive.google.com/file/d/foreign1234567890/view');
  insert into public.published_procedures(title,status,ism_chapter,storage_bucket,storage_path,file_name,mime_type,size_bytes)
  values('QHSE policy test publication','published','02 - Politique','procedure-documents','published/fixture-policy.pdf','fixture-policy.pdf','application/pdf',100) returning id into valid_publication;
  insert into public.published_procedures(title,status,ism_chapter,storage_bucket,storage_path,file_name,mime_type,size_bytes)
  values('Wrong chapter publication','published','01 - Généralités','procedure-documents','published/fixture-general.pdf','fixture-general.pdf','application/pdf',100) returning id into invalid_publication;
  update public.role_module_permissions set is_visible=true where module_key='qhsePolicy';
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1; actor:=('a0400000-0000-4000-8000-00000000000'||i)::uuid;
    insert into auth.users(id,email,raw_user_meta_data) values(actor,'qhse-policy-'||role_name||'@example.invalid','{"role":"admin"}');
    insert into public.profiles(id,email,display_name,active_company_id)
    values(actor,'qhse-policy-'||role_name||'@example.invalid','Policy '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
    execute 'set local role authenticated';
    context:=public.qhse_policy_snapshot();
    assert (context->>'can_edit')::boolean=(role_name in ('admin','direction')), 'Write permission differs from the real profile';
    assert exists(select 1 from public.qhse_policy_processes where id=shared_process), 'A real profile cannot read shared processes';
    assert not exists(select 1 from public.qhse_policy_processes where id=foreign_process), 'Foreign company process leaked';
    assert not exists(select 1 from public.qhse_policy_objectives where id=foreign_objective), 'Foreign company objective leaked';
    assert not exists(select 1 from public.qhse_policy_objective_updates where objective_id=foreign_objective), 'Foreign company history leaked';
    assert not exists(select 1 from public.qhse_policy_settings where company_id=foreign_company), 'Foreign documentary settings leaked';
    assert context::text not like '%Foreign%', 'Snapshot bypassed tenant RLS';
    if role_name in ('admin','direction') then
      own_process:=public.qhse_policy_save_process(null,'Process '||role_name,'Process description',5,null);
      begin
        perform public.qhse_policy_save_process(null,'process '||role_name,'',0,null);
        raise exception 'Duplicate active process accepted';
      exception when unique_violation then null; end;
      started:=clock_timestamp();
      objective:=public.qhse_policy_save_objective(null,own_process,'Objective '||role_name,'Description','Responsible fixture',today_date+30,0,null);
      assert (select count(*)=1 from public.qhse_policy_objective_updates where objective_id=objective), 'Initial state not recorded atomically';
      assert exists(select 1 from public.qhse_policy_objective_updates where objective_id=objective and kind='initial' and progress=0 and actor_id=actor and actor_name='Policy '||role_name and created_at>=started), 'Initial audit identity/timestamp incorrect';
      begin
        perform public.qhse_policy_add_objective_update(objective,101,today_date,'Invalid percentage',1);
        raise exception 'Invalid percentage accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.qhse_policy_add_objective_update(objective,12.123,today_date,'Invalid precision',1);
        raise exception 'Invalid percentage precision accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.qhse_policy_add_objective_update(objective,50,today_date+1,'Future observation',1);
        raise exception 'Future observation accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.qhse_policy_add_objective_update(objective,50,today_date,' ',1);
        raise exception 'Empty observation accepted';
      exception when invalid_parameter_value then null; end;
      assert (select progress=0 and revision=1 from public.qhse_policy_objectives where id=objective), 'Rejected history changed current progress';
      update_id:=public.qhse_policy_add_objective_update(objective,42.25,today_date,'Actual observation',1);
      assert (select progress=42.25 and revision=2 and updated_by=actor from public.qhse_policy_objectives where id=objective), 'Progress/revision/audit not changed together';
      assert (select progress=42.25 and note='Actual observation' and actor_id=actor and actor_name='Policy '||role_name from public.qhse_policy_objective_updates where id=update_id), 'Historical snapshot incorrect';
      select count(*) into history_count from public.qhse_policy_objective_updates where objective_id=objective;
      begin
        perform public.qhse_policy_add_objective_update(objective,99,today_date,'Stale observation',1);
        raise exception 'Stale observation overwrote concurrent progress';
      exception when serialization_failure then null; end;
      assert (select count(*)=history_count from public.qhse_policy_objective_updates where objective_id=objective), 'Stale write appended history';
      perform public.qhse_policy_save_objective(objective,own_process,'Updated title','Updated description','',null,null,2);
      assert (select progress=42.25 and revision=3 from public.qhse_policy_objectives where id=objective), 'Metadata edit modified progress';
      begin
        perform public.qhse_policy_save_objective(objective,own_process,'Updated title','','',null,90,3);
        raise exception 'Metadata edit bypassed immutable percentage history';
      exception when invalid_parameter_value then null; end;
      perform public.qhse_policy_archive_process(own_process,true,1);
      assert (select count(*)=history_count from public.qhse_policy_objective_updates where objective_id=objective), 'Process archival deleted history';
      begin
        perform public.qhse_policy_add_objective_update(objective,99,today_date,'Archived process',3);
        raise exception 'Archived process accepted a follow-up';
      exception when invalid_parameter_value then null; end;
      perform public.qhse_policy_archive_process(own_process,false,2);
      perform public.qhse_policy_archive_objective(objective,true,3);
      begin
        perform public.qhse_policy_add_objective_update(objective,99,today_date,'Archived objective',4);
        raise exception 'Archived objective accepted a follow-up';
      exception when invalid_parameter_value then null; end;
      perform public.qhse_policy_archive_objective(objective,false,4);
      select revision into settings_revision from public.qhse_policy_settings where company_id=company;
      perform public.qhse_policy_save_settings(valid_publication,'',settings_revision);
      assert (select publication_id=valid_publication and document_url='' and updated_by=actor from public.qhse_policy_settings where company_id=company), 'Valid published chapter 02 was not linked';
      select revision into settings_revision from public.qhse_policy_settings where company_id=company;
      perform public.qhse_policy_save_settings(invalid_publication,'',settings_revision);
      assert (select publication_id=invalid_publication from public.qhse_policy_settings where company_id=company), 'Safe published alternate chapter rejected';
      select revision into settings_revision from public.qhse_policy_settings where company_id=company;
      begin
        perform public.qhse_policy_save_settings(null,'javascript:alert(1)',settings_revision);
        raise exception 'Unsafe documentary source accepted';
      exception when invalid_parameter_value then null; end;
      begin
        perform public.qhse_policy_save_settings(null,'https://drive.google.com/file/d/1234567890abcdef/view',settings_revision);
        raise exception 'New free documentary URL accepted';
      exception when invalid_parameter_value then null; end;
      perform public.qhse_policy_save_settings(valid_publication,'',settings_revision);
      begin
        perform public.qhse_policy_save_settings(valid_publication,'',settings_revision);
        raise exception 'Stale settings overwrite accepted';
      exception when serialization_failure then null; end;
      begin
        perform public.qhse_policy_save_objective(null,foreign_process,'Forbidden','','',null,0,null);
        raise exception 'Foreign process accepted an objective';
      exception when insufficient_privilege then null; end;
      begin
        perform public.qhse_policy_add_objective_update(foreign_objective,60,today_date,'Foreign write',1);
        raise exception 'Foreign objective changed';
      exception when insufficient_privilege then null; end;
    else
      begin
        perform public.qhse_policy_save_process(null,'Forbidden','',0,null);
        raise exception 'Reader with forged user_metadata gained editing rights';
      exception when insufficient_privilege then null; end;
      begin
        perform qhse_policy_private.save_process(null,'Forbidden','',0,null);
        raise exception 'Reader bypassed public RPC via private function';
      exception when insufficient_privilege then null; end;
      begin
        perform public.qhse_policy_save_settings(valid_publication,'',null);
        raise exception 'Reader changed policy document';
      exception when insufficient_privilege then null; end;
      assert exists(select 1 from public.qhse_policy_objective_updates where company_id=company), 'Readers cannot see published progress history';
    end if;
    begin
      update public.qhse_policy_objectives set progress=100 where company_id=company;
      raise exception 'Direct percentage overwrite accepted';
    exception when insufficient_privilege then null; end;
    begin
      update public.qhse_policy_objective_updates set note='Modified history' where company_id=company;
      raise exception 'History editable by client';
    exception when insufficient_privilege then null; end;
    begin
      delete from public.qhse_policy_processes where company_id=company;
      raise exception 'Client deleted processes instead of archiving';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=false where module_key='qhsePolicy' and role_key=role_name;
    execute 'set local role authenticated';
    begin perform public.qhse_policy_snapshot(); raise exception 'Hidden module remains readable'; exception when insufficient_privilege then null; end;
    assert not exists(select 1 from public.qhse_policy_processes where company_id=company), 'Hidden module leaked table rows';
    execute 'reset role';
    update public.role_module_permissions set is_visible=true where module_key='qhsePolicy' and role_key=role_name;
    update public.company_memberships set active=false where company_id=company and user_id=actor;
    execute 'set local role authenticated';
    begin perform public.qhse_policy_snapshot(); raise exception 'Inactive member reads policy'; exception when insufficient_privilege then null; end;
    begin perform public.qhse_policy_save_process(null,'Inactive','',0,null); raise exception 'Inactive member edits policy'; exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
  begin
    update public.qhse_policy_objective_updates set note='Owner tampered' where id=update_id;
    raise exception 'Owner changed immutable audit history';
  exception when insufficient_privilege then null; end;
  assert not has_function_privilege('anon','public.qhse_policy_snapshot()','EXECUTE'), 'Anonymous snapshot executable';
  assert not has_function_privilege('anon','public.qhse_policy_add_objective_update(uuid,numeric,date,text,integer)','EXECUTE'), 'Anonymous progress write executable';
end $test$;
select 'PASS: five actual roles, tenant/module/membership isolation, metadata spoof denial, published chapter 02 linkage, atomic progress/history, revision conflicts, archival and immutable audit' as result;
rollback;
