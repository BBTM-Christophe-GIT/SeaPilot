begin;
select no_plan();

insert into public.companies(code, name) values ('fuel-reference-other', 'Fuel references foreign company');
insert into auth.users(id, email)
select ('b9460000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'fuel-reference-' || n || '@example.invalid'
from generate_series(1, 5) n;
insert into public.profiles(id, email, display_name, active_company_id)
select actor.id, actor.email, 'Fuel reference fixture ' || right(actor.id::text, 1), company.id
from auth.users actor join public.companies company
  on company.code = case when right(actor.id::text, 1) = '5' then 'fuel-reference-other' else 'bbtm' end
where actor.id::text like 'b9460000-%';
insert into public.company_memberships(company_id, user_id, active)
select active_company_id, id, true from public.profiles where id::text like 'b9460000-%'
on conflict (company_id, user_id) do update set active = true;
insert into public.user_roles(user_id, company_id, role_key)
select id, active_company_id, (array['admin', 'direction', 'capitaine', 'marin', 'admin'])[right(id::text, 1)::integer]
from public.profiles where id::text like 'b9460000-%';

-- This administrator has the role in both companies, but has selected BBTM.
insert into public.company_memberships(company_id, user_id, active)
select id, 'b9460000-0000-0000-0000-000000000001', true from public.companies where code = 'fuel-reference-other';
insert into public.user_roles(user_id, company_id, role_key)
select 'b9460000-0000-0000-0000-000000000001', id, 'admin' from public.companies where code = 'fuel-reference-other';

insert into public.vessels(company_id, name, asset_kind)
select id, 'Fuel reference fixture ' || code, 'vessel'
from public.companies where code in ('bbtm', 'fuel-reference-other');
create temporary table fuel_refs(code text primary key, company_id bigint not null, vessel_id bigint not null);
grant select on fuel_refs to authenticated, service_role;
insert into fuel_refs
select company.code, company.id, vessel.id from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.name = 'Fuel reference fixture ' || company.code;
insert into public.vessel_fuel_reference_samples (company_id, vessel_id, towing, source_key, source_label, voyage_count, distance_nm, fuel_liters)
select company_id, vessel_id, false, 'fixture-a', 'Fixture batch A', 2, 25, 230 from fuel_refs
union all
select company_id, vessel_id, false, 'fixture-b', 'Fixture batch B', 3, 55, 370 from fuel_refs where code = 'bbtm'
union all
select company_id, vessel_id, true, 'fixture-a', 'Fixture batch A', 1, 20, 260 from fuel_refs where code = 'bbtm';
insert into public.project_fuel_price_observations(company_id, price_date, price_eur_per_liter_ht, source_label)
select company_id, date '2001-02-03', 1.70, 'Foreign quote' from fuel_refs where code = 'fuel-reference-other';

select results_eq(
  $$select vessel.registration_number, sample.towing, sample.voyage_count, sample.distance_nm, sample.fuel_liters
    from public.vessel_fuel_reference_samples sample join public.vessels vessel on vessel.id = sample.vessel_id
    where sample.source_key in ('cx-3-rzl', 'cx-3-sur') order by vessel.registration_number, sample.towing$$,
  $$values ('926637'::text, false, 42, 2973.100::numeric, 38278.800::numeric),
           ('926637', true, 32, 1741.500, 30527.000),
           ('937905', false, 236, 20792.940, 174611.623),
           ('937905', true, 80, 11990.710, 160374.297)$$,
  'seed stores only the four validated totals for the two registered vessels'
);
select ok(not has_table_privilege('anon', 'public.project_fuel_vessel_rates', 'SELECT'), 'anonymous cannot read grouped rates');
select ok(not has_table_privilege('anon', 'public.project_fuel_price_observations', 'SELECT'), 'anonymous cannot read price observations');
select ok(not has_table_privilege('authenticated', 'public.vessel_fuel_reference_samples', 'INSERT, UPDATE, DELETE'), 'authenticated users cannot write historical fuel samples');
select ok(not has_table_privilege('authenticated', 'public.project_fuel_price_observations', 'DELETE'), 'authenticated users cannot delete a quote');

set local role service_role;
select lives_ok(
  $$insert into public.vessel_fuel_reference_samples (company_id, vessel_id, towing, source_key, source_label, voyage_count, distance_nm, fuel_liters)
    select company_id, vessel_id, false, 'fixture-b', 'Corrected fixture batch B', 3, 55, 370 from fuel_refs where code = 'bbtm'
    on conflict (company_id, vessel_id, towing, source_key) do update set source_label = excluded.source_label$$,
  'service ingestion can correct an existing batch without counting it twice'
);
select throws_ok(
  $$update public.vessel_fuel_reference_samples set distance_nm = 'NaN' where source_key = 'fixture-a'$$,
  '23514', null, 'nonfinite observations cannot be added to weighted totals'
);
select throws_ok(
  $$insert into public.vessel_fuel_reference_samples (company_id, vessel_id, towing, source_key, source_label, voyage_count, distance_nm, fuel_liters)
    select bbtm.company_id, foreign_company.vessel_id, false, 'wrong-company', 'Fixture', 1, 40, 400
    from fuel_refs bbtm cross join fuel_refs foreign_company where bbtm.code = 'bbtm' and foreign_company.code = 'fuel-reference-other'$$,
  '23503', null, 'fuel observations require a vessel in their own company'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b9460000-0000-0000-0000-000000000001', true);
select results_eq(
  $$select rate.towing, rate.sample_count, rate.distance_nm, rate.fuel_liters from public.project_fuel_vessel_rates rate
    join fuel_refs refs on rate.vessel_id = refs.vessel_id order by rate.towing$$,
  $$values (false, 5::bigint, 80::numeric, 600::numeric), (true, 1, 20, 260)$$,
  'administrator sees weighted source totals separated by mode and active company'
);
select lives_ok(
  $$insert into public.project_fuel_price_observations(price_date, price_eur_per_liter_ht, source_label)
    values (date '2001-02-04', 1.23, 'Initial quote')$$,
  'administrator can save a dated quote with the company and exact fuel defaults'
);
select is((select fuel_code from public.project_fuel_price_observations where price_date = date '2001-02-04'),
  'zaphir-taxable', 'quote refers to the requested product');
select is((select count(*)::integer from public.project_fuel_price_observations where source_label = 'Foreign quote'),
  0, 'administrator cannot read quotes outside their selected company');
select throws_ok(
  $$insert into public.project_fuel_price_observations(company_id, price_date, price_eur_per_liter_ht, source_label)
    select company_id, date '2001-02-04', 1.24, 'Wrong company' from fuel_refs where code = 'fuel-reference-other'$$,
  '42501', null, 'administrator cannot write quotes outside their selected company');
select throws_ok(
  $$insert into public.project_fuel_price_observations(price_date, price_eur_per_liter_ht, source_label, fuel_code)
    values (date '2001-02-06', 1.23, 'Incorrect product quote', 'road-diesel')$$,
  '23514', null, 'price observations for a different fuel are rejected');

select set_config('request.jwt.claim.sub', 'b9460000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.project_fuel_vessel_rates where vessel_id = (select vessel_id from fuel_refs where code = 'bbtm')),
  2, 'direction can read its own vessel rates');
select lives_ok(
  $$insert into public.project_fuel_price_observations(price_date, price_eur_per_liter_ht, source_label)
    values (date '2001-02-04', 1.28, 'Corrected quote')
    on conflict (company_id, price_date) do update
    set price_eur_per_liter_ht = excluded.price_eur_per_liter_ht, source_label = excluded.source_label$$,
  'direction can correct the quote for the same date without duplicate rows');
select is((select price_eur_per_liter_ht from public.project_fuel_price_observations where price_date = date '2001-02-04'),
  1.28::numeric, 'updated quote is visible');

select set_config('request.jwt.claim.sub', 'b9460000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.vessel_fuel_reference_samples), 0, 'capitaine cannot read raw aggregates');
select is((select count(*)::integer from public.project_fuel_vessel_rates), 0, 'capitaine cannot read grouped rates');
select is((select count(*)::integer from public.project_fuel_price_observations), 0, 'capitaine cannot read quotes');
select throws_ok(
  $$insert into public.project_fuel_price_observations(price_date, price_eur_per_liter_ht, source_label)
    values (date '2001-02-05', 1.23, 'Denied quote')$$,
  '42501', null, 'capitaine cannot insert a quote');

select set_config('request.jwt.claim.sub', 'b9460000-0000-0000-0000-000000000004', true);
select is((select count(*)::integer from public.vessel_fuel_reference_samples), 0, 'marin cannot read raw aggregates');
select is((select count(*)::integer from public.project_fuel_vessel_rates), 0, 'marin cannot read grouped rates');
select is((select count(*)::integer from public.project_fuel_price_observations), 0, 'marin cannot read quotes');

select set_config('request.jwt.claim.sub', 'b9460000-0000-0000-0000-000000000005', true);
select is((select count(*)::integer from public.project_fuel_vessel_rates), 1, 'foreign administrator sees only their own grouped rate');
select is((select source_label from public.project_fuel_price_observations), 'Foreign quote', 'foreign administrator cannot read BBTM quotes');

reset role;
select * from finish();
rollback;
