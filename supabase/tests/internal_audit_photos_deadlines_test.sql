begin;
select no_plan();
-- Some older local snapshots omit grants expected by the existing project
-- Storage policies. Restore those SELECT grants only inside this rolled-back
-- fixture; their table RLS remains active and project data stays out of scope.
grant select on public.project_billing_documents,public.project_generated_documents,public.contract_documents to authenticated;
-- Emulate the Storage API's delete-session flag for fixture metadata only.
-- No real image object is deleted; the complete fixture is rolled back.
select set_config('storage.allow_delete_query','true',true);

select is((select public from storage.buckets where id='internal-audit-photos'),false,'audit image evidence is private');
select is((select file_size_limit from storage.buckets where id='internal-audit-photos'),10485760::bigint,'photos have a ten MiB bucket limit');
select is((select allowed_mime_types from storage.buckets where id='internal-audit-photos'),array['image/jpeg','image/png','image/webp'],'only browser-renderable photos are allowed');
select ok(not has_function_privilege('anon','public.internal_audit_add_treatment(uuid,text,text,jsonb)','EXECUTE'),'anonymous callers cannot attach treatment photos');
select is(internal_audit_private.finding_due_on('2026-01-31',1,'months'),'2026-02-28'::date,'calendar month deadline clamps at month end');
select is(internal_audit_private.finding_due_on('2028-01-31',1,'months'),'2028-02-29'::date,'calendar month deadline preserves leap years');
select is(internal_audit_private.finding_due_on('2026-01-31',1,'weeks'),'2026-02-07'::date,'major default one week is seven days');
select throws_ok($$select internal_audit_private.finding_due_on('2026-01-31',0,'days')$$,'22023',null,'zero duration is rejected');

insert into public.companies(code,name) values('audit-photo-other','Other photo tenant');
insert into auth.users(id,email) values
 ('9c000000-0000-0000-0000-000000000001','audit-photo-manager@example.invalid'),
 ('9c000000-0000-0000-0000-000000000002','audit-photo-captain@example.invalid'),
 ('9c000000-0000-0000-0000-000000000003','audit-photo-crew@example.invalid'),
 ('9c000000-0000-0000-0000-000000000004','audit-photo-unassigned@example.invalid'),
 ('9c000000-0000-0000-0000-000000000005','audit-photo-other@example.invalid');
insert into public.profiles(id,email,display_name,active_company_id)
select fixture.id,fixture.email,fixture.name,company.id from (values
 ('9c000000-0000-0000-0000-000000000001'::uuid,'audit-photo-manager@example.invalid','Photo Manager','bbtm'),
 ('9c000000-0000-0000-0000-000000000002'::uuid,'audit-photo-captain@example.invalid','Photo Captain','bbtm'),
 ('9c000000-0000-0000-0000-000000000003'::uuid,'audit-photo-crew@example.invalid','Photo Crew','bbtm'),
 ('9c000000-0000-0000-0000-000000000004'::uuid,'audit-photo-unassigned@example.invalid','Photo Unassigned','bbtm'),
 ('9c000000-0000-0000-0000-000000000005'::uuid,'audit-photo-other@example.invalid','Photo Other','audit-photo-other')
) fixture(id,email,name,code) join public.companies company on company.code=fixture.code;
insert into public.company_memberships(company_id,user_id,active) select active_company_id,id,true from public.profiles where id::text like '9c000000-%'
on conflict(company_id,user_id) do update set active=excluded.active;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '1' then 'armement' when '2' then 'capitaine' when '5' then 'admin' else 'marin' end
from public.profiles where id::text like '9c000000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label)
select active_company_id,id,'Photo',display_name,case right(id::text,1) when '2' then 'Capitaine' else 'Matelot' end
from public.profiles where id::text like '9c000000-%';
insert into public.vessels(company_id,name) select id,'AUDIT-PHOTO-LE ROZEL' from public.companies where code='bbtm';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status,source_label)
select vessel.company_id,vessel.id,captain.id,crew.id,current_date-1,current_date+1,'crew','confirmed','audit-photo-test'
from public.vessels vessel cross join public.people captain cross join public.people crew
where vessel.name='AUDIT-PHOTO-LE ROZEL' and captain.user_id='9c000000-0000-0000-0000-000000000002' and crew.user_id='9c000000-0000-0000-0000-000000000003';
insert into public.internal_audit_sites(id,company_id,name,kind,vessel_id)
select '9c100000-0000-0000-0000-000000000001',company_id,'AUDIT-PHOTO site','vessel',id from public.vessels where name='AUDIT-PHOTO-LE ROZEL';
insert into public.internal_audit_templates(id,company_id,site_id,name,rows)
select '9c200000-0000-0000-0000-000000000001',company_id,id,'AUDIT-PHOTO grid',
 '[{"id":"q1","section":"ISM 1","reference":"1.1","question":"Question","maxPoints":3,"guidance":""}]'::jsonb
from public.internal_audit_sites where id='9c100000-0000-0000-0000-000000000001';
insert into public.internal_audits(id,company_id,site_id,template_id,template_name,template_version,year,planned_on,rows)
select '9c300000-0000-0000-0000-000000000001',company_id,site_id,id,name,1,2026,'2026-09-30',
 '[{"id":"q1","section":"ISM 1","reference":"1.1","question":"Question","maxPoints":3,"guidance":"","answer":null,"observation":""}]'::jsonb
from public.internal_audit_templates where id='9c200000-0000-0000-0000-000000000001';

create temporary table photo_payloads(name text primary key,payload jsonb);
grant select,update on photo_payloads to authenticated;
insert into photo_payloads select 'finding-'||fixture.id,jsonb_build_object('id',('9c400000-0000-0000-0000-'||lpad(fixture.id,12,'0'))::uuid,
 'companyId',company.id,'auditId','9c300000-0000-0000-0000-000000000001','questionId','q1','severity',fixture.severity,'description','Photo fixture '||fixture.id,
 'assigneePersonId',null,'assigneeRole',fixture.role,'assigneeVesselId',(select id from public.vessels where name='AUDIT-PHOTO-LE ROZEL'),'dueOn','2099-01-01',
 'openedOn','1900-01-01','status','closed','closedAt','1900-01-01','photos','[]'::jsonb)
from (values('1','major','captain'),('2','minor','crew'),('3','remark','crew'),('4','major','crew')) fixture(id,severity,role)
cross join public.companies company where company.code='bbtm';
insert into photo_payloads
select fixture.name,jsonb_build_object('id',fixture.photo_id,'fileName',fixture.name||'.png','mimeType','image/png','sizeBytes',8,
 'storagePath',company.id||'/9c300000-0000-0000-0000-000000000001/9c400000-0000-0000-0000-000000000001/'||fixture.phase||'/'||fixture.actor||'/'||fixture.photo_id||'.png')
from (values
 ('constat','9c500000-0000-0000-0000-000000000001','finding','9c000000-0000-0000-0000-000000000001'),
 ('constat-extra','9c500000-0000-0000-0000-000000000002','finding','9c000000-0000-0000-0000-000000000001'),
 ('captain-treatment','9c500000-0000-0000-0000-000000000003','treatment','9c000000-0000-0000-0000-000000000002'),
 ('crew-forbidden','9c500000-0000-0000-0000-000000000004','treatment','9c000000-0000-0000-0000-000000000003'),
 ('closure','9c500000-0000-0000-0000-000000000005','closure','9c000000-0000-0000-0000-000000000001'),
 ('orphan','9c500000-0000-0000-0000-000000000006','finding','9c000000-0000-0000-0000-000000000001')
) fixture(name,photo_id,phase,actor) cross join public.companies company where company.code='bbtm';

set local role authenticated;
select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000001',true);
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'internal-audit-photos',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype','image/png','size',8) from photo_payloads where name='constat'$$,'manager uploads a private finding photo before finding creation');
select lives_ok($$select public.internal_audit_save_finding((select payload from photo_payloads where name='finding-1')||jsonb_build_object('photos',jsonb_build_array((select payload||'{"url":"https://bad.example/never-persist"}'::jsonb from photo_payloads where name='constat'))))$$,'creation atomically links validated private evidence');
select is((select due_on-opened_on from public.internal_audit_findings where id='9c400000-0000-0000-0000-000000000001'),7,'major finding defaults to one week');
select is((select opened_on from public.internal_audit_findings where id='9c400000-0000-0000-0000-000000000001'),(now() at time zone 'Europe/Paris')::date,'client opening date is ignored');
select is((select closed_at from public.internal_audit_findings where id='9c400000-0000-0000-0000-000000000001'),null::timestamptz,'client cannot invent a closure timestamp');
select ok((select not (photos->0 ? 'url') from public.internal_audit_findings where id='9c400000-0000-0000-0000-000000000001'),'signed/public URLs are never stored in evidence');
with removed as(delete from storage.objects where bucket_id='internal-audit-photos' and name=(select payload->>'storagePath' from photo_payloads where name='constat') returning 1)
select is((select count(*)::integer from removed),0,'even the uploader cannot delete linked evidence');
select throws_ok($$select public.internal_audit_save_finding((select payload from photo_payloads where name='finding-1'))$$,'22023',null,'linked finding photos cannot be silently removed');
select lives_ok($$select public.internal_audit_save_finding((select payload from photo_payloads where name='finding-2'))$$,'minor finding without custom duration is accepted');
select is((select due_on from public.internal_audit_findings where id='9c400000-0000-0000-0000-000000000002'),((now() at time zone 'Europe/Paris')::date+interval '1 month')::date,'minor finding defaults to one calendar month');
select lives_ok($$select public.internal_audit_save_finding((select payload from photo_payloads where name='finding-2')||'{"treatmentDelayValue":2,"treatmentDelayUnit":"weeks"}'::jsonb)$$,'manager edits a treatment duration in weeks');
select is((select due_on-opened_on from public.internal_audit_findings where id='9c400000-0000-0000-0000-000000000002'),14,'custom duration is computed by the server');
select throws_ok($$select public.internal_audit_save_finding((select payload from photo_payloads where name='finding-2')||'{"treatmentDelayValue":0,"treatmentDelayUnit":"days"}'::jsonb)$$,'22023',null,'invalid edited duration cannot bypass the server');
select lives_ok($$select public.internal_audit_save_finding((select payload from photo_payloads where name='finding-3'))$$,'remark keeps its responsible person or vessel function');
select is((select due_on from public.internal_audit_findings where id='9c400000-0000-0000-0000-000000000003'),null::date,'remark has no deadline');
select ok((select treatment_delay_value is null and treatment_delay_unit is null from public.internal_audit_findings where id='9c400000-0000-0000-0000-000000000003'),'remark has no treatment duration');
select throws_ok($$select public.internal_audit_save_finding((select payload from photo_payloads where name='finding-3')||'{"assigneeRole":null,"assigneeVesselId":null}'::jsonb)$$,'22023',null,'remark still requires an assigned responsible handler');
select lives_ok($$select public.internal_audit_add_treatment('9c400000-0000-0000-0000-000000000003','closed','', '[]'::jsonb)$$,'manager may optionally close a remark without forced resolution or manual date');

select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'internal-audit-photos',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype','image/png','size',8) from photo_payloads where name='constat-extra'$$,'manager can upload another optional finding photo');
select throws_ok($$select public.internal_audit_save_finding((select payload from photo_payloads where name='finding-1')||jsonb_build_object('photos',jsonb_build_array((select payload from photo_payloads where name='constat'),(select payload||'{"sizeBytes":9}'::jsonb from photo_payloads where name='constat-extra'))))$$,'22023',null,'metadata cannot claim a different uploaded file size');
select throws_ok($$select public.internal_audit_save_finding((select payload from photo_payloads where name='finding-1')||jsonb_build_object('photos',jsonb_build_array((select payload from photo_payloads where name='constat'),(select payload||'{"mimeType":"image/svg+xml"}'::jsonb from photo_payloads where name='constat-extra'))))$$,'22023',null,'SVG evidence is rejected by the attachment workflow');
select throws_ok($$select public.internal_audit_save_finding((select payload from photo_payloads where name='finding-1')||jsonb_build_object('photos',jsonb_build_array((select payload from photo_payloads where name='constat'),(select payload||jsonb_build_object('mimeType','image/jpeg','storagePath',replace(payload->>'storagePath','.png','.jpg')) from photo_payloads where name='constat'))))$$,'22023',null,'different file extensions cannot reuse the same photo UUID');
select lives_ok($$select public.internal_audit_save_finding((select payload from photo_payloads where name='finding-1')||jsonb_build_object('photos',jsonb_build_array((select payload from photo_payloads where name='constat'),(select payload from photo_payloads where name='constat-extra'))))$$,'multiple validated finding photos are retained');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'internal-audit-photos',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype','image/png','size',8) from photo_payloads where name='orphan'$$,'new unattached upload can be staged');
with removed as(delete from storage.objects where bucket_id='internal-audit-photos' and name=(select payload->>'storagePath' from photo_payloads where name='orphan') returning 1)
select is((select count(*)::integer from removed),1,'unattached upload can be cleaned after a failed RPC');

-- Real separately authenticated Capitaine and Marin accounts.
select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'),2,'assigned real captain can read management finding photos');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'internal-audit-photos',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype','image/png','size',8) from photo_payloads where name='captain-treatment'$$,'assigned real captain uploads treatment proof');
select lives_ok($$select public.internal_audit_add_treatment('9c400000-0000-0000-0000-000000000001','resolved','',jsonb_build_array((select payload from photo_payloads where name='captain-treatment')))$$,'photo-only treatment is recorded in an immutable event');
select is((select actor_id from public.internal_audit_finding_events where finding_id='9c400000-0000-0000-0000-000000000001' and status='resolved'),'9c000000-0000-0000-0000-000000000002'::uuid,'photo event records the authenticated real actor');
select throws_ok($$select public.internal_audit_photo_upload_scope('9c400000-0000-0000-0000-000000000001','closure')$$,'42501',null,'captain cannot upload management closure evidence');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'internal-audit-photos',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype','image/png','size',8) from photo_payloads where name='closure'$$,'42501',null,'captain cannot impersonate the manager folder');

select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000003',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'),0,'real Marin has no captain-finding image access');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'internal-audit-photos',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype','image/png','size',8) from photo_payloads where name='crew-forbidden'$$,'42501',null,'a crew Marin cannot upload proof to a captain finding');
select throws_ok($$select public.internal_audit_photo_upload_scope('9c400000-0000-0000-0000-000000000001','treatment')$$,'42501',null,'upload scope does not leak another role’s finding');
select lives_ok($$select public.internal_audit_photo_upload_scope('9c400000-0000-0000-0000-000000000002','treatment')$$,'the same real Marin can obtain their assigned crew treatment scope');

select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000004',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'),0,'unassigned real Marin cannot read any audit photo');
select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000005',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'),0,'other-company administrator cannot read audit photo evidence');

select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000001',true);
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata) select 'internal-audit-photos',payload->>'storagePath',current_setting('request.jwt.claim.sub'),jsonb_build_object('mimetype','image/png','size',8) from photo_payloads where name='closure'$$,'management uploads optional closure proof');
select lives_ok($$select public.internal_audit_add_treatment('9c400000-0000-0000-0000-000000000001','closed','',jsonb_build_array((select payload from photo_payloads where name='closure')))$$,'verification closes the finding with optional photographic proof');
select ok((select finding.closed_at=event.created_at from public.internal_audit_findings finding join public.internal_audit_finding_events event on event.finding_id=finding.id and event.status='closed' where finding.id='9c400000-0000-0000-0000-000000000001'),'closure timestamp is exactly the immutable server event timestamp');
with removed as(delete from storage.objects where bucket_id='internal-audit-photos' and name=(select payload->>'storagePath' from photo_payloads where name='closure') returning 1)
select is((select count(*)::integer from removed),0,'saved closure proof cannot be deleted during cleanup');
select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'),4,'assigned captain can still read finding, treatment and closure photos after closing');
select throws_ok($$select public.internal_audit_add_treatment('9c400000-0000-0000-0000-000000000001','in_progress','Tentative après clôture','[]'::jsonb)$$,'55000',null,'closed findings retain the original handler write protection');

reset role;
select * from finish();
rollback;
