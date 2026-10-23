-- Real authenticated Admin/Direction/Armement/Capitaine/Marin fixtures. No simulated UI roles.
-- Every fixture, object, document and transfer is rolled back.
begin;
do $test$
declare
  c bigint; other_c bigint; source_vessel bigint; target bigint; collision_target bigint; yard bigint; office bigint; inactive_vessel bigint; other_vessel bigint;
  item bigint; towing bigint; source_item bigint; retired bigint; yard_item bigint; other_item bigint; source_person bigint;
  old_report bigint; return_report bigint; current_report bigint; certificate bigint; entry bigint;
  uid uuid; role_name text; token timestamptz; initial jsonb; snapshot jsonb; generation bigint; count_before bigint;
  old_path text; legacy_path text; orphan_path text; new_path text; report_path text; fresh_item bigint;
  checks jsonb := '{"EG":"ok","ID":"ok","NID":"na","V1":"ok","V2":"ok","V3":"ok","V4":"ok","V5":"ok"}';
begin
  select id into c from public.companies where code = 'bbtm';
  insert into public.companies(code,name) values('lifting-transfer-other','Transfer other tenant') returning id into other_c;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'TRANSFER SOURCE','X-SRC',true,'vessel') returning id into source_vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'TRANSFER TARGET','X-DST',true,'vessel') returning id into target;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'TRANSFER COLLISION','X-COL',true,'vessel') returning id into collision_target;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'TRANSFER YARD','X-YRD',true,'quay') returning id into yard;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'TRANSFER OFFICE','X-OFF',true,'office') returning id into office;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'TRANSFER INACTIVE','X-OFF',false,'vessel') returning id into inactive_vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(other_c,'TRANSFER OTHER','X-OTH',true,'vessel') returning id into other_vessel;
  for uid,role_name in select * from (values
    ('9e230000-0000-0000-0000-000000000001'::uuid,'admin'),
    ('9e230000-0000-0000-0000-000000000002'::uuid,'direction'),
    ('9e230000-0000-0000-0000-000000000003'::uuid,'armement'),
    ('9e230000-0000-0000-0000-000000000004'::uuid,'capitaine'),
    ('9e230000-0000-0000-0000-000000000005'::uuid,'marin'),
    ('9e230000-0000-0000-0000-000000000006'::uuid,'capitaine'),
    ('9e230000-0000-0000-0000-000000000007'::uuid,'marin')) f(id,role_key)
  loop
    insert into auth.users(id,email) values(uid,uid||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(uid,uid||'@example.invalid','Transfer '||role_name,c);
    insert into public.company_memberships(company_id,user_id,active) values(c,uid,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(uid,c,role_name);
    if role_name in ('capitaine','marin') then
      insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
        values(c,uid,'Transfer',uid::text,case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,true) returning id into source_person;
      insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
        values(c,case when uid in ('9e230000-0000-0000-0000-000000000004'::uuid,'9e230000-0000-0000-0000-000000000005'::uuid) then source_vessel else target end,
          source_person,current_date-1,current_date+1,case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,'confirmed');
    end if;
  end loop;
  insert into public.lifting_inventory(company_id,vessel_id,kind,reference,material_type,description,serial_number,source_key,source_data,
    commissioned_on,added_on,last_control_on,service_version,replacement_history)
    values(c,source_vessel,'lifting','901','Manilles','Physical transferred shackle','SERIAL-KEEP','transfer-provenance',
      '{"origin":"historical import"}',current_date-100,current_date-200,current_date-50,2,'[{"previous_service_version":1}]') returning id into item;
  insert into public.lifting_inventory(company_id,vessel_id,kind,reference,material_type,towing_type,description)
    values(c,source_vessel,'towing','901','Remorque','textile_line','Physical towing line') returning id into towing;
  insert into public.lifting_inventory(company_id,vessel_id,kind,reference,material_type,description)
    values(c,source_vessel,'lifting','902','Manilles','Onboard permission target') returning id into source_item;
  insert into public.lifting_inventory(company_id,vessel_id,kind,reference,material_type,description,active)
    values(c,source_vessel,'lifting','903','Manilles','Retired item',false) returning id into retired;
  insert into public.lifting_inventory(company_id,vessel_id,kind,reference,material_type,description)
    values(c,yard,'lifting','904','Manilles','Yard item') returning id into yard_item;
  insert into public.lifting_inventory(company_id,vessel_id,kind,reference,material_type,description,active)
    values(c,collision_target,'lifting','901','Manilles','Retired identity still reserved',false);
  insert into public.lifting_inventory(company_id,vessel_id,kind,reference,material_type,description)
    values(other_c,other_vessel,'lifting','901','Manilles','Other tenant equipment') returning id into other_item;
  select to_jsonb(i) into initial from public.lifting_inventory i where id=item;
  old_path:=c||'/'||source_vessel||'/'||item||'/2/'||gen_random_uuid()||'.pdf';
  legacy_path:=c||'/'||source_vessel||'/'||item||'/'||gen_random_uuid()||'.pdf';
  orphan_path:=c||'/'||source_vessel||'/'||item||'/2/'||gen_random_uuid()||'.pdf';
  insert into storage.objects(bucket_id,name,metadata) values
    ('lifting-certificates',old_path,'{"mimetype":"application/pdf","size":100}'),
    ('lifting-certificates',legacy_path,'{"mimetype":"application/pdf","size":100}'),
    ('lifting-certificates',orphan_path,'{"mimetype":"application/pdf","size":100}');
  insert into public.lifting_item_certificates(item_id,service_version,storage_path,file_name,mime_type,file_size,created_by) values
    (item,2,old_path,'Current physical generation.pdf','application/pdf',100,'9e230000-0000-0000-0000-000000000001'),
    (item,1,legacy_path,'Previous physical generation.pdf','application/pdf',100,'9e230000-0000-0000-0000-000000000001');
  insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,bytes,sha256,source_sha256,verified_at)
    values('lifting-certificates',old_path,'documents/transfer-fixture/'||item||'.pdf',
      'https://transfer-fixture.private.blob.vercel-storage.com/documents/transfer-fixture/'||item||'.pdf',
      'Physical certificate.pdf','application/pdf',100,repeat('a',64),repeat('a',64),clock_timestamp());
  insert into public.lifting_inspections(company_id,vessel_id,kind,inspection_year,issued_on,expires_on,vessel_snapshot)
    values(c,source_vessel,'lifting',extract(year from current_date),current_date,current_date+365,jsonb_build_object('id',source_vessel,'acronym','X-SRC')) returning id into old_report;
  insert into public.lifting_inspection_entries(inspection_id,item_id,item_snapshot,condition,checks)
    values(old_report,item,initial,'good',checks) returning id into entry;
  select item_snapshot into snapshot from public.lifting_inspection_entries where id=entry;
  select count(*) into count_before from public.lifting_inventory where company_id=c;
  assert not has_table_privilege('authenticated','public.lifting_inventory','UPDATE'), 'No direct update grant';
  assert not has_function_privilege('anon','public.transfer_lifting_item(bigint,bigint,bigint,timestamptz)','EXECUTE'), 'Anonymous RPC denied';
  assert not has_function_privilege('anon','private.transfer_lifting_item(bigint,bigint,bigint,timestamptz)','EXECUTE'), 'Anonymous implementation denied';
  assert not (select prosecdef from pg_proc where oid='public.transfer_lifting_item(bigint,bigint,bigint,timestamptz)'::regprocedure), 'Public wrapper is invoker';
  execute 'set local role authenticated';
  for uid,role_name in select * from (values
    ('9e230000-0000-0000-0000-000000000001'::uuid,'admin'),
    ('9e230000-0000-0000-0000-000000000002'::uuid,'direction'),
    ('9e230000-0000-0000-0000-000000000003'::uuid,'armement'),
    ('9e230000-0000-0000-0000-000000000004'::uuid,'capitaine'),
    ('9e230000-0000-0000-0000-000000000005'::uuid,'marin')) f(id,role_key)
  loop
    perform set_config('request.jwt.claim.sub',uid::text,true);
    assert public.lifting_can_access(c,source_vessel), 'True profile can access its source inventory';
    if role_name in ('capitaine','marin') then
      select updated_at into token from public.lifting_inventory where id=source_item;
      begin perform public.transfer_lifting_item(source_item,source_vessel,target,token); raise exception 'Onboard role transferred an item'; exception when insufficient_privilege then null; end;
      assert exists(select 1 from public.lifting_inventory where id=source_item and vessel_id=source_vessel and assignment_version=1), 'Denied onboard transfer changes nothing';
    else
      select updated_at,assignment_version into token,generation from public.lifting_inventory where id=item;
      begin perform public.transfer_lifting_item(item,source_vessel,collision_target,token); raise exception 'Reference collision accepted'; exception when unique_violation then assert sqlerrm like 'Cette référence existe déjà%',sqlerrm; end;
      assert exists(select 1 from public.lifting_inventory where id=item and vessel_id=source_vessel and updated_at=token and assignment_version=generation), 'Collision is atomic';
      execute 'reset role';
      assert not exists(select 1 from public.lifting_inventory_counters where company_id=c and vessel_id=collision_target), 'Failed collision rolls counter reservation back';
      execute 'set local role authenticated';
      assert public.transfer_lifting_item(item,source_vessel,target,token)=item, 'Transfer keeps physical item id';
      assert exists(select 1 from public.lifting_inventory where id=item and vessel_id=target and assignment_version=generation+1 and updated_by=uid and updated_at<>token), 'Server assignment version and actor';
      begin perform public.transfer_lifting_item(item,target,source_vessel,token); raise exception 'Stale token accepted'; exception when serialization_failure then null; end;
      select updated_at into token from public.lifting_inventory where id=item;
      begin perform public.transfer_lifting_item(item,source_vessel,source_vessel,token); raise exception 'Same vessel accepted'; exception when invalid_parameter_value then null; end;
      if role_name<>'armement' then perform public.transfer_lifting_item(item,target,source_vessel,token); end if;
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub','9e230000-0000-0000-0000-000000000001',true);
  select updated_at into token from public.lifting_inventory where id=item;
  assert (select to_jsonb(i)-array['vessel_id','assignment_version','updated_at','updated_by'] from public.lifting_inventory i where id=item)
    = initial-array['vessel_id','assignment_version','updated_at','updated_by'], 'Identity, source metadata, generation, dates and certificates deadline unchanged';
  assert (select count(*) from public.lifting_inventory where company_id=c)=count_before, 'No item copied or deleted';
  assert (select item_snapshot from public.lifting_inspection_entries where id=entry)=snapshot, 'Historical snapshot unchanged';
  foreach fresh_item in array array[yard,office,inactive_vessel,other_vessel] loop
    begin perform public.transfer_lifting_item(item,target,fresh_item,token); raise exception 'Invalid destination accepted'; exception when insufficient_privilege then null; end;
  end loop;
  begin perform public.transfer_lifting_item(item,source_vessel,collision_target,token); raise exception 'Wrong expected source accepted'; exception when serialization_failure then null; end;
  begin perform public.transfer_lifting_item(item,target,source_vessel,null); raise exception 'Null token accepted'; exception when invalid_parameter_value then null; end;
  begin perform public.transfer_lifting_item(retired,source_vessel,target,(select updated_at from public.lifting_inventory where id=retired)); raise exception 'Retired item transferred'; exception when invalid_parameter_value then null; end;
  begin perform public.transfer_lifting_item(other_item,other_vessel,target,clock_timestamp()); raise exception 'Other tenant equipment transferred'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  update public.company_memberships set active=false where company_id=c and user_id='9e230000-0000-0000-0000-000000000001';
  execute 'set local role authenticated';
  begin perform public.transfer_lifting_item(item,target,source_vessel,token); raise exception 'Inactive membership transferred equipment'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  update public.company_memberships set active=true where company_id=c and user_id='9e230000-0000-0000-0000-000000000001';
  insert into public.company_memberships(company_id,user_id,active) values(other_c,'9e230000-0000-0000-0000-000000000001',true);
  update public.user_roles set company_id=other_c where company_id=c and user_id='9e230000-0000-0000-0000-000000000001';
  execute 'set local role authenticated';
  begin perform public.transfer_lifting_item(item,target,source_vessel,token); raise exception 'Role from another company authorized transfer'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  update public.user_roles set company_id=c where company_id=other_c and user_id='9e230000-0000-0000-0000-000000000001';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.transfer_lifting_item(item,target,source_vessel,token); raise exception 'Missing authenticated identity transferred equipment'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','9e230000-0000-0000-0000-000000000001',true);
  select updated_at into token from public.lifting_inventory where id=towing;
  assert public.transfer_lifting_item(towing,source_vessel,target,token)=towing, 'Same reference in independent register allowed';
  select updated_at into token from public.lifting_inventory where id=yard_item;
  assert public.transfer_lifting_item(yard_item,yard,target,token)=yard_item, 'Authorized Yard source may move to a vessel';
  fresh_item:=public.save_lifting_item(target,'lifting','{"material_type":"Manilles","description":"After transferred references"}');
  assert (select reference::bigint from public.lifting_inventory where id=fresh_item)>904, 'Destination counter reserves incoming references';

  -- New target assignments can read registered legacy/current certificates. Old source-only assignments cannot.
  foreach uid in array array['9e230000-0000-0000-0000-000000000004'::uuid,'9e230000-0000-0000-0000-000000000005'::uuid,
    '9e230000-0000-0000-0000-000000000006'::uuid,'9e230000-0000-0000-0000-000000000007'::uuid] loop
    perform set_config('request.jwt.claim.sub',uid::text,true);
    if uid in ('9e230000-0000-0000-0000-000000000006'::uuid,'9e230000-0000-0000-0000-000000000007'::uuid) then
      assert (select count(*) from public.lifting_item_certificates where item_id=item and storage_path in (old_path,legacy_path))=2, 'Destination real profile reads all physical generations';
      assert exists(select 1 from storage.objects where bucket_id='lifting-certificates' and name=old_path), 'New target profile reads old vessel-prefixed object';
      assert exists(select 1 from storage.objects where bucket_id='lifting-certificates' and name=legacy_path), 'Legacy four-segment object remains readable';
      assert public.document_blob_can_read('lifting-certificates',old_path), 'Blob gateway follows transferred item authorization';
      assert public.document_blob_lookup('lifting-certificates',old_path)->>'file_name'='Physical certificate.pdf', 'Authorized Blob download resolves original logical path';
      assert not public.lifting_certificate_path_access(orphan_path), 'Unregistered historical upload does not follow the item';
      assert not public.lifting_certificate_path_upload(old_path), 'Old prefix never becomes a new upload authorization';
      new_path:=c||'/'||target||'/'||item||'/2/'||gen_random_uuid()||'.pdf';
      assert public.lifting_certificate_path_upload(new_path), 'Destination assigned profile keeps existing upload scope';
      assert public.document_blob_can_upload('lifting-certificates',new_path,'application/pdf',100,'{}'), 'Blob uploads retain destination-only scope';
      insert into storage.objects(bucket_id,name,metadata) values('lifting-certificates',new_path,'{"mimetype":"application/pdf","size":100}');
      perform public.add_lifting_item_certificate(item,new_path,'After transfer.pdf','application/pdf',100);
      assert exists(select 1 from public.lifting_item_certificates where storage_path=new_path and service_version=2), 'New certificate uses same physical generation';
    else
      assert not exists(select 1 from public.lifting_inventory where id=item), 'Old onboard scope loses current inventory row';
      assert not exists(select 1 from public.lifting_item_certificates where item_id=item), 'Old onboard scope loses certificate metadata';
      assert not exists(select 1 from storage.objects where bucket_id='lifting-certificates' and name=old_path), 'Old onboard scope loses raw object access';
      assert not public.document_blob_can_read('lifting-certificates',old_path), 'Old onboard scope loses Blob gateway authorization';
      begin perform public.document_blob_lookup('lifting-certificates',old_path); raise exception 'Old source profile resolved a transferred Blob'; exception when insufficient_privilege then null; end;
      assert not public.lifting_certificate_path_access(legacy_path), 'Old onboard scope loses legacy file access';
      assert not public.lifting_certificate_path_upload(c||'/'||target||'/'||item||'/2/'||gen_random_uuid()||'.pdf'), 'Old onboard scope cannot upload to target';
    end if;
  end loop;

  -- Neither a stale source report nor A→B→A may renew the physical item's deadline.
  perform set_config('request.jwt.claim.sub','9e230000-0000-0000-0000-000000000001',true);
  execute 'reset role';
  report_path:=c||'/X-SRC/lifting/'||old_report||'/1-'||gen_random_uuid()||'.pdf';
  insert into storage.objects(bucket_id,name,metadata) values('fleet-certificates',report_path,'{"mimetype":"application/pdf","size":100}');
  execute 'set local role authenticated';
  certificate:=public.publish_lifting_inspection(old_report,1,report_path,'Old source report.pdf',100);
  assert (select last_control_on from public.lifting_inventory where id=item)=(initial->>'last_control_on')::date, 'Old source publication cannot renew transferred equipment';
  assert (select vessel_id from public.lifting_inspections where id=old_report)=source_vessel, 'Published report stays with source vessel';
  assert (select item_snapshot from public.lifting_inspection_entries where id=entry)=snapshot, 'Publishing preserves original snapshot';
  select updated_at into token from public.lifting_inventory where id=item;
  perform public.transfer_lifting_item(item,target,source_vessel,token);
  execute 'reset role';
  insert into public.lifting_inspections(company_id,vessel_id,kind,inspection_year,issued_on,expires_on,vessel_snapshot)
    values(c,source_vessel,'lifting',extract(year from current_date),current_date,current_date+365,jsonb_build_object('id',source_vessel,'acronym','X-SRC')) returning id into return_report;
  insert into public.lifting_inspection_entries(inspection_id,item_id,item_snapshot,condition,checks) values(return_report,item,snapshot,'good',checks);
  report_path:=c||'/X-SRC/lifting/'||return_report||'/1-'||gen_random_uuid()||'.pdf';
  insert into storage.objects(bucket_id,name,metadata) values('fleet-certificates',report_path,'{"mimetype":"application/pdf","size":100}');
  execute 'set local role authenticated';
  perform public.publish_lifting_inspection(return_report,1,report_path,'Pre-transfer snapshot after return.pdf',100);
  assert (select last_control_on from public.lifting_inventory where id=item)=(initial->>'last_control_on')::date, 'Assignment generation prevents A to B to A renewal';
  execute 'reset role';
  insert into public.lifting_inspections(company_id,vessel_id,kind,inspection_year,issued_on,expires_on,vessel_snapshot)
    values(c,source_vessel,'lifting',extract(year from current_date),current_date,current_date+365,jsonb_build_object('id',source_vessel,'acronym','X-SRC')) returning id into current_report;
  insert into public.lifting_inspection_entries(inspection_id,item_id,item_snapshot,condition,checks)
    select current_report,id,case when id=source_item then to_jsonb(i)-'assignment_version' else to_jsonb(i) end,'good',checks
      from public.lifting_inventory i where id in (item,source_item);
  report_path:=c||'/X-SRC/lifting/'||current_report||'/1-'||gen_random_uuid()||'.pdf';
  insert into storage.objects(bucket_id,name,metadata) values('fleet-certificates',report_path,'{"mimetype":"application/pdf","size":100}');
  execute 'set local role authenticated';
  perform public.publish_lifting_inspection(current_report,1,report_path,'Current assignment report.pdf',100);
  assert (select last_control_on from public.lifting_inventory where id=item)=current_date, 'Current assignment inspection still renews equipment';
  assert (select last_control_on from public.lifting_inventory where id=source_item)=current_date, 'Unmoved legacy snapshot remains compatible';
  execute 'reset role';
end $test$;
select 'PASS: atomic transfer, five real profiles, source/version/company guards, identity and snapshot preservation, old/new certificate Storage policies and publication generations' as result;
rollback;
