-- Actual authenticated profiles exercise the issuing trigger and its RLS.
-- Verified metadata is synthetic; no PDF is uploaded or sent to accounting.
begin;
update public.role_module_permissions set is_visible=true where module_key='expenseNotes';
create temporary table ndf_blob_roles(user_id uuid,note_id uuid,role_key text,company_code text);
insert into ndf_blob_roles values
 ('bd150000-0000-4000-8000-000000000001','be150000-0000-4000-8000-000000000001','marin','ndf-blob-a'),
 ('bd150000-0000-4000-8000-000000000002','be150000-0000-4000-8000-000000000002','capitaine','ndf-blob-a'),
 ('bd150000-0000-4000-8000-000000000003','be150000-0000-4000-8000-000000000003','armement','ndf-blob-a'),
 ('bd150000-0000-4000-8000-000000000004','be150000-0000-4000-8000-000000000004','direction','ndf-blob-a'),
 ('bd150000-0000-4000-8000-000000000005','be150000-0000-4000-8000-000000000005','admin','ndf-blob-a'),
 ('bd150000-0000-4000-8000-000000000006','be150000-0000-4000-8000-000000000006','admin','ndf-blob-b');
grant select on ndf_blob_roles to authenticated;
create temporary table ndf_blob_checks(label text);
create function pg_temp.ndf_blob_assert(condition boolean,label text) returns void
language plpgsql security definer set search_path=pg_temp as $$
begin
 if condition is distinct from true then raise exception 'NDF Blob assertion failed: %',label;end if;
 insert into ndf_blob_checks values(label);
end $$;
insert into public.companies(code,name) values('ndf-blob-a','NDF Blob A'),('ndf-blob-b','NDF Blob B');
insert into auth.users(id,email) select user_id,'ndf-blob-'||right(user_id::text,1)||'@example.invalid' from ndf_blob_roles;
insert into public.profiles(id,email,display_name,active_company_id)
select r.user_id,u.email,'NDF Blob '||r.role_key,c.id from ndf_blob_roles r
join auth.users u on u.id=r.user_id join public.companies c on c.code=r.company_code;
insert into public.company_memberships(company_id,user_id,active)
select c.id,r.user_id,true from ndf_blob_roles r join public.companies c on c.code=r.company_code
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select r.user_id,c.id,r.role_key from ndf_blob_roles r join public.companies c on c.code=r.company_code;

set local role authenticated;
do $$ declare r record;begin
 for r in select * from ndf_blob_roles loop
  perform set_config('request.jwt.claim.sub',r.user_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',r.user_id,'role','authenticated')::text,true);
  insert into public.expense_notes(id,issuer_name,kind,expense_on,title,payment_method,amount,receipt_count)
  values(r.note_id,'Blob fixture','expense',current_date,'Blob issuance','CB-Perso',25,0);
  perform pg_temp.ndf_blob_assert((select created_by=r.user_id and status='preparing'
    from public.expense_notes where id=r.note_id),'preparation preserves real creator: '||r.role_key);
 end loop;
end $$;
reset role;

-- The verified Blob registry is the only metadata source for these six PDFs.
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,
 bytes,sha256,source_sha256,verified_at,uploader_id,original_owner_id)
select 'expense-note-pdfs',n.pdf_path,'documents/test/ndf-blob/'||n.id,
 'https://fixture.private.blob.vercel-storage.com/documents/test/ndf-blob/'||n.id,
 'note.pdf','application/pdf',7,repeat('a',64),repeat('a',64),now(),n.created_by,n.created_by::text
from public.expense_notes n join ndf_blob_roles r on r.note_id=n.id;
select pg_temp.ndf_blob_assert(not exists(select 1 from storage.objects o
 join public.expense_notes n on n.pdf_path=o.name join ndf_blob_roles r on r.note_id=n.id
 where o.bucket_id='expense-note-pdfs'),'Blob fixtures contain no legacy Storage objects');

set local role authenticated;
do $$ declare r record;begin
 for r in select * from ndf_blob_roles loop
  perform set_config('request.jwt.claim.sub',r.user_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',r.user_id,'role','authenticated')::text,true);
  update public.expense_notes set status='issued' where id=r.note_id;
  perform pg_temp.ndf_blob_assert(found,'verified Blob PDF permits issuing: '||r.role_key);
  perform pg_temp.ndf_blob_assert((select status='issued' and issued_at is not null
    from public.expense_notes where id=r.note_id),'issued timestamp recorded: '||r.role_key);
 end loop;
 for r in select * from ndf_blob_roles loop
  perform set_config('request.jwt.claim.sub',r.user_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',r.user_id,'role','authenticated')::text,true);
  perform pg_temp.ndf_blob_assert((select count(*)=case
    when r.company_code='ndf-blob-a' and r.role_key in ('admin','direction') then 5 else 1 end
    from public.expense_notes where id in(select note_id from ndf_blob_roles)),
    'real profile and company visibility preserved: '||r.role_key||'/'||r.company_code);
 end loop;
end $$;

select set_config('request.jwt.claim.sub','bd150000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"bd150000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.expense_notes(id,issuer_name,kind,expense_on,title,payment_method,amount,receipt_count)
select ('be150000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Guard fixture','expense',current_date,'PDF guard','CB-Perso',25,0
from generate_series(11,15)n;
reset role;

-- Inactive Blob metadata must shadow even an older Storage object at that key.
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,
 bytes,sha256,source_sha256,verified_at,active)
select case when right(n.id::text,2)='15' then 'fleet-certificates' else 'expense-note-pdfs' end,
 case when right(n.id::text,2)='13' then replace(n.pdf_path,'note.pdf','another.pdf') else n.pdf_path end,
 'documents/test/ndf-guard/'||n.id,'https://fixture.private.blob.vercel-storage.com/documents/test/ndf-guard/'||n.id,
 'note.pdf','application/pdf',7,repeat('b',64),repeat('b',64),now(),right(n.id::text,2)<>'12'
from public.expense_notes n where n.id in(
 'be150000-0000-4000-8000-000000000012','be150000-0000-4000-8000-000000000013','be150000-0000-4000-8000-000000000015');
insert into storage.objects(bucket_id,name)
select 'expense-note-pdfs',pdf_path from public.expense_notes
where id in('be150000-0000-4000-8000-000000000012','be150000-0000-4000-8000-000000000014');

set local role authenticated;
do $$ declare n integer;begin
 for n in 11..15 loop
  if n=14 then continue;end if;
  begin
   update public.expense_notes set status='issued' where id=('be150000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
   raise exception 'Invalid PDF unexpectedly permitted issuance';
  exception when raise_exception then
   if sqlerrm<>'Le PDF doit être enregistré avant émission.' then raise;end if;
   perform pg_temp.ndf_blob_assert(true,'missing/inactive/wrong-path/wrong-bucket PDF refused: '||n);
  end;
 end loop;
 update public.expense_notes set status='issued' where id='be150000-0000-4000-8000-000000000014';
 perform pg_temp.ndf_blob_assert(found,'historical Storage PDF still permits issuance');
 perform pg_temp.ndf_blob_assert((select status='issued' from public.expense_notes
  where id='be150000-0000-4000-8000-000000000014'),'historical note is issued');

 perform set_config('request.jwt.claim.sub','bd150000-0000-4000-8000-000000000002',true);
 perform set_config('request.jwt.claims','{"sub":"bd150000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 update public.expense_notes set status='issued' where id='be150000-0000-4000-8000-000000000011';
 perform pg_temp.ndf_blob_assert(not found,'Capitaine cannot issue another account preparation');
end $$;
reset role;

-- A failed preparation can be resumed with the same ID after its PDF is visible.
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,
 bytes,sha256,source_sha256,verified_at,uploader_id,original_owner_id)
select 'expense-note-pdfs',pdf_path,'documents/test/ndf-retry/'||id,
 'https://fixture.private.blob.vercel-storage.com/documents/test/ndf-retry/'||id,
 'note.pdf','application/pdf',7,repeat('c',64),repeat('c',64),now(),created_by,created_by::text
from public.expense_notes where id='be150000-0000-4000-8000-000000000011';
set local role authenticated;
select set_config('request.jwt.claim.sub','bd150000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"bd150000-0000-4000-8000-000000000001","role":"authenticated"}',true);
update public.expense_notes set status='issued' where id='be150000-0000-4000-8000-000000000011';
select pg_temp.ndf_blob_assert((select count(*)=1 and bool_and(status='issued') from public.expense_notes
 where id='be150000-0000-4000-8000-000000000011'),'retry issues the same preparation without a duplicate');
reset role;
select pg_temp.ndf_blob_assert(not has_function_privilege('authenticated','private.prepare_expense_note()','execute'),
 'trigger implementation is not a callable client API');
select count(*) as passed_checks from ndf_blob_checks;
rollback;
