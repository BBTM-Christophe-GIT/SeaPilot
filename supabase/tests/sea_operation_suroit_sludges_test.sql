begin;

do $test$
declare
  company bigint;
  suroit bigint;
  other_vessel bigint;
  admin_id constant uuid := '96ba6854-f900-4efb-ad5d-c40ebd4546ee';
  measurement_day date := (statement_timestamp() at time zone 'Europe/Paris')::date - 1;
  sludge_key constant text := 'capacity-4a41e151-aa98-4d44-b026-b84514fb6d60';
  sections constant jsonb := '[{"name":"Sludges - Eau huileuse","tanks":[
    {"id":"4a41e151-aa98-4d44-b026-b84514fb6d60","name":"Tank 2","capacityLiters":27740,"showInSoutes":true}
  ]}]';
  readings jsonb := '[{"key":"main-1","unit":"liters","value":4000}]';
  fleet jsonb;
  result jsonb;
begin
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.vessels(company_id, name, registration_number, mmsi, active, capacity_sections)
    values (company, 'SQL SUROIT', '926637', '227779340', true, sections) returning id into suroit;
  insert into public.vessels(company_id, name, active, capacity_sections)
    values (company, 'SQL other vessel', true, sections) returning id into other_vessel;
  insert into auth.users(id, email) values (admin_id, 'sea-operation-sludges@example.invalid');
  insert into public.profiles(id, email, display_name, active_company_id)
    values (admin_id, 'sea-operation-sludges@example.invalid', 'Sludges test', company);
  insert into public.company_memberships(company_id, user_id, active) values (company, admin_id, true)
    on conflict (company_id, user_id) do update set active = true;
  insert into public.user_roles(user_id, company_id, role_key) values (admin_id, company, 'admin');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  fleet := public.sea_operation_fleet_fuel();
  select entry into strict result from jsonb_array_elements(fleet) entry where (entry->>'vesselId')::bigint = suroit;
  assert result->'sludgeTank' = '{"capacityLiters":27740,"liters":null}', 'SUROIT shows configured capacity before its first sounding';
  select entry into strict result from jsonb_array_elements(fleet) entry where (entry->>'vesselId')::bigint = other_vessel;
  assert not result ? 'sludgeTank', 'No sludge meter is exposed for other vessels';

  perform public.sea_operation_save_fuel_tanks(suroit, measurement_day, time '08:00', null,
    readings || jsonb_build_array(jsonb_build_object('key', sludge_key, 'unit', 'percent', 'value', 75)));
  -- A newer fuel-only sounding does not replace the measured sludge level.
  update public.vessels set capacity_sections = jsonb_set(sections, '{0,tanks,0,showInSoutes}', 'false') where id = suroit;
  perform public.sea_operation_save_fuel_tanks(suroit, measurement_day, time '10:00', null, readings);
  select entry into strict result from jsonb_array_elements(public.sea_operation_fleet_fuel()) entry
    where (entry->>'vesselId')::bigint = suroit;
  assert result->'sludgeTank' = '{"capacityLiters":27740,"liters":20805}', 'The last matching tank sounding supplies the sludge volume';
  assert result #>> '{latestTankReading,time}' = '10:00' and (result->>'fuelLiters')::numeric = 4000,
    'Sludge volumes stay out of the fuel stock and the newest sounding remains visible';
  update public.vessels set capacity_sections = jsonb_set(sections, '{0,tanks,0,name}', '"Cuve 2"') where id = suroit;
  select entry->'sludgeTank' into strict result from jsonb_array_elements(public.sea_operation_fleet_fuel()) entry
    where (entry->>'vesselId')::bigint = suroit;
  assert (result->>'liters')::numeric = 20805, 'Renaming the tank does not replace its stable measurement identity';

  execute 'reset role';
end;
$test$;

rollback;
