-- Real independent authenticated profiles, never the application's role preview.
-- Includes Storage, Drive, Blob, old versions and former-uploader protection.
begin;
create temporary table certificate_download_actors(user_id uuid, role_key text, active boolean);
insert into certificate_download_actors values
 ('fc220000-0000-4000-8000-000000000001','admin',true),
 ('fc220000-0000-4000-8000-000000000002','direction',true),
 ('fc220000-0000-4000-8000-000000000003','armement',true),
 ('fc220000-0000-4000-8000-000000000004','capitaine',true),
 ('fc220000-0000-4000-8000-000000000005','marin',true),
 ('fc220000-0000-4000-8000-000000000006',null,true),
 ('fc220000-0000-4000-8000-000000000007','capitaine',false);
grant select on certificate_download_actors to authenticated;
insert into auth.users(id,email)
select user_id,user_id||'@certificate-download.example.invalid' from certificate_download_actors;
insert into public.profiles(id,email,display_name,active_company_id)
select a.user_id,a.user_id||'@certificate-download.example.invalid','Certificate download fixture',c.id
from certificate_download_actors a cross join public.companies c where c.code='bbtm';
insert into public.company_memberships(company_id,user_id,active)
select c.id,a.user_id,a.active from certificate_download_actors a cross join public.companies c where c.code='bbtm'
on conflict(company_id,user_id) do update set active=excluded.active;
insert into public.user_roles(user_id,company_id,role_key)
select a.user_id,c.id,a.role_key from certificate_download_actors a cross join public.companies c
where c.code='bbtm' and a.role_key is not null;
create temporary table certificate_download_paths(kind text,path text);
insert into certificate_download_paths
select k,c.id||'/download-role-fixture/'||k||'.pdf'
from public.companies c cross join unnest(array['current','archived','evidence','former-uploader']) k where c.code='bbtm';
insert into certificate_download_paths values('wrong-company','987654321/download-role-fixture/current.pdf');
grant select on certificate_download_paths to authenticated;
insert into public.fleet_certificates(company_id,title,storage_bucket,storage_path)
select c.id,'Download role fixture','fleet-certificates',p.path
from public.companies c cross join certificate_download_paths p where c.code='bbtm' and p.kind='current';
insert into public.fleet_certificate_versions(company_id,certificate_id,version_no,status,
 original_file_name,normalized_file_name,storage_bucket,storage_path)
select c.company_id,c.id,99,'archived','archived.pdf','archived.pdf','fleet-certificates',p.path
from public.fleet_certificates c cross join certificate_download_paths p
where c.title='Download role fixture' and p.kind='archived';
-- The former uploader's file remains a registered historical certificate.
insert into public.fleet_certificate_versions(company_id,certificate_id,version_no,status,
 original_file_name,normalized_file_name,storage_bucket,storage_path)
select c.company_id,c.id,100,'archived','former-uploader.pdf','former-uploader.pdf','fleet-certificates',p.path
from public.fleet_certificates c cross join certificate_download_paths p
where c.title='Download role fixture' and p.kind='former-uploader';
insert into storage.objects(bucket_id,name,metadata)
select 'fleet-certificates',path,'{"mimetype":"application/pdf","size":7}'::jsonb from certificate_download_paths;
insert into public.document_drive_files(source_bucket,source_path,drive_file_id,drive_path,
 file_name,mime_type,bytes,sha256,source_sha256,verified_at)
select 'fleet-certificates',path,'certificate_fixture_'||kind,'Fixture/'||kind||'.pdf',kind||'.pdf',
 'application/pdf',7,repeat('a',64),repeat('a',64),now() from certificate_download_paths;
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,
 file_name,mime_type,bytes,sha256,source_sha256,verified_at,uploader_id)
select 'fleet-certificates',path,'documents/certificate-download-test/'||kind,
 'https://fixture.private.blob.vercel-storage.com/documents/certificate-download-test/'||kind,
 kind||'.pdf','application/pdf',7,repeat('a',64),repeat('a',64),now(),
 case when kind='former-uploader' then 'fc220000-0000-4000-8000-000000000005'::uuid end
from certificate_download_paths;

-- Test the restrictive guard even if an existing permissive owner policy grants
-- a former uploader read access. RLS permissive grants must not override it.
create policy certificate_download_test_former_owner on public.document_blob_files
for select to authenticated using(uploader_id=auth.uid());

do $$
declare actor record; p record; expected boolean; visible integer;
begin
 for actor in select * from certificate_download_actors loop
  perform set_config('request.jwt.claim.sub',actor.user_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',actor.user_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  expected:=actor.active and actor.role_key in ('admin','direction','armement','capitaine');
  assert public.can_download_fleet_certificates()=coalesce(expected,false),'Download role or active membership mismatch';
  for p in select * from certificate_download_paths where kind<>'evidence' loop
   expected:=actor.active and coalesce(actor.role_key in ('admin','direction','armement','capitaine'),false)
     and p.kind<>'wrong-company';
   select count(*) into visible from storage.objects where bucket_id='fleet-certificates' and name=p.path;
   assert (visible=1)=expected,format('Storage access mismatch: %s / %s',actor.role_key,p.kind);
   assert public.document_drive_can_read('fleet-certificates',p.path)=expected,format('Drive predicate mismatch: %s / %s',actor.role_key,p.kind);
   assert public.document_blob_can_read('fleet-certificates',p.path)=expected,format('Blob predicate mismatch: %s / %s',actor.role_key,p.kind);
   if expected then
    assert public.document_drive_lookup('fleet-certificates',p.path) is not null,'Allowed profile denied Drive lookup';
    assert public.document_blob_lookup('fleet-certificates',p.path) is not null,'Allowed profile denied Blob lookup';
   else
    begin perform public.document_drive_lookup('fleet-certificates',p.path); raise exception 'Forbidden Drive lookup succeeded';
    exception when insufficient_privilege then null; end;
    begin perform public.document_blob_lookup('fleet-certificates',p.path); raise exception 'Forbidden Blob lookup succeeded';
    exception when insufficient_privilege then null; end;
   end if;
  end loop;
  -- Finding evidence and LSA/register files share the bucket and retain their
  -- previous role rules; this change does not deny them merely for being Marin.
  if actor.role_key='marin' then
   assert public.document_drive_lookup('fleet-certificates',(select path from certificate_download_paths where kind='evidence')) is not null,'Unrelated shared-bucket evidence was denied';
   assert public.document_blob_lookup('fleet-certificates',(select path from certificate_download_paths where kind='evidence')) is not null,'Unrelated Blob evidence was denied';
   assert not exists(select 1 from public.document_blob_files where source_bucket='fleet-certificates'
     and source_path=(select path from certificate_download_paths where kind='former-uploader')),'Former-uploader OR policy bypassed certificate restriction';
  end if;
  execute 'reset role';
 end loop;
 -- Signed-out callers cannot execute the public authorization or lookup RPCs.
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claims','{"role":"anon"}',true);
 execute 'set local role anon';
 begin perform public.can_download_fleet_certificates(); raise exception 'Anonymous authorization RPC allowed';
 exception when insufficient_privilege then null; end;
 begin perform public.document_drive_lookup('fleet-certificates','1/download-role-fixture/current.pdf'); raise exception 'Anonymous Drive lookup allowed';
 exception when insufficient_privilege then null; end;
 begin perform public.document_blob_lookup('fleet-certificates','1/download-role-fixture/current.pdf'); raise exception 'Anonymous Blob lookup allowed';
 exception when insufficient_privilege then null; end;
 execute 'reset role';
end $$;
select 'PASS: every non-Marin profile downloads certificates; Marin, no-role, inactive, anonymous and cross-company requests denied; archived/uploader bypasses blocked; finding evidence preserved' as result;
rollback;
