begin;

select plan(31);

select has_table('public', 'dpr_reports', 'canonical DPR table exists');
select has_table('public', 'dpr_crew_members', 'crew relation exists');
select has_table('public', 'dpr_other_people', 'other people relation exists');
select has_table('public', 'dpr_incidents', 'incidents relation exists');
select has_table('public', 'dpr_hse_actions', 'HSE actions relation exists');
select has_table('public', 'dpr_emergency_exercises', 'emergency exercises relation exists');
select has_table('public', 'dpr_port_calls', 'port calls relation exists');
select has_table('public', 'dpr_port_call_reasons', 'multiple port call reasons relation exists');
select has_table('public', 'dpr_supplies', 'supplies relation exists');
select has_table('public', 'dpr_waste_records', 'waste relation exists');
select has_table('public', 'dpr_files', 'DPR file registry exists');
select has_table('public', 'dpr_audit_events', 'append-only DPR audit exists');
select has_table('public', 'migration_batches', 'migration batches exist');
select has_table('public', 'migration_records', 'migration records exist');
select has_table('public', 'migration_errors', 'migration errors exist');
select has_table('public', 'migration_source_snapshots', 'migration snapshots exist');

select ok(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid = any(array[
      'public.dpr_reports'::regclass,
      'public.dpr_crew_members'::regclass,
      'public.dpr_incidents'::regclass,
      'public.dpr_files'::regclass,
      'public.dpr_audit_events'::regclass,
      'public.migration_batches'::regclass
    ])
  ),
  'RLS is enabled on tenant DPR tables'
);
select ok(not has_table_privilege('authenticated', 'public.dpr_reports', 'INSERT'), 'direct DPR inserts are denied');
select ok(not has_table_privilege('authenticated', 'public.dpr_reports', 'UPDATE'), 'direct DPR updates are denied');
select ok(not has_table_privilege('authenticated', 'public.dpr_reports', 'DELETE'), 'physical DPR deletion is denied');
select ok(not has_table_privilege('authenticated', 'public.dpr_files', 'DELETE'), 'physical file metadata deletion is denied');
select ok(to_regclass('public.dpr_reports_number_unique_idx') is not null, 'DPR number uniqueness is indexed');
select ok(to_regclass('public.dpr_reports_company_vessel_date_idx') is not null, 'vessel and date lookup is indexed');
select ok(to_regclass('public.dpr_reports_company_project_date_idx') is not null, 'project and date lookup is indexed');
select ok(to_regclass('public.dpr_files_current_pdf_unique_idx') is not null, 'only one current PDF is allowed');
select matches(
  pg_get_functiondef('public.dpr_allocate_next_number(bigint)'::regprocedure),
  '(?i)for update',
  'DPR number allocation locks the company counter'
);
select is((select public from storage.buckets where id = 'dpr-pdfs'), false, 'PDF bucket is private');
select is((select public from storage.buckets where id = 'dpr-photos'), false, 'photo bucket is private');
select is((select public from storage.buckets where id = 'dpr-attachments'), false, 'attachment bucket is private');

select throws_ok(
  $$
    insert into public.dpr_reports (
      company_id, dpr_number, status, report_date, issuer_name_snapshot,
      source_label, submitted_by, submitted_at
    )
    select id, 1, 'submitted', current_date, 'Import fixture', 'sharepoint', null, now()
    from public.companies where code = 'bbtm'
  $$,
  '23514',
  null,
  'submitted DPR requires submission actor and timestamp'
);
select throws_ok(
  $$
    insert into public.dpr_files (
      company_id, dpr_id, file_kind, bucket_name, object_path, original_filename,
      display_filename, mime_type, size_bytes, sha256, version_no
    ) values (1, 999999, 'pdf', 'dpr-pdfs', 'invalid', 'bad.pdf', 'bad.pdf', 'text/plain', 1, repeat('a', 64), 1)
  $$,
  '23514',
  null,
  'final DPR file must be application/pdf'
);

select * from finish();
rollback;
