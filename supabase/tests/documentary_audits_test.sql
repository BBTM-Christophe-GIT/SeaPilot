begin;
select no_plan();
-- Local snapshots may lack existing project-document grants already present in
-- production. Restore them only for this rolled-back Storage-policy fixture.
grant select on public.project_billing_documents,public.project_generated_documents,public.contract_documents to authenticated;
select set_config('storage.allow_delete_query','true',true);

select is((select public from storage.buckets where id='documentary-audit-files'),false,'documentary evidence bucket is private');
select is((select file_size_limit from storage.buckets where id='documentary-audit-files'),26214400::bigint,'documentary bucket limit is 25 MiB');
select ok((select allowed_mime_types @> array['application/pdf','text/plain','text/csv','image/jpeg','image/png','image/webp'] from storage.buckets where id='documentary-audit-files'),'bucket allows the document and preview formats');
select ok(not has_table_privilege('authenticated','public.documentary_audits','INSERT'),'clients cannot insert dossiers directly');
select ok(not has_table_privilege('authenticated','public.documentary_audit_findings','UPDATE'),'clients cannot modify findings directly');
select ok(not has_table_privilege('authenticated','public.documentary_audit_events','DELETE'),'clients cannot remove history');
select ok(not has_function_privilege('anon','public.documentary_audit_save(jsonb)','EXECUTE'),'anonymous callers cannot save dossiers');
select ok(not has_function_privilege('anon','public.documentary_audits_overview(text)','EXECUTE'),'anonymous callers cannot list dossiers');
select is((select count(*)::integer from pg_proc function join pg_namespace schema on schema.oid=function.pronamespace where schema.nspname='public' and function.proname like 'documentary_audit%' and function.prosecdef),0,'all five public RPCs use invoker security');
select is((select count(*)::integer from public.role_module_permissions where module_key='ovid' and role_key in ('admin','direction','armement','capitaine','marin')),5,'OVID navigation is seeded for all five real profiles');
-- A concurrent INSERT can become visible only at ON CONFLICT. In that case
-- there was no locked prior snapshot, so the losing creation must not UPDATE
-- its empty evidence list over the committed record. Existing edits remain
-- covered by the workflow tests below; these guards protect that race.
select matches(lower(pg_get_functiondef('documentary_audit_private.save_audit(jsonb)'::regprocedure)),
  'where old_audit\.id is not null and documentary_audits\.company_id=excluded\.company_id',
  'a dossier UUID creation collision cannot overwrite a concurrent committed evidence list');
select matches(lower(pg_get_functiondef('documentary_audit_private.save_finding(jsonb)'::regprocedure)),
  'where old_finding\.id is not null and documentary_audit_findings\.company_id=excluded\.company_id',
  'a finding UUID creation collision cannot overwrite a concurrent committed evidence list');

insert into public.companies(code,name) values('documentary-test-other','Documentary other tenant');
insert into auth.users(id,email)
select ('9d000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'documentary-'||n||'@example.invalid' from generate_series(1,8) n;
insert into public.profiles(id,email,display_name,active_company_id)
select account.id,account.email,'Documentary actor '||right(account.id::text,1),company.id
from auth.users account join public.companies company on company.code=case when right(account.id::text,1)='5' then 'documentary-test-other' else 'bbtm' end
where account.id::text like '9d000000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like '9d000000-%'
on conflict(company_id,user_id) do update set active=excluded.active;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '1' then 'armement' when '2' then 'capitaine' when '5' then 'admin' else 'marin' end
from public.profiles where id::text like '9d000000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label)
select active_company_id,id,'Documentary',display_name,case right(id::text,1) when '2' then 'Capitaine' when '6' then 'Chef Mécanicien' else 'Matelot' end
from public.profiles where id::text like '9d000000-%';
insert into public.vessels(company_id,name,active)
select company.id,fixture.name,fixture.active from public.companies company cross join(values
 ('DOCUMENTARY VESSEL',true),('DOCUMENTARY INACTIVE',false),('DOCUMENTARY SECOND',true)
) fixture(name,active) where company.code='bbtm';
insert into public.vessels(company_id,name) select id,'DOCUMENTARY OTHER VESSEL' from public.companies where code='documentary-test-other';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status,source_label)
select vessel.company_id,vessel.id,captain.id,crew.id,current_date-1,current_date+1,'crew',case when right(crew.user_id::text,1)='8' then 'provisional' else 'confirmed' end,'documentary-test'
from public.vessels vessel cross join public.people captain cross join public.people crew
where vessel.name='DOCUMENTARY VESSEL' and captain.user_id='9d000000-0000-0000-0000-000000000002' and right(crew.user_id::text,1) in ('3','6','8') and crew.user_id::text like '9d000000-%';

create temporary table documentary_payloads(name text primary key,payload jsonb);
grant select,update on documentary_payloads to authenticated;
insert into documentary_payloads
select 'audit-'||fixture.n,jsonb_build_object('id',('9d100000-0000-0000-0000-'||lpad(fixture.n,12,'0'))::uuid,'companyId',vessel.company_id,
 'kind',fixture.kind,'siteId',vessel.id::text,'year',2026,'title','Documentary test '||fixture.kind,'auditedOn','2026-10-01','auditorName','External auditor','files','[]'::jsonb)
from(values('1','ovid'),('2','ecmid'),('3','external_ism'),('4','client')) fixture(n,kind) cross join public.vessels vessel where vessel.name='DOCUMENTARY VESSEL';
insert into documentary_payloads
select 'finding-'||fixture.n,jsonb_build_object('id',('9d200000-0000-0000-0000-'||lpad(fixture.n,12,'0'))::uuid,'companyId',vessel.company_id,
 'auditId','9d100000-0000-0000-0000-000000000001','reference','REF '||fixture.n,'category',fixture.category,'description','Documentary finding '||fixture.n,
 'assigneePersonId',null,'assigneeRole',fixture.role,'assigneeVesselId',vessel.id,'assigneeLabel','Client invented label',
 'openedOn','1900-01-01','dueOn','2099-01-01','status','open','closedAt','1900-01-01','files','[]'::jsonb)
from(values('1','major','captain'),('2','minor','crew'),('3','remark','crew'),('4','finding','chief_engineer'),('5','finding','crew'),('6','major','crew')) fixture(n,category,role)
cross join public.vessels vessel where vessel.name='DOCUMENTARY VESSEL';
update documentary_payloads set payload=payload||jsonb_build_object('assigneePersonId',(select id from public.people where user_id='9d000000-0000-0000-0000-000000000007'),'assigneeRole',null,'assigneeVesselId',null) where name='finding-5';
insert into documentary_payloads
select fixture.name,jsonb_build_object('id',fixture.id,'fileName',fixture.name||'.'||fixture.ext,'mimeType',fixture.mime,'sizeBytes',fixture.bytes,
 'storagePath',vessel.company_id||'/9d100000-0000-0000-0000-000000000001/'||fixture.record||'/'||fixture.phase||'/'||fixture.actor||'/'||fixture.id||'.'||fixture.ext)
from(values
 ('report','9d300000-0000-0000-0000-000000000001','9d100000-0000-0000-0000-000000000001','audit','9d000000-0000-0000-0000-000000000001','pdf','application/pdf',16),
 ('report-csv','9d300000-0000-0000-0000-000000000002','9d100000-0000-0000-0000-000000000001','audit','9d000000-0000-0000-0000-000000000001','csv','text/csv',14),
 ('finding-photo','9d300000-0000-0000-0000-000000000003','9d200000-0000-0000-0000-000000000001','finding','9d000000-0000-0000-0000-000000000001','png','image/png',8),
 ('finding-docx','9d300000-0000-0000-0000-000000000004','9d200000-0000-0000-0000-000000000001','finding','9d000000-0000-0000-0000-000000000001','docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',20),
 ('treatment-photo','9d300000-0000-0000-0000-000000000005','9d200000-0000-0000-0000-000000000001','treatment','9d000000-0000-0000-0000-000000000002','jpg','image/jpeg',12),
 ('treatment-xlsx','9d300000-0000-0000-0000-000000000006','9d200000-0000-0000-0000-000000000001','treatment','9d000000-0000-0000-0000-000000000002','xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',22),
 ('closure','9d300000-0000-0000-0000-000000000007','9d200000-0000-0000-0000-000000000001','closure','9d000000-0000-0000-0000-000000000001','pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation',24),
 ('orphan','9d300000-0000-0000-0000-000000000008','9d200000-0000-0000-0000-000000000001','finding','9d000000-0000-0000-0000-000000000001','txt','text/plain',10),
 ('missing','9d300000-0000-0000-0000-000000000009','9d200000-0000-0000-0000-000000000006','finding','9d000000-0000-0000-0000-000000000001','pdf','application/pdf',10),
 ('large-image','9d300000-0000-0000-0000-000000000010','9d200000-0000-0000-0000-000000000006','finding','9d000000-0000-0000-0000-000000000001','png','image/png',10485761),
 ('large-doc','9d300000-0000-0000-0000-000000000011','9d200000-0000-0000-0000-000000000006','finding','9d000000-0000-0000-0000-000000000001','pdf','application/pdf',26214401)
) fixture(name,id,record,phase,actor,ext,mime,bytes) cross join public.vessels vessel where vessel.name='DOCUMENTARY VESSEL';
insert into documentary_payloads
select 'batch-file-'||n,jsonb_build_object('id',('9d400000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'fileName','batch-'||n||'.pdf','mimeType','application/pdf','sizeBytes',64,
 'storagePath',vessel.company_id||'/9d100000-0000-0000-0000-000000000001/9d200000-0000-0000-0000-000000000006/finding/9d000000-0000-0000-0000-000000000001/9d400000-0000-0000-0000-'||lpad(n::text,12,'0')||'.pdf')
from generate_series(1,11) n cross join public.vessels vessel where vessel.name='DOCUMENTARY VESSEL';

set local role authenticated;
select set_config('request.jwt.claim.sub','9d000000-0000-0000-0000-000000000001',true);
select is((public.documentary_audits_overview('ovid')->'permissions'->>'canManage')::boolean,true,'real Armement account may manage documentary audits');
select ok(exists(select 1 from jsonb_array_elements(public.documentary_audits_overview('ovid')->'sites') site where site->>'name'='DOCUMENTARY VESSEL' and site->>'id'=site->>'vessel_id'),'all actual active vessels are offered without creating internal sites');
select ok(not exists(select 1 from jsonb_array_elements(public.documentary_audits_overview('ovid')->'sites') site where site->>'name'='DOCUMENTARY INACTIVE'),'inactive vessels are excluded');
select throws_ok($$select public.documentary_audits_overview('invalid')$$,'22023',null,'unknown audit kind is rejected');
select throws_ok($$select public.documentary_audit_upload_scope('9d100000-0000-0000-0000-000000000001',null,'audit')$$,'42501',null,'dossier must exist before files can be uploaded');
select lives_ok($$select public.documentary_audit_save(payload) from documentary_payloads where name like 'audit-%'$$,'all four audit kinds share the dossier workflow');
select is((select count(*)::integer from public.documentary_audits),4,'one dossier exists for each type in the same vessel and year');
select throws_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1')||'{"id":"9d100000-0000-0000-0000-000000000009"}'::jsonb)$$,'23505',null,'duplicate company/type/year/vessel dossier is rejected');
select throws_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1')||'{"year":2027}'::jsonb)$$,'22023',null,'saved dossier campaign year cannot be reassigned');
select throws_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1')||'{"kind":"client"}'::jsonb)$$,'22023',null,'saved dossier audit type cannot be reassigned');
select throws_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1')||jsonb_build_object('siteId',(select id from public.vessels where name='DOCUMENTARY SECOND')::text))$$,'22023',null,'saved dossier vessel cannot be reassigned');
select throws_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1')||jsonb_build_object('id','9d100000-0000-0000-0000-000000000008','siteId',(select id from public.vessels where name='DOCUMENTARY INACTIVE')::text))$$,'22023',null,'new dossier cannot use an inactive vessel');
select throws_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1')-'title')$$,'22023',null,'tampered missing required title is rejected');
select lives_ok($$select public.documentary_audit_upload_scope('9d100000-0000-0000-0000-000000000001',null,'audit')$$,'manager obtains scoped report upload authority');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'documentary-audit-files',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype',payload->>'mimeType','size',(payload->>'sizeBytes')::bigint) from documentary_payloads where name in ('report','report-csv','finding-photo','finding-docx')$$,'manager stages multiple report and finding files under existing dossier');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'documentary-audit-files',replace(payload->>'storagePath','9d000000-0000-0000-0000-000000000001','9d000000-0000-0000-0000-000000000002'),current_setting('request.jwt.claim.sub'),'{}'::jsonb from documentary_payloads where name='orphan'$$,'42501',null,'uploader cannot impersonate another actor path');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'documentary-audit-files',payload->>'storagePath','9d000000-0000-0000-0000-000000000002','{}'::jsonb from documentary_payloads where name='orphan'$$,'42501',null,'uploader cannot claim another storage owner');
select lives_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1')||jsonb_build_object('title','Updated external report','files',jsonb_build_array((select payload||'{"url":"https://never-store.invalid"}'::jsonb from documentary_payloads where name='report'),(select payload from documentary_payloads where name='report-csv'))))$$,'report PDF and CSV attach with editable dossier metadata');
update documentary_payloads set payload=payload||jsonb_build_object('files',(select files from public.documentary_audits where id='9d100000-0000-0000-0000-000000000001')) where name='audit-1';
select ok((select not(files->0 ? 'url') from public.documentary_audits where id='9d100000-0000-0000-0000-000000000001'),'temporary signed URL is stripped from stored references');
select throws_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1')||'{"files":[]}'::jsonb)$$,'22023',null,'saved report files cannot be removed');
select throws_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1')||jsonb_build_object('files',jsonb_build_array((select payload||'{"fileName":"changed.pdf"}'::jsonb from documentary_payloads where name='report'),(select payload from documentary_payloads where name='report-csv'))))$$,'22023',null,'saved evidence metadata cannot be replaced');

select lives_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-1')||jsonb_build_object('files',jsonb_build_array((select payload from documentary_payloads where name='finding-photo'),(select payload from documentary_payloads where name='finding-docx'))))$$,'new finding may atomically link both a photo and an Office document');
update documentary_payloads set payload=payload||jsonb_build_object('files',(select files from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000001')) where name='finding-1';
select lives_ok($$select public.documentary_audit_save_finding(payload) from documentary_payloads where name in ('finding-2','finding-3','finding-4','finding-5')$$,'minor, remark, collective chief and personal findings are supported');
select is((select due_on-opened_on from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000001'),7,'major default deadline is one week');
select is((select due_on from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000002'),(((now() at time zone 'Europe/Paris')::date)+interval '1 month')::date,'minor default is one calendar month');
select is((select opened_on from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000001'),(now() at time zone 'Europe/Paris')::date,'server Paris opening date replaces client-supplied date');
select is((select due_on from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000003'),null::date,'remarks have no deadline');
select is((select due_on from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000004'),null::date,'generic findings may omit a deadline');
select is((select closed_at from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000001'),null::timestamptz,'client cannot invent a closure date');
select is((select assignee_label from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000001'),'Capitaines DOCUMENTARY VESSEL','server derives the real collective handler label');
select lives_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-4')||'{"treatmentDelayValue":2,"treatmentDelayUnit":"months"}'::jsonb)$$,'generic finding may opt into an editable duration');
select lives_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-4')||'{"treatmentDelayValue":null,"treatmentDelayUnit":null}'::jsonb)$$,'generic optional deadline can be removed');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-1')||'{"treatmentDelayValue":0,"treatmentDelayUnit":"days"}'::jsonb)$$,'22023',null,'zero treatment duration is rejected');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-1')||'{"treatmentDelayValue":2,"treatmentDelayUnit":null}'::jsonb)$$,'22023',null,'partially supplied duration is rejected');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-1')||'{"status":"closed"}'::jsonb)$$,'22023',null,'finding editing cannot bypass treatment status workflow');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-1')||'{"auditId":"9d100000-0000-0000-0000-000000000002"}'::jsonb)$$,'22023',null,'finding cannot move to a different parent dossier');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-3')||'{"assigneeRole":null,"assigneeVesselId":null}'::jsonb)$$,'22023',null,'remark still requires a responsible handler');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-5')||jsonb_build_object('assigneeRole','crew','assigneeVesselId',(select id from public.vessels where name='DOCUMENTARY VESSEL')))$$,'22023',null,'personal and collective assignments cannot be mixed');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-6')||jsonb_build_object('files',jsonb_build_array((select payload from documentary_payloads where name='missing'))))$$,'22023',null,'file reference requires an existing uploaded object');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-6')||jsonb_build_object('files',jsonb_build_array((select payload from documentary_payloads where name='large-image'))))$$,'22023',null,'images larger than ten MiB are rejected');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-6')||jsonb_build_object('files',jsonb_build_array((select payload from documentary_payloads where name='large-doc'))))$$,'22023',null,'documents larger than 25 MiB are rejected');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-6')||jsonb_build_object('files',jsonb_build_array((select payload||'{"mimeType":"image/svg+xml"}'::jsonb from documentary_payloads where name='missing'))))$$,'22023',null,'unsupported executable SVG format is rejected');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-1')||jsonb_build_object('files',jsonb_build_array((select payload from documentary_payloads where name='finding-photo'),(select payload from documentary_payloads where name='finding-docx'),(select payload||'{"id":"9d300000-0000-0000-0000-000000000003"}'::jsonb from documentary_payloads where name='missing'))))$$,'22023',null,'different paths cannot reuse the same file identifier');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-6')||jsonb_build_object('files',jsonb_build_array((select payload-'mimeType' from documentary_payloads where name='missing'))))$$,'22023',null,'missing file metadata keys are rejected');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'documentary-audit-files',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype',payload->>'mimeType','size',(payload->>'sizeBytes')::bigint) from documentary_payloads where name like 'batch-file-%'$$,'manager can stage a batch of unlinked file objects');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-6')||jsonb_build_object('files',(select jsonb_agg(payload order by name) from documentary_payloads where name like 'batch-file-%')))$$,'22023',null,'one saved batch cannot contain eleven new files');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-6')||jsonb_build_object('files',(select jsonb_agg(payload) from documentary_payloads cross join generate_series(1,101) n where name='missing')))$$,'22023',null,'one record cannot retain more than one hundred file references');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'documentary-audit-files',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype','text/plain','size',10) from documentary_payloads where name='missing'$$,'fixture stages an object with a mismatched MIME type');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-6')||jsonb_build_object('files',jsonb_build_array((select payload from documentary_payloads where name='missing'))))$$,'22023',null,'reference MIME must match the uploaded object metadata');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-1')||jsonb_build_object('files',(select files from public.documentary_audits where id='9d100000-0000-0000-0000-000000000001')))$$,'22023',null,'report evidence cannot be reattached under a finding');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'documentary-audit-files',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype',payload->>'mimeType','size',(payload->>'sizeBytes')::bigint) from documentary_payloads where name='orphan'$$,'manager stages optional unlinked file');
with removed as(delete from storage.objects where bucket_id='documentary-audit-files' and name=(select payload->>'storagePath' from documentary_payloads where name='orphan') returning 1)
select is((select count(*)::integer from removed),1,'unlinked upload may be cleaned after save failure');
with removed as(delete from storage.objects where bucket_id='documentary-audit-files' and name=(select payload->>'storagePath' from documentary_payloads where name='report') returning 1)
select is((select count(*)::integer from removed),0,'linked report evidence cannot be deleted even by its uploader');
with changed as(update storage.objects set metadata='{"mimetype":"text/plain","size":1}'::jsonb where bucket_id='documentary-audit-files' and name=(select payload->>'storagePath' from documentary_payloads where name='report') returning 1)
select is((select count(*)::integer from changed),0,'stored report objects cannot be overwritten through UPDATE');
select throws_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000001','closed','','[]'::jsonb)$$,'22023',null,'major finding requires resolution before manager closure');
select lives_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000003','closed','','[]'::jsonb)$$,'manager may optionally close a remark directly');

-- Each profile uses a distinct actual authenticated account.
select set_config('request.jwt.claim.sub','9d000000-0000-0000-0000-000000000002',true);
select is((public.documentary_audits_overview('ovid')->'permissions'->>'canManage')::boolean,false,'real captain is a treatment handler, not an audit manager');
select is(jsonb_array_length(public.documentary_audits_overview('ovid')->'audits'),1,'assigned captain sees the relevant parent dossier');
select is((select count(*)::integer from public.documentary_audits),1,'table RLS matches assigned parent visibility');
select is(jsonb_array_length(public.documentary_audits_overview('ecmid')->'audits'),0,'overview does not leak dossiers from another kind');
select is(jsonb_array_length(public.documentary_audits_overview('ovid')->'people'),0,'handler overview does not expose the company personnel directory');
select ok(not exists(select 1 from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000004'),'captain cannot read chief-engineer finding');
select is((select count(*)::integer from storage.objects where bucket_id='documentary-audit-files'),4,'captain reads dossier reports and own finding evidence');
select throws_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1'))$$,'42501',null,'captain cannot edit dossier metadata');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-1'))$$,'42501',null,'captain cannot edit assigned finding metadata');
select throws_ok($$select public.documentary_audit_upload_scope('9d100000-0000-0000-0000-000000000001',null,'audit')$$,'42501',null,'handler cannot upload report files');
select throws_ok($$select public.documentary_audit_upload_scope('9d100000-0000-0000-0000-000000000001','9d200000-0000-0000-0000-000000000001','closure')$$,'42501',null,'handler cannot upload manager closure evidence');
select throws_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000001','closed','Close it','[]'::jsonb)$$,'42501',null,'handler cannot verify or close a finding');
select lives_ok($$select public.documentary_audit_upload_scope('9d100000-0000-0000-0000-000000000001','9d200000-0000-0000-0000-000000000001','treatment')$$,'assigned real captain obtains treatment upload scope');
select lives_ok($$select public.documentary_audit_upload_scope(null,'9d200000-0000-0000-0000-000000000001','treatment')$$,'treatment API resolves the authorized parent from the finding when audit id is omitted');
select is(public.documentary_audit_upload_scope(null,'9d200000-0000-0000-0000-000000000001','treatment')->>'audit_id','9d100000-0000-0000-0000-000000000001','resolved treatment scope returns the actual parent dossier');
select throws_ok($$select public.documentary_audit_upload_scope('9d100000-0000-0000-0000-000000000002','9d200000-0000-0000-0000-000000000001','treatment')$$,'42501',null,'explicit parent id must match the finding parent');
select throws_ok($$select public.documentary_audit_upload_scope(null,'9d200000-0000-0000-0000-000000000099','treatment')$$,'42501',null,'omitted parent cannot authorize an unknown finding');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'documentary-audit-files',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype',payload->>'mimeType','size',(payload->>'sizeBytes')::bigint) from documentary_payloads where name in ('treatment-photo','treatment-xlsx')$$,'assigned captain stages both treatment photo and spreadsheet');
select throws_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000001','resolved','',jsonb_build_array((select payload||'{"sizeBytes":999}'::jsonb from documentary_payloads where name='treatment-photo')))$$,'22023',null,'treatment metadata must match uploaded bytes');
select lives_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000001','resolved','',jsonb_build_array((select payload from documentary_payloads where name='treatment-photo'),(select payload from documentary_payloads where name='treatment-xlsx')))$$,'file-only treatment appends an immutable actual-actor event');
select is((select actor_id from public.documentary_audit_events where finding_id='9d200000-0000-0000-0000-000000000001' and status='resolved'),'9d000000-0000-0000-0000-000000000002'::uuid,'treatment event records the real captain identity');
select throws_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000001','in_progress','','[]'::jsonb)$$,'22023',null,'empty treatment without evidence is rejected');

select set_config('request.jwt.claim.sub','9d000000-0000-0000-0000-000000000003',true);
select ok(not exists(select 1 from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000001'),'confirmed crew Marin cannot read captain-only finding');
select ok(not exists(select 1 from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000004'),'ordinary Matelot cannot read chief-engineer finding');
select is((select count(*)::integer from storage.objects where bucket_id='documentary-audit-files'),2,'crew sees shared parent reports without other handlers private finding evidence');
select throws_ok($$select public.documentary_audit_upload_scope('9d100000-0000-0000-0000-000000000001','9d200000-0000-0000-0000-000000000001','treatment')$$,'42501',null,'ordinary crew cannot obtain captain-finding upload scope');
select lives_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000002','in_progress','Traitement équipage','[]'::jsonb)$$,'real confirmed crew may record their collective treatment');
select set_config('request.jwt.claim.sub','9d000000-0000-0000-0000-000000000006',true);
select lives_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000004','resolved','Traitement machine','[]'::jsonb)$$,'generic planning crew role uses actual Chef Mécanicien HR function');
select set_config('request.jwt.claim.sub','9d000000-0000-0000-0000-000000000007',true);
select is((select count(*)::integer from public.documentary_audit_findings),1,'personal assignee sees only their own finding without an embarkation');
select lives_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000005','resolved','Traitement personnel','[]'::jsonb)$$,'real personal assignee may record treatment');
select set_config('request.jwt.claim.sub','9d000000-0000-0000-0000-000000000008',true);
select is((select count(*)::integer from public.documentary_audits),0,'pending embarkation does not authorize collective access');
select set_config('request.jwt.claim.sub','9d000000-0000-0000-0000-000000000004',true);
select is((select count(*)::integer from public.documentary_audits),0,'unassigned real Marin has no dossier visibility');
select is((select count(*)::integer from storage.objects where bucket_id='documentary-audit-files'),0,'unassigned Marin has no evidence visibility');
select throws_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000001','resolved','Attempt','[]'::jsonb)$$,'42501',null,'unassigned Marin cannot mutate another finding');
select set_config('request.jwt.claim.sub','9d000000-0000-0000-0000-000000000005',true);
select is((select count(*)::integer from public.documentary_audits),0,'other-company administrator sees no dossier');
select is((select count(*)::integer from storage.objects where bucket_id='documentary-audit-files'),0,'other-company administrator sees no evidence');
select throws_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1'))$$,'42501',null,'other-company administrator cannot overwrite dossier');
select throws_ok($$select public.documentary_audit_save((select payload from documentary_payloads where name='audit-1')||jsonb_build_object('companyId',(public.documentary_audits_overview('ovid')->>'company_id')::bigint))$$,'42501',null,'spoofing current company cannot overwrite another company UUID');
select throws_ok($$select public.documentary_audit_upload_scope('9d100000-0000-0000-0000-000000000001','9d200000-0000-0000-0000-000000000001','finding')$$,'42501',null,'other-company manager cannot stage files under foreign dossier');

select set_config('request.jwt.claim.sub','9d000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.documentary_audit_upload_scope(null,'9d200000-0000-0000-0000-000000000001','closure')$$,'manager closure API also resolves its parent from the existing finding');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'documentary-audit-files',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype',payload->>'mimeType','size',(payload->>'sizeBytes')::bigint) from documentary_payloads where name='closure'$$,'manager uploads closure evidence after handler resolution');
select lives_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000001','closed','',jsonb_build_array((select payload from documentary_payloads where name='closure')))$$,'manager verifies and closes finding with a retained presentation');
select ok((select finding.closed_at=event.created_at from public.documentary_audit_findings finding join public.documentary_audit_events event on event.finding_id=finding.id and event.status='closed' where finding.id='9d200000-0000-0000-0000-000000000001'),'closure date is exactly the automatic server history timestamp');
with removed as(delete from storage.objects where bucket_id='documentary-audit-files' and name=(select payload->>'storagePath' from documentary_payloads where name='closure') returning 1)
select is((select count(*)::integer from removed),0,'linked closure proof cannot be deleted during upload cleanup');
select throws_ok($$select public.documentary_audit_save_finding((select payload from documentary_payloads where name='finding-1'))$$,'55000',null,'closed finding cannot be edited before traced reopening');
select set_config('request.jwt.claim.sub','9d000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from storage.objects where bucket_id='documentary-audit-files'),7,'assigned captain retains report, finding, treatment and closure evidence access after closing');
select throws_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000001','open','Reopen','[]'::jsonb)$$,'55000',null,'handler cannot reopen closed finding');
select ok(not (public.documentary_audits_overview('ovid')->'permissions'->'treatableFindingIds' ? '9d200000-0000-0000-0000-000000000001'),'server permission flags remove closed finding from handler actions');
select set_config('request.jwt.claim.sub','9d000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.documentary_audit_add_treatment('9d200000-0000-0000-0000-000000000001','open','Réouverture documentée','[]'::jsonb)$$,'manager may reopen through an immutable history event');
select is((select closed_at from public.documentary_audit_findings where id='9d200000-0000-0000-0000-000000000001'),null::timestamptz,'reopening clears current closure timestamp while history remains');
select is((select count(*)::integer from public.documentary_audit_events where finding_id='9d200000-0000-0000-0000-000000000001' and status='closed'),1,'reopening retains the original closure event');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.documentary_audits_overview('ovid')$$,'42501',null,'authenticated database role without a real user cannot list dossiers');
select is((select count(*)::integer from public.documentary_audits),0,'table RLS also rejects authenticated role without a real user');
reset role;
select * from finish();
rollback;
