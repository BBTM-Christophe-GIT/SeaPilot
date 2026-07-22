begin;

select plan(27);

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

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.dpr_create_draft(current_date, target_description => 'Marin draft')$$,
  'marin can create a draft'
);
select is(
  (select issuer_name_snapshot from public.dpr_reports where description = 'Marin draft'),
  'DPR Marin',
  'issuer is derived from the authenticated profile'
);
select is(
  (select dpr_number from public.dpr_reports where description = 'Marin draft'),
  null::bigint,
  'draft has no chronological number'
);
select lives_ok(
  $$select public.dpr_update_draft(
      (select id from public.dpr_reports where description = 'Marin draft'),
      current_date,
      target_description => 'Marin updated draft'
    )$$,
  'marin can update own draft'
);
select lives_ok(
  $$select public.dpr_submit((select id from public.dpr_reports where description = 'Marin updated draft'))$$,
  'marin can submit own draft'
);
select ok(
  (select dpr_number is not null from public.dpr_reports where description = 'Marin updated draft'),
  'submission allocates a number'
);
select throws_ok(
  $$select public.dpr_validate((select id from public.dpr_reports where description = 'Marin updated draft'))$$,
  '42501', 'Insufficient permission to validate this DPR', 'marin cannot validate'
);
select is(
  (select count(*)::integer from public.dpr_reports where company_id = (select id from public.companies where code = 'dpr-other')),
  0,
  'marin cannot read another company DPR'
);

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.dpr_validate((select id from public.dpr_reports where description = 'Marin updated draft'))$$,
  'captain can validate every company DPR including another author'
);
select lives_ok(
  $$select public.dpr_reopen((select id from public.dpr_reports where description = 'Marin updated draft'), 'Correction required')$$,
  'captain can reopen a validated DPR'
);
select is(
  (select version_no from public.dpr_reports where description = 'Marin updated draft'),
  2,
  'reopening creates the next version'
);
select throws_ok(
  $$select public.dpr_soft_delete((select id from public.dpr_reports where description = 'Marin updated draft'), 'Forbidden')$$,
  '42501', 'Insufficient permission to delete this DPR', 'captain cannot delete logically'
);

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.dpr_create_draft(current_date, target_description => 'Admin draft')$$, 'admin can create');
select lives_ok(
  $$select public.dpr_soft_delete((select id from public.dpr_reports where description = 'Admin draft'), 'Duplicate draft')$$,
  'admin can delete logically'
);
select ok((select deleted_at is not null from public.dpr_reports where description = 'Admin draft'), 'logical deletion keeps the row');
select lives_ok(
  $$select public.dpr_restore((select id from public.dpr_reports where description = 'Admin draft'), 'Restore test')$$,
  'admin can restore logically deleted DPR'
);
select ok((select deleted_at is null from public.dpr_reports where description = 'Admin draft'), 'restoration clears deletion fields');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.dpr_update_draft(
      (select id from public.dpr_reports where description = 'Admin draft'),
      current_date,
      target_description => 'Marin tamper'
    )$$,
  '42501', 'Insufficient permission to update this DPR draft', 'marin cannot update another author draft'
);
select throws_ok(
  $$insert into public.dpr_reports (report_date, issuer_name_snapshot) values (current_date, 'Bypass')$$,
  '42501', null, 'direct insert cannot bypass workflow RPC'
);
select throws_ok(
  $$delete from public.dpr_reports where description = 'Marin updated draft'$$,
  '42501', null, 'physical deletion is denied'
);

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.dpr_reports where description = 'Marin updated draft'), 1, 'direction reads company DPR');
select lives_ok($$select public.dpr_create_draft(current_date, target_description => 'Direction draft')$$, 'direction can create');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.dpr_reports where description = 'Marin updated draft'), 1, 'armement reads company DPR');
select lives_ok($$select public.dpr_create_draft(current_date, target_description => 'Armement draft')$$, 'armement can create');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000006', true);
select is((select count(*)::integer from public.dpr_reports where dpr_number = 990001), 1, 'other company admin reads own DPR');
select is((select count(*)::integer from public.dpr_reports where description = 'Marin updated draft'), 0, 'other company admin cannot read BBTM DPR');

select set_config('request.jwt.claim.sub', '70000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.dpr_audit_events where dpr_id = (select id from public.dpr_reports where description = 'Marin updated draft')), 5, 'create update submit validate reopen audit events are append-only');

select * from finish();
rollback;
