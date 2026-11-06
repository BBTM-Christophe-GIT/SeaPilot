begin;
select no_plan();

select ok(not has_table_privilege('authenticated', 'sea_operation_private.consumption', 'SELECT,INSERT,UPDATE,DELETE'),
  'authenticated accounts can only access the annex through scoped RPCs');
select ok(not has_function_privilege('anon', 'public.sea_operation_consumption(uuid)', 'EXECUTE'), 'anonymous cannot read Conso');
select ok(not has_function_privilege('anon', 'public.sea_operation_consumption_export(uuid[])', 'EXECUTE'), 'anonymous cannot export Conso');
select ok(not has_function_privilege('anon', 'public.sea_operation_save_consumption(uuid,integer,jsonb)', 'EXECUTE'), 'anonymous cannot save Conso');
select ok(not has_table_privilege('anon', 'public.project_fuel_latest_vessel_prices', 'SELECT'), 'anonymous cannot read vessel prices');
select ok(not has_table_privilege('anon', 'public.project_fuel_latest_fallback_price', 'SELECT'), 'anonymous cannot read the fleet fallback');

insert into public.companies(code, name) values ('conso-other', 'Conso foreign company');
insert into auth.users(id, email)
select ('b9470000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'conso-' || n || '@example.invalid'
from generate_series(1, 6) n;
insert into public.profiles(id, email, display_name, active_company_id)
select actor.id, actor.email, 'Conso actor ' || right(actor.id::text, 1), company.id
from auth.users actor join public.companies company
  on company.code = case when right(actor.id::text, 1) = '6' then 'conso-other' else 'bbtm' end
where actor.id::text like 'b9470000-%';
insert into public.company_memberships(company_id, user_id, active)
select active_company_id, id, true from public.profiles where id::text like 'b9470000-%'
on conflict (company_id, user_id) do update set active = true;
insert into public.user_roles(user_id, company_id, role_key)
select id, active_company_id, (array['admin', 'direction', 'capitaine', 'capitaine', 'marin', 'admin'])[right(id::text, 1)::integer]
from public.profiles where id::text like 'b9470000-%';

insert into public.vessels(company_id, name, active, asset_kind)
select id, 'CONSO NO CALIBRATION', true, 'vessel' from public.companies where code = 'bbtm';
create temporary table conso_fixture(key text primary key, id uuid not null, vessel_id bigint, draft jsonb, response jsonb);
grant all on conso_fixture to authenticated;
insert into conso_fixture(key, id, vessel_id)
select fixture.key, gen_random_uuid(), vessel.id
from (values ('base', 'LE ROZEL'), ('overlap', 'LE ROZEL'), ('historic', 'LE ROZEL'), ('draft', 'LE ROZEL'),
  ('no_go', 'LE ROZEL'), ('native_cm', 'SUROIT'), ('missing_calibration', 'CONSO NO CALIBRATION')) fixture(key, vessel_name)
join public.vessels vessel on vessel.name = fixture.vessel_name
join public.companies company on company.id = vessel.company_id and company.code = 'bbtm';
update conso_fixture set draft = jsonb_build_object('version', 1, 'project', 'Conso test ' || key,
  'vessel', jsonb_build_object('id', vessel_id::text, 'departurePort', 'Cherbourg', 'arrivalPort', 'Le Havre'),
  'applicability', jsonb_build_object('towing', case when key = 'native_cm' then 'yes' else 'no' end), 'waypoints', '[]'::jsonb,
  'decision', case key when 'no_go' then 'NO_GO' when 'draft' then '' else 'GO' end,
  'signature', '{"acknowledged":true}'::jsonb);
insert into public.sea_operations(id, company_id, vessel_id, status, draft, created_by, created_by_name, updated_by, updated_by_name,
  signed_by, signed_by_name, signed_at, captain_name)
select fixture.id, vessel.company_id, vessel.id, case when key = 'draft' then 'draft' else 'signed' end, fixture.draft,
  'b9470000-0000-0000-0000-000000000003', 'Conso captain', 'b9470000-0000-0000-0000-000000000003', 'Conso captain',
  case when key <> 'draft' then 'b9470000-0000-0000-0000-000000000003'::uuid end,
  case when key <> 'draft' then 'Conso captain' end, case when key <> 'draft' then now() end,
  case when key <> 'draft' then 'Conso captain' end
from conso_fixture fixture join public.vessels vessel on vessel.id = fixture.vessel_id;
update conso_fixture fixture set draft = operation.draft from public.sea_operations operation where operation.id = fixture.id;
create function pg_temp.conso_id(p_key text) returns uuid language sql stable as $$select id from conso_fixture where key = p_key$$;
create function pg_temp.conso_input() returns jsonb language sql immutable as $$
  select '{"durationMinutes":120,"averageSpeedKnots":8,"gaugeUnit":"percent","departureGauge":78,"arrivalGauge":69,
    "refuelLiters":10000.05,"pricePerLiter":1.25,"actualArrival":"2026-11-06T03:00","completed":true}'::jsonb;
$$;
create function pg_temp.conso_actor(p_number integer) returns text language sql as $$
  select set_config('request.jwt.claim.sub', 'b9470000-0000-0000-0000-' || lpad(p_number::text, 12, '0'), true);
$$;

select is((select price_eur_per_liter_ht from public.project_fuel_latest_fallback_price
  where company_id = (select id from public.companies where code = 'bbtm')),
  1.254::numeric, 'the more recent historical workbook tariff supplies the fleet baseline');
select is((select recorded_at from public.project_fuel_latest_fallback_price
  where company_id = (select id from public.companies where code = 'bbtm')),
  timestamptz '2026-10-31 00:00 Europe/Paris', 'legacy prices use their effective date as the entry timestamp');

insert into public.project_fuel_price_observations(company_id, price_date, price_eur_per_liter_ht, source_label)
select id, (now() at time zone 'Europe/Paris')::date + 1, 9.99, 'Future fixture quote'
from public.companies where code = 'bbtm'
on conflict (company_id, price_date) do update set price_eur_per_liter_ht = excluded.price_eur_per_liter_ht;
insert into public.project_fuel_price_observations(company_id, price_date, price_eur_per_liter_ht, source_label)
select id, (now() at time zone 'Europe/Paris')::date, 9.99, 'Foreign fixture quote' from public.companies where code = 'conso-other';
insert into public.project_fuel_price_observations(company_id, price_date, price_eur_per_liter_ht, source_label)
select id, (now() at time zone 'Europe/Paris')::date, 1.70, 'Company fallback fixture quote'
from public.companies where code = 'bbtm'
on conflict (company_id, price_date) do update
set price_eur_per_liter_ht = excluded.price_eur_per_liter_ht, source_label = excluded.source_label;
insert into public.vessel_fuel_price_observations(company_id, vessel_id, price_date, price_eur_per_liter_ht, source_label)
select company_id, id, (now() at time zone 'Europe/Paris')::date + 1, 9.99, 'Future vessel fixture quote'
from public.vessels where id = (select vessel_id from conso_fixture where key = 'base');

set local role authenticated;
select pg_temp.conso_actor(3);
select is((public.sea_operation_consumption(pg_temp.conso_id('base'))->>'canEdit')::boolean, true, 'signing captain can enter completed GO consumption');
select is(public.sea_operation_consumption(pg_temp.conso_id('base'))#>>'{calibration,kind}', 'rozel', 'Le Rozel has its own gauge curve');
select ok((public.sea_operation_consumption(pg_temp.conso_id('draft'))#>>'{reference,transitLitersPerNm}')::numeric > 0, 'saved draft can read its own vessel forecast');
select is((public.sea_operation_consumption(pg_temp.conso_id('draft'))#>>'{reference,pricePerLiter}')::numeric,
  1.254::numeric, 'Le Rozel uses its workbook price and excludes future, company and foreign quotes');
select is(public.sea_operation_consumption(pg_temp.conso_id('draft'))#>>'{reference,priceDate}',
  '2026-10-31', 'Le Rozel workbook price retains the historical date');
select is((public.sea_operation_consumption(pg_temp.conso_id('native_cm'))#>>'{reference,pricePerLiter}')::numeric,
  1.115::numeric, 'Suroit uses its own historical workbook price');
select is(public.sea_operation_consumption(pg_temp.conso_id('native_cm'))#>>'{reference,priceDate}',
  '2026-09-22', 'Suroit workbook price retains the historical date');
select is((public.sea_operation_consumption(pg_temp.conso_id('missing_calibration'))#>>'{reference,pricePerLiter}')::numeric,
  1.70::numeric, 'a vessel without its own price falls back to the latest applicable quote in the company');
select throws_ok($$insert into public.vessel_fuel_price_observations(vessel_id, price_date, price_eur_per_liter_ht, source_label)
  select vessel_id, current_date, 9.99, 'Unauthorised fixture price' from conso_fixture where key = 'base'$$,
  '42501', null, 'a captain publishes prices only through the signed operation RPC');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('draft'), null, pg_temp.conso_input())$$, '42501', null, 'draft cannot accept a completed annex');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('no_go'), null, pg_temp.conso_input())$$, '42501', null, 'NO GO cannot accept a completed annex');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), null, pg_temp.conso_input() - 'completed')$$,
  '22023', null, 'explicit completed confirmation is required');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), null, pg_temp.conso_input() || '{"arrivalGauge":99}')$$,
  '22023', null, 'arrival gauge cannot exceed departure');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), null, pg_temp.conso_input() || '{"actualArrival":"2026-03-29T02:30"}')$$,
  '22023', null, 'nonexistent Paris wall time is rejected');
update conso_fixture set response = public.sea_operation_save_consumption(id, null, pg_temp.conso_input()) where key = 'base';
select is((response#>>'{record,distanceNm}')::numeric, 16::numeric, 'real distance derives from duration and average speed') from conso_fixture where key = 'base';
select is((response#>>'{record,consumedLiters}')::numeric, 1049.652::numeric, 'workbook curve subtracts arrival from post-refuel departure gauge') from conso_fixture where key = 'base';
select is((response#>>'{record,litersPerHour}')::numeric, 524.826::numeric, 'litres per hour use actual duration') from conso_fixture where key = 'base';
select is((response#>>'{record,litersPerNm}')::numeric, 65.603::numeric, 'litres per mile use actual distance') from conso_fixture where key = 'base';
select is((response#>>'{record,costEuros}')::numeric, 1312.07::numeric, 'estimated cost multiplies liters consumed by quoted price') from conso_fixture where key = 'base';
select is((response#>>'{reference,pricePerLiter}')::numeric, 1.25::numeric, 'new Conso price is immediately the current map price') from conso_fixture where key = 'base';
select is((public.sea_operation_consumption(pg_temp.conso_id('native_cm'))#>>'{reference,pricePerLiter}')::numeric,
  1.115::numeric, 'a Rozel Conso entry leaves the Suroit price unchanged');
select is((public.sea_operation_consumption(pg_temp.conso_id('missing_calibration'))#>>'{reference,pricePerLiter}')::numeric,
  1.25::numeric, 'the latest vessel price supplies the fleet fallback without copying it');
select is((response#>>'{record,includedInReference}')::boolean, true, 'valid new calibrated voyage augments the historical reference') from conso_fixture where key = 'base';
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), null, pg_temp.conso_input())$$,
  '40001', null, 'stale version cannot replace a concurrent edit');

update conso_fixture set response = public.sea_operation_save_consumption(id, null, pg_temp.conso_input() || '{"pricePerLiter":null}') where key = 'overlap';
select is((response#>>'{record,includedInReference}')::boolean, false, 'same vessel and overlapping actual period are counted only once') from conso_fixture where key = 'overlap';
update conso_fixture set response = public.sea_operation_save_consumption(id, null, pg_temp.conso_input() || '{"actualArrival":"2026-11-05T22:00","pricePerLiter":null}') where key = 'historic';
select is((response#>>'{record,includedInReference}')::boolean, false, 'voyages inside workbook coverage retain recap but do not duplicate seed') from conso_fixture where key = 'historic';

select pg_temp.conso_actor(4);
select is((public.sea_operation_consumption(pg_temp.conso_id('base'))->>'canEdit')::boolean, false, 'other captain cannot edit signed voyage consumption');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), 1, pg_temp.conso_input())$$, '42501', null, 'other captain write rejected');
select pg_temp.conso_actor(5);
select is((public.sea_operation_consumption(pg_temp.conso_id('base'))#>>'{record,version}')::integer, 1, 'real Marin can consult the voyage recap');
select is(public.sea_operation_consumption_export(array[
    pg_temp.conso_id('base'), pg_temp.conso_id('draft'), pg_temp.conso_id('base'),
    pg_temp.conso_id('no_go'), pg_temp.conso_id('native_cm')
  ]),
  jsonb_build_array(jsonb_build_object('operationId', pg_temp.conso_id('base'),
    'record', public.sea_operation_consumption(pg_temp.conso_id('base'))->'record')),
  'real Marin can export visible recorded readings without duplicates, drafts, NO GO, unrecorded passages or reference prices');
select throws_ok($$select public.sea_operation_consumption_export(array_fill(pg_temp.conso_id('base'), array[201]))$$,
  '22023', null, 'export batches are bounded');
select ok((public.sea_operation_consumption(pg_temp.conso_id('draft'))#>>'{reference,towageLitersPerNm}')::numeric > 0, 'real Marin gets limited forecast for the visible record');
select is((select count(*)::integer from public.project_fuel_latest_vessel_prices), 0, 'real Marin cannot list company-wide vessel prices');
select is((select count(*)::integer from public.project_fuel_latest_fallback_price), 0, 'real Marin cannot list the fleet fallback directly');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), 1, pg_temp.conso_input())$$, '42501', null, 'Marin cannot write recap');
select pg_temp.conso_actor(6);
select is((select count(*)::integer from public.project_fuel_latest_vessel_prices), 0, 'a foreign admin cannot list another company’s prices');
select is((select price_eur_per_liter_ht from public.project_fuel_latest_fallback_price), 9.99::numeric,
  'a foreign admin receives only their own company fallback');
select throws_ok($$select public.sea_operation_consumption(pg_temp.conso_id('base'))$$, '42501', null, 'foreign admin cannot read recap or forecast');
select is(public.sea_operation_consumption_export(array[pg_temp.conso_id('base')]), '[]'::jsonb,
  'foreign admin cannot export another company’s readings');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), 1, pg_temp.conso_input())$$, '42501', null, 'foreign admin cannot write recap or price');

select pg_temp.conso_actor(2);
insert into public.vessel_fuel_price_observations(vessel_id, price_date, price_eur_per_liter_ht, source_label)
select vessel_id, (now() at time zone 'Europe/Paris')::date, 1.80, 'Later vessel quote'
from conso_fixture where key = 'base'
on conflict (company_id, vessel_id, price_date) do update
set price_eur_per_liter_ht = excluded.price_eur_per_liter_ht, source_label = excluded.source_label;
select is((select price_eur_per_liter_ht from public.project_fuel_latest_vessel_prices
  where vessel_id = (select vessel_id from conso_fixture where key = 'base')),
  1.80::numeric, 'Direction can read the latest applicable price per vessel after saving it');
insert into public.project_fuel_price_observations(price_date, price_eur_per_liter_ht, source_label, recorded_at)
values ((now() at time zone 'Europe/Paris')::date - 1, 1.95, 'Just entered, dated yesterday', '2000-01-01T00:00:00Z')
on conflict (company_id, price_date) do update
set price_eur_per_liter_ht = excluded.price_eur_per_liter_ht, source_label = excluded.source_label;
select is((select price_eur_per_liter_ht from public.project_fuel_latest_fallback_price), 1.95::numeric,
  'fallback chooses the last entry even when its effective date is earlier');
select ok((select recorded_at from public.project_fuel_latest_fallback_price) > now() - interval '1 minute',
  'the server supplies the entry timestamp even if the client submits one');
update public.project_fuel_price_observations set price_eur_per_liter_ht = 9.999
where price_date = (now() at time zone 'Europe/Paris')::date + 1;
select is((select price_eur_per_liter_ht from public.project_fuel_latest_fallback_price), 1.95::numeric,
  'a future price stays out of the fallback even after being entered last');
select is((public.sea_operation_consumption(pg_temp.conso_id('base'))#>>'{reference,pricePerLiter}')::numeric,
  1.80::numeric, 'a vessel specific price stays ahead of the fleet fallback');
select is((select count(*)::integer from public.vessel_fuel_price_observations
  where vessel_id = (select vessel_id from conso_fixture where key = 'missing_calibration')), 0,
  'the fleet fallback never creates an observation for an unpriced vessel');
update conso_fixture set response = public.sea_operation_save_consumption(id, 1, pg_temp.conso_input() || '{"durationMinutes":90}') where key = 'base';
select is((response#>>'{reference,pricePerLiter}')::numeric, 1.80::numeric, 'duration-only correction does not overwrite a later quote') from conso_fixture where key = 'base';
select is((response#>>'{record,version}')::integer, 2, 'authorized correction advances annex version') from conso_fixture where key = 'base';
update conso_fixture set response = public.sea_operation_save_consumption(id, null,
  pg_temp.conso_input() || '{"gaugeUnit":"cm","departureGauge":208,"arrivalGauge":109,"pricePerLiter":null}') where key = 'native_cm';
select is((response#>>'{record,consumedLiters}')::numeric, 3395.7::numeric, 'Suroit native sounding uses 34.3 L per centimetre') from conso_fixture where key = 'native_cm';
update conso_fixture set response = public.sea_operation_save_consumption(id, null,
  pg_temp.conso_input() || '{"pricePerLiter":null}') where key = 'missing_calibration';
select is(response#>'{record,consumedLiters}', 'null'::jsonb, 'unsupported vessel without capacity retains readings without fabricating litres') from conso_fixture where key = 'missing_calibration';

reset role;
select is((select draft from public.sea_operations where id = pg_temp.conso_id('base')), (select draft from conso_fixture where key = 'base'),
  'saving and correcting Conso preserves the signed JSON');
select is((select count(*)::integer from public.vessel_fuel_reference_samples where source_key = 'sea-operation:' || pg_temp.conso_id('base')::text),
  1, 'correcting a contribution replaces the original batch');
select is((select distance_nm from public.vessel_fuel_reference_samples where source_key = 'sea-operation:' || pg_temp.conso_id('base')::text),
  12::numeric, 'corrected distance replaces the old contribution');
set local role authenticated;
select pg_temp.conso_actor(3);
update conso_fixture set response = public.sea_operation_save_consumption(id, 2, pg_temp.conso_input() || '{"averageSpeedKnots":0,"pricePerLiter":null}') where key = 'base';
select is((response#>>'{record,distanceNm}')::numeric, 0::numeric, 'stationary operation can retain fuel measurements') from conso_fixture where key = 'base';
select is(response#>'{record,litersPerNm}', 'null'::jsonb, 'stationary readings have no litres-per-mile rate') from conso_fixture where key = 'base';
select ok((response#>>'{record,litersPerHour}')::numeric > 0, 'stationary readings retain litres per hour') from conso_fixture where key = 'base';
select is((response#>>'{reference,pricePerLiter}')::numeric, 1.80::numeric, 'clearing the trip price does not remove the last entered quote') from conso_fixture where key = 'base';
update conso_fixture set response = public.sea_operation_save_consumption(id, 3, pg_temp.conso_input() || '{"departureGauge":0.7,"arrivalGauge":0.2,"pricePerLiter":1.47}') where key = 'base';
select is(response#>'{record,consumedLiters}', 'null'::jsonb, 'the inverse tail of the Rozel curve cannot yield negative consumption') from conso_fixture where key = 'base';
select is((response#>>'{reference,pricePerLiter}')::numeric, 1.47::numeric, 'explicitly changed trip price becomes the latest quote') from conso_fixture where key = 'base';
reset role;
select is((select count(*)::integer from public.vessel_fuel_reference_samples where source_key = 'sea-operation:' || pg_temp.conso_id('base')::text),
  0, 'correction to a stationary operation removes the old voyage reference');

insert into conso_fixture(key, id, vessel_id, draft)
select 'revision', gen_random_uuid(), vessel_id, draft from conso_fixture where key = 'native_cm';
insert into public.sea_operations(id, company_id, vessel_id, status, draft, created_by, created_by_name, updated_by, updated_by_name,
  signed_by, signed_by_name, signed_at, captain_name)
select pg_temp.conso_id('revision'), company_id, vessel_id, status, draft, created_by, created_by_name, updated_by, updated_by_name,
  signed_by, signed_by_name, signed_at, captain_name from public.sea_operations where id = pg_temp.conso_id('native_cm');
insert into sea_operation_private.record_administration(operation_id, superseded_by_id, revised_at, revised_by, revised_by_name)
values (pg_temp.conso_id('native_cm'), pg_temp.conso_id('revision'), now(), 'b9470000-0000-0000-0000-000000000001', 'Conso admin');

set local role authenticated;
select pg_temp.conso_actor(3);
select is((public.sea_operation_consumption(pg_temp.conso_id('native_cm'))->>'canEdit')::boolean, false, 'superseded signed version is read-only');
select is((public.sea_operation_consumption(pg_temp.conso_id('revision'))#>>'{record,version}')::integer, 1, 'a revised plan retains its measured passage');
select is(public.sea_operation_consumption_export(array[pg_temp.conso_id('native_cm'), pg_temp.conso_id('revision')]),
  jsonb_build_array(jsonb_build_object('operationId', pg_temp.conso_id('revision'),
    'record', public.sea_operation_consumption(pg_temp.conso_id('revision'))->'record')),
  'export includes the active signed revision and excludes the superseded plan');
update conso_fixture set response = public.sea_operation_save_consumption(id, 1,
  pg_temp.conso_input() || '{"gaugeUnit":"cm","departureGauge":208,"arrivalGauge":110,"pricePerLiter":null}') where key = 'revision';
select is((response#>>'{record,version}')::integer, 2, 'revised plan updates the same annex') from conso_fixture where key = 'revision';
reset role;
select is((select count(*)::integer from public.vessel_fuel_reference_samples
  where source_key in ('sea-operation:' || pg_temp.conso_id('native_cm')::text, 'sea-operation:' || pg_temp.conso_id('revision')::text)),
  1, 'a revision cannot double-count the voyage');
set local role authenticated;
select pg_temp.conso_actor(1);
select lives_ok($$select public.sea_operation_delete(pg_temp.conso_id('revision'), 1)$$, 'admin can remove the current operation');
select throws_ok($$select public.sea_operation_consumption(pg_temp.conso_id('revision'))$$, '42501', null, 'removed record cannot expose its annex');
select is(public.sea_operation_consumption_export(array[pg_temp.conso_id('revision')]), '[]'::jsonb,
  'export excludes a removed operation');
reset role;
select is((select count(*)::integer from public.vessel_fuel_reference_samples where source_key = 'sea-operation:' || pg_temp.conso_id('native_cm')::text),
  0, 'removing the logical operation withdraws the fuel sample');

create function pg_temp.conso_trace() returns jsonb language sql immutable as $$
  select '{"startedAt":"2026-11-06T00:00:00.000Z","endedAt":"2026-11-06T02:00:00.000Z",
    "durationMinutes":120,"distanceNm":18.2499,"averageSpeedKnots":9.125,"pointCount":3,"segmentCount":1,
    "gapCount":0,"reorderedPointCount":0,"excludedPointCount":0,"profile":[
      {"elapsedMinutes":0,"speedKnots":null},{"elapsedMinutes":60,"speedKnots":9.125},
      {"elapsedMinutes":120,"speedKnots":9.125}]}'::jsonb;
$$;
create function pg_temp.conso_gps_input() returns jsonb language sql immutable as $$
  select pg_temp.conso_input() || jsonb_build_object('trace', pg_temp.conso_trace(), 'averageSpeedKnots', 9.125, 'pricePerLiter', 1.47);
$$;

set local role authenticated;
select pg_temp.conso_actor(4);
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), 4, pg_temp.conso_gps_input())$$,
  '42501', null, 'another Capitaine cannot attach a GPS trace');
select pg_temp.conso_actor(3);
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), 4, pg_temp.conso_gps_input() || '{"durationMinutes":119}')$$,
  '22023', null, 'confirmed duration must match the attached trace');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), 4,
  jsonb_set(pg_temp.conso_gps_input(), '{trace,distanceNm}', '99'))$$, '22023', null, 'trace distance must agree with average speed and elapsed time');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), 4,
  jsonb_set(pg_temp.conso_gps_input(), '{trace,profile,1,elapsedMinutes}', '121'))$$,
  '22023', null, 'speed series must follow the trace chronology');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), 4,
  jsonb_set(pg_temp.conso_gps_input(), '{trace,profile}',
    (select jsonb_agg('{"elapsedMinutes":0,"speedKnots":null}'::jsonb) from generate_series(1, 241))))$$,
  '22023', null, 'speed series payload is bounded');
select lives_ok($$update conso_fixture set response = public.sea_operation_save_consumption(id, 4, pg_temp.conso_gps_input()) where key = 'base'$$,
  'the signing Capitaine can confirm the GPS trace with the readings');
select is((response#>>'{record,distanceNm}')::numeric, 18.2499::numeric, 'GPS distance takes priority over duration times speed') from conso_fixture where key = 'base';
select is((response#>>'{record,litersPerNm}')::numeric, 57.516::numeric, 'litres per mile use the GPS distance') from conso_fixture where key = 'base';
select is(response#>'{record,trace}', pg_temp.conso_trace(), 'GPS summary and bounded profile return with the saved record') from conso_fixture where key = 'base';
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), 4, pg_temp.conso_gps_input())$$,
  '40001', null, 'a stale client cannot replace the saved trace');

select pg_temp.conso_actor(5);
select is(public.sea_operation_consumption(pg_temp.conso_id('base'))#>'{record,trace}', pg_temp.conso_trace(), 'real Marin can read the GPS profile');
select is(public.sea_operation_consumption_export(array[pg_temp.conso_id('base')])#>'{0,record,trace}', pg_temp.conso_trace() - 'profile',
  'Excel export includes the authorized GPS summary with a bounded batch payload');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), 5, pg_temp.conso_gps_input())$$,
  '42501', null, 'real Marin cannot change the GPS trace');
select pg_temp.conso_actor(6);
select is(public.sea_operation_consumption_export(array[pg_temp.conso_id('base')]), '[]'::jsonb,
  'foreign admin cannot export the GPS summary');
reset role;
select is((select distance_nm from public.vessel_fuel_reference_samples where source_key = 'sea-operation:' || pg_temp.conso_id('base')::text),
  18.25::numeric, 'calibrated reference sample uses the measured distance at sample precision');

set local role authenticated;
select pg_temp.conso_actor(3);
select lives_ok($$update conso_fixture set response = public.sea_operation_save_consumption(id, 5, pg_temp.conso_gps_input() - 'trace') where key = 'base'$$,
  'an older client can update a reading without sending the trace field');
select is(response#>'{record,trace}', pg_temp.conso_trace(), 'omitting the trace retains it when the GPS-derived inputs agree') from conso_fixture where key = 'base';
select lives_ok($$update conso_fixture set response = public.sea_operation_save_consumption(id, 6, pg_temp.conso_input()) where key = 'base'$$,
  'an older client can replace the navigation values manually');
select is(response#>>'{record,trace}', null::text, 'manual corrections invalidate the older trace') from conso_fixture where key = 'base';
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('base'), 7, pg_temp.conso_gps_input())$$,
  'GPS can be reattached after a manual correction');
select lives_ok($$update conso_fixture set response = public.sea_operation_save_consumption(id, 8,
  pg_temp.conso_gps_input() || '{"trace":null}') where key = 'base'$$, 'signing Capitaine can explicitly remove the GPS trace');
select is(response#>>'{record,trace}', null::text, 'explicit removal clears the GPS provenance') from conso_fixture where key = 'base';
select is((response#>>'{record,distanceNm}')::numeric, 18.25::numeric, 'distance falls back to duration times speed after removal') from conso_fixture where key = 'base';
reset role;
select * from finish();
rollback;
