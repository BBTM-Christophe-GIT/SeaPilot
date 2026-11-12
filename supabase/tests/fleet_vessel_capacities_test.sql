begin;

-- Historical project-files Storage policies rely on a default table grant
-- missing in the local bootstrap. Supply it only inside this rolled-back fixture.
grant select on public.project_billing_documents to authenticated;

do $test$
declare
  company bigint;
  other_company bigint;
  ship_id bigint;
  office_id bigint;
  other_ship_id bigint;
  person bigint;
  actor uuid;
  actor_role text;
  affected integer;
  vessel public.vessels;
  configuration jsonb;
  sounding jsonb;
  latest jsonb;
  invalid_sections jsonb;
  reading_day date := (statement_timestamp() at time zone 'Europe/Paris')::date - 1;
  water_key constant text := 'capacity-754326eb-3e6c-42e5-b0aa-af21d049abde';
  water_input constant jsonb := '{"key":"capacity-754326eb-3e6c-42e5-b0aa-af21d049abde","unit":"liters","value":80}';
  valid_sections constant jsonb := '[
    {"name":"Eau douce","tanks":[{"id":"754326eb-3e6c-42e5-b0aa-af21d049abde","name":"Avant","capacityLiters":125.125,"showInSoutes":true}]},
    {"name":"Eaux grises","tanks":[{"id":"522e62db-679b-4f38-8cbb-031d5e88b916","name":"Avant","capacityLiters":300,"showInSoutes":false}]},
    {"name":"Huile","tanks":[]}
  ]';
  plan_key constant text := '/e3d4159a-44ac-4086-8d5b-9e1d145cc9f5.UGxhbi5wZGY';
  second_plan_key constant text := '/432473d2-a2d2-4357-aac3-1e4b1ba4d7aa.UGxhbi5wbmc';
  plan_path text;
  second_plan_path text;
  foreign_path text;
  denied_path text;
begin
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies(code, name) values ('fleet-capacity-test-other', 'Fleet capacities other company')
    returning id into other_company;
  insert into public.vessels(company_id, name, asset_kind, imo_number, registration_number,
    fuel_capacity_m3, fuel_tank_capacities_liters, daily_fuel_tank_capacity_liters, daily_fuel_tank_name)
  values (company, 'FLEET CAPACITY TEST', 'vessel', '9059262', '941334', 25, array[12357, 12357], 350, 'Caisse service')
    returning * into vessel;
  ship_id := vessel.id;
  insert into public.vessels(company_id, name, asset_kind) values (company, 'FLEET CAPACITY OFFICE', 'office')
    returning id into office_id;
  insert into public.vessels(company_id, name, asset_kind) values (other_company, 'FLEET CAPACITY OTHER', 'vessel')
    returning id into other_ship_id;
  plan_path := company || '/' || ship_id || plan_key;
  second_plan_path := company || '/' || ship_id || second_plan_key;
  foreign_path := other_company || '/' || other_ship_id || plan_key;

  assert vessel.capacity_sections = '[]'::jsonb, 'Legacy vessels start without custom sections';
  configuration := sea_operation_private.fuel_tank_configuration(vessel);
  assert configuration #>> '{0,name}' = 'Cuve Bâbord' and configuration #>> '{1,name}' = 'Cuve Tribord',
    'Two unnamed fuel tanks get nautical defaults';

  for actor, actor_role in select * from (values
    ('6ac32000-0000-4000-8000-000000000001'::uuid, 'admin'),
    ('6ac32000-0000-4000-8000-000000000002'::uuid, 'capitaine'),
    ('6ac32000-0000-4000-8000-000000000003'::uuid, 'marin')
  ) roles(id, role_key) loop
    insert into auth.users(id, email) values (actor, 'fleet-capacities-' || actor_role || '@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
      values (actor, 'fleet-capacities-' || actor_role || '@example.invalid', 'Fleet capacities ' || actor_role, company);
    insert into public.company_memberships(company_id, user_id, active) values (company, actor, true)
      on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles(user_id, company_id, role_key) values (actor, company, actor_role);
    if actor_role <> 'admin' then
      insert into public.people(company_id, user_id, first_name, last_name, function_label, active)
        values (company, actor, 'Fleet', 'Capacities', case actor_role when 'capitaine' then 'Capitaine' else 'Matelot' end, true)
        returning id into person;
      insert into public.planning_assignments(company_id, vessel_id, crew_person_id, captain_person_id, starts_on, ends_on, assignment_role, confirmation_status)
        values (company, ship_id, person, case when actor_role = 'capitaine' then person end, current_date - 1, current_date + 1,
          case actor_role when 'capitaine' then 'Capitaine' else 'Matelot' end, 'confirmed');
    end if;
  end loop;

  assert (select not public and file_size_limit = 26214400 and
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
    from storage.buckets where id = 'fleet-capacity-plans'), 'Plans use a private, type-restricted bucket';
  insert into storage.objects(bucket_id, name) values ('fleet-capacity-plans', foreign_path);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '6ac32000-0000-4000-8000-000000000001', true);

  update public.vessels set fuel_tank_names = array['Soute 1', 'Soute 2'], capacity_sections = valid_sections
    where id = ship_id returning * into vessel;
  assert found and vessel.capacity_sections = valid_sections, 'Admin stores vessel-specific capacities';
  assert vessel.fuel_capacity_m3 = 25 and vessel.fuel_tank_capacities_liters = array[12357, 12357]::numeric[]
    and vessel.daily_fuel_tank_capacity_liters = 350 and vessel.daily_fuel_tank_name = 'Caisse service',
    'Editing tank names and sections preserves all fuel volumes and the service tank name';
  assert (select capacity_sections from public.vessels where id = office_id) = '[]'::jsonb,
    'Custom sections do not leak between records';

  begin
    update public.vessels set capacity_sections = valid_sections where id = office_id;
    raise exception 'An office accepted vessel capacity sections';
  exception when check_violation then null;
  end;
  begin
    update public.vessels set fuel_tank_names = array['Soute', 'SOUTE'] where id = ship_id;
    raise exception 'Duplicate names were accepted for two fuel tanks';
  exception when check_violation then null;
  end;
  foreach invalid_sections in array array[
    '{}'::jsonb, '[true]'::jsonb, '[{"name":"carburant","tanks":[]}]'::jsonb, '[{"name":"PLANS","tanks":[]}]'::jsonb,
    '[{"name":"Eau","tanks":[]},{"name":"EAU","tanks":[]}]'::jsonb,
    jsonb_set(valid_sections, '{0,tanks,0,capacityLiters}', '"300"'),
    jsonb_set(valid_sections, '{0,tanks,0,capacityLiters}', '0.0001'),
    jsonb_set(valid_sections, '{0,tanks,0,capacityLiters}', '0'),
    jsonb_set(valid_sections, '{0,tanks,0,showInSoutes}', '"true"'),
    jsonb_set(valid_sections, '{1,tanks,0,id}', valid_sections #> '{0,tanks,0,id}'),
    jsonb_insert(valid_sections, '{0,tanks,1}', valid_sections #> '{1,tanks,0}')
  ] loop
    begin
      update public.vessels set capacity_sections = invalid_sections where id = ship_id;
      raise exception 'Invalid custom capacity sections accepted: %', invalid_sections;
    exception when check_violation then null;
    end;
  end loop;
  foreach denied_path in array array['main-0', 'main-21', water_key] loop
    begin
      update public.vessels set hidden_fuel_tank_keys = array[denied_path] where id = ship_id;
      raise exception 'An invalid hidden fuel key was accepted: %', denied_path;
    exception when check_violation then null;
    end;
  end loop;

  sounding := public.sea_operation_fuel_tanks(ship_id, reading_day, null);
  assert (sounding->>'updatesFuelBaseline')::boolean and jsonb_array_length(sounding->'tanks') = 4
    and sounding #>> '{tanks,3,key}' = water_key and sounding #>> '{tanks,3,sectionName}' = 'Eau douce',
    'Soutes returns the visible main, day and opted-in custom tanks';
  sounding := public.sea_operation_save_fuel_tanks(ship_id, reading_day, time '08:00', null,
    '[
      {"key":"main-1","unit":"liters","value":300},
      {"key":"main-2","unit":"liters","value":200},
      {"key":"day","unit":"liters","value":30}
    ]'::jsonb || jsonb_build_array(water_input));
  assert (sounding #>> '{reading,mainLiters}')::numeric = 500 and (sounding #>> '{reading,updatesFuelBaseline}')::boolean,
    'Only complete main fuel tanks affect the fuel reference';
  update public.vessels set hidden_fuel_tank_keys = array['main-2', 'day'] where id = ship_id;
  sounding := public.sea_operation_fuel_tanks(ship_id, reading_day, time '08:00');
  assert not (sounding->>'updatesFuelBaseline')::boolean and jsonb_array_length(sounding->'tanks') = 2
    and jsonb_array_length(sounding #> '{reading,tanks}') = 4,
    'Changing visibility preserves the historical full sounding';
  begin
    perform public.sea_operation_save_fuel_tanks(ship_id, reading_day, time '08:00', 1,
      '[{"key":"main-1","unit":"liters","value":100}]'::jsonb || jsonb_build_array(water_input));
    raise exception 'A partial configuration overwrote a historical full sounding';
  exception when invalid_parameter_value then null;
  end;

  insert into storage.objects(bucket_id, name) values ('fleet-capacity-plans', plan_path), ('fleet-capacity-plans', second_plan_path);
  assert (select count(*) from storage.objects where bucket_id = 'fleet-capacity-plans' and name in (plan_path, second_plan_path)) = 2,
    'Admin can insert and list multiple plans for the same vessel';
  foreach denied_path in array array[
    foreign_path, company || '/' || other_ship_id || second_plan_key, other_company || '/' || ship_id || second_plan_key,
    company || '/' || office_id || plan_key, company || '/99999999999999999999' || plan_key,
    company || '/' || ship_id || '/extra' || plan_key
  ] loop
    begin
      insert into storage.objects(bucket_id, name) values ('fleet-capacity-plans', denied_path);
      raise exception 'Admin uploaded an out-of-scope plan: %', denied_path;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- This setting is confined to the transaction and permits testing the DELETE
  -- policy on disposable metadata rows without invoking the Storage API.
  perform set_config('storage.allow_delete_query', 'true', true);
  foreach actor in array array['6ac32000-0000-4000-8000-000000000002'::uuid, '6ac32000-0000-4000-8000-000000000003'::uuid] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    assert (select capacity_sections from public.vessels where id = ship_id) = valid_sections,
      'Assigned Capitaine and Marin can read vessel capacities';
    assert exists (select 1 from storage.objects where bucket_id = 'fleet-capacity-plans' and name = plan_path),
      'Assigned Capitaine and Marin can read vessel plans';
    assert not exists (select 1 from storage.objects where bucket_id = 'fleet-capacity-plans' and name = foreign_path),
      'Onboard profiles cannot read another company plan';

    update public.vessels set capacity_sections = '[]' where id = ship_id;
    get diagnostics affected = row_count;
    assert affected = 0, 'Onboard profiles cannot edit capacities';
    begin
      insert into storage.objects(bucket_id, name)
        values ('fleet-capacity-plans', company || '/' || ship_id || '/c0401475-87e8-4997-9861-78d103f6411b.UGxhbi5wZGY');
      raise exception 'Onboard profile uploaded a plan';
    exception when insufficient_privilege then null;
    end;
    delete from storage.objects where bucket_id = 'fleet-capacity-plans' and name = plan_path;
    get diagnostics affected = row_count;
    assert affected = 0, 'Onboard profiles cannot remove plans';

    sounding := public.sea_operation_fuel_tanks(ship_id, reading_day, null);
    assert jsonb_array_length(sounding->'tanks') = 2, 'Both onboard roles see the current Soutes configuration';
    if actor = '6ac32000-0000-4000-8000-000000000002'::uuid then
      sounding := public.sea_operation_save_fuel_tanks(ship_id, reading_day, time '09:00', null,
        '[{"key":"main-1","unit":"liters","value":100}]'::jsonb || jsonb_build_array(water_input));
      assert (sounding #>> '{reading,mainLiters}')::numeric = 100
        and not (sounding #>> '{reading,updatesFuelBaseline}')::boolean,
        'An assigned Capitaine can record a partial sounding';
    else
      begin
        perform public.sea_operation_save_fuel_tanks(ship_id, reading_day, time '10:00', null,
          '[{"key":"main-1","unit":"liters","value":100}]'::jsonb || jsonb_build_array(water_input));
        raise exception 'Marin saved a sounding';
      exception when insufficient_privilege then null;
      end;
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', '6ac32000-0000-4000-8000-000000000001', true);
  update public.vessels set hidden_fuel_tank_keys = array['main-1', 'main-2', 'day'],
    capacity_sections = jsonb_set(valid_sections, '{0,name}', '"Eau technique"') where id = ship_id;
  sounding := public.sea_operation_save_fuel_tanks(ship_id, reading_day, time '11:00', null, jsonb_build_array(water_input));
  assert (sounding #>> '{reading,mainLiters}')::numeric = 0
    and not (sounding #>> '{reading,updatesFuelBaseline}')::boolean
    and sounding #>> '{reading,tanks,0,sectionName}' = 'Eau technique',
    'A custom-only sounding is recorded without contributing to fuel';
  select entry->'latestTankReading' into latest from jsonb_array_elements(public.sea_operation_fleet_fuel()) entry
    where (entry->>'vesselId')::bigint = ship_id;
  assert latest->>'time' = '11:00' and latest #>> '{tanks,0,sectionName}' = 'Eau technique'
    and not (latest->>'updatesFuelBaseline')::boolean,
    'The fleet snapshot includes the latest custom measurement and its group';
  update public.vessels set capacity_sections = '[]' where id = ship_id;
  sounding := public.sea_operation_fuel_tanks(ship_id, reading_day, time '11:00');
  assert sounding->'tanks' = '[]'::jsonb and sounding #>> '{reading,tanks,0,sectionName}' = 'Eau technique',
    'Turning off all tanks leaves the historical measurement intact';
  begin
    perform public.sea_operation_save_fuel_tanks(ship_id, reading_day, time '12:00', null, '[]');
    raise exception 'An empty sounding was accepted';
  exception when invalid_parameter_value then null;
  end;
  delete from storage.objects where bucket_id = 'fleet-capacity-plans' and name in (plan_path, foreign_path);
  get diagnostics affected = row_count;
  assert affected = 1, 'Admin can remove only the plan belonging to their company';
  assert exists (select 1 from storage.objects where bucket_id = 'fleet-capacity-plans' and name = second_plan_path),
    'Deleting one plan leaves the other plan in place';

  execute 'reset role';
  assert (select fuel_liters from sea_operation_private.fuel_baselines where vessel_id = ship_id) = 500,
    'Partial, custom-only and empty soundings leave the original fuel anchor intact';
  configuration := sea_operation_private.fuel_tank_configuration(vessel);
  assert configuration #>> '{0,name}' = 'Soute 1' and configuration #>> '{0,key}' = 'main-1'
    and configuration #>> '{1,name}' = 'Soute 2' and configuration #>> '{1,key}' = 'main-2'
    and configuration #>> '{0,calibration}' = 'landemer-v1' and configuration #>> '{2,name}' = 'Caisse service',
    'New labels feed Soutes while preserving measurement keys, calibration and the daily tank';
  assert exists (select 1 from storage.objects where bucket_id = 'fleet-capacity-plans' and name = foreign_path),
    'Cross-company plan remains present';

  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub', '', true);
  assert not exists (select 1 from storage.objects where bucket_id = 'fleet-capacity-plans' and name = second_plan_path),
    'Anonymous users cannot read plans';
  execute 'reset role';
end;
$test$;

rollback;
