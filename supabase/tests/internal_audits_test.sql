begin;
select no_plan();

select has_table('public','internal_audits','annual audit records exist');
select has_function('public','internal_audit_add_treatment',array['uuid','text','text'],'treatment has a dedicated guarded RPC');
select ok(not has_function_privilege('anon','public.internal_audits_overview()','EXECUTE'),'anonymous callers cannot read the overview');
select ok(not has_table_privilege('authenticated','public.internal_audits','UPDATE'),'direct audit updates cannot bypass completion rules');
select ok(not has_table_privilege('authenticated','public.internal_audit_finding_events','INSERT'),'history cannot be forged by direct insert');
select is((select count(*)::integer from public.internal_audit_sites site join public.companies company on company.id = site.company_id where company.code = 'bbtm'),8,'eight requested targets are seeded');
select is((select jsonb_array_length(rows) from public.internal_audit_templates where name = 'Grille d’audit BBTM'),61,'workbook reference has 61 questions');
select is((select sum((question->>'maxPoints')::integer)::integer from public.internal_audit_templates template cross join lateral jsonb_array_elements(template.rows) question where template.name = 'Grille d’audit BBTM'),183,'confirmed barèmes total 183 points');
select ok(not internal_audit_private.valid_rows('[{"question":"test","section":"ISM","reference":"1","guidance":"","maxPoints":3}]'),'a tampered question missing its ID is invalid');
select ok(not internal_audit_private.valid_rows('[{"id":"q","section":"ISM","reference":"1","guidance":"","maxPoints":3}]'),'a tampered question missing its text is invalid');
select ok(not internal_audit_private.valid_rows('[{"id":"q","section":"ISM","reference":"1","guidance":"","question":"test"}]'),'a tampered question missing its barème is invalid');
select ok(not internal_audit_private.valid_rows('[{"id":"q","section":"ISM","reference":"1","guidance":"","question":"test","maxPoints":-3}]'),'negative barèmes are rejected');
select ok(not internal_audit_private.valid_rows('[{"id":"q","section":"","reference":"1","guidance":"","question":"test","maxPoints":3}]'),'missing ISM section is rejected');

insert into public.companies(code,name) values ('internal-audit-test-other','Audit isolation fixture');
insert into auth.users(id,email) values
 ('9b000000-0000-0000-0000-000000000001','audit-manager@example.invalid'),
 ('9b000000-0000-0000-0000-000000000002','audit-captain@example.invalid'),
 ('9b000000-0000-0000-0000-000000000003','audit-chief@example.invalid'),
 ('9b000000-0000-0000-0000-000000000004','audit-crew@example.invalid'),
 ('9b000000-0000-0000-0000-000000000005','audit-unassigned@example.invalid'),
 ('9b000000-0000-0000-0000-000000000006','audit-other-company@example.invalid');
insert into public.profiles(id,email,display_name,active_company_id)
select fixture.id,fixture.email,fixture.name,company.id from (values
 ('9b000000-0000-0000-0000-000000000001'::uuid,'audit-manager@example.invalid','Audit Manager','bbtm'),
 ('9b000000-0000-0000-0000-000000000002'::uuid,'audit-captain@example.invalid','Audit Captain','bbtm'),
 ('9b000000-0000-0000-0000-000000000003'::uuid,'audit-chief@example.invalid','Audit Chief','bbtm'),
 ('9b000000-0000-0000-0000-000000000004'::uuid,'audit-crew@example.invalid','Audit Crew','bbtm'),
 ('9b000000-0000-0000-0000-000000000005'::uuid,'audit-unassigned@example.invalid','Audit Unassigned','bbtm'),
 ('9b000000-0000-0000-0000-000000000006'::uuid,'audit-other-company@example.invalid','Audit Other Company','internal-audit-test-other')
) fixture(id,email,name,company_code) join public.companies company on company.code = fixture.company_code;
insert into public.company_memberships(company_id,user_id,active) select active_company_id,id,true from public.profiles where id::text like '9b000000-%'
on conflict(company_id,user_id) do update set active=excluded.active;
insert into public.user_roles(user_id,company_id,role_key)
select profile.id,profile.active_company_id,case profile.id::text when '9b000000-0000-0000-0000-000000000001' then 'armement'
 when '9b000000-0000-0000-0000-000000000002' then 'capitaine' when '9b000000-0000-0000-0000-000000000006' then 'admin' else 'marin' end
from public.profiles profile where id::text like '9b000000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'Audit',case right(id::text,1) when '2' then 'Captain' when '3' then 'Chief' when '4' then 'Crew' else 'Unassigned' end,
 case right(id::text,1) when '2' then 'Capitaine' when '3' then 'Chef Mécanicien' else 'Matelot' end,true
from public.profiles where id::text like '9b000000-%';
insert into public.vessels(company_id,name) select id,'AUDIT-TEST-LE ROZEL' from public.companies where code = 'bbtm';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status,source_label)
select company.id,vessel.id,captain.id,crew.id,current_date-1,current_date+1,'crew','confirmed','audit-test'
from public.companies company join public.vessels vessel on vessel.company_id = company.id and vessel.name = 'AUDIT-TEST-LE ROZEL'
join public.people captain on captain.user_id = '9b000000-0000-0000-0000-000000000002'
join public.people crew on crew.user_id in ('9b000000-0000-0000-0000-000000000003','9b000000-0000-0000-0000-000000000004')
where company.code = 'bbtm';

create temporary table audit_fixture_payload(kind text primary key,payload jsonb);
grant select,update on audit_fixture_payload to authenticated;
insert into audit_fixture_payload values ('site',jsonb_build_object('id','9b100000-0000-0000-0000-000000000001','companyId',(select id from public.companies where code='bbtm'),
 'name','AUDIT-TEST site','kind','vessel','vesselId',(select id from public.vessels where name='AUDIT-TEST-LE ROZEL'),'anniversaryOn','2026-09-30'));
insert into audit_fixture_payload values ('template',jsonb_build_object('id','9b200000-0000-0000-0000-000000000001','companyId',(select id from public.companies where code='bbtm'),
 'siteId','9b100000-0000-0000-0000-000000000001','name','AUDIT-TEST grid','version',1,'active',true,'rows',
 '[{"id":"q1","section":"ISM 1","reference":"1.1","question":"Question 1","maxPoints":3,"guidance":""},{"id":"q2","section":"ISM 2","reference":"2.1","question":"Question 2","maxPoints":3,"guidance":""}]'::jsonb));
insert into audit_fixture_payload values ('audit',jsonb_build_object('id','9b300000-0000-0000-0000-000000000001','companyId',(select id from public.companies where code='bbtm'),
 'siteId','9b100000-0000-0000-0000-000000000001','templateId','9b200000-0000-0000-0000-000000000001','templateName','AUDIT-TEST grid','templateVersion',1,
 'year',2026,'plannedOn','2026-09-30','performedOn',null,'auditorName','Auditeur réel','status','planned','rows',
 '[{"id":"q1","section":"ISM 1","reference":"1.1","question":"Question 1","maxPoints":3,"guidance":"","answer":"conforme","observation":""},{"id":"q2","section":"ISM 2","reference":"2.1","question":"Question 2","maxPoints":3,"guidance":"","answer":"incomplet","observation":""}]'::jsonb));
insert into audit_fixture_payload
select 'finding-'||fixture.suffix,jsonb_build_object('id',('9b400000-0000-0000-0000-'||lpad(fixture.suffix,12,'0'))::uuid,
 'companyId',company.id,'auditId','9b300000-0000-0000-0000-000000000001','questionId','q1','reference','1.1','severity',fixture.severity,'description','Écart '||fixture.suffix,
 'assigneePersonId',case when fixture.role is null then (select id from public.people where user_id='9b000000-0000-0000-0000-000000000004') end,
 'assigneeRole',fixture.role,'assigneeVesselId',case when fixture.role is not null then (select id from public.vessels where name='AUDIT-TEST-LE ROZEL') end,'assigneeLabel','label supplied by client',
 'dueOn','2026-10-30','status','open','treatment','','resolvedAt',null,'closedAt',null)
from (values('1','captain','major'),('2','chief_engineer','minor'),('3','crew','remark'),('4',null::text,'minor')) fixture(suffix,role,severity)
cross join public.companies company where company.code='bbtm';

set local role authenticated;
select set_config('request.jwt.claim.sub','9b000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.internal_audit_save_site((select payload from audit_fixture_payload where kind='site'))$$,'Armement creates a scoped site');
select lives_ok($$select public.internal_audit_save_template((select payload from audit_fixture_payload where kind='template'))$$,'Armement creates a vessel-specific grid');
select lives_ok($$select public.internal_audit_save((select payload from audit_fixture_payload where kind='audit'))$$,'Armement plans an annual audit');
select is((select rows->0->>'answer' from public.internal_audits where id='9b300000-0000-0000-0000-000000000001'),null,'new audits start unanswered from the server template snapshot');
select lives_ok($$select public.internal_audit_save((select payload from audit_fixture_payload where kind='audit'))$$,'draft answers are saved independently');
select throws_ok($$select public.internal_audit_save((select jsonb_set(payload,'{plannedOn}','"2027-01-01"') from audit_fixture_payload where kind='audit'))$$,'22023',null,'planning beyond the fixed three-month window is rejected');
select lives_ok($$select public.internal_audit_save((select jsonb_set(payload,'{plannedOn}','"2026-12-30"') from audit_fixture_payload where kind='audit'))$$,'exactly three calendar months after the anniversary is allowed');
select lives_ok($$select public.internal_audit_save_finding((select payload from audit_fixture_payload where kind='finding-1'))$$,'major finding assigned to vessel captains is created');
select lives_ok($$select public.internal_audit_save_finding((select payload from audit_fixture_payload where kind='finding-2'))$$,'minor finding assigned to chief engineers is created');
select lives_ok($$select public.internal_audit_save_finding((select payload from audit_fixture_payload where kind='finding-3'))$$,'remark assigned to vessel crew is created');
select lives_ok($$select public.internal_audit_save_finding((select payload from audit_fixture_payload where kind='finding-4'))$$,'a person can be assigned a second finding on the same question');
select is((select count(*)::integer from public.internal_audit_findings where audit_id='9b300000-0000-0000-0000-000000000001'),4,'one question supports multiple findings');
select is((select assignee_label from public.internal_audit_findings where id='9b400000-0000-0000-0000-000000000001'),'Capitaines AUDIT-TEST-LE ROZEL','assignment labels are resolved by the server');
select throws_ok($$select public.internal_audit_save((select jsonb_set(payload,'{rows}',jsonb_build_array(payload->'rows'->1)) from audit_fixture_payload where kind='audit'))$$,'22023',null,'a question with findings cannot be removed');
select throws_ok($$select public.internal_audit_save((select jsonb_set(jsonb_set(payload,'{status}','"completed"'),'{performedOn}','"2026-09-30"') || jsonb_build_object('rows',(select rows from public.internal_audits where id='9b300000-0000-0000-0000-000000000001') || '[{"id":"q3","section":"ISM","reference":"3","question":"Unanswered","guidance":"","maxPoints":3,"answer":null,"observation":""}]'::jsonb) from audit_fixture_payload where kind='audit'))$$,'22023',null,'completion requires every answer');
select lives_ok($$select public.internal_audit_save((select payload || '{"status":"completed","performedOn":"2026-09-30"}'::jsonb from audit_fixture_payload where kind='audit'))$$,'complete answers and audit metadata are frozen');
select throws_ok($$select public.internal_audit_save((select payload from audit_fixture_payload where kind='audit'))$$,'55000',null,'completed audits cannot be reopened or rewritten');
select lives_ok($$select public.internal_audit_save_template((select jsonb_set(payload,'{name}','"Changed grid"') from audit_fixture_payload where kind='template'))$$,'the source template can evolve after completion');
select is((select template_name from public.internal_audits where id='9b300000-0000-0000-0000-000000000001'),'AUDIT-TEST grid','historical template name remains unchanged');
select is((select template_version from public.internal_audits where id='9b300000-0000-0000-0000-000000000001'),1,'historical version remains unchanged');

-- These are separate authenticated accounts, never simulated admin views.
select set_config('request.jwt.claim.sub','9b000000-0000-0000-0000-000000000002',true);
select is((public.internal_audits_overview()->'permissions'->>'canManage')::boolean,false,'real Capitaine cannot design or conduct audits');
select is((select count(*)::integer from public.internal_audit_findings where audit_id='9b300000-0000-0000-0000-000000000001'),2,'real captain sees captain and crew assignments only');
select is((select count(*)::integer from public.internal_audits where id='9b300000-0000-0000-0000-000000000001'),1,'an assigned captain can read the original graded audit');
select is((select count(*)::integer from public.internal_audit_templates),0,'real Capitaine has no template access');
select lives_ok($$select public.internal_audit_add_treatment('9b400000-0000-0000-0000-000000000001','in_progress','Contrôle du capitaine engagé')$$,'assigned real captain records treatment progress');
select throws_ok($$select public.internal_audit_add_treatment('9b400000-0000-0000-0000-000000000001','closed','Clôture directe')$$,'42501',null,'assigned captain cannot bypass manager verification');
select throws_ok($$select public.internal_audit_save((select payload from audit_fixture_payload where kind='audit'))$$,'42501',null,'captain cannot change audit answers through the RPC');
select throws_ok($$select public.internal_audit_save_template((select payload from audit_fixture_payload where kind='template'))$$,'42501',null,'captain cannot design templates through the RPC');

select set_config('request.jwt.claim.sub','9b000000-0000-0000-0000-000000000003',true);
select is((select count(*)::integer from public.internal_audit_findings where audit_id='9b300000-0000-0000-0000-000000000001'),2,'real chief engineer Marin sees chief engineer and crew assignments only');
select is(internal_audit_private.assignment_function('crew','Chef Mécanicien'),'chef mecanicien','generic crew planning role uses the real HR function');
select is(internal_audit_private.assignment_function('Matelot','Chef Mécanicien'),'matelot','explicit planning function overrides a generic HR rank');
select lives_ok($$select public.internal_audit_add_treatment('9b400000-0000-0000-0000-000000000002','resolved','Réparation mécanique réalisée')$$,'the assigned real chief engineer records resolution');
select throws_ok($$select public.internal_audit_add_treatment('9b400000-0000-0000-0000-000000000001','in_progress','Usurpation du capitaine')$$,'42501',null,'a chief engineer cannot treat a captain assignment');

select set_config('request.jwt.claim.sub','9b000000-0000-0000-0000-000000000004',true);
select is((public.internal_audits_overview()->'permissions'->>'canManage')::boolean,false,'real Marin cannot design or conduct audits');
select is((select count(*)::integer from public.internal_audit_findings where audit_id='9b300000-0000-0000-0000-000000000001'),2,'real crew Marin sees crew and personal assignments only');
select throws_ok($$select public.internal_audit_add_treatment('9b400000-0000-0000-0000-000000000002','in_progress','Usurpation du chef mécanicien')$$,'42501',null,'a Matelot on generic crew planning cannot treat chief engineer findings');
select lives_ok($$select public.internal_audit_add_treatment('9b400000-0000-0000-0000-000000000004','resolved','Traitement individuel terminé')$$,'a personally assigned real Marin records resolution');
select throws_ok($$select public.internal_audit_save_finding((select payload from audit_fixture_payload where kind='finding-4'))$$,'42501',null,'a real Marin cannot reassign their finding or change its deadline');

select set_config('request.jwt.claim.sub','9b000000-0000-0000-0000-000000000005',true);
select is((select count(*)::integer from public.internal_audits where id='9b300000-0000-0000-0000-000000000001'),0,'unassigned real Marin cannot read the audit');
select throws_ok($$select public.internal_audit_add_treatment('9b400000-0000-0000-0000-000000000003','resolved','Usurpation de l’équipage')$$,'42501',null,'unassigned Marin cannot treat vessel crew findings');
select is(jsonb_array_length(public.internal_audits_overview()->'findings'),0,'unassigned overview leaks no finding');

select set_config('request.jwt.claim.sub','9b000000-0000-0000-0000-000000000006',true);
select is((select count(*)::integer from public.internal_audits where id='9b300000-0000-0000-0000-000000000001'),0,'other-company administrator cannot read this audit');
select throws_ok($$select public.internal_audit_save((select payload from audit_fixture_payload where kind='audit'))$$,'42501',null,'other-company administrator cannot modify this audit');
select throws_ok($$select public.internal_audit_add_treatment('9b400000-0000-0000-0000-000000000003','resolved','Autre société')$$,'42501',null,'other-company administrator cannot treat this finding');

select set_config('request.jwt.claim.sub','9b000000-0000-0000-0000-000000000001',true);
select lives_ok($$select public.internal_audit_add_treatment('9b400000-0000-0000-0000-000000000002','closed','Preuve contrôlée, écart clos')$$,'management verifies and closes a resolved finding');
select is((select count(*)::integer from public.internal_audit_finding_events where finding_id='9b400000-0000-0000-0000-000000000002'),3,'creation, resolution and verification retain separate history events');
select is((select actor_name from public.internal_audit_finding_events where finding_id='9b400000-0000-0000-0000-000000000002' and status='resolved'),'Audit Chief','history snapshots the real handler identity');

reset role;
select * from finish();
rollback;
