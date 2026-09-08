begin;

select plan(16);

select has_column('public', 'procedures', 'approval_status', 'legacy procedure clients keep a nullable compatibility column');
select has_column('public', 'published_procedures', 'approval_status', 'legacy publication clients keep a nullable compatibility column');
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'procedures'
      and indexname = 'procedures_theme_document_number_unique_idx'
  ),
  'Theme and Number have a database uniqueness guard'
);

insert into auth.users (id, email)
values
  ('7a000000-0000-0000-0000-000000000001', 'qsms-admin@example.invalid'),
  ('7a000000-0000-0000-0000-000000000002', 'qsms-capitaine@example.invalid'),
  ('7a000000-0000-0000-0000-000000000003', 'qsms-marin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('7a000000-0000-0000-0000-000000000001'::uuid, 'qsms-admin@example.invalid', 'QSMS Admin'),
    ('7a000000-0000-0000-0000-000000000002'::uuid, 'qsms-capitaine@example.invalid', 'QSMS Capitaine'),
    ('7a000000-0000-0000-0000-000000000003'::uuid, 'qsms-marin@example.invalid', 'QSMS Marin')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('7a000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('7a000000-0000-0000-0000-000000000002'::uuid, 'capitaine'),
    ('7a000000-0000-0000-0000-000000000003'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.procedures (
  procedure_code, title, status, source_label, theme, document_number,
  source_storage_bucket, source_storage_path, source_file_name, source_mime_type, source_size_bytes
)
values (
  'TST 9001-A', 'QSMS private source fixture', 'draft', 'test', 'TST', '9001',
  'procedure-documents', 'sources/test/qsms-private-source.docx', 'qsms-private-source.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 1024
);

select set_config(
  'test.qsms.procedure_id',
  (select id::text from public.procedures where procedure_code = 'TST 9001-A'),
  true
);

insert into public.published_procedures (
  procedure_id, procedure_code, title, status, published_on, diffusion_on, source_label,
  theme, document_number, storage_bucket, storage_path, file_name, mime_type, size_bytes
)
values
  (
    current_setting('test.qsms.procedure_id')::bigint, 'TST 9001-A', 'QSMS published fixture.pdf',
    'published', current_date, current_date, 'test', 'TST', '9001', 'procedure-documents',
    'published/test/qsms-published.pdf', 'qsms-published.pdf', 'application/pdf', 2048
  ),
  (
    current_setting('test.qsms.procedure_id')::bigint, 'TST 9001-A', 'QSMS legacy approval fixture',
    'approved', current_date, current_date, 'test', 'TST', '9001', null, null, null, null, null
  ),
  (
    current_setting('test.qsms.procedure_id')::bigint, 'TST 9001-A', 'QSMS incomplete publication fixture',
    'published', current_date, current_date, 'test', 'TST', '9001', null, null, null, null, null
  );

insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  (
    'procedure-documents', 'sources/test/qsms-private-source.docx',
    '7a000000-0000-0000-0000-000000000001'::uuid,
    '{"mimetype":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","size":1024}'::jsonb
  ),
  (
    'procedure-documents', 'published/test/qsms-published.pdf',
    '7a000000-0000-0000-0000-000000000001'::uuid,
    '{"mimetype":"application/pdf","size":2048}'::jsonb
  ),
  (
    'procedure-documents', 'published/test/qsms-unlinked.pdf',
    '7a000000-0000-0000-0000-000000000001'::uuid,
    '{"mimetype":"application/pdf","size":2048}'::jsonb
  );

-- Other permissive storage policies reference these tables. The local test role
-- needs table privileges before PostgreSQL can evaluate our bucket-specific RLS
-- predicate; the transaction rollback keeps these grants test-only.
grant select on public.project_billing_documents to authenticated;
grant select on public.project_generated_documents to authenticated;
grant select on public.contract_documents to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.procedures where procedure_code = 'TST 9001-A'), 1, 'admin reads the private source');
select is((select count(*)::integer from public.published_procedures where procedure_code = 'TST 9001-A'), 3, 'admin can audit all publication metadata states');
select is((select count(*)::integer from storage.objects where bucket_id = 'procedure-documents' and name like '%qsms-%'), 2, 'admin reads linked source and publication objects');
select throws_ok(
  $$insert into public.procedures (procedure_code, title, status, source_label, theme, document_number)
    values ('TST 9001-B', 'Duplicate QSMS identifier', 'draft', 'test', 'tst', '9001')$$,
  '23505', null,
  'a duplicate normalized Theme and Number combination is rejected'
);
select lives_ok(
  $$update storage.objects set metadata = metadata || '{"cacheControl":"0"}'::jsonb
    where name = 'sources/test/qsms-private-source.docx'$$,
  'admin can replace an existing private source object'
);

select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.procedures where procedure_code = 'TST 9001-A'), 0, 'capitaine cannot read source metadata');
select is((select count(*)::integer from public.published_procedures where procedure_code = 'TST 9001-A'), 1, 'capitaine sees only the complete published PDF record');
select is((select count(*)::integer from storage.objects where bucket_id = 'procedure-documents' and name like '%qsms-%'), 1, 'capitaine reads only the linked published PDF object');
select is((select count(*)::integer from storage.objects where bucket_id = 'procedure-documents' and name = 'sources/test/qsms-private-source.docx'), 0, 'capitaine cannot read the editable source object');

select set_config('request.jwt.claim.sub', '7a000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.procedures where procedure_code = 'TST 9001-A'), 0, 'marin cannot read source metadata');
select is((select count(*)::integer from public.published_procedures where procedure_code = 'TST 9001-A'), 1, 'marin sees only the complete published PDF record');
select is((select count(*)::integer from storage.objects where bucket_id = 'procedure-documents' and name like '%qsms-%'), 1, 'marin reads only the linked published PDF object');
select is((select count(*)::integer from storage.objects where bucket_id = 'procedure-documents' and name = 'published/test/qsms-unlinked.pdf'), 0, 'marin cannot read an unlinked PDF object');

select * from finish();
rollback;
