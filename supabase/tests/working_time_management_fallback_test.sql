begin;
set local search_path = public, extensions;
select no_plan();

insert into public.companies (code, name) values ('wt-fallback-foreign', 'Fallback foreign fixture');
create temp table wt_actors (label text, user_id uuid, role_key text, company_id bigint, person_id bigint);
insert into wt_actors (label, user_id, role_key, company_id)
select label, ('79800000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid, role_key,
  (select id from public.companies where code = case when label = 'foreign' then 'wt-fallback-foreign' else 'bbtm' end)
from (values (1, 'sailor', 'marin'), (2, 'peer', 'marin'), (3, 'captain', 'capitaine'),
  (4, 'direction', 'direction'), (5, 'admin', 'admin'), (6, 'armement', 'armement'),
  (7, 'foreign', 'direction')) f(n, label, role_key);

insert into auth.users (id, email) select user_id, label || '-wt-fallback@example.invalid' from wt_actors;
insert into public.profiles (id, email, display_name, active_company_id)
select user_id, label || '-wt-fallback@example.invalid', label, company_id from wt_actors;
insert into public.user_roles (user_id, company_id, role_key)
select user_id, company_id, role_key from wt_actors;
insert into public.people (company_id, user_id, first_name, last_name, function_label, sailor_number, hired_on, active)
select company_id, user_id, label, 'FALLBACK TEST', case when label = 'captain' then 'Capitaine' else 'Matelot' end,
  'WT-FALLBACK-' || label, '2026-09-01', true from wt_actors;
update wt_actors f set person_id = p.id from public.people p where p.user_id = f.user_id;

insert into public.working_time_profile_signatures
  (company_id, person_id, version_number, storage_bucket, storage_path, mime_type, file_size_bytes, sha256, valid_from)
select company_id, person_id, 1, 'working-time-signatures', company_id || '/' || person_id || '/fallback.png',
  'image/png', 128, repeat('a', 64), '2026-09-01' from wt_actors;

insert into public.vessels (company_id, name, acronym, active)
select company_id, 'Fallback test vessel', 'WTFB', true from wt_actors where label = 'sailor';
insert into public.planning_work_rest_policies
  (company_id, name, scope, vessel_id, effective_from, effective_to,
   max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
   min_consecutive_rest_hours, max_rest_periods_24h,
   night_starts_at, night_ends_at, max_night_work_24h, include_handover, active, created_by, updated_by)
select f.company_id, 'Fallback fixture policy', 'vessel', v.id, '2026-09-01', '2026-09-30',
  12, 10, 84, 52, 6, 6, '22:00', '06:00', 10, false, true, f.user_id, f.user_id
from wt_actors f join public.vessels v on v.company_id = f.company_id and v.acronym = 'WTFB'
where f.label = 'admin';
insert into public.planning_assignments
  (company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on, starts_at, ends_at,
   assignment_role, status_label, confirmation_status, watch_group, source_label)
select f.company_id, v.id, c.person_id, f.person_id,
  case when f.label = 'captain' then date '2026-09-08' else date '2026-09-04' end, '2026-09-08',
  case when f.label = 'captain' then '2026-09-08T00:00:00+02'::timestamptz else '2026-09-04T00:00:00+02'::timestamptz end,
  '2026-09-08T23:59:00+02', case when f.label = 'captain' then '2nd Capitaine' else 'Matelot' end,
  'En Mer', 'confirmed', 'Bordée test', 'working_time_management_fallback_test'
from wt_actors f join public.vessels v on v.company_id = f.company_id and v.acronym = 'WTFB'
cross join wt_actors c where c.label = 'captain' and f.label in ('sailor', 'captain');

insert into public.working_time_registers (company_id, person_id, period_kind, period_start, period_end, status)
select company_id, person_id, 'monthly', '2026-09-01', '2026-09-30', 'draft' from wt_actors where label = 'sailor'
on conflict (company_id, person_id, period_kind, period_start, period_end) do nothing;
create temp table wt_target as select r.id as register_id, r.person_id from public.working_time_registers r
join wt_actors f on f.person_id = r.person_id where f.label = 'sailor' and r.period_start = '2026-09-01';
grant select on wt_actors, wt_target to authenticated;

select set_config('request.jwt.claim.sub', (select user_id::text from wt_actors where label = 'sailor'), true);
set local role authenticated;
select is(public.working_time_day_context((select person_id from wt_target), '2026-09-01')->>'assignment_id',
  null::text, 'Marin can resolve a day with no Planning assignment');
select is(public.working_time_day_context((select person_id from wt_target), '2026-09-04')->>'approver_person_id',
  null::text, 'a sailor assignment with an absent captain has no daily approver');
select is(public.working_time_day_context((select person_id from wt_target), '2026-09-08')->>'approver_person_id',
  (select person_id::text from wt_actors where label = 'captain'), 'the assigned HR captain still takes priority on their actual day');

select lives_ok(format($sql$select public.save_working_time_phases(%s,
  jsonb_build_array(jsonb_build_object('starts_at', %L, 'ends_at', %L)), 'Europe/Paris', null, null, 'Travail effectif')$sql$,
  (select register_id from wt_target), '2026-09-' || lpad(d::text, 2, '0') || 'T08:00:00+02',
  '2026-09-' || lpad(d::text, 2, '0') || case when d = 7 then 'T22:00:00+02' else 'T09:00:00+02' end),
  'Marin records actual work on day ' || d) from generate_series(1, 8) d;
select lives_ok(format('select public.submit_working_time_day(%s, %L::date)',
  (select register_id from wt_target), date '2026-09-01' + d - 1),
  'Marin signs and submits day ' || d) from generate_series(1, 8) d;
select is((select count(*) from public.working_time_day_approvals where register_id = (select register_id from wt_target)
  and status = 'submitted' and approver_person_id is null), 7::bigint, 'all seven fallback days remain pending management approval');
select is((select count(*) from public.working_time_intervals where register_id = (select register_id from wt_target)
  and local_work_date < '2026-09-04' and vessel_id is null and watch_group is null),
  3::bigint, 'days without Planning retain no invented vessel or watch');

reset role;
create temp table wt_days as select local_work_date as work_date, id as approval_id
from public.working_time_day_approvals where register_id = (select register_id from wt_target);
grant select on wt_days to authenticated;
set local role authenticated;
select throws_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-01')),
  '42501', 'WORKING_TIME_PERMISSION_DENIED: validation de la journee.', 'Marin cannot approve their own fallback day');
select throws_ok(format('select public.submit_working_time_day(%s, %L::date)', (select register_id from wt_target), '2026-09-01'),
  '55000', 'WORKING_TIME_DAY_LOCKED.', 'Marin cannot resubmit and replace frozen submission evidence');
select throws_ok(format($sql$select public.save_working_time_phases(%s,
  '[{"starts_at":"2026-09-01T10:00:00+02","ends_at":"2026-09-01T11:00:00+02"}]', 'Europe/Paris')$sql$,
  (select register_id from wt_target)), '42501', 'WORKING_TIME_PERMISSION_DENIED: journee verrouillee.',
  'Marin cannot change their submitted fallback day');

select set_config('request.jwt.claim.sub', (select user_id::text from wt_actors where label = 'peer'), true);
select is((select count(*) from public.working_time_day_approvals where register_id = (select register_id from wt_target)),
  0::bigint, 'another Marin cannot read the fallback approvals through RLS');
select throws_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-01')),
  '42501', 'WORKING_TIME_PERMISSION_DENIED: validation de la journee.', 'another Marin cannot exploit a NULL captain to validate');

select set_config('request.jwt.claim.sub', (select user_id::text from wt_actors where label = 'captain'), true);
select throws_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-04')),
  '42501', 'WORKING_TIME_PERMISSION_DENIED: validation de la journee.', 'a captain absent on the day cannot take the fallback approval');
select throws_ok(format('select public.submit_working_time_day(%s, %L::date)', (select register_id from wt_target), '2026-09-04'),
  '42501', 'WORKING_TIME_PERMISSION_DENIED: contexte planning.', 'an absent captain cannot sign on behalf of the sailor');

select set_config('request.jwt.claim.sub', (select user_id::text from wt_actors where label = 'foreign'), true);
select is((select count(*) from public.working_time_day_approvals where register_id = (select register_id from wt_target)),
  0::bigint, 'management of another company cannot read fallback days');
select throws_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-01')),
  '42501', 'WORKING_TIME_PERMISSION_DENIED: validation de la journee.', 'management of another company cannot validate fallback days');

select set_config('request.jwt.claim.sub', (select user_id::text from wt_actors where label = 'direction'), true);
select is((select count(*) from public.working_time_day_approvals where register_id = (select register_id from wt_target)),
  8::bigint, 'Direction reads the company approval queue through RLS');
select lives_ok(format('select public.working_time_day_context(%s, %L::date)', (select person_id from wt_target), '2026-09-01'),
  'Direction can open the fallback day context');
select lives_ok(format($sql$select public.save_working_time_phases(%s,
  '[{"starts_at":"2026-09-01T10:00:00+02","ends_at":"2026-09-01T11:00:00+02"}]', 'Europe/Paris')$sql$,
  (select register_id from wt_target)), 'Direction can correct a submitted fallback day with server compliance calculation');
select lives_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-01')),
  'Direction validates a compliant fallback day');
select throws_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-08')),
  '42501', 'WORKING_TIME_PERMISSION_DENIED: validation de la journee.', 'Direction does not take a day assigned to a captain');
select throws_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-07')),
  '23514', 'WORKING_TIME_NON_COMPLIANCE_DETAILS_REQUIRED.', 'fallback approval still requires the complete non-compliance justification');
select lives_ok(format($sql$select public.validate_working_time_day_with_comment(%s,
  'safety_emergency', 'Intervention urgente', 'Relève organisée', 'Repos compensateur planifié', 'Écart documenté')$sql$,
  (select approval_id from wt_days where work_date = '2026-09-07')), 'Direction can justify and validate a non-compliant fallback day');

select set_config('request.jwt.claim.sub', (select user_id::text from wt_actors where label = 'admin'), true);
select lives_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-02')),
  'Administrateur validates a fallback day');
select set_config('request.jwt.claim.sub', (select user_id::text from wt_actors where label = 'armement'), true);
select lives_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-03')),
  'Armement validates a fallback day');

reset role;
select ok((select subject_signature_snapshot->>'signer_person_id' = person_id::text
  and approver_signature_snapshot->>'signer_person_id' = validated_by_person_id::text
  and validated_by_person_id = (select person_id from wt_actors where label = 'direction')
  and approver_person_id is null and status = 'validated'
  from public.working_time_day_approvals where id = (select approval_id from wt_days where work_date = '2026-09-01')),
  'fallback validation freezes separate subject and real management signer evidence');
select is((select count(*) from public.working_time_day_approval_events
  where day_approval_id = (select approval_id from wt_days where work_date = '2026-09-01') and event_type = 'validated'
    and actor_person_id = (select person_id from wt_actors where label = 'direction')), 1::bigint,
  'the immutable audit identifies Direction as the actual validator');

-- A mixed Marin/Direction account still cannot approve its own submitted day.
insert into public.user_roles (user_id, company_id, role_key)
select user_id, company_id, 'direction' from wt_actors where label = 'sailor';
select set_config('request.jwt.claim.sub', (select user_id::text from wt_actors where label = 'sailor'), true);
set local role authenticated;
select throws_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-04')),
  '42501', 'WORKING_TIME_PERMISSION_DENIED: validation de la journee.', 'a management role never enables self-approval of a fallback day');
reset role;

delete from public.working_time_profile_signatures
where person_id = (select person_id from wt_actors where label = 'direction');
select set_config('request.jwt.claim.sub', (select user_id::text from wt_actors where label = 'direction'), true);
set local role authenticated;
select throws_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-05')),
  '23514', 'WORKING_TIME_ACTIVE_SIGNATURE_REQUIRED.', 'management must have an active signature');
select throws_ok(format('select public.validate_working_time_day(%s)', (select approval_id from wt_days where work_date = '2026-09-01')),
  '42501', 'WORKING_TIME_PERMISSION_DENIED: validation de la journee.', 'a validated fallback day cannot be validated again');
reset role;
select * from finish();
rollback;
