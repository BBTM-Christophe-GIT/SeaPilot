-- Verify direct table and notification scopes with the same session identity as PostgREST.
begin;

insert into public.companies(code, name) values
  ('pharmacy-rls-a', 'Pharmacy RLS A'), ('pharmacy-rls-b', 'Pharmacy RLS B');

insert into public.vessels(company_id, name, acronym, active, asset_kind)
select c.id, f.name, f.acronym, f.active, 'vessel'
from (values
  ('pharmacy-rls-a', 'Pharmacy RLS Assigned', 'PRA', true),
  ('pharmacy-rls-a', 'Pharmacy RLS Unassigned', 'PRU', true),
  ('pharmacy-rls-a', 'Pharmacy RLS Inactive', 'PRI', false),
  ('pharmacy-rls-b', 'Pharmacy RLS Other company', 'PRO', true)
) f(company, name, acronym, active)
join public.companies c on c.code = f.company;

select set_config('test.pharmacy_assigned', (select id::text from public.vessels where name = 'Pharmacy RLS Assigned'), true);
select set_config('test.pharmacy_unassigned', (select id::text from public.vessels where name = 'Pharmacy RLS Unassigned'), true);
select set_config('test.pharmacy_other', (select id::text from public.vessels where name = 'Pharmacy RLS Other company'), true);

insert into auth.users(id, email)
select id, 'pharmacy-rls-' || n || '@example.invalid'
from generate_series(1, 4) n
cross join lateral (select ('9e210000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid id) fixture;

insert into public.profiles(id, email, display_name, active_company_id)
select u.id, u.email, 'Pharmacy RLS fixture', c.id
from auth.users u
join public.companies c on c.code = 'pharmacy-rls-a'
where u.id::text like '9e210000-0000-4000-8000-%';

insert into public.company_memberships(company_id, user_id, active)
select active_company_id, id, true
from public.profiles where id::text like '9e210000-0000-4000-8000-%'
union all
select id, '9e210000-0000-4000-8000-000000000001'::uuid, true
from public.companies where code = 'pharmacy-rls-b'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles(user_id, company_id, role_key)
select user_id, company_id, case right(user_id::text, 1)
  when '2' then 'capitaine' when '3' then 'marin' else 'admin' end
from public.company_memberships where user_id::text like '9e210000-0000-4000-8000-%';

update public.company_memberships set active = false
where user_id = '9e210000-0000-4000-8000-000000000004';

with crew as (
  insert into public.people(company_id, user_id, first_name, last_name, function_label, sailor_number, active)
  select active_company_id, id, 'Pharmacy', 'RLS fixture',
    case right(id::text, 1) when '2' then 'Capitaine' else 'Matelot' end,
    'PHARM-RLS-' || right(id::text, 1), true
  from public.profiles
  where id in ('9e210000-0000-4000-8000-000000000002', '9e210000-0000-4000-8000-000000000003')
  returning id, company_id, function_label
)
insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, assignment_role, confirmation_status)
select company_id, current_setting('test.pharmacy_assigned')::bigint, id,
  (current_timestamp at time zone 'Europe/Paris')::date - 1,
  (current_timestamp at time zone 'Europe/Paris')::date + 1, function_label, 'confirmed'
from crew;

insert into public.pharmacy_inventory(company_id, vessel_id, designation, expires_on, expiry_precision, source_file)
select company_id, id, 'Pharmacy RLS fixture', (current_timestamp at time zone 'Europe/Paris')::date + 30, 'day', 'pharmacy-rls-fixture'
from public.vessels where name like 'Pharmacy RLS %';

insert into public.pharmacy_controls(company_id, vessel_id, expires_on, storage_path, file_name, file_size, mime_type, revision, created_by)
select company_id, id, (current_timestamp at time zone 'Europe/Paris')::date - 1,
  'pharmacy-rls-fixture/' || id, 'Control.pdf', 100, 'application/pdf', 1, '9e210000-0000-4000-8000-000000000001'
from public.vessels where name like 'Pharmacy RLS %';

create function pg_temp.assert_pharmacy_scope(expected_direct bigint[], expected_alerts bigint[])
returns void language plpgsql security invoker as $$
begin
  expected_direct := array(select id from unnest(expected_direct) id order by id);
  expected_alerts := array(select id from unnest(expected_alerts) id order by id);
  assert session_user = 'authenticator' and current_user = 'authenticated', 'Use an authenticated API session';
  assert array(select vessel_id from public.pharmacy_inventory where source_file = 'pharmacy-rls-fixture' order by vessel_id)
    = expected_direct, 'Inventory scope differs';
  assert array(select vessel_id from public.pharmacy_controls where storage_path like 'pharmacy-rls-fixture/%' order by vessel_id)
    = expected_direct, 'Control scope differs';
  assert array(select vessel_id from public.pharmacy_notifications()
    where vessel_name like 'Pharmacy RLS %' and kind = 'item' and days_until_expiry = 30 order by vessel_id)
    = expected_alerts, 'Inventory notification scope differs';
  assert array(select vessel_id from public.pharmacy_notifications()
    where vessel_name like 'Pharmacy RLS %' and kind = 'control' and days_until_expiry = -1 order by vessel_id)
    = expected_alerts, 'Control notification scope differs';
end;
$$;
grant execute on function pg_temp.assert_pharmacy_scope(bigint[], bigint[]) to authenticated;

set local session authorization authenticator;
set local role authenticated;

do $roles$
declare
  assigned bigint := current_setting('test.pharmacy_assigned')::bigint;
  unassigned bigint := current_setting('test.pharmacy_unassigned')::bigint;
  uid uuid;
begin
  -- Dual membership keeps reads in the active company. The notification
  -- RPC additionally joins the existing active-company-scoped vessels table.
  perform set_config('request.jwt.claim.sub', '9e210000-0000-4000-8000-000000000001', true);
  perform pg_temp.assert_pharmacy_scope(array[assigned, unassigned], array[assigned, unassigned]);

  foreach uid in array array['9e210000-0000-4000-8000-000000000002'::uuid, '9e210000-0000-4000-8000-000000000003'::uuid]
  loop
    perform set_config('request.jwt.claim.sub', uid::text, true);
    perform pg_temp.assert_pharmacy_scope(array[assigned], array[assigned]);
  end loop;

  perform set_config('request.jwt.claim.sub', '9e210000-0000-4000-8000-000000000004', true);
  perform pg_temp.assert_pharmacy_scope('{}', '{}');

  perform set_config('request.jwt.claim.sub', '', true);
  perform pg_temp.assert_pharmacy_scope('{}', '{}');
end;
$roles$;

reset role;
reset session authorization;
update public.role_module_permissions set is_visible = false where role_key = 'marin' and module_key = 'pharmacy';

set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claim.sub', '9e210000-0000-4000-8000-000000000003', true);
select pg_temp.assert_pharmacy_scope('{}', '{}');

reset role;
reset session authorization;
update public.profiles set active_company_id = (select id from public.companies where code = 'pharmacy-rls-b')
where id = '9e210000-0000-4000-8000-000000000001';

set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claim.sub', '9e210000-0000-4000-8000-000000000001', true);
select pg_temp.assert_pharmacy_scope(array[current_setting('test.pharmacy_other')::bigint], array[current_setting('test.pharmacy_other')::bigint]);

rollback;
