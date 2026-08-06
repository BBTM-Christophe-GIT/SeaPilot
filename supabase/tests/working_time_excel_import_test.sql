begin;

select plan(28);

select has_table('public', 'working_time_import_batches', 'annual XLSM import batches are audited');
select has_table('public', 'working_time_import_rows', 'detected and corrected import rows are retained');
select ok((select relrowsecurity from pg_class where oid = 'public.working_time_import_batches'::regclass), 'RLS protects import batches');
select ok((select relrowsecurity from pg_class where oid = 'public.working_time_import_rows'::regclass), 'RLS protects import rows');
select is((select public from storage.buckets where id = 'working-time-imports'), false, 'source XLSM files stay private');
select is((select file_size_limit::bigint from storage.buckets where id = 'working-time-imports'), 20971520::bigint, 'XLSM uploads are limited to 20 MB');
select is(
  (select allowed_mime_types from storage.buckets where id = 'working-time-imports'),
  array['application/vnd.ms-excel.sheet.macroEnabled.12', 'application/vnd.ms-excel.sheet.macroenabled.12']::text[],
  'XLSM MIME casing emitted by browsers and Windows is accepted'
);
select has_function('public', 'working_time_import_upload_context', array['text','text','bigint','text'], 'upload context RPC exists');
select has_function('public', 'preview_working_time_import', array['bigint','bigint','integer','text','text','text','jsonb','jsonb'], 'server preview RPC exists');
select has_function('public', 'commit_working_time_import', array['bigint'], 'transactional commit RPC exists');
select ok(not has_function_privilege('anon', 'public.working_time_import_upload_context(text,text,bigint,text)', 'EXECUTE'), 'anonymous imports are denied');
select ok(not has_table_privilege('authenticated', 'public.working_time_import_rows', 'INSERT'), 'the browser cannot inject import decisions directly');
select is(
  (
    select count(*)::integer
    from public.profiles profile
    join public.people person on lower(trim(person.email)) = lower(trim(profile.email))
    where person.user_id is null
      and nullif(trim(profile.email), '') is not null
      and exists (
        select 1 from public.user_roles user_role
        where user_role.user_id = profile.id and user_role.company_id = person.company_id
      )
      and 1 = (select count(*) from public.profiles candidate where lower(trim(candidate.email)) = lower(trim(profile.email)))
      and 1 = (select count(*) from public.people candidate where lower(trim(candidate.email)) = lower(trim(person.email)))
  ),
  0,
  'unique same-company email matches are linked to their RH person'
);

insert into auth.users (id, email) values
  ('78700000-0000-0000-0000-000000000001', 'import-admin@example.invalid'),
  ('78700000-0000-0000-0000-000000000002', 'import-armement@example.invalid'),
  ('78700000-0000-0000-0000-000000000003', 'import-marin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.user_id, fixture.email, fixture.display_name, company.id
from public.companies company
cross join (values
  ('78700000-0000-0000-0000-000000000001'::uuid, 'import-admin@example.invalid', 'Import Admin'),
  ('78700000-0000-0000-0000-000000000002'::uuid, 'import-armement@example.invalid', 'Import Armement'),
  ('78700000-0000-0000-0000-000000000003'::uuid, 'import-marin@example.invalid', 'Import Marin')
) fixture(user_id, email, display_name)
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from public.companies company
cross join (values
  ('78700000-0000-0000-0000-000000000001'::uuid, 'admin'::text),
  ('78700000-0000-0000-0000-000000000002'::uuid, 'armement'::text),
  ('78700000-0000-0000-0000-000000000003'::uuid, 'marin'::text)
) fixture(user_id, role_key)
where company.code = 'bbtm';

insert into public.people (company_id, user_id, first_name, last_name, function_label, sailor_number, active)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name, fixture.function_label, fixture.sailor_number, true
from public.companies company
cross join (values
  ('78700000-0000-0000-0000-000000000001'::uuid, 'Import', 'ADMIN', 'Administrateur', 'IMP-ADMIN'),
  ('78700000-0000-0000-0000-000000000002'::uuid, 'Import', 'ARMEMENT', 'Armement', 'IMP-ARM'),
  ('78700000-0000-0000-0000-000000000003'::uuid, 'Alexandre', 'ROUPSARD', 'Marin', 'IMP-MARIN')
) fixture(user_id, first_name, last_name, function_label, sailor_number)
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, imo_number, active)
select company.id, 'IMPORT VESSEL', 'IMP-V', '9213870', true
from public.companies company where company.code = 'bbtm';

insert into public.planning_assignments (
  company_id, vessel_id, crew_person_id, starts_on, ends_on, assignment_role,
  confirmation_status, watch_group, source_label
)
select company.id, vessel.id, person.id, fixture.starts_on, fixture.ends_on, 'Marin',
       'confirmed', fixture.watch_group, 'import-test'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.acronym = 'IMP-V'
join public.people person on person.company_id = company.id and person.sailor_number = 'IMP-MARIN'
cross join (values
  ('2026-01-01'::date, '2026-01-01'::date, 'Bordée A'::text),
  ('2026-01-02'::date, '2026-01-02'::date, 'Bordée B'::text)
) fixture(starts_on, ends_on, watch_group);

insert into public.planning_publications (
  company_id, vessel_id, scope_key, starts_on, ends_on, status, current_version, published_at
)
select company.id, vessel.id, 'vessel:' || vessel.id, '2026-01-01', '2026-01-31', 'published', 1, now()
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.acronym = 'IMP-V';

insert into public.working_time_registers (
  company_id, person_id, period_kind, period_start, period_end, status, created_by
)
select company.id, person.id, 'monthly', '2026-01-01', '2026-01-31', 'draft', admin.id
from public.companies company
join public.people person on person.company_id = company.id and person.sailor_number = 'IMP-MARIN'
join public.profiles admin on admin.id = '78700000-0000-0000-0000-000000000001';

insert into public.working_time_intervals (
  company_id, register_id, person_id, local_work_date, starts_at, ends_at,
  timezone_name, utc_offset_minutes, author_user_id, author_person_id,
  source_type, source_record_key
)
select register.company_id, register.id, register.person_id, fixture.local_date,
       fixture.starts_at, fixture.ends_at, 'Europe/Paris', 60,
       '78700000-0000-0000-0000-000000000001', admin_person.id,
       'manual', fixture.source_key
from public.working_time_registers register
join public.people subject on subject.id = register.person_id and subject.sailor_number = 'IMP-MARIN'
join public.people admin_person on admin_person.company_id = register.company_id and admin_person.sailor_number = 'IMP-ADMIN'
cross join (values
  ('2026-01-03'::date, '2026-01-03 08:00:00+01'::timestamptz, '2026-01-03 12:00:00+01'::timestamptz, 'import-validated-existing'::text),
  ('2026-01-10'::date, '2026-01-10 08:00:00+01'::timestamptz, '2026-01-10 12:00:00+01'::timestamptz, 'import-draft-existing'::text)
) fixture(local_date, starts_at, ends_at, source_key);

-- A validated weekly register on 3 January makes that source day immutable while
-- the monthly draft register remains available for the other dates.
insert into public.working_time_registers (
  company_id, person_id, period_kind, period_start, period_end, status, created_by
)
select company.id, person.id, 'weekly', '2026-01-03', '2026-01-09', 'validated', admin.id
from public.companies company
join public.people person on person.company_id = company.id and person.sailor_number = 'IMP-MARIN'
join public.profiles admin on admin.id = '78700000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '78700000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.working_time_import_upload_context('Alexandre ROUPSARD - 2026.xlsm','application/vnd.ms-excel.sheet.macroEnabled.12',370759,repeat('a',64))$$,
  '42501', null, 'a sailor cannot start an annual import'
);

select set_config('request.jwt.claim.sub', '78700000-0000-0000-0000-000000000001', true);
select set_config(
  'test.import.batch_id',
  (public.working_time_import_upload_context(
    'Alexandre ROUPSARD - 2026.xlsm',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    370759,
    repeat('a', 64)
  )->>'batch_id'),
  true
);
select is(
  (select status from public.working_time_import_batches where id = current_setting('test.import.batch_id')::bigint),
  'awaiting_upload',
  'an administrator receives an audited upload batch'
);
reset role;

insert into storage.objects (bucket_id, name, metadata)
select source_storage_bucket, source_storage_path,
       jsonb_build_object('mimetype', source_mime_type, 'size', source_file_size_bytes)
from public.working_time_import_batches
where id = current_setting('test.import.batch_id')::bigint;

set local role authenticated;
select set_config('request.jwt.claim.sub', '78700000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.preview_working_time_import(
    current_setting('test.import.batch_id')::bigint,
    (select id from public.people where sailor_number = 'IMP-MARIN'),
    2026,
    'Europe/Paris',
    'Alexandre ROUPSARD',
    'seapilot-xlsm-v1',
    '{"macro_present":true,"macro_execution":"disabled"}'::jsonb,
    '[
      {"sheet":"Janvier","row":5,"date":"2026-01-01","detected_phases":[{"start_minute":240,"end_minute":480}],"phases":[{"start_minute":240,"end_minute":480}],"reported_work_seconds":14400,"vessel_name":"IMPORT VESSEL","imo_number":"9213870"},
      {"sheet":"Janvier","row":6,"date":"2026-01-02","detected_phases":[{"start_minute":480,"end_minute":720},{"start_minute":780,"end_minute":1020}],"phases":[{"start_minute":480,"end_minute":720},{"start_minute":780,"end_minute":1020}],"reported_work_seconds":28800,"vessel_name":"IMPORT VESSEL","imo_number":"9213870"},
      {"sheet":"Janvier","row":7,"date":"2026-01-03","detected_phases":[{"start_minute":480,"end_minute":720}],"reported_work_seconds":14400,"vessel_name":"IMPORT VESSEL"},
      {"sheet":"Janvier","row":8,"date":"2026-01-10","detected_phases":[{"start_minute":480,"end_minute":720}],"reported_work_seconds":14400,"vessel_name":"IMPORT VESSEL"},
      {"sheet":"Janvier","row":9,"date":"2026-01-11","detected_phases":[{"start_minute":480,"end_minute":900}],"reported_work_seconds":28800,"vessel_name":"IMPORT VESSEL"},
      {"sheet":"Janvier","row":10,"date":"2026-01-12","detected_phases":[{"start_minute":480,"end_minute":960}],"reported_work_seconds":28800,"excluded":true,"user_note":"Congé confirmé"}
    ]'::jsonb
  )$$,
  'the server validates the parsed XLSM preview without executing its macro payload'
);
select results_eq(
  $$select
      (preview_summary->>'ready_rows')::integer,
      (preview_summary->>'duplicate_rows')::integer,
      (preview_summary->>'inconsistent_rows')::integer,
      (preview_summary->>'blocked_rows')::integer,
      (preview_summary->>'excluded_rows')::integer
    from public.working_time_import_batches
    where id = current_setting('test.import.batch_id')::bigint$$,
  $$values (2, 1, 1, 1, 1)$$,
  'preview totals separate ready, duplicate, inconsistent, validated and excluded rows'
);
select results_eq(
  $$select local_work_date, watch_group from public.working_time_import_rows
    where batch_id = current_setting('test.import.batch_id')::bigint
      and local_work_date in ('2026-01-01','2026-01-02') order by local_work_date$$,
  $$values ('2026-01-01'::date,'Bordée A'::text),('2026-01-02'::date,'Bordée B'::text)$$,
  'each import row follows a Planning watch change on its exact date'
);
select ok(
  (select detected_phases = effective_phases and jsonb_array_length(detected_phases) = 2
   from public.working_time_import_rows
   where batch_id = current_setting('test.import.batch_id')::bigint and local_work_date = '2026-01-02'),
  'the preview retains multiple disjoint phases and the original source evidence'
);
select is(
  (select status from public.working_time_import_rows
   where batch_id = current_setting('test.import.batch_id')::bigint and local_work_date = '2026-01-03'),
  'blocked_validated',
  'a validated day is explicitly blocked before commit'
);
select lives_ok(
  $$select public.commit_working_time_import(current_setting('test.import.batch_id')::bigint)$$,
  'the administrator commits only rows that remain safe'
);
select is(
  (select count(*)::integer from public.working_time_import_rows
   where batch_id = current_setting('test.import.batch_id')::bigint and status = 'imported'),
  2,
  'only the two conflict-free days are imported'
);
select is(
  (select count(*)::integer from public.working_time_intervals
   where source_type = 'excel_import' and source_reference = 'Alexandre ROUPSARD - 2026.xlsm'),
  3,
  'disjoint phases become three traceable work intervals'
);
select ok(
  (select bool_and(source_metadata->>'source_sha256' = repeat('a',64)
                   and source_metadata->>'parser_version' = 'seapilot-xlsm-v1')
   from public.working_time_intervals where source_type = 'excel_import'),
  'every interval retains the file digest and parser version'
);
select is(
  (select count(*)::integer from public.working_time_intervals where source_record_key = 'import-validated-existing'),
  1,
  'the validated source day is never replaced or erased'
);
select throws_ok(
  $$select public.commit_working_time_import(current_setting('test.import.batch_id')::bigint)$$,
  '55000', null, 'an imported batch cannot be committed twice'
);

select set_config('request.jwt.claim.sub', '78700000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.working_time_import_batches), 0, 'a sailor cannot read import audit batches through RLS');
select set_config('request.jwt.claim.sub', '78700000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.working_time_import_batches), 1, 'armement can review the company import audit');

select * from finish();
rollback;
