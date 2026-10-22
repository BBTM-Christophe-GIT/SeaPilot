-- Separate authenticated database profiles, never the current UI's role switch.
begin;
create temporary table document_drive_roles(user_id uuid,role_key text,person_id bigint,hr_path text);
insert into document_drive_roles(user_id,role_key) values
 ('dd120000-0000-4000-8000-000000000001','admin'),
 ('dd120000-0000-4000-8000-000000000002','direction'),
 ('dd120000-0000-4000-8000-000000000003','armement'),
 ('dd120000-0000-4000-8000-000000000004','capitaine'),
 ('dd120000-0000-4000-8000-000000000005','marin');
grant select on document_drive_roles to authenticated;
insert into auth.users(id,email) select user_id,role_key||'-document-drive@example.invalid' from document_drive_roles;
insert into public.profiles(id,email,display_name,active_company_id)
select r.user_id,r.role_key||'-document-drive@example.invalid','Document Drive fixture',c.id
from document_drive_roles r cross join public.companies c where c.code='bbtm';
insert into public.company_memberships(company_id,user_id,active)
select c.id,r.user_id,true from document_drive_roles r cross join public.companies c where c.code='bbtm'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select r.user_id,c.id,r.role_key from document_drive_roles r cross join public.companies c where c.code='bbtm';
insert into public.people(company_id,user_id,first_name,last_name,active)
select c.id,r.user_id,'DriveFixture',r.role_key,true from document_drive_roles r cross join public.companies c where c.code='bbtm';
update document_drive_roles r set person_id=p.id,hr_path='people/'||p.id||'/drive-fixture.pdf' from public.people p where p.user_id=r.user_id;
insert into public.hr_documents(company_id,person_id,category_key,title,status,source_label,
 storage_bucket,storage_path,file_size_bytes,mime_type)
select p.company_id,p.id,'administrative','Drive access fixture','valid','document-drive-test',
 'hr-documents',r.hr_path,7,'application/pdf'
from public.people p join document_drive_roles r on r.user_id=p.user_id;

insert into public.procedures(procedure_code,title,status,source_label,theme,document_number,
 source_storage_bucket,source_storage_path,source_file_name,source_mime_type,source_size_bytes)
values ('DDRV 9002-A','Private Drive fixture','draft','document-drive-test','DDRV','9002',
 'procedure-documents','sources/test/drive-private.docx','drive-private.docx',
 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',7);
insert into public.published_procedures(procedure_id,procedure_code,title,status,source_label,theme,document_number,
 storage_bucket,storage_path,file_name,mime_type,size_bytes)
select id,procedure_code,'Drive publication fixture','published','document-drive-test',theme,document_number,
 'procedure-documents','published/test/drive-published.pdf','drive-published.pdf','application/pdf',7
from public.procedures where procedure_code='DDRV 9002-A';
insert into public.published_procedures(procedure_id,procedure_code,title,status,source_label,theme,document_number,
 storage_bucket,storage_path,file_name,mime_type,size_bytes)
select id,procedure_code,'Draft Drive publication fixture','draft','document-drive-test',theme,document_number,
 'procedure-documents','published/test/drive-draft.pdf','drive-draft.pdf','application/pdf',7
from public.procedures where procedure_code='DDRV 9002-A';

insert into public.document_drive_files(source_bucket,source_path,drive_file_id,drive_path,file_name,mime_type,
 bytes,sha256,source_sha256,verified_at)
select 'hr-documents',r.hr_path,'fixture_drive_hr_'||r.person_id,
 'Ressources Humaines/DriveFixture-'||r.person_id||'/drive-fixture.pdf','drive-fixture.pdf','application/pdf',7,repeat('a',64),repeat('b',64),now()
from document_drive_roles r;
insert into public.document_drive_files(source_bucket,source_path,drive_file_id,drive_path,file_name,mime_type,
 bytes,sha256,source_sha256,verified_at)
values
 ('procedure-documents','sources/test/drive-private.docx','fixture_drive_source_123','Procedures/drive-private.docx','drive-private.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',7,repeat('a',64),repeat('b',64),now()),
 ('procedure-documents','published/test/drive-published.pdf','fixture_drive_public_123','Procedures PDF/drive-published.pdf','drive-published.pdf','application/pdf',7,repeat('a',64),repeat('b',64),now()),
 ('procedure-documents','published/test/drive-draft.pdf','fixture_drive_draft_123','Procedures PDF/drive-draft.pdf','drive-draft.pdf','application/pdf',7,repeat('a',64),repeat('b',64),now()),
 ('fleet-certificates','987654321/test/drive-other-company.pdf','fixture_drive_other_123','Flotte/other-company.pdf','other-company.pdf','application/pdf',7,repeat('a',64),repeat('b',64),now());
insert into public.document_drive_files(source_bucket,source_path,drive_file_id,drive_path,file_name,mime_type,
 bytes,sha256,source_sha256,verified_at)
select 'fleet-certificates',c.id||'/test/drive-fleet.pdf','fixture_drive_fleet_123','Flotte/drive-fleet.pdf','drive-fleet.pdf','application/pdf',7,repeat('a',64),repeat('b',64),now()
from public.companies c where c.code='bbtm';

-- Register the fleet fixture as a certificate rather than unrelated shared-bucket evidence.
insert into public.fleet_certificates(company_id,title,storage_bucket,storage_path)
select c.id,'Drive certificate access fixture','fleet-certificates',c.id||'/test/drive-fleet.pdf'
from public.companies c where c.code='bbtm';

-- A former project attachment can remain in project_drive_files after its
-- billing row is removed. Retain that table's exact existing RLS rights.
insert into public.projects(title,project_code,status,source_label,company_id)
select 'Drive orphan reference fixture','DDRV9002','Brouillon','seapilot',c.id from public.companies c where c.code='bbtm';
insert into public.project_drive_folders(project_id,company_id,folder_name)
select p.id,p.company_id,'Projet-'||p.id from public.projects p where p.title='Drive orphan reference fixture';
insert into public.project_drive_files(project_id,company_id,source_bucket,source_path,path,sha256,bytes,mime_type)
select p.id,p.company_id,'project-files','projects/'||p.id||'/orphan/fixture.pdf','Projet-'||p.id||'/fixture.pdf',repeat('a',64),7,'application/pdf'
from public.projects p where p.title='Drive orphan reference fixture';
insert into public.document_drive_files(source_bucket,source_path,drive_file_id,drive_path,file_name,mime_type,bytes,sha256,source_sha256,verified_at)
select 'project-files',d.source_path,'fixture_drive_project_orphan','Projet/'||d.path,'fixture.pdf','application/pdf',7,repeat('a',64),repeat('b',64),now()
from public.project_drive_files d join public.projects p on p.id=d.project_id where p.title='Drive orphan reference fixture';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
do $$
declare r record; other record; fleet_path text; response jsonb;
begin
 for r in select * from document_drive_roles loop
  perform set_config('request.jwt.claim.sub',r.user_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',r.user_id,'role','authenticated')::text,true);
  response:=public.document_drive_lookup('hr-documents',r.hr_path);
  assert response->>'drive_file_id'='fixture_drive_hr_'||r.person_id,'Every real profile reads its own RH document';
  assert response->>'sha256'=repeat('a',64),'The current Drive hash is distinct from the old Storage hash';
  assert public.document_drive_lookup('procedure-documents','published/test/drive-published.pdf') is not null,'Every real profile reads a published PDF';
  fleet_path:=public.current_planning_company_id()||'/test/drive-fleet.pdf';
  if r.role_key <> 'marin' then
   assert public.document_drive_lookup('fleet-certificates',fleet_path) is not null,'Every non-Marin profile keeps fleet certificate access';
  else
   begin perform public.document_drive_lookup('fleet-certificates',fleet_path); raise exception 'Marin downloaded a fleet certificate';
   exception when insufficient_privilege then null; end;
  end if;
  assert public.document_drive_lookup('hr-documents','no-such-object.pdf') is null,'An unmapped legacy object remains distinguishable from denied mapped content';
  if r.role_key in ('admin','direction') then
   assert public.document_drive_lookup('procedure-documents','sources/test/drive-private.docx') is not null,'Admin and Direction read source files';
   assert public.document_drive_lookup('procedure-documents','published/test/drive-draft.pdf') is not null,'Admin and Direction audit draft publications';
   assert exists(select 1 from public.document_drive_files where drive_file_id='fixture_drive_project_orphan'),'Admin and Direction retain access to a former project file under project_drive_files RLS';
  else
   begin perform public.document_drive_lookup('procedure-documents','sources/test/drive-private.docx'); raise exception 'Private source leaked';
   exception when insufficient_privilege then null; end;
   begin perform public.document_drive_lookup('procedure-documents','published/test/drive-draft.pdf'); raise exception 'Draft publication leaked';
   exception when insufficient_privilege then null; end;
   assert not exists(select 1 from public.document_drive_files where source_path='sources/test/drive-private.docx'),'Direct table reads retain source RLS';
   assert not exists(select 1 from public.document_drive_files where drive_file_id='fixture_drive_project_orphan'),'Other profiles cannot read unlinked project documents';
  end if;
  for other in select * from document_drive_roles where user_id<>r.user_id loop
   if r.role_key in ('admin','direction','armement') then
    assert public.document_drive_lookup('hr-documents',other.hr_path) is not null,'Office profiles keep collaborator access';
   else
    begin perform public.document_drive_lookup('hr-documents',other.hr_path); raise exception 'Unassigned collaborator RH document leaked';
    exception when insufficient_privilege then null; end;
   end if;
  end loop;
  begin perform public.document_drive_lookup('fleet-certificates','987654321/test/drive-other-company.pdf'); raise exception 'Cross-company file leaked';
  exception when insufficient_privilege then null; end;
  begin update public.document_drive_files set drive_file_id='forged_drive_file_123' where source_path=r.hr_path; raise exception 'Authenticated caller replaced a verified mapping';
  exception when insufficient_privilege then null; end;
 end loop;
end $$;
reset role;
-- A migrated source remains usable by both the preview and apply RPCs after
-- its Storage row is gone. The original source hash binds the migration proof.
do $$
declare context jsonb; result jsonb; person bigint; batch bigint; object_path text;
 rows jsonb:='[{"sheet":"January","row":2,"date":"2026-01-01","reported_work_seconds":3600,"detected_phases":[{"start_minute":480,"end_minute":540}],"phases":[{"start_minute":480,"end_minute":540}]}]'::jsonb;
begin
 perform set_config('request.jwt.claim.sub','dd120000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"sub":"dd120000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 execute 'set local role authenticated';
 person:=public.current_person_id();
 context:=public.working_time_import_upload_context('DriveFixture - 2026.xlsm','application/vnd.ms-excel.sheet.macroEnabled.12',7,repeat('c',64));
 batch:=(context->>'batch_id')::bigint; object_path:=context->>'storage_path';
 execute 'reset role';
 assert not exists(select 1 from storage.objects where bucket_id='working-time-imports' and name=object_path),'The preview fixture has no physical Storage copy';
 insert into public.document_drive_files(source_bucket,source_path,drive_file_id,drive_path,file_name,mime_type,bytes,sha256,source_sha256,verified_at)
 values('working-time-imports',object_path,'fixture_drive_import_123','Ressources Humaines/Fixture/Temps de travail/2026/fixture.xlsm','fixture.xlsm',
   'application/vnd.ms-excel.sheet.macroEnabled.12',7,repeat('c',64),repeat('c',64),now());
 execute 'set local role authenticated';
 result:=public.preview_working_time_import(batch,person,2026,'Europe/Paris','DriveFixture Admin','drive-migration-test','{}'::jsonb,rows);
 assert result->>'status'='preview_ready','The real preview RPC accepts a verified Drive source';
 execute 'reset role';
 update public.document_drive_files set source_sha256=repeat('d',64) where source_bucket='working-time-imports' and source_path=object_path;
 execute 'set local role authenticated';
 begin perform public.preview_working_time_import(batch,person,2026,'Europe/Paris','DriveFixture Admin','drive-migration-test','{}'::jsonb,rows); raise exception 'Wrong source hash accepted';
 exception when object_not_in_prerequisite_state then assert SQLERRM='WORKING_TIME_IMPORT_SOURCE_NOT_UPLOADED.','The missing verified source is the reason for rejection'; end;
 execute 'reset role';
 update public.document_drive_files set source_sha256=repeat('c',64),active=false where source_bucket='working-time-imports' and source_path=object_path;
 execute 'set local role authenticated';
 begin perform public.preview_working_time_import(batch,person,2026,'Europe/Paris','DriveFixture Admin','drive-migration-test','{}'::jsonb,rows); raise exception 'Inactive import source accepted';
 exception when object_not_in_prerequisite_state then assert SQLERRM='WORKING_TIME_IMPORT_SOURCE_NOT_UPLOADED.','An inactive mapped source blocks preview'; end;
 execute 'reset role';
 update public.document_drive_files set active=true where source_bucket='working-time-imports' and source_path=object_path;
 perform set_config('request.jwt.claim.sub','dd120000-0000-4000-8000-000000000005',true);
 perform set_config('request.jwt.claims','{"sub":"dd120000-0000-4000-8000-000000000005","role":"authenticated"}',true);
 execute 'set local role authenticated';
 begin perform public.preview_working_time_import(batch,person,2026,'Europe/Paris','DriveFixture Admin','drive-migration-test','{}'::jsonb,rows); raise exception 'Marin previewed an administrative import';
 exception when insufficient_privilege then null; end;
 begin perform public.commit_working_time_import(batch); raise exception 'Marin applied an administrative import';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub','dd120000-0000-4000-8000-000000000001',true);
 perform set_config('request.jwt.claims','{"sub":"dd120000-0000-4000-8000-000000000001","role":"authenticated"}',true);
 execute 'set local role authenticated';
 result:=public.commit_working_time_import(batch);
 assert result->>'status'='imported','The real apply RPC completes without a Storage source';
 execute 'reset role';
 update public.document_drive_files set active=false where source_bucket='working-time-imports' and source_path=object_path;
 execute 'set local role authenticated';
 begin perform public.document_drive_lookup('working-time-imports',object_path); raise exception 'Inactive mapping permitted a legacy fallback';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
set local role anon;
do $$ begin
 begin perform public.document_drive_lookup('procedure-documents','published/test/drive-published.pdf'); raise exception 'Anonymous Drive lookup succeeded';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: real Admin/Direction/Armement/Capitaine/Marin document access; private RH/source/draft/company boundaries; immutable verified references; anonymous denied' as result;
rollback;
