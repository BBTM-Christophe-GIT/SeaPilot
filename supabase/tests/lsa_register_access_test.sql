-- Exercise real authenticated profiles and assignments, never an admin UI simulation.
begin;
do $$
declare
  company bigint; other_company bigint; vessel bigint; unassigned bigint; foreign_vessel bigint;
  actor uuid; person bigint; role_name text; item bigint; other_item bigint; hidden_item bigint;
  current_revision timestamptz; saved bigint; count_before bigint;
  payload jsonb := '{"category_key":"07-2-life-jacket","document_title":"LSA fixture","issued_on":"2026-01-01","expires_on":"2030-01-01"}';
begin
  assert not exists(select 1 from public.fleet_certificates where category_key in
    ('07-2-life-jacket','07-4-gmdss','07-6-pyrotechnie','07-8-bouee-feux-retournement-mob')), 'Transferred categories remain in source';
  assert not exists(select 1 from private.lsa_transfer_audit a left join public.lsa_items i on i.id=a.source_id
    where a.source_table='fleet_certificates' and a.snapshot is distinct from to_jsonb(i)), 'Item copy differs';
  assert not exists(select 1 from private.lsa_transfer_audit a left join public.lsa_versions v on v.id=a.source_id
    where a.source_table='fleet_certificate_versions' and a.snapshot is distinct from to_jsonb(v)), 'Version copy differs';
  assert not exists(select 1 from private.lsa_transfer_audit a left join public.lsa_renewal_events e on e.id=a.source_id
    where a.source_table='fleet_certificate_renewal_events' and a.snapshot is distinct from to_jsonb(e)), 'Event copy differs';
  assert not has_table_privilege('anon','public.lsa_items','SELECT'), 'Anonymous access';
  assert not has_table_privilege('authenticated','public.lsa_items','UPDATE'), 'Direct update bypass';
  assert not has_table_privilege('authenticated','public.lsa_items','DELETE'), 'Direct delete bypass';
  assert not has_function_privilege('anon','public.save_lsa_item(bigint,jsonb,bigint,timestamptz)','EXECUTE'), 'Anonymous write RPC';
  select id into strict company from public.companies where code='bbtm';
  insert into public.companies(code,name) values('lsa-fixture-'||gen_random_uuid(),'LSA other company') returning id into other_company;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(company,'LSA assigned fixture','LSAA',true,'vessel') returning id into vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(company,'LSA unassigned fixture','LSAU',true,'vessel') returning id into unassigned;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(other_company,'LSA foreign fixture','LSAF',true,'vessel') returning id into foreign_vessel;
  insert into public.lsa_items(company_id,vessel_id,title,category_key,issued_on,expires_on) values(company,vessel,'Assigned fixture','07-2-life-jacket',current_date-1,current_date+1) returning id into item;
  insert into public.lsa_items(company_id,vessel_id,title,category_key,issued_on,expires_on) values(company,unassigned,'Unassigned fixture','07-4-gmdss',current_date-1,current_date+1) returning id into hidden_item;
  insert into public.lsa_items(company_id,vessel_id,title,category_key,issued_on,expires_on) values(other_company,foreign_vessel,'Other company fixture','07-6-pyrotechnie',current_date-1,current_date+1) returning id into other_item;
  insert into public.lsa_versions(company_id,certificate_id,version_no,original_file_name,normalized_file_name,storage_path)
    values(company,item,1,'fixture.pdf','fixture.pdf','lsa-test/assigned.pdf'),(company,hidden_item,1,'hidden.pdf','hidden.pdf','lsa-test/hidden.pdf');
  insert into public.lsa_renewal_events(company_id,certificate_id,event_type) values(company,item,'submitted'),(company,hidden_item,'submitted');

  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    actor := gen_random_uuid();
    insert into auth.users(id,email) values(actor,actor::text||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,actor::text||'@example.invalid','LSA '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    if role_name in ('capitaine','marin') then
      insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active)
        values(company,actor,'LSA',role_name,case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,actor::text,true) returning id into person;
      insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
        values(company,vessel,person,current_date-1,current_date+1,case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,'confirmed');
    end if;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    assert exists(select 1 from public.lsa_items where id=item), role_name||' cannot see assigned inventory';
    assert not exists(select 1 from public.lsa_items where id=other_item), role_name||' cross-company leak';
    assert exists(select 1 from public.lsa_available_vessels() where id=vessel), role_name||' missing vessel';
    assert not exists(select 1 from public.lsa_available_vessels() where id=foreign_vessel), 'Foreign vessel leak';
    assert exists(select 1 from public.lsa_versions where certificate_id=item), 'Missing document';
    if role_name in ('capitaine','marin') then
      assert not exists(select 1 from public.lsa_items where id=hidden_item), role_name||' unassigned leak';
      assert not exists(select 1 from public.lsa_versions where certificate_id=hidden_item), 'Unassigned version leak';
      assert not exists(select 1 from public.lsa_renewal_events where certificate_id=hidden_item), 'Unassigned history leak';
      assert not exists(select 1 from public.lsa_available_vessels() where id=unassigned), 'Unassigned vessel leak';
      begin
        perform public.save_lsa_item(vessel,payload);
        raise exception 'Onboard profile wrote inventory';
      exception when insufficient_privilege then null; end;
    else
      saved := public.save_lsa_item(vessel,payload);
      select updated_at into current_revision from public.lsa_items where id=saved;
      perform public.save_lsa_item(vessel,payload||'{"document_title":"Edited fixture"}',saved,current_revision);
      assert (select document_title='Edited fixture' from public.lsa_items where id=saved), 'Update lost';
      begin
        perform public.save_lsa_item(vessel,payload,saved,current_revision);
        raise exception 'Stale update accepted';
      exception when serialization_failure then null; end;
      begin
        perform public.save_lsa_item(foreign_vessel,payload);
        raise exception 'Cross-company write accepted';
      exception when insufficient_privilege then null; end;
    end if;
    execute 'reset role';
    -- Revoking the navigation permission also revokes reads and RPC writes.
    update public.role_module_permissions set is_visible=false where module_key='lsa' and role_key=role_name;
    execute 'set local role authenticated';
    select count(*) into count_before from public.lsa_items;
    assert count_before=0, 'Disabled module still readable';
    assert not exists(select 1 from public.lsa_available_vessels()), 'Disabled module leaked vessels';
    begin
      perform public.save_lsa_item(vessel,payload);
      raise exception 'Disabled module accepted write';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=true where module_key='lsa' and role_key=role_name;
  end loop;
end $$;
rollback;
