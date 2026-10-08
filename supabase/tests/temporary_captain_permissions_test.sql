begin;

select no_plan();

insert into auth.users (id, email)
values
  ('79300000-0000-0000-0000-000000000001', 'temporary-duty-captain@example.invalid'),
  ('79300000-0000-0000-0000-000000000002', 'temporary-duty-sailor@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('79300000-0000-0000-0000-000000000001'::uuid, 'temporary-duty-captain@example.invalid', 'Capitaine RH'),
    ('79300000-0000-0000-0000-000000000002'::uuid, 'temporary-duty-sailor@example.invalid', 'Marin test')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('79300000-0000-0000-0000-000000000001'::uuid, 'marin'),
    ('79300000-0000-0000-0000-000000000002'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.people (
  company_id, user_id, first_name, last_name, function_label, sailor_number, hired_on, active
)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name,
       fixture.function_label, fixture.sailor_number, date_trunc('month', current_date)::date, true
from (
  values
    ('79300000-0000-0000-0000-000000000001'::uuid, 'Adrien', 'CAPITAINE RH', '2nd Capitaine', 'TEMP-CAPTAIN'),
    ('79300000-0000-0000-0000-000000000002'::uuid, 'Alexandre', 'MARIN TEST', 'Chef Mécanicien', 'TEMP-SAILOR')
) fixture(user_id, first_name, last_name, function_label, sailor_number)
cross join public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select company.id, 'TEMPORARY CAPTAIN TEST VESSEL', 'TCTV', true
from public.companies company
where company.code = 'bbtm';

insert into public.planning_assignments (
  company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on,
  starts_at, ends_at, assignment_role, status_label, confirmation_status,
  watch_group, source_label
)
select company.id, vessel.id, captain.id, fixture.crew_id,
       current_date - 1, current_date + 1,
       (current_date - 1)::timestamptz,
       (current_date + 1 + time '18:00')::timestamptz,
       fixture.assignment_role, 'En Mer', fixture.confirmation_status,
       'Bordée 2', 'temporary_captain_test'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.acronym = 'TCTV'
join public.people captain on captain.company_id = company.id and captain.sailor_number = 'TEMP-CAPTAIN'
cross join lateral (
  select captain.id as crew_id, 'Capitaine'::text as assignment_role, 'confirmed'::text as confirmation_status
  union all
  select sailor.id, 'Chef Mécanicien', 'provisional'
  from public.people sailor
  where sailor.company_id = company.id and sailor.sailor_number = 'TEMP-SAILOR'
) fixture
where company.code = 'bbtm';

insert into public.working_time_profile_signatures (
  company_id, person_id, version_number, storage_bucket, storage_path,
  mime_type, file_size_bytes, sha256, valid_from
)
select company.id, person.id, 1, 'working-time-signatures',
       concat(company.id, '/', person.id, '/captain-direct-validation.png'),
       'image/png', 128,
       case when person.sailor_number = 'TEMP-CAPTAIN' then repeat('c', 64) else repeat('d', 64) end,
       (current_date - 2)::timestamptz
from public.companies company
join public.people person on person.company_id = company.id
where company.code = 'bbtm'
  and person.sailor_number in ('TEMP-CAPTAIN', 'TEMP-SAILOR');

insert into public.working_time_registers (
  company_id, person_id, period_kind, period_start, period_end, status
)
select company.id, sailor.id, 'monthly', date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 'draft'
from public.companies company
join public.people sailor
  on sailor.company_id = company.id
 and sailor.sailor_number = 'TEMP-SAILOR'
where company.code = 'bbtm'
on conflict (company_id, person_id, period_kind, period_start, period_end) do nothing;


select set_config('test.captain', (select id::text from public.people where sailor_number='TEMP-CAPTAIN'), true);
select set_config('test.sailor', (select id::text from public.people where sailor_number='TEMP-SAILOR'), true);
select set_config('test.company', (select id::text from public.companies where code='bbtm'), true);
select set_config('test.vessel', (select id::text from public.vessels where acronym='TCTV'), true);
select set_config('test.assignment', (select id::text from public.planning_assignments where crew_person_id=current_setting('test.captain')::bigint and source_label='temporary_captain_test'), true);

select set_config('request.jwt.claim.sub', '79300000-0000-0000-0000-000000000002', true);

reset role;
select is(
  public.working_time_day_context(
    current_setting('test.sailor')::bigint,
    current_date
  )->>'approver_person_id',
  current_setting('test.captain'),
  'a confirmed temporary Planning Capitaine remains the approver when the HR function is 2nd Capitaine'
);

reset role;
select ok(
  public.working_time_captain_matches_day(
    current_setting('test.company')::bigint,
    current_setting('test.sailor')::bigint,
    current_setting('test.captain')::bigint,
    current_date
  ),
  'the temporary Planning Capitaine matches the sailor day through vessel and watch rather than the duty label'
);

select set_config('request.jwt.claim.sub', '79300000-0000-0000-0000-000000000001', true);
reset role;
select ok(
  public.working_time_captain_can_access_period(
    current_setting('test.company')::bigint,
    current_setting('test.sailor')::bigint,
    current_date, current_date,
    current_setting('test.vessel')::bigint,
    'Bordée 2'
  ),
  'the temporary Planning Capitaine can access the same-watch period with a permanent HR second-captain function'
);

reset role;
select ok(
  public.working_time_actor_can_edit_day(
    (select id from public.working_time_registers
      where person_id = current_setting('test.sailor')::bigint
        and period_start = date_trunc('month', current_date)::date),
    current_date
  ),
  'the assigned temporary Planning Capitaine can prepare an unsubmitted sailor day'
);

set local role authenticated;
select lives_ok(
  format(
    $sql$select public.save_working_time_phases(
      %s,
      jsonb_build_array(jsonb_build_object('starts_at', current_date + time '08:30', 'ends_at', current_date + time '12:00')),
      'Europe/Paris', null, null, 'Saisie préparée par le capitaine'
    )$sql$,
    (select id from public.working_time_registers
      where person_id = current_setting('test.sailor')::bigint
        and period_start = date_trunc('month', current_date)::date)
  ),
  'the assigned Captain can persist the sailor phases before validation'
);

set local role authenticated;
select lives_ok(
  format(
    $sql$select public.submit_working_time_day(%s, current_date)$sql$,
    (select id from public.working_time_registers
      where person_id = current_setting('test.sailor')::bigint
        and period_start = date_trunc('month', current_date)::date)
  ),
  'the assigned Captain can submit and validate the compliant sailor day atomically'
);

reset role;
select is(
  (select approval.status
   from public.working_time_day_approvals approval
   where approval.person_id = current_setting('test.sailor')::bigint
     and approval.local_work_date = current_date),
  'validated',
  'the Captain-prepared compliant day is closed immediately'
);

reset role;
select is(
  (select approval.subject_signature_snapshot->>'apposition_mode'
   from public.working_time_day_approvals approval
   where approval.person_id = current_setting('test.sailor')::bigint
     and approval.local_work_date = current_date),
  'assigned_captain',
  'the subject signature snapshot records the on-behalf apposition mode'
);

reset role;
select is(
  (select (approval.subject_signature_snapshot->>'signer_person_id')::bigint
   from public.working_time_day_approvals approval
   where approval.person_id = current_setting('test.sailor')::bigint
     and approval.local_work_date = current_date),
  current_setting('test.sailor')::bigint,
  'the frozen subject signature still belongs to the sailor'
);

reset role;
select ok(
  exists (
    select 1
    from public.working_time_day_approvals approval
    where approval.person_id = current_setting('test.sailor')::bigint
      and approval.local_work_date = current_date
      and approval.submitted_by_person_id = current_setting('test.captain')::bigint
      and approval.validated_by_person_id = current_setting('test.captain')::bigint
      and (approval.approver_signature_snapshot->>'signer_person_id')::bigint =
        current_setting('test.captain')::bigint
  ),
  'the audit identifies the Captain as both apposition actor and validator'
);

select throws_ok(
  format(
    $sql$select public.discard_working_time_draft(%s)$sql$,
    (select id from public.working_time_registers
      where person_id = current_setting('test.sailor')::bigint
        and period_start = date_trunc('month', current_date)::date)
  ),
  '55000',
  'WORKING_TIME_DRAFT_DISCARD_FORBIDDEN.',
  'the Captain cannot discard a monthly draft once a day has entered the approval workflow'
);

reset role;
select is(
  (select count(*)::integer
   from public.working_time_intervals work_interval
   where work_interval.register_id = (
     select id from public.working_time_registers
     where person_id = current_setting('test.sailor')::bigint
       and period_start = date_trunc('month', current_date)::date
   )
     and work_interval.local_work_date = current_date
     and work_interval.voided_at is null),
  1,
  'the protected Captain workflow keeps every recorded interval intact'
);


-- Role changes do not create authority outside the effective assignment.
reset role;
select ok(not public.working_time_captain_can_access_period(
  current_setting('test.company')::bigint, current_setting('test.sailor')::bigint,
  current_date + 2, current_date + 3), 'no Captain authority beyond the assignment');
select ok(not public.working_time_captain_can_access_period(
  current_setting('test.company')::bigint, current_setting('test.sailor')::bigint,
  current_date, current_date, current_setting('test.vessel')::bigint, 'Other watch'),
  'another watch remains inaccessible');
select is(public.working_time_day_context(current_setting('test.captain')::bigint,current_date)->>'approver_person_id',
  current_setting('test.captain'), 'temporary Captain is their own approver');
select is(public.working_time_entry_context(current_date,current_date)->>'can_act_as_captain', 'true',
  'Marin UI receives the effective Captain capability');
select is((select person->>'functionLabel' from jsonb_array_elements(public.dpr_entry_context(current_date,current_setting('test.vessel')::bigint)->'people') person
  where (person->>'id')::bigint=current_setting('test.captain')::bigint), 'Capitaine', 'DPR reflects the temporary duty');

reset role;
update public.planning_assignments set assignment_role='2nd Capitaine' where id=current_setting('test.assignment')::bigint;
insert into public.planning_days(company_id,person_id,vessel_id,work_date,function_label,sailor_status,slot365,source_label)
values(current_setting('test.company')::bigint,current_setting('test.captain')::bigint,current_setting('test.vessel')::bigint,
  current_date,'Capitaine','En Mer','assignment:'||current_setting('test.assignment'),'seapilot-assignment-note');

select ok(public.working_time_captain_matches_day(current_setting('test.company')::bigint,current_setting('test.sailor')::bigint,
  current_setting('test.captain')::bigint,current_date),'daily Captain override grants same-watch authority');
reset role;
select ok(not public.working_time_captain_matches_day(current_setting('test.company')::bigint,current_setting('test.sailor')::bigint,
  current_setting('test.captain')::bigint,current_date+1),'daily override does not leak to following day');
reset role;
update public.planning_days set function_label='2nd Capitaine' where slot365='assignment:'||current_setting('test.assignment') and source_label='seapilot-assignment-note';
update public.planning_assignments set assignment_role='Capitaine' where id=current_setting('test.assignment')::bigint;

select ok(not public.working_time_captain_matches_day(current_setting('test.company')::bigint,current_setting('test.sailor')::bigint,
  current_setting('test.captain')::bigint,current_date),'daily non-Captain override takes precedence over the period');

reset role;
delete from public.planning_days where slot365='assignment:'||current_setting('test.assignment') and source_label='seapilot-assignment-note';
select set_config('request.jwt.claim.sub', '', true);
insert into public.dpr_reports(company_id,report_date,vessel_id,issuer_user_id,issuer_name_snapshot,created_by,created_at,status,description,unlisted_project_name)
values(current_setting('test.company')::bigint,current_date,current_setting('test.vessel')::bigint,
  '79300000-0000-0000-0000-000000000002','Temporary Captain fixture','79300000-0000-0000-0000-000000000002',now()-interval '10 days','draft','Test','Navire à quai');
select set_config('test.dpr',(select id::text from public.dpr_reports where issuer_name_snapshot='Temporary Captain fixture'),true);

select set_config('request.jwt.claim.sub', '79300000-0000-0000-0000-000000000001', true);
select ok(public.dpr_user_can_manage_report(current_setting('test.dpr')::bigint), 'Marin acting as Captain can manage an older crew DPR');
set local role authenticated;
select is((select count(*)::integer from public.dpr_reports where id=current_setting('test.dpr')::bigint),1,'DPR RLS exposes the crew report within the temporary scope');
select ok((select public.dpr_report_can_manage(report) from public.dpr_reports report where id=current_setting('test.dpr')::bigint),'computed DPR capability matches writes');
set local role authenticated;
select lives_ok('select public.dpr_validate('||current_setting('test.dpr')||')','temporary Captain validates a crew DPR');

reset role;
update public.planning_assignments set confirmation_status='provisional' where id=current_setting('test.assignment')::bigint;

select ok(not public.working_time_captain_matches_day(current_setting('test.company')::bigint,current_setting('test.sailor')::bigint,
  current_setting('test.captain')::bigint,current_date),'provisional Captain assignment grants no authority');
set local role authenticated;
select is((select count(*)::integer from public.dpr_reports where id=current_setting('test.dpr')::bigint),0,'DPR RLS removes temporary access when assignment is unconfirmed');
reset role;
update public.planning_assignments set confirmation_status='cancelled' where id=current_setting('test.assignment')::bigint;

select ok(not public.working_time_captain_matches_day(current_setting('test.company')::bigint,current_setting('test.sailor')::bigint,
  current_setting('test.captain')::bigint,current_date),'cancelled Captain assignment grants no authority');

reset role;
update public.planning_assignments set confirmation_status='confirmed',status_label='Repos' where id=current_setting('test.assignment')::bigint;

select ok(not public.working_time_captain_matches_day(current_setting('test.company')::bigint,current_setting('test.sailor')::bigint,
  current_setting('test.captain')::bigint,current_date),'rest day grants no Captain authority');
reset role;
update public.planning_assignments set status_label='En Mer' where id=current_setting('test.assignment')::bigint;
update public.user_roles set role_key='capitaine' where user_id='79300000-0000-0000-0000-000000000001';

select ok(public.working_time_captain_matches_day(current_setting('test.company')::bigint,current_setting('test.sailor')::bigint,
  current_setting('test.captain')::bigint,current_date),'Capitaine application role also honors the temporary duty of an HR second-captain');
reset role;

-- The pending-day validation path also accepts the temporary Captain.
update public.working_time_day_approvals set status='submitted', validated_at=null,
  validated_by=null, validated_by_person_id=null
where person_id=current_setting('test.sailor')::bigint and local_work_date=current_date;
set local role authenticated;
select lives_ok(format('select public.validate_working_time_day(%s)',
  (select id from public.working_time_day_approvals where person_id=current_setting('test.sailor')::bigint and local_work_date=current_date)),
  'temporary Captain validates an already submitted sailor day');

reset role;
insert into public.working_time_registers(company_id,person_id,period_kind,period_start,period_end,status)
values(current_setting('test.company')::bigint,current_setting('test.captain')::bigint,'monthly',
  date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date,'draft')
on conflict (company_id,person_id,period_kind,period_start,period_end) do nothing;
select set_config('test.own_register',(select id::text from public.working_time_registers where person_id=current_setting('test.captain')::bigint),true);
set local role authenticated;
select lives_ok(format($sql$select public.save_working_time_phases(%s,
  jsonb_build_array(jsonb_build_object('starts_at',current_date+time '08:00','ends_at',current_date+time '12:00')),
  'Europe/Paris',null,null,null)$sql$,current_setting('test.own_register')::bigint),'temporary Captain records their own hours');
select lives_ok('select public.submit_working_time_day('||current_setting('test.own_register')||',current_date)',
  'temporary Captain signs and approves their own compliant day');
select is((select status from public.working_time_day_approvals where register_id=current_setting('test.own_register')::bigint and local_work_date=current_date),
  'validated','temporary Captain own day is validated');

reset role;
update public.people set function_label='Capitaine' where id=current_setting('test.captain')::bigint;
update public.planning_assignments set assignment_role='2nd Capitaine' where id=current_setting('test.assignment')::bigint;
select ok(public.working_time_captain_matches_day(current_setting('test.company')::bigint,current_setting('test.sailor')::bigint,
  current_setting('test.captain')::bigint,current_date),'permanent HR Captain keeps existing authority with another onboard duty');

select * from finish();

rollback;
