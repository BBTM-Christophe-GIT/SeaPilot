begin;

select plan(90);

select has_function(
  'public', 'working_time_entry_context', array['date', 'date'],
  'the workflow exposes a server-authorized entry context'
);
select has_function(
  'public', 'refresh_working_time_notifications', array['date'],
  'management can idempotently refresh monthly work/rest notifications'
);
select has_function(
  'public', 'get_or_create_working_time_register', array['bigint', 'text', 'date'],
  'register creation is controlled by an RPC'
);
select has_function(
  'public', 'save_working_time_interval',
  array['bigint', 'timestamp with time zone', 'timestamp with time zone', 'text', 'bigint', 'text', 'text', 'bigint'],
  'interval mutations are controlled by an RPC'
);
select has_function(
  'public', 'save_working_time_day_comment',
  array['bigint', 'date', 'text', 'text', 'text', 'text', 'text'],
  'structured captain responses are controlled by an RPC'
);
select has_function(
  'public', 'working_time_signature_upload_context', array['bigint'],
  'profile-signature uploads receive a server-authorized private path context'
);
select has_function(
  'public', 'working_time_ensure_current_register_for_person', array['bigint'],
  'maritime profiles receive their current monthly register automatically'
);
select has_function(
  'public', 'working_time_day_context', array['bigint', 'date'],
  'entry context is derived from Planning for the selected person and day'
);
select has_function(
  'public', 'request_working_time_captain_signature', array['bigint', 'bigint', 'date'],
  'a Marin can request the signature of a same-watch Capitaine'
);
select has_function(
  'public', 'validate_working_time_register', array['bigint'],
  'a requested Capitaine can validate a submitted register'
);
select has_function(
  'public', 'approve_own_working_time_register', array['bigint', 'date'],
  'a Capitaine can approve their own register'
);
select has_column(
  'public', 'working_time_day_comments', 'cause_category',
  'non-compliance responses retain a cause category'
);
select has_column(
  'public', 'working_time_day_comments', 'compensatory_rest_plan',
  'non-compliance responses retain the compensatory-rest plan'
);
select has_column(
  'public', 'working_time_validations', 'interval_snapshot',
  'workflow decisions freeze the active intervals'
);
select has_column(
  'public', 'working_time_validations', 'non_compliance_snapshot',
  'workflow decisions freeze compliance evidence'
);
select ok(
  not has_table_privilege('authenticated', 'public.working_time_intervals', 'INSERT'),
  'authenticated clients cannot bypass the interval RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.working_time_intervals', 'UPDATE'),
  'authenticated clients cannot bypass interval correction rules'
);
select ok(
  (
    select count(*) = 3
    from pg_policies
    where schemaname = 'public'
      and tablename = 'working_time_intervals'
      and policyname like 'working_time_intervals_%_guard'
  ),
  'RLS contains insert, update and delete workflow guards'
);
select is(
  (select file_size_limit::bigint from storage.buckets where id = 'working-time-signatures'),
  1048576::bigint,
  'the private signature bucket enforces the one-megabyte limit'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'working-time-signatures'),
  array['image/png']::text[],
  'the private signature bucket accepts PNG files only'
);

insert into auth.users (id, email)
values
  ('79000000-0000-0000-0000-000000000001', 'workflow-captain-a@example.invalid'),
  ('79000000-0000-0000-0000-000000000002', 'workflow-captain-b@example.invalid'),
  ('79000000-0000-0000-0000-000000000003', 'workflow-sailor@example.invalid'),
  ('79000000-0000-0000-0000-000000000004', 'workflow-armement@example.invalid'),
  ('79000000-0000-0000-0000-000000000005', 'workflow-admin@example.invalid'),
  ('79000000-0000-0000-0000-000000000006', 'workflow-direction@example.invalid'),
  ('79000000-0000-0000-0000-000000000007', 'workflow-unlinked-admin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('79000000-0000-0000-0000-000000000001'::uuid, 'workflow-captain-a@example.invalid', 'Capitaine A'),
    ('79000000-0000-0000-0000-000000000002'::uuid, 'workflow-captain-b@example.invalid', 'Capitaine B'),
    ('79000000-0000-0000-0000-000000000003'::uuid, 'workflow-sailor@example.invalid', 'Marin Workflow'),
    ('79000000-0000-0000-0000-000000000004'::uuid, 'workflow-armement@example.invalid', 'Armement Workflow'),
    ('79000000-0000-0000-0000-000000000005'::uuid, 'workflow-admin@example.invalid', 'Admin Workflow'),
    ('79000000-0000-0000-0000-000000000006'::uuid, 'workflow-direction@example.invalid', 'Direction Workflow'),
    ('79000000-0000-0000-0000-000000000007'::uuid, 'workflow-unlinked-admin@example.invalid', 'Admin sans fiche RH')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('79000000-0000-0000-0000-000000000001'::uuid, 'capitaine'),
    ('79000000-0000-0000-0000-000000000002'::uuid, 'capitaine'),
    ('79000000-0000-0000-0000-000000000003'::uuid, 'marin'),
    ('79000000-0000-0000-0000-000000000004'::uuid, 'armement'),
    ('79000000-0000-0000-0000-000000000005'::uuid, 'admin'),
    ('79000000-0000-0000-0000-000000000006'::uuid, 'direction'),
    ('79000000-0000-0000-0000-000000000007'::uuid, 'admin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.people (
  company_id, user_id, first_name, last_name, function_label, sailor_number, active
)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name,
       fixture.function_label, fixture.sailor_number, true
from (
  values
    ('79000000-0000-0000-0000-000000000001'::uuid, 'Camille', 'CAPITAINE A', 'Capitaine', 'WF-CAPA'),
    ('79000000-0000-0000-0000-000000000002'::uuid, 'Morgan', 'CAPITAINE B', 'Capitaine', 'WF-CAPB'),
    ('79000000-0000-0000-0000-000000000003'::uuid, 'Alex', 'MARIN', 'Matelot', 'WF-MARIN'),
    ('79000000-0000-0000-0000-000000000004'::uuid, 'Alice', 'ARMEMENT', 'Armement', 'WF-ARM'),
    ('79000000-0000-0000-0000-000000000005'::uuid, 'Ariane', 'ADMIN', 'Administrateur', 'WF-ADM'),
    ('79000000-0000-0000-0000-000000000006'::uuid, 'Diane', 'DIRECTION', 'Direction', 'WF-DIR')
) fixture(user_id, first_name, last_name, function_label, sailor_number)
cross join public.companies company
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000007', true);
select is(
  jsonb_array_length(public.working_time_entry_context('2026-09-01', '2026-09-30')->'readable_people'),
  6,
  'an unlinked administrator can browse the complete HR register catalogue'
);
select is(
  jsonb_array_length(public.working_time_entry_context('2026-09-01', '2026-09-30')->'editable_people'),
  0,
  'an unlinked administrator does not receive a mutation scope'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.working_time_signature_upload_context(
    (select id from public.people where sailor_number = 'WF-MARIN')
  )$$,
  'an admin can obtain a scoped upload path for an HR profile'
);
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000006', true);
select throws_ok(
  $$select public.working_time_signature_upload_context(
    (select id from public.people where sailor_number = 'WF-MARIN')
  )$$,
  '42501', null,
  'Direction cannot manage another person signature'
);
reset role;

insert into storage.objects (bucket_id, name, metadata)
select 'working-time-signatures', company.id || '/' || person.id || '/00000000-0000-4000-8000-000000000006.png',
       jsonb_build_object('mimetype', 'image/png', 'size', 256)
from public.companies company
join public.people person on person.company_id = company.id and person.sailor_number = 'WF-DIR'
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.register_working_time_profile_signature(
    (select id from public.people where sailor_number = 'WF-DIR'),
    (select company_id || '/' || id || '/00000000-0000-4000-8000-000000000006.png'
     from public.people where sailor_number = 'WF-DIR'),
    'image/png', 256, repeat('f', 64)
  )$$,
  'an admin registers the exact uploaded PNG as a versioned HR signature'
);
select is(
  (select sha256 from public.working_time_profile_signatures
   where person_id = (select id from public.people where sailor_number = 'WF-DIR')
   order by version_number desc limit 1),
  repeat('f', 64),
  'the registered profile-signature version retains its SHA-256 digest'
);
reset role;

insert into public.vessels (company_id, name, acronym, active)
select company.id, 'WORKFLOW TEST VESSEL', 'WFW', true
from public.companies company where company.code = 'bbtm';

insert into public.planning_assignments (
  company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on,
  starts_at, ends_at, assignment_role, status_label, confirmation_status,
  watch_group, source_label
)
select company.id, vessel.id, fixture.captain_id, fixture.crew_id,
       '2026-09-01', '2026-09-30',
       '2026-09-01 00:00:00+02'::timestamptz,
       '2026-09-30 23:59:59+02'::timestamptz,
       fixture.assignment_role, 'En mer', 'confirmed', 'Bordée Workflow', 'workflow_test'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.acronym = 'WFW'
cross join lateral (
  select captain_a.id as captain_id, captain_a.id as crew_id, 'Capitaine'::text as assignment_role
  from public.people captain_a where captain_a.sailor_number = 'WF-CAPA'
  union all
  select captain_b.id, captain_b.id, 'Capitaine'
  from public.people captain_b where captain_b.sailor_number = 'WF-CAPB'
  union all
  select captain_a.id, sailor.id, 'Matelot'
  from public.people captain_a
  cross join public.people sailor
  where captain_a.sailor_number = 'WF-CAPA' and sailor.sailor_number = 'WF-MARIN'
) fixture
where company.code = 'bbtm';

insert into public.planning_publications (
  vessel_id, scope_key, starts_on, ends_on, status, current_version,
  created_by, updated_by
)
select vessel.id, 'vessel:' || vessel.id, '2026-09-01', '2026-09-30',
       'validated', 1, captain.user_id, captain.user_id
from public.vessels vessel
join public.people captain on captain.company_id = vessel.company_id and captain.sailor_number = 'WF-CAPA'
where vessel.acronym = 'WFW';

insert into public.planning_work_rest_policies (
  company_id, name, scope, vessel_id, effective_from, effective_to,
  max_work_24h, min_rest_24h, max_work_7d, min_rest_7d,
  min_consecutive_rest_hours, max_rest_periods_24h,
  night_starts_at, night_ends_at, max_night_work_24h,
  include_handover, active, created_by, updated_by
)
select company.id, 'Workflow test policy', 'vessel', vessel.id,
       '2026-09-01', '2026-09-30', 4, 20, 28, 140, 12, 2,
       '22:00', '06:00', 4, true, true, admin_profile.id, admin_profile.id
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.acronym = 'WFW'
join public.profiles admin_profile on admin_profile.active_company_id = company.id
  and admin_profile.id = '79000000-0000-0000-0000-000000000005'
where company.code = 'bbtm';

insert into public.working_time_profile_signatures (
  company_id, person_id, version_number, storage_path, mime_type,
  file_size_bytes, sha256, created_by
)
select company.id, person.id, 1, company.id || '/' || person.id || '/workflow.png',
       'image/png', 128, repeat(fixture.hash_character, 64), person.user_id
from public.companies company
join public.people person on person.company_id = company.id
join (
  values
    ('WF-CAPA', 'a'), ('WF-CAPB', 'b'), ('WF-ARM', 'c'), ('WF-ADM', 'd')
) fixture(sailor_number, hash_character) on fixture.sailor_number = person.sailor_number
where company.code = 'bbtm';

select set_config(
  'test.workflow.captain_a_id',
  (select id::text from public.people where sailor_number = 'WF-CAPA'), true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000005', true);
select is(
  jsonb_array_length(public.working_time_entry_context('2026-09-21', '2026-09-27')->'editable_people'),
  6,
  'an administrator can select every active HR person in the company'
);
select lives_ok(
  $$select public.get_or_create_working_time_register(
    (select id from public.people where sailor_number = 'WF-DIR'), 'weekly', '2026-09-21'
  )$$,
  'an administrator can prepare a draft register for any active HR person'
);
select set_config(
  'test.workflow.management_register_id',
  (select id::text from public.working_time_registers
   where person_id = (select id from public.people where sailor_number = 'WF-DIR')
     and period_start = '2026-09-21'), true
);
select throws_ok(
  $$select public.save_working_time_interval(
    current_setting('test.workflow.management_register_id')::bigint,
    '2026-09-21 08:00:00+02', '2026-09-21 16:00:00+02', 'Europe/Paris',
    null, null, 'Saisie administrateur'
  )$$,
  '23514', 'WORKING_TIME_PLANNING_ASSIGNMENT_REQUIRED.',
  'entry fields are derived from Planning, including for an administrator'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000004', true);
select is(
  jsonb_array_length(public.working_time_entry_context('2026-09-21', '2026-09-27')->'editable_people'),
  6,
  'armement can select every active HR person in the company'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000006', true);
select is(
  jsonb_array_length(public.working_time_entry_context('2026-09-21', '2026-09-27')->'editable_people'),
  0,
  'direction remains read-only and receives no entry scope'
);
select is(
  jsonb_array_length(public.working_time_entry_context('2026-09-21', '2026-09-27')->'readable_people'),
  6,
  'direction can browse every sailor as one register catalogue entry'
);
select throws_ok(
  $$select public.get_or_create_working_time_register(
    (select id from public.people where sailor_number = 'WF-MARIN'), 'weekly', '2026-09-21'
  )$$,
  '42501', null,
  'direction cannot prepare another person register'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.get_or_create_working_time_register(
    (select id from public.people where sailor_number = 'WF-MARIN'), 'weekly', '2026-09-07'
  )$$,
  'a sailor can create their own draft register'
);
select throws_ok(
  $$select public.get_or_create_working_time_register(
    current_setting('test.workflow.captain_a_id')::bigint, 'weekly', '2026-09-07'
  )$$,
  '42501', null,
  'a sailor cannot create another person register'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000001', true);
select is(
  jsonb_array_length(public.working_time_entry_context('2026-09-07', '2026-09-13')->'editable_people'),
  1,
  'an unpublished planning exposes only the captain themselves'
);
select throws_ok(
  $$select public.get_or_create_working_time_register(
    (select id from public.people where sailor_number = 'WF-MARIN'), 'weekly', '2026-09-14'
  )$$,
  '42501', null,
  'a captain cannot enter crew time before the planning is published'
);

reset role;
update public.planning_publications
set status = 'published', published_at = now(), locked_at = now()
where vessel_id = (select id from public.vessels where acronym = 'WFW');

set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000001', true);
select ok(
  jsonb_array_length(
    public.working_time_entry_context('2026-09-07', '2026-09-13')->'editable_people'
  ) >= 3,
  'a published planning exposes the captain watch members'
);
select lives_ok(
  $$select public.get_or_create_working_time_register(
    (select id from public.people where sailor_number = 'WF-MARIN'), 'weekly', '2026-09-07'
  )$$,
  'a captain can open the published-watch sailor register'
);
select lives_ok(
  $$select public.get_or_create_working_time_register(
    (select id from public.people where sailor_number = 'WF-CAPA'), 'weekly', '2026-09-07'
  )$$,
  'a captain can create their own register'
);

select set_config(
  'test.workflow.sailor_register_id',
  (select id::text from public.working_time_registers
   where person_id = (select id from public.people where sailor_number = 'WF-MARIN')
     and period_start = '2026-09-07'), true
);
select set_config(
  'test.workflow.captain_register_id',
  (select id::text from public.working_time_registers
   where person_id = (select id from public.people where sailor_number = 'WF-CAPA')
     and period_start = '2026-09-07'), true
);

select lives_ok(
  $$select public.save_working_time_interval(
    current_setting('test.workflow.sailor_register_id')::bigint,
    '2026-09-07 08:00:00+02', '2026-09-07 16:00:00+02', 'Europe/Paris',
    (select id from public.vessels where acronym = 'WFW'), 'Bordée Workflow', 'Quart de jour'
  )$$,
  'the captain can enter an interval for a sailor in the published watch'
);
select lives_ok(
  $$select public.save_working_time_interval(
    current_setting('test.workflow.captain_register_id')::bigint,
    '2026-09-07 08:00:00+02', '2026-09-07 10:00:00+02', 'Europe/Paris',
    (select id from public.vessels where acronym = 'WFW'), 'Bordée Workflow', 'Passerelle'
  )$$,
  'the captain can enter their own interval'
);
select is(
  (select utc_offset_minutes::integer from public.working_time_intervals
   where register_id = current_setting('test.workflow.sailor_register_id')::bigint),
  120,
  'the server derives the captured UTC offset'
);
select lives_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.sailor_register_id')::bigint, 'request_sailor_signature'
  )$$,
  'the captain can request the sailor signature'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.sailor_register_id')::bigint, 'sailor_sign'
  )$$,
  '23514', 'WORKING_TIME_ACTIVE_SIGNATURE_REQUIRED.',
  'submission requires the sailor explicit profile signature'
);

reset role;
insert into public.working_time_profile_signatures (
  company_id, person_id, version_number, storage_path, mime_type,
  file_size_bytes, sha256, created_by
)
select company.id, person.id, 1, company.id || '/' || person.id || '/workflow.png',
       'image/png', 128, repeat('e', 64), person.user_id
from public.companies company
join public.people person on person.company_id = company.id and person.sailor_number = 'WF-MARIN'
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.sailor_register_id')::bigint, 'sailor_sign'
  )$$,
  'the sailor explicitly signs and submits the register'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000006', true);
select throws_ok(
  $$select public.get_or_create_working_time_register(
    (select id from public.people where sailor_number = 'WF-DIR'), 'weekly', '2026-09-07'
  )$$,
  '42501', null,
  'Direction cannot create a personal working-time register'
);
select throws_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.sailor_register_id')::bigint, 'captain_validate'
  )$$,
  '42501', null,
  'Direction cannot validate working-time registers'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.sailor_register_id')::bigint, 'captain_validate'
  )$$,
  '23514', 'WORKING_TIME_NON_COMPLIANCE_DETAILS_REQUIRED.',
  'a non-compliant register cannot be validated without the structured captain response'
);
select is(
  (select count(*)::integer from public.working_time_intervals
   where register_id = current_setting('test.workflow.sailor_register_id')::bigint and voided_at is null),
  1,
  'a non-conformity never removes worked hours'
);
select lives_ok(
  $$
    select public.save_working_time_day_comment(
      current_setting('test.workflow.sailor_register_id')::bigint,
      non_compliant_day.local_window_end_date,
      'unexpected_operation',
      'Opération de sécurité non planifiée pendant le quart.',
      'Relève renforcée et information immédiate du bord.',
      'Repos compensateur de huit heures prévu après la relève.',
      'Dépassement expliqué par une opération de sécurité.'
    )
    from (
      select distinct calculation.local_window_end_date
      from public.working_time_calculation_windows calculation
      where calculation.person_id = (select id from public.people where sailor_number = 'WF-MARIN')
        and calculation.local_window_end_date between '2026-09-07' and '2026-09-13'
        and calculation.is_compliant is false
    ) non_compliant_day
  $$,
  'the assigned captain comments every non-compliant day'
);
select ok(
  (select bool_and(authored_by = '79000000-0000-0000-0000-000000000001')
   from public.working_time_day_comments
   where register_id = current_setting('test.workflow.sailor_register_id')::bigint),
  'non-conformity comments retain the captain identity'
);
select is(
  (select cause_category from public.working_time_day_comments
   where register_id = current_setting('test.workflow.sailor_register_id')::bigint
   order by local_work_date limit 1),
  'unexpected_operation',
  'the structured cause is retained without changing calculated compliance'
);
select lives_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.sailor_register_id')::bigint, 'captain_validate'
  )$$,
  'the captain validates the commented sailor register'
);
select is(
  (select count(*)::integer from public.working_time_intervals
   where register_id = current_setting('test.workflow.sailor_register_id')::bigint and voided_at is null),
  1,
  'validation preserves all submitted hours'
);
select is(
  (select jsonb_array_length(interval_snapshot)
   from public.working_time_validations
   where register_id = current_setting('test.workflow.sailor_register_id')::bigint
     and event_type = 'captain_validated'),
  1,
  'validation freezes the active interval evidence'
);
select ok(
  (select jsonb_array_length(non_compliance_snapshot) > 0
     and non_compliance_snapshot->0->>'status' = 'NON CONFORME'
     and non_compliance_snapshot->0->'response'->>'cause_category' = 'unexpected_operation'
   from public.working_time_validations
   where register_id = current_setting('test.workflow.sailor_register_id')::bigint
     and event_type = 'captain_validated'),
  'validation freezes the non-compliance and structured captain response'
);
select ok(
  (select (signature_snapshot->'signer_roles') ? 'capitaine'
     and length(signature_snapshot->>'sha256') = 64
     and signature_snapshot ? 'signed_at'
   from public.working_time_validations
   where register_id = current_setting('test.workflow.sailor_register_id')::bigint
     and event_type = 'captain_validated'),
  'the validator snapshot retains role, date and file digest'
);
select ok(
  exists (
    select 1 from public.working_time_calculation_windows calculation
    where calculation.person_id = (select id from public.people where sailor_number = 'WF-MARIN')
      and calculation.is_compliant is false
  ),
  'the structured response never cancels the server non-compliance'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000005', true);
select ok(
  exists (select 1 from public.planning_notifications where notification_type = 'working_time_non_compliance'),
  'administrators receive work/rest non-compliance notifications'
);
select is(
  (select count(*)::integer from public.planning_notifications where recipient_user_id <> auth.uid()),
  0,
  'notification RLS hides alerts belonging to other recipients'
);
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000006', true);
select ok(
  exists (select 1 from public.planning_notifications where notification_type = 'working_time_non_compliance'),
  'direction receives work/rest non-compliance notifications'
);
select lives_ok(
  $$select public.refresh_working_time_notifications('2026-09-01')$$,
  'direction can refresh the monthly work/rest notification inbox'
);
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000004', true);
select ok(
  exists (select 1 from public.planning_notifications where notification_type = 'working_time_non_compliance'),
  'armement receives work/rest non-compliance notifications'
);
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*)::integer from public.planning_notifications where notification_type = 'working_time_non_compliance'),
  0,
  'sailors do not receive management-only work/rest alerts'
);
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$update public.working_time_intervals
    set comment = 'Tentative après validation'
    where register_id = current_setting('test.workflow.sailor_register_id')::bigint$$,
  '42501', null,
  'authenticated users cannot directly alter a validated interval'
);

select lives_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.captain_register_id')::bigint, 'request_sailor_signature'
  )$$,
  'a captain can request signature for their personal register'
);
select lives_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.captain_register_id')::bigint, 'sailor_sign'
  )$$,
  'a captain signs their personal register as its subject'
);
select throws_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.captain_register_id')::bigint, 'captain_validate'
  )$$,
  '42501', 'WORKING_TIME_SELF_VALIDATION_FORBIDDEN.',
  'a captain cannot validate their own register'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.captain_register_id')::bigint, 'captain_validate'
  )$$,
  'another captain from the published watch can validate the captain register'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.captain_register_id')::bigint, 'reopen', ' '
  )$$,
  '22023', 'WORKING_TIME_REOPEN_COMMENT_REQUIRED.',
  'reopening requires a reason'
);
select lives_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.captain_register_id')::bigint, 'reopen', 'Correction demandée par l’armement'
  )$$,
  'armement can reopen a validated register with a reason'
);
select ok(
  exists (
    select 1 from public.working_time_validations validation
    where validation.register_id = current_setting('test.workflow.captain_register_id')::bigint
      and validation.event_type = 'reopened'
      and validation.comment = 'Correction demandée par l’armement'
  ),
  'the motivated reopening creates an immutable validation event'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.captain_register_id')::bigint, 'request_sailor_signature'
  )$$,
  'the reopened register can restart the signature workflow'
);
select lives_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.captain_register_id')::bigint, 'sailor_sign'
  )$$,
  'the captain signs the corrected personal register again'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.transition_working_time_register(
    current_setting('test.workflow.captain_register_id')::bigint, 'captain_validate'
  )$$,
  'an administrator can validate a captain register without self-validation'
);
select is(
  (select status from public.working_time_registers
   where id = current_setting('test.workflow.captain_register_id')::bigint),
  'validated',
  'the final validated status is locked'
);

insert into public.people (
  company_id, user_id, first_name, last_name, function_label, sailor_number, active
)
select company.id, null, 'Robin', 'SANS COMPTE', 'Personnel RH', 'WF-UNLINKED', true
from public.companies company
where company.code = 'bbtm';

select is(
  (select count(*)::integer
   from public.working_time_registers register
   join public.people person on person.id = register.person_id
   where person.sailor_number in (
     'WF-CAPA', 'WF-CAPB', 'WF-MARIN', 'WF-ARM', 'WF-ADM', 'WF-DIR', 'WF-UNLINKED'
   )
     and register.period_kind = 'monthly'
     and register.period_start = date_trunc('month', current_date)::date),
  7,
  'creating any active HR profile, including one without an account, automatically opens its current register'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000003', true);
select ok(
  (public.working_time_day_context(
    (select id from public.people where sailor_number = 'WF-MARIN'), '2026-09-14'
  )->>'vessel_id')::bigint = (select id from public.vessels where acronym = 'WFW')
  and jsonb_array_length(public.working_time_day_context(
    (select id from public.people where sailor_number = 'WF-MARIN'), '2026-09-14'
  )->'captain_candidates') >= 1,
  'the Marin day context supplies the Planning vessel and same-watch Capitaines'
);
select lives_ok(
  $$select set_config('test.workflow.simple_sailor_register_id', register_id::text, false)
    from public.get_or_create_working_time_register(
      (select id from public.people where sailor_number = 'WF-MARIN'), 'weekly', '2026-09-14'
    ) register_id$$,
  'the Marin can use a register for the selected Planning week'
);
select lives_ok(
  $$select public.save_working_time_interval(
    current_setting('test.workflow.simple_sailor_register_id')::bigint,
    '2026-09-14 08:00:00+02', '2026-09-14 09:00:00+02', 'Europe/Paris',
    null, null, 'Quart court'
  )$$,
  'the Marin saves hours without sending vessel or watch form fields'
);
select results_eq(
  $$select interval.vessel_id, interval.watch_group
    from public.working_time_intervals interval
    where interval.register_id = current_setting('test.workflow.simple_sailor_register_id')::bigint$$,
  $$select vessel.id, assignment.watch_group
    from public.vessels vessel
    join public.planning_assignments assignment on assignment.vessel_id = vessel.id
    join public.people person on person.id = assignment.crew_person_id and person.sailor_number = 'WF-MARIN'
    where vessel.acronym = 'WFW'
    limit 1$$,
  'the saved interval receives vessel and watch values from Planning'
);
select lives_ok(
  $$select public.request_working_time_captain_signature(
    current_setting('test.workflow.simple_sailor_register_id')::bigint,
    current_setting('test.workflow.captain_a_id')::bigint,
    '2026-09-14'
  )$$,
  'the Marin requests the signature of a Capitaine in the same watch'
);
select results_eq(
  $$select register.status, register.requested_captain_person_id
    from public.working_time_registers register
    where register.id = current_setting('test.workflow.simple_sailor_register_id')::bigint$$,
  $$values ('submitted'::text, current_setting('test.workflow.captain_a_id')::bigint)$$,
  'the request submits the register to the selected Capitaine'
);

select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.validate_working_time_register(current_setting('test.workflow.simple_sailor_register_id')::bigint)$$,
  'the selected Capitaine validates the Marin register'
);
select is(
  (select status from public.working_time_registers where id = current_setting('test.workflow.simple_sailor_register_id')::bigint),
  'validated',
  'the Marin register is validated'
);
select lives_ok(
  $$select set_config('test.workflow.simple_captain_register_id', register_id::text, false)
    from public.get_or_create_working_time_register(
      current_setting('test.workflow.captain_a_id')::bigint, 'weekly', '2026-09-14'
    ) register_id$$,
  'the Capitaine opens their own selected-week register'
);
select lives_ok(
  $$select public.save_working_time_interval(
    current_setting('test.workflow.simple_captain_register_id')::bigint,
    '2026-09-14 10:00:00+02', '2026-09-14 11:00:00+02', 'Europe/Paris',
    null, null, 'Passerelle'
  )$$,
  'the Capitaine saves their own Planning-derived hours'
);
select lives_ok(
  $$select public.approve_own_working_time_register(
    current_setting('test.workflow.simple_captain_register_id')::bigint, '2026-09-14'
  )$$,
  'the Capitaine directly approves their own entry'
);
select is(
  (select status from public.working_time_registers where id = current_setting('test.workflow.simple_captain_register_id')::bigint),
  'validated',
  'the Capitaine own register is validated'
);

rollback;
