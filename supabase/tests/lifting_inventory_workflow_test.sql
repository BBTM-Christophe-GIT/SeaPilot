-- Runs against real database roles and profile/planning fixtures, never simulated UI roles.
-- All fixtures, PDFs metadata, certificates and changes are rolled back.
begin;
do $test$
declare
  c bigint; other_c bigint; vessel bigint; other_vessel bigint; item bigint; towing bigint;
  inspection bigint; entry bigint; revision integer; certificate bigint; captain bigint; sailor bigint;
  uid uuid; role_name text; path text; result integer;
  repeat_inspection bigint; repeat_entry bigint; repeat_certificate bigint; repeat_path text; later_inspection bigint; first_towing bigint;
  good_checks jsonb := '{"EG":"ok","ID":"ok","NID":"na","V1":"ok","V2":"ok","V3":"ok","V4":"ok","V5":"ok"}';
begin
  select id into c from public.companies where code='bbtm';
  insert into public.companies(code,name) values('lifting-test-other','Lifting other tenant') returning id into other_c;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'LIFTING TEST VESSEL','LVT',true,'vessel') returning id into vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(other_c,'LIFTING OTHER VESSEL','LVO',true,'vessel') returning id into other_vessel;
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
select 'PASS: lifting inventory, snapshots, real profile/RLS scopes, revision guard, atomic fleet certificate publication and retry' as result;
rollback;
