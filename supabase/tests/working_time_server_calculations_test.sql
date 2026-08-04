begin;

select plan(30);

select has_table(
  'public',
  'working_time_calculation_windows',
  'server-side rolling calculation windows are stored'
);
select has_column('public', 'working_time_calculation_windows', 'work_24h_seconds', '24-hour work is stored');
select has_column('public', 'working_time_calculation_windows', 'rest_24h_seconds', '24-hour rest is stored');
select has_column('public', 'working_time_calculation_windows', 'longest_rest_24h_seconds', 'consecutive rest is stored');
select has_column('public', 'working_time_calculation_windows', 'rest_period_count_24h', 'rest periods are stored');
select has_column('public', 'working_time_calculation_windows', 'work_7d_seconds', 'seven-day work is stored');
select has_column('public', 'working_time_calculation_windows', 'rest_7d_seconds', 'seven-day rest is stored');
select has_column('public', 'working_time_calculation_windows', 'night_work_24h_seconds', 'night work is stored');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.working_time_calculation_windows'::regclass),
  'RLS protects calculated windows'
);
select ok(
  has_table_privilege('authenticated', 'public.working_time_calculation_windows', 'SELECT'),
  'authenticated users may read server results through RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.working_time_calculation_windows', 'INSERT'),
  'the browser cannot inject calculated aggregates'
);
select ok(
  not has_table_privilege('authenticated', 'public.working_time_calculation_windows', 'UPDATE'),
  'the browser cannot alter calculated aggregates'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'private.working_time_recalculate_person(bigint,timestamptz,timestamptz)',
    'EXECUTE'
  ),
  'the internal recalculation function is not exposed to authenticated users'
);

insert into auth.users (id, email)
values ('78000000-0000-0000-0000-000000000001', 'working-time-calculation@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select
  '78000000-0000-0000-0000-000000000001',
  'working-time-calculation@example.invalid',
  'Marin Calcul',
  company.id
from public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select '78000000-0000-0000-0000-000000000001', company.id, 'marin'
from public.companies company
where company.code = 'bbtm';

insert into public.people (
  company_id, user_id, first_name, last_name, function_label, sailor_number, active
)
select company.id, '78000000-0000-0000-0000-000000000001',
       'Marin', 'CALCUL', 'Matelot', 'CAL-780', true
from public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select company.id, 'WORKING TIME CALCULATION VESSEL', 'WTC', true
from public.companies company
where company.code = 'bbtm';

insert into public.planning_work_rest_policies (
  company_id, name, scope, vessel_id, effective_from, effective_to,
  max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
  min_consecutive_rest_hours, max_rest_periods_24h,
  night_starts_at, night_ends_at, max_night_work_24h,
  include_handover, active, created_by, updated_by
)
select company.id, 'Politique de test aux limites', 'vessel', vessel.id,
       '2026-08-01', '2026-08-31',
       12, 12, 12, 156, 6, 2, '22:00', '06:00', 8,
       true, true, profile.id, profile.id
from public.companies company
join public.vessels vessel
  on vessel.company_id = company.id and vessel.acronym = 'WTC'
join public.profiles profile
  on profile.active_company_id = company.id
 and profile.id = '78000000-0000-0000-0000-000000000001'
where company.code = 'bbtm';

insert into public.working_time_registers (
  company_id, person_id, period_kind, period_start, period_end, created_by
)
select company.id, person.id, 'weekly', '2026-08-03', '2026-08-09', person.user_id
from public.companies company
join public.people person
  on person.company_id = company.id and person.sailor_number = 'CAL-780'
where company.code = 'bbtm';

select lives_ok(
  $$
    insert into public.working_time_intervals (
      company_id, register_id, person_id, local_work_date, starts_at, ends_at,
      timezone_name, utc_offset_minutes, vessel_id, watch_group,
      author_user_id, author_person_id, source_type, source_record_key
    )
    select register.company_id, register.id, register.person_id,
           fixture.local_work_date, fixture.starts_at, fixture.ends_at,
           'Europe/Paris', 120, vessel.id, 'Bordée calcul',
           person.user_id, person.id, 'manual', fixture.source_record_key
    from public.working_time_registers register
    join public.people person on person.id = register.person_id
    join public.vessels vessel
      on vessel.company_id = register.company_id and vessel.acronym = 'WTC'
    cross join (
      values
        ('2026-08-03'::date, '2026-08-03 20:00:00+02'::timestamptz,
         '2026-08-04 04:00:00+02'::timestamptz, 'calculation-a'),
        ('2026-08-03'::date, '2026-08-03 23:00:00+02'::timestamptz,
         '2026-08-04 06:00:00+02'::timestamptz, 'calculation-b'),
        ('2026-08-04'::date, '2026-08-04 12:00:00+02'::timestamptz,
         '2026-08-04 14:00:00+02'::timestamptz, 'calculation-c')
    ) fixture(local_work_date, starts_at, ends_at, source_record_key)
  $$,
  'overlapping and overnight intervals are accepted as raw facts'
);

select is(
  (select count(*)::integer from public.working_time_intervals where source_record_key like 'calculation-%'),
  3,
  'all source intervals are preserved without browser-side consolidation'
);
select is(
  (select work_24h_seconds from public.working_time_calculation_windows
   where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'),
  43200::numeric,
  'overlapping intervals are merged to twelve worked hours in the rolling 24-hour window'
);
select is(
  (select rest_24h_seconds from public.working_time_calculation_windows
   where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'),
  43200::numeric,
  'rest is the exact complement of merged work over 24 hours'
);
select is(
  (select longest_rest_24h_seconds from public.working_time_calculation_windows
   where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'),
  21600::numeric,
  'the longest consecutive rest is calculated across interval gaps'
);
select is(
  (select rest_period_count_24h from public.working_time_calculation_windows
   where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'),
  2,
  'positive rest gaps are counted once'
);
select results_eq(
  $$
    select work_7d_seconds, rest_7d_seconds, night_work_24h_seconds
    from public.working_time_calculation_windows
    where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'
  $$,
  $$values (43200::numeric, 561600::numeric, 28800::numeric)$$,
  'seven-day work/rest and configured night work are calculated on the server'
);
select ok(
  (select is_compliant from public.working_time_calculation_windows
   where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'),
  'values exactly equal to every configured boundary remain compliant'
);

update public.working_time_intervals
set ends_at = '2026-08-04 08:00:00+02'::timestamptz
where source_record_key = 'calculation-b';

select results_eq(
  $$
    select work_24h_seconds, rest_24h_seconds, work_7d_seconds, rest_7d_seconds
    from public.working_time_calculation_windows
    where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'
  $$,
  $$values (50400::numeric, 36000::numeric, 50400::numeric, 554400::numeric)$$,
  'changing an interval automatically recalculates every affected rolling window'
);
select is(
  (select is_compliant from public.working_time_calculation_windows
   where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'),
  false,
  'only a strict threshold breach creates a non-conformity'
);
select is(
  (select array_to_string(violation_codes, ',') from public.working_time_calculation_windows
   where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'),
  'work_24h,rest_24h,work_7d,rest_7d',
  'server results identify each breached rolling quota'
);

select is(
  (select work_seconds from private.working_time_window_metrics(
    (select id from public.people where sailor_number = 'CAL-780'),
    '2026-07-28 20:00:00+02'::timestamptz,
    '2026-08-04 20:00:00+02'::timestamptz,
    'Europe/Paris', null, null
  )),
  50400::numeric,
  'an exact seven-day rolling window is calculated across a month boundary'
);
select is(
  (select work_seconds from private.working_time_window_metrics(
    (select id from public.people where sailor_number = 'CAL-780'),
    '2026-08-04 08:00:00+02'::timestamptz,
    '2026-08-11 08:00:00+02'::timestamptz,
    'Europe/Paris', null, null
  )),
  7200::numeric,
  'work ending exactly at the seven-day boundary is not double counted'
);
select isnt(
  (select rest_24h_seconds from public.working_time_calculation_windows
   where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'),
  (select longest_rest_24h_seconds from public.working_time_calculation_windows
   where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'),
  'total rest and longest consecutive rest remain distinct metrics'
);

update public.planning_work_rest_policies
set max_work_24h = 14,
    min_rest_24h = 10,
    max_work_7d = 14,
    min_rest_7d = 154
where name = 'Politique de test aux limites';

select ok(
  (select is_compliant from public.working_time_calculation_windows
   where window_end = '2026-08-04 20:00:00+02' and timezone_name = 'Europe/Paris'),
  'changing a policy also rebuilds the affected server evaluations'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '78000000-0000-0000-0000-000000000001', true);
select ok(
  (select count(*) > 0 from public.working_time_calculation_windows
   where person_id = public.current_person_id()),
  'the sailor may read their own server-calculated windows through RLS'
);
select throws_ok(
  $$delete from public.working_time_calculation_windows$$,
  '42501',
  null,
  'authenticated users cannot delete authoritative server calculations'
);

rollback;
