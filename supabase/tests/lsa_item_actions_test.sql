-- Real profile permissions and expiry/deletion integrity; no fixtures survive rollback.
begin;

do $$
declare
  company bigint; other_company bigint; vessel bigint; foreign_vessel bigint; inactive_vessel bigint;
  actor uuid; person bigint; role_name text; designation bigint; item bigint; foreign_item bigint; inactive_item bigint;
  revision timestamptz; old_revision timestamptz; before_row jsonb; before_version jsonb; before_event jsonb;
  payload jsonb; next_number integer; replacement bigint;
begin
  assert not has_function_privilege('anon','private.update_lsa_item_expiry(bigint,date,timestamptz)','EXECUTE'), 'Anonymous private expiry RPC';
  assert not has_function_privilege('anon','private.delete_lsa_item(bigint,timestamptz)','EXECUTE'), 'Anonymous private deletion RPC';
  assert has_function_privilege('authenticated','public.update_lsa_item_expiry(bigint,date,timestamptz)','EXECUTE'), 'Expiry RPC missing';
  assert has_function_privilege('authenticated','public.delete_lsa_item(bigint,timestamptz)','EXECUTE'), 'Deletion RPC missing';
  insert into public.companies(code,name) values('lsa-actions-'||gen_random_uuid(),'LSA actions fixture') returning id into company;
  insert into public.companies(code,name) values('lsa-actions-foreign-'||gen_random_uuid(),'LSA foreign fixture') returning id into other_company;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(company,'LSA actions','LSAA',true,'vessel') returning id into vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(other_company,'LSA foreign actions','LSAF',true,'vessel') returning id into foreign_vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(company,'LSA inactive actions','LSAI',false,'vessel') returning id into inactive_vessel;
  select id into strict designation from public.lsa_designations where company_id=company and name='EPIRB';
  payload:=jsonb_build_object('designation_id',designation,'expires_on',current_date+90,'notes','Original notes','brand','Ocean','model','Beacon','serial_number','Fixture serial');
  insert into public.lsa_items(company_id,vessel_id,title,category_key) values(other_company,foreign_vessel,'Foreign item','07-4-gmdss') returning id into foreign_item;
  insert into public.lsa_items(company_id,vessel_id,title,category_key) values(company,inactive_vessel,'Inactive item','07-4-gmdss') returning id into inactive_item;

  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{}',true);
    actor:=gen_random_uuid();
    insert into auth.users(id,email) values(actor,actor::text||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,actor::text||'@example.invalid','LSA actions '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    if role_name in ('capitaine','marin') then
      insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
        values(company,actor,'LSA actions',role_name,case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,actor::text,true) returning id into person;
      insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
        values(company,vessel,person,current_date-1,current_date+1,case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,'confirmed'),
          (company,inactive_vessel,person,current_date-1,current_date+1,case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,'confirmed');
    end if;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    item:=public.save_lsa_item(vessel,payload);
    execute 'reset role';
    update public.lsa_items set issued_on=current_date-30,planned_on=current_date+10,provider_name='Original provider',renewal_notes='Original renewal notes',
      storage_bucket='fleet-certificates',storage_path='lsa-actions/'||item||'.pdf' where id=item;
    insert into public.lsa_versions(company_id,certificate_id,version_no,original_file_name,normalized_file_name,storage_path)
      values(company,item,1,'original.pdf','original.pdf','lsa-actions/'||item||'.pdf');
    insert into public.lsa_renewal_events(company_id,certificate_id,event_type) values(company,item,'submitted');
    select to_jsonb(v) into before_version from public.lsa_versions v where certificate_id=item;
    select to_jsonb(e) into before_event from public.lsa_renewal_events e where certificate_id=item;
    execute 'set local role authenticated';
    select updated_at,to_jsonb(i) into revision,before_row from public.lsa_items i where id=item;
    old_revision:=revision;
    perform public.update_lsa_item_expiry(item,current_date+400,revision);
    assert (select expires_on=current_date+400 and alarm_on=current_date+310 from public.lsa_items where id=item), role_name||' expiry not updated';
    assert (select to_jsonb(i)-array['expires_on','alarm_on','updated_at']=before_row-array['expires_on','alarm_on','updated_at'] from public.lsa_items i where id=item), 'Expiry action changed another business field';
    assert (select to_jsonb(v)=before_version from public.lsa_versions v where certificate_id=item), 'Expiry action changed document version';
    assert (select to_jsonb(e)=before_event from public.lsa_renewal_events e where certificate_id=item), 'Expiry action changed renewal event';
    begin
      perform public.update_lsa_item_expiry(item,current_date+401,old_revision);
      raise exception 'Stale expiry accepted';
    exception when serialization_failure then null; end;
    begin
      perform public.delete_lsa_item(item,old_revision);
      raise exception 'Stale deletion accepted';
    exception when serialization_failure then null; end;
    select updated_at into revision from public.lsa_items where id=item;
    begin
      perform public.update_lsa_item_expiry(item,null,revision);
      raise exception 'Empty expiry accepted';
    exception when invalid_parameter_value then null; end;
    begin
      perform public.update_lsa_item_expiry(foreign_item,current_date+400,revision);
      raise exception 'Foreign expiry accepted';
    exception when serialization_failure then null; end;
    begin
      perform public.delete_lsa_item(foreign_item,revision);
      raise exception 'Foreign deletion accepted';
    exception when serialization_failure then null; end;
    if role_name in ('capitaine','marin') then
      begin
        perform public.update_lsa_item_expiry(inactive_item,current_date+400,revision);
        raise exception 'Inactive vessel expiry accepted';
      exception when insufficient_privilege then null; end;
      begin
        perform public.delete_lsa_item(inactive_item,revision);
        raise exception 'Inactive vessel deletion accepted';
      exception when insufficient_privilege then null; end;
    end if;
    next_number:=public.lsa_next_item_number(vessel,designation);
    perform public.delete_lsa_item(item,revision);
    assert not exists(select 1 from public.lsa_items where id=item), role_name||' deleted chip still visible';
    assert not exists(select 1 from public.lsa_versions where certificate_id=item), 'Deleted item document still visible';
    assert not exists(select 1 from public.lsa_renewal_events where certificate_id=item), 'Deleted item history still visible';
    assert public.lsa_next_item_number(vessel,designation)=next_number, 'Deletion reset numbering';
    begin
      perform public.save_lsa_item(vessel,payload,item,revision);
      raise exception 'Deleted item edited';
    exception when serialization_failure then null; end;
    begin
      perform public.update_lsa_item_expiry(item,current_date+401,revision);
      raise exception 'Deleted item renewed';
    exception when serialization_failure then null; end;
    begin
      perform public.delete_lsa_item(item,revision);
      raise exception 'Deleted item removed again';
    exception when serialization_failure then null; end;
    replacement:=public.save_lsa_item(vessel,payload);
    assert (select item_number=next_number from public.lsa_items where id=replacement), 'Deleted number reused';
    execute 'reset role';
    assert (select deleted_at is not null and deleted_by=actor and storage_path='lsa-actions/'||item||'.pdf' from public.lsa_items where id=item), 'Deletion lost item or attribution';
    assert (select to_jsonb(v)=before_version from public.lsa_versions v where certificate_id=item), 'Deletion lost document version';
    assert (select to_jsonb(e)=before_event from public.lsa_renewal_events e where certificate_id=item), 'Deletion lost renewal event';
  end loop;
end $$;
rollback;
