begin;
select no_plan();
-- The fixture uses Storage object metadata and rolls back every change.
grant select on public.project_billing_documents,public.project_generated_documents,public.contract_documents to authenticated;
select set_config('storage.allow_delete_query','true',true);

insert into public.companies(code,name) values('audit-observation-other','Other observation tenant');
insert into auth.users(id,email) values
  ('9e000000-0000-0000-0000-000000000001','audit-observation-manager@example.invalid'),
  ('9e000000-0000-0000-0000-000000000002','audit-observation-captain@example.invalid'),
  ('9e000000-0000-0000-0000-000000000003','audit-observation-crew@example.invalid'),
  ('9e000000-0000-0000-0000-000000000004','audit-observation-unassigned@example.invalid'),
  ('9e000000-0000-0000-0000-000000000005','audit-observation-other@example.invalid'),
  ('9e000000-0000-0000-0000-000000000006','audit-observation-manager-two@example.invalid');
insert into public.profiles(id,email,display_name,active_company_id)
select fixture.id,fixture.email,fixture.name,company.id from (values
  ('9e000000-0000-0000-0000-000000000001'::uuid,'audit-observation-manager@example.invalid','Observation Manager','bbtm'),
  ('9e000000-0000-0000-0000-000000000002'::uuid,'audit-observation-captain@example.invalid','Observation Captain','bbtm'),
  ('9e000000-0000-0000-0000-000000000003'::uuid,'audit-observation-crew@example.invalid','Observation Marin','bbtm'),
  ('9e000000-0000-0000-0000-000000000004'::uuid,'audit-observation-unassigned@example.invalid','Observation Unassigned','bbtm'),
  ('9e000000-0000-0000-0000-000000000005'::uuid,'audit-observation-other@example.invalid','Observation Other','audit-observation-other'),
  ('9e000000-0000-0000-0000-000000000006'::uuid,'audit-observation-manager-two@example.invalid','Observation Manager Two','bbtm')
) fixture(id,email,name,code) join public.companies company on company.code=fixture.code;
insert into public.company_memberships(company_id,user_id,active)
  select active_company_id,id,true from public.profiles where id::text like '9e000000-%'
  on conflict(company_id,user_id) do update set active=excluded.active;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1)
  when '1' then 'armement' when '2' then 'capitaine' when '5' then 'admin' when '6' then 'direction' else 'marin' end
from public.profiles where id::text like '9e000000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label)
select active_company_id,id,'Observation',display_name,case right(id::text,1) when '2' then 'Capitaine' else 'Matelot' end
from public.profiles where id::text like '9e000000-%';

insert into public.internal_audit_sites(id,company_id,name,kind,anniversary_on)
select '9e100000-0000-0000-0000-000000000001',id,'AUDIT-OBSERVATION site','shore','2026-09-30'
from public.companies where code='bbtm';
insert into public.internal_audit_templates(id,company_id,site_id,name,rows)
select '9e200000-0000-0000-0000-000000000001',company_id,id,'AUDIT-OBSERVATION grid',
  '[{"id":"q1","section":"ISM 1","reference":"1.1","question":"Question un","maxPoints":3,"guidance":""},
    {"id":"q2","section":"ISM 2","reference":"2.2","question":"Question deux","maxPoints":7,"guidance":""},
    {"id":"q3","section":"ISM 2","reference":"2.3","question":"Question trois","maxPoints":5,"guidance":""}]'::jsonb
from public.internal_audit_sites where id='9e100000-0000-0000-0000-000000000001';
insert into public.internal_audits(id,company_id,site_id,template_id,template_name,template_version,year,planned_on,rows)
select fixture.id,template.company_id,template.site_id,template.id,template.name,1,fixture.year,fixture.planned_on,
  (select jsonb_agg(question||'{"answer":null,"observation":""}'::jsonb order by ordinal)
   from jsonb_array_elements(template.rows) with ordinality items(question,ordinal))
from public.internal_audit_templates template cross join (values
  ('9e300000-0000-0000-0000-000000000001'::uuid,2026,'2026-09-30'::date),
  ('9e300000-0000-0000-0000-000000000002'::uuid,2025,'2025-09-30'::date)
) fixture(id,year,planned_on)
where template.id='9e200000-0000-0000-0000-000000000001';

create temporary table observation_payloads(name text primary key,payload jsonb);
grant select on observation_payloads to authenticated;
insert into observation_payloads
select fixture.name,jsonb_build_object('id',fixture.id,'fileName',fixture.name||'.png','mimeType','image/png','sizeBytes',8,
  'storagePath',company.id||'/'||fixture.audit_id||'/'||fixture.audit_id||'/observation/'||fixture.actor||'/'||fixture.id||'.png')
from (values
  ('group-photo','9e500000-0000-0000-0000-000000000001','9e300000-0000-0000-0000-000000000001','9e000000-0000-0000-0000-000000000001'),
  ('other-row','9e500000-0000-0000-0000-000000000002','9e300000-0000-0000-0000-000000000001','9e000000-0000-0000-0000-000000000001'),
  ('staging','9e500000-0000-0000-0000-000000000003','9e300000-0000-0000-0000-000000000001','9e000000-0000-0000-0000-000000000001'),
  ('captain-photo','9e500000-0000-0000-0000-000000000004','9e300000-0000-0000-0000-000000000001','9e000000-0000-0000-0000-000000000002'),
  ('completion-photo','9e500000-0000-0000-0000-000000000005','9e300000-0000-0000-0000-000000000001','9e000000-0000-0000-0000-000000000001'),
  ('race-staging','9e500000-0000-0000-0000-000000000006','9e300000-0000-0000-0000-000000000001','9e000000-0000-0000-0000-000000000006')
) fixture(name,id,audit_id,actor) cross join public.companies company where company.code='bbtm';

create function pg_temp.observation_audit_payload(p_audit_id uuid default '9e300000-0000-0000-0000-000000000001')
returns jsonb language sql stable as $$
  select jsonb_build_object('id',id,'companyId',company_id,'siteId',site_id,'templateId',template_id,
    'year',year,'plannedOn',planned_on,'performedOn',performed_on,'auditorName',auditor_name,'status',status,'rows',rows)
  from public.internal_audits where id = p_audit_id;
$$;
create function pg_temp.grouped_observation_payload()
returns jsonb language sql stable as $$
  select pg_temp.observation_audit_payload() || jsonb_build_object('rows',
    (select jsonb_agg(question||case when question->>'id' in ('q1','q2') then jsonb_build_object(
      'responseGroupId','9e600000-0000-0000-0000-000000000001','answer','incomplet','observation','Observation commune',
      'observationPhotos',jsonb_build_array((select payload||'{"url":"https://invalid.example/temporary"}'::jsonb
        from observation_payloads where name='group-photo'))
    ) else jsonb_build_object('answer','conforme','observationPhotos',jsonb_build_array(
      (select payload from observation_payloads where name='other-row'))) end order by ordinal)
    from jsonb_array_elements(pg_temp.observation_audit_payload()->'rows') with ordinality items(question,ordinal)));
$$;
create function pg_temp.add_observation_finding(p_id uuid,p_question text,p_actor uuid)
returns jsonb language sql volatile as $$
  select public.internal_audit_save_finding(jsonb_build_object(
    'id',p_id,'companyId',(pg_temp.observation_audit_payload()->>'companyId')::bigint,
    'auditId','9e300000-0000-0000-0000-000000000001','questionId',p_question,'severity','remark',
    'description','Observation fixture '||p_question,'assigneePersonId',(select id from public.people where user_id=p_actor),
    'status','open','photos','[]'::jsonb
  ));
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.internal_audit_save(pg_temp.observation_audit_payload())$$,'legacy rows save without response or photo metadata');
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata)
  select 'internal-audit-photos',payload->>'storagePath',(select auth.uid())::text,'{"mimetype":"image/png","size":8}'::jsonb
  from observation_payloads where name in ('group-photo','other-row','staging')$$,'manager can stage images in one editable audit');
select throws_ok($$select public.internal_audit_save(jsonb_set(pg_temp.grouped_observation_payload(),'{rows,0,responseGroupId}','"spoofed"'))$$,
  '22023',null,'malformed shared response id is rejected');
select throws_ok($$select public.internal_audit_save(jsonb_set(pg_temp.grouped_observation_payload(),'{rows,1,responseGroupId}','null'))$$,
  '22023',null,'an explicit singleton response group is rejected');
select throws_ok($$select public.internal_audit_save(jsonb_set(pg_temp.grouped_observation_payload(),'{rows,1,answer}','"conforme"'))$$,
  '22023',null,'ratings cannot diverge within a response group');
select throws_ok($$select public.internal_audit_save(jsonb_set(pg_temp.grouped_observation_payload(),'{rows,1,observation}','"Observation divergente"'))$$,
  '22023',null,'observation text cannot diverge within a response group');
select throws_ok($$select public.internal_audit_save(jsonb_set(pg_temp.grouped_observation_payload(),'{rows,1,observationPhotos}','[]'))$$,
  '22023',null,'observation evidence cannot diverge within a response group');
select throws_ok($$select public.internal_audit_save(jsonb_set(pg_temp.grouped_observation_payload(),'{rows,2,observationPhotos,0,sizeBytes}','9'))$$,
  '22023',null,'claimed photo metadata must match the uploaded file');

select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000006',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'
  and name in (select payload->>'storagePath' from observation_payloads)),0,'another manager cannot read the uploader’s staging files');
select throws_ok($$select public.internal_audit_save(pg_temp.grouped_observation_payload())$$,
  '42501',null,'another manager cannot attach the uploader’s staging files');

select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.internal_audit_save(pg_temp.grouped_observation_payload())$$,'one committed photo can support both shared references');
select is((select jsonb_agg(jsonb_build_array(question->>'reference',question->'maxPoints') order by ordinal)
  from jsonb_array_elements(pg_temp.observation_audit_payload()->'rows') with ordinality items(question,ordinal)),
  '[["1.1",3],["2.2",7],["2.3",5]]'::jsonb,'each reference and maximum score remains distinct');
select ok((pg_temp.observation_audit_payload()->'rows'->0->'observationPhotos'->0) ? 'storagePath'
  and not ((pg_temp.observation_audit_payload()->'rows'->0->'observationPhotos'->0) ? 'url'),'signed URLs are discarded before attachment');
select lives_ok($$select public.internal_audit_save(pg_temp.observation_audit_payload() #- '{rows,0,responseGroupId}' #- '{rows,0,observationPhotos}')$$,
  'legacy payload omitting new fields does not lose persisted evidence or grouping');
select is(pg_temp.observation_audit_payload()->'rows'->0->>'responseGroupId','9e600000-0000-0000-0000-000000000001','the group survives a legacy save');
select throws_ok($$select public.internal_audit_save(jsonb_set(pg_temp.observation_audit_payload(),'{rows,0,answer}','"conforme"') #- '{rows,0,responseGroupId}')$$,
  '22023',null,'a stale client may not edit only one member of a group');
select throws_ok($$select public.internal_audit_save(jsonb_set(pg_temp.observation_audit_payload('9e300000-0000-0000-0000-000000000002'),
  '{rows,0,observationPhotos}',(pg_temp.observation_audit_payload()->'rows'->0->'observationPhotos')))$$,
  '22023',null,'a committed reference cannot be attached to a different audit');
with removed as (delete from storage.objects where bucket_id='internal-audit-photos'
  and name=(select payload->>'storagePath' from observation_payloads where name='staging') returning 1)
select is((select count(*)::integer from removed),1,'the owner can clean up an uncommitted upload');
select lives_ok($$select pg_temp.add_observation_finding('9e400000-0000-0000-0000-000000000001','q1','9e000000-0000-0000-0000-000000000002')$$,
  'manager records a finding on the first reference for the real Capitaine');
select lives_ok($$select pg_temp.add_observation_finding('9e400000-0000-0000-0000-000000000002','q2','9e000000-0000-0000-0000-000000000003')$$,
  'manager records a finding on the second reference for the real Marin');
select is((select count(*)::integer from public.internal_audit_findings where id::text like '9e400000-%' and photos='[]'::jsonb),2,
  'linked findings use the source observation photo without copying their own evidence');

select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'
  and name in (select payload->>'storagePath' from observation_payloads)),1,'real Capitaine sees evidence only through the related finding');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata)
  select 'internal-audit-photos',payload->>'storagePath',(select auth.uid())::text,'{"mimetype":"image/png","size":8}'::jsonb
  from observation_payloads where name='captain-photo'$$,'42501',null,'real Capitaine cannot upload observation evidence');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000003',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'
  and name=(select payload->>'storagePath' from observation_payloads where name='group-photo')),1,'real Marin sees the shared photo through the second reference');
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'
  and name=(select payload->>'storagePath' from observation_payloads where name='other-row')),0,'real Marin cannot read an unrelated observation photo from the same audit');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000004',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'
  and name in (select payload->>'storagePath' from observation_payloads)),0,'real unassigned Marin has no access to the photo');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000005',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'
  and name in (select payload->>'storagePath' from observation_payloads)),0,'another company’s administrator has no access to the photo');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000006',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'
  and name in (select payload->>'storagePath' from observation_payloads)),2,'another manager can read both committed observation images');

select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.internal_audit_save(jsonb_set(jsonb_set(pg_temp.observation_audit_payload(),
  '{rows,0,responseGroupId}','null'),'{rows,1,responseGroupId}','null'))$$,'both rows can unlink while keeping their answer and evidence');
select is(pg_temp.observation_audit_payload()->'rows'->1->'observationPhotos'->0->>'id',
  '9e500000-0000-0000-0000-000000000001','an unlinked row retained the shared photo');
select lives_ok($$select public.internal_audit_save(jsonb_set(jsonb_set(pg_temp.observation_audit_payload(),
  '{rows,0,observationPhotos}','[]'),'{rows,1,observationPhotos}','[]'))$$,'a manager can remove both draft references');
with removed as (delete from storage.objects where bucket_id='internal-audit-photos'
  and name=(select payload->>'storagePath' from observation_payloads where name='group-photo') returning 1)
select is((select count(*)::integer from removed),0,'even its uploader cannot delete a once-committed image after draft references are removed');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000002',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'
  and name in (select payload->>'storagePath' from observation_payloads)),0,'removing draft references removes assignee access to the files');

select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000001',true);
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata)
  select 'internal-audit-photos',payload->>'storagePath',(select auth.uid())::text,'{"mimetype":"image/png","size":8}'::jsonb
  from observation_payloads where name='completion-photo'$$,'manager can stage a final photo before completion');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000006',true);
select lives_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata)
  select 'internal-audit-photos',payload->>'storagePath',(select auth.uid())::text,'{"mimetype":"image/png","size":8}'::jsonb
  from observation_payloads where name='race-staging'$$,'another manager can stage a photo while the audit is still editable');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.internal_audit_save(jsonb_set(pg_temp.observation_audit_payload()
  ||'{"status":"completed","performedOn":"2026-09-30","auditorName":"Auditeur"}'::jsonb,
  '{rows,0,observationPhotos}',jsonb_build_array((select payload from observation_payloads where name='completion-photo'))))$$,
  'final save attaches pending evidence and freezes the audit in one transaction');
select throws_ok($$select public.internal_audit_save(jsonb_set(pg_temp.observation_audit_payload(),'{rows,0,observationPhotos}','[]'))$$,
  '55000',null,'completed observation evidence cannot be changed');
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'
  and name=(select payload->>'storagePath' from observation_payloads where name='race-staging')),0,
  'the completing manager cannot see another manager’s staged image after completion');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000006',true);
select is((select count(*)::integer from storage.objects where bucket_id='internal-audit-photos'
  and name=(select payload->>'storagePath' from observation_payloads where name='race-staging')),1,
  'the staging owner can still find their unattached photo after another manager completes the audit');
with removed as (delete from storage.objects where bucket_id='internal-audit-photos'
  and name=(select payload->>'storagePath' from observation_payloads where name='race-staging') returning 1)
select is((select count(*)::integer from removed),1,'the owner can clean up their unattached upload after completion');
select throws_ok($$insert into storage.objects(bucket_id,name,owner_id,metadata)
  select 'internal-audit-photos',payload->>'storagePath',(select auth.uid())::text,'{"mimetype":"image/png","size":8}'::jsonb
  from observation_payloads where name='race-staging'$$,'42501',null,'completed audits cannot receive more observation attachments');

reset role;
select * from finish();
rollback;
