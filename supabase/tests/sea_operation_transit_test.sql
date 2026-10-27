begin;
select no_plan();

-- All identities are real authenticated fixtures, never simulated profile views.
insert into public.companies(code,name) values('sea-transit-other','Transit foreign company');
insert into auth.users(id,email) select ('a6530000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'sea-transit-'||n||'@example.invalid' from generate_series(1,9)n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Transit fixture '||right(actor.id::text,1),company.id from auth.users actor join public.companies company
  on company.code=case when right(actor.id::text,1)='7' then 'sea-transit-other' else 'bbtm' end where actor.id::text like 'a6530000-%';
insert into public.company_memberships(company_id,user_id,active) select active_company_id,id,true from public.profiles where id::text like 'a6530000-%'
  on conflict(company_id,user_id) do update set active=true;
update public.company_memberships set active=false where user_id='a6530000-0000-0000-0000-000000000008';
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,(array['admin','direction','armement','capitaine','marin','marin','admin','admin'])[right(id::text,1)::integer]
from public.profiles where id::text like 'a6530000-%' and right(id::text,1)<>'9';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'Transit',case right(id::text,1) when '4' then 'Permanent' when '5' then 'Temporaire' else 'Creator' end,
  case right(id::text,1) when '4' then 'Capitaine' else 'Matelot' end,true from public.profiles where id::text like 'a6530000-%';
insert into public.vessels(company_id,name,active,asset_kind,registration_number,imo_number,draft_m)
select company.id,'SEA-TRANSIT-'||item.key,item.active,'vessel',item.registration,item.imo,item.draft
from public.companies company cross join (values('a',true,'REG-A','IMO-A',2.65),('b',true,'','',2),('c',true,'REG-C','',3),('inactive',false,'','',2)) item(key,active,registration,imo,draft) where company.code='bbtm';
insert into public.vessels(company_id,name,active,asset_kind) select id,'SEA-TRANSIT-foreign',true,'vessel' from public.companies where code='sea-transit-other';
insert into public.clients(company_id,name,active,contact_name,email,phone,address)
select company.id,'SEA-TRANSIT-CLIENT-'||item.key,item.active,'Agent '||item.key,item.key||'@example.invalid','0123456789','Quai catalogue'
from public.companies company cross join (values('1',true),('2',true),('3',false),('5',true)) item(key,active) where company.code='bbtm';
update public.clients set archived_at=now() where name='SEA-TRANSIT-CLIENT-5';
insert into public.clients(company_id,name,active) select id,'SEA-TRANSIT-CLIENT-4',true from public.companies where code='sea-transit-other';
insert into public.projects(company_id,title,project_code,client_id,delivery_port,redelivery_port,description)
select company.id,'SEA-TRANSIT-PROJECT-'||n,'TRANSIT-P'||n,case when n=1 then (select id from public.clients where name='SEA-TRANSIT-CLIENT-1') else null end,
  'Catalogue départ','Catalogue arrivée','Description catalogue' from public.companies company cross join generate_series(1,2)n where company.code='bbtm';
insert into public.planning_projects(company_id,title,catalog_project_id,primary_vessel_id,starts_on,ends_on)
select project.company_id,project.title,project.id,vessel.id,(now() at time zone 'Europe/Paris')::date,(now() at time zone 'Europe/Paris')::date+1
from public.projects project cross join public.vessels vessel where project.title like 'SEA-TRANSIT-PROJECT-%' and vessel.name='SEA-TRANSIT-a';
insert into public.planning_assignments(company_id,vessel_id,crew_person_id,captain_person_id,starts_on,ends_on,assignment_role,confirmation_status)
select person.company_id,vessel.id,person.id,person.id,(now() at time zone 'Europe/Paris')::date-1,(now() at time zone 'Europe/Paris')::date+1,
  case right(person.user_id::text,1) when '4' then 'Capitaine' else 'Matelot' end,'confirmed'
from public.people person join public.vessels vessel on vessel.name=case right(person.user_id::text,1) when '4' then 'SEA-TRANSIT-a' else 'SEA-TRANSIT-b' end
where person.user_id in('a6530000-0000-0000-0000-000000000004','a6530000-0000-0000-0000-000000000005');
insert into public.planning_days(company_id,person_id,vessel_id,work_date,function_label,slot365,source_label)
select assignment.company_id,assignment.crew_person_id,assignment.vessel_id,(now() at time zone 'Europe/Paris')::date,
  case right(person.user_id::text,1) when '4' then 'Matelot' else 'Capitaine' end,'assignment:'||assignment.id,'seapilot-assignment-note'
from public.planning_assignments assignment join public.people person on person.id=assignment.crew_person_id where person.user_id::text like 'a6530000-%';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,id,1,'working-time-signatures','sea-transit/captain5.png','image/png',5,repeat('a',64),user_id
from public.people where user_id='a6530000-0000-0000-0000-000000000005';

create temporary table transit_refs(key text primary key,value text);
grant select on transit_refs to authenticated;
insert into transit_refs select 'vessel-'||substr(name,13),id::text from public.vessels where name like 'SEA-TRANSIT-%';
insert into transit_refs select 'client-'||right(name,1),id::text from public.clients where name like 'SEA-TRANSIT-CLIENT-%';
insert into transit_refs select 'person-'||right(user_id::text,1),id::text from public.people where user_id::text like 'a6530000-%';
insert into transit_refs select 'project-'||right(title,1),id::text from public.projects where title like 'SEA-TRANSIT-PROJECT-%';
insert into transit_refs select 'operation-'||right(title,1),id::text||':'||primary_vessel_id from public.planning_projects where title like 'SEA-TRANSIT-PROJECT-%';
insert into transit_refs values('today',((now() at time zone 'Europe/Paris')::date)::text),('tomorrow',((now() at time zone 'Europe/Paris')::date+1)::text),
  ('project-count',(select count(*)::text from public.projects)),('occurrence-count',(select count(*)::text from public.planning_projects));
create function pg_temp.ref(text) returns text language sql stable as $$select value from transit_refs where key=$1$$;
create function pg_temp.actor(integer) returns text language sql as $$select set_config('request.jwt.claim.sub','a6530000-0000-0000-0000-'||lpad($1::text,12,'0'),true)$$;
create temporary table transit_data(key text primary key,payload jsonb);
grant all on transit_data to authenticated;
insert into transit_data values('base',jsonb_build_object('version',1,'project','spoof','client','spoof','clientId',pg_temp.ref('client-2'),'clientContact','Contact libre','description','Description opérationnelle',
  'specialPersonnel','[]'::jsonb,'dapaq','{"method":"","preparedBy":"","agentName":"","agentContact":""}'::jsonb,
  'vessel',jsonb_build_object('id',pg_temp.ref('vessel-b'),'name','spoof','registrationImo','REG-MANUELLE','captainName','spoof','departurePort','Port manuel départ','departureQuay','Quai manuel départ','arrivalPort','Port manuel arrivée','arrivalQuay','Quai manuel arrivée','etd',pg_temp.ref('tomorrow')||'T08:00','eta',pg_temp.ref('tomorrow')||'T20:00'),
  'applicability','{"towing":"no","cargo":"no","divingSupport":"no","supplies":"no"}'::jsonb,
  'checks',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures','towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned','standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])key),
  'justifications',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures','towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned','standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])key),
  'towedVesselBoarding','{"required":"","measures":"","details":""}'::jsonb,'portServices','[]'::jsonb,'mandatoryServicesNotified',false,
  'supplies','{"delegated":"","shipchandlerName":"","shipchandlerContact":"","items":[],"suppliers":"","customerAccountsPrepared":false}'::jsonb,
  'charts','','waypoints','[]'::jsonb,'decision','NO_GO','risks','Opération interrompue, Armement informé',
  'signature',jsonb_build_object('captainName','spoof','date',pg_temp.ref('today'),'place','Cherbourg','acknowledged',true),
  'transit',jsonb_build_object('date',pg_temp.ref('today'),'captainPersonId',pg_temp.ref('person-5'))));
create function pg_temp.data(text) returns jsonb language sql stable as $$select payload from transit_data where key=$1$$;
create function pg_temp.record_id(text) returns uuid language sql stable as $$select (pg_temp.data($1)->>'id')::uuid$$;
create function pg_temp.planned(text) returns jsonb language sql stable as $$select (pg_temp.data('base')-'transit')||jsonb_build_object('planning',
  jsonb_build_object('date',pg_temp.ref('today'),'operationId',pg_temp.ref('operation-'||$1),'projectId',pg_temp.ref('project-'||$1),'captainPersonId',pg_temp.ref('person-5')))$$;

insert into transit_data(key,payload)
select 'capture',jsonb_build_object('version',1,'projectId',project.id::text,'vesselId',vessel.id::text,'pointId','cop-wp-1',
  'latitude',49.65,'longitude',-1.62,'etaUtc','2026-10-26T11:30:00Z','draftMeters',2,'fetchedAt','2026-10-26T08:00:00Z',
  'status','available','message','Synthetic model data for permission and arithmetic tests only.',
  'source',jsonb_build_object('model','NWS','productId','NWSHELF_ANALYSISFORECAST_PHY_004_013',
    'seaLevelDatasetId','cmems_mod_nws_phy-ssh_anfc_1.5km-2D_PT15M-i','bathymetryDatasetId','cmems_mod_nws_phy_anfc_1.5km_static',
    'datasetVersion','202511','datum','model-geoid','referenceTimeUtc','2026-10-26T00:00:00Z',
    'sourceUrl','https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/description'),
  'cell',jsonb_build_object('latitude',49.65,'longitude',-1.62,'resolutionMeters',1500,'depthMeters',20,'depthMinMeters',19,'depthMaxMeters',21,
    'bounds',jsonb_build_object('west',-1.635,'east',-1.605,'south',49.6435,'north',49.6565)),
  'waterLevel',jsonb_build_object('timeBeforeUtc','2026-10-26T11:30:00Z','timeAfterUtc','2026-10-26T11:30:00Z','heightBeforeMeters',1.5,'heightAfterMeters',1.5),
  'estimate',jsonb_build_object('kind','static','waterLevelMeters',1.5,'ukcMeters',19.5,'cellVariability',jsonb_build_object('lowerMeters',18.5,'upperMeters',20.5),
    'dynamicCorrectionsApplied',false,'uncertainty',jsonb_build_object('method','sum-known-standard-uncertainties','quantifiedMeters',null,
      'complete',false,'confidenceLevel',null,'components',jsonb_build_array(
        jsonb_build_object('id','bathymetryVertical','standardUncertaintyMeters',null),jsonb_build_object('id','waterLevel','standardUncertaintyMeters',null),
        jsonb_build_object('id','draft','standardUncertaintyMeters',null),jsonb_build_object('id','positionEffect','standardUncertaintyMeters',null),
        jsonb_build_object('id','temporalInterpolation','standardUncertaintyMeters',0)),
      'missingComponents','["bathymetryVertical","waterLevel","draft","positionEffect"]'::jsonb)))
from public.projects project join public.vessels vessel on vessel.name='SEA-TRANSIT-b' where project.title='SEA-TRANSIT-PROJECT-2';

update transit_data set payload=jsonb_set(payload,'{projectId}','""')||jsonb_build_object('transit',jsonb_build_object('date',pg_temp.ref('today'),'vesselId',pg_temp.ref('vessel-b'))) where key='capture';
insert into transit_data values('auto-source',jsonb_set(jsonb_set(pg_temp.data('base'),'{vessel,draftMeters}','999'),'{waypoints}',jsonb_build_array(
  jsonb_build_object('id','cop-wp-1','number','1','descriptionVhf','','latitude','49.65','longitude','-1.62','eta','2026-10-26T12:30','ukc','Note UKC manuelle','denseTraffic',false,'ukcMode','automatic','ukcForecast',pg_temp.data('capture')))));

select ok(not (select prosecdef from pg_proc where oid='public.sea_operation_vessel_context(date,bigint)'::regprocedure),'vessel RPC is an invoker wrapper');
select ok(not has_function_privilege('anon','public.sea_operation_vessel_context(date,bigint)','EXECUTE'),'anonymous cannot query vessel context');
select ok(not has_function_privilege('anon','public.sea_operation_transit_ukc_context(date,bigint)','EXECUTE'),'anonymous cannot query Transit UKC');
select ok(not has_function_privilege('authenticated','sea_operation_private.active_signature(bigint,bigint)','EXECUTE'),'RH snapshot helper remains private');
select ok(not has_function_privilege('authenticated','sea_operation_private.save_core(uuid,integer,jsonb)','EXECUTE'),'core writer remains private');
select ok(not has_table_privilege('authenticated','public.sea_operations','INSERT,UPDATE,DELETE'),'no direct operation writes added');

set local role authenticated;
select pg_temp.actor(6);
insert into transit_data values('overview',public.sea_operations_overview());
select is((select count(*)::int from jsonb_array_elements(pg_temp.data('overview')->'clients') c where c->>'name' like 'SEA-TRANSIT-CLIENT-%'),2,'real Marin gets only active unarchived company clients');
select is((select c->>'contact' from jsonb_array_elements(pg_temp.data('overview')->'clients') c where c->>'id'=pg_temp.ref('client-2')),'Agent 2 · 2@example.invalid · 0123456789 · Quai catalogue','minimal operational contacts are available');
select ok(not exists(select from jsonb_array_elements(pg_temp.data('overview')->'clients') c where c-array['id','name','contact']<>'{}'::jsonb),'catalog has no financial or unrelated fields');
select is(public.sea_operation_vessel_context(pg_temp.ref('today')::date,pg_temp.ref('vessel-b')::bigint)#>>'{captains,0,name}','Transit TEMPORAIRE','selected vessel uses temporary captain rather than original project vessel');
select is(jsonb_array_length(public.sea_operation_vessel_context(pg_temp.ref('today')::date,pg_temp.ref('vessel-a')::bigint)->'captains'),0,'explicit Matelot day overrides permanent Captain role');
select throws_ok($$select public.sea_operation_vessel_context(pg_temp.ref('today')::date,pg_temp.ref('vessel-foreign')::bigint)$$,'42501',null,'foreign vessel context refused');
select throws_ok($$select public.sea_operation_vessel_context(pg_temp.ref('today')::date,pg_temp.ref('vessel-inactive')::bigint)$$,'42501',null,'inactive vessel context refused');
select throws_ok($$select public.sea_operation_vessel_context('0999-01-01',pg_temp.ref('vessel-b')::bigint)$$,'22023',null,'date lower bound enforced');
select lives_ok($$select public.sea_operation_vessel_captain_signature(pg_temp.ref('today')::date,pg_temp.ref('vessel-b')::bigint,pg_temp.ref('person-5'))$$,'validated actual captain gets a narrow signature preview');
select is(sea_operation_private.can_read_signature('working-time-signatures','sea-transit/captain5.png'),true,'validated signature path is readable');
select throws_ok($$select public.sea_operation_vessel_captain_signature(pg_temp.ref('today')::date,pg_temp.ref('vessel-b')::bigint,pg_temp.ref('person-4'))$$,'42501',null,'unrelated captain signature refused');
select throws_ok($$select public.sea_operation_vessel_captain_signature(pg_temp.ref('tomorrow')::date,pg_temp.ref('vessel-b')::bigint,pg_temp.ref('person-5'))$$,'42501',null,'temporary captain signature expires next day');
select lives_ok($$insert into transit_data values('marin',public.sea_operation_save(null,null,pg_temp.data('base')))$$,'real Marin prepares own virtual Transit');
select is(pg_temp.data('marin')#>>'{draft,project}','Transit','Transit is an explicit virtual label');
select is(pg_temp.data('marin')#>>'{draft,vessel,name}','SEA-TRANSIT-b','selected vessel name is canonical');
select is(pg_temp.data('marin')#>>'{draft,vessel,registrationImo}','REG-MANUELLE','manual registration retained when catalog has none');
select is(pg_temp.data('marin')#>>'{draft,client}','SEA-TRANSIT-CLIENT-2','registered client name canonicalized');
select is(pg_temp.data('marin')#>>'{draft,clientContact}','Contact libre','user contact remains editable');
select is(pg_temp.data('marin')#>>'{draft,description}','Description opérationnelle','description remains an operational edit');
select is((pg_temp.data('marin')#>'{draft,vessel}')-array['id','name','registrationImo','captainName','draftMeters','weatherMatrix'],(pg_temp.data('base')->'vessel')-array['id','name','registrationImo','captainName','draftMeters','weatherMatrix'],'ports quays ETD and ETA remain exactly entered');
select is(pg_temp.data('marin')#>>'{draft,vessel,captainName}','Transit TEMPORAIRE','actual selected captain name is canonicalized');
select is(pg_temp.data('marin')#>>'{signature_snapshot,storage_path}','sea-transit/captain5.png','server captures selected RH signature');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set(pg_temp.data('base'),'{clientId}',to_jsonb(pg_temp.ref('client-4'))))$$,'42501',null,'foreign client cannot be selected');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set(pg_temp.data('base'),'{clientId}',to_jsonb(pg_temp.ref('client-3'))))$$,'42501',null,'inactive client cannot be selected');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set(pg_temp.data('base'),'{transit,extra}','true'))$$,'22023',null,'unknown Transit keys cannot create an unreadable record');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set(pg_temp.data('base'),'{transit,date}','"2026-02-30"'))$$,'22023',null,'impossible operation date refused');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set(pg_temp.data('base'),'{transit,captainPersonId}',to_jsonb(pg_temp.ref('person-4'))))$$,'42501',null,'permanent profile cannot replace actual selected captain');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set(pg_temp.data('base'),'{vessel,id}',to_jsonb(pg_temp.ref('vessel-foreign'))))$$,'42501',null,'foreign vessel cannot be injected into save');
select throws_ok($$select public.sea_operation_save(pg_temp.record_id('marin'),0,pg_temp.data('marin')->'draft')$$,'40001',null,'optimistic version remains mandatory');
update transit_data set payload=public.sea_operation_save(pg_temp.record_id('marin'),1,jsonb_set(jsonb_set(payload->'draft','{clientId}',to_jsonb(pg_temp.ref('client-1'))),'{clientContact}','"Nouveau contact"')) where key='marin';
select is(pg_temp.data('marin')#>>'{draft,clientId}',pg_temp.ref('client-2'),'saved Transit client cannot be changed directly');
select is(pg_temp.data('marin')#>>'{draft,clientContact}','Nouveau contact','saved client contact remains editable');
select throws_ok($$select public.sea_operation_save(pg_temp.record_id('marin'),2,(pg_temp.data('marin')->'draft')-'transit')$$,'22023',null,'dropping mission metadata cannot bypass client lock');
select lives_ok($$insert into transit_data values('project',public.sea_operation_save(null,null,pg_temp.planned('1')))$$,'planned project can prepare another company vessel');
select is(pg_temp.data('project')#>>'{draft,vessel,id}',pg_temp.ref('vessel-b'),'original planning vessel does not overwrite chosen operational vessel');
select is(pg_temp.data('project')#>>'{draft,planning,operationId}',pg_temp.ref('operation-1'),'original commercial planning identity remains preserved');
select is(pg_temp.data('project')#>>'{draft,clientId}',pg_temp.ref('client-1'),'defined project client is canonical from first save');
select is(pg_temp.data('project')#>>'{draft,vessel,departurePort}','Port manuel départ','project catalog does not overwrite edited departure port');
select is(pg_temp.data('project')#>>'{draft,clientContact}','Contact libre','project client contact remains edited');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set(pg_temp.planned('1'),'{planning,projectId}',to_jsonb(pg_temp.ref('project-2'))))$$,'22023',null,'forged project and occurrence combination refused');
select throws_ok($$select public.sea_operation_save(null,null,pg_temp.planned('1')||jsonb_build_object('transit',pg_temp.data('base')->'transit'))$$,'22023',null,'Transit and commercial planning are mutually exclusive');

-- Catalog changes never rewrite the saved client snapshot for the same mission.
reset role;
update public.clients set name='SEA-TRANSIT-CLIENT-1-RENAMED',active=false where id=pg_temp.ref('client-1')::bigint;
update public.projects set client_id=pg_temp.ref('client-2')::bigint where id=pg_temp.ref('project-1')::bigint;
set local role authenticated;
select pg_temp.actor(6);
update transit_data set payload=public.sea_operation_save(pg_temp.record_id('project'),1,jsonb_set(jsonb_set(payload->'draft','{clientId}',to_jsonb(pg_temp.ref('client-2'))),'{client}','"spoof"')) where key='project';
select is(pg_temp.data('project')#>>'{draft,client}','SEA-TRANSIT-CLIENT-1','saved client snapshot survives source rename and project client replacement');
select is(pg_temp.data('project')#>>'{draft,clientId}',pg_temp.ref('client-1'),'saved historical client id survives inactivity');
update transit_data set payload=public.sea_operation_save(pg_temp.record_id('project'),2,pg_temp.planned('2')) where key='project';
select is(pg_temp.data('project')#>>'{draft,clientId}',pg_temp.ref('client-2'),'real project change can reset to another registered client');
update transit_data set payload=public.sea_operation_save(pg_temp.record_id('project'),3,pg_temp.data('base')) where key='project';
select is(pg_temp.data('project')#>>'{draft,project}','Transit','real project to Transit transition is allowed');

-- Every preparer profile has the same preparation scope without gaining signing rights.
select pg_temp.actor(1);
select lives_ok($$insert into transit_data values('admin',public.sea_operation_save(null,null,jsonb_set(jsonb_set(pg_temp.data('base'),'{vessel,id}',to_jsonb(pg_temp.ref('vessel-a'))),'{transit,captainPersonId}','""')))$$,'real Admin prepares any active company vessel');
select is(pg_temp.data('admin')#>>'{draft,vessel,registrationImo}','REG-A / IMO-A','existing catalog registration and IMO replace forged values');
select pg_temp.actor(2);
select lives_ok($$select public.sea_operation_save(null,null,pg_temp.data('base'))$$,'real Direction prepares Transit');
select pg_temp.actor(3);
select lives_ok($$select public.sea_operation_save(null,null,pg_temp.data('base'))$$,'real Armement prepares Transit');
select pg_temp.actor(4);
select lives_ok($$select public.sea_operation_save(null,null,pg_temp.data('base'))$$,'real Capitaine can prepare another active company vessel');
select is((public.sea_operation_detail(pg_temp.record_id('marin'))->>'can_sign')::boolean,false,'Captain profile alone does not confer selected-vessel signature');
select throws_ok($$select public.sea_operation_save(pg_temp.record_id('marin'),2,pg_temp.data('marin')->'draft')$$,'42501',null,'unrelated noncreator captain cannot edit another record');
select pg_temp.actor(5);
select is((public.sea_operation_vessel_context(pg_temp.ref('today')::date,pg_temp.ref('vessel-b')::bigint)->>'canSign')::boolean,true,'real Marin temporary captain has authority today');
select is((public.sea_operation_vessel_context(pg_temp.ref('tomorrow')::date,pg_temp.ref('vessel-b')::bigint)->>'canSign')::boolean,false,'temporary captain authority ends exactly next day');
select is((public.sea_operation_detail(pg_temp.record_id('marin'))->>'can_sign')::boolean,true,'explicit operation day controls authority despite tomorrow ETD');
select throws_ok($$select public.sea_operation_save(pg_temp.record_id('marin'),2,jsonb_set(jsonb_set(pg_temp.data('marin')->'draft','{vessel,id}',to_jsonb(pg_temp.ref('vessel-c'))),'{transit,captainPersonId}','""'))$$,'42501',null,'noncreator captain cannot move another record to a vessel they do not command');
select lives_ok($$select public.sea_operation_sign(pg_temp.record_id('marin'),2,'Transit TEMPORAIRE',true)$$,'temporary captain signs an interrupted Transit with frozen RH signature');
select is((public.sea_operation_detail(pg_temp.record_id('marin'))->>'status'),'signed','Transit signature is persisted');
select throws_ok($$select public.sea_operation_save(pg_temp.record_id('marin'),3,pg_temp.data('marin')->'draft')$$,'42501',null,'signed Transit remains immutable through normal writer');
select pg_temp.actor(6);
select lives_ok($$select public.sea_operation_save(pg_temp.record_id('project'),4,jsonb_set(jsonb_set(pg_temp.data('project')->'draft','{vessel,id}',to_jsonb(pg_temp.ref('vessel-c'))),'{transit,captainPersonId}','""'))$$,'creator can edit own draft onto another company vessel');


select pg_temp.actor(6);
select lives_ok($$insert into transit_data values('auto',public.sea_operation_save(null,null,pg_temp.data('auto-source')))$$,'Transit accepts compatible automatic UKC evidence');
select is(pg_temp.data('auto')#>'{draft,vessel,draftMeters}','2'::jsonb,'canonical Navires draught precedes capture compatibility guard');
select is(pg_temp.data('auto')#>'{draft,waypoints,0,ukcForecast,estimate,ukcMeters}','19.5'::jsonb,'Transit retains exact compatible model estimate');
select is(pg_temp.data('auto')#>>'{draft,waypoints,0,ukc}','Note UKC manuelle','automatic capture preserves independent manual UKC annotation');
select throws_ok($$select public.sea_operation_save(null,null,pg_temp.data('auto-source')#-'{waypoints,0,ukcForecast,transit}')$$,'22023',null,'empty project id without explicit Transit is rejected');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set(pg_temp.data('auto-source'),'{waypoints,0,ukcForecast,projectId}',to_jsonb(pg_temp.ref('project-2'))))$$,'22023',null,'Transit capture cannot also claim a commercial project');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set(pg_temp.data('auto-source'),'{waypoints,0,ukcForecast,transit,vesselId}',to_jsonb(pg_temp.ref('vessel-c'))))$$,'22023',null,'nested Transit vessel must match outer capture vessel');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set(pg_temp.data('auto-source'),'{waypoints,0,ukcForecast,transit,extra}','true'))$$,'22023',null,'unknown capture Transit keys are rejected');
select lives_ok($$insert into transit_data values('auto-date',public.sea_operation_save(null,null,jsonb_set(jsonb_set(pg_temp.data('auto-source'),'{transit,date}',to_jsonb(pg_temp.ref('tomorrow'))),'{transit,captainPersonId}','""')))$$,'changed operation day can save an incomplete draft');
select ok(not ((pg_temp.data('auto-date')#>'{draft,waypoints,0}')?'ukcForecast'),'changed Transit day removes stale model capture');
select lives_ok($$insert into transit_data values('auto-vessel',public.sea_operation_save(null,null,jsonb_set(jsonb_set(pg_temp.data('auto-source'),'{vessel,id}',to_jsonb(pg_temp.ref('vessel-c'))),'{transit,captainPersonId}','""')))$$,'creator may change Transit vessel');
select ok(not ((pg_temp.data('auto-vessel')#>'{draft,waypoints,0}')?'ukcForecast'),'changed canonical vessel and draught remove stale capture');
select lives_ok($$insert into transit_data values('auto-legacy',public.sea_operation_save(null,null,jsonb_set(pg_temp.planned('2'),'{waypoints}',jsonb_build_array(
  jsonb_set(pg_temp.data('auto-source')#>'{waypoints,0}','{ukcForecast}',(pg_temp.data('capture')-'transit')||jsonb_build_object('projectId',pg_temp.ref('project-2')))))))$$,'legacy project capture format stays compatible');
select is(pg_temp.data('auto-legacy')#>'{draft,waypoints,0,ukcForecast,estimate,ukcMeters}','19.5'::jsonb,'legacy project capture estimate is retained');
insert into transit_data values('auto-unavailable-source',jsonb_set(pg_temp.data('auto-source'),'{waypoints,0,ukcForecast}',pg_temp.data('capture')||
  jsonb_build_object('status','unavailable','message','Model unavailable at position','source',null,'cell',null,'waterLevel',null,'estimate',null)));
select lives_ok($$insert into transit_data values('auto-unavailable',public.sea_operation_save(null,null,pg_temp.data('auto-unavailable-source')))$$,'unavailable model result is saved explicitly');
select pg_temp.actor(5);
select lives_ok($$select public.sea_operation_sign(pg_temp.record_id('auto-unavailable'),1,'Transit TEMPORAIRE',true)$$,'NO GO Transit remains signable with unavailable automatic UKC');
select lives_ok($$select public.sea_operation_sign(pg_temp.record_id('auto'),1,'Transit TEMPORAIRE',true)$$,'NO GO Transit signs with compatible available automatic UKC');

-- Minimal provider contexts require the exact company and explicit operation day.
select is(public.sea_operation_transit_ukc_context(pg_temp.ref('today')::date,pg_temp.ref('vessel-b')::bigint),jsonb_build_object('projectId','','vesselId',pg_temp.ref('vessel-b'),'transit',jsonb_build_object('date',pg_temp.ref('today'),'vesselId',pg_temp.ref('vessel-b')),'draftMeters',2),'Transit UKC has no fake project and returns canonical draught');
select is(public.sea_operation_ukc_context(pg_temp.ref('project-2')::bigint,pg_temp.ref('vessel-c')::bigint)->'draftMeters','3'::jsonb,'planned project provider permits another active company vessel');
select pg_temp.actor(7);
select throws_ok($$select public.sea_operation_transit_ukc_context(pg_temp.ref('today')::date,pg_temp.ref('vessel-b')::bigint)$$,'42501',null,'foreign company cannot obtain Transit UKC context');
select throws_ok($$select public.sea_operation_detail(pg_temp.record_id('marin'))$$,'42501',null,'foreign company cannot read Transit record');
select is(sea_operation_private.can_read_signature('working-time-signatures','sea-transit/captain5.png'),false,'foreign company cannot read captain signature');
select pg_temp.actor(8);
select throws_ok($$select public.sea_operation_vessel_context(pg_temp.ref('today')::date,pg_temp.ref('vessel-b')::bigint)$$,'42501',null,'inactive membership cannot query vessel context');
select pg_temp.actor(9);
select throws_ok($$select public.sea_operation_vessel_context(pg_temp.ref('today')::date,pg_temp.ref('vessel-b')::bigint)$$,'42501',null,'membership without an operational role is refused');

reset role;
select is((select count(*)::text from public.projects),pg_temp.ref('project-count'),'Transit creates no commercial project');
select is((select count(*)::text from public.planning_projects),pg_temp.ref('occurrence-count'),'Transit creates no planning occurrence');
select * from finish();
rollback;
