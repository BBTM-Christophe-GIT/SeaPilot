-- Tests use isolated companies and real authenticated users, rolled back in full.
begin;
do $$
declare
  company bigint; other_company bigint; vessel bigint; second_vessel bigint; actor uuid;
  designation bigint; second_designation bigint; foreign_designation bigint; equipment bigint; other_type bigint;
  first_item bigint; second_item bigint; third_item bigint; entry_id bigint;
  revision timestamptz; catalog_revision timestamptz; payload jsonb; catalog_payload jsonb;
begin
  assert not has_table_privilege('authenticated','public.lsa_designations','INSERT'), 'Direct catalog insert';
  assert not has_table_privilege('authenticated','private.lsa_designation_counters','SELECT'), 'Counter leak';
  assert not has_function_privilege('anon','public.save_lsa_catalog_entry(text,jsonb)','EXECUTE'), 'Anonymous catalog RPC';
  assert not has_function_privilege('authenticated','private.seed_lsa_catalog(bigint)','EXECUTE'), 'Seed callable by client';
  insert into public.companies(code,name) values('lsa-catalog-'||gen_random_uuid(),'LSA catalog fixture') returning id into company;
  insert into public.companies(code,name) values('lsa-foreign-'||gen_random_uuid(),'LSA foreign fixture') returning id into other_company;
  assert (select count(*) from public.lsa_equipment_types where company_id=company)=5, 'Missing default types';
  assert (select count(*) from public.lsa_designations where company_id=company)=16, 'Missing default designations';
  select id into strict designation from public.lsa_designations where company_id=company and name='Feu à main';
  select id into strict second_designation from public.lsa_designations where company_id=company and name='EPIRB';
  select id into strict foreign_designation from public.lsa_designations where company_id=other_company and name='EPIRB';
  select id into strict equipment from public.lsa_equipment_types where company_id=company and name='Survie';
  select id into strict other_type from public.lsa_equipment_types where company_id=other_company and name='Survie';
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(company,'LSA catalog A','LSACA',true,'vessel') returning id into vessel;
  insert into public.vessels(company_id,name,acronym,active,asset_kind) values(company,'LSA catalog B','LSACB',true,'vessel') returning id into second_vessel;
  actor:=gen_random_uuid();
  insert into auth.users(id,email) values(actor,actor::text||'@example.invalid');
  insert into public.profiles(id,email,display_name,active_company_id) values(actor,actor::text||'@example.invalid','LSA catalog admin',company);
  insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
  insert into public.user_roles(company_id,user_id,role_key) values(company,actor,'admin');
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  payload:=jsonb_build_object('designation_id',designation,'brand','Test brand','model','Test model','serial_number','000123','expires_on',current_date+90);
  assert public.lsa_next_item_number(vessel,designation)=1, 'First number preview';
  first_item:=public.save_lsa_item(vessel,payload||'{"category_key":"spoofed","item_number":999,"document_title":"spoofed"}');
  second_item:=public.save_lsa_item(vessel,payload);
  assert (select document_title='Feu à main - 01' and item_number=1 and category_label='Pyrotechnie' from public.lsa_items where id=first_item), 'Server did not assign title/type/number';
  assert (select document_title='Feu à main - 02' and alarm_on=current_date and serial_number='000123' from public.lsa_items where id=second_item), 'Sequence/expiry/serial mismatch';
  third_item:=public.save_lsa_item(second_vessel,payload);
  assert (select item_number=1 from public.lsa_items where id=third_item), 'Numbers not vessel scoped';
  select updated_at into revision from public.lsa_items where id=first_item;
  perform public.save_lsa_item(vessel,payload||'{"brand":"Changed"}',first_item,revision);
  assert (select item_number=1 and brand='Changed' from public.lsa_items where id=first_item), 'Edit renumbered item';
  select updated_at into revision from public.lsa_items where id=second_item;
  perform public.save_lsa_item(vessel,payload||jsonb_build_object('designation_id',second_designation),second_item,revision);
  assert (select item_number=1 and category_label='GMDSS' from public.lsa_items where id=second_item), 'Change did not infer type';
  assert public.lsa_next_item_number(vessel,designation)=3, 'Number reused after change';
  second_item:=public.save_lsa_item(vessel,payload);
  assert (select item_number=3 from public.lsa_items where id=second_item), 'Counter lost high-water mark';
  begin
    perform public.save_lsa_item(vessel,payload||jsonb_build_object('designation_id',foreign_designation));
    raise exception 'Foreign designation accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.lsa_next_item_number(vessel,foreign_designation);
    raise exception 'Foreign counter preview accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_lsa_item(vessel,payload||'{"designation_id":null}');
    raise exception 'Missing designation accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_lsa_item(vessel,payload||jsonb_build_object('brand',repeat('X',201)));
    raise exception 'Long field accepted';
  exception when check_violation then null; end;
  assert public.lsa_next_item_number(vessel,designation)=4, 'Failed save consumed number';

  -- Rename and move a designation while retaining numbering and updating attached items.
  select updated_at into catalog_revision from public.lsa_designations where id=designation;
  catalog_payload:=jsonb_build_object('id',designation,'updated_at',catalog_revision,'name','Feu de test','equipment_type_id',equipment,'active',true);
  perform public.save_lsa_catalog_entry('designation',catalog_payload);
  assert (select document_title='Feu de test - 03' and category_label='Survie' and item_number=3 from public.lsa_items where id=second_item), 'Catalog move lost references';
  begin
    perform public.save_lsa_catalog_entry('designation',catalog_payload);
    raise exception 'Stale catalog edit accepted';
  exception when serialization_failure then null; end;
  select updated_at into catalog_revision from public.lsa_designations where id=designation;
  catalog_payload:=catalog_payload||jsonb_build_object('updated_at',catalog_revision);
  begin
    perform public.save_lsa_catalog_entry('designation',catalog_payload||jsonb_build_object('equipment_type_id',other_type));
    raise exception 'Cross-company catalog move accepted';
  exception when insufficient_privilege then null; end;
  perform public.save_lsa_catalog_entry('designation',catalog_payload||'{"active":false}');
  begin
    perform public.save_lsa_item(vessel,payload);
    raise exception 'Archived designation accepted for new item';
  exception when invalid_parameter_value then null; end;
  select updated_at into revision from public.lsa_items where id=first_item;
  perform public.save_lsa_item(vessel,payload||'{"notes":"Archived fiche remains editable"}',first_item,revision);
  assert (select item_number=1 from public.lsa_items where id=first_item), 'Archived fiche renumbered';
  entry_id:=public.save_lsa_catalog_entry('type','{"name":"Custom equipment"}');
  entry_id:=public.save_lsa_catalog_entry('designation',jsonb_build_object('name','Custom designation','equipment_type_id',entry_id));
  assert exists(select 1 from public.lsa_designations where id=entry_id), 'Admin creation failed';
  begin
    perform public.save_lsa_catalog_entry('designation',jsonb_build_object('name','Custom designation','equipment_type_id',equipment));
    raise exception 'Duplicate designation accepted';
  exception when invalid_parameter_value then null; end;
  -- Preserve source fields when a legacy item has no safe catalog mapping.
  execute 'reset role';
  insert into public.lsa_items(company_id,vessel_id,title,document_title,category_key,issued_on,expires_on,provider_name,renewal_notes)
    values(company,vessel,'Legacy VFI 275N','Legacy VFI 275N','07-2-life-jacket',current_date-10,current_date+20,'Historical provider','Historical note') returning id,updated_at into first_item,revision;
  insert into private.lsa_designation_counters(company_id,vessel_id,designation_id,last_number) values(company,vessel,entry_id,99);
  execute 'set local role authenticated';
  perform public.save_lsa_item(vessel,'{"designation_id":null,"brand":"Legacy brand","expires_on":"2030-01-01"}',first_item,revision);
  assert (select document_title='Legacy VFI 275N' and provider_name='Historical provider' and renewal_notes='Historical note' and issued_on=current_date-10 from public.lsa_items where id=first_item), 'Legacy fields lost';
  first_item:=public.save_lsa_item(vessel,jsonb_build_object('designation_id',entry_id));
  assert (select document_title='Custom designation - 100' from public.lsa_items where id=first_item), 'Number truncated at 100';
  execute 'reset role';
end $$;
rollback;
