-- Five independent real Auth subjects; all rows/permission changes roll back.
-- Storage rows below are synthetic metadata fixtures, not a Storage API upload test.
begin;
do $test$
declare
  company bigint; foreign_company bigint; actor uuid; role_name text; i integer:=0;
  shared_axis uuid; archived_axis uuid; foreign_axis uuid; source_axis uuid; target_axis uuid; empty_axis uuid;
  active_objective uuid; archived_objective uuid; follow_up uuid; token uuid; file_path text;
  source_revision integer; target_revision integer; empty_revision integer; archive_revision integer;
  context jsonb; requested jsonb; invalid_order jsonb; prepared jsonb; before_axes text; history_hash text; attachment_hash text;
  today_date date:=(now() at time zone 'Europe/Paris')::date;
begin
  insert into public.companies(code,name) values('qhse-axis-fixture-'||gen_random_uuid(),'QHSE strategic axes fixture') returning id into company;
  insert into public.companies(code,name) values('qhse-axis-foreign-'||gen_random_uuid(),'QHSE strategic axes foreign fixture') returning id into foreign_company;
  insert into public.qhse_policy_processes(company_id,name,position) values(company,'Shared axis fixture',0) returning id into shared_axis;
  insert into public.qhse_policy_processes(company_id,name,position,archived) values(company,'Archived axis fixture',20,true) returning id into archived_axis;
  insert into public.qhse_policy_processes(company_id,name) values(foreign_company,'Foreign axis fixture') returning id into foreign_axis;
  assert (select icon_key='general' from public.qhse_policy_processes where id=shared_axis), 'New axes must default to general';
  assert (select count(*)=1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='qhse_policy_save_process'), 'Ambiguous save-process overload retained';
  update public.role_module_permissions set is_visible=true where module_key='qhsePolicy';
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1; actor:=('a05e0000-0000-4000-8000-00000000000'||i)::uuid;
    insert into auth.users(id,email,raw_user_meta_data) values(actor,'qhse-axis-'||role_name||'@example.invalid','{"role":"admin"}');
    insert into public.profiles(id,email,display_name,active_company_id)
      values(actor,'qhse-axis-'||role_name||'@example.invalid','Strategic axis '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true)
      on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
  end loop;
  i:=0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1; actor:=('a05e0000-0000-4000-8000-00000000000'||i)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
    execute 'set local role authenticated';
    context:=public.qhse_policy_snapshot();
    assert (context->>'can_edit')::boolean=(role_name in ('admin','direction')), 'Real profile permission mismatch';
    assert not exists(select 1 from public.qhse_policy_processes where id=foreign_axis), 'Foreign axis read leaked';
    assert exists(select 1 from jsonb_array_elements(context->'processes') p where (p->>'id')::uuid=shared_axis and p->>'icon_key'='general'), 'Snapshot omitted persisted icon';
    if role_name in ('admin','direction') then
      source_axis:=public.qhse_policy_save_process(null,'Source '||role_name,'',25,null,'health');
      target_axis:=public.qhse_policy_save_process(null,'Target '||role_name,'',30,null,'cybersecurity');
      empty_axis:=public.qhse_policy_save_process(null,'Legacy five arguments '||role_name,'',35,null);
      assert (select icon_key='general' from public.qhse_policy_processes where id=empty_axis), 'Old caller creation not supported';
      perform public.qhse_policy_save_process(source_axis,'Source '||role_name,'Legacy edit',25,1);
      assert (select icon_key='health' and revision=2 from public.qhse_policy_processes where id=source_axis), 'Old caller edit reset persisted icon';
      perform public.qhse_policy_save_process(source_axis,'Source '||role_name,'Explicit general',25,2,'general');
      assert (select icon_key='general' and revision=3 from public.qhse_policy_processes where id=source_axis), 'Explicit general replaced by name inference';
      begin perform public.qhse_policy_save_process(source_axis,'Unsafe icon','','25',3,'script'); raise exception 'Arbitrary icon accepted'; exception when invalid_parameter_value then null; end;
      assert (select revision=3 from public.qhse_policy_processes where id=source_axis), 'Invalid icon partially wrote audit/revision';
      active_objective:=public.qhse_policy_save_objective(null,source_axis,'Active objective '||role_name,'','Office fixture',null,12.5,null);
      archived_objective:=public.qhse_policy_save_objective(null,source_axis,'Archived objective '||role_name,'','Office fixture',null,70,null);
      perform public.qhse_policy_archive_objective(archived_objective,true,1);
      prepared:=public.qhse_policy_prepare_attachments(active_objective,'[{"file_name":"proof.pdf","mime_type":"application/pdf","size_bytes":4}]');
      token:=(prepared->0->>'id')::uuid; file_path:=prepared->0->>'storage_path';
      insert into storage.objects(bucket_id,name,owner_id,metadata) values('qhse-policy-attachments',file_path,actor::text,'{"size":4,"mimetype":"application/pdf"}');
      follow_up:=public.qhse_policy_add_objective_update_with_attachments(active_objective,55,today_date,'Before transfer',1,array[token]);
      select jsonb_agg(jsonb_build_object('id',id,'revision',revision) order by position desc,id) into requested
        from public.qhse_policy_processes where company_id=company;
      perform public.qhse_policy_reorder_processes(requested);
      assert (select count(distinct position)=count(*) and min(position)=0 and max(position)=count(*)-1 from public.qhse_policy_processes where company_id=company), 'Reorder positions not normalized';
      assert not exists(select 1 from jsonb_array_elements(requested) with ordinality e(value,position)
        join public.qhse_policy_processes p on p.id=(e.value->>'id')::uuid
        where p.position<>e.position-1 or p.revision<>(e.value->>'revision')::integer+1 or p.updated_by<>actor), 'Order/revision/author not committed together';
      select md5(string_agg(to_jsonb(p)::text,'|' order by id)) into before_axes from public.qhse_policy_processes p where company_id=company;
      begin perform public.qhse_policy_reorder_processes(requested); raise exception 'Stale full-order revisions accepted'; exception when serialization_failure then null; end;
      select jsonb_agg(jsonb_build_object('id',id,'revision',revision) order by position,id) into requested from public.qhse_policy_processes where company_id=company;
      begin perform public.qhse_policy_reorder_processes(requested-0); raise exception 'Missing axis including archives accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_reorder_processes(requested||jsonb_build_array(requested->0)); raise exception 'Duplicate axis accepted'; exception when invalid_parameter_value then null; end;
      invalid_order:=jsonb_set(requested,'{0,id}',to_jsonb(foreign_axis::text));
      begin perform public.qhse_policy_reorder_processes(invalid_order); raise exception 'Foreign axis reordered'; exception when insufficient_privilege then null; end;
      begin perform public.qhse_policy_reorder_processes('[{"id":"invalid","revision":1}]'); raise exception 'Invalid UUID order accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_reorder_processes(jsonb_set(requested,'{0,revision}','2147483648')); raise exception 'Overflow revision accepted'; exception when invalid_parameter_value then null; end;
      assert (select md5(string_agg(to_jsonb(p)::text,'|' order by id))=before_axes from public.qhse_policy_processes p where company_id=company), 'Rejected order partially changed axes';
      select revision into source_revision from public.qhse_policy_processes where id=source_axis;
      select revision into target_revision from public.qhse_policy_processes where id=target_axis;
      select revision into archive_revision from public.qhse_policy_processes where id=archived_axis;
      select md5(string_agg(to_jsonb(u)::text,'|' order by id)) into history_hash from public.qhse_policy_objective_updates u where company_id=company;
      select md5(string_agg(to_jsonb(a)::text,'|' order by id)) into attachment_hash from public.qhse_policy_attachments a where company_id=company;
      begin perform public.qhse_policy_delete_process(source_axis,source_revision); raise exception 'Nonempty axis deleted without transfer'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_delete_process(source_axis,source_revision,source_axis,source_revision); raise exception 'Self transfer accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_delete_process(source_axis,source_revision,archived_axis,archive_revision); raise exception 'Archived target accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_delete_process(source_axis,source_revision,foreign_axis,1); raise exception 'Foreign transfer accepted'; exception when insufficient_privilege then null; end;
      begin perform public.qhse_policy_delete_process(source_axis,source_revision-1,target_axis,target_revision); raise exception 'Stale source revision accepted'; exception when serialization_failure then null; end;
      begin perform public.qhse_policy_delete_process(source_axis,source_revision,target_axis,target_revision-1); raise exception 'Stale target revision accepted'; exception when serialization_failure then null; end;
      assert (select count(*)=2 from public.qhse_policy_objectives where process_id=source_axis), 'Rejected deletion partially moved objectives';
      perform public.qhse_policy_delete_process(source_axis,source_revision,target_axis,target_revision);
      assert not exists(select 1 from public.qhse_policy_processes where id=source_axis), 'Axis was only archived, not deleted';
      assert (select process_id=target_axis and progress=55 and not archived and revision=3 and updated_by=actor from public.qhse_policy_objectives where id=active_objective), 'Active objective identity/progress/audit not retained on transfer';
      assert (select process_id=target_axis and progress=70 and archived and revision=3 from public.qhse_policy_objectives where id=archived_objective), 'Archived objective dropped or changed on transfer';
      assert (select revision=target_revision+1 from public.qhse_policy_processes where id=target_axis), 'Target concurrency token not invalidated';
      assert (select md5(string_agg(to_jsonb(u)::text,'|' order by id))=history_hash from public.qhse_policy_objective_updates u where company_id=company), 'Transfer rewrote immutable history';
      assert (select md5(string_agg(to_jsonb(a)::text,'|' order by id))=attachment_hash from public.qhse_policy_attachments a where company_id=company), 'Transfer rewrote attachment metadata';
      assert exists(select 1 from storage.objects where bucket_id='qhse-policy-attachments' and name=file_path), 'Evidence stopped being readable after transfer';
      begin perform public.qhse_policy_add_objective_update(active_objective,99,today_date,'Stale progress after transfer',2); raise exception 'Stale objective revision accepted after transfer'; exception when serialization_failure then null; end;
      select revision into empty_revision from public.qhse_policy_processes where id=empty_axis;
      perform public.qhse_policy_delete_process(empty_axis,empty_revision);
      assert not exists(select 1 from public.qhse_policy_processes where id=empty_axis), 'Empty axis deletion failed';
    else
      select jsonb_agg(jsonb_build_object('id',id,'revision',revision) order by position,id) into requested from public.qhse_policy_processes where company_id=company;
      begin perform public.qhse_policy_save_process(null,'Reader forbidden','','0',null,'safety'); raise exception 'Reader changed axes with spoofed user metadata'; exception when insufficient_privilege then null; end;
      begin perform public.qhse_policy_reorder_processes(requested); raise exception 'Reader reordered axes'; exception when insufficient_privilege then null; end;
      begin perform public.qhse_policy_delete_process(shared_axis,1); raise exception 'Reader deleted an axis'; exception when insufficient_privilege then null; end;
      assert exists(select 1 from public.qhse_policy_attachments where id=token), 'Real read profile lost transferred evidence metadata';
      assert exists(select 1 from storage.objects where bucket_id='qhse-policy-attachments' and name=file_path), 'Real read profile lost transferred evidence object';
    end if;
    begin update public.qhse_policy_processes set icon_key='safety' where id=shared_axis; raise exception 'Direct table mutation allowed'; exception when insufficient_privilege then null; end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=false where role_key=role_name and module_key='qhsePolicy';
    execute 'set local role authenticated';
    begin perform public.qhse_policy_reorder_processes('[]'); raise exception 'Hidden module allowed reorder'; exception when insufficient_privilege then null; end;
    begin perform public.qhse_policy_delete_process(shared_axis,1); raise exception 'Hidden module allowed delete'; exception when insufficient_privilege then null; end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=true where role_key=role_name and module_key='qhsePolicy';
  end loop;
  update public.company_memberships set active=false where company_id=company and user_id='a05e0000-0000-4000-8000-000000000001';
  perform set_config('request.jwt.claim.sub','a05e0000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims','{"sub":"a05e0000-0000-4000-8000-000000000001","role":"authenticated"}',true);
  execute 'set local role authenticated';
  begin perform public.qhse_policy_delete_process(shared_axis,1); raise exception 'Inactive manager deleted axis'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  assert not has_function_privilege('anon','public.qhse_policy_reorder_processes(jsonb)','EXECUTE'), 'Anonymous reorder callable';
  assert not has_function_privilege('anon','public.qhse_policy_delete_process(uuid,integer,uuid,integer)','EXECUTE'), 'Anonymous delete callable';
  assert not has_table_privilege('authenticated','public.qhse_policy_processes','INSERT,UPDATE,DELETE'), 'Direct axis write grants exposed';
end $test$;
rollback;
select 'QHSE_POLICY_STRATEGIC_AXES_TEST_PASS' as result;
