begin;
select plan(22);
select has_table('public', 'planning_crew_display_preferences');
select ok((select relrowsecurity from pg_class where oid = 'public.planning_crew_display_preferences'::regclass), 'RLS enabled');
select ok(not has_table_privilege('anon', 'public.planning_crew_display_preferences', 'SELECT'), 'anonymous read denied');
select ok(not has_function_privilege('anon', 'public.planning_save_crew_display_preferences(text,text)', 'EXECUTE'), 'anonymous save denied');
select ok(not has_table_privilege('authenticated', 'public.planning_crew_display_preferences', 'DELETE'), 'no client delete privilege');

insert into auth.users(id, email)
select ('7c390000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, 'crew-pref-' || n || '@example.invalid'
from generate_series(1,6) n;
insert into public.profiles(id, email, display_name, active_company_id)
select id, email, 'Crew preference test', (select id from public.companies where code = 'bbtm')
from auth.users where id::text like '7c390000-0000-0000-0000-%';
insert into public.company_memberships(company_id, user_id, active)
select active_company_id, id, true from public.profiles where id::text like '7c390000-0000-0000-0000-%'
on conflict (company_id, user_id) do update set active = true;
insert into public.user_roles(company_id, user_id, role_key)
select active_company_id, id, case right(id::text, 1)
  when '1' then 'admin' when '2' then 'admin' when '3' then 'direction'
  when '4' then 'armement' when '5' then 'capitaine' else 'marin' end
from public.profiles where id::text like '7c390000-0000-0000-0000-%';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7c390000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.planning_save_crew_display_preferences('last_first','function')$$, 'admin saves own preferences');
select is((select name_format from public.planning_crew_display_preferences), 'last_first', 'format persisted');
select lives_ok($$select public.planning_save_crew_display_preferences('first_last','last_name')$$, 'admin updates own preferences');
select is((select sort_order from public.planning_crew_display_preferences), 'last_name', 'sort persisted');
select throws_ok($$select public.planning_save_crew_display_preferences('bad','function')$$, '23514', null, 'invalid format rejected');
select throws_ok($$select public.planning_save_crew_display_preferences('first_last','bad')$$, '23514', null, 'invalid sort rejected');
select throws_ok($$insert into public.planning_crew_display_preferences(company_id,user_id) values(public.current_planning_company_id(),'7c390000-0000-0000-0000-000000000002')$$, '42501', null, 'cannot insert preferences for another admin');
select throws_ok($$update public.planning_crew_display_preferences set user_id = '7c390000-0000-0000-0000-000000000002'$$, '42501', null, 'cannot transfer ownership');

select set_config('request.jwt.claim.sub', '7c390000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.planning_crew_display_preferences), 0, 'second admin cannot read first admin preferences');
select lives_ok($$select public.planning_save_crew_display_preferences('last_first','period')$$, 'second admin saves independently');
select set_config('request.jwt.claim.sub', '7c390000-0000-0000-0000-000000000003', true);
select throws_ok($$select public.planning_save_crew_display_preferences('last_first','function')$$, '42501', null, 'Direction cannot save');
select is((select count(*)::integer from public.planning_crew_display_preferences), 0, 'Direction cannot read');
select set_config('request.jwt.claim.sub', '7c390000-0000-0000-0000-000000000004', true);
select throws_ok($$select public.planning_save_crew_display_preferences('last_first','function')$$, '42501', null, 'Armement cannot save');
select set_config('request.jwt.claim.sub', '7c390000-0000-0000-0000-000000000005', true);
select throws_ok($$select public.planning_save_crew_display_preferences('last_first','function')$$, '42501', null, 'Capitaine cannot save');
select set_config('request.jwt.claim.sub', '7c390000-0000-0000-0000-000000000006', true);
select throws_ok($$select public.planning_save_crew_display_preferences('last_first','function')$$, '42501', null, 'Marin cannot save');
select throws_ok($$insert into public.planning_crew_display_preferences(company_id,user_id) values(public.current_planning_company_id(),auth.uid())$$, '42501', null, 'Marin cannot bypass RPC with direct insert');
select is((select count(*)::integer from public.planning_crew_display_preferences), 0, 'Marin cannot read preferences');
select * from finish();
rollback;
