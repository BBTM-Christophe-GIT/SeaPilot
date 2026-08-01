begin;

select plan(5);

select is(
  (select count(*)::integer from storage.buckets where id = 'dpr-pdfs'),
  0,
  'the persistent DPR PDF bucket is removed'
);

select is(
  (select count(*)::integer from public.dpr_files where file_kind = 'pdf'),
  0,
  'stored DPR PDF metadata is purged'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgname = 'dpr_files_reject_stored_pdf'
      and tgrelid = 'public.dpr_files'::regclass
      and not tgisinternal
  ),
  'a database trigger prevents future DPR PDF persistence'
);

select matches(
  pg_get_functiondef('public.dpr_reject_stored_pdf()'::regprocedure),
  '(?i)must not be stored',
  'the storage rejection has an explicit error message'
);

select unlike(
  (select qual from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'dpr_storage_company_read'),
  '%dpr-pdfs%',
  'the DPR storage read policy no longer includes the PDF bucket'
);

select * from finish();
rollback;
