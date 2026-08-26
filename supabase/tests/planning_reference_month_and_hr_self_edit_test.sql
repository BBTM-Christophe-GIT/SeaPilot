begin;

select plan(12);

select ok(
  to_regprocedure('public.add_planning_board_row_for_month(bigint,text,bigint,date)') is not null,
  'the month-aware Planning row RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'public.add_planning_board_row_for_month(bigint,text,bigint,date)', 'EXECUTE'),
  'authenticated users can invoke the guarded month-aware Planning RPC'
);
select ok(
  not has_function_privilege('anon', 'public.add_planning_board_row_for_month(bigint,text,bigint,date)', 'EXECUTE'),
  'anonymous users cannot invoke the month-aware Planning RPC'
);
select ok(
  to_regprocedure('public.update_own_hr_profile(bigint,jsonb)') is not null,
  'the HR self-service RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'public.update_own_hr_profile(bigint,jsonb)', 'EXECUTE'),
  'authenticated users can invoke the guarded HR self-service RPC'
);
select ok(
  not has_function_privilege('anon', 'public.update_own_hr_profile(bigint,jsonb)', 'EXECUTE'),
  'anonymous users cannot invoke the HR self-service RPC'
);

insert into auth.users (id, email)
values
  ('74000000-0000-0000-0000-000000000101', 'reference-month-armement@example.invalid'),
  ('74000000-0000-0000-0000-000000000102', 'reference-month-sailor@example.invalid'),
  ('74000000-0000-0000-0000-000000000103', 'reference-month-captain@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('74000000-0000-0000-0000-000000000101'::uuid, 'reference-month-armement@example.invalid', 'Reference month armement'),
    ('74000000-0000-0000-0000-000000000102'::uuid, 'reference-month-sailor@example.invalid', 'Reference month sailor'),
    ('74000000-0000-0000-0000-000000000103'::uuid, 'reference-month-captain@example.invalid', 'Reference month captain')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('74000000-0000-0000-0000-000000000101'::uuid, 'armement'),
    ('74000000-0000-0000-0000-000000000102'::uuid, 'marin'),
    ('74000000-0000-0000-0000-000000000103'::uuid, 'capitaine')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select id, 'REFERENCE MONTH TEST VESSEL', 'RMT', true
from public.companies
where code = 'bbtm';

insert into public.people (
  company_id, user_id, first_name, last_name, function_label, hired_on, departed_on, active
)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name,
       fixture.function_label, fixture.hired_on, fixture.departed_on, false
from (
  values
    (
      '74000000-0000-0000-0000-000000000102'::uuid,
      'Loic', 'REFERENCE', 'Matelot polyvalent', '2024-07-01'::date, '2025-12-02'::date
    ),
    (
      '74000000-0000-0000-0000-000000000103'::uuid,
      'Camille', 'CAPITAINE', 'Capitaine', '2020-01-01'::date, null::date
    )
) fixture(user_id, first_name, last_name, function_label, hired_on, departed_on)
cross join public.companies company
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '74000000-0000-0000-0000-000000000101', true);

select lives_ok(
  $$
    select public.add_planning_board_row_for_month(
      (select id from public.vessels where name = 'REFERENCE MONTH TEST VESSEL'),
      'Affectation',
      (select id from public.people where user_id = '74000000-0000-0000-0000-000000000102'),
      '2025-01-01'
    )
  $$,
  'a historical sailor can be added when employment overlaps the selected month'
);

select is(
  (
    select count(*)::integer
    from public.planning_board_rows row
    join public.people person on person.id = row.person_id
    where person.user_id = '74000000-0000-0000-0000-000000000102'
      and row.watch_group = 'Affectation'
  ),
  1,
  'the historical Planning row is persisted once'
);

select throws_ok(
  $$
    select public.add_planning_board_row_for_month(
      (select id from public.vessels where name = 'REFERENCE MONTH TEST VESSEL'),
      'Affectation',
      (select id from public.people where user_id = '74000000-0000-0000-0000-000000000102'),
      '2026-01-01'
    )
  $$,
  '22023',
  'PLANNING_VALIDATION: les dates d''emploi du marin ne couvrent pas le mois de référence.',
  'a sailor outside the selected month remains rejected'
);

select set_config('request.jwt.claim.sub', '74000000-0000-0000-0000-000000000102', true);
select is(
  (
    public.update_own_hr_profile(
      (select id from public.people where user_id = '74000000-0000-0000-0000-000000000102'),
      '{"first_name":"Loic","last_name":"REFERENCE","phone":"+33 6 00 00 00 01"}'::jsonb
    )
  ).phone,
  '+33 6 00 00 00 01',
  'a Marin can update its own linked HR record'
);

select throws_ok(
  $$
    select public.update_own_hr_profile(
      (select id from public.people where user_id = '74000000-0000-0000-0000-000000000103'),
      '{"first_name":"Camille","last_name":"CAPITAINE"}'::jsonb
    )
  $$,
  '42501',
  'HR_PERMISSION_DENIED: modification de la fiche personnelle.',
  'a Marin cannot update another HR record'
);

select set_config('request.jwt.claim.sub', '74000000-0000-0000-0000-000000000103', true);
select is(
  (
    public.update_own_hr_profile(
      (select id from public.people where user_id = '74000000-0000-0000-0000-000000000103'),
      '{"first_name":"Camille","last_name":"CAPITAINE","phone":"+33 6 00 00 00 03"}'::jsonb
    )
  ).phone,
  '+33 6 00 00 00 03',
  'a Captain can update its own linked HR record'
);

select * from finish();
rollback;
