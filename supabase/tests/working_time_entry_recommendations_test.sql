begin;

select plan(19);

select has_function(
  'public',
  'working_time_interval_recommendation',
  array['bigint', 'timestamp with time zone', 'timestamp with time zone', 'text', 'bigint', 'text', 'bigint'],
  'the entry recommendation RPC is exposed'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.working_time_interval_recommendation(bigint,timestamptz,timestamptz,text,bigint,text,bigint)',
    'EXECUTE'
  ),
  'authenticated users may request an authoritative recommendation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.working_time_interval_recommendation(bigint,timestamptz,timestamptz,text,bigint,text,bigint)',
    'EXECUTE'
  ),
  'anonymous users cannot request recommendations'
);

insert into auth.users (id, email)
values
  ('78400000-0000-0000-0000-000000000001', 'recommendation-sailor@example.invalid'),
  ('78400000-0000-0000-0000-000000000002', 'recommendation-other@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id::uuid, fixture.email, fixture.display_name, company.id
from public.companies company
cross join (values
  ('78400000-0000-0000-0000-000000000001', 'recommendation-sailor@example.invalid', 'Marin Recommandation'),
  ('78400000-0000-0000-0000-000000000002', 'recommendation-other@example.invalid', 'Autre Marin')
) fixture(id, email, display_name)
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.id::uuid, company.id, 'marin'
from public.companies company
cross join (values
  ('78400000-0000-0000-0000-000000000001'),
  ('78400000-0000-0000-0000-000000000002')
) fixture(id)
where company.code = 'bbtm';

insert into public.people (
  company_id, user_id, first_name, last_name, function_label, sailor_number, active
)
select company.id, fixture.id::uuid, fixture.first_name, fixture.last_name,
       'Matelot', fixture.sailor_number, true
from public.companies company
cross join (values
  ('78400000-0000-0000-0000-000000000001', 'Marin', 'RECOMMANDATION', 'REC-784'),
  ('78400000-0000-0000-0000-000000000002', 'Autre', 'MARIN', 'REC-785')
) fixture(id, first_name, last_name, sailor_number)
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select company.id, 'WORKING TIME RECOMMENDATION VESSEL', 'WTR', true
from public.companies company
where company.code = 'bbtm';

insert into public.planning_assignments (
  company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at,
  assignment_role, status_label, confirmation_status, watch_group, source_label
)
select company.id, vessel.id, person.id, '2026-10-01', '2026-10-31',
       '2026-10-01 00:00:00+02'::timestamptz, '2026-10-31 23:59:59+01'::timestamptz,
       'Matelot', 'En mer', 'confirmed', 'Bordée A', 'recommendation_test'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.acronym = 'WTR'
join public.people person on person.company_id = company.id and person.sailor_number = 'REC-784'
where company.code = 'bbtm';

insert into public.planning_work_rest_policies (
  company_id, name, scope, vessel_id, effective_from, effective_to,
  max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
  min_consecutive_rest_hours, max_rest_periods_24h,
  night_starts_at, night_ends_at, max_night_work_24h,
  include_handover, active, created_by, updated_by
)
select company.id, 'Politique recommandation', 'vessel', vessel.id,
       '2026-10-01', '2026-10-31',
       12, 12, 72, 96, 6, 3, '22:00', '06:00', 8,
       false, true, profile.id, profile.id
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.acronym = 'WTR'
join public.profiles profile on profile.id = '78400000-0000-0000-0000-000000000001'
where company.code = 'bbtm';

insert into public.working_time_registers (
  company_id, person_id, period_kind, period_start, period_end, created_by
)
select company.id, person.id, 'weekly', '2026-10-01', '2026-10-07', person.user_id
from public.companies company
join public.people person on person.company_id = company.id and person.sailor_number = 'REC-784'
where company.code = 'bbtm';

insert into public.working_time_intervals (
  company_id, register_id, person_id, local_work_date, starts_at, ends_at,
  timezone_name, utc_offset_minutes, vessel_id, watch_group,
  author_user_id, author_person_id, source_type, source_record_key
)
select register.company_id, register.id, register.person_id, '2026-10-01',
       '2026-10-01 00:00:00+02', '2026-10-01 04:00:00+02',
       'Europe/Paris', 120, vessel.id, 'Bordée A',
       person.user_id, person.id, 'manual', 'recommendation-existing'
from public.working_time_registers register
join public.people person on person.id = register.person_id
join public.vessels vessel on vessel.company_id = register.company_id and vessel.acronym = 'WTR'
where register.period_kind = 'weekly' and register.period_start = '2026-10-01';

select set_config('test.wtr_person_id', (select id::text from public.people where sailor_number = 'REC-784'), true);
select set_config('test.wtr_vessel_id', (select id::text from public.vessels where acronym = 'WTR'), true);
select set_config('test.wtr_interval_id', (select id::text from public.working_time_intervals where source_record_key = 'recommendation-existing'), true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '78400000-0000-0000-0000-000000000001', true);

select is(
  (public.working_time_interval_recommendation(
    current_setting('test.wtr_person_id')::bigint,
    '2026-10-01 08:00:00+02', '2026-10-01 12:00:00+02', 'Europe/Paris',
    current_setting('test.wtr_vessel_id')::bigint, 'Bordée A', null
  )->>'available_24h_seconds')::numeric,
  14400::numeric,
  'the server returns four remaining hours over 24 hours'
);
select is(
  (public.working_time_interval_recommendation(
    current_setting('test.wtr_person_id')::bigint,
    '2026-10-01 08:00:00+02', '2026-10-01 12:00:00+02', 'Europe/Paris',
    current_setting('test.wtr_vessel_id')::bigint, 'Bordée A', null
  )->>'max_additional_seconds')::numeric,
  14400::numeric,
  'the recommended additional duration stops at the first rolling limit'
);
select is(
  (public.working_time_interval_recommendation(
    current_setting('test.wtr_person_id')::bigint,
    '2026-10-01 08:00:00+02', '2026-10-01 12:00:00+02', 'Europe/Paris',
    current_setting('test.wtr_vessel_id')::bigint, 'Bordée A', null
  )->>'latest_end_at')::timestamptz,
  '2026-10-01 16:00:00+02'::timestamptz,
  'the latest compatible end is returned as an absolute timestamp'
);
select is(
  (public.working_time_interval_recommendation(
    current_setting('test.wtr_person_id')::bigint,
    '2026-10-01 08:00:00+02', '2026-10-01 12:00:00+02', 'Europe/Paris',
    current_setting('test.wtr_vessel_id')::bigint, 'Bordée A', null
  )->>'next_resume_at')::timestamptz,
  '2026-10-01 18:00:00+02'::timestamptz,
  'the next compatible restart includes the configured consecutive rest'
);
select is(
  jsonb_array_length(public.working_time_interval_recommendation(
    current_setting('test.wtr_person_id')::bigint,
    '2026-10-01 08:00:00+02', '2026-10-01 16:00:00+02', 'Europe/Paris',
    current_setting('test.wtr_vessel_id')::bigint, 'Bordée A', null
  )->'violation_codes'),
  0,
  'equality with configured maxima and minima remains compliant'
);
select is(
  (select count(*)::integer from public.working_time_intervals where source_record_key = 'recommendation-existing'),
  1,
  'recommendation calls never persist the hypothetical interval'
);

select set_config('request.jwt.claim.sub', '78400000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.working_time_interval_recommendation(
    current_setting('test.wtr_person_id')::bigint,
    '2026-10-01 08:00:00+02', '2026-10-01 12:00:00+02', 'Europe/Paris',
    current_setting('test.wtr_vessel_id')::bigint, 'Bordée A', null
  )$$,
  '42501',
  'WORKING_TIME_PERMISSION_DENIED: recommandation.',
  'a sailor cannot simulate another person outside their scope'
);

reset role;
update public.working_time_intervals
set starts_at = '2026-10-01 18:00:00+02',
    ends_at = '2026-10-02 08:00:00+02',
    local_work_date = '2026-10-01'
where source_record_key = 'recommendation-existing';

set local role authenticated;
select set_config('request.jwt.claim.sub', '78400000-0000-0000-0000-000000000001', true);
select is(
  (public.working_time_interval_recommendation(
    current_setting('test.wtr_person_id')::bigint,
    '2026-10-02 10:00:00+02', '2026-10-02 11:00:00+02', 'Europe/Paris',
    current_setting('test.wtr_vessel_id')::bigint, 'Bordée A', null
  )->>'already_non_compliant')::boolean,
  true,
  'an existing rolling breach is detected before the tentative entry'
);
select is(
  (public.working_time_interval_recommendation(
    current_setting('test.wtr_person_id')::bigint,
    '2026-10-02 10:00:00+02', '2026-10-02 11:00:00+02', 'Europe/Paris',
    current_setting('test.wtr_vessel_id')::bigint, 'Bordée A', null
  )->>'max_additional_seconds')::numeric,
  0::numeric,
  'an already non-compliant person receives zero recommended additional work'
);
select ok(
  (public.working_time_interval_recommendation(
    current_setting('test.wtr_person_id')::bigint,
    '2026-10-02 10:00:00+02', '2026-10-02 11:00:00+02', 'Europe/Paris',
    current_setting('test.wtr_vessel_id')::bigint, 'Bordée A', null
  )->>'next_resume_at') is not null,
  'a next compatible restart is still proposed after an existing breach'
);
select is(
  (public.working_time_interval_recommendation(
    current_setting('test.wtr_person_id')::bigint,
    '2026-10-01 18:00:00+02', '2026-10-01 22:00:00+02', 'Europe/Paris',
    current_setting('test.wtr_vessel_id')::bigint, 'Bordée A',
    current_setting('test.wtr_interval_id')::bigint
  )->>'already_non_compliant')::boolean,
  false,
  'correcting an interval excludes its previous version from the baseline recommendation'
);

select has_function('public', 'working_time_phases_recommendation', array['bigint','jsonb','text','bigint','text','bigint'], 'multi-phase recommendation RPC exists');
select has_function('public', 'save_working_time_phases', array['bigint','jsonb','text','bigint','text','text'], 'atomic multi-phase save RPC exists');
select ok(not has_function_privilege('anon', 'public.save_working_time_phases(bigint,jsonb,text,bigint,text,text)', 'EXECUTE'), 'anonymous batch writes are denied');
select is(
  (public.working_time_phases_recommendation(
    current_setting('test.wtr_person_id')::bigint,
    '[{"starts_at":"2026-10-03T08:00:00+02:00","ends_at":"2026-10-03T10:00:00+02:00"},{"starts_at":"2026-10-03T14:00:00+02:00","ends_at":"2026-10-03T16:00:00+02:00"}]'::jsonb,
    'Europe/Paris', current_setting('test.wtr_vessel_id')::bigint, 'Bordée A', null
  )->>'phase_count')::integer,
  2,
  'two disjoint phases are evaluated together'
);
select is(
  cardinality(public.save_working_time_phases(
    (select id from public.working_time_registers where person_id=current_setting('test.wtr_person_id')::bigint and period_kind = 'weekly' and period_start = '2026-10-01'),
    '[{"starts_at":"2026-10-04T08:00:00+02:00","ends_at":"2026-10-04T10:00:00+02:00"},{"starts_at":"2026-10-04T14:00:00+02:00","ends_at":"2026-10-04T16:00:00+02:00"}]'::jsonb,
    'Europe/Paris', current_setting('test.wtr_vessel_id')::bigint, 'Bordée A', 'Deux quarts'
  )),
  2,
  'two disjoint phases are persisted atomically'
);

rollback;
