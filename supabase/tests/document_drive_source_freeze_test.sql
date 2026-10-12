-- Local RLS fixtures only; every synthetic metadata row is rolled back.
begin;
insert into auth.users(id,email) values ('dd130000-0000-4000-8000-000000000001','source-freeze@example.invalid');
insert into public.profiles(id,email,display_name,active_company_id)
select 'dd130000-0000-4000-8000-000000000001','source-freeze@example.invalid','Source freeze fixture',id from public.companies where code='bbtm';
insert into public.company_memberships(company_id,user_id,active)
select id,'dd130000-0000-4000-8000-000000000001',true from public.companies where code='bbtm'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select 'dd130000-0000-4000-8000-000000000001',id,'admin' from public.companies where code='bbtm';
insert into public.procedures(procedure_code,title,status,source_label,theme,document_number,
 source_storage_bucket,source_storage_path,source_file_name,source_mime_type,source_size_bytes)
values ('DDRV 9003-A','Frozen source fixture','draft','document-drive-test','DDRV','9003',
 'procedure-documents','sources/test/drive-frozen.docx','drive-frozen.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',7),
 ('DDRV 9004-A','Unfrozen source fixture','draft','document-drive-test','DDRV','9004',
 'procedure-documents','sources/test/drive-unfrozen.docx','drive-unfrozen.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',7);
insert into storage.objects(bucket_id,name,owner_id,metadata) values
 ('procedure-documents','sources/test/drive-frozen.docx','dd130000-0000-4000-8000-000000000001','{"size":7}'),
 ('procedure-documents','sources/test/drive-unfrozen.docx','dd130000-0000-4000-8000-000000000001','{"size":7}');
insert into storage.objects(bucket_id,name,owner_id,metadata)
select 'fleet-certificates',id||'/test/drive-unfrozen-photo.jpg','dd130000-0000-4000-8000-000000000001','{"size":7}' from public.companies where code='bbtm';
insert into document_drive_private.frozen_sources(source_bucket,source_path) values
 ('procedure-documents','sources/test/drive-frozen.docx'),
 ('procedure-documents','sources/test/drive-frozen-tombstone.pdf');
-- The actual Storage API sets this for deletes. It is used only inside this
-- rollback transaction to exercise the SQL RLS against synthetic metadata.
select set_config('storage.allow_delete_query','true',true);
select set_config('request.jwt.claim.sub','dd130000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"dd130000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
do $$ declare changed integer; begin
 assert exists(select 1 from storage.objects where bucket_id='procedure-documents' and name='sources/test/drive-frozen.docx'),'Frozen source reads keep their original authorization';
 assert exists(select 1 from storage.objects where bucket_id='fleet-certificates' and name like '%/test/drive-unfrozen-photo.jpg'),'Photos retain their original read access';
 begin insert into storage.objects(bucket_id,name) values('procedure-documents','sources/test/drive-frozen-tombstone.pdf'); raise exception 'Recreated a frozen source';
 exception when insufficient_privilege then null; end;
 update storage.objects set metadata='{"size":8}' where bucket_id='procedure-documents' and name='sources/test/drive-frozen.docx';
 get diagnostics changed=row_count; assert changed=0,'A frozen source cannot be overwritten';
 delete from storage.objects where bucket_id='procedure-documents' and name='sources/test/drive-frozen.docx';
 get diagnostics changed=row_count; assert changed=0,'A user cannot delete a frozen source';
 begin update storage.objects set name='sources/test/drive-frozen-tombstone.pdf' where bucket_id='procedure-documents' and name='sources/test/drive-unfrozen.docx'; raise exception 'Renamed into a frozen path';
 exception when insufficient_privilege then null; end;
 update storage.objects set metadata='{"size":8}' where bucket_id='procedure-documents' and name='sources/test/drive-unfrozen.docx';
 get diagnostics changed=row_count; assert changed=1,'Other source writes retain their original permission';
 insert into storage.objects(bucket_id,name) values('procedure-documents','sources/test/drive-unfrozen-new.pdf');
 begin select 1 from document_drive_private.frozen_sources; raise exception 'Private source registry leaked';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ declare changed integer; begin
 update storage.objects set metadata='{"size":9}' where bucket_id='procedure-documents' and name='sources/test/drive-frozen.docx';
 get diagnostics changed=row_count; assert changed=1,'Service role bypass confirms upload jobs must be suspended';
end $$;
reset role;
select 'PASS: frozen paths reject authenticated insert/update/delete and rename; reads/photos/unrelated paths retain access; service-role bypass explicit' as result;
rollback;
