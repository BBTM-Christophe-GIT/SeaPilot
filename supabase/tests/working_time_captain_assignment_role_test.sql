begin;
set local session authorization postgres;

select plan(22);

insert into auth.users (id, email)
values
  ('78900000-0000-0000-0000-000000000001', 'role-label-captain@example.invalid'),
  ('78900000-0000-0000-0000-000000000002', 'role-label-sailor@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('78900000-0000-0000-0000-000000000001'::uuid, 'role-label-captain@example.invalid', 'Capitaine RH'),
    ('78900000-0000-0000-0000-000000000002'::uuid, 'role-label-sailor@example.invalid', 'Marin test')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('78900000-0000-0000-0000-000000000001'::uuid, 'capitaine'),
    ('78900000-0000-0000-0000-000000000002'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.people (
  company_id, user_id, first_name, last_name, function_label, sailor_number, hired_on, active
)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name,
       fixture.function_label, fixture.sailor_number, '2026-08-01', true
from (
  values
    ('78900000-0000-0000-0000-000000000001'::uuid, 'Adrien', 'CAPITAINE RH', 'Capitaine', 'ROLE-CAPTAIN'),
    ('78900000-0000-0000-0000-000000000002'::uuid, 'Alexandre', 'MARIN TEST', 'Chef Mécanicien', 'ROLE-SAILOR')
) fixture(user_id, first_name, last_name, function_label, sailor_number)
cross join public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select company.id, 'ROLE LABEL TEST VESSEL', 'RLTV', true
from public.companies company
where company.code = 'bbtm';

insert into public.planning_assignments (
  company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on,
  starts_at, ends_at, assignment_role, status_label, confirmation_status,
  watch_group, source_label
)
select company.id, vessel.id, captain.id, fixture.crew_id,
       '2026-08-25', '2026-09-08',
       '2026-08-25 06:00:00+02'::timestamptz,
       '2026-09-08 18:00:00+02'::timestamptz,
       fixture.assignment_role, 'En Mer', fixture.confirmation_status,
       'Bordée 2', 'captain_assignment_role_test'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.acronym = 'RLTV'
join public.people captain on captain.company_id = company.id and captain.sailor_number = 'ROLE-CAPTAIN'
cross join lateral (
  select captain.id as crew_id, '2nd Capitaine'::text as assignment_role, 'confirmed'::text as confirmation_status
  union all
  select sailor.id, 'Chef Mécanicien', 'provisional'
  from public.people sailor
  where sailor.company_id = company.id and sailor.sailor_number = 'ROLE-SAILOR'
) fixture
where company.code = 'bbtm';

insert into public.working_time_profile_signatures (
  company_id, person_id, version_number, storage_bucket, storage_path,
  mime_type, file_size_bytes, sha256, valid_from
)
select company.id, person.id, 1, 'working-time-signatures',
       concat(company.id, '/', person.id, '/captain-direct-validation.png'),
       'image/png', 128,
       case when person.sailor_number = 'ROLE-CAPTAIN' then repeat('c', 64) else repeat('d', 64) end,
       '2026-08-25 00:00:00+02'::timestamptz
from public.companies company
join public.people person on person.company_id = company.id
where company.code = 'bbtm'
  and person.sailor_number in ('ROLE-CAPTAIN', 'ROLE-SAILOR');

insert into public.working_time_registers (
  company_id, person_id, period_kind, period_start, period_end, status
)
select company.id, sailor.id, 'monthly', '2026-08-01', '2026-08-31', 'draft'
from public.companies company
join public.people sailor
  on sailor.company_id = company.id
 and sailor.sailor_number = 'ROLE-SAILOR'
where company.code = 'bbtm'
on conflict (company_id, person_id, period_kind, period_start, period_end) do nothing;

select set_config('request.jwt.claim.sub', '78900000-0000-0000-0000-000000000002', true);

select is(
  public.working_time_day_context(
    (select id from public.people where sailor_number = 'ROLE-SAILOR'),
    date '2026-08-26'
  )->>'approver_person_id',
  (select id::text from public.people where sailor_number = 'ROLE-CAPTAIN'),
  'a confirmed exact HR Capitaine remains the approver when the Planning duty is 2nd Capitaine'
);

select ok(
  public.working_time_captain_matches_day(
    (select id from public.companies where code = 'bbtm'),
    (select id from public.people where sailor_number = 'ROLE-SAILOR'),
    (select id from public.people where sailor_number = 'ROLE-CAPTAIN'),
    date '2026-08-26'
  ),
  'the exact HR Capitaine matches the sailor day through vessel and watch rather than the duty label'
);

select set_config('request.jwt.claim.sub', '78900000-0000-0000-0000-000000000001', true);
select ok(
  public.working_time_captain_can_access_period(
    (select id from public.companies where code = 'bbtm'),
    (select id from public.people where sailor_number = 'ROLE-SAILOR'),
    date '2026-08-26', date '2026-08-26',
    (select id from public.vessels where acronym = 'RLTV'),
    'Bordée 2'
  ),
  'the exact HR Capitaine can access the same-watch period with a different Planning duty label'
);

select ok(
  public.working_time_actor_can_edit_day(
    (select id from public.working_time_registers
      where person_id = (select id from public.people where sailor_number = 'ROLE-SAILOR')
        and period_start = '2026-08-01'),
    date '2026-08-26'
  ),
  'the assigned exact HR Capitaine can prepare an unsubmitted sailor day'
);

select lives_ok(
  format(
    $sql$select public.save_working_time_phases(
      %s,
      '[{"starts_at":"2026-08-26T08:30:00+02:00","ends_at":"2026-08-26T12:00:00+02:00"}]'::jsonb,
      'Europe/Paris', null, null, 'Saisie préparée par le capitaine'
    )$sql$,
    (select id from public.working_time_registers
      where person_id = (select id from public.people where sailor_number = 'ROLE-SAILOR')
        and period_start = '2026-08-01')
  ),
  'the assigned Captain can persist the sailor phases before validation'
);

select lives_ok(
  format(
    $sql$select public.submit_working_time_day(%s, date '2026-08-26')$sql$,
    (select id from public.working_time_registers
      where person_id = (select id from public.people where sailor_number = 'ROLE-SAILOR')
        and period_start = '2026-08-01')
  ),
  'the assigned Captain can submit and validate the compliant sailor day atomically'
);

select is(
  (select approval.status
   from public.working_time_day_approvals approval
   where approval.person_id = (select id from public.people where sailor_number = 'ROLE-SAILOR')
     and approval.local_work_date = '2026-08-26'),
  'validated',
  'the Captain-prepared compliant day is closed immediately'
);

select is(
  (select approval.subject_signature_snapshot->>'apposition_mode'
   from public.working_time_day_approvals approval
   where approval.person_id = (select id from public.people where sailor_number = 'ROLE-SAILOR')
     and approval.local_work_date = '2026-08-26'),
  'assigned_captain',
  'the subject signature snapshot records the on-behalf apposition mode'
);

select is(
  (select (approval.subject_signature_snapshot->>'signer_person_id')::bigint
   from public.working_time_day_approvals approval
   where approval.person_id = (select id from public.people where sailor_number = 'ROLE-SAILOR')
     and approval.local_work_date = '2026-08-26'),
  (select id from public.people where sailor_number = 'ROLE-SAILOR'),
  'the frozen subject signature still belongs to the sailor'
);

select ok(
  exists (
    select 1
    from public.working_time_day_approvals approval
    where approval.person_id = (select id from public.people where sailor_number = 'ROLE-SAILOR')
      and approval.local_work_date = '2026-08-26'
      and approval.submitted_by_person_id = (select id from public.people where sailor_number = 'ROLE-CAPTAIN')
      and approval.validated_by_person_id = (select id from public.people where sailor_number = 'ROLE-CAPTAIN')
      and (approval.approver_signature_snapshot->>'signer_person_id')::bigint =
        (select id from public.people where sailor_number = 'ROLE-CAPTAIN')
  ),
  'the audit identifies the Captain as both apposition actor and validator'
);

select throws_ok(
  format(
    $sql$select public.discard_working_time_draft(%s)$sql$,
    (select id from public.working_time_registers
      where person_id = (select id from public.people where sailor_number = 'ROLE-SAILOR')
        and period_start = '2026-08-01')
  ),
  '55000',
  'WORKING_TIME_DRAFT_DISCARD_FORBIDDEN.',
  'the Captain cannot discard a monthly draft once a day has entered the approval workflow'
);

select is(
  (select count(*)::integer
   from public.working_time_intervals work_interval
   where work_interval.register_id = (
     select id from public.working_time_registers
     where person_id = (select id from public.people where sailor_number = 'ROLE-SAILOR')
       and period_start = '2026-08-01'
   )
     and work_interval.local_work_date = '2026-08-26'
     and work_interval.voided_at is null),
  1,
  'the protected Captain workflow keeps every recorded interval intact'
);

select throws_ok(
  format(
    'select public.void_working_time_interval(%s, null)',
    (select work_interval.id from public.working_time_intervals work_interval
     join public.people sailor on sailor.id = work_interval.person_id
     where sailor.sailor_number = 'ROLE-SAILOR' and work_interval.local_work_date = '2026-08-26')
  ),
  '42501', 'WORKING_TIME_PERMISSION_DENIED: journee verrouillee.',
  'the assigned Captain cannot withdraw a validated interval without a reason'
);

-- Exercise an open work date as the real PostgREST roles. The earlier fixtures
-- use historical dates and the postgres test-session calendar exception.
select set_config('test.correction_date', timezone('Europe/Paris', now())::date::text, true);

insert into public.planning_work_rest_policies (
  company_id, vessel_id, name, scope, effective_from,
  max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
  min_consecutive_rest_hours, max_rest_periods_24h, night_starts_at, night_ends_at, max_night_work_24h,
  max_amplitude_hours, max_interval_between_rests_hours, include_handover, active
)
select vessel.company_id, vessel.id, 'Captain correction policy', 'vessel', current_setting('test.correction_date')::date,
       12, 10, 84, 77, 6, 4, '22:00', '06:00', 8, 14, 14, false, true
from public.vessels vessel
where vessel.acronym = 'RLTV';

insert into public.planning_assignments (
  company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on,
  starts_at, ends_at, assignment_role, status_label, confirmation_status,
  watch_group, source_label
)
select company.id, vessel.id, captain.id, crew.id, work_date, work_date,
       work_date::timestamp at time zone 'Europe/Paris',
       (work_date + 1)::timestamp at time zone 'Europe/Paris',
       crew.function_label, 'En Mer', 'confirmed',
       'Bordée 2', 'captain_optional_correction_test'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.acronym = 'RLTV'
join public.people captain on captain.company_id = company.id and captain.sailor_number = 'ROLE-CAPTAIN'
join public.people crew on crew.company_id = company.id and crew.sailor_number in ('ROLE-CAPTAIN', 'ROLE-SAILOR')
cross join lateral (select current_setting('test.correction_date')::date as work_date) day
where company.code = 'bbtm';

insert into public.working_time_registers (company_id, person_id, period_kind, period_start, period_end)
select sailor.company_id, sailor.id, 'monthly', month_start,
       (month_start + interval '1 month' - interval '1 day')::date
from public.people sailor
cross join lateral (select date_trunc('month', current_setting('test.correction_date')::date)::date as month_start) month
where sailor.sailor_number = 'ROLE-SAILOR'
on conflict (company_id, person_id, period_kind, period_start, period_end) do nothing;

select set_config('test.correction_register', register.id::text, true),
       set_config('test.correction_sailor', sailor.id::text, true)
from public.working_time_registers register
join public.people sailor on sailor.id = register.person_id
where sailor.sailor_number = 'ROLE-SAILOR'
  and register.period_kind = 'monthly'
  and current_setting('test.correction_date')::date between register.period_start and register.period_end;

set local session authorization authenticator;
set local role authenticated;
select is(session_user::text, 'authenticator', 'correction and withdrawal use the real API session identity');
select is(
  public.working_time_day_context(current_setting('test.correction_sailor')::bigint,
    current_setting('test.correction_date')::date)->>'actor_can_edit_day',
  'true', 'the same-watch Captain can edit the Marin draft'
);
select throws_ok(
  $$select public.save_working_time_interval(
    current_setting('test.correction_register')::bigint,
    (current_setting('test.correction_date')::date + time '04:00') at time zone 'Europe/Paris',
    (current_setting('test.correction_date')::date + time '20:00') at time zone 'Europe/Paris',
    'Europe/Paris')$$,
  '23514', 'WORKING_TIME_ALERT_COMMENT_REQUIRED.',
  'a new period with a compliance alert still requires a comment'
);
select set_config('test.correction_interval', public.save_working_time_interval(
  current_setting('test.correction_register')::bigint,
  (current_setting('test.correction_date')::date + time '08:00') at time zone 'Europe/Paris',
  (current_setting('test.correction_date')::date + time '09:00') at time zone 'Europe/Paris',
  'Europe/Paris', null, null, 'Saisie initiale')::text, true);
select lives_ok(
  $$select public.save_working_time_interval(
    current_setting('test.correction_register')::bigint,
    (current_setting('test.correction_date')::date + time '04:00') at time zone 'Europe/Paris',
    (current_setting('test.correction_date')::date + time '20:00') at time zone 'Europe/Paris',
    'Europe/Paris', null, null, null, current_setting('test.correction_interval')::bigint)$$,
  'the Captain can correct an existing period without a comment even when it has a compliance alert'
);

reset role;
reset session authorization;
update public.planning_assignments assignment
set watch_group = 'Bordée distincte'
where assignment.source_label = 'captain_optional_correction_test'
  and assignment.crew_person_id = assignment.captain_person_id;
set local session authorization authenticator;
set local role authenticated;
select throws_ok(
  $$select public.void_working_time_interval(current_setting('test.correction_interval')::bigint, null)$$,
  '42501', 'WORKING_TIME_PERMISSION_DENIED: journee verrouillee.',
  'an unassigned Captain cannot use comment-free withdrawal to bypass the day scope'
);
select throws_ok(
  $$select public.save_working_time_interval(
    current_setting('test.correction_register')::bigint,
    (current_setting('test.correction_date')::date + time '08:00') at time zone 'Europe/Paris',
    (current_setting('test.correction_date')::date + time '10:00') at time zone 'Europe/Paris',
    'Europe/Paris', null, null, null, current_setting('test.correction_interval')::bigint)$$,
  '42501', 'WORKING_TIME_PERMISSION_DENIED: intervalle d''origine.',
  'an unassigned Captain cannot correct another watch’s interval'
);

reset role;
reset session authorization;
update public.planning_assignments assignment
set watch_group = 'Bordée 2'
where assignment.source_label = 'captain_optional_correction_test'
  and assignment.crew_person_id = assignment.captain_person_id;
set local session authorization authenticator;
set local role authenticated;
select is(
  public.void_working_time_interval(current_setting('test.correction_interval')::bigint, null),
  current_setting('test.correction_interval')::bigint,
  'the same-watch Captain can withdraw the existing period without giving a reason'
);
select throws_ok(
  $$select public.void_working_time_interval(current_setting('test.correction_interval')::bigint, null)$$,
  '23503', 'WORKING_TIME_INTERVAL_NOT_FOUND.',
  'a withdrawn period cannot be withdrawn a second time'
);
reset role;
reset session authorization;
select ok(
  exists (
    select 1
    from public.working_time_intervals work_interval
    join public.working_time_audit_events audit on audit.entity_kind = 'interval' and audit.entity_id = work_interval.id
    where work_interval.id = current_setting('test.correction_interval')::bigint
      and work_interval.voided_at is not null
      and work_interval.voided_by = '78900000-0000-0000-0000-000000000001'
      and work_interval.void_reason = 'Retrait depuis le registre'
      and audit.action = 'update' and audit.actor_user_id = work_interval.voided_by
      and audit.before_data->>'voided_at' is null
      and audit.after_data->>'void_reason' = work_interval.void_reason
  ),
  'withdrawal retains the interval, its audit trail and the Captain actor'
);

select * from finish();

rollback;
