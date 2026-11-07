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
select is(public.sea_operation_register_consumption(array[pg_temp.conso_id('native_cm'), pg_temp.conso_id('revision')], false)->'recordedOperationIds',
  jsonb_build_array(pg_temp.conso_id('revision')), 'register status follows the current signed revision and its matching annex');
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

select ok(not has_function_privilege('anon', 'public.sea_operation_register_consumption(uuid[],boolean)', 'EXECUTE'),
  'anonymous cannot consult register consumption');
insert into public.vessel_fuel_reference_samples(company_id, vessel_id, towing, source_key, source_label, voyage_count, distance_nm, fuel_liters)
select vessel.company_id, vessel.id, sample.towing, sample.source_key, 'Register average fixture', 1, sample.distance_nm, sample.fuel_liters
from public.vessels vessel
cross join (values (false, 'register-other-one', 10, 40), (false, 'register-other-two', 30, 60), (true, 'register-towage', 10, 55))
  sample(towing, source_key, distance_nm, fuel_liters)
where vessel.id = (select vessel_id from conso_fixture where key = 'missing_calibration');

set local role authenticated;
select pg_temp.conso_actor(3);
select is(public.sea_operation_register_consumption(array[pg_temp.conso_id('base'), pg_temp.conso_id('base'), pg_temp.conso_id('draft'),
    pg_temp.conso_id('no_go'), pg_temp.conso_id('native_cm'), pg_temp.conso_id('revision')], false),
  jsonb_build_object('recordedOperationIds', jsonb_build_array(pg_temp.conso_id('base')), 'vesselAverages', '[]'::jsonb),
  'a real Capitaine sees status for current signed GO readings, without duplicates, drafts, NO GO, removed or superseded plans');
select throws_ok($$select public.sea_operation_register_consumption(array_fill(pg_temp.conso_id('base'), array[201]), true)$$,
  '22023', null, 'the register status batch is bounded');
select pg_temp.conso_actor(5);
select is(public.sea_operation_register_consumption(array[pg_temp.conso_id('base')], false)->'recordedOperationIds',
  jsonb_build_array(pg_temp.conso_id('base')), 'a real Marin sees recorded consumption status');
select is((average->>'otherLitersPerNm')::numeric, 2.5::numeric, 'other passages average total litres per total distance')
from jsonb_array_elements(public.sea_operation_register_consumption('{}', true)->'vesselAverages') average
where (average->>'vesselId')::bigint = (select vessel_id from conso_fixture where key = 'missing_calibration');
select is((average->>'towageLitersPerNm')::numeric, 5.5::numeric, 'a real Marin sees the separate towage average')
from jsonb_array_elements(public.sea_operation_register_consumption('{}', true)->'vesselAverages') average
where (average->>'vesselId')::bigint = (select vessel_id from conso_fixture where key = 'missing_calibration');
select is((select count(*)::integer from public.vessel_fuel_reference_samples), 0, 'register averages do not grant a real Marin access to source samples');
select pg_temp.conso_actor(6);
select is(public.sea_operation_register_consumption(array[pg_temp.conso_id('base')], true),
  '{"recordedOperationIds":[],"vesselAverages":[]}'::jsonb, 'foreign admins receive only their own company statuses and fleet');
reset role;

update public.vessels set fuel_capacity_m3 = 10 where id = (
  select vessel.id from public.vessels vessel join public.companies company on company.id = vessel.company_id
  where company.code = 'bbtm' and vessel.name = 'GOURY' and vessel.asset_kind = 'vessel' and vessel.active
  order by vessel.id limit 1
);
insert into conso_fixture(key, id, vessel_id, draft)
select voyage.key, gen_random_uuid(), vessel.id, base.draft || jsonb_build_object(
    'project', 'Live GOURY ' || voyage.key,
    'vessel', jsonb_set(base.draft->'vessel', '{id}', to_jsonb(vessel.id::text)),
    'applicability', jsonb_build_object('towing', voyage.towing))
from conso_fixture base
cross join (values ('goury_other', 'no'), ('goury_towage', 'yes'), ('goury_unknown', ''), ('goury_overlap', 'no')) voyage(key, towing)
join lateral (
  select vessel.id from public.vessels vessel join public.companies company on company.id = vessel.company_id
  where company.code = 'bbtm' and vessel.name = 'GOURY' and vessel.asset_kind = 'vessel' and vessel.active
  order by vessel.id limit 1
) vessel on true
where base.key = 'base';
insert into public.sea_operations(id, company_id, vessel_id, status, draft, created_by, created_by_name, updated_by, updated_by_name,
  signed_by, signed_by_name, signed_at, captain_name)
select fixture.id, base.company_id, fixture.vessel_id, base.status, fixture.draft, base.created_by, base.created_by_name,
  base.updated_by, base.updated_by_name, base.signed_by, base.signed_by_name, base.signed_at, base.captain_name
from conso_fixture fixture cross join public.sea_operations base
where base.id = pg_temp.conso_id('base') and fixture.key in ('goury_other', 'goury_towage', 'goury_unknown', 'goury_overlap');

set local role authenticated;
select pg_temp.conso_actor(3);
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('goury_other'), null,
  pg_temp.conso_input() || '{"departureGauge":80,"arrivalGauge":70,"pricePerLiter":null,"actualArrival":"2026-11-06T04:00"}')$$,
  'a real Capitaine can confirm a nominally calibrated GOURY passage');
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('goury_towage'), null,
  pg_temp.conso_input() || '{"departureGauge":70,"arrivalGauge":70,"pricePerLiter":null,"actualArrival":"2026-11-06T06:00"}')$$,
  'a calibrated towage reading can confirm zero fuel on a positive passage distance');
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('goury_unknown'), null,
  pg_temp.conso_input() || '{"departureGauge":80,"arrivalGauge":50,"pricePerLiter":null,"actualArrival":"2026-11-06T08:00"}')$$,
  'a reading with unspecified towage can be recorded');
select pg_temp.conso_actor(5);
select is((rate->>'otherLitersPerNm')::numeric, 62.5::numeric, 'a real Marin sees the actual GOURY rate for classified passages')
from jsonb_array_elements(public.sea_operation_register_consumption('{}', true)->'vesselAverages') rate
where (rate->>'vesselId')::bigint = (select vessel_id from conso_fixture where key = 'goury_other');
select is((rate->>'towageLitersPerNm')::numeric, 0::numeric, 'a calibrated zero-fuel towage rate is distinct from a missing rate')
from jsonb_array_elements(public.sea_operation_register_consumption('{}', true)->'vesselAverages') rate
where (rate->>'vesselId')::bigint = (select vessel_id from conso_fixture where key = 'goury_towage');
select pg_temp.conso_actor(6);
select is(public.sea_operation_register_consumption(array[pg_temp.conso_id('goury_other')], true),
  '{"recordedOperationIds":[],"vesselAverages":[]}'::jsonb, 'foreign admins cannot obtain the live GOURY rate or status');
select pg_temp.conso_actor(3);
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('goury_overlap'), null,
  pg_temp.conso_input() || '{"departureGauge":90,"arrivalGauge":70,"pricePerLiter":null,"actualArrival":"2026-11-06T03:30"}')$$,
  'a second Conso record can describe an overlapping voyage');
select is((rate->>'otherLitersPerNm')::numeric, 125::numeric, 'only the last confirmed overlapping voyage contributes to the live rate')
from jsonb_array_elements(public.sea_operation_register_consumption('{}', true)->'vesselAverages') rate
where (rate->>'vesselId')::bigint = (select vessel_id from conso_fixture where key = 'goury_other');
reset role;

insert into public.vessel_fuel_reference_samples(company_id, vessel_id, towing, source_key, source_label, voyage_count, distance_nm, fuel_liters)
select operation.company_id, operation.vessel_id, false, 'sea-operation:' || operation.id::text, 'Register duplicate fixture', 1, 16, 800
from public.sea_operations operation where operation.id = pg_temp.conso_id('goury_other');
set local role authenticated;
select pg_temp.conso_actor(5);
select is((rate->>'otherLitersPerNm')::numeric, 50::numeric, 'a reference takes precedence over the original and overlapping live readings')
from jsonb_array_elements(public.sea_operation_register_consumption('{}', true)->'vesselAverages') rate
where (rate->>'vesselId')::bigint = (select vessel_id from conso_fixture where key = 'goury_other');
reset role;

insert into public.vessel_fuel_price_observations(company_id, vessel_id, price_date, price_eur_per_liter_ht, source_label)
select company_id, vessel_id, (now() at time zone 'Europe/Paris')::date, 1.56, 'Register vessel price fixture'
from public.sea_operations where id = pg_temp.conso_id('base')
on conflict (company_id, vessel_id, price_date) do update set price_eur_per_liter_ht = excluded.price_eur_per_liter_ht;
insert into public.project_fuel_price_observations(company_id, price_date, price_eur_per_liter_ht, source_label)
select company_id, (now() at time zone 'Europe/Paris')::date, 1.75, 'Register fallback price fixture'
from public.sea_operations where id = pg_temp.conso_id('base')
on conflict (company_id, price_date) do update set price_eur_per_liter_ht = excluded.price_eur_per_liter_ht;
insert into public.vessel_fuel_price_observations(company_id, vessel_id, price_date, price_eur_per_liter_ht, source_label)
select company_id, vessel_id, (now() at time zone 'Europe/Paris')::date + 1, 9.99, 'Future GOURY price fixture'
from public.sea_operations where id = pg_temp.conso_id('goury_other');

set local role authenticated;
select pg_temp.conso_actor(3);
select is((rate->>'pricePerLiter')::numeric, 1.56::numeric, 'a real Capitaine sees the vessel tariff ahead of a newer fleet price')
from jsonb_array_elements(public.sea_operation_register_consumption('{}', true)->'vesselAverages') rate
where (rate->>'vesselId')::bigint = (select vessel_id from conso_fixture where key = 'base');
select pg_temp.conso_actor(5);
select is((rate->>'pricePerLiter')::numeric, 1.75::numeric, 'a real Marin sees the fleet fallback and excludes the future vessel tariff')
from jsonb_array_elements(public.sea_operation_register_consumption('{}', true)->'vesselAverages') rate
where (rate->>'vesselId')::bigint = (select vessel_id from conso_fixture where key = 'goury_other');
select is((select count(*)::integer from public.vessel_fuel_price_observations), 0, 'scoped chart prices do not grant Marin access to tariff records');
select pg_temp.conso_actor(6);
select is(public.sea_operation_register_consumption('{}', true)->'vesselAverages', '[]'::jsonb, 'foreign admins cannot access fleet chart prices');
reset role;

with calendar as (
  select (now() at time zone 'Europe/Paris')::date as today,
    date_trunc('month', now() at time zone 'Europe/Paris')::date - 1 as previous_day
)
insert into sea_operation_private.consumption_history(company_id, data)
select company.id, jsonb_build_object('rozel', '[]'::jsonb, 'rozelGauge', '[]'::jsonb, 'suroit', jsonb_build_array(
  jsonb_build_object('sourceRow', 8, 'cells', jsonb_build_array('Cherbourg', 'Le Havre', 20,
    today - date '1899-12-30', today - date '1899-12-30' + 0.1, 'NON', null, null, 90, 80, null, null, 200, null, null, 400)),
  jsonb_build_object('sourceRow', 9, 'cells', jsonb_build_array('Cherbourg', 'Le Havre', 30,
    previous_day - date '1899-12-30', previous_day - date '1899-12-30' + 0.1, 'NON', null, null, 90, 80, null, null, 450, null, null, null)),
  jsonb_build_object('sourceRow', 10, 'cells', jsonb_build_array('Le Havre', 'Cherbourg', 30,
    today - date '1899-12-30' + 0.2, today - date '1899-12-30' + 0.3, 'NON', null, null, 90, 80, null, null, 100, null, null, null))
)) from public.companies company cross join calendar where company.code = 'bbtm';

set local role authenticated;
select pg_temp.conso_actor(3);
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('goury_other'), 1,
  pg_temp.conso_input() || jsonb_build_object('departureGauge', 80, 'arrivalGauge', 70, 'pricePerLiter', 2,
    'actualArrival', to_char((now() at time zone 'Europe/Paris')::date, 'YYYY-MM-DD"T00:00"')))$$,
  'a real Capitaine can save the current month passage at a known price');
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('goury_overlap'), 1,
  pg_temp.conso_input() || jsonb_build_object('departureGauge', 90, 'arrivalGauge', 70, 'pricePerLiter', null,
    'actualArrival', to_char(date_trunc('month', now() at time zone 'Europe/Paris') - interval '12 hours', 'YYYY-MM-DD"T"HH24:MI')))$$,
  'a previous month passage can be confirmed without a saved price');
select pg_temp.conso_actor(5);
select is(rate->'monthly'->'other', '{"current":{"litersPerNm":62.5,"costPerNm":125},"previous":{"litersPerNm":125,"costPerNm":null}}'::jsonb,
  'a real Marin sees monthly live readings with the saved cost only where available')
from jsonb_array_elements(public.sea_operation_register_consumption('{}', true)->'vesselAverages') rate
where (rate->>'vesselId')::bigint = (select vessel_id from conso_fixture where key = 'goury_other');
select is(rate->'monthly'->'other', '{"current":{"litersPerNm":6,"costPerNm":20},"previous":{"litersPerNm":15,"costPerNm":null}}'::jsonb,
  'monthly Suroît rates are weighted and cost uses only the distance with a stored cost')
from jsonb_array_elements(public.sea_operation_register_consumption('{}', true)->'vesselAverages') rate
where (rate->>'vesselId')::bigint = (select vessel_id from conso_fixture where key = 'native_cm');
select is(rate->'monthly'->'towage', '{"current":{"litersPerNm":null,"costPerNm":null},"previous":{"litersPerNm":null,"costPerNm":null}}'::jsonb,
  'a month and regime without measurements remains unavailable')
from jsonb_array_elements(public.sea_operation_register_consumption('{}', true)->'vesselAverages') rate
where (rate->>'vesselId')::bigint = (select vessel_id from conso_fixture where key = 'native_cm');
select pg_temp.conso_actor(6);
select is(public.sea_operation_register_consumption('{}', true)->'vesselAverages', '[]'::jsonb,
  'foreign admins cannot access monthly consumption trends');
reset role;

select ok(not has_function_privilege('anon', 'public.sea_operation_fleet_fuel()', 'EXECUTE'), 'anonymous cannot see fuel stock');
select ok(not has_table_privilege('authenticated', 'sea_operation_private.fuel_baselines', 'SELECT,INSERT,UPDATE,DELETE'),
  'fuel baselines are accessible only via scoped RPCs');
create function pg_temp.fuel_vessel(p_key text) returns bigint language sql stable as $$
  select vessel_id from conso_fixture where key = p_key;
$$;
create function pg_temp.fuel_row(p_key text) returns jsonb language sql stable as $$
  select row_data from jsonb_array_elements(public.sea_operation_fleet_fuel()) row_data
  where (row_data->>'vesselId')::bigint = pg_temp.fuel_vessel(p_key);
$$;

update public.vessels set fuel_tank_capacities_liters = array[6000,5000]::numeric[], daily_fuel_tank_capacity_liters = 300,
  max_speed_knots = 12 where id = pg_temp.fuel_vessel('goury_other');
select is((select fuel_capacity_m3 from public.vessels where id = pg_temp.fuel_vessel('goury_other')), 10::numeric,
  'detailed configuration preserves the legacy fuel capacity');
select throws_ok($$update public.vessels set fuel_tank_capacities_liters = array[1000,-10] where id = pg_temp.fuel_vessel('goury_other')$$,
  '23514', null, 'invalid main tank configuration is rejected');

with created as (
  insert into public.vessels(company_id, name, active, asset_kind)
  select id, 'CONSO STOCK OFFICE ONLY', true, 'vessel' from public.companies where code = 'bbtm' returning id
)
insert into conso_fixture(key, id, vessel_id) select 'fuel_office_only', gen_random_uuid(), id from created;

select pg_temp.conso_actor(1);
insert into public.people(company_id, user_id, first_name, last_name, function_label, grade_label, active)
select active_company_id, id, 'Conso', 'Capitaine affecté', 'Capitaine', 'Capitaine 200', true
from public.profiles where id = 'b9470000-0000-0000-0000-000000000003';
insert into public.planning_assignments(company_id, vessel_id, crew_person_id, captain_person_id, starts_on, ends_on, assignment_role, confirmation_status)
select company_id, pg_temp.fuel_vessel('goury_other'), id, id, (now() at time zone 'Europe/Paris')::date,
  (now() at time zone 'Europe/Paris')::date + 1, 'Capitaine', 'confirmed'
from public.people where user_id = 'b9470000-0000-0000-0000-000000000003';

insert into conso_fixture(key, id, vessel_id, draft)
select voyage.key, gen_random_uuid(), base.vessel_id, base.draft || jsonb_build_object('project', 'Fuel stock ' || voyage.key,
  'transit', jsonb_build_object('date', (now() at time zone 'Europe/Paris')::date - voyage.days_ago,
    'captainPersonId', person.id::text))
from conso_fixture base cross join (values ('fuel_same_day',0), ('fuel_backfill',1), ('fuel_transit_1',5),
  ('fuel_transit_2',4), ('fuel_outside_speed',3)) voyage(key, days_ago)
cross join public.people person
where base.key = 'goury_other' and person.user_id = 'b9470000-0000-0000-0000-000000000003';
insert into public.sea_operations(id, company_id, vessel_id, status, draft, created_by, created_by_name, updated_by, updated_by_name,
  signed_by, signed_by_name, signed_at, captain_name)
select fixture.id, base.company_id, fixture.vessel_id, base.status, fixture.draft, base.created_by, base.created_by_name,
  base.updated_by, base.updated_by_name, base.signed_by, base.signed_by_name, base.signed_at, base.captain_name
from conso_fixture fixture cross join public.sea_operations base
where base.id = pg_temp.conso_id('goury_other') and fixture.key in ('fuel_same_day', 'fuel_backfill', 'fuel_transit_1', 'fuel_transit_2', 'fuel_outside_speed');

set local role authenticated;
select pg_temp.conso_actor(3);
select is((pg_temp.fuel_row('goury_other')->>'capacityLiters')::numeric, 11000::numeric, 'main fuel stock capacity excludes the day tank');
select is((public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('goury_other'), 'percent', 50)->>'fuelLiters')::numeric,
  5500::numeric, 'the assigned real Capitaine can set a percentage baseline');
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('fuel_same_day'), null,
  pg_temp.conso_input() || '{"departureGauge":80,"arrivalGauge":40,"actualArrival":null,"pricePerLiter":null}')$$,
  'the signing Capitaine can save a same-day Conso without an explicit arrival');
select is(pg_temp.fuel_row('goury_other')->>'source', 'operation', 'same-day first recording replaces the earlier baseline');
select is((pg_temp.fuel_row('goury_other')->>'fuelLiters')::numeric, 4400::numeric, 'nominal arrival conversion uses the configured main tanks');
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('fuel_backfill'), null,
  pg_temp.conso_input() || '{"departureGauge":80,"arrivalGauge":20,"actualArrival":null,"pricePerLiter":null}')$$,
  'the signing Capitaine can backfill an older operation');
select is((pg_temp.fuel_row('goury_other')->>'fuelLiters')::numeric, 4400::numeric, 'an older business date cannot supersede a newer stock');
select is(public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('goury_other'), 'liters', 6000)->>'source', 'baseline',
  'a new baseline takes precedence over previous operations');
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('fuel_same_day'), 1,
  pg_temp.conso_input() || '{"departureGauge":80,"arrivalGauge":30,"actualArrival":null,"pricePerLiter":null}')$$,
  'the Capitaine can correct the older same-day Conso');
select is((pg_temp.fuel_row('goury_other')->>'fuelLiters')::numeric, 6000::numeric, 'an undated correction retains its original stock ordering');

select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('fuel_transit_1'), null,
  pg_temp.conso_input() || jsonb_build_object('averageSpeedKnots', 6, 'departureGauge', 80, 'arrivalGauge', 70,
    'pricePerLiter', null, 'actualArrival', to_char((now() at time zone 'Europe/Paris')::date - 5, 'YYYY-MM-DD"T12:00"')))$$,
  'a confirmed two-hour transit supplies an autonomy sample');
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('fuel_transit_2'), null,
  pg_temp.conso_input() || jsonb_build_object('durationMinutes', 240, 'averageSpeedKnots', 6, 'departureGauge', 80, 'arrivalGauge', 50,
    'pricePerLiter', null, 'actualArrival', to_char((now() at time zone 'Europe/Paris')::date - 4, 'YYYY-MM-DD"T12:00"')))$$,
  'a confirmed four-hour transit supplies an autonomy sample');
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('fuel_outside_speed'), null,
  pg_temp.conso_input() || jsonb_build_object('averageSpeedKnots', 9, 'departureGauge', 80, 'arrivalGauge', 40,
    'pricePerLiter', null, 'actualArrival', to_char((now() at time zone 'Europe/Paris')::date - 3, 'YYYY-MM-DD"T12:00"')))$$,
  'a faster transit can be stored without contaminating the near-speed rate');
select is((pg_temp.fuel_row('goury_other')->>'rateSampleCount')::integer, 2, 'only actual dated transits near half maximum speed count');
select is(round((pg_temp.fuel_row('goury_other')->>'rateLitersPerHour')::numeric, 3), 733.333::numeric,
  'autonomy consumption divides total liters by total elapsed hours');
select pg_temp.conso_actor(4);
select is(pg_temp.fuel_row('goury_other')->>'canSetBaseline', 'false', 'an unassigned real Capitaine can read the visible vessel without baseline write rights');
select throws_ok($$select public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('goury_other'), 'liters', 1)$$,
  '42501', null, 'another Capitaine cannot set the baseline');
select pg_temp.conso_actor(5);
select is((pg_temp.fuel_row('goury_other')->>'fuelLiters')::numeric, 6000::numeric, 'a real Marin can consult the visible stock');
select is(pg_temp.fuel_row('fuel_office_only'), null::jsonb, 'a real Marin does not see an unassigned vessel without operations');
select throws_ok($$select public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('goury_other'), 'liters', 1)$$,
  '42501', null, 'a real Marin cannot set a baseline');
select pg_temp.conso_actor(2);
select is(pg_temp.fuel_row('fuel_office_only')->>'canSetBaseline', 'true', 'Direction sees active vessels even without operations');
select throws_ok($$select public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('fuel_office_only'), 'percent', 50)$$,
  '22023', null, 'percentage input requires a main tank capacity');
select is((public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('fuel_office_only'), 'liters', 12.345)->>'fuelLiters')::numeric,
  12.345::numeric, 'manual liters are available without a known capacity');
reset role;
update public.vessels set max_speed_knots = 12 where id = pg_temp.fuel_vessel('native_cm');
with calendar as (select (now() at time zone 'Europe/Paris')::date - 30 - date '1899-12-30' + 0.5 as excel_departure)
update sea_operation_private.consumption_history history
set data = jsonb_set(history.data, '{suroit}', jsonb_build_array(
  jsonb_build_object('sourceRow', 14, 'cells', jsonb_build_array('Cherbourg', 'Le Havre', 12,
    excel_departure, excel_departure + 2::numeric / 24, 'NON', null, null, 90, 80, null, null, 240)),
  jsonb_build_object('sourceRow', 15, 'cells', jsonb_build_array('Cherbourg', 'Le Havre', 12,
    excel_departure, excel_departure + 2::numeric / 24, 'NON', null, null, 90, 80, null, null, 120))))
from calendar where history.company_id = (select id from public.companies where code = 'bbtm');
set local role authenticated;
select pg_temp.conso_actor(2);
select is((pg_temp.fuel_row('native_cm')->>'rateSampleCount')::integer, 1, 'duplicate genuine-vessel workbook intervals count once');
select is(round((pg_temp.fuel_row('native_cm')->>'rateLitersPerHour')::numeric, 3), 60::numeric,
  'historical transit autonomy uses recorded dates and liters');
select pg_temp.conso_actor(6);
select is(public.sea_operation_fleet_fuel(), '[]'::jsonb, 'foreign admin cannot list stock from another company');
select throws_ok($$select public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('goury_other'), 'liters', 1)$$,
  '42501', null, 'foreign admin cannot set the baseline');
reset role;
select * from finish();
rollback;
