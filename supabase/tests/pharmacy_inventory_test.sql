-- Real authenticated roles, company memberships and current planning assignments.
-- No simulated UI profile is used. All fixtures and document metadata are rolled back.
begin;
do $test$
declare
  c bigint; other_c bigint; vessel bigint; unassigned bigint; other_vessel bigint;
  captain bigint; sailor bigint; item bigint; due_item bigint; expired_item bigint; future_item bigint;
  control bigint; replacement bigint; uid uuid; role_name text; path text; second_path text;
  today date:=(current_timestamp at time zone 'Europe/Paris')::date;
  draft jsonb:='{"designation":"PHARMACY TEST","quantity":"2 Boîtes","required_quantity":"4x5","expiry_precision":"unknown"}';
begin
  select id into c from public.companies where code='bbtm';
  insert into public.companies(code,name) values('pharmacy-test-other','Pharmacy other tenant') returning id into other_c;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'PHARMACY TEST','PHT',true,'vessel') returning id into vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(c,'PHARMACY UNASSIGNED','PHU',true,'vessel') returning id into unassigned;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(other_c,'PHARMACY OTHER','PHO',true,'vessel') returning id into other_vessel;
  for uid,role_name in select * from (values
    ('9e200000-0000-0000-0000-000000000001'::uuid,'admin'),
    ('9e200000-0000-0000-0000-000000000002'::uuid,'direction'),
    ('9e200000-0000-0000-0000-000000000003'::uuid,'armement'),
    ('9e200000-0000-0000-0000-000000000004'::uuid,'capitaine'),
    ('9e200000-0000-0000-0000-000000000005'::uuid,'marin')) f(id,role_key)
  loop
    insert into auth.users(id,email) values(uid,'pharmacy-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(uid,'pharmacy-'||role_name||'@example.invalid','Pharmacy '||role_name,c);
    insert into public.company_memberships(company_id,user_id,active) values(c,uid,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(uid,c,role_name);
  end loop;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e200000-0000-0000-0000-000000000004','Pharmacy','Captain','Capitaine','PHT-CAP',true) returning id into captain;
  insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
    values(c,'9e200000-0000-0000-0000-000000000005','Pharmacy','Sailor','Matelot','PHT-MAR',true) returning id into sailor;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
    values(c,vessel,captain,today-1,today+1,'Capitaine','confirmed'),(c,vessel,sailor,today-1,today+1,'Matelot','confirmed');

  assert not has_table_privilege('anon','public.pharmacy_inventory','SELECT'),'Anonymous inventory is denied';
  assert not has_table_privilege('authenticated','public.pharmacy_inventory','UPDATE'),'Inventory updates require revision RPC';
  assert not has_table_privilege('authenticated','public.pharmacy_controls','INSERT'),'Controls require publication RPC';
  assert not has_function_privilege('anon','public.pharmacy_available_vessels()','EXECUTE'),'Anonymous RPC is denied';
  assert (select count(*) from public.role_module_permissions where module_key='pharmacy' and is_visible)=5,'All five real profiles have menu entries';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e200000-0000-0000-0000-000000000001',true);
  item:=public.save_pharmacy_item(vessel,draft);
  assert (select quantity from public.pharmacy_inventory where id=item)='2 Boîtes','Source package text survives';
  assert (select expires_on is null from public.pharmacy_inventory where id=item),'No fictitious expiry';
  perform public.save_pharmacy_item(vessel,draft||'{"notes":"verified"}',item,1);
  begin
    perform public.save_pharmacy_item(vessel,draft,item,1);
    raise exception 'Stale article revision accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.save_pharmacy_item(other_vessel,draft);
    raise exception 'Cross tenant write accepted';
  exception when insufficient_privilege then null; end;
  assert not exists(select 1 from public.pharmacy_available_vessels() where id=other_vessel),'Other tenant vessel is hidden';
  due_item:=public.save_pharmacy_item(vessel,draft||jsonb_build_object('designation','DUE','expires_on',today+30,'expiry_precision','day'));
  expired_item:=public.save_pharmacy_item(vessel,draft||jsonb_build_object('designation','EXPIRED','expires_on',today-1,'expiry_precision','day'));
  future_item:=public.save_pharmacy_item(vessel,draft||jsonb_build_object('designation','FUTURE','expires_on',today+31,'expiry_precision','day'));
  assert exists(select 1 from public.pharmacy_notifications() where item_id=due_item and days_until_expiry=30),'J30 inclusive';
  assert exists(select 1 from public.pharmacy_notifications() where item_id=expired_item and days_until_expiry=-1),'Expired alarm persists';
  assert not exists(select 1 from public.pharmacy_notifications() where item_id=future_item or item_id=item),'J31 and missing dates do not fire';

  -- Managers in the same company have full vessel scope.
  for uid in select unnest(array['9e200000-0000-0000-0000-000000000002'::uuid,'9e200000-0000-0000-0000-000000000003'::uuid]) loop
    perform set_config('request.jwt.claim.sub',uid::text,true);
    assert exists(select 1 from public.pharmacy_available_vessels() where id=vessel and can_manage),'Manager has vessel editing';
  end loop;
  -- A real captain can edit only their currently assigned vessel.
  perform set_config('request.jwt.claim.sub','9e200000-0000-0000-0000-000000000004',true);
  assert exists(select 1 from public.pharmacy_available_vessels() where id=vessel and can_manage),'Assigned captain can manage';
  assert not exists(select 1 from public.pharmacy_available_vessels() where id=unassigned),'Unassigned vessel is hidden';
  perform public.save_pharmacy_item(vessel,draft||'{"notes":"captain checked"}',item,2);
  begin
    perform public.save_pharmacy_item(unassigned,draft);
    raise exception 'Captain edited unassigned vessel';
  exception when insufficient_privilege then null; end;

  -- A real sailor sees their vessel and alarms but cannot edit.
  perform set_config('request.jwt.claim.sub','9e200000-0000-0000-0000-000000000005',true);
  assert exists(select 1 from public.pharmacy_available_vessels() where id=vessel and not can_manage),'Sailor reads assigned vessel';
  assert exists(select 1 from public.pharmacy_inventory where id=item),'Sailor RLS reads onboard inventory';
  assert exists(select 1 from public.pharmacy_notifications() where item_id=due_item),'Sailor receives onboard alarm';
  execute 'reset role';
  update public.role_module_permissions set is_visible=false where role_key='marin' and module_key='pharmacy';
  execute 'set local role authenticated';
  assert not exists(select 1 from public.pharmacy_available_vessels()),'Hidden module removes server-side vessel access';
  assert not exists(select 1 from public.pharmacy_inventory where id=item),'Hidden module removes direct API access';
  execute 'reset role';
  update public.role_module_permissions set is_visible=true where role_key='marin' and module_key='pharmacy';
  execute 'set local role authenticated';
  begin
    perform public.save_pharmacy_item(vessel,draft,item,3);
    raise exception 'Sailor edited inventory';
  exception when insufficient_privilege then null; end;

  -- Two actual private uploaded-object metadata fixtures; no fake control is seeded by the workbook import.
  path:=c||'/'||vessel||'/9e200000-0000-0000-0000-000000000011.pdf';
  second_path:=c||'/'||vessel||'/9e200000-0000-0000-0000-000000000012.pdf';
  perform set_config('request.jwt.claim.sub','9e200000-0000-0000-0000-000000000004',true);
  begin
    perform public.publish_pharmacy_control(vessel,null,path,'Missing upload.pdf',100,'application/pdf',today+30,today);
    raise exception 'Missing storage object accepted';
  exception when raise_exception then
    if sqlerrm='Missing storage object accepted' then raise; end if;
    assert sqlerrm like 'Le document doit être déposé%',sqlerrm;
  end;
  execute 'reset role';
  insert into storage.objects(bucket_id,name,owner_id,metadata) values
    ('pharmacy-controls',path,'9e200000-0000-0000-0000-000000000004','{"mimetype":"application/pdf","size":100}'),
    ('pharmacy-controls',second_path,'9e200000-0000-0000-0000-000000000004','{"mimetype":"application/pdf","size":100}');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub','9e200000-0000-0000-0000-000000000004',true);
  begin
    perform public.publish_pharmacy_control(vessel,null,path,'Wrong size.pdf',200,'application/pdf',today+30,today);
    raise exception 'Incorrect storage metadata accepted';
  exception when raise_exception then
    if sqlerrm='Incorrect storage metadata accepted' then raise; end if;
    assert sqlerrm like 'Le document doit être déposé%',sqlerrm;
  end;
  control:=public.publish_pharmacy_control(vessel,null,path,'Contrôle Pharmacie.pdf',100,'application/pdf',today+30,today-300);
  assert control=public.publish_pharmacy_control(vessel,null,path,'Contrôle Pharmacie.pdf',100,'application/pdf',today+30,today-300),'Publication retry is idempotent';
  assert exists(select 1 from public.pharmacy_notifications() where id='control-'||control and days_until_expiry=30),'Control J30 alarm';
  begin
    perform public.publish_pharmacy_control(vessel,null,second_path,'Replacement.pdf',100,'application/pdf',today+365,today);
    raise exception 'Stale control replacement accepted';
  exception when serialization_failure then null; end;
  replacement:=public.publish_pharmacy_control(vessel,control,second_path,'Replacement.pdf',100,'application/pdf',today+365,today);
  assert (select count(*) from public.pharmacy_controls where vessel_id=vessel and is_current)=1,'One current control';
  assert (select count(*) from public.pharmacy_controls where vessel_id=vessel)=2,'Previous control remains downloadable';
  assert not exists(select 1 from public.pharmacy_notifications() where id='control-'||control),'Replaced control stops alarming';
  assert (select revision from public.pharmacy_controls where id=replacement)=2,'Control revision increments';
  perform set_config('request.jwt.claim.sub','9e200000-0000-0000-0000-000000000005',true);
  assert exists(select 1 from storage.objects where bucket_id='pharmacy-controls' and name=path),'Sailor downloads own vessel document';
  begin
    perform public.publish_pharmacy_control(vessel,replacement,path,'Sailor.pdf',100,'application/pdf',today+365,today);
    raise exception 'Sailor published a control';
  exception when insufficient_privilege then null; end;

  -- Recheck in a new command after removing both the assignment and its explicit
  -- operational read grant (which the assignment workflow may have created).
  execute 'reset role';
  perform set_config('pharmacy_test.vessel',vessel::text,true);
  perform set_config('pharmacy_test.sailor',sailor::text,true);
  perform set_config('pharmacy_test.path',path,true);
end $test$;
-- Assignment timestamps/daily boundaries are authoritative and may recompute ends_on;
-- cancel the fixture explicitly rather than editing a derived date alone.
update public.planning_assignments set confirmation_status='cancelled'
where vessel_id=current_setting('pharmacy_test.vessel')::bigint and crew_person_id=current_setting('pharmacy_test.sailor')::bigint;
update public.planning_vessel_permissions set revoked_at=clock_timestamp()
where vessel_id=current_setting('pharmacy_test.vessel')::bigint
  and user_id='9e200000-0000-0000-0000-000000000005' and action_key='read' and revoked_at is null;
set local role authenticated;
do $scope_test$
declare vessel bigint:=current_setting('pharmacy_test.vessel')::bigint; path text:=current_setting('pharmacy_test.path');
begin
  assert not exists(select 1 from public.pharmacy_inventory where vessel_id=vessel),
    format('Cancelled assignment removes inventory access (uid=%s person=%s read=%s)',auth.uid(),public.current_person_id(),
      public.planning_can_read_row(public.current_planning_company_id(),vessel,null,(current_timestamp at time zone 'Europe/Paris')::date,(current_timestamp at time zone 'Europe/Paris')::date));
  assert not exists(select 1 from public.pharmacy_controls where vessel_id=vessel),'Cancelled assignment removes control access';
  assert not exists(select 1 from public.pharmacy_notifications() where vessel_id=vessel),'Cancelled assignment removes alerts';
  assert not exists(select 1 from storage.objects where bucket_id='pharmacy-controls' and name=path),'Cancelled assignment removes file access';
  execute 'reset role';
end $scope_test$;
rollback;
