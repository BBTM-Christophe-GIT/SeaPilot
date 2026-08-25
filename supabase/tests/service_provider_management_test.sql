begin;

select plan(10);

select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.service_providers'::regclass,
      'public.service_provider_specialties'::regclass,
      'public.service_provider_contacts'::regclass
    ) and relrowsecurity
  ),
  3,
  'RLS remains enabled on every provider-management table'
);

select ok(
  has_table_privilege('authenticated', 'public.service_providers', 'INSERT, UPDATE')
  and has_table_privilege('authenticated', 'public.service_provider_specialties', 'INSERT, UPDATE')
  and has_table_privilege('authenticated', 'public.service_provider_contacts', 'INSERT, UPDATE'),
  'authenticated managers receive the Data API write grants required by RLS'
);

select ok(
  not has_table_privilege('authenticated', 'public.service_providers', 'DELETE')
  and not has_table_privilege('authenticated', 'public.service_provider_specialties', 'DELETE')
  and not has_table_privilege('authenticated', 'public.service_provider_contacts', 'DELETE'),
  'provider records cannot be physically deleted through the Data API'
);

select is(
  (
    select count(*)::integer
    from public.role_module_permissions
    where module_key = 'serviceProviders' and is_visible
  ),
  2,
  'the management page is visible by default only to admin and direction'
);

insert into auth.users (id, email)
values
  ('8a000000-0000-0000-0000-000000000001', 'provider-admin@example.invalid'),
  ('8a000000-0000-0000-0000-000000000002', 'provider-direction@example.invalid'),
  ('8a000000-0000-0000-0000-000000000003', 'provider-armement@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('8a000000-0000-0000-0000-000000000001'::uuid, 'provider-admin@example.invalid', 'Provider admin'),
    ('8a000000-0000-0000-0000-000000000002'::uuid, 'provider-direction@example.invalid', 'Provider direction'),
    ('8a000000-0000-0000-0000-000000000003'::uuid, 'provider-armement@example.invalid', 'Provider armement')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, fixture.user_id, true
from public.companies company
cross join (
  values
    ('8a000000-0000-0000-0000-000000000001'::uuid),
    ('8a000000-0000-0000-0000-000000000002'::uuid),
    ('8a000000-0000-0000-0000-000000000003'::uuid)
) fixture(user_id)
where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('8a000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('8a000000-0000-0000-0000-000000000002'::uuid, 'direction'),
    ('8a000000-0000-0000-0000-000000000003'::uuid, 'armement')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm'
on conflict (user_id, company_id, role_key) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '8a000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$insert into public.service_providers (name, category)
    values ('Provider admin fixture', 'Prestataire de Service')$$,
  'admin can create a company in its active company'
);
select lives_ok(
  $$insert into public.service_provider_specialties (company_id, provider_id, name)
    select company_id, id, 'Inspection fixture'
    from public.service_providers where name = 'Provider admin fixture'$$,
  'admin can add a specialty to its provider'
);
select lives_ok(
  $$insert into public.service_provider_contacts (company_id, provider_id, full_name, email)
    select company_id, id, 'Contact fixture', 'contact-fixture@example.invalid'
    from public.service_providers where name = 'Provider admin fixture'$$,
  'admin can add a contact with a communication channel'
);

select set_config('request.jwt.claim.sub', '8a000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$insert into public.service_providers (name, category)
    values ('Provider direction fixture', 'Approvisionnement')$$,
  'direction can create a company in its active company'
);

select set_config('request.jwt.claim.sub', '8a000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$insert into public.service_providers (name, category)
    values ('Provider forbidden fixture', 'Approvisionnement')$$,
  '42501', null,
  'armement cannot modify the management catalog'
);

reset role;
select ok(
  not has_table_privilege('anon', 'public.service_providers', 'SELECT, INSERT, UPDATE, DELETE'),
  'anonymous users have no provider catalog privilege'
);

select * from finish();
rollback;
