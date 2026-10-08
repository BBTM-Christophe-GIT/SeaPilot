-- Transaction-only fixtures: actual Auth identities/roles and metadata objects.
-- These rows are rolled back and do not represent uploaded physical files.
-- Real Storage API bytes/signing are additionally verified through the app.
begin;
do $test$
declare
  company bigint; foreign_company bigint; person bigint; inactive_person bigint; former_person bigint; future_person bigint; undated_person bigint; foreign_person bigint; vessel bigint; foreign_vessel bigint;
  admin_id uuid:='a0410000-0000-4000-8000-000000000001'; actor uuid; role_name text; i integer:=0; process uuid; foreign_process uuid; objective uuid; foreign_objective uuid;
  target uuid; retained_target uuid; bad_token uuid; bad_path text; new_update_id uuid; shared_update uuid; shared_token uuid; foreign_token uuid; pending_token uuid; token uuid; path text; shared_path text; foreign_path text; pending_path text;
  options jsonb; context jsonb; files jsonb; prepared jsonb; count_before bigint; revision_before integer; active_publication bigint; unpublished bigint;
  today_date date:=(now() at time zone 'Europe/Paris')::date;
begin
  insert into public.companies(code,name) values('qhse-evidence-'||gen_random_uuid(),'QHSE evidence fixture') returning id into company;
  insert into public.companies(code,name) values('qhse-evidence-foreign-'||gen_random_uuid(),'Foreign evidence fixture') returning id into foreign_company;
  update public.role_module_permissions set is_visible=true where module_key='qhsePolicy';
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1; actor:=('a0410000-0000-4000-8000-00000000000'||i)::uuid;
    insert into auth.users(id,email,raw_user_meta_data) values(actor,'qhse-evidence-'||role_name||'@example.invalid','{"role":"admin"}');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,'qhse-evidence-'||role_name||'@example.invalid','Evidence '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
  end loop;
  insert into public.people(company_id,first_name,last_name,hired_on,active) values(company,'Current','Personnel',today_date-10,true) returning id into person;
  insert into public.people(company_id,first_name,last_name,hired_on,active) values(company,'Current','Inactive flag',today_date-10,false) returning id into inactive_person;
  insert into public.people(company_id,first_name,last_name,hired_on,departed_on) values(company,'Former','Personnel',today_date-10,today_date) returning id into former_person;
  insert into public.people(company_id,first_name,last_name,hired_on) values(company,'Future','Personnel',today_date+1) returning id into future_person;
  insert into public.people(company_id,first_name,last_name) values(company,'Undated','Personnel') returning id into undated_person;
  insert into public.people(company_id,first_name,last_name,hired_on) values(foreign_company,'Foreign','Personnel',today_date-1) returning id into foreign_person;
  insert into public.vessels(company_id,name) values(company,'GOURY fixture') returning id into vessel;
  insert into public.vessels(company_id,name) values(foreign_company,'Foreign vessel') returning id into foreign_vessel;
  insert into public.qhse_policy_processes(company_id,name) values(company,'Evidence process') returning id into process;
  insert into public.qhse_policy_processes(company_id,name) values(foreign_company,'Foreign process') returning id into foreign_process;
  insert into public.qhse_policy_objectives(company_id,process_id,title,owner_label,owner_kind) values(company,process,'Shared evidence objective','Armement - Cherbourg','office') returning id into objective;
  insert into public.qhse_policy_objectives(company_id,process_id,title,owner_label,owner_kind) values(foreign_company,foreign_process,'Foreign objective','Foreign office','office') returning id into foreign_objective;
  insert into public.qhse_policy_objective_updates(company_id,objective_id,kind,progress,occurred_on,note,actor_id,actor_name)
  values(company,objective,'initial',0,today_date,'Shared initial',admin_id,'Evidence admin') returning id into shared_update;
  shared_token:=gen_random_uuid(); shared_path:=company||'/'||objective||'/'||shared_token||'.pdf';
  insert into qhse_policy_private.uploads(id,company_id,objective_id,actor_id,file_name,mime_type,size_bytes,storage_path,finalized)
  values(shared_token,company,objective,admin_id,'preuve.pdf','application/pdf',4,shared_path,true);
  insert into public.qhse_policy_attachments(id,company_id,objective_id,update_id,file_name,mime_type,size_bytes,storage_path)
  values(shared_token,company,objective,shared_update,'preuve.pdf','application/pdf',4,shared_path);
  insert into storage.objects(bucket_id,name,owner_id,metadata) values('qhse-policy-attachments',shared_path,admin_id::text,'{"size":4,"mimetype":"application/pdf"}');
  foreign_token:=gen_random_uuid(); foreign_path:=foreign_company||'/'||foreign_objective||'/'||foreign_token||'.pdf';
  insert into qhse_policy_private.uploads(id,company_id,objective_id,actor_id,file_name,mime_type,size_bytes,storage_path) values(foreign_token,foreign_company,foreign_objective,admin_id,'foreign.pdf','application/pdf',4,foreign_path);
  insert into storage.objects(bucket_id,name,owner_id,metadata) values('qhse-policy-attachments',foreign_path,admin_id::text,'{"size":4,"mimetype":"application/pdf"}');
  pending_token:=gen_random_uuid(); pending_path:=company||'/'||objective||'/'||pending_token||'.pdf';
  insert into qhse_policy_private.uploads(id,company_id,objective_id,actor_id,file_name,mime_type,size_bytes,storage_path) values(pending_token,company,objective,admin_id,'pending.pdf','application/pdf',4,pending_path);
  insert into storage.objects(bucket_id,name,owner_id,metadata) values('qhse-policy-attachments',pending_path,admin_id::text,'{"size":4,"mimetype":"application/pdf"}');
  insert into public.published_procedures(title,status,ism_chapter,storage_bucket,storage_path,file_name,mime_type,size_bytes)
  values('Published alternate chapter','published','08','procedure-documents','published/fixture-other.pdf','fixture-other.pdf','application/pdf',4) returning id into active_publication;
  insert into public.published_procedures(title,status,ism_chapter,storage_bucket,storage_path,file_name,mime_type,size_bytes)
  values('Unpublished fixture','draft','02','procedure-documents','published/fixture-draft.pdf','fixture-draft.pdf','application/pdf',4) returning id into unpublished;
  insert into storage.objects(bucket_id,name,owner_id,metadata) values('procedure-documents','published/fixture-other.pdf',admin_id::text,'{"size":4,"mimetype":"application/pdf"}');
  i:=0;
  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    i:=i+1; actor:=('a0410000-0000-4000-8000-00000000000'||i)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','user_metadata',jsonb_build_object('role','admin'))::text,true);
    execute 'set local role authenticated';
    context:=public.qhse_policy_snapshot();
    assert exists(select 1 from public.qhse_policy_attachments where id=shared_token), 'Real role cannot read shared attachment metadata';
    assert exists(select 1 from storage.objects where bucket_id='qhse-policy-attachments' and name=shared_path), 'Real role cannot read finalized Storage evidence';
    assert exists(select 1 from storage.objects where bucket_id='procedure-documents' and name='published/fixture-other.pdf'), 'Published alternative policy cannot be read by a real role';
    assert not exists(select 1 from storage.objects where bucket_id='qhse-policy-attachments' and name=foreign_path), 'Foreign company Storage evidence leaked';
    assert not exists(select 1 from public.qhse_policy_objectives where id=foreign_objective), 'Foreign objective leaked';
    assert context::text not like '%Foreign%', 'Foreign company snapshot leaked';
    assert (select count(*) from storage.objects where name=pending_path)=case when role_name='admin' then 1 else 0 end, 'Unfinalized evidence leaked to another actor';
    assert not has_table_privilege('authenticated','public.qhse_policy_attachments','INSERT,UPDATE,DELETE'), 'Attachment table mutation grants leaked';
    begin update public.qhse_policy_attachments set file_name='overwrite' where id=shared_token; raise exception 'Attachment mutation accepted'; exception when insufficient_privilege then null; end;
    update storage.objects set metadata='{}' where bucket_id='qhse-policy-attachments' and name=shared_path;
    assert exists(select 1 from storage.objects where name=shared_path and metadata->>'size'='4'), 'Storage UPDATE replaced finalized evidence';
    assert not qhse_policy_private.storage_access(shared_path,'delete'), 'QHSE policy permits finalized evidence cleanup';
    begin
      delete from storage.objects where bucket_id='qhse-policy-attachments' and name=shared_path;
    exception when insufficient_privilege then null; -- Platform protect_delete requires the Storage API.
    end;
    assert exists(select 1 from storage.objects where name=shared_path), 'Storage DELETE erased finalized evidence';
    if role_name in ('admin','direction') then
      options:=public.qhse_policy_owner_options();
      assert options->'people' @> jsonb_build_array(jsonb_build_object('id',person)), 'Employed personnel missing';
      assert options->'people' @> jsonb_build_array(jsonb_build_object('id',inactive_person)), 'RH active=false employed record incorrectly excluded';
      assert not (options->'people' @> jsonb_build_array(jsonb_build_object('id',former_person))), 'Departed today incorrectly listed En poste';
      assert not (options->'people' @> jsonb_build_array(jsonb_build_object('id',future_person))), 'Future hire listed';
      assert not (options->'people' @> jsonb_build_array(jsonb_build_object('id',undated_person))), 'Undated hire listed';
      assert not (options->'people' @> jsonb_build_array(jsonb_build_object('id',foreign_person))), 'Foreign personnel catalog leaked';
      assert options->'vessels' @> jsonb_build_array(jsonb_build_object('id',vessel)), 'Own vessel missing';
      retained_target:=public.qhse_policy_save_objective(null,process,'Retained owner '||role_name,'','',null,0,null,'person',person,null);
      execute 'reset role';
      update public.people set departed_on=today_date where id=person;
      execute 'set local role authenticated';
      perform public.qhse_policy_save_objective(retained_target,process,'Metadata after departure','','Spoofed replacement',null,null,1,'person',person,null);
      assert (select owner_label='Current Personnel' and owner_person_id=person from public.qhse_policy_objectives where id=retained_target), 'Unchanged departed assignment not preserved';
      execute 'reset role';
      update public.people set departed_on=null where id=person;
      execute 'set local role authenticated';
      target:=public.qhse_policy_save_objective(null,process,'Structured owner '||role_name,'','Spoofed label',null,0,null,'person',person,null);
      assert (select owner_label='Current Personnel' and owner_person_id=person from public.qhse_policy_objectives where id=target), 'Person owner label was not computed server-side';
      assert (select owner_label='Current Personnel' from public.qhse_policy_objective_updates where objective_id=target and kind='initial'), 'Initial owner snapshot missing';
      perform public.qhse_policy_save_objective(target,process,'Vessel owner','','Spoofed label',null,null,1,'vessel',null,vessel);
      assert (select owner_label='Équipages GOURY fixture' from public.qhse_policy_objectives where id=target), 'Vessel owner label incorrect';
      perform public.qhse_policy_save_objective(target,process,'Office owner','',' Armement - Cherbourg ',null,null,2,'office',null,null);
      begin perform public.qhse_policy_save_objective(null,process,'Missing owner','','',null,0,null,null,null,null); raise exception 'Blank owner accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_save_objective(null,process,'Foreign person','','',null,0,null,'person',foreign_person,null); raise exception 'Foreign person accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_save_objective(null,process,'Former person','','',null,0,null,'person',former_person,null); raise exception 'Former person accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_save_objective(null,process,'Foreign vessel','','',null,0,null,'vessel',null,foreign_vessel); raise exception 'Foreign vessel accepted'; exception when invalid_parameter_value then null; end;
      files:=jsonb_build_array(jsonb_build_object('file_name','proof.pdf','mime_type','application/pdf','size_bytes',4));
      begin perform public.qhse_policy_prepare_attachments(target,'[{"file_name":"unsafe.html","mime_type":"text/html","size_bytes":4}]'); raise exception 'Unsafe attachment extension accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_prepare_attachments(target,'[{"file_name":"large.pdf","mime_type":"application/pdf","size_bytes":26214401}]'); raise exception 'Oversize attachment reservation accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_prepare_attachments(target,(select jsonb_agg(files->0) from generate_series(1,11))); raise exception 'Too many attachment reservations accepted'; exception when invalid_parameter_value then null; end;
      begin insert into storage.objects(bucket_id,name,owner_id,metadata) values('qhse-policy-attachments',company||'/'||target||'/'||gen_random_uuid()||'.pdf',actor::text,'{"size":4,"mimetype":"application/pdf"}'); raise exception 'Unreserved spoof path uploaded'; exception when insufficient_privilege then null; end;
      prepared:=public.qhse_policy_prepare_attachments(target,files); bad_token:=(prepared->0->>'id')::uuid; bad_path:=prepared->0->>'storage_path';
      insert into storage.objects(bucket_id,name,owner_id,metadata) values('qhse-policy-attachments',bad_path,actor::text,'{"size":5,"mimetype":"application/pdf"}');
      begin perform public.qhse_policy_add_objective_update_with_attachments(target,50,today_date,'Spoofed size',3,array[bad_token]); raise exception 'Actual Storage size mismatch accepted'; exception when invalid_parameter_value then null; end;
      assert qhse_policy_private.storage_access(bad_path,'delete'), 'Actor manager cannot clean rejected staging';
      prepared:=public.qhse_policy_prepare_attachments(target,files); bad_token:=(prepared->0->>'id')::uuid; bad_path:=prepared->0->>'storage_path';
      insert into storage.objects(bucket_id,name,owner_id,metadata) values('qhse-policy-attachments',bad_path,actor::text,'{"size":4,"mimetype":"image/png"}');
      begin perform public.qhse_policy_add_objective_update_with_attachments(target,50,today_date,'Spoofed MIME',3,array[bad_token]); raise exception 'Actual Storage MIME mismatch accepted'; exception when invalid_parameter_value then null; end;
      prepared:=public.qhse_policy_prepare_attachments(target,files); token:=(prepared->0->>'id')::uuid; path:=prepared->0->>'storage_path';
      begin perform public.qhse_policy_add_objective_update_with_attachments(target,50,today_date,'Missing upload',3,array[token]); raise exception 'Missing Storage object accepted'; exception when invalid_parameter_value then null; end;
      assert (select progress=0 and revision=3 from public.qhse_policy_objectives where id=target), 'Missing object changed progress';
      begin insert into storage.objects(bucket_id,name,owner_id,metadata) values('qhse-policy-attachments',path,admin_id::text,'{"size":4,"mimetype":"application/pdf"}'); if actor<>admin_id then raise exception 'Spoofed upload owner accepted'; end if; exception when insufficient_privilege then assert actor<>admin_id; end;
      if actor<>admin_id then insert into storage.objects(bucket_id,name,owner_id,metadata) values('qhse-policy-attachments',path,actor::text,'{"size":4,"mimetype":"application/pdf"}'); end if;
      begin perform public.qhse_policy_add_objective_update_with_attachments(target,50,today_date,'Foreign token',3,array[foreign_token]); raise exception 'Foreign upload token accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_add_objective_update_with_attachments(target,50,today_date,'Duplicate token',3,array[token,token]); raise exception 'Repeated token accepted'; exception when invalid_parameter_value then null; end;
      new_update_id:=public.qhse_policy_add_objective_update_with_attachments(target,50,today_date,'Validated upload',3,array[token]);
      assert (select revision=4 and progress=50 from public.qhse_policy_objectives where id=target), 'Commit did not change progress and revision';
      assert exists(select 1 from public.qhse_policy_attachments where id=token and update_id=new_update_id and objective_id=target), 'Attachment not committed with history';
      assert (select owner_label='Armement - Cherbourg' from public.qhse_policy_objective_updates where id=new_update_id), 'Follow-up owner snapshot missing';
      select count(*) into count_before from public.qhse_policy_objective_updates where objective_id=target;
      begin perform public.qhse_policy_add_objective_update_with_attachments(target,60,today_date,'Stale update',3,'{}'); raise exception 'Stale update accepted'; exception when serialization_failure then null; end;
      assert (select count(*)=count_before from public.qhse_policy_objective_updates where objective_id=target), 'Stale attachment writer appended history';
      begin perform public.qhse_policy_add_objective_update_with_attachments(target,60,today_date,'Reused token',4,array[token]); raise exception 'Finalized upload token reused'; exception when invalid_parameter_value then null; end;
      perform public.qhse_policy_archive_objective(target,true,4);
      begin perform public.qhse_policy_prepare_attachments(target,files); raise exception 'Archived objective upload accepted'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_add_objective_update_with_attachments(target,60,today_date,'Archived update',5,'{}'); raise exception 'Archived history accepted'; exception when invalid_parameter_value then null; end;
      assert exists(select 1 from storage.objects where name=path), 'Archival removed evidence';
      select revision into revision_before from public.qhse_policy_settings where company_id=company;
      perform public.qhse_policy_save_settings(active_publication,'',revision_before);
      select revision into revision_before from public.qhse_policy_settings where company_id=company;
      begin perform public.qhse_policy_save_settings(unpublished,'',revision_before); raise exception 'Unpublished PDF selected'; exception when invalid_parameter_value then null; end;
      begin perform public.qhse_policy_save_settings(null,'https://drive.google.com/file/d/arbitrary123456789/view',revision_before); raise exception 'New free URL accepted'; exception when invalid_parameter_value then null; end;
    else
      begin perform public.qhse_policy_owner_options(); raise exception 'Read profile obtained private personnel catalog'; exception when insufficient_privilege then null; end;
      begin perform public.qhse_policy_prepare_attachments(objective,'[{"file_name":"proof.pdf","mime_type":"application/pdf","size_bytes":4}]'); raise exception 'Read profile reserved upload'; exception when insufficient_privilege then null; end;
      begin perform public.qhse_policy_add_objective_update_with_attachments(objective,50,today_date,'Spoofed administrator',1,'{}'); raise exception 'Read profile wrote follow-up'; exception when insufficient_privilege then null; end;
      begin insert into storage.objects(bucket_id,name,owner_id,metadata) values('qhse-policy-attachments',company||'/'||objective||'/'||gen_random_uuid()||'.pdf',actor::text,'{"size":4,"mimetype":"application/pdf"}'); raise exception 'Read profile uploaded'; exception when insufficient_privilege then null; end;
    end if;
    execute 'reset role';
  end loop;
  -- Mutation guard remains effective even for direct SQL from the owner role.
  begin update public.qhse_policy_attachments set file_name='owner mutation' where id=shared_token; raise exception 'Attachment audit mutable'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated')::text,true);
  update public.company_memberships set active=false where company_id=company and user_id=admin_id;
  execute 'set local role authenticated';
  assert not exists(select 1 from storage.objects where name=shared_path), 'Inactive membership read storage';
  begin perform public.qhse_policy_owner_options(); raise exception 'Inactive membership catalog accepted'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  update public.company_memberships set active=true where company_id=company and user_id=admin_id;
  update public.role_module_permissions set is_visible=false where role_key='admin' and module_key='qhsePolicy';
  execute 'set local role authenticated';
  assert not exists(select 1 from storage.objects where name=shared_path), 'Hidden module read evidence';
  execute 'reset role';
  assert not has_function_privilege('anon','public.qhse_policy_owner_options()','EXECUTE'), 'Anonymous owner catalog exposed';
  assert not has_function_privilege('anon','public.qhse_policy_prepare_attachments(uuid,jsonb)','EXECUTE'), 'Anonymous upload reservation exposed';
  assert not has_table_privilege('authenticated','qhse_policy_private.uploads','SELECT,INSERT,UPDATE,DELETE'), 'Staging tokens table grants leaked';
end $test$;
rollback;
select 'QHSE_POLICY_OWNERS_ATTACHMENTS_TEST_PASS' as result;
