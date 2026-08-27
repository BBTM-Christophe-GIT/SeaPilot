begin;

select plan(10);

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

select * from finish();

rollback;
