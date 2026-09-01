begin;

select plan(8);

insert into auth.users (id, email)
values ('77900000-0000-0000-0000-000000000001', 'cycle-capitaine@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select
  '77900000-0000-0000-0000-000000000001',
  'cycle-capitaine@example.invalid',
  'Capitaine Cycle',
  company.id
from public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select '77900000-0000-0000-0000-000000000001', company.id, 'capitaine'
from public.companies company
where company.code = 'bbtm';

insert into public.people (
  company_id, user_id, first_name, last_name, function_label, sailor_number, active
)
select
  company.id, '77900000-0000-0000-0000-000000000001',
  'Capitaine', 'CYCLE', 'Capitaine', 'CYCLE-779', true
from public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select company.id, 'WORK CYCLE TEST VESSEL', 'WCR', true
from public.companies company
where company.code = 'bbtm';

insert into public.planning_assignments (
  company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at,
  assignment_role, status_label, confirmation_status, watch_group, source_label
)
select
  company.id, vessel.id, person.id,
  current_date - 1, current_date - 1,
  (current_date - 1)::timestamptz, current_date::timestamptz,
  'Capitaine', 'En mer', 'confirmed', 'Bordée cycle', 'cycle_reset_test'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.acronym = 'WCR'
join public.people person on person.company_id = company.id and person.sailor_number = 'CYCLE-779'
where company.code = 'bbtm';

insert into public.planning_work_rest_policies (
  company_id, name, scope, vessel_id, effective_from, effective_to,
  max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
  min_consecutive_rest_hours, max_rest_periods_24h,
  night_starts_at, night_ends_at, max_night_work_24h,
  include_handover, active, created_by, updated_by
)
select
  company.id, 'Cycle après repos 6 h', 'vessel', vessel.id,
  current_date - 1, current_date - 1,
  12, 10, 168, 0, 6, 3, '22:00', '06:00', 24,
  false, true, profile.id, profile.id
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.acronym = 'WCR'
join public.profiles profile on profile.id = '77900000-0000-0000-0000-000000000001'
where company.code = 'bbtm';

insert into public.working_time_registers (
  company_id, person_id, period_kind, period_start, period_end, created_by
)
select
  company.id, person.id, 'monthly',
  date_trunc('month', current_date - 1)::date,
  (date_trunc('month', current_date - 1) + interval '1 month - 1 day')::date,
  person.user_id
from public.companies company
join public.people person on person.company_id = company.id and person.sailor_number = 'CYCLE-779'
where company.code = 'bbtm';

select set_config('test.cycle_person_id', (select id::text from public.people where sailor_number = 'CYCLE-779'), true);
select set_config('test.cycle_vessel_id', (select id::text from public.vessels where acronym = 'WCR'), true);
select set_config('test.cycle_register_id', (
  select id::text
  from public.working_time_registers
  where person_id = current_setting('test.cycle_person_id')::bigint
    and period_kind = 'monthly'
), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '77900000-0000-0000-0000-000000000001', true);

select lives_ok(
  format(
    $$select public.save_working_time_interval(%s, %L::timestamptz, %L::timestamptz, 'UTC', %s, 'Bordée cycle', 'Premier cycle')$$,
    current_setting('test.cycle_register_id'),
    ((current_date - 1)::text || ' 00:00:00+00'),
    ((current_date - 1)::text || ' 08:00:00+00'),
    current_setting('test.cycle_vessel_id')
  ),
  'a real HR Capitaine can record the first work phase'
);

select is(
  (public.working_time_interval_recommendation(
    current_setting('test.cycle_person_id')::bigint,
    ((current_date - 1)::text || ' 14:00:00+00')::timestamptz,
    ((current_date - 1)::text || ' 20:00:00+00')::timestamptz,
    'UTC', current_setting('test.cycle_vessel_id')::bigint, 'Bordée cycle', null
  )->>'work_24h_seconds')::numeric,
  21600::numeric,
  'the Capitaine recommendation counts only work after the completed six-hour rest'
);

select is(
  (public.working_time_interval_recommendation(
    current_setting('test.cycle_person_id')::bigint,
    ((current_date - 1)::text || ' 14:00:00+00')::timestamptz,
    ((current_date - 1)::text || ' 20:00:00+00')::timestamptz,
    'UTC', current_setting('test.cycle_vessel_id')::bigint, 'Bordée cycle', null
  )->>'available_24h_seconds')::numeric,
  21600::numeric,
  'six work hours remain available in the new twelve-hour cycle'
);

select is(
  jsonb_array_length(public.working_time_interval_recommendation(
    current_setting('test.cycle_person_id')::bigint,
    ((current_date - 1)::text || ' 14:00:00+00')::timestamptz,
    ((current_date - 1)::text || ' 20:00:00+00')::timestamptz,
    'UTC', current_setting('test.cycle_vessel_id')::bigint, 'Bordée cycle', null
  )->'violation_codes'),
  0,
  'the reset recommendation creates no non-compliance at six hours in the new cycle'
);

select is(
  (public.working_time_phases_recommendation(
    current_setting('test.cycle_person_id')::bigint,
    jsonb_build_array(
      jsonb_build_object(
        'starts_at', ((current_date - 1)::text || ' 14:00:00+00')::timestamptz,
        'ends_at', ((current_date - 1)::text || ' 16:00:00+00')::timestamptz
      ),
      jsonb_build_object(
        'starts_at', ((current_date - 1)::text || ' 18:00:00+00')::timestamptz,
        'ends_at', ((current_date - 1)::text || ' 22:00:00+00')::timestamptz
      )
    ),
    'UTC', current_setting('test.cycle_vessel_id')::bigint, 'Bordée cycle', null
  )->>'work_24h_seconds')::numeric,
  21600::numeric,
  'multi-phase recommendations use the same reset counter'
);

select lives_ok(
  format(
    $$select public.save_working_time_interval(%s, %L::timestamptz, %L::timestamptz, 'UTC', %s, 'Bordée cycle', 'Nouveau cycle')$$,
    current_setting('test.cycle_register_id'),
    ((current_date - 1)::text || ' 14:00:00+00'),
    ((current_date - 1)::text || ' 20:00:00+00'),
    current_setting('test.cycle_vessel_id')
  ),
  'the Capitaine can persist work after the completed reset rest'
);

select results_eq(
  format(
    $$select work_24h_seconds, work_24h_compliant, calculation_version
      from public.working_time_calculation_windows
      where person_id = %s
        and window_end = %L::timestamptz$$,
    current_setting('test.cycle_person_id'),
    ((current_date - 1)::text || ' 20:00:00+00')
  ),
  $$values (21600::numeric, true, 2)$$,
  'the authoritative stored calculation restarts at zero after six hours of rest'
);

select is(
  (select function_label from public.people where id = current_setting('test.cycle_person_id')::bigint),
  'Capitaine',
  'the profile-specific scenario uses the exact HR Capitaine function'
);

select * from finish();
rollback;
