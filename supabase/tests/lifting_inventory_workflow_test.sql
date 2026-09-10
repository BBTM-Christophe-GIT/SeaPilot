-- Runs against real database roles and profile/planning fixtures, never simulated UI roles.
-- All fixtures, PDFs metadata, certificates and changes are rolled back.
begin;
do $test$
declare
  c bigint; other_c bigint; vessel bigint; other_vessel bigint; unassigned_vessel bigint; item bigint; towing bigint;
  inspection bigint; entry bigint; revision integer; certificate bigint; captain bigint; sailor bigint;
  uid uuid; role_name text; path text; result integer;
  repeat_inspection bigint; repeat_entry bigint; repeat_certificate bigint; repeat_path text; later_inspection bigint; first_towing bigint;
  good_checks jsonb := '{"EG":"ok","ID":"ok","NID":"na","V1":"ok","V2":"ok","V3":"ok","V4":"ok","V5":"ok"}';
begin
  select id into c from public.companies where code='bbtm';
  insert into public.companies(code,name) values('lifting-test-other','Lifting other tenant') returning id into other_c;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'LIFTING TEST VESSEL','LVT',true,'vessel') returning id into vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(other_c,'LIFTING OTHER VESSEL','LVO',true,'vessel') returning id into other_vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'LIFTING UNASSIGNED VESSEL','LVU',true,'vessel') returning id into unassigned_vessel;
  update public.vessels set photo_storage_bucket='fleet-media',photo_storage_path=c||'/'||vessel||'/fixture.png' where id=vessel;
  insert into storage.objects(bucket_id,name,metadata) values('fleet-media',c||'/'||vessel||'/fixture.png','{"mimetype":"image/png","size":100}');
  for uid,role_name in select * from (values
    ('9e090000-0000-0000-0000-000000000001'::uuid,'admin'),
    ('9e090000-0000-0000-0000-000000000002'::uuid,'direction'),
    ('9e090000-0000-0000-0000-000000000003'::uuid,'armement'),
    ('9e090000-0000-0000-0000-000000000004'::uuid,'capitaine'),
    ('9e090000-0000-0000-0000-000000000005'::uuid,'marin')) f(id,role_key)
  loop
    insert into auth.users(id,email) values(uid,'lifting-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(uid,'lifting-'||role_name||'@example.invalid','Lifting '||role_name,c);
    insert into public.company_memberships(company_id,user_id,active) values(c,uid,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(uid,c,role_name);
  end loop;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e090000-0000-0000-0000-000000000004','Lifting','Captain','Capitaine','LVT-CAP',true) returning id into captain;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e090000-0000-0000-0000-000000000005','Lifting','Sailor','Matelot','LVT-MAR',true) returning id into sailor;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
    values(c,vessel,captain,current_date-1,current_date+1,'Capitaine','confirmed'),(c,vessel,sailor,current_date-1,current_date+1,'Matelot','confirmed');
  assert not has_table_privilege('anon','public.lifting_inventory','SELECT'), 'Anonymous inventory access must be denied';
  assert not has_table_privilege('authenticated','public.lifting_inspections','UPDATE'), 'Inspection writes must use RPCs';
  assert not has_table_privilege('authenticated','public.lifting_inventory','DELETE'), 'No physical inventory deletion';
  assert not has_function_privilege('anon','public.start_lifting_inspection(bigint,text,date,date)','EXECUTE'), 'Anonymous RPC access';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e090000-0000-0000-0000-000000000001',true);
  item := public.save_lifting_item(vessel,'lifting','{"reference":"L1","material_type":"Élingue","description":"Original sling","swl_tonnes":2}');
  towing := public.save_lifting_item(vessel,'towing','{"reference":"T1","material_type":"Remorque","towing_type":"textile_line","description":"Maritime towing line"}');
  assert (select reference from public.lifting_inventory where id=item)='1', 'First lifting number';
  assert (select reference from public.lifting_inventory where id=towing)='1', 'Independent towing number';
  assert not public.lifting_can_access(other_c,other_vessel), 'Tenant isolation';
  begin
    perform public.save_lifting_item(other_vessel,'lifting','{"reference":"X","material_type":"Manille","description":"Cross tenant"}');
    raise exception 'Cross-tenant item creation was allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_lifting_item(vessel,'lifting','{"reference":"INVALID","material_type":"Remorque","description":"Wrong section"}');
    raise exception 'Towing line accepted in lifting section';
  exception when check_violation then null; end;
  inspection := public.start_lifting_inspection(vessel,'lifting','2031-03-05','2032-03-05');
  assert (select count(*) from public.lifting_inspection_entries where inspection_id=inspection)=1, 'Towing excluded from lifting inspection';
  select id into entry from public.lifting_inspection_entries where inspection_id=inspection;
  perform public.save_lifting_item(vessel,'lifting','{"reference":"L1","material_type":"Élingue","description":"Edited sling","swl_tonnes":3}',item);
  assert (select reference from public.lifting_inventory where id=item)='1', 'Identifier cannot be edited';
  assert (select condition from public.lifting_inspection_entries where id=entry)='pending', 'Prechecked is not inspected';
  assert (select checks->>'ID' from public.lifting_inspection_entries where id=entry)='ok', 'Applicable boxes prechecked';
  assert (select item_snapshot->>'description' from public.lifting_inspection_entries where id=entry)='Original sling', 'Inventory edits must not change report snapshots';
  perform public.set_lifting_item_active(item,false);
  assert exists(select 1 from public.lifting_inspection_entries where id=entry), 'Archiving must preserve history';
  perform public.set_lifting_item_active(item,true);
  assert (select active from public.lifting_inventory where id=item), 'Restore inventory';
  begin
    perform public.publish_lifting_inspection(inspection,1,'invalid','invalid.pdf',10);
    raise exception 'Incomplete report published';
  exception when raise_exception then
    if sqlerrm='Incomplete report published' then raise; end if;
    assert sqlerrm like 'Terminez tous les contrôles%',sqlerrm;
  end;
  -- Captain and Marin fixtures have actual HR links and active assignments.
  foreach uid in array array['9e090000-0000-0000-0000-000000000004'::uuid,'9e090000-0000-0000-0000-000000000005'::uuid] loop
    perform set_config('request.jwt.claim.sub',uid::text,true);
    assert public.lifting_can_access(c,vessel), 'Assigned onboard profile can inspect vessel';
    assert not public.lifting_can_access(other_c,other_vessel), 'Onboard cross-tenant access denied';
    assert exists(select 1 from public.lifting_available_vessels() v where v.id=vessel and v.photo_storage_bucket='fleet-media' and v.photo_storage_path=c||'/'||vessel||'/fixture.png'), 'Assigned profile receives reusable fleet photo metadata';
    assert not exists(select 1 from public.lifting_available_vessels() v where v.id in (other_vessel,unassigned_vessel)), 'Photo filter excludes unassigned and cross-tenant vessels';
    assert exists(select 1 from storage.objects where bucket_id='fleet-media' and name=c||'/'||vessel||'/fixture.png'), 'Real onboard role can read assigned vessel photo';
    assert exists(select 1 from public.lifting_inspection_entries where id=entry), 'Onboard RLS permits assigned vessel';
    begin
      perform public.set_lifting_item_active(item,false);
      raise exception 'Onboard profile administered inventory';
    exception when insufficient_privilege then null; end;
    select r.revision into revision from public.lifting_inspections r where id=inspection;
    result := public.save_lifting_inspection_entry(inspection,entry,revision,'good',good_checks,'');
    assert result=revision+1,'Onboard save increments revision';
    begin
      perform public.publish_lifting_inspection(inspection,result,'invalid','invalid.pdf',10);
      raise exception 'Onboard profile published';
    exception when insufficient_privilege then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub','9e090000-0000-0000-0000-000000000001',true);
  select r.revision into revision from public.lifting_inspections r where id=inspection;
  begin
    perform public.save_lifting_inspection_entry(inspection,entry,revision-1,'good',good_checks,'');
    raise exception 'Stale edit accepted';
  exception when raise_exception then
    if sqlerrm='Stale edit accepted' then raise; end if;
    assert sqlerrm like 'Ce contrôle a été modifié%',sqlerrm;
  end;
  begin
    perform public.save_lifting_inspection_entry(inspection,entry,revision,'good',jsonb_set(good_checks,'{EG}','"defect"'),'');
    raise exception 'Good condition with defect accepted';
  exception when raise_exception then
    if sqlerrm='Good condition with defect accepted' then raise; end if;
    assert sqlerrm like 'Un matériel présentant un défaut%',sqlerrm;
  end;

  -- Completeness and every towing subtype use the verifier's precise applicability.
  assert public.lifting_control_codes('{"material_type":"Remorque","towing_type":"chain_bridle"}')=array['EG','NID','V1','V2'];
  assert public.lifting_control_codes('{"material_type":"Remorque","towing_type":"textile_line"}')=array['EG','NID'];
  assert public.lifting_control_codes('{"material_type":"Remorque","towing_type":"towing_wire"}')=array['EG','NID'];
  assert public.lifting_control_codes('{"material_type":"Remorque","towing_type":"winch_wire"}')=array['EG','NID'];
  assert public.lifting_control_codes('{"material_type":"Remorque","towing_type":"textile_bridle"}')=array['EG','NID','V1','V2','V3','V4','V5'];
  assert public.lifting_default_checks('{"material_type":"Remorque","towing_type":"textile_bridle"}')->>'NID'='ok';
  assert not public.lifting_entry_ready('{"material_type":"Remorque","towing_type":"textile_bridle"}','good',good_checks,''), 'Textile bridle requires NID';
  assert public.lifting_entry_ready('{"material_type":"Remorque","towing_type":"textile_bridle"}','good',jsonb_set(good_checks,'{NID}','"ok"'),''), 'Textile bridle NID accepted';
  assert not public.lifting_entry_ready('{"material_type":"Remorque","towing_type":"textile_bridle"}','good',jsonb_set(good_checks,'{NID}','"defect"'),''), 'Failed textile bridle NID rejects fit for use';
  assert not public.lifting_entry_ready('{"material_type":"Manilles"}','good','{"EG":"ok","ID":"ok","V1":"na"}',''), 'Applicable point cannot be omitted';
  assert not public.lifting_entry_ready('{"material_type":"Remorque"}','good','{}',''), 'Unknown subtype cannot be finalized';
  -- Bulk edits are atomic even when the last submitted row belongs to another inspection.
  select r.revision into revision from public.lifting_inspections r where id=inspection;
  begin
    perform public.save_lifting_inspection_entries(inspection,revision,jsonb_build_array(
      jsonb_build_object('id',entry,'condition','repair','checks',jsonb_set(good_checks,'{EG}','"defect"'),'observations','Must roll back'),
      jsonb_build_object('id',-99999,'condition','good','checks',good_checks,'observations','')));
    raise exception 'Invalid batch accepted';
  exception when raise_exception then
    if sqlerrm='Invalid batch accepted' then raise; end if;
    assert sqlerrm like 'Matériel absent%',sqlerrm;
  end;
  assert (select r.revision from public.lifting_inspections r where id=inspection)=revision,'Failed batch keeps revision';
  assert (select condition from public.lifting_inspection_entries where id=entry)='good','Failed batch rolls back first row';
  result:=public.save_lifting_inspection_entries(inspection,revision,jsonb_build_array(jsonb_build_object('id',entry,'condition','good','checks',good_checks,'observations','')));
  assert result=revision+1,'Valid batch updates revision';
  select r.revision into revision from public.lifting_inspections r where id=inspection;
  path := c||'/LVT/lifting/'||inspection||'/'||revision||'-fixture.pdf';
  execute 'reset role';
  insert into storage.objects(bucket_id,name,metadata) values('fleet-certificates',path,'{"mimetype":"application/pdf","size":100}');
  execute 'set local role authenticated';
  certificate := public.publish_lifting_inspection(inspection,revision,path,'LVT - Lifting fixture - 2031.pdf',100);
  assert certificate=public.publish_lifting_inspection(inspection,revision,path,'LVT - Lifting fixture - 2031.pdf',100), 'Retry must reuse the certificate';
  assert (select count(*) from public.fleet_certificates where id=certificate and vessel_id=vessel and issued_on=date '2031-03-05' and expires_on=date '2032-03-05' and category_key='08-3-accessoires-levage')=1, 'Fleet certificate vessel, dates and category';
  assert (select count(*) from public.fleet_certificate_versions where certificate_id=certificate and storage_path=path and is_current)=1, 'Fleet document version created';
  begin
    perform public.save_lifting_inspection_entry(inspection,entry,revision,'good',good_checks,'Edited after publication');
    raise exception 'Final report editable';
  exception when raise_exception then
    if sqlerrm='Final report editable' then raise; end if;
    assert sqlerrm like 'Ce rapport est finalisé%',sqlerrm;
  end;
  -- Repeat a published inspection without waiting for expiry, including the exact same issue date.
  repeat_inspection := public.start_lifting_inspection(vessel,'lifting','2031-03-05','2032-03-05');
  assert repeat_inspection<>inspection,'Same-day inspection gets a distinct identifier';
  select id into repeat_entry from public.lifting_inspection_entries where inspection_id=repeat_inspection;
  assert (select condition from public.lifting_inspection_entries where id=repeat_entry)='pending','Repeat requires a fresh inspection';
  assert (select item_snapshot->>'description' from public.lifting_inspection_entries where id=repeat_entry)='Edited sling','Repeat snapshots current inventory';
  result:=public.save_lifting_inspection_entry(repeat_inspection,repeat_entry,1,'good',good_checks,'');
  repeat_path:=c||'/LVT/lifting/'||repeat_inspection||'/'||result||'-repeat.pdf';
  execute 'reset role';
  insert into storage.objects(bucket_id,name,metadata) values('fleet-certificates',repeat_path,'{"mimetype":"application/pdf","size":100}');
  execute 'set local role authenticated';
  repeat_certificate:=public.publish_lifting_inspection(repeat_inspection,result,repeat_path,'LVT - 2031-03-05 - LEV-'||repeat_inspection||'.pdf',100);
  assert repeat_certificate<>certificate,'Repeat creates its own fleet certificate';
  assert (select certificate_id from public.lifting_inspections where id=inspection)=certificate,'Original report remains published';
  assert (select storage_path from public.fleet_certificates where id=certificate)=path,'Original document preserved';
  assert (select item_snapshot->>'description' from public.lifting_inspection_entries where id=entry)='Original sling','Original inspection snapshot preserved';
  assert (select count(*) from public.fleet_certificates where id in (certificate,repeat_certificate))=2,'Both certificates remain available';
  later_inspection:=public.start_lifting_inspection(vessel,'lifting','2031-04-05','2032-04-05');
  assert later_inspection not in (inspection,repeat_inspection),'Another inspection before expiry is allowed';
  first_towing:=public.start_lifting_inspection(vessel,'towing','2031-03-05','2032-03-05');
  repeat_inspection:=public.start_lifting_inspection(vessel,'towing','2031-03-05','2032-03-05');
  assert repeat_inspection<>first_towing,'Repeated towing inspections are allowed too';
  assert (select count(*) from public.lifting_inspection_entries where inspection_id=repeat_inspection and item_id=towing)=1,'Repeat towing register stays separate';
  -- Direction and Armement retain inventory administration rights.
  foreach uid in array array['9e090000-0000-0000-0000-000000000002'::uuid,'9e090000-0000-0000-0000-000000000003'::uuid] loop
    perform set_config('request.jwt.claim.sub',uid::text,true);
    perform public.set_lifting_item_active(item,false);
    perform public.set_lifting_item_active(item,true);
    assert (select active from public.lifting_inventory where id=item),'Office inventory administration';
  end loop;
  execute 'reset role';
end $test$;
do $source_test$
declare c bigint; site bigint; office bigint; inactive_vessel bigint; ring bigint; clamp bigint; inspection bigint; uid uuid;
begin
  select id into c from public.companies where code='bbtm';
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'LIFTING TEST QUAY','LTQ',true,'quay') returning id into site;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'LIFTING TEST OFFICE','LTO',true,'office') returning id into office;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'LIFTING INACTIVE','LTI',false,'vessel') returning id into inactive_vessel;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e090000-0000-0000-0000-000000000001',true);
  assert exists(select 1 from public.lifting_available_vessels() where id=site),'Inventory site available to admin';
  assert not exists(select 1 from public.lifting_available_vessels() where id in (office,inactive_vessel)),'Office and inactive vessel excluded';
  ring:=public.save_lifting_item(site,'lifting','{"material_type":"Anneau","description":"Ring","source_key":"forged","source_data":{"source_id":"forged"}}');
  clamp:=public.save_lifting_item(site,'lifting','{"material_type":"Pinces à tôles","description":"Plate clamp"}');
  assert (select reference from public.lifting_inventory where id=ring)='1','Site has its own sequence';
  assert (select source_key is null and source_data='{}' from public.lifting_inventory where id=ring),'RPC cannot forge imported provenance';
  inspection:=public.start_lifting_inspection(site,'lifting','2031-03-05','2032-03-05');
  assert (select count(*) from public.lifting_inspection_entries where inspection_id=inspection)=2,'Selected site only';
  assert public.lifting_control_codes('{"material_type":"Anneaux de levage"}')=array['EG','ID'],'Ring checklist';
  assert public.lifting_control_codes('{"material_type":"Pinces à tôles"}')=array['EG','ID','V1','V2','V3'],'Plate clamp checklist';
  assert public.lifting_control_codes('{"material_type":"Grappins"}')=array[]::text[],'No invented grapple controls';
  assert (select bool_and(condition='pending') from public.lifting_inspection_entries where inspection_id=inspection),'New source inventory needs actual inspection';
  foreach uid in array array['9e090000-0000-0000-0000-000000000004'::uuid,'9e090000-0000-0000-0000-000000000005'::uuid] loop
    perform set_config('request.jwt.claim.sub',uid::text,true);
    assert not exists(select 1 from public.lifting_available_vessels() where id=site),'Unassigned onboard profile cannot select site';
    assert not exists(select 1 from public.lifting_inventory where id in (ring,clamp)),'Unassigned site inventory hidden by RLS';
    begin
      perform public.start_lifting_inspection(site,'lifting','2031-03-05','2032-03-05');
      raise exception 'Unassigned profile started a site inspection';
    exception when insufficient_privilege then null; end;
  end loop;
  execute 'reset role';
end $source_test$;
do $delete_draft_test$
declare
  vessel bigint; foreign_vessel bigint; draft bigint; foreign_draft bigint; published bigint;
  entry bigint; revision integer; uid uuid; kind text;
  inventory_before jsonb; reports_before jsonb; entries_before jsonb; certificates_before jsonb; versions_before jsonb;
begin
  select id into vessel from public.vessels where name='LIFTING TEST VESSEL';
  select id into foreign_vessel from public.vessels where name='LIFTING OTHER VESSEL';
  select id into published from public.lifting_inspections where vessel_id=vessel and status='published' order by id limit 1;
  select jsonb_agg(to_jsonb(i) order by id) into inventory_before from public.lifting_inventory i where vessel_id=vessel;
  select jsonb_agg(to_jsonb(r) order by id) into reports_before from public.lifting_inspections r where vessel_id=vessel;
  select jsonb_agg(to_jsonb(e) order by e.id) into entries_before from public.lifting_inspection_entries e join public.lifting_inspections r on r.id=e.inspection_id where r.vessel_id=vessel;
  select jsonb_agg(to_jsonb(c) order by id) into certificates_before from public.fleet_certificates c where vessel_id=vessel;
  select jsonb_agg(to_jsonb(v) order by v.id) into versions_before from public.fleet_certificate_versions v join public.fleet_certificates c on c.id=v.certificate_id where c.vessel_id=vessel;
  insert into public.lifting_inspections(company_id,vessel_id,kind,inspection_year,issued_on,expires_on,vessel_snapshot)
    select company_id,id,'lifting',2031,'2031-03-05','2032-03-05',to_jsonb(v) from public.vessels v where id=foreign_vessel returning id into foreign_draft;
  assert not has_function_privilege('anon','public.delete_lifting_inspection_draft(bigint,integer)','EXECUTE'),'No anonymous deletion';
  assert not has_table_privilege('authenticated','public.lifting_inspections','DELETE'),'No direct inspection deletion';
  assert not has_table_privilege('authenticated','public.lifting_inspection_entries','DELETE'),'No direct entry deletion';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e090000-0000-0000-0000-000000000001',true);
  draft:=public.start_lifting_inspection(vessel,'lifting','2031-03-05','2032-03-05');
  select id into entry from public.lifting_inspection_entries where inspection_id=draft order by id limit 1;
  revision:=public.save_lifting_inspection_entry(draft,entry,1,'repair',public.lifting_default_checks((select item_snapshot from public.lifting_inspection_entries where id=entry)),'Saved before deletion');
  foreach uid in array array['9e090000-0000-0000-0000-000000000004'::uuid,'9e090000-0000-0000-0000-000000000005'::uuid] loop
    perform set_config('request.jwt.claim.sub',uid::text,true);
    assert exists(select 1 from public.lifting_inspections where id=draft),'Assigned onboard profile can see draft';
    begin
      perform public.delete_lifting_inspection_draft(draft,revision);
      raise exception 'Onboard profile deleted draft';
    exception when insufficient_privilege then null; end;
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.delete_lifting_inspection_draft(draft,revision);
    raise exception 'Missing authentication deleted draft';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','9e090000-0000-0000-0000-000000000001',true);
  begin
    perform public.delete_lifting_inspection_draft(foreign_draft,1);
    raise exception 'Cross-company deletion accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.delete_lifting_inspection_draft(published,1);
    raise exception 'Published report deleted';
  exception when raise_exception then
    assert sqlerrm like 'Seul un brouillon%',sqlerrm;
  end;
  foreach revision in array array[1,null] loop
    begin
      perform public.delete_lifting_inspection_draft(draft,revision);
      raise exception 'Stale or null revision accepted';
    exception when raise_exception then
      assert sqlerrm like 'Ce brouillon a été modifié%',sqlerrm;
    end;
  end loop;
  assert exists(select 1 from public.lifting_inspection_entries where id=entry and observations='Saved before deletion'),'Rejected deletion preserves saved work';
  perform public.delete_lifting_inspection_draft(draft,(select r.revision from public.lifting_inspections r where id=draft));
  assert not exists(select 1 from public.lifting_inspection_entries where inspection_id=draft),'Saved draft entries deleted';
  begin
    perform public.delete_lifting_inspection_draft(draft,2);
    raise exception 'Missing draft accepted';
  exception when insufficient_privilege then null; end;
  foreach uid in array array['9e090000-0000-0000-0000-000000000001'::uuid,'9e090000-0000-0000-0000-000000000002'::uuid,'9e090000-0000-0000-0000-000000000003'::uuid] loop
    perform set_config('request.jwt.claim.sub',uid::text,true);
    foreach kind in array array['lifting','towing'] loop
      draft:=public.start_lifting_inspection(vessel,kind,'2031-03-05','2032-03-05');
      perform public.delete_lifting_inspection_draft(draft,1);
      assert not exists(select 1 from public.lifting_inspections where id=draft),'Manager draft removed';
      assert not exists(select 1 from public.lifting_inspection_entries where inspection_id=draft),'Manager draft entries removed';
    end loop;
  end loop;
  execute 'reset role';
  assert exists(select 1 from public.lifting_inspections where id=foreign_draft),'Foreign draft preserved';
  assert inventory_before=(select jsonb_agg(to_jsonb(i) order by id) from public.lifting_inventory i where vessel_id=vessel),'Inventory unchanged';
  assert reports_before=(select jsonb_agg(to_jsonb(r) order by id) from public.lifting_inspections r where vessel_id=vessel),'Other reports unchanged';
  assert entries_before=(select jsonb_agg(to_jsonb(e) order by e.id) from public.lifting_inspection_entries e join public.lifting_inspections r on r.id=e.inspection_id where r.vessel_id=vessel),'Other inspection entries unchanged';
  assert certificates_before=(select jsonb_agg(to_jsonb(c) order by id) from public.fleet_certificates c where vessel_id=vessel),'Certificates unchanged';
  assert versions_before=(select jsonb_agg(to_jsonb(v) order by v.id) from public.fleet_certificate_versions v join public.fleet_certificates c on c.id=v.certificate_id where c.vessel_id=vessel),'Certificate versions unchanged';
end $delete_draft_test$;
do $lifecycle_test$
declare
  c bigint; vessel bigint; other_vessel bigint; item bigint; old_item bigint; uid uuid; role_name text; kind text;
  path text; cert_path text; new_path text; new_attachment jsonb; cert uuid; prior jsonb; before_snapshot jsonb; report bigint; entry bigint; revision integer;
  today date := (now() at time zone 'Europe/Paris')::date;
begin
  select id into c from public.companies where code='bbtm';
  select id into vessel from public.vessels where name='LIFTING TEST VESSEL';
  select id into other_vessel from public.vessels where name='LIFTING OTHER VESSEL';
  assert not has_function_privilege('anon','public.add_lifting_item_certificate(bigint,text,text,text,bigint)','EXECUTE');
  assert not has_table_privilege('authenticated','public.lifting_inspector_grants','SELECT');
  assert not has_table_privilege('authenticated','public.lifting_item_certificates','INSERT');
  assert not has_table_privilege('anon','public.lifting_item_certificates','SELECT');
  for uid,role_name in select * from (values
    ('9e090000-0000-0000-0000-000000000001'::uuid,'admin'),
    ('9e090000-0000-0000-0000-000000000002'::uuid,'direction'),
    ('9e090000-0000-0000-0000-000000000003'::uuid,'armement'),
    ('9e090000-0000-0000-0000-000000000004'::uuid,'capitaine'),
    ('9e090000-0000-0000-0000-000000000005'::uuid,'marin')) f(id,role_key)
  loop
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub',uid::text,true);
    assert public.lifting_can_start_inspection()=(role_name in ('admin','direction','armement')),'Role creation capability';
    foreach kind in array array['lifting','towing'] loop
      item:=public.save_lifting_item(vessel,kind,jsonb_build_object('material_type',case when kind='towing' then 'Remorque' else 'Manilles' end,
        'towing_type','textile_line','description','Lifecycle role fixture','commissioned_on','2020-01-01','added_on','1990-01-01','last_control_on','2099-01-01','service_version',42));
      assert (select added_on=today and last_control_on is null and service_version=1 and inspection_due_on=(today+interval '1 year')::date from public.lifting_inventory where id=item),'Only server controls annual lifecycle';
      path:=c||'/'||vessel||'/'||item||'/1/'||gen_random_uuid()||'.pdf';
      assert public.lifting_certificate_path_access(path),'All profiles and registers may attach';
      insert into storage.objects(bucket_id,name,metadata) values('lifting-certificates',path,'{"mimetype":"application/pdf","size":100}');
      cert:=public.add_lifting_item_certificate(item,path,'Certificat fixture.pdf','application/pdf',100);
      assert cert=public.add_lifting_item_certificate(item,path,'Certificat fixture.pdf','application/pdf',100),'Certificate retry is idempotent';
      assert exists(select 1 from public.lifting_item_certificates where id=cert and item_id=item),'Accessible certificate metadata';
      assert exists(select 1 from storage.objects where bucket_id='lifting-certificates' and name=path),'Accessible file';
      begin
        perform public.add_lifting_item_certificate(item,path,'Bad.pdf','application/pdf',101);
        raise exception 'Wrong size accepted';
      exception when raise_exception then assert sqlerrm like 'Joignez un PDF%',sqlerrm; end;
      if role_name in ('capitaine','marin') then
        assert not public.lifting_certificate_path_upload(c||'/'||vessel||'/'||item||'/2/'||gen_random_uuid()||'.pdf'),'Onboard profiles cannot stage replacement files';
        begin perform public.start_lifting_inspection(vessel,kind,today,today+365); raise exception 'Onboard creation allowed'; exception when insufficient_privilege then null; end;
        begin perform public.save_lifting_item(vessel,kind,'{"material_type":"Manilles","description":"Forbidden edit"}',item); raise exception 'Onboard edit allowed'; exception when insufficient_privilege then null; end;
        begin perform public.replace_lifting_item(item,1,today); raise exception 'Onboard replacement allowed'; exception when insufficient_privilege then null; end;
      end if;
    end loop;
    begin perform public.save_lifting_item(other_vessel,'lifting','{"material_type":"Manilles","description":"Other tenant"}'); raise exception 'Foreign creation allowed'; exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
  -- The exception is bound to auth.uid, never to a user-editable name.
  update public.profiles set display_name='Antoine MONCEAUX' where id='9e090000-0000-0000-0000-000000000004';
  perform set_config('request.jwt.claim.sub','9e090000-0000-0000-0000-000000000004',true);
  execute 'set local role authenticated';
  assert not public.lifting_can_start_inspection(),'Forged display name grants nothing';
  execute 'reset role';
  insert into public.lifting_inspector_grants(company_id,user_id) values(c,'9e090000-0000-0000-0000-000000000004');
  execute 'set local role authenticated';
  assert public.lifting_can_start_inspection(),'Explicit captain inspector grant';
  perform public.start_lifting_inspection(vessel,'lifting',today,today+365);
  execute 'reset role';

  -- A separate vessel gives publication exactly one item, with two equipment generations.
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'LIFECYCLE PUBLICATION FIXTURE','LCY',true,'vessel') returning id into vessel;
  perform set_config('request.jwt.claim.sub','9e090000-0000-0000-0000-000000000001',true);
  execute 'set local role authenticated';
  item:=public.save_lifting_item(vessel,'lifting','{"material_type":"Manilles","description":"Replacement fixture","commissioned_on":"2020-01-01","serial_number":"SERIAL","swl_tonnes":2,"notes":"Keep me"}');
  report:=public.start_lifting_inspection(vessel,'lifting',today,today+365);
  select id,item_snapshot into entry,before_snapshot from public.lifting_inspection_entries where inspection_id=report;
  select to_jsonb(i) into prior from public.lifting_inventory i where id=item;
  path:=c||'/'||vessel||'/'||item||'/1/'||gen_random_uuid()||'.png';
  insert into storage.objects(bucket_id,name,metadata) values('lifting-certificates',path,'{"mimetype":"image/png","size":100}');
  cert:=public.add_lifting_item_certificate(item,path,'Origin.png','image/png',100);
  cert_path:=path;
  begin
    perform public.replace_lifting_item(item,1,today-7);
    raise exception 'Replacement retained old certificates';
  exception when raise_exception then assert sqlerrm like 'Joignez un nouveau certificat%',sqlerrm; end;
  new_path:=c||'/'||vessel||'/'||item||'/2/'||gen_random_uuid()||'.pdf';
  assert public.lifting_certificate_path_upload(new_path),'Manager can stage next-generation certificates';
  insert into storage.objects(bucket_id,name,metadata) values('lifting-certificates',new_path,'{"mimetype":"application/pdf","size":100}');
  new_attachment:=jsonb_build_object('storage_path',new_path,'file_name','Nouveau certificat.pdf','mime_type','application/pdf','file_size',100);
  begin
    perform public.add_lifting_item_certificate(item,new_path,'Nouveau.pdf','application/pdf',100);
    raise exception 'Staged file registered before replacement';
  exception when raise_exception then assert sqlerrm like 'Ce matériel a été remplacé%',sqlerrm; end;
  begin
    perform public.replace_lifting_item(item,1,today-7,jsonb_build_array(jsonb_build_object('storage_path',cert_path,'file_name','Origin.png','mime_type','image/png','file_size',100)));
    raise exception 'Old certificate reused';
  exception when raise_exception then assert sqlerrm like 'Ce matériel a été remplacé%',sqlerrm; end;
  begin
    perform public.replace_lifting_item(item,1,today-7,jsonb_build_array(new_attachment,jsonb_set(new_attachment,'{storage_path}',to_jsonb(c||'/'||vessel||'/'||item||'/2/'||gen_random_uuid()||'.pdf'))));
    raise exception 'Missing second file accepted';
  exception when raise_exception then assert sqlerrm like 'Joignez un PDF%',sqlerrm; end;
  assert (select to_jsonb(i)=prior from public.lifting_inventory i where id=item),'Failed attachment rolls back all replacement fields';
  assert not exists(select 1 from public.lifting_item_certificates where storage_path=new_path),'Failed batch rolls back first registered attachment';
  perform public.replace_lifting_item(item,1,today-7,jsonb_build_array(new_attachment));
  assert exists(select 1 from public.lifting_item_certificates where id=cert and service_version=1),'Old certificate archived with old generation';
  assert exists(select 1 from public.lifting_item_certificates where storage_path=new_path and service_version=2),'Replacement certificate is current';
  assert not public.lifting_certificate_path_upload(cert_path),'Old generation upload denied';
  assert public.lifting_certificate_path_access(cert_path),'Historical file remains readable';
  begin
    perform public.add_lifting_item_certificate(item,cert_path,'Origin.png','image/png',100);
    raise exception 'Stale certificate attached after replacement';
  exception when raise_exception then assert sqlerrm like 'Ce matériel a été remplacé%',sqlerrm; end;
  assert (select reference=prior->>'reference' and description=prior->>'description' and serial_number='SERIAL' and swl_tonnes=2 and notes='Keep me'
    and service_version=2 and commissioned_on=today-7 and last_control_on is null and inspection_due_on=((today-7)+interval '1 year')::date and jsonb_array_length(replacement_history)=1 from public.lifting_inventory where id=item),'Replacement preserves identity and data; resets date';
  assert exists(select 1 from public.lifting_item_certificates where id=cert and item_id=item),'Replacement preserves historical files';
  begin perform public.replace_lifting_item(item,1,today); raise exception 'Stale replacement accepted'; exception when raise_exception then assert sqlerrm like 'Ce matériel a déjà%',sqlerrm; end;
  begin perform public.replace_lifting_item(item,2,today+1); raise exception 'Future replacement accepted'; exception when raise_exception then assert sqlerrm like 'Date de mise%',sqlerrm; end;
  begin perform public.replace_lifting_item(item,2,today-8); raise exception 'Earlier replacement accepted'; exception when raise_exception then assert sqlerrm like 'Date de mise%',sqlerrm; end;
  revision:=public.save_lifting_inspection_entry(report,entry,1,'good',public.lifting_default_checks(before_snapshot),'');
  path:=c||'/LCY/lifting/'||report||'/'||revision||'-old.pdf';
  execute 'reset role';
  insert into storage.objects(bucket_id,name,metadata) values('fleet-certificates',path,'{"mimetype":"application/pdf","size":100}');
  execute 'set local role authenticated';
  perform public.publish_lifting_inspection(report,revision,path,'Old generation.pdf',100);
  assert (select last_control_on is null from public.lifting_inventory where id=item),'Old generation draft does not renew replacement';
  assert (select item_snapshot=before_snapshot from public.lifting_inspection_entries where id=entry),'Old snapshot unchanged';
  report:=public.start_lifting_inspection(vessel,'lifting',today,today+365);
  select id,item_snapshot into entry,before_snapshot from public.lifting_inspection_entries where inspection_id=report;
  revision:=public.save_lifting_inspection_entry(report,entry,1,'good',public.lifting_default_checks(before_snapshot),'');
  path:=c||'/LCY/lifting/'||report||'/'||revision||'-new.pdf';
  execute 'reset role';
  insert into storage.objects(bucket_id,name,metadata) values('fleet-certificates',path,'{"mimetype":"application/pdf","size":100}');
  execute 'set local role authenticated';
  perform public.publish_lifting_inspection(report,revision,path,'New generation.pdf',100);
  assert (select last_control_on=today and inspection_due_on=(today+interval '1 year')::date from public.lifting_inventory where id=item),'Publication renews current equipment';
  -- Onboard profiles cannot read or attach to a vessel with no assignment.
  perform set_config('request.jwt.claim.sub','9e090000-0000-0000-0000-000000000005',true);
  assert not exists(select 1 from public.lifting_item_certificates where id=cert),'Unassigned certificate metadata denied';
  assert not exists(select 1 from storage.objects where bucket_id='lifting-certificates' and name=cert_path),'No unassigned storage read';
  assert not public.lifting_certificate_path_access(c||'/'||vessel||'/'||item||'/1/'||gen_random_uuid()||'.pdf'),'Unassigned file denied';
  begin perform public.add_lifting_item_certificate(item,c||'/'||vessel||'/'||item||'/1/'||gen_random_uuid()||'.pdf','Foreign.pdf','application/pdf',100); raise exception 'Unassigned attachment accepted'; exception when insufficient_privilege then null; end;
  execute 'reset role';
end $lifecycle_test$;

select 'PASS: lifting inventory, snapshots, real profiles/RLS, publication, draft deletion, annual lifecycle, equipment certificates and replacement document history' as result;
rollback;
