begin;

select plan(19);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.project_service_catalog'::regclass),
  'RLS is enabled on the project service catalog'
);

select ok(
  has_table_privilege('authenticated', 'public.project_service_catalog', 'SELECT, INSERT, UPDATE')
  and not has_table_privilege('authenticated', 'public.project_service_catalog', 'DELETE'),
  'authenticated users receive catalog read and manager write grants without physical delete'
);

select ok(
  not has_table_privilege('anon', 'public.project_service_catalog', 'SELECT, INSERT, UPDATE, DELETE'),
  'anonymous users have no service catalog privilege'
);

select ok(
  not has_table_privilege('anon', 'public.project_service_catalog_defaults', 'SELECT, INSERT, DELETE')
  and not has_function_privilege('anon', 'public.save_project_service_catalog_entry(jsonb,bigint[],bigint)', 'EXECUTE'),
  'anonymous users cannot access or save default projects'
);

select is(
  (
    select count(*)::integer
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'project_billing_services'
      and column_name in ('service_catalog_id', 'description_html')
  ),
  2,
  'billing service lines retain their catalog reference and description snapshot'
);

insert into auth.users (id, email)
values
  ('8d000000-0000-0000-0000-000000000001', 'service-catalog-admin@example.invalid'),
  ('8d000000-0000-0000-0000-000000000002', 'service-catalog-direction@example.invalid'),
  ('8d000000-0000-0000-0000-000000000003', 'service-catalog-armement@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('8d000000-0000-0000-0000-000000000001'::uuid, 'service-catalog-admin@example.invalid', 'Service catalog admin'),
    ('8d000000-0000-0000-0000-000000000002'::uuid, 'service-catalog-direction@example.invalid', 'Service catalog direction'),
    ('8d000000-0000-0000-0000-000000000003'::uuid, 'service-catalog-armement@example.invalid', 'Service catalog armement')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, fixture.user_id, true
from public.companies company
cross join (
  values
    ('8d000000-0000-0000-0000-000000000001'::uuid),
    ('8d000000-0000-0000-0000-000000000002'::uuid),
    ('8d000000-0000-0000-0000-000000000003'::uuid)
) fixture(user_id)
where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('8d000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('8d000000-0000-0000-0000-000000000002'::uuid, 'direction'),
    ('8d000000-0000-0000-0000-000000000003'::uuid, 'armement')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm'
on conflict (user_id, company_id, role_key) do nothing;

with fixtures as (
  insert into public.projects (company_id, title, source_label)
  select company.id, fixture.title, 'seapilot'
  from public.companies company
  cross join (values ('Service catalog project A'), ('Service catalog project B')) as fixture(title)
  where company.code = 'bbtm'
  returning id
)
select set_config('test.catalog_project_ids', array_agg(id order by id)::text, true) from fixtures;

with foreign_company as (
  insert into public.companies (code, name) values ('service-catalog-fixture', 'Service catalog fixture') returning id
), foreign_project as (
  insert into public.projects (company_id, title, source_label)
  select id, 'Service catalog foreign project', 'seapilot' from foreign_company
  returning id
)
select set_config('test.foreign_catalog_project_id', id::text, true) from foreign_project;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '8d000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$insert into public.project_service_catalog (category, unit_amount_ht, description_html)
    values ('Mobilisation matériel', 450, '<p>Forfait de préparation.</p>')$$,
  'admin can add a service category'
);

select throws_ok(
  $$insert into public.project_service_catalog (category, unit_amount_ht)
    values ('mobilisation MATÉRIEL', 500)$$,
  '23505', null,
  'active categories are unique without case sensitivity inside the company'
);

select is(
  (select count(*)::integer from public.project_service_catalog_defaults),
  0,
  'a catalog entry starts with no default projects'
);

select lives_ok(
  $$select public.save_project_service_catalog_entry(
      '{"category":"Projet et prestation ajoutés ensemble","unit_amount_ht":450}'::jsonb,
      current_setting('test.catalog_project_ids')::bigint[]
    )$$,
  'an administrator can create a catalog entry with multiple default projects atomically'
);

select is(
  (select count(*)::integer from public.project_service_catalog_defaults),
  2,
  'both default projects are stored'
);

select set_config('request.jwt.claim.sub', '8d000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$update public.project_service_catalog
    set unit_amount_ht = 475
    where category = 'Mobilisation matériel'$$,
  'direction can update a service category'
);

select throws_ok(
  $$select public.save_project_service_catalog_entry(
      '{"category":"Projet et prestation ajoutés ensemble","unit_amount_ht":999,"vessel_name":"","description_html":"","active":true}'::jsonb,
      array[current_setting('test.foreign_catalog_project_id')::bigint],
      (select id from public.project_service_catalog where category = 'Projet et prestation ajoutés ensemble')
    )$$,
  '23503', null,
  'a default project must belong to the catalog entry company'
);

select ok(
  (select unit_amount_ht = 450 from public.project_service_catalog where category = 'Projet et prestation ajoutés ensemble')
  and (select count(*) = 2 from public.project_service_catalog_defaults),
  'a failed assignment rolls back fields and previous defaults together'
);

select set_config('request.jwt.claim.sub', '8d000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*)::integer from public.project_service_catalog_defaults),
  0,
  'a catalog reader cannot see configured project associations'
);

select set_config('request.jwt.claim.sub', '8d000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.save_project_service_catalog_entry(
      '{"category":"Projet et prestation ajoutés ensemble","unit_amount_ht":450,"vessel_name":"","description_html":"","active":true}'::jsonb,
      '{}'::bigint[],
      (select id from public.project_service_catalog where category = 'Projet et prestation ajoutés ensemble')
    )$$,
  'direction can clear every default project'
);

select is(
  (select count(*)::integer from public.project_service_catalog_defaults),
  0,
  'cleared assignments no longer propose the catalog service'
);

select set_config('request.jwt.claim.sub', '8d000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$insert into public.project_service_catalog (category, unit_amount_ht)
    values ('Catégorie refusée', 100)$$,
  '42501', null,
  'armement cannot change the service catalog'
);

select throws_ok(
  $$insert into public.project_service_catalog_defaults (company_id, service_catalog_id, project_id)
    select company_id, id, (current_setting('test.catalog_project_ids')::bigint[])[1]
    from public.project_service_catalog where category = 'Projet et prestation ajoutés ensemble'$$,
  '42501', null,
  'a catalog reader cannot assign a default project'
);

select is(
  (select count(*)::integer from public.project_service_catalog where category = 'Mobilisation matériel'),
  1,
  'company members can read the active service catalog'
);

select * from finish();
rollback;
