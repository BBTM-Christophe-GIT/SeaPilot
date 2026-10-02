begin;

select plan(47);

select has_table('public', 'planning_fleet_display_settings', 'fleet display settings are company scoped');
select ok((select relrowsecurity from pg_class where oid = 'public.planning_fleet_display_settings'::regclass), 'fleet settings enforce RLS');
select has_function('public', 'save_planning_fleet_display_settings', array['text[]'], 'fleet order uses a dedicated administration RPC');
select ok(not (select prosecdef from pg_proc where oid = 'public.save_planning_fleet_display_settings(text[])'::regprocedure), 'the save RPC runs with caller privileges and RLS');
select ok(not has_function_privilege('anon', 'public.save_planning_fleet_display_settings(text[])', 'EXECUTE'), 'anonymous users cannot invoke the save RPC');
select ok(not has_table_privilege('anon', 'public.planning_fleet_display_settings', 'SELECT'), 'anonymous users cannot read the company configuration');
select ok(has_function_privilege('authenticated', 'public.save_planning_fleet_display_settings(text[])', 'EXECUTE'), 'authenticated users reach the server-side administrator check');
select ok(not has_table_privilege('authenticated', 'public.planning_fleet_display_settings', 'DELETE'), 'configuration deletion is not exposed');

insert into public.planning_fleet_display_settings(company_id, function_order)
select id, '{}'::text[] from public.companies where code = 'bbtm'
on conflict (company_id) do update set function_order = excluded.function_order;

insert into public.companies(code, name, active)
values ('fleet-order-other-test', 'Fleet order other company', true);
insert into public.planning_fleet_display_settings(company_id)
select id from public.companies where code = 'fleet-order-other-test';

insert into auth.users(id, email)
values
  ('77ef0000-0000-0000-0000-000000000001', 'fleet-order-admin@example.invalid'),
  ('77ef0000-0000-0000-0000-000000000002', 'fleet-order-direction@example.invalid'),
  ('77ef0000-0000-0000-0000-000000000003', 'fleet-order-armement@example.invalid'),
  ('77ef0000-0000-0000-0000-000000000004', 'fleet-order-captain@example.invalid'),
  ('77ef0000-0000-0000-0000-000000000005', 'fleet-order-sailor@example.invalid'),
  ('77ef0000-0000-0000-0000-000000000006', 'fleet-order-foreign-admin@example.invalid');

insert into public.profiles(id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (values
  ('77ef0000-0000-0000-0000-000000000001'::uuid, 'fleet-order-admin@example.invalid', 'Fleet administrator', 'bbtm'),
  ('77ef0000-0000-0000-0000-000000000002'::uuid, 'fleet-order-direction@example.invalid', 'Fleet direction', 'bbtm'),
  ('77ef0000-0000-0000-0000-000000000003'::uuid, 'fleet-order-armement@example.invalid', 'Fleet armement', 'bbtm'),
  ('77ef0000-0000-0000-0000-000000000004'::uuid, 'fleet-order-captain@example.invalid', 'Fleet real Captain', 'bbtm'),
  ('77ef0000-0000-0000-0000-000000000005'::uuid, 'fleet-order-sailor@example.invalid', 'Fleet real Marin', 'bbtm'),
  ('77ef0000-0000-0000-0000-000000000006'::uuid, 'fleet-order-foreign-admin@example.invalid', 'Other company administrator', 'fleet-order-other-test')
) fixture(id, email, display_name, company_code)
join public.companies company on company.code = fixture.company_code;

insert into public.company_memberships(company_id, user_id, active)
select active_company_id, id, true from public.profiles
where id::text like '77ef0000-0000-0000-0000-%'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles(user_id, company_id, role_key)
select fixture.user_id, profile.active_company_id, fixture.role_key
from (values
  ('77ef0000-0000-0000-0000-000000000001'::uuid, 'admin'),
  ('77ef0000-0000-0000-0000-000000000002'::uuid, 'direction'),
  ('77ef0000-0000-0000-0000-000000000003'::uuid, 'armement'),
  ('77ef0000-0000-0000-0000-000000000004'::uuid, 'capitaine'),
  ('77ef0000-0000-0000-0000-000000000005'::uuid, 'marin'),
  ('77ef0000-0000-0000-0000-000000000006'::uuid, 'admin')
) fixture(user_id, role_key)
join public.profiles profile on profile.id = fixture.user_id;

insert into public.people(company_id, user_id, first_name, last_name, function_label, active)
select profile.active_company_id, profile.id, fixture.first_name, fixture.last_name, fixture.function_label, true
from (values
  ('77ef0000-0000-0000-0000-000000000004'::uuid, 'Camille', 'CAPITAINE', 'Capitaine'),
  ('77ef0000-0000-0000-0000-000000000005'::uuid, 'Marine', 'MARIN', 'Matelot')
) fixture(user_id, first_name, last_name, function_label)
join public.profiles profile on profile.id = fixture.user_id;

select set_config('test.fleet_order.company_id', (select id::text from public.companies where code = 'bbtm'), true);
select set_config('test.fleet_order.foreign_company_id', (select id::text from public.companies where code = 'fleet-order-other-test'), true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '77ef0000-0000-0000-0000-000000000001', true);

select is((select function_order from public.planning_fleet_display_settings), '{}'::text[], 'no custom order preserves the existing fleet display');
select lives_ok($$select public.save_planning_fleet_display_settings(array[' Matelot ', 'Chef mécanicien', 'Capitaine', 'Mécanicien'])$$, 'administrator can save a complete function order');
select is((select function_order from public.planning_fleet_display_settings), array['Matelot', 'Chef mécanicien', 'Capitaine', 'Mécanicien'], 'function labels are trimmed and their chosen order is persisted');
select is((select updated_by from public.planning_fleet_display_settings), '77ef0000-0000-0000-0000-000000000001'::uuid, 'the save records the administrator account');
select throws_ok($$select public.save_planning_fleet_display_settings(null)$$, '22023', null, 'a null list is rejected');
select throws_ok($$select public.save_planning_fleet_display_settings(array['Matelot', null])$$, '22023', null, 'null function labels are rejected');
select throws_ok($$select public.save_planning_fleet_display_settings(array['Matelot', ' '])$$, '22023', null, 'blank function labels are rejected');
select throws_ok($$select public.save_planning_fleet_display_settings(array['Matelot', ' matelot '])$$, '22023', null, 'duplicate labels ignore case and surrounding spaces');
select throws_ok($$select public.save_planning_fleet_display_settings(array['Mécanicien', 'mecanicien'])$$, '22023', null, 'duplicate labels ignore accents');
select throws_ok($$select public.save_planning_fleet_display_settings(array[['Capitaine', 'Matelot'], ['Chef mécanicien', 'Mécanicien']])$$, '22023', null, 'multidimensional arrays are rejected');
select is((select function_order from public.planning_fleet_display_settings), array['Matelot', 'Chef mécanicien', 'Capitaine', 'Mécanicien'], 'rejected input leaves the prior order intact');
select is((select count(*) from public.planning_fleet_display_settings where company_id = current_setting('test.fleet_order.foreign_company_id')::bigint), 0::bigint, 'administrator cannot read another company settings');
select throws_ok(format('insert into public.planning_fleet_display_settings(company_id, function_order) values (%s, array[%L])', current_setting('test.fleet_order.foreign_company_id'), 'Capitaine'), '42501', null, 'direct cross-company inserts are blocked by RLS');
select throws_ok(format('update public.planning_fleet_display_settings set company_id = %s where company_id = %s', current_setting('test.fleet_order.foreign_company_id'), current_setting('test.fleet_order.company_id')), '42501', null, 'RLS WITH CHECK prevents moving configuration to another company');
select throws_ok($$delete from public.planning_fleet_display_settings$$, '42501', null, 'administrator resets configuration through save instead of deletion');

select set_config('request.jwt.claim.sub', '77ef0000-0000-0000-0000-000000000002', true);
select is((select function_order from public.planning_fleet_display_settings), array['Matelot', 'Chef mécanicien', 'Capitaine', 'Mécanicien'], 'real Direction profile reads its fleet order');
select throws_ok($$select public.save_planning_fleet_display_settings(array['Capitaine'])$$, '42501', null, 'Direction cannot save fleet order');
with changed as (update public.planning_fleet_display_settings set function_order = array['Capitaine'] returning company_id)
select is((select count(*) from changed), 0::bigint, 'Direction cannot bypass the save RPC with a direct update');

select set_config('request.jwt.claim.sub', '77ef0000-0000-0000-0000-000000000003', true);
select is((select function_order from public.planning_fleet_display_settings), array['Matelot', 'Chef mécanicien', 'Capitaine', 'Mécanicien'], 'real Armement profile reads its fleet order');
select throws_ok($$select public.save_planning_fleet_display_settings(array['Capitaine'])$$, '42501', null, 'Armement cannot save fleet order');

select set_config('request.jwt.claim.sub', '77ef0000-0000-0000-0000-000000000004', true);
select is((select function_order from public.planning_fleet_display_settings), array['Matelot', 'Chef mécanicien', 'Capitaine', 'Mécanicien'], 'real Capitaine account reads its company fleet order');
select throws_ok($$select public.save_planning_fleet_display_settings(array['Capitaine'])$$, '42501', null, 'real Capitaine account cannot save fleet order');
with changed as (update public.planning_fleet_display_settings set function_order = array['Capitaine'] returning company_id)
select is((select count(*) from changed), 0::bigint, 'real Capitaine account cannot bypass the protected write');
select throws_ok(format('insert into public.planning_fleet_display_settings(company_id, function_order) values (%s, array[%L]) on conflict (company_id) do update set function_order = excluded.function_order', current_setting('test.fleet_order.company_id'), 'Capitaine'), '42501', null, 'real Capitaine account cannot directly upsert its company order');

select set_config('request.jwt.claim.sub', '77ef0000-0000-0000-0000-000000000005', true);
select is((select function_order from public.planning_fleet_display_settings), array['Matelot', 'Chef mécanicien', 'Capitaine', 'Mécanicien'], 'real Marin account reads its company fleet order');
select throws_ok($$select public.save_planning_fleet_display_settings(array['Capitaine'])$$, '42501', null, 'real Marin account cannot save fleet order');
select throws_ok(format('insert into public.planning_fleet_display_settings(company_id, function_order) values (%s, array[%L]) on conflict (company_id) do update set function_order = excluded.function_order', current_setting('test.fleet_order.company_id'), 'Capitaine'), '42501', null, 'real Marin account cannot directly upsert its company order');
with changed as (update public.planning_fleet_display_settings set function_order = array['Capitaine'] returning company_id)
select is((select count(*) from changed), 0::bigint, 'real Marin account cannot bypass the protected write');

select set_config('request.jwt.claim.sub', '77ef0000-0000-0000-0000-000000000006', true);
select is((select function_order from public.planning_fleet_display_settings), '{}'::text[], 'another company has an independent initial order');
select is((select count(*) from public.planning_fleet_display_settings where company_id = current_setting('test.fleet_order.company_id')::bigint), 0::bigint, 'another company administrator cannot read BBTM configuration');
select lives_ok($$select public.save_planning_fleet_display_settings(array['Capitaine', 'Matelot'])$$, 'another company administrator saves only their active company');
select is((select function_order from public.planning_fleet_display_settings), array['Capitaine', 'Matelot'], 'the other company keeps its own custom order');

select set_config('request.jwt.claim.sub', '77ef0000-0000-0000-0000-000000000001', true);
select is((select function_order from public.planning_fleet_display_settings), array['Matelot', 'Chef mécanicien', 'Capitaine', 'Mécanicien'], 'the other company save leaves BBTM unchanged');
select lives_ok($$select public.save_planning_fleet_display_settings('{}'::text[])$$, 'administrator can restore the existing display with an empty list');
select is((select function_order from public.planning_fleet_display_settings), '{}'::text[], 'reset persists an empty order');

set local role postgres;
update public.company_memberships set active = false where user_id = '77ef0000-0000-0000-0000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub', '77ef0000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.planning_fleet_display_settings), 0::bigint, 'an inactive Marin membership no longer reads configuration');
select throws_ok($$select public.save_planning_fleet_display_settings(array['Capitaine'])$$, '42501', null, 'an inactive membership cannot save configuration');

select set_config('request.jwt.claim.sub', '', true);
select is((select count(*) from public.planning_fleet_display_settings), 0::bigint, 'an authenticated role without a real account has no configuration access');
select throws_ok($$select public.save_planning_fleet_display_settings(array['Capitaine'])$$, '42501', null, 'the save RPC explicitly requires a real authenticated account');

select * from finish();
rollback;
