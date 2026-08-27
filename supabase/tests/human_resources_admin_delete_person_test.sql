begin;

select plan(4);

insert into auth.users (id, email)
values
  ('71000000-0000-0000-0000-000000000001', 'hr-delete-admin@example.invalid'),
  ('71000000-0000-0000-0000-000000000002', 'hr-delete-direction@example.invalid'),
  ('71000000-0000-0000-0000-000000000003', 'hr-delete-armement@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('71000000-0000-0000-0000-000000000001'::uuid, 'hr-delete-admin@example.invalid', 'HR Delete Admin'),
    ('71000000-0000-0000-0000-000000000002'::uuid, 'hr-delete-direction@example.invalid', 'HR Delete Direction'),
    ('71000000-0000-0000-0000-000000000003'::uuid, 'hr-delete-armement@example.invalid', 'HR Delete Armement')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('71000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('71000000-0000-0000-0000-000000000002'::uuid, 'direction'),
    ('71000000-0000-0000-0000-000000000003'::uuid, 'armement')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.people (company_id, first_name, last_name, active)
select id, 'Personne', 'SUPPRIMABLE', true
from public.companies
where code = 'bbtm'
returning id;

select set_config(
  'test.hr_delete_person_id',
  (select id::text from public.people where first_name = 'Personne' and last_name = 'SUPPRIMABLE'),
  false
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select is_empty(
  $$delete from public.people where id = current_setting('test.hr_delete_person_id')::bigint returning id$$,
  'Direction cannot delete a person'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
select is_empty(
  $$delete from public.people where id = current_setting('test.hr_delete_person_id')::bigint returning id$$,
  'Armement cannot delete a person'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select results_eq(
  $$delete from public.people where id = current_setting('test.hr_delete_person_id')::bigint returning id$$,
  $$values (current_setting('test.hr_delete_person_id')::bigint)$$,
  'an Administrator can delete a person'
);

select ok(
  position('has_role' in (
    select qual
    from pg_policies
    where schemaname = 'public'
      and tablename = 'people'
      and policyname = 'people_company_admin_delete'
  )) > 0
  and position('admin' in (
    select qual
    from pg_policies
    where schemaname = 'public'
      and tablename = 'people'
      and policyname = 'people_company_admin_delete'
  )) > 0,
  'the people DELETE policy explicitly requires the Administrator role'
);

select * from finish();
rollback;
