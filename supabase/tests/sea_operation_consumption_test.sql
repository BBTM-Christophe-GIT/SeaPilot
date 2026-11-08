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
select is(pg_temp.fuel_row('goury_other')->>'source', 'operation', 'a same-day refuel replaces the earlier timestamped baseline with a compatible source');
select is((pg_temp.fuel_row('goury_other')->>'fuelLiters')::numeric, 4400::numeric, 'the converted arrival already includes the refuel quantity');
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
select set_config('request.jwt.claim.sub', '', true);

select ok(not has_function_privilege('anon', 'public.sea_operation_save_fuel_baseline(bigint,text,numeric,date)', 'EXECUTE'),
  'anonymous accounts cannot set dated stock');
update public.vessels set fuel_tank_capacities_liters = array[6000,4000,1000], fuel_tank_names = array['Avant','Milieu','Arrière']
where id = pg_temp.fuel_vessel('goury_other');
select is((select fuel_tank_names from public.vessels where id = pg_temp.fuel_vessel('goury_other')),
  array['Avant','Milieu','Arrière']::text[], 'three configured tanks can be named');
select throws_ok($$update public.vessels set fuel_tank_names = array['Avant','AVANT','Arrière'] where id = pg_temp.fuel_vessel('goury_other')$$,
  '23514', null, 'duplicate case-insensitive tank names are rejected');
select throws_ok($$update public.vessels set fuel_tank_names = array['Avant','Milieu'] where id = pg_temp.fuel_vessel('goury_other')$$,
  '23514', null, 'tank names must match configured tank count');

with fixture(key, name, acronym, capacity_m3) as (values
  ('fuel_dpr', 'CONSO STOCK DPR', null, 10), ('fuel_br71_name', 'BR - 71', null, null),
  ('fuel_br71_acronym', 'CONSO STOCK EXCLUDED', 'BR-71', null)), inserted as (
  insert into public.vessels(company_id, name, acronym, active, asset_kind, fuel_capacity_m3)
  select company.id, fixture.name, fixture.acronym, true, 'vessel', fixture.capacity_m3 from public.companies company cross join fixture
  where company.code = 'bbtm' returning id, name
)
insert into conso_fixture(key, id, vessel_id) select fixture.key, gen_random_uuid(), inserted.id from inserted join fixture using (name);

insert into conso_fixture(key, id, vessel_id, draft)
select sample.key, gen_random_uuid(), pg_temp.fuel_vessel('fuel_dpr'), base.draft || jsonb_build_object(
  'project', sample.key, 'vessel', jsonb_set(base.draft->'vessel', '{id}', to_jsonb(pg_temp.fuel_vessel('fuel_dpr')::text)))
from conso_fixture base cross join (values ('fuel_dpr_refuel'), ('fuel_dpr_plain')) sample(key) where base.key = 'goury_other';
insert into public.sea_operations(id, company_id, vessel_id, status, draft, created_by, created_by_name, updated_by, updated_by_name,
  signed_by, signed_by_name, signed_at, captain_name)
select fixture.id, base.company_id, fixture.vessel_id, base.status, fixture.draft, base.created_by, base.created_by_name,
  base.updated_by, base.updated_by_name, base.signed_by, base.signed_by_name, base.signed_at, base.captain_name
from conso_fixture fixture cross join public.sea_operations base
where base.id = pg_temp.conso_id('goury_other') and fixture.key in ('fuel_dpr_refuel', 'fuel_dpr_plain');

create function pg_temp.fuel_day(p_days integer) returns date language sql stable as $$
  select (now() at time zone 'Europe/Paris')::date + p_days;
$$;
with samples(n, day_offset, status, liters, deleted, version_no) as (values
  (1,-3,'validated',100,false,1), (2,-3,'validated',200,false,2), (3,-3,'validated',null,false,1),
  (4,-1,'validated',90,false,1), (5,-1,'validated',0,false,2), (6,0,'validated',100,false,1),
  (7,0,'draft',900,false,1), (8,0,'submitted',900,false,1), (9,0,'reopened',900,false,2),
  (10,0,'validated',900,true,1), (11,1,'validated',900,false,1), (12,-4,'validated',900,false,1)
), actor as (select 'b9470000-0000-0000-0000-000000000001'::uuid as id), inserted as (
  insert into public.dpr_reports(company_id, vessel_id, report_date, status, dpr_number, unlisted_project_name,
    issuer_user_id, issuer_name_snapshot, created_by, submitted_by, submitted_at, validated_by, validated_at, version_no, deleted_by, deleted_at, deletion_reason)
  select company.id, pg_temp.fuel_vessel('fuel_dpr'), pg_temp.fuel_day(sample.day_offset), sample.status, 1900000000 + sample.n,
    'DPR fuel fixture ' || sample.n, actor.id, 'Conso admin', actor.id, actor.id, now() - interval '1 hour',
    actor.id, now() - (20 - sample.n) * interval '1 minute', sample.version_no,
    case when sample.deleted then actor.id end, case when sample.deleted then now() end, case when sample.deleted then 'fixture' end
  from public.companies company cross join samples sample cross join actor where company.code = 'bbtm' returning id, company_id, dpr_number
)
insert into public.dpr_daily_metrics(dpr_id, company_id, fuel_consumed_liters)
select inserted.id, inserted.company_id, samples.liters from inserted join samples on inserted.dpr_number = 1900000000 + samples.n;

with batch as (
  insert into public.migration_batches(company_id, migration_key, source_site_url, mode, status, rules_version)
  select id, 'stock-dpr-history-fixture', 'https://example.invalid', 'historical-load', 'completed', 'fixture'
  from public.companies where code = 'bbtm' returning id, company_id
), inserted as (
  insert into public.dpr_reports(company_id, vessel_id, report_date, status, dpr_number, issuer_name_snapshot,
    source_label, migration_batch_id, source_modified_at)
  select company_id, pg_temp.fuel_vessel('fuel_dpr'), pg_temp.fuel_day(-2), 'validated', 1900000013,
    'Historic stock DPR', 'sharepoint', id, now() - interval '2 days' from batch returning id, company_id
)
insert into public.dpr_daily_metrics(dpr_id, company_id, fuel_consumed_liters) select id, company_id, 50 from inserted;

set local role authenticated;
select pg_temp.conso_actor(2);
select is(pg_temp.fuel_row('fuel_br71_name'), null::jsonb, 'the normalized BR71 name is excluded from stock');
select is(pg_temp.fuel_row('fuel_br71_acronym'), null::jsonb, 'the normalized BR71 acronym is excluded from stock');
select throws_ok($$select public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('fuel_br71_acronym'), 'liters', 1, pg_temp.fuel_day(0))$$,
  '42501', null, 'the excluded asset cannot receive a dated stock baseline');
select throws_ok($$select public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('fuel_dpr'), 'liters', 1, pg_temp.fuel_day(1))$$,
  '22023', null, 'a future stock date is rejected');
select is((public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('fuel_dpr'), 'liters', 1000, pg_temp.fuel_day(-3))->>'fuelLiters')::numeric,
  650::numeric, 'the dated opening balance deducts validated vessel-day DPRs inclusive, including migrated history');
select is((pg_temp.fuel_row('fuel_dpr')->>'deductedFuelLiters')::numeric, 350::numeric,
  'one latest non-null final reading per day counts, including an authoritative zero');
select pg_temp.conso_actor(5);
select is((pg_temp.fuel_row('fuel_dpr')->>'fuelLiters')::numeric, 650::numeric, 'a real Marin can read the scoped vessel total');
select is((select count(*) from public.dpr_reports where vessel_id = pg_temp.fuel_vessel('fuel_dpr')), 0::bigint,
  'the scoped fuel total does not grant a real Marin raw DPR access');
select throws_ok($$select public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('fuel_dpr'), 'liters', 1, pg_temp.fuel_day(0))$$,
  '42501', null, 'a real Marin cannot save a dated stock reference');
select pg_temp.conso_actor(3);
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('fuel_dpr_plain'), null,
  pg_temp.conso_input() || jsonb_build_object('departureGauge', 85, 'arrivalGauge', 80, 'refuelLiters', null,
    'pricePerLiter', null, 'actualArrival', to_char(pg_temp.fuel_day(0), 'YYYY-MM-DD"T00:00"')))$$,
  'a plain Conso may be recorded after the dated opening balance');
select is((pg_temp.fuel_row('fuel_dpr')->>'fuelLiters')::numeric, 650::numeric, 'plain Conso does not overwrite or additionally deduct stock');
select lives_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('fuel_dpr_refuel'), null,
  pg_temp.conso_input() || jsonb_build_object('departureGauge', 80, 'arrivalGauge', 70, 'refuelLiters', 2500,
    'pricePerLiter', null, 'actualArrival', to_char(pg_temp.fuel_day(-2), 'YYYY-MM-DD"T18:00"')))$$,
  'a signed Conso refuel provides an arrival gauge anchor');
select is(pg_temp.fuel_row('fuel_dpr')->>'source', 'operation', 'the active refuel uses the existing operation source on the wire');
select is((pg_temp.fuel_row('fuel_dpr')->>'fuelLiters')::numeric, 6900::numeric,
  'refuel uses converted arrival without adding the loaded quantity or deducting the anchor day');
select is((pg_temp.fuel_row('fuel_dpr')->>'refuelLiters')::numeric, 2500::numeric, 'the loaded liters are separate from the measured arrival gauge');
select pg_temp.conso_actor(2);
select is((public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('fuel_dpr'), 'liters', 50, pg_temp.fuel_day(0))->>'fuelLiters')::numeric,
  0::numeric, 'a newer dated opening balance takes precedence and the remaining stock has a zero floor');
select is((public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('fuel_dpr'), 'liters', 600)->>'fuelLiters')::numeric,
  600::numeric, 'the old timestamp-style API does not deduct its measurement day');
reset role;
select set_config('request.jwt.claim.sub', '', true);

select ok(not has_function_privilege('anon', 'public.sea_operation_fleet_fuel_history(bigint,integer)', 'EXECUTE'),
  'anonymous accounts cannot query annual vessel consumption');
with samples(n, report_day, status, liters) as (values
  (1, date '2024-01-05', 'validated', 0), (2, date '2024-02-01', 'validated', 100),
  (3, date '2024-03-01', 'validated', 80), (4, date '2024-03-15', 'validated', 120),
  (5, date '2024-04-30', 'validated', 100), (6, date '2024-05-01', 'validated', 100),
  (7, date '2024-05-20', 'validated', 200), (8, date '2024-05-20', 'validated', 50),
  (9, date '2024-05-20', 'draft', 900)
), actor as (select 'b9470000-0000-0000-0000-000000000001'::uuid as id), inserted as (
  insert into public.dpr_reports(company_id, vessel_id, report_date, status, dpr_number, unlisted_project_name,
    issuer_user_id, issuer_name_snapshot, created_by, submitted_by, submitted_at, validated_by, validated_at)
  select company.id, pg_temp.fuel_vessel('fuel_dpr'), sample.report_day, sample.status, 1900000100 + sample.n,
    'Annual stock fixture ' || sample.n, actor.id, 'Conso admin', actor.id, actor.id, now() - interval '1 hour',
    actor.id, now() - (20 - sample.n) * interval '1 minute'
  from public.companies company cross join samples sample cross join actor where company.code = 'bbtm' returning id, company_id, dpr_number
)
insert into public.dpr_daily_metrics(dpr_id, company_id, fuel_consumed_liters)
select inserted.id, inserted.company_id, samples.liters from inserted join samples on inserted.dpr_number = 1900000100 + samples.n;

with inserted as (
  insert into public.dpr_reports(company_id, vessel_id, report_date, status, dpr_number, issuer_name_snapshot,
    source_label, migration_batch_id, source_modified_at)
  select company_id, pg_temp.fuel_vessel('fuel_dpr'), date '2023-12-28', 'validated', 1900000110,
    'Historic annual fuel', 'sharepoint', id, now() - interval '3 days'
  from public.migration_batches where migration_key = 'stock-dpr-history-fixture' returning id, company_id
)
insert into public.dpr_daily_metrics(dpr_id, company_id, fuel_consumed_liters) select id, company_id, 60 from inserted;

insert into public.project_fuel_price_observations(company_id, price_date, price_eur_per_liter_ht, source_label)
select id, date '2024-01-02', 99, 'Foreign annual quote' from public.companies where code = 'conso-other';
insert into public.vessel_fuel_price_observations(company_id, vessel_id, price_date, price_eur_per_liter_ht, source_label)
select id, pg_temp.fuel_vessel('goury_other'), date '2024-04-20', 5, 'First fleet observation' from public.companies where code = 'bbtm';
insert into public.project_fuel_price_observations(company_id, price_date, price_eur_per_liter_ht, source_label)
select id, date '2024-03-11', 1.25, 'Latest backdated fleet observation' from public.companies where code = 'bbtm';
insert into public.vessel_fuel_price_observations(company_id, vessel_id, price_date, price_eur_per_liter_ht, source_label)
select company.id, pg_temp.fuel_vessel('fuel_dpr'), quote.price_day, quote.price, 'Annual vessel quote'
from public.companies company cross join (values (date '2024-05-01', 2), (date '2024-05-10', 2.5)) quote(price_day, price)
where company.code = 'bbtm';
insert into public.project_fuel_price_observations(company_id, price_date, price_eur_per_liter_ht, source_label)
select id, date '2024-05-19', 9, 'Later company observation' from public.companies where code = 'bbtm';

create function pg_temp.annual_fuel_month(p_year integer, p_month integer) returns jsonb language sql stable as $$
  select public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('fuel_dpr'), p_year)->'months'->(p_month - 1);
$$;

set local role authenticated;
select pg_temp.conso_actor(5);
select is(public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('fuel_dpr'), 2024)->'years',
  (select jsonb_agg(year order by year desc) from (select distinct year from (values
    (extract(year from pg_temp.fuel_day(0))::integer), (extract(year from pg_temp.fuel_day(-4))::integer), (2024), (2023)
  ) fixture(year)) years), 'real Marin receives available canonical DPR years');
select is(jsonb_array_length(public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('fuel_dpr'), 2024)->'months'),
  12, 'the annual result always has twelve ordered calendar months');
select is(pg_temp.annual_fuel_month(2024, 1), '{"month":1,"liters":0,"costEuros":0,"unpricedLiters":0}'::jsonb,
  'an observed zero is distinct from an empty month');
select is(pg_temp.annual_fuel_month(2024, 2), '{"month":2,"liters":100,"costEuros":null,"unpricedLiters":100}'::jsonb,
  'a vessel without an applicable local tariff does not inherit a future or foreign tariff');
select is(pg_temp.annual_fuel_month(2024, 3), '{"month":3,"liters":200,"costEuros":150,"unpricedLiters":80}'::jsonb,
  'historical costs sum only the priced subset of a month');
select is(pg_temp.annual_fuel_month(2024, 4), '{"month":4,"liters":100,"costEuros":500,"unpricedLiters":0}'::jsonb,
  'a later recorded backdated quote does not override a newer effective fleet tariff');
select is(pg_temp.annual_fuel_month(2024, 5), '{"month":5,"liters":150,"costEuros":325,"unpricedLiters":0}'::jsonb,
  'own dated tariffs take precedence and the latest final vessel/day DPR is counted once');
select is(pg_temp.annual_fuel_month(2024, 12), '{"month":12,"liters":null,"costEuros":null,"unpricedLiters":0}'::jsonb,
  'an empty month leaves both charts unobserved');
select is(pg_temp.annual_fuel_month(2023, 12), '{"month":12,"liters":60,"costEuros":null,"unpricedLiters":60}'::jsonb,
  'a validated historical import participates in its report year');
select is((pg_temp.annual_fuel_month(extract(year from pg_temp.fuel_day(0))::integer,
    extract(month from pg_temp.fuel_day(0))::integer)->>'liters')::numeric,
  (select sum(liters)::numeric from (values (-4,900),(-3,200),(-2,50),(-1,0),(0,100)) sample(day_offset, liters)
    where date_trunc('month', pg_temp.fuel_day(sample.day_offset)::timestamp) = date_trunc('month', pg_temp.fuel_day(0)::timestamp)),
  'a validated DPR dated tomorrow is excluded even within the current month');
select throws_ok($$select public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('fuel_office_only'), 2024)$$,
  '42501', null, 'a real Marin cannot query a vessel outside their stock scope');
select pg_temp.conso_actor(2);
select throws_ok($$select public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('fuel_br71_acronym'), 2024)$$,
  '42501', null, 'annual charts exclude BR71 even for office profiles');
select throws_ok($$select public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('fuel_dpr'), extract(year from pg_temp.fuel_day(0))::integer + 1)$$,
  '22023', null, 'future chart years are rejected');
select pg_temp.conso_actor(6);
select throws_ok($$select public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('fuel_dpr'), 2024)$$,
  '42501', null, 'foreign admins cannot query annual fuel data');
reset role;
select set_config('request.jwt.claim.sub', '', true);

select ok(not has_function_privilege('anon', 'public.sea_operation_fleet_fuel_history(bigint,integer,boolean)', 'EXECUTE'),
  'anonymous accounts cannot query billing totals');

with projects as (
  insert into public.projects(company_id, title, source_label, primary_vessel_id, secondary_vessel_id, secondary_vessel_name)
  select company.id, sample.title, 'seapilot', pg_temp.fuel_vessel('goury_other'), sample.secondary_id, sample.secondary_name
  from public.companies company cross join (values
    ('Goury billing fixture', null::bigint, null::text),
    ('Goury mixed billing fixture', pg_temp.fuel_vessel('fuel_dpr'), null::text),
    ('Goury unresolved billing fixture', null::bigint, 'Unlinked other vessel')
  ) sample(title, secondary_id, secondary_name)
  where company.code = 'bbtm'
  returning id, company_id
)
insert into public.project_billing_periods(company_id, project_id, period_month)
select company_id, id, date '2024-07-01' from projects;

with samples(n, vessel, report_day, liters) as (values
  (1, pg_temp.fuel_vessel('goury_other'), date '2024-02-10', 200),
  (2, pg_temp.fuel_vessel('goury_other'), date '2023-12-01', 100),
  (3, pg_temp.fuel_vessel('fuel_dpr'), date '2024-02-11', null::integer)
), inserted as (
  insert into public.dpr_reports(company_id, project_id, vessel_id, report_date, status, dpr_number,
    issuer_user_id, issuer_name_snapshot, created_by, submitted_by, submitted_at, validated_by, validated_at)
  select project.company_id, project.id, sample.vessel, sample.report_day, 'validated', 1900000120 + sample.n,
    actor.id, 'Conso admin', actor.id, actor.id, now(), actor.id, now()
  from public.projects project cross join samples sample
  cross join (select 'b9470000-0000-0000-0000-000000000001'::uuid as id) actor
  where project.title = 'Goury mixed billing fixture' returning id, company_id, dpr_number
)
insert into public.dpr_daily_metrics(dpr_id, company_id, fuel_consumed_liters)
select inserted.id, inserted.company_id, sample.liters
from inserted join samples sample on inserted.dpr_number = 1900000120 + sample.n
where sample.liters is not null;

with invoices(project_title, invoice_day, amount, currency, specialties, dpr_number) as (values
  ('Goury billing fixture', date '2024-01-01', 100.25, 'EUR', array['  FuEL  ', 'fuel'], null::integer),
  ('Goury mixed billing fixture', date '2024-01-31', 50, 'EUR', array['Fuel'], 1900000121),
  ('Goury billing fixture', date '2024-06-01', 0, 'EUR', array['Fuel'], null),
  ('Goury billing fixture', date '2022-01-01', 10, 'EUR', array['Fuel'], null),
  ('Goury billing fixture', date '2024-01-05', 500, 'EUR', array['Fuel services'], null),
  ('Goury billing fixture', date '2024-01-05', 500, 'USD', array['Fuel'], null),
  ('Goury mixed billing fixture', date '2024-01-05', 500, 'EUR', array['Fuel'], null),
  ('Goury mixed billing fixture', date '2024-01-05', 500, 'EUR', array['Fuel'], 1900000123),
  ('Goury unresolved billing fixture', date '2024-01-05', 500, 'EUR', array['Fuel'], null),
  ('Goury billing fixture', pg_temp.fuel_day(1), 500, 'EUR', array['Fuel'], null)
)
insert into public.project_chargeable_expenses(company_id, project_id, billing_period_id, category, supplier,
  invoice_date, amount_ht, amount_ttc, currency, supplier_specialties, dpr_report_id)
select project.company_id, project.id, period.id, 'port', 'Fuel fixture supplier', invoice.invoice_day, invoice.amount,
  invoice.amount * 1.2, invoice.currency, invoice.specialties, report.id
from invoices invoice join public.projects project on project.title = invoice.project_title
join public.project_billing_periods period on period.company_id = project.company_id and period.project_id = project.id
left join public.dpr_reports report on report.company_id = project.company_id and report.project_id = project.id
  and report.dpr_number = invoice.dpr_number;

create function pg_temp.goury_billing_history(p_year integer) returns jsonb language sql stable as $$
  select public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('goury_other'), p_year, true);
$$;

set local role authenticated;
select pg_temp.conso_actor(5);
select is(pg_temp.goury_billing_history(2024)->>'costSource', 'billing',
  'a scoped real Marin receives billing as the GOURY cost source');
select is(pg_temp.goury_billing_history(2024)->'months'->0,
  '{"month":1,"liters":null,"costEuros":150.25,"unpricedLiters":0}'::jsonb,
  'invoice dates and HT euros determine totals, with direct DPR links resolving mixed projects');
select is(pg_temp.goury_billing_history(2024)->'months'->1,
  '{"month":2,"liters":200,"costEuros":null,"unpricedLiters":0}'::jsonb,
  'the whole billing year keeps DPR liters and does not add DPR estimated costs');
select is(pg_temp.goury_billing_history(2024)->'months'->5->>'costEuros', '0.00', 'a real zero invoice is an observation');
select is(pg_temp.goury_billing_history(2024)->'years', '[2024,2023,2022]'::jsonb,
  'invoice-only years are available and future invoices are excluded');
select is(pg_temp.goury_billing_history(2023), public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('goury_other'), 2023)
  || '{"costSource":"dpr","years":[2024,2023,2022]}'::jsonb, 'a year without invoices uses the original DPR estimate');
select is(public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('goury_other'), 2024, false),
  public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('goury_other'), 2024) || '{"costSource":"dpr"}'::jsonb,
  'the previous DPR-only behavior remains available');
select is(public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('fuel_dpr'), 2024, true),
  public.sea_operation_fleet_fuel_history(pg_temp.fuel_vessel('fuel_dpr'), 2024) || '{"costSource":"dpr"}'::jsonb,
  'other vessels retain exactly the original estimate');
select pg_temp.conso_actor(3);
select is(pg_temp.goury_billing_history(2024)->>'costSource', 'billing',
  'a scoped real Capitaine receives GOURY billing aggregates');
select pg_temp.conso_actor(6);
select throws_ok($$select pg_temp.goury_billing_history(2024)$$, '42501', null, 'foreign accounts cannot receive GOURY billing totals');
reset role;
select set_config('request.jwt.claim.sub', '', true);

select is(sea_operation_private.landemer_tank_liters(0), 0::numeric, 'the LANDEMER table includes the empty tank');
select is(sea_operation_private.landemer_tank_liters(0.5), 62::numeric, 'decimal gauges interpolate between adjacent table rows');
select is(sea_operation_private.landemer_tank_liters(98.989), 12232::numeric, 'the LANDEMER table preserves its high precision breakpoints');
select is(sea_operation_private.landemer_tank_liters(100), 12357::numeric, 'each full LANDEMER tank is 12,357 liters');

with landemer as (
  update public.vessels vessel
  set registration_number = '941334', fuel_tank_capacities_liters = array[12357, 12357]::numeric[]
  from public.companies company where vessel.company_id = company.id and company.code = 'bbtm' and vessel.imo_number = '9059262'
  returning vessel.id
)
insert into conso_fixture(key, id, vessel_id, draft)
select 'landemer', gen_random_uuid(), landemer.id, base.draft || jsonb_build_object(
  'project', 'LANDEMER calibrated Conso', 'vessel', jsonb_set(base.draft->'vessel', '{id}', to_jsonb(landemer.id::text)))
from landemer cross join conso_fixture base where base.key = 'goury_other';

insert into public.sea_operations(id, company_id, vessel_id, status, draft, created_by, created_by_name, updated_by, updated_by_name,
  signed_by, signed_by_name, signed_at, captain_name)
select fixture.id, base.company_id, fixture.vessel_id, base.status, fixture.draft, base.created_by, base.created_by_name,
  base.updated_by, base.updated_by_name, base.signed_by, base.signed_by_name, base.signed_at, base.captain_name
from conso_fixture fixture cross join public.sea_operations base
where base.id = pg_temp.conso_id('goury_other') and fixture.key = 'landemer';

create function pg_temp.landemer_inputs() returns jsonb language sql stable as $$
  select (pg_temp.conso_input() - array['departureGauge', 'arrivalGauge']) || jsonb_build_object(
    'actualArrival', to_char(pg_temp.fuel_day(0), 'YYYY-MM-DD"T00:00"'),
    'tankGauges', '{"departure":{"port":47.439,"starboard":100},"arrival":{"port":60.442,"starboard":10.601}}'::jsonb
  );
$$;

set local role authenticated;
select pg_temp.conso_actor(3);
select is(public.sea_operation_consumption(pg_temp.conso_id('landemer'))->'calibration',
  '{"kind":"nominal","defaultGaugeUnit":"percent","nominalCapacityLiters":24714,"tankCalibration":"landemer-v1"}'::jsonb,
  'official LANDEMER supplies an additive tank calibration');
select ok(not (public.sea_operation_consumption(pg_temp.conso_id('goury_other'))->'calibration' ? 'tankCalibration'),
  'other vessels keep their existing calibration contract');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('goury_other'), 2, pg_temp.landemer_inputs())$$,
  '22023', null, 'paired readings are restricted to the official LANDEMER');

update conso_fixture set response = public.sea_operation_save_consumption(pg_temp.conso_id('landemer'), null,
  pg_temp.conso_input() || jsonb_build_object('actualArrival', null))
where key = 'landemer';
select is((response->'record'->>'departureLiters')::numeric, 19276.920::numeric,
  'old aggregate LANDEMER submissions retain the nominal calculation')
from conso_fixture where key = 'landemer';
select ok(not (response->'record' ? 'tankGauges'), 'old aggregate readings never fabricate individual gauges')
from conso_fixture where key = 'landemer';

update conso_fixture set response = public.sea_operation_save_consumption(pg_temp.conso_id('landemer'), 1, pg_temp.landemer_inputs())
where key = 'landemer';
select is(response->'record'->'tankGauges', pg_temp.landemer_inputs()->'tankGauges', 'raw four tank readings are saved exactly')
from conso_fixture where key = 'landemer';
select is(array[(response->'record'->>'departureLiters')::numeric, (response->'record'->>'arrivalLiters')::numeric,
  (response->'record'->>'consumedLiters')::numeric], array[18219,8779,9440]::numeric[],
  'both calibrated tanks are summed and fuel may move between tanks during a passage')
from conso_fixture where key = 'landemer';
select is((response->'record'->>'arrivalGauge')::numeric, round(877900::numeric / 24714, 6),
  'the old scalar field represents the calibrated volume as a percentage of total capacity')
from conso_fixture where key = 'landemer';
select is((pg_temp.fuel_row('landemer')->>'fuelLiters')::numeric, 8779::numeric,
  'the refuel anchor uses calibrated arrival liters');

select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('landemer'), 1, pg_temp.landemer_inputs())$$,
  '40001', null, 'stale paired writes cannot replace the current reading');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('landemer'), 2,
  jsonb_set(pg_temp.landemer_inputs(), '{tankGauges,arrival,starboard}', '100.001'))$$,
  '22023', null, 'individual gauge percentages above 100 are rejected');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('landemer'), 2,
  jsonb_set(pg_temp.landemer_inputs(), '{tankGauges,arrival,starboard}', '10.6012'))$$,
  '22023', null, 'individual gauge percentages beyond three decimals are rejected');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('landemer'), 2,
  pg_temp.landemer_inputs() #- '{tankGauges,arrival,starboard}')$$, '22023', null, 'both sides are required at each point');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('landemer'), 2,
  jsonb_set(pg_temp.landemer_inputs(), '{tankGauges,arrival,starboard}', '100'))$$,
  '22023', null, 'a rise in combined calibrated fuel is invalid after departure');
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('landemer'), 2, pg_temp.conso_input())$$,
  '22023', null, 'an older client cannot replace paired gauges with aggregate values');

update conso_fixture set response = public.sea_operation_save_consumption(pg_temp.conso_id('landemer'), 2,
  pg_temp.conso_input() || jsonb_build_object('departureGauge', response->'record'->'departureGauge',
    'arrivalGauge', response->'record'->'arrivalGauge', 'actualArrival', response->'record'->'actualArrival'))
where key = 'landemer';
select is(response->'record'->'tankGauges', pg_temp.landemer_inputs()->'tankGauges',
  'old clients can preserve identical gauge readings while editing other fields')
from conso_fixture where key = 'landemer';
select is(public.sea_operation_consumption_export(array[pg_temp.conso_id('landemer')])->0->'record'->'tankGauges',
  pg_temp.landemer_inputs()->'tankGauges', 'the existing export RPC includes raw paired gauges');
select pg_temp.conso_actor(5);
select throws_ok($$select public.sea_operation_save_consumption(pg_temp.conso_id('landemer'), 3, pg_temp.landemer_inputs())$$,
  '42501', null, 'a real Marin remains unable to save tank readings');
reset role;
select set_config('request.jwt.claim.sub', '', true);

select ok(not has_table_privilege('authenticated', 'sea_operation_private.fuel_tank_readings', 'SELECT,INSERT,UPDATE,DELETE'),
  'detailed tank readings can only be accessed through scoped RPCs');
select ok(not has_function_privilege('anon', 'public.sea_operation_fuel_tanks(bigint,date)', 'EXECUTE'),
  'anonymous users cannot read tank levels');
select ok(not has_function_privilege('anon', 'public.sea_operation_save_fuel_tanks(bigint,date,integer,jsonb)', 'EXECUTE'),
  'anonymous users cannot save tank levels');
select throws_ok($$update public.vessels set daily_fuel_tank_name = 'Unconfigured'
  where id = pg_temp.fuel_vessel('fuel_office_only')$$, '23514', null, 'a named day tank requires a capacity');

update public.vessels set fuel_tank_capacities_liters = array[7000,3000]::numeric[],
  daily_fuel_tank_capacity_liters = 200, daily_fuel_tank_name = 'Caisse moteur'
where id = pg_temp.fuel_vessel('fuel_office_only');
select throws_ok($$update public.vessels set daily_fuel_tank_name = ' Caisse moteur '
  where id = pg_temp.fuel_vessel('fuel_office_only')$$, '23514', null, 'a day tank name is stored without leading or trailing whitespace');
select throws_ok($$update public.vessels set daily_fuel_tank_name = repeat('a', 81)
  where id = pg_temp.fuel_vessel('fuel_office_only')$$, '23514', null, 'a day tank name has at most 80 characters');
update public.vessels set daily_fuel_tank_capacity_liters = 100 where id = pg_temp.fuel_vessel('landemer');

with samples(n, day_offset, liters) as (values (1,-3,800), (2,-2,100), (3,-1,200)), inserted as (
  insert into public.dpr_reports(company_id, vessel_id, report_date, status, dpr_number, unlisted_project_name,
    issuer_user_id, issuer_name_snapshot, created_by, submitted_by, submitted_at, validated_by, validated_at)
  select company.id, pg_temp.fuel_vessel('fuel_office_only'), pg_temp.fuel_day(sample.day_offset), 'validated', 1900000150 + sample.n,
    'Tank stock fixture ' || sample.n, actor.id, 'Conso admin', actor.id, actor.id, now(), actor.id, now()
  from public.companies company cross join samples sample
  cross join (select 'b9470000-0000-0000-0000-000000000001'::uuid as id) actor where company.code = 'bbtm'
  returning id, company_id, dpr_number
)
insert into public.dpr_daily_metrics(dpr_id, company_id, fuel_consumed_liters)
select inserted.id, inserted.company_id, sample.liters from inserted join samples sample on inserted.dpr_number = 1900000150 + sample.n;

create function pg_temp.soutes_inputs() returns jsonb language sql immutable as $$
  select '[{"key":"day","unit":"liters","value":150},{"key":"main-2","unit":"m3","value":2.1},
    {"key":"main-1","unit":"percent","value":50}]'::jsonb;
$$;
create function pg_temp.soutes_read(p_key text, p_days integer) returns jsonb language sql stable as $$
  select public.sea_operation_fuel_tanks(pg_temp.fuel_vessel(p_key), pg_temp.fuel_day(p_days));
$$;
create function pg_temp.soutes_save(p_key text, p_days integer, p_version integer, p_inputs jsonb) returns jsonb language sql as $$
  select public.sea_operation_save_fuel_tanks(pg_temp.fuel_vessel(p_key), pg_temp.fuel_day(p_days), p_version, p_inputs);
$$;

set local role authenticated;
select pg_temp.conso_actor(2);
select is(pg_temp.soutes_read('fuel_office_only', -2)->'tanks', '[
  {"key":"main-1","name":"Cuve Bâbord","capacityLiters":7000},
  {"key":"main-2","name":"Cuve Tribord","capacityLiters":3000},
  {"key":"day","name":"Caisse moteur","capacityLiters":200}]'::jsonb, 'the scoped read uses real fleet configuration and the personalized day tank name');
select is(pg_temp.soutes_read('fuel_office_only', -2)->'reading', 'null'::jsonb,
  'legacy stock has no fabricated per-tank readings');
select is(pg_temp.fuel_row('fuel_office_only')->'latestTankReading', 'null'::jsonb,
  'the fleet read keeps legacy-only stock without an invented snapshot');
select throws_ok($$select pg_temp.soutes_save('fuel_office_only', -2, null, pg_temp.soutes_inputs() - 0)$$,
  '22023', null, 'a configured day tank reading is required');
select throws_ok($$select pg_temp.soutes_save('fuel_office_only', -2, null,
  jsonb_set(pg_temp.soutes_inputs(), '{1,value}', '3.001'))$$, '22023', null, 'the converted m³ value cannot exceed tank capacity');
select throws_ok($$select pg_temp.soutes_save('fuel_office_only', -2, null,
  jsonb_set(pg_temp.soutes_inputs(), '{0,value}', '150.0001'))$$, '22023', null, 'all reading values are limited to three decimals');
select throws_ok($$select pg_temp.soutes_save('fuel_office_only', -2, null,
  jsonb_set(pg_temp.soutes_inputs(), '{1,key}', '"main-1"'))$$, '22023', null, 'duplicate tank keys cannot replace a missing tank');
select throws_ok($$select pg_temp.soutes_save('fuel_office_only', 1, null, pg_temp.soutes_inputs())$$,
  '22023', null, 'a future tank reading date is rejected');
select is((pg_temp.soutes_save('fuel_office_only', -2, null, pg_temp.soutes_inputs())->'reading'->>'mainLiters')::numeric, 5600::numeric,
  'a single save converts percentages and m³, and excludes the day tank from the stock anchor');
select is(pg_temp.soutes_read('fuel_office_only', -2)->'reading'->'tanks', '[
  {"key":"main-1","name":"Cuve Bâbord","capacityLiters":7000,"unit":"percent","value":50,"liters":3500},
  {"key":"main-2","name":"Cuve Tribord","capacityLiters":3000,"unit":"m3","value":2.1,"liters":2100},
  {"key":"day","name":"Caisse moteur","capacityLiters":200,"unit":"liters","value":150,"liters":150}]'::jsonb,
  'readings reopen with entered units and a snapshot of their tank configuration');
select is((pg_temp.fuel_row('fuel_office_only')->>'fuelLiters')::numeric, 5300::numeric,
  'stock subtracts validated DPR use from the reading date, inclusive');
select is(pg_temp.fuel_row('fuel_office_only')->'latestTankReading', jsonb_build_object('date', pg_temp.fuel_day(-2),
  'superseded', false, 'tanks', '[
    {"key":"main-1","name":"Cuve Bâbord","capacityLiters":7000,"liters":3500},
    {"key":"main-2","name":"Cuve Tribord","capacityLiters":3000,"liters":2100},
    {"key":"day","name":"Caisse moteur","capacityLiters":200,"liters":150}]'::jsonb),
  'the fleet read exposes measured tank levels and their saved configuration independently from calculated stock');
select is(pg_temp.soutes_read('fuel_office_only', -1)->'reading', 'null'::jsonb, 'another date starts without readings');
select lives_ok($$select pg_temp.soutes_save('fuel_office_only', -3, null,
  jsonb_set(pg_temp.soutes_inputs(), '{2,value}', '40'))$$, 'a historical tank reading can be entered later');
select is(pg_temp.fuel_row('fuel_office_only')->'latestTankReading'->>'date', pg_temp.fuel_day(-2)::text,
  'the latest snapshot is ordered by its reading date even after a more recent save on an older date');
select throws_ok($$select pg_temp.soutes_save('fuel_office_only', -2, null, pg_temp.soutes_inputs())$$,
  '40001', null, 'a stale new form cannot overwrite an existing reading');
select lives_ok($$select public.sea_operation_save_fuel_baseline(pg_temp.fuel_vessel('fuel_office_only'), 'liters', 5000, pg_temp.fuel_day(-2))$$,
  'existing clients can still adjust the total directly');
select is(pg_temp.soutes_read('fuel_office_only', -2)->'reading'->>'superseded', 'true',
  'an old-client baseline change supersedes rather than deletes the same-day detail');
select is(pg_temp.fuel_row('fuel_office_only')->'latestTankReading'->>'superseded', 'true',
  'the last measured tank levels remain available after the active anchor changes');
select throws_ok($$select pg_temp.soutes_save('fuel_office_only', -2, 1, pg_temp.soutes_inputs())$$,
  '40001', null, 'an old-client baseline change invalidates a previously opened detailed form');
select is(pg_temp.soutes_save('fuel_office_only', -2, 2, pg_temp.soutes_inputs())->'reading'->>'superseded', 'false',
  'a fresh detailed save updates the reference again');

select is(pg_temp.soutes_read('landemer', 0)->'tanks'->0->>'calibration', 'landemer-v1',
  'official LANDEMER main tanks advertise their physical curve');
select ok(not (pg_temp.soutes_read('landemer', 0)->'tanks'->2 ? 'calibration'),
  'LANDEMER day tank has no main-tank curve');
select is((pg_temp.soutes_save('landemer', 0, null, '[
  {"key":"main-1","unit":"percent","value":98.989},{"key":"main-2","unit":"percent","value":10.601},
  {"key":"day","unit":"percent","value":0}]')->'reading'->>'mainLiters')::numeric, 13542::numeric,
  'each LANDEMER percentage uses the established individual curve and zero is valid for the day tank');
select is(pg_temp.soutes_read('missing_calibration', 0)->'tanks',
  '[{"key":"main-1","name":"Cuve","capacityLiters":null}]'::jsonb,
  'vessels without detailed configuration retain a single aggregate input');
select throws_ok($$select pg_temp.soutes_save('missing_calibration', 0, null, '[{"key":"main-1","unit":"percent","value":25}]')$$,
  '22023', null, 'an unknown nominal capacity cannot convert a percentage');
select is((pg_temp.soutes_save('missing_calibration', 0, null, '[{"key":"main-1","unit":"m3","value":1.25}]')
  ->'reading'->>'mainLiters')::numeric, 1250::numeric, 'a capacity-free legacy vessel accepts a total volume');

select pg_temp.conso_actor(3);
select is(pg_temp.soutes_read('goury_other', 0)->'tanks'->2->>'name', 'Arrière',
  'the dialog preserves names of the configured main tanks');
select is(pg_temp.fuel_row('goury_other')->>'assignedToday', 'true',
  'the confirmed daily assignment is preselected for a real writable Capitaine');
select is((pg_temp.soutes_save('goury_other', 0, null, '[
  {"key":"main-1","unit":"liters","value":600},{"key":"main-2","unit":"liters","value":500},
  {"key":"main-3","unit":"liters","value":0},
  {"key":"day","unit":"liters","value":0}]')->'reading'->>'mainLiters')::numeric, 1100::numeric,
  'a real assigned Capitaine can save all tank levels');
select throws_ok($$select pg_temp.soutes_save('fuel_office_only', -2, 3, pg_temp.soutes_inputs())$$,
  '42501', null, 'a Capitaine cannot save readings for an unassigned vessel');
select pg_temp.conso_actor(5);
select is(pg_temp.soutes_read('goury_other', 0)->>'canSetBaseline', 'false',
  'a real Marin can read scoped tank levels without editing rights');
select is(pg_temp.fuel_row('goury_other')->'latestTankReading'->>'date', pg_temp.fuel_day(0)::text,
  'a real Marin sees the snapshot for a visible vessel');
select is(pg_temp.fuel_row('fuel_office_only'), null::jsonb,
  'a real Marin cannot obtain the snapshot of a vessel outside their fleet scope');
select throws_ok($$select pg_temp.soutes_save('goury_other', 0, 1, pg_temp.soutes_inputs())$$,
  '42501', null, 'a Marin cannot save tank readings');
select throws_ok($$select pg_temp.soutes_read('fuel_office_only', 0)$$,
  '42501', null, 'a Marin cannot read tank levels outside their fleet scope');
select pg_temp.conso_actor(6);
select throws_ok($$select pg_temp.soutes_read('goury_other', 0)$$,
  '42501', null, 'foreign admins cannot read tank levels');
select is(pg_temp.fuel_row('goury_other'), null::jsonb, 'foreign admins cannot obtain other-company snapshots');
reset role;

select pg_temp.conso_actor(1);
insert into public.people(company_id, user_id, first_name, last_name, function_label, active)
select active_company_id, id, 'Soutes', 'Assigned fixture ' || right(id::text, 1),
  case when right(id::text, 1) = '2' then 'Direction' else 'Marin' end, true
from public.profiles where id in ('b9470000-0000-0000-0000-000000000002', 'b9470000-0000-0000-0000-000000000005');

with actors as (
  select direction.company_id, direction.id as direction_id, marin.id as marin_id
  from public.people direction join public.people marin using (company_id)
  where direction.user_id = 'b9470000-0000-0000-0000-000000000002'
    and marin.user_id = 'b9470000-0000-0000-0000-000000000005'
)
insert into public.planning_assignments(company_id, vessel_id, crew_person_id, captain_person_id,
  starts_at, ends_at, assignment_role, confirmation_status, comments)
select actors.company_id, pg_temp.fuel_vessel('fuel_office_only'), actors.direction_id, null,
  pg_temp.fuel_day(-1)::timestamp at time zone 'Europe/Paris', now() - interval '1 second',
  'crew', 'confirmed', 'Soutes past direct candidate'
from actors
union all
select actors.company_id, pg_temp.fuel_vessel('landemer'), actors.marin_id, actors.direction_id,
  now() - interval '1 minute', pg_temp.fuel_day(1)::timestamp at time zone 'Europe/Paris',
  'crew', 'confirmed', 'Soutes active indirect candidate'
from actors;

set local role authenticated;
select pg_temp.conso_actor(2);
select is(pg_temp.fuel_row('landemer')->>'assignedToday', 'true',
  'a current confirmed indirect assignment outranks a direct assignment that has already ended');
select is(pg_temp.fuel_row('fuel_office_only')->>'assignedToday', 'false', 'only one writable vessel is preferred');
select pg_temp.conso_actor(5);
select is(pg_temp.fuel_row('landemer')->>'assignedToday', 'false',
  'a confirmed working assignment never preselects a vessel the real Marin cannot edit');
reset role;

select pg_temp.conso_actor(1);
update public.planning_assignments set ends_at = pg_temp.fuel_day(1)::timestamp at time zone 'Europe/Paris'
where comments = 'Soutes past direct candidate';
set local role authenticated;
select pg_temp.conso_actor(2);
select is(pg_temp.fuel_row('fuel_office_only')->>'assignedToday', 'true',
  'among active assignments a direct assignment takes priority over a newer indirect assignment');
reset role;

select pg_temp.conso_actor(1);
update public.planning_assignments set ends_at = pg_temp.fuel_day(0)::timestamp at time zone 'Europe/Paris'
where comments = 'Soutes past direct candidate';
update public.planning_assignments set confirmation_status = 'cancelled' where comments = 'Soutes active indirect candidate';
set local role authenticated;
select pg_temp.conso_actor(2);
select is((select count(*) from jsonb_array_elements(public.sea_operation_fleet_fuel()) vessel
  where vessel->'assignedToday' = 'true'::jsonb), 0::bigint,
  'an assignment ending at Paris midnight and a cancelled assignment cannot choose a vessel for today');
reset role;
select * from finish();
rollback;
