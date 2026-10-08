begin;
select no_plan();
select ok(not has_function_privilege('anon','public.planning_audits_overview()','EXECUTE'),'anonymous callers cannot read the audit Planning feed');
select ok(has_function_privilege('authenticated','public.planning_audits_overview()','EXECUTE'),'authenticated callers may invoke the controlled feed');
select is((select prosecdef from pg_proc where oid='public.planning_audits_overview()'::regprocedure),false,'public audit Planning RPC is an invoker');
select is((select column_default::text from information_schema.columns where table_schema='public' and table_name='documentary_audits' and column_name='planned_on'),null::text,'planned date has no default that could invent a schedule');
select is((select is_nullable::text from information_schema.columns where table_schema='public' and table_name='documentary_audits' and column_name='planned_on'),'YES','documentary planned date remains optional');

insert into public.companies(code,name) values('audit-planning-main','Audit Planning fixture'),('audit-planning-other','Other Audit Planning tenant');
insert into auth.users(id,email)
select ('9e000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'audit-planning-'||n||'@example.invalid' from generate_series(1,8) n;
insert into public.profiles(id,email,display_name,active_company_id)
select account.id,account.email,'Audit Planning actor '||right(account.id::text,1),company.id
from auth.users account join public.companies company on company.code=case when right(account.id::text,1)='5' then 'audit-planning-other' else 'audit-planning-main' end
where account.id::text like '9e000000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like '9e000000-%'
on conflict(company_id,user_id) do update set active=excluded.active;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '1' then 'armement' when '2' then 'capitaine' when '5' then 'admin' when '6' then 'capitaine' else 'marin' end
from public.profiles where id::text like '9e000000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label)
select active_company_id,id,'Planning',display_name,case right(id::text,1) when '2' then 'Capitaine' else 'Matelot' end
from public.profiles where id::text like '9e000000-%';
update public.company_memberships set active=false where user_id='9e000000-0000-0000-0000-000000000008';
insert into public.vessels(company_id,name)
select company.id,fixture.name from public.companies company cross join(values('GOURY'),('LE ROZEL'),('LANDEMER'),('SUROIT'),('KROKDUR'),('HIRONDELLE DE LA MANCHE')) fixture(name)
where company.code='audit-planning-main';
insert into public.vessels(company_id,name) select id,'FOREIGN VESSEL' from public.companies where code='audit-planning-other';
insert into public.internal_audit_sites(id,company_id,name,kind,vessel_id)
select ('9e100000-0000-0000-0000-'||lpad(fixture.n::text,12,'0'))::uuid,company.id,fixture.name,fixture.kind,
 (select vessel.id from public.vessels vessel where vessel.company_id=company.id and vessel.name=fixture.name)
from public.companies company cross join(values
 (1,'Armement - CHERBOURG','shore'),(2,'Yard - LE HAVRE','shore'),(3,'GOURY','vessel'),(4,'LE ROZEL','vessel'),
 (5,'LANDEMER','vessel'),(6,'SUROIT','vessel'),(7,'KROKDUR','vessel'),(8,'HIRONDELLE DE LA MANCHE','vessel')
) fixture(n,name,kind) where company.code='audit-planning-main';
insert into public.internal_audit_templates(id,company_id,name,rows)
select '9e200000-0000-0000-0000-000000000001',id,'Private question template',
 '[{"id":"q1","section":"ISM 1","reference":"1.1","question":"Private answer content","maxPoints":3,"guidance":"Secret guidance"}]'::jsonb
from public.companies where code='audit-planning-main';
insert into public.internal_audits(id,company_id,site_id,template_id,template_name,template_version,year,planned_on,performed_on,auditor_name,status,rows,completed_at)
select ('9e300000-0000-0000-0000-'||lpad(right(site.id::text,1),12,'0'))::uuid,site.company_id,site.id,template.id,template.name,1,extract(year from current_date)::integer,
 case when site.name='LE ROZEL' then current_date-30 else current_date+1 end,
 case when site.name='LE ROZEL' then current_date-29 end,'Private auditor',
 case when site.name='LE ROZEL' then 'completed' when site.name='LANDEMER' then 'in_progress' else 'planned' end,
 '[{"id":"q1","section":"ISM 1","reference":"1.1","question":"Private answer content","maxPoints":3,"guidance":"Secret guidance","answer":"conforme","observation":"Private observation"}]'::jsonb,
 case when site.name='LE ROZEL' then now()-interval '29 days' end
from public.internal_audit_sites site join public.internal_audit_templates template on template.company_id=site.company_id
where site.id::text like '9e100000-%';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status,source_label)
select vessel.company_id,vessel.id,captain.id,crew.id,case when vessel.name='LE ROZEL' then current_date-35 else current_date-1 end,
 case when vessel.name='LE ROZEL' then current_date-25 else current_date+10 end,'crew','confirmed','audit-planning-test'
from public.vessels vessel cross join public.people captain cross join public.people crew
where vessel.name in ('GOURY','LE ROZEL') and vessel.company_id=captain.company_id and vessel.company_id=crew.company_id
  and captain.user_id='9e000000-0000-0000-0000-000000000002' and crew.user_id='9e000000-0000-0000-0000-000000000003';
insert into public.planning_vessel_permissions(company_id,user_id,vessel_id,action_key,starts_on,ends_on,reason,granted_by,revoked_at)
select vessel.company_id,'9e000000-0000-0000-0000-000000000007',vessel.id,'read',current_date+1,current_date+1,'Audit Planning real-profile fixture','9e000000-0000-0000-0000-000000000001',
 case when vessel.name='SUROIT' then now() end
from public.vessels vessel where vessel.name in ('LANDEMER','SUROIT') and vessel.company_id=(select id from public.companies where code='audit-planning-main');

insert into public.documentary_audits(id,company_id,kind,site_id,vessel_id,year,title,planned_on,audited_on,files)
select ('9e400000-0000-0000-0000-'||lpad(fixture.n::text,12,'0'))::uuid,vessel.company_id,fixture.kind,vessel.id,vessel.id,extract(year from current_date)::integer,
 'Planning documentary '||fixture.kind,case when fixture.kind='client' then current_date+40 else current_date+1 end,
 case when fixture.kind='external_ism' then current_date+2 end,'[]'::jsonb
from(values(1,'ovid'),(2,'ecmid'),(3,'external_ism'),(4,'client')) fixture(n,kind) cross join public.vessels vessel
where vessel.name='GOURY' and vessel.company_id=(select id from public.companies where code='audit-planning-main');
insert into public.documentary_audits(id,company_id,kind,site_id,vessel_id,year,title,planned_on,audited_on)
select '9e400000-0000-0000-0000-000000000005',company_id,'ovid',id,id,extract(year from current_date)::integer-1,'Unplanned existing historical report',null,current_date-365
from public.vessels where name='GOURY' and company_id=(select id from public.companies where code='audit-planning-main');
insert into public.documentary_audits(id,company_id,kind,site_id,vessel_id,year,title,planned_on)
select '9e400000-0000-0000-0000-000000000006',company_id,'ovid',id,id,extract(year from current_date)::integer,'Foreign planned audit',current_date+1
from public.vessels where name='FOREIGN VESSEL';
insert into public.documentary_audit_findings(id,company_id,audit_id,category,description,assignee_person_id,assignee_label)
select '9e500000-0000-0000-0000-000000000001',person.company_id,'9e400000-0000-0000-0000-000000000001','finding','Private finding content',person.id,'Actual captain'
from public.people person where person.user_id='9e000000-0000-0000-0000-000000000002';
create temporary table audit_planning_payload(payload jsonb);
grant select,update on audit_planning_payload to authenticated;
insert into audit_planning_payload
select jsonb_build_object('id',id,'companyId',company_id,'kind',kind,'siteId',site_id::text,'year',year,'title',title,
 'plannedOn',planned_on,'auditedOn',audited_on,'auditorName',auditor_name,'files',files)
from public.documentary_audits where id='9e400000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000001',true);
select is(jsonb_array_length(public.planning_audits_overview()),12,'real Armement sees eight internal sites and four planned documentary audit types');
select is((select count(*)::integer from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'kind'='internal_ism'),8,'shore and vessel internal sites all appear for company Planning readers');
select is((select count(*)::integer from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'vesselId' is null),2,'two shore sites have no invented vessel association');
select ok(not exists(select 1 from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'id'='9e400000-0000-0000-0000-000000000005'),'actual date alone does not invent a planning event');
select ok(not exists(select 1 from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'id'='9e400000-0000-0000-0000-000000000006'),'another company audit is never returned');
select is((select audit->>'status' from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'id'='9e300000-0000-0000-0000-000000000004'),'completed','completed internal history remains visible');
select is((select audit->>'status' from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'id'='9e300000-0000-0000-0000-000000000005'),'in_progress','internal in-progress status is retained');
select is((select audit->>'status' from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'kind'='external_ism'),'completed','documentary actual date marks completion without guessing from files');
select is((select audit->>'plannedOn' from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'kind'='external_ism'),(current_date+1)::text,'documentary planned date stays distinct from actual date');
select is((select audit->>'performedOn' from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'kind'='external_ism'),(current_date+2)::text,'documentary actual date is exposed separately');
select ok(not exists(select 1 from jsonb_array_elements(public.planning_audits_overview()) audit where not(audit->>'canOpen')::boolean),'manager may open each authorized audit source');
select is((select count(*)::integer from jsonb_array_elements(public.planning_audits_overview()) audit cross join lateral jsonb_object_keys(audit) key where key not in ('id','kind','siteId','siteName','vesselId','plannedOn','performedOn','title','status','canOpen')),0,'feed contains only explicitly approved metadata keys');
select is((select count(*)::integer from jsonb_object_keys(public.planning_audits_overview()->0)),10,'each item has exactly the metadata fields and separate source permission');

select lives_ok($$select public.documentary_audit_save((select payload from audit_planning_payload)||jsonb_build_object('plannedOn',(current_date+3)::text))$$,'manager may reschedule a documentary planned date');
select is((select planned_on from public.documentary_audits where id='9e400000-0000-0000-0000-000000000001'),current_date+3,'planned date is persisted');
select lives_ok($$select public.documentary_audit_save((select payload from audit_planning_payload)-'plannedOn')$$,'legacy client payload without plannedOn retains the current planned date');
select is((select planned_on from public.documentary_audits where id='9e400000-0000-0000-0000-000000000001'),current_date+3,'omission cannot clear an existing schedule');
select lives_ok($$select public.documentary_audit_save((select payload from audit_planning_payload)||'{"plannedOn":null}'::jsonb)$$,'explicit null clears the planned date');
select is(jsonb_array_length(public.planning_audits_overview()),11,'unscheduled documentary audit disappears from Planning');
select throws_ok($$select public.documentary_audit_save((select payload from audit_planning_payload)||'{"plannedOn":"2026-02-30"}'::jsonb)$$,'22023',null,'impossible calendar dates are rejected by the server');
select throws_ok($$select public.documentary_audit_save((select payload from audit_planning_payload)||'{"plannedOn":"2026-10-01T10:00:00Z"}'::jsonb)$$,'22023',null,'planning field accepts date-only values');
select throws_ok($$select public.documentary_audit_save((select payload from audit_planning_payload)||'{"plannedOn":true}'::jsonb)$$,'22023',null,'tampered nonstring planned date is rejected');
select lives_ok($$select public.documentary_audit_save((select payload from audit_planning_payload))$$,'manager restores the test schedule');

select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000002',true);
select is(jsonb_array_length(public.planning_audits_overview()),5,'real Capitaine reads two assigned internal dates and three documentary dates within assignment bounds');
select ok(not exists(select 1 from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'vesselId' is null),'Capitaine receives no company-only shore metadata');
select ok(not exists(select 1 from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'kind'='client'),'Capitaine does not receive dates outside the actual assignment period');
select is((select audit->>'canOpen' from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'kind'='ovid'),'true','personally assigned Capitaine may open the one authorized documentary dossier');
select is((select audit->>'canOpen' from jsonb_array_elements(public.planning_audits_overview()) audit where audit->>'kind'='ecmid'),'false','Planning visibility alone does not grant audit content access');
select is((select count(*)::integer from public.internal_audits),0,'Planning feed does not broaden internal audit table RLS');
select is((select count(*)::integer from public.documentary_audits),1,'documentary table RLS remains limited to the personally assigned dossier');
select throws_ok($$select public.documentary_audit_save((select payload from audit_planning_payload)||jsonb_build_object('plannedOn',(current_date+5)::text))$$,'42501',null,'Capitaine cannot reschedule an audit through Planning visibility');

select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000003',true);
select is(jsonb_array_length(public.planning_audits_overview()),5,'real Marin receives assigned-vessel Planning metadata from actual crew embarkations');
select ok(not exists(select 1 from jsonb_array_elements(public.planning_audits_overview()) audit where (audit->>'canOpen')::boolean),'unassigned audit handler Marin cannot open any audit content');
select is((select count(*)::integer from public.documentary_audit_findings),0,'minimal feed does not expose the Capitaine private finding to crew');
select is((select count(*)::integer from public.documentary_audits),0,'minimal feed does not expose documentary report file references');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000004',true);
select is(jsonb_array_length(public.planning_audits_overview()),0,'unassigned real Marin has no live audit Planning rows');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000006',true);
select is(jsonb_array_length(public.planning_audits_overview()),0,'Capitaine profile without a matching real assignment grants no vessel metadata');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000007',true);
select is(jsonb_array_length(public.planning_audits_overview()),1,'explicit date-limited Planning vessel permission works for the real Marin');
select is(public.planning_audits_overview()->0->>'siteName','LANDEMER','revoked permission on another vessel is ignored');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000005',true);
select is(jsonb_array_length(public.planning_audits_overview()),1,'other-company administrator sees only their own planned dossier');
select is(public.planning_audits_overview()->0->>'title','Foreign planned audit','active company boundary is retained');
select set_config('request.jwt.claim.sub','9e000000-0000-0000-0000-000000000008',true);
select throws_ok($$select public.planning_audits_overview()$$,'42501',null,'inactive company membership cannot read the feed');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.planning_audits_overview()$$,'42501',null,'database authenticated role without a real user cannot read the feed');
reset role;
select * from finish();
rollback;
