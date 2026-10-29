begin;
select no_plan();

-- Real account/role fixtures. No session-level profile simulation is used.
insert into public.companies(code,name) values('sea-ports-other','Ports foreign company');
insert into auth.users(id,email) select ('a6800000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'sea-ports-'||n||'@example.invalid' from generate_series(1,7)n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Ports fixture '||right(actor.id::text,1),company.id from auth.users actor join public.companies company
  on company.code=case when right(actor.id::text,1)='6' then 'sea-ports-other' else 'bbtm' end where actor.id::text like 'a6800000-%';
insert into public.company_memberships(company_id,user_id,active) select active_company_id,id,true from public.profiles where id::text like 'a6800000-%'
  on conflict(company_id,user_id) do update set active=true;
update public.company_memberships set active=false where user_id='a6800000-0000-0000-0000-000000000007';
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,(array['admin','direction','capitaine','marin','armement','admin','admin'])[right(id::text,1)::integer]
from public.profiles where id::text like 'a6800000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'Ports',right(id::text,1),case right(id::text,1) when '3' then 'Capitaine' else 'Matelot' end,true
from public.profiles where id::text like 'a6800000-%';
insert into public.vessels(company_id,name,active,asset_kind,registration_number)
select id,'SEA-PORTS-VESSEL',true,'vessel','REG-PORTS' from public.companies where code='bbtm';
insert into public.projects(company_id,title,project_code,delivery_port,redelivery_port,description)
select company.id,'SEA-PORTS-PROJECT-'||n,'PORTS-'||n,'Dieppe','Cherbourg','Commercial description stays unchanged'
from public.companies company cross join generate_series(1,2)n where company.code='bbtm';
insert into public.projects(company_id,title,project_code,delivery_port,redelivery_port)
select id,'SEA-PORTS-FOREIGN','PORTS-FOREIGN','Foreign departure','Foreign arrival' from public.companies where code='sea-ports-other';
insert into public.planning_projects(company_id,title,catalog_project_id,primary_vessel_id,starts_on,ends_on)
select project.company_id,project.title,project.id,vessel.id,(now() at time zone 'Europe/Paris')::date,(now() at time zone 'Europe/Paris')::date+1
from public.projects project cross join public.vessels vessel where project.title like 'SEA-PORTS-PROJECT-%' and vessel.name='SEA-PORTS-VESSEL';
insert into public.planning_assignments(company_id,vessel_id,crew_person_id,captain_person_id,starts_on,ends_on,assignment_role,confirmation_status)
select person.company_id,vessel.id,person.id,person.id,(now() at time zone 'Europe/Paris')::date,(now() at time zone 'Europe/Paris')::date+1,'Capitaine','confirmed'
from public.people person join public.vessels vessel on vessel.name='SEA-PORTS-VESSEL' where person.user_id='a6800000-0000-0000-0000-000000000003';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,id,1,'working-time-signatures','sea-ports/captain.png','image/png',5,repeat('a',64),user_id
from public.people where user_id='a6800000-0000-0000-0000-000000000003';

create temporary table ports_refs(key text primary key,value text);
grant select on ports_refs to authenticated;
insert into ports_refs select 'project-'||right(title,1),id::text from public.projects where title like 'SEA-PORTS-PROJECT-%';
insert into ports_refs select 'foreign-project',id::text from public.projects where title='SEA-PORTS-FOREIGN';
insert into ports_refs select 'operation-'||right(title,1),id::text||':'||primary_vessel_id from public.planning_projects where title like 'SEA-PORTS-PROJECT-%';
insert into ports_refs select 'vessel',id::text from public.vessels where name='SEA-PORTS-VESSEL';
insert into ports_refs select 'captain',id::text from public.people where user_id='a6800000-0000-0000-0000-000000000003';
insert into ports_refs values('today',((now() at time zone 'Europe/Paris')::date)::text);
create function pg_temp.ref(text) returns text language sql stable as $$select value from ports_refs where key=$1$$;
create function pg_temp.actor(integer) returns text language sql as $$select set_config('request.jwt.claim.sub','a6800000-0000-0000-0000-'||lpad($1::text,12,'0'),true)$$;
create temporary table ports_data(key text primary key,payload jsonb);
grant all on ports_data to authenticated;
insert into ports_data values('base',jsonb_build_object('version',1,'project','spoof','client','','clientContact','','description','Operational description',
  'specialPersonnel','[]'::jsonb,'dapaq','{"method":"","preparedBy":"","agentName":"","agentContact":""}'::jsonb,
  'vessel',jsonb_build_object('id',pg_temp.ref('vessel'),'name','spoof','registrationImo','REG-PORTS','captainName','spoof','departurePort','Dieppe','departureQuay','Quai départ','arrivalPort','Cherbourg','arrivalQuay','Quai arrivée','etd',pg_temp.ref('today')||'T08:00','eta',pg_temp.ref('today')||'T20:00'),
  'applicability','{"towing":"no","cargo":"no","divingSupport":"no","supplies":"no"}'::jsonb,
  'checks',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures','towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned','standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])key),
  'justifications',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures','towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned','standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])key),
  'towedVesselBoarding','{"required":"","measures":"","details":""}'::jsonb,'portServices','[]'::jsonb,'mandatoryServicesNotified',false,
  'supplies','{"delegated":"","shipchandlerName":"","shipchandlerContact":"","items":[],"suppliers":"","customerAccountsPrepared":false}'::jsonb,
  'charts','','waypoints','[]'::jsonb,'decision','NO_GO','risks','Opération interrompue, Armement informé',
  'signature',jsonb_build_object('captainName','spoof','date',pg_temp.ref('today'),'place','Dieppe','acknowledged',true),
  'planning',jsonb_build_object('date',pg_temp.ref('today'),'operationId',pg_temp.ref('operation-1'),'projectId',pg_temp.ref('project-1'),'captainPersonId',pg_temp.ref('captain'))));
create function pg_temp.data(text) returns jsonb language sql stable as $$select payload from ports_data where key=$1$$;
create function pg_temp.record_id(text) returns uuid language sql stable as $$select (pg_temp.data($1)->>'id')::uuid$$;
create function pg_temp.baseline(text,text,text) returns jsonb language sql immutable as $$select jsonb_build_object('projectId',$1,'departurePort',$2,'arrivalPort',$3)$$;
-- Narrow postgres-owned assertions can inspect only these synthetic projects.
create function pg_temp.project(text) returns jsonb language sql stable security definer set search_path='' as $$
  select to_jsonb(project)-'source_payload' from public.projects project where project.id=(select value::bigint from pg_temp.ports_refs where key='project-'||$1)$$;
create function pg_temp.audit_count() returns bigint language sql stable security definer set search_path='' as $$
  select count(*) from public.project_change_log where entity_type='projects' and entity_id=(select value::bigint from pg_temp.ports_refs where key='project-1') and action='update'$$;
create function pg_temp.record_count() returns bigint language sql stable security definer set search_path='' as $$
  select count(*) from public.sea_operations where draft->>'project' like '%SEA-PORTS-PROJECT-%'$$;

select ok(not (select prosecdef from pg_proc where oid='public.sea_operation_save_with_project_ports(uuid,integer,jsonb,jsonb)'::regprocedure),'public RPC remains an invoker wrapper');
select ok(not has_function_privilege('anon','public.sea_operation_save_with_project_ports(uuid,integer,jsonb,jsonb)','EXECUTE'),'anonymous cannot call synchronizing RPC');
select ok(not has_function_privilege('anon','sea_operation_private.save_with_project_ports(uuid,integer,jsonb,jsonb)','EXECUTE'),'anonymous cannot call private writer');
select ok(not has_table_privilege('authenticated','public.projects','UPDATE'),'direct project writes remain revoked');
select ok(not has_function_privilege('authenticated','sea_operation_private.save_core(uuid,integer,jsonb)','EXECUTE'),'unguarded core remains private');

set local role authenticated;
select pg_temp.actor(4);
insert into ports_data values('initial-baseline',pg_temp.baseline(pg_temp.ref('project-1'),'Dieppe','Cherbourg'));
select lives_ok($$insert into ports_data values('record',public.sea_operation_save_with_project_ports(null,null,pg_temp.data('base'),pg_temp.data('initial-baseline')))$$,'real Marin can create own preparation with project synchronization');
select is(pg_temp.data('record')->'project_ports',pg_temp.data('initial-baseline'),'save returns live ports outside the draft');
select ok(not (pg_temp.data('record')->'draft' ? 'project_ports'),'concurrency baseline never enters signed payload');
select is(pg_temp.audit_count(),0::bigint,'unchanged initial ports cause no project update');
insert into ports_data values('commercial-before',pg_temp.project('1')-array['delivery_port','redelivery_port','updated_at','updated_by']);
update ports_data set payload=public.sea_operation_save_with_project_ports(pg_temp.record_id('record'),1,
  jsonb_set(pg_temp.data('record')->'draft','{vessel,departurePort}','"Le Havre"'),pg_temp.data('record')->'project_ports') where key='record';
select is(pg_temp.project('1')->>'delivery_port','Le Havre','Marin departure change updates the linked project');
select is(pg_temp.project('1')->>'redelivery_port','Cherbourg','arrival port is preserved');
select is(pg_temp.project('1')->>'updated_by','a6800000-0000-0000-0000-000000000004','project audit actor is the real Marin');
select is(pg_temp.audit_count(),1::bigint,'one intentional synchronization creates one existing project audit entry');
insert into ports_data values('stale-baseline',pg_temp.data('record')->'project_ports');

reset role;
update public.projects set redelivery_port='Brest' where id=pg_temp.ref('project-1')::bigint;
set local role authenticated;
update ports_data set payload=public.sea_operation_save_with_project_ports(pg_temp.record_id('record'),2,
  jsonb_set(pg_temp.data('record')->'draft','{vessel,departurePort}','"Caen"'),pg_temp.data('stale-baseline')) where key='record';
select is(pg_temp.project('1')->>'delivery_port','Caen','changed departure sync accepts unrelated concurrent arrival edit');
select is(pg_temp.project('1')->>'redelivery_port','Brest','unchanged historical arrival never overwrites current project');
select is(pg_temp.data('record')#>>'{project_ports,arrivalPort}','Brest','returned baseline refreshes current unchanged project port');
insert into ports_data values('audit-before',to_jsonb(pg_temp.audit_count()));
update ports_data set payload=public.sea_operation_save_with_project_ports(pg_temp.record_id('record'),3,
  jsonb_set(pg_temp.data('record')->'draft','{description}','"Only the operation description changed"'),pg_temp.data('record')->'project_ports') where key='record';
select is(to_jsonb(pg_temp.audit_count()),pg_temp.data('audit-before'),'saving unrelated operational fields does not touch project');
select throws_ok($$select public.sea_operation_save_with_project_ports(pg_temp.record_id('record'),4,
  jsonb_set(pg_temp.data('record')->'draft','{vessel,arrivalPort}','"Nantes"'),pg_temp.data('stale-baseline'))$$,'40001',null,'concurrent change of edited project port is rejected');
select is((public.sea_operation_detail(pg_temp.record_id('record'))->>'version')::integer,4,'project conflict also rolls back operation version');
select is(public.sea_operation_detail(pg_temp.record_id('record'))#>>'{draft,vessel,arrivalPort}','Cherbourg','project conflict rolls back operational port');
select is(pg_temp.project('1')->>'redelivery_port','Brest','project conflict preserves concurrent port');
update ports_data set payload=public.sea_operation_save_with_project_ports(pg_temp.record_id('record'),4,
  jsonb_set(pg_temp.data('record')->'draft','{vessel,arrivalPort}','"Nantes"'),pg_temp.data('record')->'project_ports') where key='record';
select is(pg_temp.project('1')->>'redelivery_port','Nantes','reload baseline permits explicit arrival change');
select throws_ok($$select public.sea_operation_save_with_project_ports(pg_temp.record_id('record'),4,
  jsonb_set(pg_temp.data('record')->'draft','{vessel,departurePort}','"Brest"'),pg_temp.data('record')->'project_ports')$$,'40001',null,'stale operation version cannot synchronize project');
select is(pg_temp.project('1')->>'delivery_port','Caen','stale operation cannot change project');
select is(pg_temp.project('1')-array['delivery_port','redelivery_port','updated_at','updated_by'],pg_temp.data('commercial-before'),'commercial fields and source identity remain unchanged');
select is(public.sea_operation_detail(pg_temp.record_id('record'))->'project_ports',pg_temp.baseline(pg_temp.ref('project-1'),'Caen','Nantes'),'fresh detail returns baseline independently of planning selector window');
select is((select item->'project_ports' from jsonb_array_elements(public.sea_operations_overview()->'records')item where item->>'id'=pg_temp.record_id('record')::text),pg_temp.baseline(pg_temp.ref('project-1'),'Caen','Nantes'),'overview shares current baseline');

select lives_ok($$insert into ports_data values('stale-new',public.sea_operation_save_with_project_ports(null,null,pg_temp.data('base'),pg_temp.data('initial-baseline')))$$,'new unchanged preparation with stale source values remains saveable');
select is(pg_temp.project('1')->>'delivery_port','Caen','new unchanged preparation cannot revert current departure');
select is(pg_temp.project('1')->>'redelivery_port','Nantes','new unchanged preparation cannot revert current arrival');
insert into ports_data values('count-before',to_jsonb(pg_temp.record_count()));
select throws_ok($$select public.sea_operation_save_with_project_ports(null,null,jsonb_set(pg_temp.data('base'),'{vessel,departurePort}','"Lorient"'),pg_temp.data('initial-baseline'))$$,'40001',null,'new edited preparation with stale baseline conflicts');
select is(to_jsonb(pg_temp.record_count()),pg_temp.data('count-before'),'creation rolls back completely on project conflict');
select throws_ok($$select public.sea_operation_save_with_project_ports(null,null,pg_temp.data('base'),pg_temp.baseline(pg_temp.ref('project-2'),'Dieppe','Cherbourg'))$$,'22023',null,'another same-company project cannot be targeted via baseline');
select throws_ok($$select public.sea_operation_save_with_project_ports(null,null,pg_temp.data('base'),pg_temp.baseline(pg_temp.ref('foreign-project'),'Foreign departure','Foreign arrival'))$$,'22023',null,'foreign baseline cannot select another project');
select throws_ok($$select public.sea_operation_save_with_project_ports(null,null,pg_temp.data('base'),'{"projectId":1,"departurePort":"Dieppe","arrivalPort":"Cherbourg"}')$$,'22023',null,'numeric project identifier is rejected');
select throws_ok($$select public.sea_operation_save_with_project_ports(null,null,pg_temp.data('base'),pg_temp.data('initial-baseline')||'{"title":"forged"}')$$,'22023',null,'baseline has no arbitrary project fields');
select throws_ok($$select public.sea_operation_save_with_project_ports(null,null,pg_temp.data('base'),pg_temp.data('initial-baseline')-'arrivalPort')$$,'22023',null,'incomplete baseline is rejected');
select is(to_jsonb(pg_temp.record_count()),pg_temp.data('count-before'),'all invalid baselines roll back their tentative operation');
select lives_ok($$select public.sea_operation_save(null,null,jsonb_set(pg_temp.data('base'),'{vessel,departurePort}','"Legacy edit"'))$$,'legacy save RPC remains compatible');
select is(pg_temp.project('1')->>'delivery_port','Caen','legacy client cannot implicitly synchronize project');

-- A real Captain can edit the Marin preparation and its narrowly linked ports.
select pg_temp.actor(3);
update ports_data set payload=public.sea_operation_save_with_project_ports(pg_temp.record_id('record'),5,
  jsonb_set(pg_temp.data('record')->'draft','{vessel,departurePort}','"Brest"'),pg_temp.data('record')->'project_ports') where key='record';
select is(pg_temp.project('1')->>'delivery_port','Brest','effective Captain can synchronize another preparer draft');
select lives_ok($$update ports_data set payload=public.sea_operation_sign(pg_temp.record_id('record'),6,'Ports 3',true) where key='record'$$,'effective Captain signs the saved preparation');
select is(public.sea_operation_detail(pg_temp.record_id('record'))->'project_ports','null'::jsonb,'signed response omits live project concurrency snapshot');
select throws_ok($$select public.sea_operation_save_with_project_ports(pg_temp.record_id('record'),7,
  jsonb_set(pg_temp.data('record')->'draft','{vessel,departurePort}','"Lorient"'),pg_temp.baseline(pg_temp.ref('project-1'),'Brest','Nantes'))$$,'42501',null,'signed operation cannot synchronize a different project port');
select is(pg_temp.project('1')->>'delivery_port','Brest','signature immutability also protects project against forged edit');

-- Management profiles retain their ordinary SeaOps authority, without a new
-- generic Projects mutation permission being granted to any operational role.
select pg_temp.actor(1);
select lives_ok($$select public.sea_operation_save_with_project_ports(null,null,jsonb_set(jsonb_set(pg_temp.data('base'),'{vessel,departurePort}','"Admin departure"'),'{vessel,arrivalPort}','"Nantes"'),pg_temp.baseline(pg_temp.ref('project-1'),'Brest','Nantes'))$$,'real Admin can synchronize own new preparation');
select pg_temp.actor(2);
select lives_ok($$select public.sea_operation_save_with_project_ports(null,null,jsonb_set(jsonb_set(pg_temp.data('base'),'{vessel,departurePort}','"Direction departure"'),'{vessel,arrivalPort}','"Nantes"'),pg_temp.baseline(pg_temp.ref('project-1'),'Admin departure','Nantes'))$$,'real Direction can synchronize own new preparation');
select pg_temp.actor(5);
select lives_ok($$select public.sea_operation_save_with_project_ports(null,null,jsonb_set(jsonb_set(pg_temp.data('base'),'{vessel,departurePort}','"Armement departure"'),'{vessel,arrivalPort}','"Nantes"'),pg_temp.baseline(pg_temp.ref('project-1'),'Direction departure','Nantes'))$$,'real Armement can synchronize own new preparation');
select pg_temp.actor(6);
select throws_ok($$select public.sea_operation_save_with_project_ports(null,null,pg_temp.data('base'),pg_temp.data('initial-baseline'))$$,'42501',null,'foreign company cannot create linked operation or change project');
select throws_ok($$select public.sea_operation_save_with_project_ports(pg_temp.record_id('stale-new'),1,pg_temp.data('base'),pg_temp.data('initial-baseline'))$$,'42501',null,'foreign company cannot edit known draft');
select pg_temp.actor(7);
select throws_ok($$select public.sea_operation_save_with_project_ports(null,null,pg_temp.data('base'),pg_temp.data('initial-baseline'))$$,'42501',null,'inactive company membership cannot synchronize ports');

select pg_temp.actor(4);
insert into ports_data values('transit',(pg_temp.data('base')-'planning')||jsonb_build_object('transit',jsonb_build_object('date',pg_temp.ref('today'),'captainPersonId',pg_temp.ref('captain'))));
select lives_ok($$select public.sea_operation_save_with_project_ports(null,null,pg_temp.data('transit'),null)$$,'Transit with no project snapshot keeps its normal save path');
select throws_ok($$select public.sea_operation_save_with_project_ports(null,null,pg_temp.data('transit'),pg_temp.data('initial-baseline'))$$,'22023',null,'Transit cannot target any project via a forged baseline');
select is(pg_temp.project('1')->>'delivery_port','Armement departure','Transit never changes linked project ports');

-- Switching projects updates only the new target and compares against its own
-- selection baseline, not the previous operation's historical departure.
select lives_ok($$insert into ports_data values('switched',public.sea_operation_save_with_project_ports(pg_temp.record_id('stale-new'),1,
  jsonb_set(jsonb_set(jsonb_set(pg_temp.data('stale-new')->'draft','{planning,projectId}',to_jsonb(pg_temp.ref('project-2'))),'{planning,operationId}',to_jsonb(pg_temp.ref('operation-2'))),'{vessel,arrivalPort}','"Le Havre"'),
  pg_temp.baseline(pg_temp.ref('project-2'),'Dieppe','Cherbourg')))$$,'project switch uses baseline of newly selected project');
select is(pg_temp.project('2')->>'redelivery_port','Le Havre','selected second project receives explicit arrival');
select is(pg_temp.project('1')->>'redelivery_port','Nantes','previous project remains untouched by mission switch');

reset role;
update public.projects set archived_at=now() where id=pg_temp.ref('project-2')::bigint;
set local role authenticated;
select is(public.sea_operation_detail(pg_temp.record_id('switched'))->'project_ports','null'::jsonb,'archived project has no live editable baseline');
select throws_ok($$select public.sea_operation_save_with_project_ports(pg_temp.record_id('switched'),2,pg_temp.data('switched')->'draft',
  pg_temp.baseline(pg_temp.ref('project-2'),'Dieppe','Le Havre'))$$,'42501',null,'archived selected project fails existing planning authorization');

select * from finish();
rollback;
