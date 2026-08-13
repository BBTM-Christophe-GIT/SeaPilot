begin;

select plan(32);

insert into public.companies (code, name)
values ('dpr-other', 'DPR other company');

insert into auth.users (id, email)
values
  ('70000000-0000-0000-0000-000000000001', 'dpr-admin@example.invalid'),
  ('70000000-0000-0000-0000-000000000002', 'dpr-direction@example.invalid'),
  ('70000000-0000-0000-0000-000000000003', 'dpr-armement@example.invalid'),
  ('70000000-0000-0000-0000-000000000004', 'dpr-capitaine@example.invalid'),
  ('70000000-0000-0000-0000-000000000005', 'dpr-marin@example.invalid'),
  ('70000000-0000-0000-0000-000000000006', 'dpr-other-company@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('70000000-0000-0000-0000-000000000001'::uuid, 'dpr-admin@example.invalid', 'DPR Admin'),
    ('70000000-0000-0000-0000-000000000002'::uuid, 'dpr-direction@example.invalid', 'DPR Direction'),
    ('70000000-0000-0000-0000-000000000003'::uuid, 'dpr-armement@example.invalid', 'DPR Armement'),
    ('70000000-0000-0000-0000-000000000004'::uuid, 'dpr-capitaine@example.invalid', 'DPR Capitaine'),
    ('70000000-0000-0000-0000-000000000005'::uuid, 'dpr-marin@example.invalid', 'DPR Marin')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.profiles (id, email, display_name, active_company_id)
select '70000000-0000-0000-0000-000000000006', 'dpr-other-company@example.invalid', 'DPR Other', id
from public.companies where code = 'dpr-other';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('70000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('70000000-0000-0000-0000-000000000002'::uuid, 'direction'),
    ('70000000-0000-0000-0000-000000000003'::uuid, 'armement'),
    ('70000000-0000-0000-0000-000000000004'::uuid, 'capitaine'),
    ('70000000-0000-0000-0000-000000000005'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select '70000000-0000-0000-0000-000000000006', id, 'admin'
from public.companies where code = 'dpr-other';

insert into public.vessels (company_id, name, acronym)
select id, 'DPR TEST VESSEL', 'DTV'
from public.companies where code = 'bbtm';

select set_config(
  'test.dpr_vessel_id',
  (select id::text from public.vessels where name = 'DPR TEST VESSEL'),
  false
);

insert into public.dpr_reports (
  company_id, dpr_number, status, report_date, issuer_name_snapshot, source_label,
  submitted_by, submitted_at, validated_by, validated_at
)
select company.id, 990001, 'validated', current_date, 'Other company import', 'sharepoint',
       profile.id, now(), profile.id, now()
from public.companies company
join public.profiles profile on profile.active_company_id = company.id
where company.code = 'dpr-other'
limit 1;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A pure Marin can use every write step when their role has DPR module access,
-- while the report and audit history remain absent from ordinary SELECTs.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select set_config('test.dpr_marin_id', created.id::text, false),
           set_config('test.dpr_marin_issuer', created.issuer_name_snapshot, false)
    from public.dpr_create_draft(
      current_date,
      target_unlisted_project_name => 'DPR test project',
      target_vessel_id => current_setting('test.dpr_vessel_id')::bigint,
      target_description => 'Marin draft'
    ) created$$,
  'a Marin with DPR module access can create a complete draft'
);
select is(current_setting('test.dpr_marin_issuer'), 'DPR Marin', 'the RPC derives the issuer from the authenticated profile');
select is((select count(*)::integer from public.dpr_reports), 0, 'a pure Marin has no DPR history, including their own report');
select lives_ok(
  $$select public.dpr_update_draft(
      current_setting('test.dpr_marin_id')::bigint,
      current_date,
      target_unlisted_project_name => 'DPR test project',
      target_vessel_id => current_setting('test.dpr_vessel_id')::bigint,
      target_description => 'Marin updated draft'
    )$$,
  'the Marin can update the draft by its RPC identifier'
);
select lives_ok(
  $$select set_config('test.dpr_marin_number', submitted.dpr_number::text, false)
    from public.dpr_submit(current_setting('test.dpr_marin_id')::bigint) submitted$$,
  'the Marin can submit without designating a validator'
);
select isnt(current_setting('test.dpr_marin_number'), '', 'submission allocates the chronological DPR number');
select lives_ok(
  $$select set_config('test.dpr_marin_status', validated.status, false)
    from public.dpr_validate(current_setting('test.dpr_marin_id')::bigint) validated$$,
  'the Marin can validate the submitted DPR directly'
);
select is(current_setting('test.dpr_marin_status'), 'validated', 'the direct validation closes the Marin DPR');
select is((select count(*)::integer from public.dpr_reports), 0, 'the Marin still cannot browse DPR history after validation');
select is((select count(*)::integer from public.dpr_audit_events), 0, 'the Marin cannot browse DPR audit history');

-- A Capitaine with module access sees every company DPR and can run the same
-- create/submit/validate workflow without a designated-validator rule.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000004', true);
select is((select count(*)::integer from public.dpr_reports where id = current_setting('test.dpr_marin_id')::bigint), 1, 'a Capitaine sees the Marin DPR');
select lives_ok(
  $$select set_config('test.dpr_captain_id', created.id::text, false)
    from public.dpr_create_draft(
      current_date,
      target_unlisted_project_name => 'Captain project',
      target_vessel_id => current_setting('test.dpr_vessel_id')::bigint,
      target_description => 'Captain draft'
    ) created$$,
  'a Capitaine can create a DPR'
);
select lives_ok($$select public.dpr_submit(current_setting('test.dpr_captain_id')::bigint)$$, 'a Capitaine can submit their DPR');
select lives_ok($$select public.dpr_validate(current_setting('test.dpr_captain_id')::bigint)$$, 'a Capitaine can validate their DPR');
select is((select count(*)::integer from public.dpr_reports), 2, 'the Capitaine sees all company DPRs');

-- The administrator overview remains complete even when a Capitaine role exists.
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.dpr_reports), 2, 'an administrator still sees all DPRs when a Capitaine is assigned');
select lives_ok(
  $$select set_config('test.dpr_admin_id', created.id::text, false)
    from public.dpr_create_draft(current_date, target_description => 'Admin draft') created$$,
  'an administrator can create a draft'
);
select lives_ok($$select public.dpr_soft_delete(current_setting('test.dpr_admin_id')::bigint, 'Duplicate draft')$$, 'an administrator can logically delete a draft');
select lives_ok($$select public.dpr_restore(current_setting('test.dpr_admin_id')::bigint, 'Restore test')$$, 'an administrator can restore a draft');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.dpr_update_draft(current_setting('test.dpr_admin_id')::bigint, current_date, target_description => 'Marin tamper')$$,
  '42501', 'Insufficient permission to update this DPR draft',
  'a Marin cannot update another author report through the RPC'
);
select throws_ok(
  $$insert into public.dpr_reports (report_date, issuer_name_snapshot) values (current_date, 'Bypass')$$,
  '42501', null, 'direct inserts cannot bypass workflow RPCs'
);
select throws_ok(
  $$delete from public.dpr_reports where id = current_setting('test.dpr_marin_id')::bigint$$,
  '42501', null, 'physical deletion is denied'
);

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.dpr_reports), 3, 'Direction reads every company DPR');
select lives_ok($$select public.dpr_create_draft(current_date, target_description => 'Direction draft')$$, 'Direction can create a DPR');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.dpr_reports), 4, 'Armement reads every company DPR');
select lives_ok($$select public.dpr_create_draft(current_date, target_description => 'Armement draft')$$, 'Armement can create a DPR');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000006', true);
select is((select count(*)::integer from public.dpr_reports where dpr_number = 990001), 1, 'another-company administrator reads their own DPR');
select is((select count(*)::integer from public.dpr_reports where id = current_setting('test.dpr_marin_id')::bigint), 0, 'company isolation hides BBTM DPRs');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.dpr_audit_events where dpr_id = current_setting('test.dpr_marin_id')::bigint), 4, 'create, update, submit and validate are audited');
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename = 'dpr_reports' and policyname = 'dpr_reports_role_read'),
  1,
  'DPR history uses the consolidated module-aware read policy'
);
select ok(
  position('dpr_can_read_report' in (select qual from pg_policies where schemaname = 'public' and tablename = 'dpr_daily_metrics' and policyname = 'dpr_daily_metrics_company_read')) > 0,
  'DPR child history follows the report-level module access rule'
);

reset role;
update public.role_module_permissions
set is_visible = false
where role_key = 'marin' and module_key = 'dpr';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.dpr_create_draft(current_date, target_description => 'Forbidden without module')$$,
  '42501', 'Insufficient permission to create a DPR draft',
  'removing DPR module access removes the ability to enter a DPR'
);

select * from finish();
rollback;
