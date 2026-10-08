begin;
select no_plan();

insert into public.companies(code,name) values ('audit-grid-participants-other','Audit isolation fixture');
insert into auth.users(id,email) values
 ('9c000000-0000-0000-0000-000000000001','audit-manager@example.invalid'),
 ('9c000000-0000-0000-0000-000000000002','audit-captain@example.invalid'),
 ('9c000000-0000-0000-0000-000000000003','audit-chief@example.invalid'),
 ('9c000000-0000-0000-0000-000000000004','audit-crew@example.invalid'),
 ('9c000000-0000-0000-0000-000000000005','audit-unassigned@example.invalid'),
 ('9c000000-0000-0000-0000-000000000006','audit-other-company@example.invalid');
insert into public.profiles(id,email,display_name,active_company_id)
select fixture.id,fixture.email,fixture.name,company.id from (values
 ('9c000000-0000-0000-0000-000000000001'::uuid,'audit-manager@example.invalid','Audit Manager','bbtm'),
 ('9c000000-0000-0000-0000-000000000002'::uuid,'audit-captain@example.invalid','Audit Captain','bbtm'),
 ('9c000000-0000-0000-0000-000000000003'::uuid,'audit-chief@example.invalid','Audit Chief','bbtm'),
 ('9c000000-0000-0000-0000-000000000004'::uuid,'audit-crew@example.invalid','Audit Crew','bbtm'),
 ('9c000000-0000-0000-0000-000000000005'::uuid,'audit-unassigned@example.invalid','Audit Unassigned','bbtm'),
 ('9c000000-0000-0000-0000-000000000006'::uuid,'audit-other-company@example.invalid','Audit Other Company','audit-grid-participants-other')
) fixture(id,email,name,company_code) join public.companies company on company.code = fixture.company_code;
insert into public.company_memberships(company_id,user_id,active) select active_company_id,id,true from public.profiles where id::text like '9c000000-%'
on conflict(company_id,user_id) do update set active=excluded.active;
insert into public.user_roles(user_id,company_id,role_key)
select profile.id,profile.active_company_id,case profile.id::text when '9c000000-0000-0000-0000-000000000001' then 'armement'
 when '9c000000-0000-0000-0000-000000000002' then 'capitaine' when '9c000000-0000-0000-0000-000000000006' then 'admin' else 'marin' end
from public.profiles profile where id::text like '9c000000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'Audit',case right(id::text,1) when '2' then 'Captain' when '3' then 'Chief' when '4' then 'Crew' else 'Unassigned' end,
 case right(id::text,1) when '2' then 'Capitaine' when '3' then 'Chef Mécanicien' else 'Matelot' end,true
from public.profiles where id::text like '9c000000-%';
insert into public.vessels(company_id,name) select id,'AUDIT-PARTICIPANTS-TEST-LE ROZEL' from public.companies where code = 'bbtm';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status,source_label)
select company.id,vessel.id,captain.id,crew.id,current_date-1,current_date+1,'crew','confirmed','audit-test'
from public.companies company join public.vessels vessel on vessel.company_id = company.id and vessel.name = 'AUDIT-PARTICIPANTS-TEST-LE ROZEL'
join public.people captain on captain.user_id = '9c000000-0000-0000-0000-000000000002'
join public.people crew on crew.user_id in ('9c000000-0000-0000-0000-000000000003','9c000000-0000-0000-0000-000000000004')
where company.code = 'bbtm';

create temporary table audit_fixture_payload(kind text primary key,payload jsonb);
grant select,update on audit_fixture_payload to authenticated;
insert into audit_fixture_payload values ('site',jsonb_build_object('id','9c100000-0000-0000-0000-000000000001','companyId',(select id from public.companies where code='bbtm'),
 'name','AUDIT-PARTICIPANTS-TEST site','kind','vessel','vesselId',(select id from public.vessels where name='AUDIT-PARTICIPANTS-TEST-LE ROZEL'),'anniversaryOn','2026-09-30'));
insert into audit_fixture_payload values ('template',jsonb_build_object('id','9c200000-0000-0000-0000-000000000001','companyId',(select id from public.companies where code='bbtm'),
 'siteId','9c100000-0000-0000-0000-000000000001','name','AUDIT-PARTICIPANTS-TEST grid','version',1,'active',true,'rows',
 '[{"id":"q1","section":"ISM 1","reference":"1.1","question":"Question 1","maxPoints":3,"guidance":""},{"id":"q2","section":"ISM 2","reference":"2.1","question":"Question 2","maxPoints":3,"guidance":""}]'::jsonb));
insert into audit_fixture_payload values ('audit',jsonb_build_object('id','9c300000-0000-0000-0000-000000000001','companyId',(select id from public.companies where code='bbtm'),
 'siteId','9c100000-0000-0000-0000-000000000001','templateId','9c200000-0000-0000-0000-000000000001','templateName','AUDIT-PARTICIPANTS-TEST grid','templateVersion',1,
 'year',2026,'plannedOn','2026-09-30','performedOn',null,'auditorName','Auditeur réel','status','planned','rows',
 '[{"id":"q1","section":"ISM 1","reference":"1.1","question":"Question 1","maxPoints":3,"guidance":"","answer":"conforme","observation":""},{"id":"q2","section":"ISM 2","reference":"2.1","question":"Question 2","maxPoints":3,"guidance":"","answer":"incomplet","observation":""}]'::jsonb));
insert into audit_fixture_payload
select 'finding-'||fixture.suffix,jsonb_build_object('id',('9c400000-0000-0000-0000-'||lpad(fixture.suffix,12,'0'))::uuid,
 'companyId',company.id,'auditId','9c300000-0000-0000-0000-000000000001','questionId','q1','reference','1.1','severity',fixture.severity,'description','Écart '||fixture.suffix,
 'assigneePersonId',case when fixture.role is null then (select id from public.people where user_id='9c000000-0000-0000-0000-000000000004') end,
 'assigneeRole',fixture.role,'assigneeVesselId',case when fixture.role is not null then (select id from public.vessels where name='AUDIT-PARTICIPANTS-TEST-LE ROZEL') end,'assigneeLabel','label supplied by client',
 'dueOn','2026-10-30','status','open','treatment','','resolvedAt',null,'closedAt',null)
from (values('1','captain','major'),('2','chief_engineer','minor'),('3','crew','remark'),('4',null::text,'minor')) fixture(suffix,role,severity)
cross join public.companies company where company.code='bbtm';

update public.people set first_name='Marianne',last_name='QHSE',function_label='Directeur QHSE / Chef de Projet'
where user_id='9c000000-0000-0000-0000-000000000001';
update audit_fixture_payload set payload=jsonb_set(jsonb_set(payload,'{rows,0,hrFunction}','"Capitaine"'),'{rows,1,hrFunction}','"Chef Mécanicien"')
where kind in ('template','audit');
update audit_fixture_payload set payload=payload || jsonb_build_object('participantPersonIds',(
  select jsonb_agg(id order by id) from public.people where user_id in ('9c000000-0000-0000-0000-000000000002','9c000000-0000-0000-0000-000000000003')))
where kind='audit';

insert into auth.users(id,email) values ('9c000000-0000-0000-0000-000000000007','audit-profile-only-admin@example.invalid');
insert into public.profiles(id,email,display_name,active_company_id)
select '9c000000-0000-0000-0000-000000000007','audit-profile-only-admin@example.invalid','Responsable sans fiche RH',id from public.companies where code='bbtm';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id='9c000000-0000-0000-0000-000000000007'
on conflict(company_id,user_id) do update set active=excluded.active;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,'admin' from public.profiles where id='9c000000-0000-0000-0000-000000000007';

insert into storage.objects(bucket_id,name,metadata)
select 'working-time-signatures',company_id||'/'||id||'/audit-participant.png',jsonb_build_object('mimetype','image/png','size',128)
from public.people where user_id::text like '9c000000-%';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_path,mime_type,file_size_bytes,sha256)
select company_id,id,1,company_id||'/'||id||'/audit-participant.png','image/png',128,repeat('a',64)
from public.people where user_id::text like '9c000000-%' and user_id<>'9c000000-0000-0000-0000-000000000003';

select has_table('public','internal_audit_participants','participants keep independent identity and signature snapshots');
select ok((select relrowsecurity from pg_class where oid='public.internal_audit_participants'::regclass),'participants enforce audit RLS');
select ok(not has_table_privilege('authenticated','public.internal_audit_participants','INSERT'),'clients cannot forge participant identities');
select ok(not has_table_privilege('authenticated','public.internal_audit_participants','UPDATE'),'clients cannot forge signature snapshots');
select ok(not has_function_privilege('authenticated','internal_audit_private.snapshot_participant(bigint,uuid,bigint,boolean,boolean)','EXECUTE'),'snapshot internals cannot be invoked by clients');
select ok(not has_function_privilege('authenticated','internal_audit_private.save_audit_before_participants(jsonb)','EXECUTE'),'the prior save cannot bypass participant validation');
select ok(not has_function_privilege('anon','public.internal_audit_archive_template(uuid,integer)','EXECUTE'),'anonymous users cannot archive templates');

set local role authenticated;
select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000001',true);
select is((public.internal_audits_overview()->'permissions'->>'canManage')::boolean,true,'real RH QHSE with Armement role manages audits');
select ok(public.internal_audits_overview()->'hrFunctions' ? 'Directeur QHSE / Chef de Projet','the catalogue includes the real QHSE HR function');
select ok(public.internal_audits_overview()->'hrFunctions' ? 'Capitaine','the catalogue includes real navigant HR functions');
select lives_ok($$select public.internal_audit_save_site((select payload from audit_fixture_payload where kind='site'))$$,'QHSE creates the fixture site');
select throws_ok($$select public.internal_audit_save_template((select jsonb_set(payload,'{rows,0,hrFunction}','"Fonction inventée"') from audit_fixture_payload where kind='template'))$$,'22023',null,'invented HR functions are rejected');
select throws_ok($$select public.internal_audit_save_template((select jsonb_set(payload,'{rows,0,hrFunction}','123') from audit_fixture_payload where kind='template'))$$,'22023',null,'non-text HR function payloads are rejected');
select lives_ok($$select public.internal_audit_save_template((select payload from audit_fixture_payload where kind='template'))$$,'real HR functions can be assigned to each template row');
select lives_ok($$select public.internal_audit_save((select payload from audit_fixture_payload where kind='audit'))$$,'QHSE selects genuine HR participants');
select is((select rows->0->>'hrFunction' from public.internal_audits where id='9c300000-0000-0000-0000-000000000001'),'Capitaine','new audit snapshots preserve the row HR function');
select is((select count(*)::integer from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001'),3,'selected participants and the real QHSE author are recorded once');
select is((select first_name from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000001'),'Marianne','automatic contributors use the true RH first name');
select ok(not exists(select 1 from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and signature_snapshot ? 'signed_at'),'profile signature images never claim an audit signing time');
select ok(exists(select 1 from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and signature_snapshot->>'storage_bucket'='working-time-signatures'),'genuine profile signature references are retained');
select is((select signature_snapshot from public.internal_audit_participants where user_id='9c000000-0000-0000-0000-000000000003'),'{}'::jsonb,'a selected participant can initially have no registered signature');
select throws_ok($$select public.internal_audit_save((select payload || jsonb_build_object('participantPersonIds',jsonb_build_array((select id from public.people where user_id='9c000000-0000-0000-0000-000000000006'))) from audit_fixture_payload where kind='audit'))$$,'22023',null,'a foreign-company participant cannot be selected');
select throws_ok($$select public.internal_audit_save((select payload || '{"participantPersonIds":["123"]}'::jsonb from audit_fixture_payload where kind='audit'))$$,'22023',null,'participant IDs must be genuine numeric RH IDs');
select lives_ok($$select public.internal_audit_save((select payload || '{"participants":[{"personId":999999,"firstName":"Forged","lastName":"Identity","signatureSnapshot":{"storage_bucket":"working-time-signatures","storage_path":"forged.png"}}]}'::jsonb from audit_fixture_payload where kind='audit'))$$,'supplied identity and signature objects are ignored');
select ok(not exists(select 1 from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and (first_name='Forged' or signature_snapshot->>'storage_path'='forged.png')),'no forged identity or signature is persisted');
select lives_ok($$select public.internal_audit_save_finding((select payload from audit_fixture_payload where kind='finding-1'))$$,'a captain finding is created');
select lives_ok($$select public.internal_audit_save_finding((select payload from audit_fixture_payload where kind='finding-4'))$$,'a personally assigned Marin finding is created');
select throws_ok($$select public.internal_audit_archive_template('9c200000-0000-0000-0000-000000000001',99)$$,'40001',null,'stale template deletion is rejected');
select lives_ok($$select public.internal_audit_archive_template('9c200000-0000-0000-0000-000000000001',1)$$,'QHSE safely archives a referenced template');
select is((select active from public.internal_audit_templates where id='9c200000-0000-0000-0000-000000000001'),false,'template deletion sets active false');
select ok(not exists(select 1 from jsonb_array_elements(public.internal_audits_overview()->'templates') template where template->>'id'='9c200000-0000-0000-0000-000000000001'),'archived templates disappear from the live overview');
select is((select template_name from public.internal_audits where id='9c300000-0000-0000-0000-000000000001'),'AUDIT-PARTICIPANTS-TEST grid','existing audits keep their original template snapshot');
select throws_ok($$select public.internal_audit_save((select payload || '{"id":"9c300000-0000-0000-0000-000000000099","year":2027,"plannedOn":"2027-09-30"}'::jsonb from audit_fixture_payload where kind='audit'))$$,'22023',null,'new audits cannot choose archived templates');
select throws_ok($$select public.internal_audit_save_template((select payload || '{"version":2,"active":true}'::jsonb from audit_fixture_payload where kind='template'))$$,'55000',null,'a deleted template cannot be silently reactivated');
select lives_ok($$select public.internal_audit_save((select payload from audit_fixture_payload where kind='audit'))$$,'draft audits remain editable after their source template is archived');

select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000002',true);
select is((public.internal_audits_overview()->'permissions'->>'canManage')::boolean,false,'real Capitaine cannot manage templates or audit selection');
select throws_ok($$select public.internal_audit_archive_template('9c200000-0000-0000-0000-000000000001',2)$$,'42501',null,'real Capitaine cannot archive a template');
select throws_ok($$select public.internal_audit_save((select payload from audit_fixture_payload where kind='audit'))$$,'42501',null,'real Capitaine cannot forge audit participant selection');
select lives_ok($$select public.internal_audit_add_treatment('9c400000-0000-0000-0000-000000000001','in_progress','Contrôle du capitaine')$$,'a real captain contribution is recorded');
select is((select count(*)::integer from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000002'),1,'selected and contributing identity is deduplicated');
select ok(exists(select 1 from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000002' and selected and contributed),'explicit selection and contribution remain independent server flags');
select is((select participant->>'source' from jsonb_array_elements(public.internal_audits_overview()->'audits') audit cross join lateral jsonb_array_elements(audit->'participants') participant where audit->>'id'='9c300000-0000-0000-0000-000000000001' and participant->>'userId'='9c000000-0000-0000-0000-000000000002'),'contributor','real contribution takes priority over selection in the participant UI source');
select ok(exists(select 1 from jsonb_array_elements(public.internal_audits_overview()->'audits') audit where audit->>'id'='9c300000-0000-0000-0000-000000000001' and audit->'participantPersonIds' @> jsonb_build_array((select person_id from public.internal_audit_participants where user_id='9c000000-0000-0000-0000-000000000002'))),'contributing participants still retain their independent explicit selected ID');
select ok(internal_audit_private.can_read_participant_signature('working-time-signatures',(select signature_snapshot->>'storage_path' from public.internal_audit_participants where user_id='9c000000-0000-0000-0000-000000000001')),'authorized captain can read the signature actually linked to the audit');
select ok(not internal_audit_private.can_read_participant_signature('other-bucket',(select signature_snapshot->>'storage_path' from public.internal_audit_participants where user_id='9c000000-0000-0000-0000-000000000001')),'signature permission checks the exact storage bucket');
select ok(not internal_audit_private.can_read_participant_signature('working-time-signatures','unrelated.png'),'unrelated signatures are not exposed by the audit policy');

select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000001',true);
reset role;
update public.people set active=false where user_id in ('9c000000-0000-0000-0000-000000000002','9c000000-0000-0000-0000-000000000005');
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_path,mime_type,file_size_bytes,sha256)
select company_id,id,1,company_id||'/'||id||'/audit-participant.png','image/png',128,repeat('a',64)
from public.people where user_id='9c000000-0000-0000-0000-000000000003';
set local role authenticated;
select lives_ok($$select public.internal_audit_save((select payload from audit_fixture_payload where kind='audit'))$$,'saving preparation completes previously missing signature snapshots');
select is((select first_name from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000002'),'Audit','an already selected participant becoming inactive retains their historical identity');
select throws_ok($$select public.internal_audit_save((select payload || jsonb_build_object('participantPersonIds',(payload->'participantPersonIds')||jsonb_build_array((select id from public.people where user_id='9c000000-0000-0000-0000-000000000005'))) from audit_fixture_payload where kind='audit'))$$,'22023',null,'a newly selected inactive person is still rejected');
select ok(exists(select 1 from public.internal_audit_participants where user_id='9c000000-0000-0000-0000-000000000003' and signature_snapshot->>'storage_bucket'='working-time-signatures'),'an existing empty participant snapshot picks up a newly deposited profile signature');
select lives_ok($$select public.internal_audit_save((select payload || '{"participantPersonIds":[]}'::jsonb from audit_fixture_payload where kind='audit'))$$,'explicit selections can be removed in draft');
select is((select count(*)::integer from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001'),2,'removing selected-only participants retains actual contributors');
select is((select participant->>'source' from jsonb_array_elements(public.internal_audits_overview()->'audits') audit cross join lateral jsonb_array_elements(audit->'participants') participant where audit->>'id'='9c300000-0000-0000-0000-000000000001' and participant->>'userId'='9c000000-0000-0000-0000-000000000002'),'contributor','a real contributor remains in the participant list after removing explicit selection');
select lives_ok($$select public.internal_audit_save((select payload || '{"status":"completed","performedOn":"2026-09-30"}'::jsonb from audit_fixture_payload where kind='audit'))$$,'completion preserves selected participants and report snapshots');
select ok(exists(select 1 from public.internal_audit_participants where user_id='9c000000-0000-0000-0000-000000000003' and signature_snapshot->>'storage_bucket'='working-time-signatures'),'a signature deposited after initial selection is included at completion');
select throws_ok($$select public.internal_audit_save((select payload || '{"participantPersonIds":[]}'::jsonb from audit_fixture_payload where kind='audit'))$$,'55000',null,'completed participant selection remains frozen');

select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.internal_audit_archive_template('9c200000-0000-0000-0000-000000000001',2)$$,'42501',null,'real Marin cannot archive templates');
select lives_ok($$select public.internal_audit_add_treatment('9c400000-0000-0000-0000-000000000004','resolved','Traitement du marin après réalisation')$$,'a real Marin contributes after the audit has completed');
select is((select count(*)::integer from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001'),4,'completed report includes new real treatment authors');
select is((select first_name from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000004'),'Audit','post-completion contributor uses their genuine RH first name');
select is((select status from public.internal_audits where id='9c300000-0000-0000-0000-000000000001'),'completed','treatment contributions leave the completed audit record frozen');

select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000005',true);
select is((select count(*)::integer from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001'),0,'unassigned real Marin sees no audit participant identity');
select ok(not internal_audit_private.can_read_participant_signature('working-time-signatures',(select company_id||'/'||id||'/audit-participant.png' from public.people where user_id='9c000000-0000-0000-0000-000000000005')),'an unlinked signature is not granted by audit access');

select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000006',true);
select is((select count(*)::integer from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001'),0,'another company admin sees no participant snapshot');
select throws_ok($$select public.internal_audit_archive_template('9c200000-0000-0000-0000-000000000001',2)$$,'42501',null,'another company admin cannot archive BBTM templates');

select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000007',true);
select lives_ok($$select public.internal_audit_add_treatment('9c400000-0000-0000-0000-000000000004','closed','Vérification administrative')$$,'a real Admin without RH link contributes after completion');
select is((select first_name from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000007'),'','profile-only names are not split into fictitious first names');
select is((select last_name from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000007'),'Responsable sans fiche RH','the genuine profile display name is retained');
select is((select person_id from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000007'),null::bigint,'no fictional RH person is created');
select is((select signature_snapshot from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000007'),'{}'::jsonb,'profile-only contributors have an explicit missing signature');
select ok(exists(select 1 from jsonb_array_elements(public.internal_audits_overview()->'audits') audit cross join lateral jsonb_array_elements(audit->'participants') participant
  where audit->>'id'='9c300000-0000-0000-0000-000000000001' and participant->>'userId'='9c000000-0000-0000-0000-000000000007' and participant->>'source'='contributor'),'overview includes true profile-only contributors in the agreed JSON contract');

reset role;
update public.people set first_name='Prénom changé',last_name='NOM CHANGÉ' where user_id='9c000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','9c000000-0000-0000-0000-000000000001',true);
select is((select first_name from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000002'),'Audit','historical participant names remain independent of later RH changes');

reset role;
update public.people set active=false where user_id='9c000000-0000-0000-0000-000000000005';
select internal_audit_private.snapshot_account_contributor((select id from public.companies where code='bbtm'),'9c300000-0000-0000-0000-000000000001','9c000000-0000-0000-0000-000000000005');
insert into storage.objects(bucket_id,name,metadata)
select 'working-time-signatures',company_id||'/'||id||'/audit-participant-v2.png',jsonb_build_object('mimetype','image/png','size',128)
from public.people where user_id='9c000000-0000-0000-0000-000000000002';
update public.working_time_profile_signatures set valid_to=clock_timestamp(),revoked_by='9c000000-0000-0000-0000-000000000002',revocation_reason='Nouvelle signature de profil'
where person_id=(select id from public.people where user_id='9c000000-0000-0000-0000-000000000002') and valid_to is null;
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_path,mime_type,file_size_bytes,sha256)
select company_id,id,2,company_id||'/'||id||'/audit-participant-v2.png','image/png',128,repeat('b',64)
from public.people where user_id='9c000000-0000-0000-0000-000000000002';
set local role authenticated;
select is((select first_name from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000005'),'Audit','historical contributors retain genuine RH first names even when now inactive');
select ok(exists(select 1 from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000005' and person_id is not null),'inactive historical contributors retain their real RH person link');
select is((select signature_snapshot->>'version_number' from public.internal_audit_participants where audit_id='9c300000-0000-0000-0000-000000000001' and user_id='9c000000-0000-0000-0000-000000000002'),'1','a new profile signature never overwrites the historical participant snapshot');

select * from finish();
rollback;
