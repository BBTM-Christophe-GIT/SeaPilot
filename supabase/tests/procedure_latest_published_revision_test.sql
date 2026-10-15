-- Run as a local superuser so SET SESSION AUTHORIZATION exercises real API
-- roles rather than a privileged session pretending to be a Marin/Capitaine.
begin;
insert into auth.users(id,email) values
 ('7c100000-0000-0000-0000-000000000001','revision-admin@example.invalid'),
 ('7c100000-0000-0000-0000-000000000002','revision-direction@example.invalid'),
 ('7c100000-0000-0000-0000-000000000003','revision-capitaine@example.invalid'),
 ('7c100000-0000-0000-0000-000000000004','revision-marin@example.invalid');
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'Revision fixture',c.id from auth.users u cross join public.companies c
where u.id::text like '7c100000-%' and c.code='bbtm';
insert into public.user_roles(user_id,company_id,role_key)
select v.id::uuid,c.id,v.role from (values
 ('7c100000-0000-0000-0000-000000000001','admin'),
 ('7c100000-0000-0000-0000-000000000002','direction'),
 ('7c100000-0000-0000-0000-000000000003','capitaine'),
 ('7c100000-0000-0000-0000-000000000004','marin')) v(id,role)
cross join public.companies c where c.code='bbtm';

do $$ begin
 if procedure_revisions_private.compare_versions('Z','AA')<>-1
   or procedure_revisions_private.compare_versions('AA','AB')<>-1
   or procedure_revisions_private.compare_versions('A','a')<>0
   or procedure_revisions_private.compare_versions('9','10')<>-1
   or procedure_revisions_private.compare_versions('1.2','1.10')<>-1
   or procedure_revisions_private.compare_versions('1','1.0')<>0
   or procedure_revisions_private.compare_versions('A','1') is not null
   or procedure_revisions_private.compare_versions('Rev A','Rev B') is not null
   or procedure_revisions_private.compare_versions(null,'A') is not null then
   raise exception 'Version order/family/ambiguity regression'; end if;
 if procedure_revisions_private.reference_key(' tec ',' 07 ')<>'TEC:07'
   or procedure_revisions_private.reference_key('DNC',null) is not null
   or procedure_revisions_private.reference_key('DNC','DNC-A') is not null
   or procedure_revisions_private.reference_key('TEC','07')=procedure_revisions_private.reference_key('TEC','7') then
   raise exception 'Reference normalization/ambiguity regression'; end if;
 if has_schema_privilege('authenticated','procedure_revisions_private','usage')
   or has_function_privilege('anon','public.publish_procedure_blob(bigint)','execute') then
   raise exception 'Private revision machinery exposed'; end if;
end $$;

set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','7c100000-0000-0000-0000-000000000001',true);
do $$
declare source public.procedures; a public.published_procedures; b public.published_procedures;
  equal_a public.published_procedures; unrelated public.published_procedures;
  pending public.published_procedures; profile text; company bigint; previous_revision integer;
begin
 insert into public.procedures(procedure_code,title,status,source_label,theme,document_number,
   version_label,ism_chapter,source_google_drive_path,source_file_name,source_mime_type,source_size_bytes)
 values('LPR982001-A','Latest version fixture','draft','test','LPR','982001','A','02',
   'LPR 982001 A - Latest version fixture.docx','LPR 982001 A - Latest version fixture.docx',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',100)
 returning * into source;
 a:=public.publish_procedure_drive(source.id,public.procedure_drive_pdf_name(source),100,repeat('a',64));
 -- Equal revisions on a different vessel remain; the global numbered key is
 -- intentionally independent from vessel, project and historical procedure_id.
 insert into public.published_procedures(procedure_id,title,status,theme,document_number,version_label,
   vessel_name,storage_bucket,storage_path,file_name,mime_type,size_bytes)
 values(source.id,'Same version, other vessel','published',' lpr ','982001','A',
   'Another vessel','procedure-documents','published/fixture/equal.pdf','equal.pdf','application/pdf',100)
 returning * into equal_a;
 insert into public.published_procedures(procedure_id,title,status,theme,document_number,version_label,
   storage_bucket,storage_path,file_name,mime_type,size_bytes)
 values(source.id,'Wrong historical source link','published','LPR','982002','A',
   'procedure-documents','published/fixture/unrelated.pdf','unrelated.pdf','application/pdf',100)
 returning * into unrelated;
 if not exists(select 1 from public.published_procedures where id=a.id)
   or not exists(select 1 from public.published_procedures where id=equal_a.id) then
   raise exception 'Equal revision removed'; end if;
 select id into company from public.companies where code='bbtm';
 perform public.qhse_policy_save_settings(a.id,'',(select revision from public.qhse_policy_settings where company_id=company));
 select revision into previous_revision from public.qhse_policy_settings where company_id=company;
 update public.procedures set version_label='B' where id=source.id returning * into source;
 pending:=public.prepare_procedure_blob_publication(source.id,public.procedure_drive_pdf_name(source),100,repeat('b',64));
 if pending.status<>'draft' or not exists(select 1 from public.published_procedures where id=a.id) then
   raise exception 'Draft reservation removed published PDF'; end if;
 begin
   perform public.publish_procedure_blob(pending.id);
   raise exception 'Unverified prepared PDF published';
 exception when object_not_in_prerequisite_state then null; end;
 if not exists(select 1 from public.published_procedures where id=a.id)
   or (select publication_id from public.qhse_policy_settings where company_id=company)<>a.id then
   raise exception 'Failed Blob activation lost previous publication or QHSE link'; end if;
 -- Remove this unverified reservation before testing the unchanged Drive path.
 delete from public.published_procedures where id=pending.id;
 perform set_config('request.jwt.claim.sub','7c100000-0000-0000-0000-000000000002',true);
 b:=public.publish_procedure_drive(source.id,public.procedure_drive_pdf_name(source),100,repeat('b',64));
 if exists(select 1 from public.published_procedures where id in(a.id,equal_a.id)) then
   raise exception 'Direction publication did not delete strictly older PDFs globally'; end if;
 if not exists(select 1 from public.published_procedures where id=unrelated.id) then
   raise exception 'Historical procedure_id incorrectly used as reference'; end if;
 if (select publication_id from public.qhse_policy_settings where company_id=company)<>b.id
   or (select revision from public.qhse_policy_settings where company_id=company)<>previous_revision+1
   or (select updated_by from public.qhse_policy_settings where company_id=company)<>'7c100000-0000-0000-0000-000000000002'::uuid then
   raise exception 'QHSE selection did not move with its revision and actor'; end if;
 -- A delayed old conversion is refused without mutating the current published B.
 update public.procedures set version_label='A' where id=source.id returning * into source;
 begin
   perform public.publish_procedure_drive(source.id,public.procedure_drive_pdf_name(source),100,repeat('a',64));
   raise exception 'Older delayed conversion replaced B';
 exception when check_violation then null; end;
 if (select status from public.published_procedures where id=b.id)<>'published' then
   raise exception 'Older conversion downgraded existing published row'; end if;
 begin
   update public.published_procedures set version_label='A' where id=b.id;
   raise exception 'Existing publication downgraded';
 exception when check_violation then null; end;
 -- A selected policy cannot be moved to a document that no longer meets the
 -- policy document contract; rejection restores its previous PDF and revision.
 update public.procedures set version_label='C',ism_chapter='03' where id=source.id returning * into source;
 begin
   perform public.publish_procedure_drive(source.id,public.procedure_drive_pdf_name(source),100,repeat('c',64));
   raise exception 'Selected QHSE policy moved to an ineligible PDF';
 exception when check_violation then null; end;
 if (select publication_id from public.qhse_policy_settings where company_id=company)<>b.id
   or not exists(select 1 from public.published_procedures where id=b.id) then
   raise exception 'Invalid QHSE successor lost previous PDF'; end if;
 update public.procedures set version_label='A',ism_chapter='02' where id=source.id;
 -- Unknown version families and unnumbered templates are never discarded.
 insert into public.published_procedures(title,status,theme,document_number,version_label,
   storage_bucket,storage_path,file_name,mime_type,size_bytes)
 values('Numeric family','published','LPR','982001','1','procedure-documents','published/fixture/numeric.pdf','numeric.pdf','application/pdf',100),
   ('Ambiguous family','published','LPR','982001','Rev A','procedure-documents','published/fixture/ambiguous.pdf','ambiguous.pdf','application/pdf',100),
   ('DNC template A','published','DNC',null,'A','procedure-documents','published/fixture/dnc-a.pdf','dnc-a.pdf','application/pdf',100),
   ('DNC template B','published','DNC',null,'B','procedure-documents','published/fixture/dnc-b.pdf','dnc-b.pdf','application/pdf',100);
 if (select count(*) from public.published_procedures where storage_path in(
   'published/fixture/numeric.pdf','published/fixture/ambiguous.pdf','published/fixture/dnc-a.pdf','published/fixture/dnc-b.pdf'))<>4 then
   raise exception 'Unknown families or unnumbered templates removed'; end if;
 foreach profile in array array['7c100000-0000-0000-0000-000000000003','7c100000-0000-0000-0000-000000000004'] loop
   perform set_config('request.jwt.claim.sub',profile,true);
   if exists(select 1 from public.procedures where id=source.id)
     or not exists(select 1 from public.published_procedures where id=b.id)
     or exists(select 1 from public.published_procedures where id=a.id) then
     raise exception 'Real reader source/current/old visibility regression'; end if;
   begin
     perform public.publish_procedure_drive(source.id,b.file_name,100,repeat('b',64));
     raise exception 'Reader published Drive PDF';
   exception when insufficient_privilege then null; end;
   begin
     perform public.publish_procedure_blob(b.id);
     raise exception 'Reader published Blob PDF';
   exception when insufficient_privilege then null; end;
 end loop;
 perform set_config('request.jwt.claim.sub','7c100000-0000-0000-0000-000000000001',true);
 perform set_config('test.latest.source_id',source.id::text,true);
 perform set_config('test.latest.publication_id',b.id::text,true);
end $$;
reset role;
reset session authorization;

-- Current Blob publication path: preparing C keeps B, server-verified bytes
-- activate C, and a retry returns the same published row.
set local session authorization authenticator;
set local role authenticated;
do $$
declare source public.procedures; pending public.published_procedures;
begin
 update public.procedures set version_label='C' where id=current_setting('test.latest.source_id')::bigint returning * into source;
 pending:=public.prepare_procedure_blob_publication(source.id,public.procedure_drive_pdf_name(source),100,repeat('c',64));
 perform set_config('test.latest.pending_id',pending.id::text,true);
 if not exists(select 1 from public.published_procedures where id=current_setting('test.latest.publication_id')::bigint) then
   raise exception 'Preparing Blob C removed B'; end if;
end $$;
reset role;
reset session authorization;
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,file_name,mime_type,
 bytes,sha256,source_sha256,verified_at)
select 'procedure-publications-drive',p.id::text,'documents/procedures/latest-revision-c.pdf',
 'https://fixture.private.blob.vercel-storage.com/documents/procedures/latest-revision-c.pdf',
 p.file_name,'application/pdf',p.size_bytes,p.drive_sha256,p.drive_sha256,clock_timestamp()
from public.published_procedures p where p.id=current_setting('test.latest.pending_id')::bigint;
set local session authorization authenticator;
set local role authenticated;
do $$
declare c public.published_procedures; retry public.published_procedures;
begin
 update public.procedures set version_label='D' where id=current_setting('test.latest.source_id')::bigint;
 begin
   perform public.publish_procedure_blob(current_setting('test.latest.pending_id')::bigint);
   raise exception 'Stale prepared PDF marked a different source version published';
 exception when serialization_failure then null; end;
 if not exists(select 1 from public.published_procedures where id=current_setting('test.latest.publication_id')::bigint and status='published')
   or (select status from public.published_procedures where id=current_setting('test.latest.pending_id')::bigint)<>'draft' then
   raise exception 'Stale-source rejection lost published B or changed draft C'; end if;
 update public.procedures set version_label='C' where id=current_setting('test.latest.source_id')::bigint;
 c:=public.publish_procedure_blob(current_setting('test.latest.pending_id')::bigint);
 -- Retrying an already confirmed C remains valid after the source advances D.
 update public.procedures set version_label='D' where id=current_setting('test.latest.source_id')::bigint;
 retry:=public.publish_procedure_blob(c.id);
 if c.status<>'published' or c.id<>retry.id
   or exists(select 1 from public.published_procedures where id=current_setting('test.latest.publication_id')::bigint)
   or not exists(select 1 from public.qhse_policy_settings where publication_id=c.id) then
   raise exception 'Verified Blob C supersession/idempotency/QHSE regression'; end if;
 perform set_config('test.latest.publication_id',c.id::text,true);
end $$;
reset role;
reset session authorization;

-- A downstream failure rolls back both pruning and the restricted QHSE FK move.
create function pg_temp.reject_fixture_source_update() returns trigger language plpgsql as $$
begin raise exception 'Fixture downstream failure'; end $$;
create trigger latest_fixture_reject_source_update before update on public.procedures
for each row when (new.document_number='982001' and new.status='published')
execute function pg_temp.reject_fixture_source_update();
set local session authorization authenticator;
set local role authenticated;
do $$
declare source public.procedures; b_id bigint:=current_setting('test.latest.publication_id')::bigint;
begin
 -- The test trigger permits a draft source edit but fails final lifecycle update.
 update public.procedures set status='draft',version_label='D'
 where id=current_setting('test.latest.source_id')::bigint returning * into source;
 begin
   perform public.publish_procedure_drive(source.id,public.procedure_drive_pdf_name(source),100,repeat('d',64));
   raise exception 'Downstream failure was not injected';
 exception when raise_exception then if sqlerrm<>'Fixture downstream failure' then raise; end if; end;
 if not exists(select 1 from public.published_procedures where id=b_id and status='published')
   or exists(select 1 from public.published_procedures where theme='LPR' and document_number='982001' and version_label='D')
   or not exists(select 1 from public.qhse_policy_settings where publication_id=b_id) then
   raise exception 'Failed publication did not restore B and QHSE selection atomically'; end if;
end $$;
reset role;
reset session authorization;
rollback;
