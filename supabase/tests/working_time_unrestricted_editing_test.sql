begin;
select no_plan();

-- A superuser runner can reproduce the API session's deadline behavior. The
-- usual postgres runner keeps its documented maintenance exemption; only the
-- two deadline-specific assertions are skipped there, never authorization.
do $fixture_session$
begin
  if (select rolsuper from pg_roles where rolname = current_user) then
    execute 'set session authorization postgres';
  end if;
end;
$fixture_session$;

select ok(not has_function_privilege('anon', 'public.working_time_get_edit_settings()', 'execute'),
  'anonymous callers cannot read edit settings');
select ok(not has_function_privilege('anon', 'public.working_time_save_edit_settings(boolean)', 'execute'),
  'anonymous callers cannot enable free editing');
select ok(not has_table_privilege('authenticated', 'public.working_time_edit_settings', 'UPDATE'),
  'clients cannot change the authorized account binding');
select ok(not has_table_privilege('authenticated', 'public.working_time_intervals', 'UPDATE'),
  'free editing still uses the controlled interval RPC');

insert into auth.users (id, email) values
  ('76000000-0000-0000-0000-000000000001', 'free-edit-christophe@example.invalid'),
  ('76000000-0000-0000-0000-000000000002', 'free-edit-other-admin@example.invalid'),
  ('76000000-0000-0000-0000-000000000003', 'free-edit-sailor@example.invalid'),
  ('76000000-0000-0000-0000-000000000004', 'free-edit-captain@example.invalid');
insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.name, company.id
from (values
  ('76000000-0000-0000-0000-000000000001'::uuid, 'free-edit-christophe@example.invalid', 'Christophe MINASSIAN'),
  ('76000000-0000-0000-0000-000000000002'::uuid, 'free-edit-other-admin@example.invalid', 'Other Admin'),
  ('76000000-0000-0000-0000-000000000003'::uuid, 'free-edit-sailor@example.invalid', 'Real Marin Fixture'),
  ('76000000-0000-0000-0000-000000000004'::uuid, 'free-edit-captain@example.invalid', 'Real Capitaine Fixture')
) fixture(id, email, name) cross join public.companies company where company.code = 'bbtm';
insert into public.user_roles (user_id, company_id, role_key)
select fixture.id, company.id, fixture.role_key
from (values
  ('76000000-0000-0000-0000-000000000001'::uuid, 'admin'),
  ('76000000-0000-0000-0000-000000000002'::uuid, 'admin'),
  ('76000000-0000-0000-0000-000000000003'::uuid, 'marin'),
  ('76000000-0000-0000-0000-000000000004'::uuid, 'capitaine')
) fixture(id, role_key) cross join public.companies company where company.code = 'bbtm';
insert into public.people (company_id, user_id, first_name, last_name, function_label, sailor_number, hired_on, active)
select company.id, fixture.id, fixture.first_name, fixture.last_name, fixture.function_label,
  fixture.number, '2025-01-01', true
from (values
  ('76000000-0000-0000-0000-000000000001'::uuid, 'Christophe', 'MINASSIAN', 'Administrateur', 'FREE-CM'),
  ('76000000-0000-0000-0000-000000000002'::uuid, 'Another', 'ADMIN', 'Administrateur', 'FREE-ADMIN'),
  ('76000000-0000-0000-0000-000000000003'::uuid, 'Sam', 'MARIN', 'Matelot', 'FREE-MARIN'),
  ('76000000-0000-0000-0000-000000000004'::uuid, 'Cam', 'CAPITAINE', 'Capitaine', 'FREE-CAPTAIN')
) fixture(id, first_name, last_name, function_label, number)
cross join public.companies company where company.code = 'bbtm';

-- The test binds its own real role/profile fixture; no production account UUID
-- is used in the migration or in the request authorization.
insert into public.working_time_edit_settings (company_id, authorized_user_id)
select id, '76000000-0000-0000-0000-000000000001'::uuid from public.companies where code = 'bbtm'
on conflict (company_id) do update set authorized_user_id = excluded.authorized_user_id,
  unrestricted_editing_enabled = false;

insert into public.planning_work_rest_policies (
  company_id, name, scope, effective_from, effective_to,
  max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
  min_consecutive_rest_hours, max_rest_periods_24h,
  night_starts_at, night_ends_at, max_night_work_24h, include_handover, active
)
select id, 'Free edit fixture policy', 'company', '2025-01-01', '2025-01-31',
  12, 10, 72, 96, 6, 2, '22:00', '06:00', 8, true, true
from public.companies where code = 'bbtm';

select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000001', true);
insert into public.working_time_intervals (
  company_id, register_id, person_id, local_work_date, starts_at, ends_at,
  timezone_name, utc_offset_minutes, source_type, author_user_id, author_person_id
)
select register.company_id, register.id, register.person_id, fixture.day,
  fixture.starts_at, fixture.ends_at, 'Europe/Paris', 60, 'api',
  '76000000-0000-0000-0000-000000000001'::uuid, public.current_person_id()
from public.working_time_registers register join public.people person on person.id = register.person_id
cross join (values
  ('2025-01-10'::date, '2025-01-10 14:00+01'::timestamptz, '2025-01-10 17:30+01'::timestamptz),
  ('2025-01-11'::date, '2025-01-11 15:00+01'::timestamptz, '2025-01-11 16:00+01'::timestamptz),
  ('2025-01-12'::date, '2025-01-12 10:00+01'::timestamptz, '2025-01-12 13:30+01'::timestamptz)
) fixture(day, starts_at, ends_at)
where person.sailor_number = 'FREE-MARIN' and register.period_start = '2025-01-01';

insert into public.working_time_day_approvals (
  company_id, register_id, person_id, local_work_date, status, approver_person_id,
  submitted_by, submitted_by_person_id, submitted_at,
  validated_by, validated_by_person_id, validated_at,
  signature_snapshot, subject_signature_snapshot, approver_signature_snapshot, interval_snapshot
)
select register.company_id, register.id, register.person_id, fixture.day, fixture.status,
  (select id from public.people where sailor_number = 'FREE-CAPTAIN'),
  '76000000-0000-0000-0000-000000000003'::uuid, register.person_id, now(),
  case when fixture.status = 'validated' then '76000000-0000-0000-0000-000000000004'::uuid end,
  case when fixture.status = 'validated' then (select id from public.people where sailor_number = 'FREE-CAPTAIN') end,
  case when fixture.status = 'validated' then now() end,
  '{"proof":"old-actual-signature"}'::jsonb, '{"proof":"old-subject-signature"}'::jsonb,
  case when fixture.status = 'validated' then '{"proof":"old-approver-signature"}'::jsonb else '{}'::jsonb end,
  (select jsonb_agg(to_jsonb(work_interval)) from public.working_time_intervals work_interval
    where work_interval.register_id = register.id and work_interval.local_work_date = fixture.day)
from public.working_time_registers register join public.people person on person.id = register.person_id
cross join (values ('2025-01-10'::date, 'validated'), ('2025-01-11'::date, 'submitted')) fixture(day, status)
where person.sailor_number = 'FREE-MARIN' and register.period_start = '2025-01-01';
update public.working_time_registers set status = 'validated'
where person_id = (select id from public.people where sailor_number = 'FREE-MARIN') and period_start = '2025-01-01';

create temporary table free_edit_fixture_ids as
select register.id as register_id,
  (select id from public.working_time_intervals where register_id = register.id and local_work_date = '2025-01-10') as corrected_id,
  (select id from public.working_time_intervals where register_id = register.id and local_work_date = '2025-01-11') as voided_id,
  (select id from public.working_time_intervals where register_id = register.id and local_work_date = '2025-01-12') as unchanged_id
from public.working_time_registers register join public.people person on person.id = register.person_id
where person.sailor_number = 'FREE-MARIN' and register.period_start = '2025-01-01';
grant select on free_edit_fixture_ids to authenticated;

-- Exercise the real API role/session so postgres's legacy maintenance deadline
-- exemption cannot conceal an old-day editing regression.
reset session authorization;
do $api_session$
begin
  if (select rolsuper from pg_roles where rolname = current_user) then
    execute 'set session authorization authenticator';
  end if;
end;
$api_session$;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.working_time_get_edit_settings()->>'unrestricted_editing_enabled', 'false',
  'the switch defaults to disabled');
select is(public.working_time_get_edit_settings()->>'can_use_unrestricted_editing', 'false',
  'Christophe receives no override while disabled');
select throws_ok($$select public.save_working_time_interval(
  (select register_id from free_edit_fixture_ids), '2025-01-10 14:00+01', '2025-01-10 17:00+01',
  'Europe/Paris', null, null, null, (select corrected_id from free_edit_fixture_ids))$$,
  '42501', 'WORKING_TIME_PERMISSION_DENIED: intervalle d''origine.',
  'the signed day remains locked while the switch is disabled');
select throws_ok($$select public.save_working_time_interval(
  (select register_id from free_edit_fixture_ids), '2025-01-13 14:00+01', '2025-01-13 17:00+01',
  'Europe/Paris')$$, '42501', 'WORKING_TIME_PERMISSION_DENIED: journee verrouillee.',
  'the normal manual-entry cutoff still closes historical drafts') where session_user <> 'postgres';
select skip('postgres maintenance sessions intentionally bypass the entry cutoff') where session_user = 'postgres';

select is(public.working_time_save_edit_settings(true)->>'can_use_unrestricted_editing', 'true',
  'enabling the switch grants the bound Christophe account the override');
select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000002', true);
select is(public.working_time_get_edit_settings()->>'can_use_unrestricted_editing', 'false',
  'another administrator cannot use the Christophe-only override');
select throws_ok($$select public.save_working_time_interval(
  (select register_id from free_edit_fixture_ids), '2025-01-10 14:00+01', '2025-01-10 17:00+01',
  'Europe/Paris', null, null, null, (select corrected_id from free_edit_fixture_ids))$$,
  '42501', 'WORKING_TIME_PERMISSION_DENIED: intervalle d''origine.',
  'another administrator still cannot correct a validated day');
select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000003', true);
select is(public.working_time_get_edit_settings()->>'can_use_unrestricted_editing', 'false',
  'a real Marin account does not inherit free editing');
select throws_ok($$select public.working_time_save_edit_settings(true)$$,
  '42501', 'WORKING_TIME_PERMISSION_DENIED: administration du reglage.',
  'a Marin cannot administer the switch');
select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000004', true);
select is(public.working_time_get_edit_settings()->>'can_use_unrestricted_editing', 'false',
  'a real Capitaine account does not inherit free editing');
select throws_ok($$select public.working_time_save_edit_settings(false)$$,
  '42501', 'WORKING_TIME_PERMISSION_DENIED: administration du reglage.',
  'a Capitaine cannot administer the switch');

select set_config('request.jwt.claim.sub', '76000000-0000-0000-0000-000000000001', true);
select lives_ok($$select public.save_working_time_interval(
  (select register_id from free_edit_fixture_ids), '2025-01-10 14:00+01', '2025-01-10 17:30+01',
  'Europe/Paris', null, null, null, (select corrected_id from free_edit_fixture_ids))$$,
  'an unchanged save is accepted in free editing mode');
select is((select status from public.working_time_day_approvals
  where register_id = (select register_id from free_edit_fixture_ids) and local_work_date = '2025-01-10'),
  'validated', 'a no-op save keeps the existing signed approval valid');
select is((select count(*)::integer from public.working_time_day_approval_events
  where register_id = (select register_id from free_edit_fixture_ids) and event_type = 'unrestricted_edit_reset'),
  0, 'a no-op save does not produce an invalidation event');
select lives_ok($$select public.save_working_time_interval(
  (select register_id from free_edit_fixture_ids), '2025-01-10 14:00+01', '2025-01-10 17:00+01',
  'Europe/Paris', null, null, null, (select corrected_id from free_edit_fixture_ids))$$,
  'Christophe corrects a historical validated day without a justification or active signature');
select is((select ends_at from public.working_time_intervals where id = (select corrected_id from free_edit_fixture_ids)),
  '2025-01-10 17:00+01'::timestamptz, 'the existing interval identity receives the requested end');
select is((select status from public.working_time_day_approvals
  where register_id = (select register_id from free_edit_fixture_ids) and local_work_date = '2025-01-10'),
  'draft', 'the corrected day is unsigned rather than falsely revalidated');
select is((select subject_signature_snapshot from public.working_time_day_approvals
  where register_id = (select register_id from free_edit_fixture_ids) and local_work_date = '2025-01-10'),
  '{}'::jsonb, 'the old subject signature no longer covers the new hours');
select is((select approval_snapshot->'approver_signature_snapshot' from public.working_time_day_approval_events
  where register_id = (select register_id from free_edit_fixture_ids) and local_work_date = '2025-01-10'
    and event_type = 'unrestricted_edit_reset'), '{"proof":"old-approver-signature"}'::jsonb,
  'the exact previous approver signature survives in immutable history');
select is((select status from public.working_time_registers where id = (select register_id from free_edit_fixture_ids)),
  'reopened', 'the former monthly signed state is invalidated without fabricating a signature');
select is((select count(*)::integer from public.working_time_validations
  where register_id = (select register_id from free_edit_fixture_ids) and event_type = 'reopened'), 1,
  'the legacy monthly reopening records the actual editor once');

select lives_ok($$select public.void_working_time_interval((select voided_id from free_edit_fixture_ids), '')$$,
  'Christophe retires a submitted-day interval without a user-entered reason');
select is((select void_reason from public.working_time_intervals where id = (select voided_id from free_edit_fixture_ids)),
  'Retrait en mode modification libre', 'the recoverable removal records technical provenance');
select ok((select voided_by = auth.uid() from public.working_time_intervals where id = (select voided_id from free_edit_fixture_ids)),
  'the removal retains the actual user identity');
select is(public.working_time_interval_recommendation(
  (select id from public.people where sailor_number = 'FREE-MARIN'),
  '2025-01-13 00:00+01', '2025-01-13 23:00+01', 'Europe/Paris')->>'status',
  'non_conforme', 'the fixture actually triggers the ordinary mandatory-comment condition');
select lives_ok($$select public.save_working_time_interval(
  (select register_id from free_edit_fixture_ids), '2025-01-13 00:00+01', '2025-01-13 23:00+01',
  'Europe/Paris', null, null, null)$$,
  'a non-compliant historical interval can be recorded without justification');
select is((select comment from public.working_time_intervals where person_id =
  (select id from public.people where sailor_number = 'FREE-MARIN') and local_work_date = '2025-01-13'),
  null::text, 'free editing does not invent an operational justification');
select throws_ok($$select public.save_working_time_phases(
  (select register_id from free_edit_fixture_ids),
  '[{"starts_at":"2025-01-10T16:00:00+01:00","ends_at":"2025-01-10T18:00:00+01:00"}]'::jsonb,
  'Europe/Paris')$$, '22023', 'WORKING_TIME_PHASES_EXISTING_OVERLAP',
  'the existing phase overlap guard remains enforced');
select throws_ok($$select public.save_working_time_interval(
  (select register_id from free_edit_fixture_ids), '2025-01-14 16:00+01', '2025-01-14 15:00+01',
  'Europe/Paris')$$, '22023', 'WORKING_TIME_INTERVAL_INVALID.', 'negative-duration intervals remain invalid');
select throws_ok($$select public.save_working_time_interval(
  (select register_id from free_edit_fixture_ids), '2025-01-14 16:00+01', '2025-01-14 17:00+01',
  'Invalid/Zone')$$, '22023', 'WORKING_TIME_TIMEZONE_INVALID.', 'timezone integrity remains enforced');
select is((select ends_at from public.working_time_intervals where id = (select unchanged_id from free_edit_fixture_ids)),
  '2025-01-12 13:30+01'::timestamptz, 'unrelated intervals remain unchanged');
select ok(exists(select 1 from public.working_time_audit_events
  where entity_kind = 'interval' and entity_id = (select corrected_id from free_edit_fixture_ids)
    and action = 'update' and actor_user_id = auth.uid()
    and after_data->>'ends_at' is distinct from before_data->>'ends_at'),
  'the correction is audited with the real editor and before/after values');
select is(public.working_time_save_edit_settings(false)->>'can_use_unrestricted_editing', 'false',
  'disabling the switch removes the override immediately');
select throws_ok($$select public.save_working_time_interval(
  (select register_id from free_edit_fixture_ids), '2025-01-10 14:00+01', '2025-01-10 16:30+01',
  'Europe/Paris', null, null, null, (select corrected_id from free_edit_fixture_ids))$$,
  '42501', 'WORKING_TIME_PERMISSION_DENIED: intervalle d''origine.',
  'the normal historical-entry restriction applies again after disabling') where session_user <> 'postgres';
select skip('postgres maintenance sessions intentionally bypass the entry cutoff') where session_user = 'postgres';
select is((select count(*)::integer from public.working_time_edit_settings_events
  where actor_user_id = auth.uid()), 2, 'both switch changes retain their real actor in the audit');

reset role;
reset session authorization;
insert into public.companies (code, name, active) values ('free-edit-other', 'Other Free Edit Company', false);
insert into public.people (company_id, first_name, last_name, function_label, sailor_number, hired_on, active)
select id, 'Foreign', 'SUBJECT', 'Matelot', 'FREE-FOREIGN', '2025-01-01', true
from public.companies where code = 'free-edit-other';
create temporary table free_edit_foreign_ids as
select register.id as register_id from public.working_time_registers register
join public.people person on person.id = register.person_id
where person.sailor_number = 'FREE-FOREIGN' and register.period_start = '2025-01-01';
grant select on free_edit_foreign_ids to authenticated;
select is((select count(*)::integer from free_edit_foreign_ids where register_id is not null), 1,
  'the cross-company denial targets an existing foreign register rather than a missing ID');
do $api_session$
begin
  if (select rolsuper from pg_roles where rolname = current_user) then
    execute 'set session authorization authenticator';
  end if;
end;
$api_session$;
set local role authenticated;
select is(public.working_time_save_edit_settings(true)->>'can_use_unrestricted_editing', 'true',
  'the bound editor can enable the company switch again');
select throws_ok($$select public.save_working_time_interval(
  (select register_id from free_edit_foreign_ids), '2025-01-10 14:00+01', '2025-01-10 17:00+01', 'Europe/Paris')$$,
  '42501', 'WORKING_TIME_PERMISSION_DENIED: modification du registre.',
  'free editing cannot cross company boundaries');
reset role;
reset session authorization;
select throws_ok($$update public.working_time_day_approval_events set approval_snapshot = '{}'::jsonb
  where event_type = 'unrestricted_edit_reset' and register_id = (select register_id from free_edit_fixture_ids)$$,
  '55000', 'WORKING_TIME_IMMUTABLE_HISTORY.', 'the prior signed approval evidence cannot be overwritten');
select * from finish();
rollback;
