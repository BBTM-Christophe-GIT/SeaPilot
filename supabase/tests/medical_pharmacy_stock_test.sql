-- Real company, role, current planning and signature fixtures. Roll back all data.
begin;
create temporary table medical_actors(label text primary key, actor uuid, company_id bigint, person_id bigint);
create temporary table medical_vessels(label text primary key, vessel_id bigint, company_id bigint);

do $fixtures$
declare company bigint; foreign_company bigint; vessel bigint; person bigint; actor record;
  today date := (current_timestamp at time zone 'Europe/Paris')::date;
begin
  insert into public.companies(code, name) values ('med-stock-fixture-a', 'Medical stock fixture A') returning id into company;
  insert into public.companies(code, name) values ('med-stock-fixture-b', 'Medical stock fixture B') returning id into foreign_company;
  insert into public.vessels(company_id, name, active, asset_kind) values (company, 'MEDICAL STOCK CURRENT', true, 'vessel') returning id into vessel;
  insert into medical_vessels values ('current', vessel, company);
  insert into public.vessels(company_id, name, active, asset_kind) values (company, 'MEDICAL STOCK OTHER', true, 'vessel') returning id into vessel;
  insert into medical_vessels values ('other', vessel, company);
  insert into public.vessels(company_id, name, active, asset_kind) values (foreign_company, 'MEDICAL STOCK FOREIGN', true, 'vessel') returning id into vessel;
  insert into medical_vessels values ('foreign', vessel, foreign_company);
  select vessel_id into vessel from medical_vessels where label = 'current';

  for actor in select * from (values
    ('admin', 'ea010000-0000-4000-8000-000000000001'::uuid, 'admin'),
    ('captain', 'ea010000-0000-4000-8000-000000000002'::uuid, 'capitaine'),
    ('marin', 'ea010000-0000-4000-8000-000000000003'::uuid, 'marin')
  ) as fixtures(label, uid, role_key) loop
    insert into auth.users(id, email) values (actor.uid, 'med-stock-' || actor.label || '@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
      values (actor.uid, 'med-stock-' || actor.label || '@example.invalid', 'Medical stock ' || actor.label, company);
    insert into public.company_memberships(company_id, user_id, active) values (company, actor.uid, true)
      on conflict(company_id, user_id) do update set active = true;
    insert into public.user_roles(company_id, user_id, role_key) values (company, actor.uid, actor.role_key);
    insert into public.people(company_id, user_id, first_name, last_name, active)
      values (company, actor.uid, 'Medical stock', actor.label, true) returning id into person;
    insert into medical_actors values (actor.label, actor.uid, company, person);
    if actor.label <> 'admin' then
      insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at, confirmation_status)
        values (company, vessel, person, today-1, today+1, (today-1)::timestamp at time zone 'Europe/Paris',
          (today+1)::timestamp at time zone 'Europe/Paris', 'confirmed');
    end if;
    if actor.label = 'captain' then
      insert into storage.objects(bucket_id, name, owner_id, metadata)
        values ('working-time-signatures', company || '/' || person || '/medical-stock.png', actor.uid::text, '{"mimetype":"image/png","size":128}');
      insert into public.working_time_profile_signatures(company_id, person_id, version_number, storage_bucket, storage_path,
        mime_type, file_size_bytes, sha256, valid_from, created_by)
        values (company, person, 1, 'working-time-signatures', company || '/' || person || '/medical-stock.png', 'image/png',
          128, repeat('a',64), clock_timestamp() - interval '1 minute', actor.uid);
    end if;
  end loop;

  insert into public.planning_releases(company_id, version_number, snapshot, published_by, published_by_name)
    select company, 1, jsonb_build_object('scope', jsonb_build_object('company_id', company), 'assignments',
      (select jsonb_agg(to_jsonb(a)) from public.planning_assignments a where a.company_id = company)),
      a.actor, 'Medical stock admin' from medical_actors a where a.label = 'admin';
end $fixtures$;

-- Medical dispensing and lot adjustments commit together under actual profiles.
do $medication_stock$
declare
  vessel bigint; other bigint; foreign_vessel bigint; company bigint; foreign_company bigint;
  item bigint; second bigint; unknown_stock bigint; extra_item bigint; other_item bigint; foreign_item bigint; entry bigint;
  admin uuid; captain uuid; sailor uuid;
  result jsonb; content jsonb; request jsonb; creation jsonb; dose jsonb; invalid jsonb; history jsonb;
  today date := (current_timestamp at time zone 'Europe/Paris')::date;
begin
  select vessel_id, company_id into vessel, company from medical_vessels where label = 'current';
  select vessel_id into other from medical_vessels where label = 'other';
  select vessel_id, company_id into foreign_vessel, foreign_company from medical_vessels where label = 'foreign';
  select actor into admin from medical_actors where label = 'admin';
  select actor into captain from medical_actors where label = 'captain';
  select actor into sailor from medical_actors where label = 'marin';
  insert into public.pharmacy_inventory(company_id, vessel_id, designation, quantity, required_quantity)
    values (company, other, 'Other ship fixture', '8', '8') returning id into other_item;
  insert into public.pharmacy_inventory(company_id, vessel_id, designation, quantity, required_quantity)
    values (foreign_company, foreign_vessel, 'Other company fixture', '8', '8') returning id into foreign_item;
  assert not has_function_privilege('authenticated', 'medical_logbook_private.apply_medications(bigint,bigint,jsonb,jsonb)', 'EXECUTE'),
    'Direct stock adjustments require the medical save RPC';
  assert not has_function_privilege('anon', 'public.list_medical_logbook_medications(bigint)', 'EXECUTE'),
    'Anonymous users cannot list medical options';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin::text, true);
  item := public.save_pharmacy_item(vessel, jsonb_build_object(
    'designation','Tablet lot','lot_number','lot-1','stock_quantity',6,'required_stock_quantity',6,
    'stock_unit','comprimé','package_size',3,'strength','300 mg',
    'no_expiry',true,'expires_on',today-1,'expiry_precision','day','expiry_text','fixture'));
  second := public.save_pharmacy_item(vessel, '{"designation":"Imported fixture","quantity":"20 X 300mg","required_quantity":"30×300 mg"}');
  unknown_stock := public.save_pharmacy_item(vessel, '{"designation":"Unstructured fixture","quantity":"300 mg","required_quantity":"400 mg"}');
  extra_item := public.save_pharmacy_item(vessel, '{"designation":"Extra fixture","quantity":"2","outside_dotation":true}');
  assert exists(select 1 from public.pharmacy_inventory_notifications() where item_id = extra_item and kind = 'outside_dotation'
    and expires_on is null and days_until_expiry is null), 'Active outside-dotation item produced no dedicated alert';
  assert not exists(select 1 from public.pharmacy_notifications() where item_id in (second, extra_item) or expires_on is null),
    'Dated RPC must remain compatible with clients that format every expiry as a date';
  perform public.save_pharmacy_item(vessel, '{"designation":"Extra fixture","quantity":"2","active":false}', extra_item, 1);
  assert (select outside_dotation from public.pharmacy_inventory where id = extra_item)
    and not exists(select 1 from public.pharmacy_inventory_notifications() where item_id = extra_item),
    'Legacy edit lost the outside-dotation flag or retired article still alerts';
  assert (select no_expiry and expires_on is null and expiry_text = '' and expiry_precision = 'unknown'
    and package_size = 3 and strength = '300 mg' from public.pharmacy_inventory where id = item),
    'No-expiry and packaging fields were not saved correctly';
  assert not exists(select 1 from public.pharmacy_inventory_notifications() where item_id = item),
    'Equal stock and explicit no-expiry produced an alert';
  assert exists(select 1 from public.pharmacy_inventory_notifications() where item_id = second and kind = 'stock'
    and expires_on is null and days_until_expiry is null), 'Legacy count times the same strength did not produce a low-stock alert';
  assert not exists(select 1 from public.pharmacy_inventory_notifications() where item_id = unknown_stock),
    'Unknown legacy quantity produced a stock alert';
  assert jsonb_array_length(public.list_medical_logbook_medications(vessel)) = 3, 'Medical option list escaped vessel';
  begin perform public.list_medical_logbook_medications(foreign_vessel); raise exception 'Other company medication list accepted'; exception when insufficient_privilege then null; end;

  perform set_config('request.jwt.claim.sub', sailor::text, true);
  begin perform public.list_medical_logbook_medications(vessel); raise exception 'Sailor listed medical options'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', captain::text, true);
  assert jsonb_array_length(public.list_medical_logbook_medications(vessel)) = 3, 'Assigned captain cannot list own vessel medication';
  begin perform public.list_medical_logbook_medications(other); raise exception 'Captain listed medication from another vessel'; exception when insufficient_privilege then null; end;
  content := jsonb_build_object('occurred_on', '2026-10-14', 'occurred_time', '11:35', 'patient_name', 'Synthetic medication patient',
    'injury_illness', 'Synthetic injury', 'treatment_medicines', '', 'first_aider_name', public.get_medical_logbook_signer()->>'signer_name');
  dose := jsonb_build_object('item_id', item, 'quantity', 1, 'unit', 'package');
  request := jsonb_build_array(dose, jsonb_build_object('item_id', second, 'quantity', 2, 'unit', 'unit'));
  creation := content || jsonb_build_object('medications', request, 'create_request_id', 'ea010000-0000-4000-8000-100000000001');
  result := public.save_medical_logbook_entry(vessel, null, null, creation);
  entry := (result->>'id')::bigint;
  assert not (result ? 'create_request_id')
    and public.save_medical_logbook_entry(vessel, null, null, creation || '{"patient_name":"Retried after lost response"}'::jsonb) = result,
    'Creation retry must return the first saved entry and keep the request token private';
  assert result#>>'{medications,0,stock_quantity}' = '3' and result#>>'{medications,0,strength}' = '300 mg'
    and result#>>'{medications,0,lot_number}' = 'lot-1', 'Dispensing snapshot lost original package or lot';
  assert (select stock_quantity from public.pharmacy_inventory where id = item) = 3
    and (select stock_quantity from public.pharmacy_inventory where id = second) = 18, 'Medical save did not deduct both quantities';
  assert exists(select 1 from public.pharmacy_inventory_notifications() where item_id = item and kind = 'stock')
    and not exists(select 1 from public.pharmacy_inventory_notifications() where item_id = item and kind = 'item'),
    'Stock and expiration alerts were not independent';
  begin
    perform public.save_pharmacy_item(vessel, '{"designation":"Stale lot","stock_quantity":6}', item, 1);
    raise exception 'Medical dispensing did not invalidate stale pharmacy revision';
  exception when serialization_failure then null; end;
  foreach invalid in array array[
    jsonb_build_array(dose, dose),
    jsonb_build_array(dose || '{"quantity":0.5}'::jsonb),
    jsonb_build_array(dose || '{"stock_quantity":1}'::jsonb),
    jsonb_build_array(dose || jsonb_build_object('item_id', other_item)),
    jsonb_build_array(dose || jsonb_build_object('item_id', foreign_item)),
    jsonb_build_array(dose || jsonb_build_object('item_id', unknown_stock, 'unit', 'unit')),
    jsonb_build_array(dose || jsonb_build_object('item_id', second)),
    jsonb_build_array(dose || '{"quantity":2}'::jsonb, jsonb_build_object('item_id', second, 'quantity', 500, 'unit', 'unit'))
  ] loop
    begin
      perform public.save_medical_logbook_entry(vessel, entry, 1, content || jsonb_build_object('medications', invalid));
      raise exception 'Invalid dispensing accepted: %', invalid;
    exception when invalid_parameter_value then null; end;
  end loop;
  assert (select stock_quantity from public.pharmacy_inventory where id = item) = 3
    and (select stock_quantity from public.pharmacy_inventory where id = second) = 18
    and jsonb_array_length(public.get_medical_logbook_history(entry)) = 1, 'Failed dispensing partially changed stock or history';

  result := public.save_medical_logbook_entry(vessel, entry, 1, content);
  assert result->'medications' is not null and jsonb_array_length(result->'medications') = 2
    and (select revision from public.pharmacy_inventory where id = item) = 2, 'Legacy client changed medications or stock';
  result := public.set_medical_logbook_entry_archived(entry, 2, true);
  result := public.set_medical_logbook_entry_archived(entry, 3, false);
  assert (select stock_quantity from public.pharmacy_inventory where id = item) = 3
    and (select stock_quantity from public.pharmacy_inventory where id = second) = 18, 'Archiving changed physical dispensing';
  perform public.save_pharmacy_item(vessel, (select to_jsonb(i) || '{"package_size":2}'::jsonb from public.pharmacy_inventory i where i.id = item), item, 2);
  result := public.save_medical_logbook_entry(vessel, entry, 4, content || jsonb_build_object('medications', jsonb_build_array(dose || '{"quantity":2}'::jsonb)));
  assert (select stock_quantity from public.pharmacy_inventory where id = item) = 0
    and (select stock_quantity from public.pharmacy_inventory where id = second) = 20
    and result#>>'{medications,0,package_size}' = '3', 'Correction did not use the original conversion or restore removed medication';
  result := public.save_medical_logbook_entry(vessel, entry, 5, content || '{"treatment_medicines":"Treatment notes","medications":[]}'::jsonb);
  assert result->'medications' = '[]'::jsonb and (select stock_quantity from public.pharmacy_inventory where id = item) = 6,
    'Clearing dispensing did not return stock';
  history := public.get_medical_logbook_history(entry);
  assert history#>>'{5,entry,medications,0,package_size}' = '3', 'Original medication history was overwritten';
  execute 'reset role';
end $medication_stock$;

rollback;
select 'MEDICAL_PHARMACY_STOCK_TEST_PASS' as result;
