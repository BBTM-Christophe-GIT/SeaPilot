-- Synthetic profiles only. Recommendations must stay read-only and fit the API budget.
begin;
select plan(22);

insert into public.companies (code, name) values ('working-time-restart-test', 'Working time restart test');
insert into auth.users (id, email) values
  ('91400000-0000-0000-0000-000000000001', 'restart-sailor@example.invalid'),
('91400000-0000-0000-0000-000000000002', 'restart-other@example.invalid'),
  ('91400000-0000-0000-0000-000000000003', 'restart-captain@example.invalid');
insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id::uuid, fixture.email, fixture.name, company.id
from public.companies company cross join (values
  ('91400000-0000-0000-0000-000000000001', 'restart-sailor@example.invalid', 'Restart Sailor'),
('91400000-0000-0000-0000-000000000002', 'restart-other@example.invalid', 'Other Sailor'),
  ('91400000-0000-0000-0000-000000000003', 'restart-captain@example.invalid', 'Restart Captain')
) fixture(id, email, name)
where company.code = 'working-time-restart-test';
insert into public.user_roles (user_id, company_id, role_key)
select profile.id, profile.active_company_id,
       case when profile.email = 'restart-captain@example.invalid' then 'capitaine' else 'marin' end
from public.profiles profile where profile.email like 'restart-%@example.invalid';
insert into public.people (company_id, user_id, first_name, last_name, function_label, sailor_number, active)
select profile.active_company_id, profile.id, 'Restart', 'SAILOR',
       case when profile.email = 'restart-captain@example.invalid' then 'Capitaine' else 'Matelot' end,
       case profile.email when 'restart-sailor@example.invalid' then 'RESTART-914'
         when 'restart-captain@example.invalid' then 'RESTART-916' else 'RESTART-915' end, true
from public.profiles profile where profile.email like 'restart-%@example.invalid';
insert into public.planning_work_rest_policies (
  company_id, name, scope, effective_from, effective_to,
  max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
  min_consecutive_rest_hours, max_rest_periods_24h, night_starts_at, night_ends_at,
  max_night_work_24h, max_amplitude_hours, max_interval_between_rests_hours,
  active, created_by, updated_by
)
select company.id, 'Company restart policy', 'company', '2026-10-01', '2026-10-14',
       12, 12, 84, 84, 6, 3, '22:00', '06:00', 8, 13, 24,
       true, '91400000-0000-0000-0000-000000000001', '91400000-0000-0000-0000-000000000001'
from public.companies company where company.code = 'working-time-restart-test';

select set_config('test.restart_person_id', (select id::text from public.people where sailor_number = 'RESTART-914'), true);
select set_config('request.jwt.claim.sub', '91400000-0000-0000-0000-000000000001', true);
set local role authenticated;
-- Keep the production authenticated-role timeout; do not mask slow recommendations.
set local statement_timeout = '8s';
create temp table restart_response as
select public.working_time_phases_recommendation(
  current_setting('test.restart_person_id')::bigint,
  '[{"starts_at":"2026-10-14T07:30:00+02:00","ends_at":"2026-10-14T12:00:00+02:00"},{"starts_at":"2026-10-14T12:30:00+02:00","ends_at":"2026-10-14T15:00:00+02:00"}]'::jsonb,
  'Europe/Paris', null, null, null
) as recommendation;

select ok(not has_function_privilege('anon', 'public.working_time_phases_recommendation(bigint,jsonb,text,bigint,text,bigint)', 'EXECUTE'), 'anonymous multi-phase analysis remains denied');
select ok(not has_function_privilege('anon', 'public.working_time_interval_recommendation(bigint,timestamptz,timestamptz,text,bigint,text,bigint)', 'EXECUTE'), 'anonymous interval analysis remains denied');
select is((select (recommendation->>'phase_count')::integer from restart_response), 2, 'both disjoint periods are analysed');
select is((select recommendation->>'status' from restart_response), 'conforme', 'the company policy applies without a Planning assignment');
select ok((select recommendation->>'policy_id' is not null from restart_response), 'the response retains the authoritative policy');
select is((select (recommendation->>'work_24h_seconds')::numeric from restart_response), 25200::numeric, 'the lunch break is excluded from the seven hours of work');
select is((select (recommendation->>'work_7d_seconds')::numeric from restart_response), 25200::numeric, 'weekly work counts both phases once');
select is((select (recommendation->>'rest_24h_seconds')::numeric from restart_response), 61200::numeric, 'the rolling rest quota is unchanged');
select is((select (recommendation->>'available_24h_seconds')::numeric from restart_response), 18000::numeric, 'five hours remain under the company policy');
select is((select (recommendation->>'latest_end_at')::timestamptz from restart_response), '2026-10-14T20:00:00+02:00'::timestamptz, 'the first rolling limit still bounds the proposed end');
select is((select (recommendation->>'next_resume_at')::timestamptz from restart_response), '2026-10-14T21:00:00+02:00'::timestamptz, 'the earliest compatible restart is retained');
select is((select jsonb_array_length(recommendation->'violation_codes') from restart_response), 0, 'no compliance rule is relaxed');
select is((select count(*)::integer from public.planning_assignments where crew_person_id = current_setting('test.restart_person_id')::bigint), 0, 'the fixture has no Planning assignment');
select is((select count(*)::integer from public.working_time_intervals where person_id = current_setting('test.restart_person_id')::bigint), 0, 'analysis never persists the proposed periods');

select set_config('request.jwt.claim.sub', '91400000-0000-0000-0000-000000000003', true);
create temp table captain_restart_response as
select public.working_time_phases_recommendation(
  (select id from public.people where sailor_number = 'RESTART-916'),
  '[{"starts_at":"2026-10-14T07:30:00+02:00","ends_at":"2026-10-14T12:00:00+02:00"},{"starts_at":"2026-10-14T12:30:00+02:00","ends_at":"2026-10-14T15:00:00+02:00"}]'::jsonb,
  'Europe/Paris', null, null, null
) as recommendation;
select is((select recommendation->>'status' from captain_restart_response), 'conforme', 'a linked Capitaine profile can analyse their own periods');
select is((select recommendation from captain_restart_response), (select recommendation from restart_response), 'Marin and Capitaine profiles retain identical company-policy calculations');

select set_config('request.jwt.claim.sub', '91400000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.working_time_phases_recommendation(current_setting('test.restart_person_id')::bigint,
    '[{"starts_at":"2026-10-14T07:30:00+02:00","ends_at":"2026-10-14T12:00:00+02:00"}]'::jsonb, 'Europe/Paris', null, null, null)$$,
  '42501', 'WORKING_TIME_PERMISSION_DENIED: recommandation.', 'a different Marin cannot analyse this person'
);
select set_config('request.jwt.claim.sub', '91400000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.working_time_phases_recommendation(current_setting('test.restart_person_id')::bigint,
    '[{"starts_at":"2026-10-14T07:30:00+02:00","ends_at":"2026-10-14T12:00:00+02:00"},{"starts_at":"2026-10-14T11:30:00+02:00","ends_at":"2026-10-14T15:00:00+02:00"}]'::jsonb, 'Europe/Paris', null, null, null)$$,
  '22023', 'WORKING_TIME_PHASES_OVERLAP', 'overlapping phases remain rejected'
);

reset role;
insert into public.planning_work_rest_policies (
  company_id, name, scope, effective_from, effective_to,
  max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
  min_consecutive_rest_hours, max_rest_periods_24h, night_starts_at, night_ends_at,
  max_night_work_24h, max_amplitude_hours, max_interval_between_rests_hours,
  active, created_by, updated_by
)
select company.id, 'Future restart policy', 'company', '2026-10-15', '2026-10-31',
       12, 12, 84, 84, 18, 3, '22:00', '06:00', 8, 13, 24,
       true, '91400000-0000-0000-0000-000000000001', '91400000-0000-0000-0000-000000000001'
from public.companies company where company.code = 'working-time-restart-test';
set local role authenticated;
select is(
  (public.working_time_interval_recommendation(
    current_setting('test.restart_person_id')::bigint,
    '2026-10-14T21:00:00+02:00', '2026-10-14T23:00:00+02:00',
    'Europe/Paris', null, null, null
  )->>'next_resume_at')::timestamptz,
  '2026-10-15T17:00:00+02:00'::timestamptz,
  'restart candidates resolve the policy effective on their own date'
);
select is((select count(*)::integer from public.working_time_intervals where person_id = current_setting('test.restart_person_id')::bigint), 0, 'policy-transition analysis remains read-only');

reset role;
update public.planning_work_rest_policies set active = false
where company_id = (select id from public.companies where code = 'working-time-restart-test');
set local role authenticated;
create temp table missing_policy_response as
select public.working_time_phases_recommendation(
  current_setting('test.restart_person_id')::bigint,
  '[{"starts_at":"2026-10-14T07:30:00+02:00","ends_at":"2026-10-14T12:00:00+02:00"},{"starts_at":"2026-10-14T12:30:00+02:00","ends_at":"2026-10-14T15:00:00+02:00"}]'::jsonb,
  'Europe/Paris', null, null, null
) as recommendation;
select is((select recommendation->>'status' from missing_policy_response), 'sans_politique', 'a genuinely missing policy remains distinguishable');
select is((select (recommendation->>'phase_count')::integer from missing_policy_response), 2, 'missing-policy analysis preserves the phase count');
select * from finish();
rollback;
