-- Independent real profiles and rollback checks; all fixture changes roll back.
begin;
select extensions.no_plan();
create temporary table atomic_roles(role_key text primary key,user_id uuid);
insert into atomic_roles values
 ('admin','ab151021-0000-4000-8000-000000000001'),
 ('direction','ab151021-0000-4000-8000-000000000002'),
 ('armement','ab151021-0000-4000-8000-000000000003'),
 ('capitaine','ab151021-0000-4000-8000-000000000004'),
 ('marin','ab151021-0000-4000-8000-000000000005');
insert into auth.users(id,email) select user_id,role_key||'-atomic@example.invalid' from atomic_roles;
insert into public.profiles(id,email,display_name,active_company_id)
select r.user_id,r.role_key||'-atomic@example.invalid','Atomic fixture',c.id
from atomic_roles r cross join public.companies c where c.code='bbtm';
insert into public.company_memberships(company_id,user_id,active)
select c.id,r.user_id,true from atomic_roles r cross join public.companies c where c.code='bbtm'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select r.user_id,c.id,r.role_key from atomic_roles r cross join public.companies c where c.code='bbtm';
create temporary table atomic_sources(kind text primary key,id bigint);
with sources as (
 insert into public.procedures(procedure_code,title,status,source_label,theme,document_number,
   version_label,revision_label,tags,ism_chapter)
 select 'ATP '||n||'-B',kind,'draft','atomic-test','ATP',n,'B','B',array['Sécurité'],'02'
 from (values ('native','98101'),('blob','98102'),('drive','98103'),('missing','98104'),
   ('inactive','98105'),('rollback','98106'),('badmime','98107'),('badsize','98108'),('badname','98109')) x(kind,n)
 returning id,title
) insert into atomic_sources select title,id from sources;
create temporary table atomic_old_publication(id bigint);
with inserted as (
 insert into public.published_procedures(procedure_id,procedure_code,title,status,source_label,theme,
   document_number,version_label,revision_label,storage_bucket,storage_path,file_name,mime_type,size_bytes)
 select p.id,'ATP 98106-A','Old PDF','published','atomic-test',p.theme,p.document_number,'A','A',
   'procedure-documents','published/'||p.id||'/old.pdf','old.pdf','application/pdf',7
 from public.procedures p join atomic_sources s on s.id=p.id where s.kind='rollback' returning id
) insert into atomic_old_publication select id from inserted;
insert into public.qhse_policy_settings(company_id,publication_id)
select c.id,p.id from public.companies c cross join atomic_old_publication p where c.code='bbtm'
on conflict(company_id) do update set publication_id=excluded.publication_id,document_url='';
insert into storage.objects(bucket_id,name,metadata)
select 'procedure-documents','published/'||id||'/fixture.pdf',
  jsonb_build_object('mimetype',case when kind='badmime' then 'text/plain' else 'application/pdf' end,
    'size',case when kind='badsize' then 8 else 7 end)
from atomic_sources where kind in ('native','inactive','rollback','badmime','badsize');
insert into public.document_blob_files(source_bucket,source_path,blob_pathname,blob_url,
  file_name,mime_type,bytes,sha256,source_sha256,verified_at,active)
select 'procedure-documents','published/'||id||'/fixture.pdf','documents/atomic/'||id,
  'https://fixture.private.blob.vercel-storage.com/documents/atomic/'||id,
  case when kind='badname' then 'different.pdf' else 'fixture.pdf' end,'application/pdf',7,
  repeat('a',64),repeat('a',64),now(),kind<>'inactive'
from atomic_sources where kind in ('blob','inactive','badname');
insert into public.document_drive_files(source_bucket,source_path,drive_file_id,drive_path,
  file_name,mime_type,bytes,sha256,source_sha256,verified_at)
select 'procedure-documents','published/'||id||'/fixture.pdf','atomic_drive_file_'||id,
  'Documents/fixture.pdf','fixture.pdf','application/pdf',7,repeat('a',64),repeat('a',64),now()
from atomic_sources where kind='drive';
create function pg_temp.fail_atomic_source_update() returns trigger language plpgsql as $$
begin
 if new.title='rollback' and new.status='published' then
   if exists(select 1 from public.published_procedures p where p.procedure_id=new.id and p.version_label='A') then
     raise exception 'ATOMIC_PRUNING_DID_NOT_RUN';
   end if;
   raise exception 'ATOMIC_SOURCE_UPDATE_FAILED' using errcode='P0001';
 end if;
 return new;
end $$;
create trigger atomic_source_update_failure before update on public.procedures
for each row execute function pg_temp.fail_atomic_source_update();
grant select on atomic_roles,atomic_sources,atomic_old_publication to authenticated;
create function pg_temp.atomic_source_stamp(target_id bigint) returns jsonb language sql as $$
 select jsonb_build_object('theme',coalesce(theme,''),'document_number',coalesce(document_number,''),
   'version_label',coalesce(version_label,''),'revision_label',coalesce(revision_label,''))
 from public.procedures where id=target_id;
$$;
create function pg_temp.atomic_actor(target_role text) returns void language plpgsql as $$
declare actor uuid;
begin
 select user_id into actor from atomic_roles where role_key=target_role;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;

select extensions.ok(not (select prosecdef from pg_proc
 where oid='public.publish_procedure_uploaded_pdf(bigint,text,text,bigint,jsonb)'::regprocedure),
 'The File publication RPC retains caller RLS');
select extensions.ok(not has_function_privilege('anon',
 'public.publish_procedure_uploaded_pdf(bigint,text,text,bigint,jsonb)','execute'),
 'Anonymous clients cannot call the publication RPC');

set local session authorization authenticator;
set local role authenticated;
do $$begin perform pg_temp.atomic_actor('marin');end $$;
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), '42501','Publication non autorisée.',
 'An actual Marin cannot publish a PDF') from atomic_sources where kind='native';
do $$begin perform pg_temp.atomic_actor('capitaine');end $$;
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), '42501','Publication non autorisée.',
 'An actual Capitaine cannot publish a PDF') from atomic_sources where kind='native';
do $$begin perform pg_temp.atomic_actor('armement');end $$;
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), '42501','Publication non autorisée.',
 'An actual Armement cannot publish a PDF') from atomic_sources where kind='native';

do $$begin perform pg_temp.atomic_actor('admin');end $$;
select extensions.throws_ok($test$select public.publish_procedure_uploaded_pdf(-1,'published/1/fixture.pdf','fixture.pdf',7,'{}')$test$,
 '42501','Source inaccessible.','Unknown source IDs do not create publications');
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',
 pg_temp.atomic_source_stamp(id)||'{"version_label":"A","revision_label":"A"}'::jsonb),
 '40001','La référence ou la version source a changé. Rechargez la procédure avant de publier.',
 'A stale version A PDF cannot be reclassified as the current version B') from atomic_sources where kind='native';
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',
 pg_temp.atomic_source_stamp(id)||'{"theme":"OTHER","document_number":"1"}'::jsonb),
 '40001','La référence ou la version source a changé. Rechargez la procédure avant de publier.',
 'A stale reference cannot prune PDFs under a different current reference') from atomic_sources where kind='native';
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'sources/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), '22023','Fichier PDF invalide.',
 'Source paths cannot be repurposed as publication paths') from atomic_sources where kind='native';
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/999999999/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), '22023','Fichier PDF invalide.',
 'The uploaded path must belong to this source') from atomic_sources where kind='native';
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','../fixture.pdf',pg_temp.atomic_source_stamp(id)), '22023','Fichier PDF invalide.',
 'The display filename must be a PDF basename') from atomic_sources where kind='native';
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,0,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), '22023','Fichier PDF invalide.',
 'An empty PDF cannot be published') from atomic_sources where kind='native';
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), '55000','Vérifiez le PDF téléversé avant de le publier.',
 'Missing uploaded bytes reject the entire publication') from atomic_sources where kind='missing';
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), '55000','Vérifiez le PDF téléversé avant de le publier.',
 'An inactive Blob never falls back to its retained Storage copy') from atomic_sources where kind='inactive';
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), '55000','Vérifiez le PDF téléversé avant de le publier.',
 'Native object metadata must confirm the PDF MIME') from atomic_sources where kind='badmime';
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), '55000','Vérifiez le PDF téléversé avant de le publier.',
 'Native object metadata must confirm the exact byte count') from atomic_sources where kind='badsize';
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), '55000','Vérifiez le PDF téléversé avant de le publier.',
 'Verified Blob metadata must confirm the exact filename') from atomic_sources where kind='badname';
select extensions.is((select count(*)::integer from public.published_procedures p
 join atomic_sources s on s.id=p.procedure_id where s.kind in ('missing','inactive','badmime','badsize','badname')),0,
 'Rejected metadata leaves no published row');

select extensions.lives_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), 'Admin publishes an uploaded native PDF')
 from atomic_sources where kind='native';
select extensions.ok((select p.status='published' and p.version_label='B' and p.tags=array['Sécurité']
 from public.published_procedures p join atomic_sources s on s.id=p.procedure_id where s.kind='native'),
 'The publication inherits the current version and tags from the source database row');
select extensions.ok((select p.status='published' and p.published_on=(now() at time zone 'Europe/Paris')::date
 and p.diffusion_on=p.published_on from public.procedures p join atomic_sources s on s.id=p.id where s.kind='native'),
 'Successful publication updates the source lifecycle in the same call');
select extensions.lives_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), 'Admin publishes a verified Blob PDF')
 from atomic_sources where kind='blob';
do $$begin perform pg_temp.atomic_actor('direction');end $$;
select extensions.lives_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), 'Direction publishes a verified Drive PDF')
 from atomic_sources where kind='drive';

do $$begin perform pg_temp.atomic_actor('admin');end $$;
select extensions.throws_ok(format('select public.publish_procedure_uploaded_pdf(%s,%L,%L,7,%L::jsonb)',id,
 'published/'||id||'/fixture.pdf','fixture.pdf',pg_temp.atomic_source_stamp(id)), 'P0001','ATOMIC_SOURCE_UPDATE_FAILED',
 'A later source update failure rolls back publication and automatic pruning')
 from atomic_sources where kind='rollback';
select extensions.is((select count(*)::integer from public.published_procedures p
 join atomic_old_publication o on o.id=p.id),1,'The previous lower PDF survives a failed source update');
select extensions.is((select count(*)::integer from public.published_procedures p
 join atomic_sources s on s.id=p.procedure_id where s.kind='rollback' and p.version_label='B'),0,
 'The failed new revision has no published row');
select extensions.ok((select status='draft' from public.procedures p join atomic_sources s on s.id=p.id
 where s.kind='rollback'),'The failed source lifecycle remains unchanged');
reset role;
reset session authorization;
select extensions.is((select s.publication_id from public.qhse_policy_settings s
 join public.companies c on c.id=s.company_id where c.code='bbtm'),(select id from atomic_old_publication),
 'QHSE still links to the prior PDF after rollback');
set local session authorization authenticator;
set local role authenticated;
do $$begin perform pg_temp.atomic_actor('marin');end $$;
select extensions.is((select count(*)::integer from public.published_procedures p
 join atomic_sources s on s.id=p.procedure_id where s.kind in ('native','blob','drive')),3,
 'The actual Marin reads the successfully published PDF rows');
do $$begin perform pg_temp.atomic_actor('capitaine');end $$;
select extensions.is((select count(*)::integer from public.published_procedures p
 join atomic_sources s on s.id=p.procedure_id where s.kind in ('native','blob','drive')),3,
 'The actual Capitaine reads the successfully published PDF rows');
reset role;
reset session authorization;
select * from extensions.finish();
rollback;
