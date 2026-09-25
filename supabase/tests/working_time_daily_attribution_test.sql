begin;
set local search_path = public, extensions;
select no_plan();

-- Independent real profiles: no role-preview/session substitution.
create temp table wt_attribution_actors (label text, user_id uuid, role_key text, company_id bigint, person_id bigint);
insert into wt_attribution_actors (label, user_id, role_key, company_id)
select label, ('79925000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, role_key,
  (select id from public.companies where code = 'bbtm')
from (values (1, 'sailor', 'marin'), (2, 'peer', 'marin'), (3, 'captain', 'capitaine')) f(n, label, role_key);
insert into auth.users (id, email) select user_id, label || '-wt-attribution@example.invalid' from wt_attribution_actors;
insert into public.profiles (id, email, display_name, active_company_id)
select user_id, label || '-wt-attribution@example.invalid', label, company_id from wt_attribution_actors;
insert into public.user_roles (user_id, company_id, role_key)
select user_id, company_id, role_key from wt_attribution_actors;
insert into public.people (company_id, user_id, first_name, last_name, function_label, sailor_number, hired_on, active)
select company_id, user_id, label, 'ATTRIBUTION TEST',
  case when label = 'captain' then 'Capitaine' else 'Matelot' end,
  'WT-ATTRIBUTION-' || label, current_date - 2, true from wt_attribution_actors;
update wt_attribution_actors f set person_id = p.id from public.people p where p.user_id = f.user_id;
insert into public.working_time_profile_signatures
  (company_id, person_id, version_number, storage_bucket, storage_path, mime_type, file_size_bytes, sha256, valid_from)
select company_id, person_id, 1, 'working-time-signatures', company_id || '/' || person_id || '/attribution.png',
  'image/png', 128, repeat('a', 64), current_date - 3 from wt_attribution_actors;

insert into public.vessels (company_id, name, acronym, active)
select company_id, 'Attribution test vessel', 'WTAT', true from wt_attribution_actors where label = 'sailor';
insert into public.planning_work_rest_policies
  (company_id, name, scope, vessel_id, effective_from, effective_to,
   max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
   min_consecutive_rest_hours, max_rest_periods_24h,
   night_starts_at, night_ends_at, max_night_work_24h, include_handover, active)
select f.company_id, 'Attribution fixture policy', 'vessel', v.id, current_date - 2, current_date,
  12, 10, 84, 52, 6, 6, '22:00', '06:00', 10, false, true
from wt_attribution_actors f join public.vessels v on v.company_id = f.company_id and v.acronym = 'WTAT'
where f.label = 'sailor';
insert into public.planning_assignments
  (company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on, starts_at, ends_at,
   assignment_role, status_label, confirmation_status, watch_group, source_label)
select f.company_id, v.id, c.person_id, f.person_id,
  current_date - 2, current_date, (current_date - 2)::timestamptz, (current_date + 1)::timestamptz,
  case when f.label = 'captain' then 'Capitaine' else 'Matelot' end,
  'En Mer', 'confirmed', 'Bordée test', 'working_time_daily_attribution_test'
from wt_attribution_actors f join public.vessels v on v.company_id = f.company_id and v.acronym = 'WTAT'
cross join wt_attribution_actors c where c.label = 'captain' and f.label in ('sailor', 'captain');

grant select on wt_attribution_actors to authenticated;
select set_config('request.jwt.claim.sub', (select user_id::text from wt_attribution_actors where label = 'sailor'), true);
set local role authenticated;
create temp table wt_attribution_days as
select work_date, public.get_or_create_working_time_register(
  (select person_id from wt_attribution_actors where label = 'sailor'), 'monthly',
  date_trunc('month', work_date)::date) as register_id
from (values (current_date - 2), (current_date - 1)) d(work_date);
select lives_ok(format($sql$select public.save_working_time_phases(%s,
  jsonb_build_array(
    jsonb_build_object('starts_at', %L, 'ends_at', %L),
    jsonb_build_object('starts_at', %L, 'ends_at', %L)),
  'Europe/Paris', null, null, 'Fixture actual work')$sql$,
  register_id, work_date || 'T09:00:00+02', work_date || 'T12:30:00+02',
  work_date || 'T13:30:00+02', work_date || 'T21:30:00+02'),
  'real Marin can record work on ' || work_date) from wt_attribution_days;
select lives_ok(format('select public.submit_working_time_day(%s, %L::date)', register_id, work_date),
  'real Marin signs and submits ' || work_date) from wt_attribution_days;
reset role;
alter table wt_attribution_days add column approval_id bigint;
update wt_attribution_days d set approval_id = a.id
from public.working_time_day_approvals a where a.register_id=d.register_id and a.local_work_date=d.work_date;
grant select on wt_attribution_days to authenticated;

-- Deterministic cached windows reproduce the incident: an early-morning 5.5 h
-- rest breach before any work on the second day, followed by a compliant window.
delete from public.working_time_calculation_windows
where person_id = (select person_id from wt_attribution_actors where label = 'sailor');
insert into public.working_time_calculation_windows
  (company_id, person_id, window_end, local_window_end_date, timezone_name, vessel_id, work_rest_policy_id,
   work_24h_seconds, rest_24h_seconds, longest_rest_24h_seconds, rest_period_count_24h,
   work_7d_seconds, rest_7d_seconds, is_compliant, violation_codes)
select f.company_id, f.person_id, ((current_date - 1)::text || 'T03:00:00+02')::timestamptz,
  current_date - 1, 'Europe/Paris', v.id, p.id,
  36000, 50400, 19800, 3, 208800, 396000, false, array['consecutive_rest']
from wt_attribution_actors f join public.vessels v on v.company_id=f.company_id and v.acronym='WTAT'
join public.planning_work_rest_policies p on p.vessel_id=v.id where f.label='sailor';

select ok(public.working_time_day_has_non_compliance(register_id, work_date),
  'the previous worked day retains its required justification')
from wt_attribution_days where work_date=current_date-2;
select ok(not public.working_time_day_has_non_compliance(register_id, work_date),
  'a violation before the first shift does not block the next worked day')
from wt_attribution_days where work_date=current_date-1;
select ok(not has_function_privilege('authenticated', 'public.working_time_day_violations(bigint,date)', 'execute'),
  'the attribution helper cannot bypass RLS through the Data API');
select ok(not has_function_privilege('anon', 'public.working_time_day_violations(bigint,date)', 'execute'),
  'anonymous callers cannot access attribution details');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select user_id::text from wt_attribution_actors where label='sailor'), true);
select throws_ok(format('select public.validate_working_time_day(%s)', approval_id),
  '42501', 'WORKING_TIME_PERMISSION_DENIED: validation de la journee.', 'Marin still cannot approve their own day')
from wt_attribution_days where work_date=current_date-1;
select set_config('request.jwt.claim.sub', (select user_id::text from wt_attribution_actors where label='peer'), true);
select is((select count(*) from public.working_time_day_approvals
  where person_id=(select person_id from wt_attribution_actors where label='sailor')), 0::bigint,
  'a different Marin cannot read the submitted approvals');
select throws_ok(format('select public.validate_working_time_day(%s)', approval_id),
  '42501', 'WORKING_TIME_PERMISSION_DENIED: validation de la journee.', 'a different Marin cannot approve the day')
from wt_attribution_days where work_date=current_date-1;

select set_config('request.jwt.claim.sub', (select user_id::text from wt_attribution_actors where label='captain'), true);
select lives_ok(format('select public.validate_working_time_day(%s)', approval_id),
  'assigned real Capitaine can validate the next day without a false justification')
from wt_attribution_days where work_date=current_date-1;
select throws_ok(format('select public.validate_working_time_day(%s)', approval_id),
  '23514', 'WORKING_TIME_NON_COMPLIANCE_DETAILS_REQUIRED.',
  'the contributing day still requires the five justification fields')
from wt_attribution_days where work_date=current_date-2;
select lives_ok(format($sql$select public.validate_working_time_day_with_comment(%s,
  'unexpected_operation', 'Opération prolongée', 'Relève organisée', 'Repos planifié', 'Écart documenté')$sql$, approval_id),
  'Capitaine can document and validate the actual contributing day')
from wt_attribution_days where work_date=current_date-2;

reset role;
select is(a.status, 'validated', 'the compliant day is validated')
from public.working_time_day_approvals a join wt_attribution_days d on d.approval_id=a.id where d.work_date=current_date-1;
select is(a.non_compliance_snapshot, '[]'::jsonb, 'the compliant day freezes no unrelated violation')
from public.working_time_day_approvals a join wt_attribution_days d on d.approval_id=a.id where d.work_date=current_date-1;
select is(a.non_compliance_snapshot->0->>'local_work_date', (current_date-2)::text, 'snapshot retains the actual alarm day')
from public.working_time_day_approvals a join wt_attribution_days d on d.approval_id=a.id where d.work_date=current_date-2;
select is(a.non_compliance_snapshot->0->>'local_window_end_date', (current_date-1)::text, 'snapshot retains the later calculation date')
from public.working_time_day_approvals a join wt_attribution_days d on d.approval_id=a.id where d.work_date=current_date-2;
select ok(a.subject_signature_snapshot <> '{}'::jsonb and a.approver_signature_snapshot <> '{}'::jsonb,
  'both immutable signatures survive daily validation')
from public.working_time_day_approvals a join wt_attribution_days d on d.approval_id=a.id;

select * from finish();
rollback;
