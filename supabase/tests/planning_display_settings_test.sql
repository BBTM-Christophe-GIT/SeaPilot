begin;
select no_plan();

select has_table('public', 'planning_display_settings');
select ok((select relrowsecurity from pg_class where oid = 'public.planning_display_settings'::regclass), 'RLS is enabled');
select ok(not has_table_privilege('anon', 'public.planning_display_settings', 'SELECT'), 'anonymous users cannot read settings');
select ok(not has_function_privilege('anon', 'public.planning_save_display_settings(boolean)', 'EXECUTE'), 'anonymous users cannot call the save RPC');
select ok(not has_table_privilege('authenticated', 'public.planning_display_settings', 'DELETE'), 'settings cannot be deleted by a client');
select ok(not has_column_privilege('authenticated', 'public.planning_display_settings', 'company_id', 'UPDATE'), 'a setting cannot be moved to another company');

insert into public.companies (code, name) values ('planning-filter-fixture', 'Planning filter fixture'), ('planning-filter-other', 'Other company');
insert into public.planning_display_settings (company_id) select id from public.companies where code = 'planning-filter-other';

insert into auth.users (id, email)
select ('7c926000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'planning-filter-' || n || '@example.invalid'
from generate_series(1, 5) n;
insert into public.profiles (id, email, display_name, active_company_id)
select u.id, u.email, 'Planning fixture', c.id from auth.users u cross join public.companies c
where u.email like 'planning-filter-%@example.invalid' and c.code = 'planning-filter-fixture';
insert into public.company_memberships (company_id, user_id, active)
select c.id, p.id, true from public.profiles p join public.companies c on c.id = p.active_company_id
where c.code = 'planning-filter-fixture'
on conflict (company_id, user_id) do update set active = excluded.active;
insert into public.user_roles (user_id, company_id, role_key)
select ('7c926000-0000-0000-0000-' || lpad(f.n::text, 12, '0'))::uuid, c.id, f.role_key
from (values (1, 'admin'), (2, 'direction'), (3, 'armement'), (4, 'capitaine'), (5, 'marin')) f(n, role_key)
cross join public.companies c where c.code = 'planning-filter-fixture';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '7c926000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.planning_display_settings), 0, 'admin cannot read another company setting');
select is((public.planning_save_display_settings(true)).active_filter_enabled, true, 'admin creates and enables its company setting');
select is((public.planning_save_display_settings(false)).active_filter_enabled, false, 'admin disables the setting');
select is((select count(*)::integer from public.planning_display_settings), 1, 'admin sees only its company');

select set_config('request.jwt.claim.sub', '7c926000-0000-0000-0000-000000000002', true);
select is((select active_filter_enabled from public.planning_display_settings), false, 'Direction reads the setting');
select throws_ok($$select public.planning_save_display_settings(true)$$, '42501', 'Seul un administrateur peut modifier les réglages du Planning.', 'Direction cannot save');
with changed as (update public.planning_display_settings set active_filter_enabled = true returning *) select is(count(*)::integer, 0, 'Direction cannot bypass the RPC') from changed;

select set_config('request.jwt.claim.sub', '7c926000-0000-0000-0000-000000000003', true);
select is((select active_filter_enabled from public.planning_display_settings), false, 'Armement reads the setting');
select throws_ok($$select public.planning_save_display_settings(true)$$, '42501', 'Seul un administrateur peut modifier les réglages du Planning.', 'Armement cannot save');

select set_config('request.jwt.claim.sub', '7c926000-0000-0000-0000-000000000004', true);
select is((select count(*)::integer from public.planning_display_settings), 1, 'real Capitaine role reads only its company');
select throws_ok($$select public.planning_save_display_settings(true)$$, '42501', 'Seul un administrateur peut modifier les réglages du Planning.', 'Capitaine cannot save');
with changed as (update public.planning_display_settings set active_filter_enabled = true returning *) select is(count(*)::integer, 0, 'Capitaine cannot bypass the RPC') from changed;

select set_config('request.jwt.claim.sub', '7c926000-0000-0000-0000-000000000005', true);
select is((select count(*)::integer from public.planning_display_settings), 1, 'real Marin role reads only its company');
select throws_ok($$select public.planning_save_display_settings(true)$$, '42501', 'Seul un administrateur peut modifier les réglages du Planning.', 'Marin cannot save');
with changed as (update public.planning_display_settings set active_filter_enabled = true returning *) select is(count(*)::integer, 0, 'Marin cannot bypass the RPC') from changed;
select is((select active_filter_enabled from public.planning_display_settings), false, 'unauthorized attempts leave the setting unchanged');

select * from finish();
rollback;
