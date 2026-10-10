-- Exercise real authenticated profiles and assignments, never an admin UI simulation.
begin;
do $$
declare
  company bigint; other_company bigint; vessel bigint; unassigned bigint; foreign_vessel bigint; inactive_vessel bigint;
  actor uuid; person bigint; role_name text; item bigint; other_item bigint; hidden_item bigint;
  current_revision timestamptz; saved bigint; expired_saved bigint; count_before bigint; designation bigint; foreign_designation bigint;
  catalog_type bigint; catalog_designation bigint; foreign_type bigint; next_number integer;
  payload jsonb;
begin
  assert not exists(select 1 from public.fleet_certificates where category_key in
    ('07-2-life-jacket','07-4-gmdss','07-6-pyrotechnie','07-8-bouee-feux-retournement-mob')), 'Transferred categories remain in source';
  assert not exists(select 1 from private.lsa_transfer_audit a left join public.lsa_items i on i.id=a.source_id
    where a.source_table='fleet_certificates' and i.id is null), 'Transferred item missing';
  assert not exists(select 1 from private.lsa_transfer_audit a left join public.lsa_versions v on v.id=a.source_id
    where a.source_table='fleet_certificate_versions' and a.snapshot is distinct from to_jsonb(v)), 'Version copy differs';
  assert not exists(select 1 from private.lsa_transfer_audit a left join public.lsa_renewal_events e on e.id=a.source_id
    where a.source_table='fleet_certificate_renewal_events' and a.snapshot is distinct from to_jsonb(e)), 'Event copy differs';
  assert not has_table_privilege('anon','public.lsa_items','SELECT'), 'Anonymous access';
  assert not has_table_privilege('authenticated','public.lsa_items','UPDATE'), 'Direct update bypass';
  assert not has_table_privilege('authenticated','public.lsa_items','INSERT'), 'Direct insert bypass';
  assert not has_table_privilege('authenticated','public.lsa_items','DELETE'), 'Direct delete bypass';
  assert not has_function_privilege('anon','public.save_lsa_item(bigint,jsonb,bigint,timestamptz)','EXECUTE'), 'Anonymous write RPC';
  assert not has_function_privilege('anon','public.lsa_next_item_number(bigint,bigint)','EXECUTE'), 'Anonymous number preview RPC';
  assert not has_function_privilege('anon','public.lsa_can_add_item(bigint)','EXECUTE'), 'Anonymous creation capability RPC';
  assert not has_function_privilege('anon','public.update_lsa_item_expiry(bigint,date,timestamptz)','EXECUTE'), 'Anonymous expiry RPC';
  assert not has_function_privilege('anon','public.delete_lsa_item(bigint,timestamptz)','EXECUTE'), 'Anonymous deletion RPC';
  assert has_function_privilege('authenticated','public.lsa_can_add_item(bigint)','EXECUTE'), 'Creation capability unavailable to client';
  assert not has_function_privilege('authenticated','private.can_access_lsa_vessel(bigint,bigint)','EXECUTE'), 'Private scope helper exposed';
  select id into strict company from public.companies where code='bbtm';
  select id into strict designation from public.lsa_designations where company_id=company and name='EPIRB';
  payload:=jsonb_build_object('designation_id',designation,'expires_on',current_date+90,'notes','LSA fixture');
  insert into public.companies(code,name) values('lsa-fixture-'||gen_random_uuid(),'LSA other company') returning id into other_company;
  select id into strict foreign_designation from public.lsa_designations where company_id=other_company and name='EPIRB';
  select id into strict foreign_type from public.lsa_equipment_types where company_id=other_company and name='Survie';
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(company,'LSA assigned fixture','LSAA',true,'vessel') returning id into vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(company,'LSA unassigned fixture','LSAU',true,'vessel') returning id into unassigned;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(other_company,'LSA foreign fixture','LSAF',true,'vessel') returning id into foreign_vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(company,'LSA inactive fixture','LSAI',false,'vessel') returning id into inactive_vessel;
  insert into public.lsa_items(company_id,vessel_id,title,category_key,issued_on,expires_on) values(company,vessel,'Assigned fixture','07-2-life-jacket',current_date-1,current_date+1) returning id into item;
  insert into public.lsa_items(company_id,vessel_id,title,category_key,issued_on,expires_on) values(company,unassigned,'Unassigned fixture','07-4-gmdss',current_date-1,current_date+1) returning id into hidden_item;
  insert into public.lsa_items(company_id,vessel_id,title,category_key,issued_on,expires_on) values(other_company,foreign_vessel,'Other company fixture','07-6-pyrotechnie',current_date-1,current_date+1) returning id into other_item;
  insert into public.lsa_versions(company_id,certificate_id,version_no,original_file_name,normalized_file_name,storage_path)
    values(company,item,1,'fixture.pdf','fixture.pdf','lsa-test/assigned.pdf'),(company,hidden_item,1,'hidden.pdf','hidden.pdf','lsa-test/hidden.pdf');
  insert into public.lsa_renewal_events(company_id,certificate_id,event_type) values(company,item,'submitted'),(company,hidden_item,'submitted');

  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    -- Fixture setup runs without the preceding profile's JWT claims.
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{}',true);
    actor := gen_random_uuid();
    insert into auth.users(id,email) values(actor,actor::text||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,actor::text||'@example.invalid','LSA '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    if role_name in ('capitaine','marin') then
      insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
        values(company,actor,'LSA',role_name,case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,actor::text,true) returning id into person;
      insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
        values(company,vessel,person,current_date-1,current_date+1,case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,'confirmed'),
          (company,inactive_vessel,person,current_date-1,current_date+1,case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,'confirmed');
    end if;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    assert exists(select 1 from public.lsa_items where id=item), role_name||' cannot see assigned inventory';
    assert exists(select 1 from public.lsa_designations where id=designation), 'Catalog invisible';
    assert not exists(select 1 from public.lsa_designations where company_id=other_company), 'Foreign catalog visible';
    assert not exists(select 1 from public.lsa_items where id=other_item), role_name||' cross-company leak';
    assert exists(select 1 from public.lsa_available_vessels() where id=vessel), role_name||' missing vessel';
    assert not exists(select 1 from public.lsa_available_vessels() where id=foreign_vessel), 'Foreign vessel leak';
    assert public.lsa_can_add_item(vessel), role_name||' assigned vessel capability denied';
    assert not public.lsa_can_add_item(foreign_vessel), role_name||' foreign vessel capability allowed';
    assert exists(select 1 from public.lsa_versions where certificate_id=item), 'Missing document';
    next_number:=public.lsa_next_item_number(vessel,designation);
    saved:=public.save_lsa_item(vessel,payload);
    assert (select item_number=next_number and designation_id=designation from public.lsa_items where id=saved), role_name||' cannot create numbered equipment';
    assert public.lsa_next_item_number(vessel,designation)=next_number+1, 'Preview did not advance after creation';
    expired_saved:=public.save_lsa_item(vessel,payload||jsonb_build_object('expires_on',current_date-2));
    assert exists(select 1 from public.lsa_items where id=expired_saved and expires_on=current_date-2), role_name||' expired equipment hidden after creation';
    select updated_at into current_revision from public.lsa_items where id=saved;
    perform public.save_lsa_item(vessel,payload||'{"notes":"Edited fixture","brand":"Ocean","model":"Test","serial_number":"SN-001"}',saved,current_revision);
    assert (select notes='Edited fixture' and brand='Ocean' and model='Test' and serial_number='SN-001' from public.lsa_items where id=saved), role_name||' cannot edit inventory';
    begin
      perform public.save_lsa_item(vessel,payload,saved,current_revision);
      raise exception 'Stale update accepted';
    exception when serialization_failure then null; end;
    select updated_at into current_revision from public.lsa_items where id=saved;
    begin
      perform public.save_lsa_item(foreign_vessel,payload);
      raise exception 'Cross-company write accepted';
    exception when insufficient_privilege then null; end;
    begin
      perform public.lsa_next_item_number(foreign_vessel,designation);
      raise exception 'Cross-company vessel counter accepted';
    exception when insufficient_privilege then null; end;
    begin
      perform public.save_lsa_item(vessel,payload||jsonb_build_object('designation_id',foreign_designation));
      raise exception 'Cross-company designation accepted';
    exception when insufficient_privilege then null; end;
    begin
      perform public.lsa_next_item_number(vessel,foreign_designation);
      raise exception 'Cross-company designation counter accepted';
    exception when insufficient_privilege then null; end;
    if role_name in ('capitaine','marin') then
      assert not exists(select 1 from public.lsa_items where id=hidden_item), role_name||' unassigned leak';
      assert not exists(select 1 from public.lsa_versions where certificate_id=hidden_item), 'Unassigned version leak';
      assert not exists(select 1 from public.lsa_renewal_events where certificate_id=hidden_item), 'Unassigned history leak';
      assert not exists(select 1 from public.lsa_available_vessels() where id=unassigned), 'Unassigned vessel leak';
      assert not public.lsa_can_add_item(unassigned), role_name||' unassigned vessel capability allowed';
      assert not public.lsa_can_add_item(inactive_vessel), role_name||' inactive vessel capability allowed';
      begin
        perform public.save_lsa_item(unassigned,payload,hidden_item,current_revision);
        raise exception 'Onboard profile edited unassigned inventory';
      exception when insufficient_privilege then null; end;
      begin
        perform public.update_lsa_item_expiry(hidden_item,current_date+365,current_revision);
        raise exception 'Onboard profile renewed unassigned inventory';
      exception when insufficient_privilege then null; end;
      begin
        perform public.delete_lsa_item(hidden_item,current_revision);
        raise exception 'Onboard profile deleted unassigned inventory';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_lsa_item(unassigned,payload);
        raise exception 'Onboard profile added unassigned inventory';
      exception when insufficient_privilege then null; end;
      begin
        perform public.lsa_next_item_number(unassigned,designation);
        raise exception 'Onboard profile previewed unassigned counter';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_lsa_item(inactive_vessel,payload);
        raise exception 'Onboard profile added inactive inventory';
      exception when insufficient_privilege then null; end;
      begin
        perform public.lsa_next_item_number(inactive_vessel,designation);
        raise exception 'Onboard profile previewed inactive counter';
      exception when insufficient_privilege then null; end;
      -- Historical inventory can remain readable after disembarkation; creation needs current access.
      execute 'reset role';
      update public.planning_assignments set ends_at=((current_date-1)::timestamp+interval '23 hours 59 minutes 59 seconds') at time zone 'Europe/Paris'
      where crew_person_id=person and vessel_id=vessel;
      execute 'set local role authenticated';
      assert exists(select 1 from public.lsa_items where id=item), 'Historical assigned inventory should remain readable';
      assert not public.lsa_can_add_item(vessel), 'Historical vessel capability remained enabled';
      begin
        perform public.save_lsa_item(vessel,payload);
        raise exception 'Formerly assigned profile added inventory';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_lsa_item(vessel,payload,saved,current_revision);
        raise exception 'Formerly assigned profile edited inventory';
      exception when insufficient_privilege then null; end;
      begin
        perform public.update_lsa_item_expiry(saved,current_date+365,current_revision);
        raise exception 'Formerly assigned profile renewed inventory';
      exception when insufficient_privilege then null; end;
      begin
        perform public.delete_lsa_item(saved,current_revision);
        raise exception 'Formerly assigned profile deleted inventory';
      exception when insufficient_privilege then null; end;
      begin
        perform public.lsa_next_item_number(vessel,designation);
        raise exception 'Formerly assigned profile previewed counter';
      exception when insufficient_privilege then null; end;
      execute 'reset role';
      update public.planning_assignments set ends_at=((current_date+1)::timestamp+interval '23 hours 59 minutes 59 seconds') at time zone 'Europe/Paris'
      where crew_person_id=person and vessel_id=vessel;
      execute 'set local role authenticated';
    end if;
    if role_name in ('admin','capitaine') then
      catalog_type:=public.save_lsa_catalog_entry('type',jsonb_build_object('name','LSA profile type '||role_name));
      catalog_designation:=public.save_lsa_catalog_entry('designation',jsonb_build_object('name','LSA profile designation '||role_name,'equipment_type_id',catalog_type));
      select updated_at into current_revision from public.lsa_designations where id=catalog_designation;
      perform public.save_lsa_catalog_entry('designation',jsonb_build_object('id',catalog_designation,'updated_at',current_revision,'name','LSA renamed designation '||role_name,'equipment_type_id',catalog_type,'active',false));
      assert (select name='LSA renamed designation '||role_name and not active from public.lsa_designations where id=catalog_designation), role_name||' catalog edit failed';
      select updated_at into current_revision from public.lsa_equipment_types where id=catalog_type;
      perform public.save_lsa_catalog_entry('type',jsonb_build_object('id',catalog_type,'updated_at',current_revision,'name','LSA renamed type '||role_name,'active',false));
      assert (select name='LSA renamed type '||role_name and not active from public.lsa_equipment_types where id=catalog_type), role_name||' type edit failed';
      begin
        perform public.save_lsa_catalog_entry('designation',jsonb_build_object('name','Foreign type attempt','equipment_type_id',foreign_type));
        raise exception 'Cross-company catalog type accepted';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_lsa_catalog_entry('designation',jsonb_build_object('id',foreign_designation,'updated_at',clock_timestamp(),'name','Foreign designation attempt','equipment_type_id',catalog_type));
        raise exception 'Cross-company catalog entry edited';
      exception when serialization_failure then null; end;
    else
      begin
        perform public.save_lsa_catalog_entry('type', '{"name":"Unauthorized type"}');
        raise exception 'Unauthorized profile edited catalog';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_lsa_catalog_entry('designation',jsonb_build_object('name','Unauthorized designation','equipment_type_id',foreign_type));
        raise exception 'Unauthorized profile edited designations';
      exception when insufficient_privilege then null; end;
    end if;
    execute 'reset role';
    -- Revoking the navigation permission also revokes reads and RPC writes.
    update public.role_module_permissions set is_visible=false where module_key='lsa' and role_key=role_name;
    execute 'set local role authenticated';
    select count(*) into count_before from public.lsa_items;
    assert not exists(select 1 from public.lsa_equipment_types), 'Disabled module leaked catalog';
    assert count_before=0, 'Disabled module still readable';
    assert not exists(select 1 from public.lsa_available_vessels()), 'Disabled module leaked vessels';
    assert not public.lsa_can_add_item(vessel), 'Disabled module retained creation capability';
    begin
      perform public.save_lsa_item(vessel,payload);
      raise exception 'Disabled module accepted write';
    exception when insufficient_privilege then null; end;
    begin
      perform public.update_lsa_item_expiry(saved,current_date+365,current_revision);
      raise exception 'Disabled module accepted renewal';
    exception when insufficient_privilege then null; end;
    begin
      perform public.delete_lsa_item(saved,current_revision);
      raise exception 'Disabled module accepted deletion';
    exception when insufficient_privilege then null; end;
    begin
      perform public.lsa_next_item_number(vessel,designation);
      raise exception 'Disabled module accepted number preview';
    exception when insufficient_privilege then null; end;
    begin
      perform public.save_lsa_catalog_entry('type','{"name":"Disabled module type"}');
      raise exception 'Disabled module accepted catalog write';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=true where module_key='lsa' and role_key=role_name;
  end loop;
end $$;
rollback;
