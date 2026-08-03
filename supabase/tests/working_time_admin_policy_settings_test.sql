begin;

select plan(9);

select ok(
  has_function_privilege(
    'authenticated',
    'public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text)',
    'EXECUTE'
  ),
  'authenticated users can invoke the controlled policy RPC'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text)',
    'EXECUTE'
  ),
  'anonymous users cannot invoke the policy RPC'
);
select ok(
  pg_get_functiondef(
    'public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text)'::regprocedure
  ) like '%has_company_role(target_company_id, array[''admin''])%',
  'the RPC checks the administrator role explicitly'
);
select ok(
  pg_get_functiondef(
    'public.save_planning_work_rest_policy(bigint,text,text,bigint,date,date,numeric,numeric,numeric,numeric,numeric,integer,time,time,numeric,boolean,boolean,text)'::regprocedure
  ) not like '%planning_user_can%',
  'delegated Planning permissions cannot grant policy administration'
);
select ok(
  (
    select bool_and(column_default is null)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planning_work_rest_policies'
      and column_name in (
        'max_work_24h', 'min_rest_24h', 'max_work_7d', 'min_rest_7d',
        'min_consecutive_rest_hours', 'max_rest_periods_24h',
        'night_starts_at', 'night_ends_at', 'max_night_work_24h'
      )
  ),
  'policy thresholds and night window have no database defaults'
);

insert into auth.users (id, email)
values
  ('77000000-0000-0000-0000-000000000001', 'policy-admin@example.invalid'),
  ('77000000-0000-0000-0000-000000000002', 'policy-direction@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('77000000-0000-0000-0000-000000000001'::uuid, 'policy-admin@example.invalid', 'Policy Admin'),
    ('77000000-0000-0000-0000-000000000002'::uuid, 'policy-direction@example.invalid', 'Policy Direction')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('77000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('77000000-0000-0000-0000-000000000002'::uuid, 'direction')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select id, 'POLICY SETTINGS TEST VESSEL', 'PST', true
from public.companies
where code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '77000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$
    select public.save_planning_work_rest_policy(
      null, 'Direction forbidden', 'company', null,
      '2031-01-01', '2031-12-31',
      12, 11, 72, 96, 6, 2, '22:00', '06:00', 8,
      true, false, 'Must not be saved'
    )
  $$,
  '42501',
  'Seul un administrateur peut gérer les politiques de travail et repos.',
  'direction cannot create a policy'
);

select set_config('request.jwt.claim.sub', '77000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$
    select public.save_planning_work_rest_policy(
      null, 'Global dated policy', 'company', null,
      '2031-01-01', '2031-12-31',
      12, 11, 72, 96, 6, 2, '22:00', '06:00', 8,
      true, false, 'Administrator configuration'
    )
  $$,
  'admin can create a dated company-wide policy'
);
select is(
  (
    select row(
      scope, vessel_id, effective_from, effective_to,
      max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
      min_consecutive_rest_hours, max_rest_periods_24h,
      night_starts_at, night_ends_at, max_night_work_24h, include_handover
    )::text
    from public.planning_work_rest_policies
    where name = 'Global dated policy'
  ),
  '(company,,2031-01-01,2031-12-31,12.00,11.00,72.00,96.00,6.00,2,22:00:00,06:00:00,8.00,t)',
  'the global policy preserves every administrator-entered setting'
);
select lives_ok(
  $$
    select public.save_planning_work_rest_policy(
      null, 'Vessel dated policy', 'vessel',
      (select id from public.vessels where name = 'POLICY SETTINGS TEST VESSEL'),
      '2032-01-01', null,
      13, 10, 78, 90, 5, 3, '21:30', '05:30', 7,
      false, false, 'Vessel configuration'
    )
  $$,
  'admin can create a dated vessel-specific policy'
);

select * from finish();
rollback;
