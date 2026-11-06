begin;
select plan(6);

select ok(not has_function_privilege('anon', 'public.sea_operation_consumption_history()', 'EXECUTE'),
  'anonymous cannot export archived consumption');
select ok(not has_table_privilege('authenticated', 'sea_operation_private.consumption_history', 'SELECT,INSERT,UPDATE,DELETE'),
  'archive is accessible only via the company-scoped function');

insert into public.companies(code, name) values ('conso-history-other', 'Conso history other company');
insert into auth.users(id, email) values
  ('ced40000-0000-0000-0000-000000000001', 'conso-history-captain@example.invalid'),
  ('ced40000-0000-0000-0000-000000000002', 'conso-history-marin@example.invalid'),
  ('ced40000-0000-0000-0000-000000000003', 'conso-history-other@example.invalid');
insert into public.profiles(id, email, display_name, active_company_id)
select actor.id, actor.email, actor.email, company.id
from auth.users actor join public.companies company
  on company.code = case when right(actor.id::text, 1) = '3' then 'conso-history-other' else 'bbtm' end
where actor.id::text like 'ced40000-%';
insert into public.company_memberships(company_id, user_id, active)
select active_company_id, id, true from public.profiles where id::text like 'ced40000-%'
on conflict (company_id, user_id) do update set active = true;
insert into public.user_roles(user_id, company_id, role_key)
select id, active_company_id, (array['capitaine','marin','admin'])[right(id::text, 1)::integer]
from public.profiles where id::text like 'ced40000-%';

insert into sea_operation_private.consumption_history(company_id, data)
select id, '{"suroit":[],"rozel":[],"rozelGauge":[{"sourceRow":5,"cells":[42,987]}]}'::jsonb
from public.companies where code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ced40000-0000-0000-0000-000000000001', true);
select is(public.sea_operation_consumption_history()#>>'{rozelGauge,0,cells,1}', '987',
  'a real Capitaine can export the archive from their company');
select set_config('request.jwt.claim.sub', 'ced40000-0000-0000-0000-000000000002', true);
select is(public.sea_operation_consumption_history()#>>'{rozelGauge,0,sourceRow}', '5',
  'a real Marin with access to the module can export archived source rows');
select throws_ok($$delete from sea_operation_private.consumption_history$$, '42501', null,
  'a real Marin cannot write the archive');
select set_config('request.jwt.claim.sub', 'ced40000-0000-0000-0000-000000000003', true);
select is(public.sea_operation_consumption_history(), '{"suroit":[],"rozel":[],"rozelGauge":[]}'::jsonb,
  'another company cannot access the archived vessel records');

select * from finish();
rollback;
