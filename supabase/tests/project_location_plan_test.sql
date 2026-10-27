begin;
set local search_path = public,extensions,pg_temp;
select no_plan();

insert into public.companies(code,name) values ('test-location-plan','Location fixtures'),('test-location-foreign','Location foreign fixtures');
insert into auth.users(id,email)
select ('c1080000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'project-location-'||n||'@example.invalid' from generate_series(1,7)n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Location fixture',company.id from auth.users actor cross join public.companies company
where actor.id::text like 'c1080000-%' and company.code=case when right(actor.id::text,1)='5' then 'test-location-foreign' else 'test-location-plan' end;
insert into public.company_memberships(user_id,company_id,active)
select id,active_company_id,right(id::text,1)<>'6' from public.profiles where id::text like 'c1080000-%'
on conflict(user_id,company_id) do update set active=excluded.active;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '2' then 'direction' when '3' then 'marin' when '4' then 'capitaine' when '7' then 'armement' else 'admin' end
from public.profiles where id::text like 'c1080000-%';
insert into public.vessels(company_id,name,acronym,active,asset_kind)
select id,'LOCATION-VESSEL','LCL',true,'vessel' from public.companies where code='test-location-plan';
insert into public.projects(company_id,title,status,source_label)
select id,'LOCATION-FOREIGN','Non validé','seapilot' from public.companies where code='test-location-foreign';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'Localisation','CAPITAINE TEMPORAIRE','Matelot',true from public.profiles where id='c1080000-0000-0000-0000-000000000004';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
select person.company_id,vessel.id,person.id,person.id,(now() at time zone 'Europe/Paris')::date-1,(now() at time zone 'Europe/Paris')::date+1,'Matelot','confirmed'
from public.people person join public.vessels vessel on vessel.company_id=person.company_id and vessel.name='LOCATION-VESSEL'
where person.user_id='c1080000-0000-0000-0000-000000000004';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,id,1,'working-time-signatures','project-location/captain.png','image/png',5,repeat('a',64),user_id
from public.people where user_id='c1080000-0000-0000-0000-000000000004';
insert into public.planning_days(company_id,person_id,vessel_id,work_date,function_label,slot365,source_label)
select assignment.company_id,assignment.crew_person_id,assignment.vessel_id,(now() at time zone 'Europe/Paris')::date,'Capitaine','assignment:'||assignment.id,'seapilot-assignment-note'
from public.planning_assignments assignment join public.people person on person.id=assignment.crew_person_id
where person.user_id='c1080000-0000-0000-0000-000000000004';

create temporary table location_fixture(kind text primary key,payload jsonb,id bigint,stamp timestamptz);
grant all on location_fixture to authenticated;
create temporary table location_sea_fixture(kind text primary key,payload jsonb,id uuid,version integer);
grant all on location_sea_fixture to authenticated;
insert into location_fixture(kind,payload) values ('plan','{"version":1,"etd":"","charts":"","includeInPdf":false,"waypoints":[{"id":"route","number":"1","descriptionVhf":"","latitude":"49° 39.","longitude":"","ukc":"","eta":"","denseTraffic":true,"etaMode":"automatic","weather":{"untrusted":true}}],"points":[{"id":"isolated","number":"","descriptionVhf":"Point","latitude":"","longitude":"","ukc":"","eta":"","denseTraffic":false}],"zones":[{"id":"zone","name":"À compléter","vertices":[{"latitude":"","longitude":""}]}]}'::jsonb);
select set_config('test.location.vessel',(select id::text from public.vessels where name='LOCATION-VESSEL'),true);
select set_config('test.location.foreign',(select id::text from public.projects where title='LOCATION-FOREIGN'),true);

select ok((select relrowsecurity from pg_class where oid='public.projects'::regclass),'project RLS stays enabled');
select ok(not has_table_privilege('authenticated','public.projects','UPDATE'),'direct project UPDATE remains revoked');
select ok(not has_table_privilege('authenticated','public.projects','INSERT'),'direct project INSERT remains revoked');
select ok((select not prosecdef from pg_proc where pronamespace='public'::regnamespace and proname='projects_save_with_location'),'public writer remains security invoker');
select ok((select prosecdef and proconfig=array['search_path=""'] from pg_proc where oid='project_location_private.set_plan(bigint,jsonb,timestamptz)'::regprocedure),'private writer has a fixed search path');
select ok(not exists(select from pg_proc p where p.proname='projects_save_with_location' and has_function_privilege('anon',p.oid,'EXECUTE')),'anonymous callers cannot save locations');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c1080000-0000-0000-0000-000000000001',true);
insert into location_fixture(kind,id,stamp,payload)
select 'created',saved.id,saved.updated_at,saved.location_plan from public.projects_save_with_location(
  target_title=>'LOCATION-PROJECT',target_primary_vessel_id=>current_setting('test.location.vessel')::bigint,
  target_location_plan=>(select payload from location_fixture where kind='plan')) saved;
select ok((select payload#>>'{waypoints,0,latitude}'='49° 39.' and payload#>>'{waypoints,0,longitude}'='' from location_fixture where kind='created'),'partial coordinates are retained exactly');
select ok((select payload#>'{waypoints,0,weather}' is null from location_fixture where kind='created'),'weather capture is stripped from project geography');
select is((select payload->'includeInPdf' from location_fixture where kind='created'),'false'::jsonb,'PDF location defaults remain disabled');
select is((select jsonb_array_length(payload#>'{zones,0,vertices}') from location_fixture where kind='created'),1,'an incomplete polygon is a valid editable draft');
select ok((select project.updated_at=fixture.stamp and project.location_plan=fixture.payload from public.projects project join location_fixture fixture on fixture.id=project.id where fixture.kind='created'),'RPC returns the final stored location and exact concurrency token');
select is((select count(*)::integer from public.project_contracts where project_id=(select id from location_fixture where kind='created')),1,'creation still produces exactly one contract');
select is((select source_payload from public.projects where id=(select id from location_fixture where kind='created')),'{}'::jsonb,'SharePoint provenance remains untouched');
select lives_ok($$select public.projects_save(target_project_id=>(select id from location_fixture where kind='created'),target_title=>'LOCATION-LEGACY-EDIT',target_expected_updated_at=>(select stamp from location_fixture where kind='created'))$$,'legacy writer remains callable');
select is((select location_plan from public.projects where id=(select id from location_fixture where kind='created')),(select payload from location_fixture where kind='created'),'legacy edit preserves an existing location');
select throws_ok($$select public.projects_save_with_location(target_project_id=>(select id from location_fixture where kind='created'),target_title=>'LOCATION-STALE',target_expected_updated_at=>(select stamp-interval '1 second' from location_fixture where kind='created'),target_location_plan=>null)$$,'P0001',null,'stale project updates remain rejected');
select throws_ok($$select project_location_private.set_plan((select id from location_fixture where kind='created'),null,null)$$,'P0001',null,'private location writer requires a concurrency token');
select throws_ok($$select public.projects_save_with_location(target_project_id=>current_setting('test.location.foreign')::bigint,target_title=>'LOCATION-FORGED',target_location_plan=>null)$$,'P0002',null,'another company project cannot be edited');

select lives_ok($$select public.projects_save_with_location(target_title=>'LOCATION-OPTIONAL',target_location_plan=>null)$$,'location remains optional');
select lives_ok($$select public.projects_save_with_location(target_title=>'LOCATION-OFFER',target_contract_type=>'Offre Commerciale',target_location_plan=>(select payload from location_fixture where kind='plan'))$$,'commercial offers accept the optional location');
select lives_ok($$select public.projects_save_with_location(target_title=>'LOCATION-SUPPLYTIME',target_contract_type=>'SUPPLYTIME 2017',target_location_plan=>(select payload from location_fixture where kind='plan'))$$,'SUPPLYTIME contracts accept the same optional location');
select lives_ok($$select public.projects_save_with_location(target_title=>'LOCATION-BARECON',target_contract_type=>'BARECON 2017',target_location_plan=>(select payload from location_fixture where kind='plan'))$$,'BARECON contracts accept the same optional location');

select throws_ok($$select project_location_private.normalize_plan(jsonb_set((select payload from location_fixture where kind='plan'),'{points,0,id}','"route"'))$$,'22023',null,'IDs are unique across route and isolated points');
select throws_ok($$select project_location_private.normalize_plan(jsonb_set((select payload from location_fixture where kind='plan'),'{zones,0,id}','"route"'))$$,'22023',null,'IDs are unique across route and zones');
select throws_ok($$select project_location_private.normalize_plan(jsonb_set((select payload from location_fixture where kind='plan'),'{version}','2'))$$,'22023',null,'unknown location versions are rejected');
select throws_ok($$select project_location_private.normalize_plan(jsonb_set((select payload from location_fixture where kind='plan'),'{includeInPdf}','"false"'))$$,'22023',null,'PDF visibility requires a boolean');
select throws_ok($$select project_location_private.normalize_plan(jsonb_set((select payload from location_fixture where kind='plan'),'{waypoints,0,etaMode}','"invalid"'))$$,'22023',null,'unknown ETA modes are rejected');
select throws_ok($$select project_location_private.normalize_plan(jsonb_set((select payload from location_fixture where kind='plan'),'{waypoints,0,number}',to_jsonb(repeat('😀',41))))$$,'22023',null,'UTF-16 limits match the browser for non-BMP text');
select throws_ok($$select project_location_private.normalize_plan(jsonb_set((select payload from location_fixture where kind='plan'),'{waypoints}',(select jsonb_agg(payload#>'{waypoints,0}'||jsonb_build_object('id','r'||n)) from location_fixture cross join generate_series(1,201)n where kind='plan')))$$,'22023',null,'route is limited to 200 waypoints');
select throws_ok($$select project_location_private.normalize_plan(jsonb_set((select payload from location_fixture where kind='plan'),'{points}',(select jsonb_agg(payload#>'{points,0}'||jsonb_build_object('id','p'||n)) from location_fixture cross join generate_series(1,201)n where kind='plan')))$$,'22023',null,'isolated points are limited to 200');
select throws_ok($$select project_location_private.normalize_plan(jsonb_set((select payload from location_fixture where kind='plan'),'{zones}',(select jsonb_agg(payload#>'{zones,0}'||jsonb_build_object('id','z'||n)) from location_fixture cross join generate_series(1,51)n where kind='plan')))$$,'22023',null,'zones are limited to 50');
select throws_ok($$select project_location_private.normalize_plan(jsonb_set((select payload from location_fixture where kind='plan'),'{zones,0,vertices}',(select jsonb_agg(jsonb_build_object('latitude','','longitude','')) from generate_series(1,201))))$$,'22023',null,'zone vertices are limited to 200');
select lives_ok($$select project_location_private.normalize_plan(payload||jsonb_build_object('unused',repeat('a',(262144-project_location_private.json_bytes(payload||'{"unused":""}'::jsonb))::integer))) from location_fixture where kind='plan'$$,'compact project JSON size accepts exactly 256 KiB');
select throws_ok($$select project_location_private.normalize_plan(payload||jsonb_build_object('unused',repeat('a',(262145-project_location_private.json_bytes(payload||'{"unused":""}'::jsonb))::integer))) from location_fixture where kind='plan'$$,'22023',null,'compact project JSON size rejects 256 KiB plus one byte');
select lives_ok($$select project_location_private.validate_overlay('{"version":1,"points":[],"zones":[{"id":"overlay-zone","name":"","vertices":[]}]}'::jsonb,'[{"id":"route"}]')$$,'SeaOps accepts independent incomplete overlay geometry');
select throws_ok($$select project_location_private.validate_overlay('{"version":1,"points":[],"zones":[{"id":"route","name":"","vertices":[]}]}'::jsonb,'[{"id":"route"}]')$$,'22023',null,'SeaOps overlay IDs cannot collide with the route');
select throws_ok($$select project_location_private.validate_overlay('{"version":1,"points":[],"zones":[],"weather":{"forged":true}}'::jsonb,'[]')$$,'22023',null,'SeaOps stores geometry only, without extra captures');

-- A failure after the existing atomic writer must roll back the project, contract and number counter.
reset role;
create function pg_temp.reject_location_fixture() returns trigger language plpgsql as $$
begin if new.location_plan->>'charts'='force rollback' then raise exception 'Location fixture failure' using errcode='22023'; end if; return new; end;
$$;
create trigger location_fixture_failure before update of location_plan on public.projects for each row execute function pg_temp.reject_location_fixture();
set local role authenticated;
select set_config('test.location.next_code',public.projects_peek_next_code('P'),true);
select throws_ok($$select public.projects_save_with_location(target_title=>'LOCATION-ROLLBACK',target_location_plan=>jsonb_set((select payload from location_fixture where kind='plan'),'{charts}','"force rollback"'))$$,'22023',null,'location failure aborts the whole project/contract transaction');
select is((select count(*)::integer from public.projects where title='LOCATION-ROLLBACK'),0,'failed location leaves no project');
select is(public.projects_peek_next_code('P'),current_setting('test.location.next_code'),'failed location does not consume a project number');
select lives_ok($$select public.projects_save_with_location(target_project_id=>(select id from location_fixture where kind='created'),target_title=>'LOCATION-CLEARED',target_expected_updated_at=>(select updated_at from public.projects where id=(select id from location_fixture where kind='created')),target_location_plan=>null)$$,'null explicitly clears a location');
select ok((select location_plan is null from public.projects where id=(select id from location_fixture where kind='created')),'explicit clearing stores SQL NULL');
select public.projects_save_with_location(target_project_id=>(select id from location_fixture where kind='created'),target_title=>'LOCATION-PLANNING',target_primary_vessel_id=>current_setting('test.location.vessel')::bigint,target_location_plan=>(select payload from location_fixture where kind='plan'));
select public.projects_save_planning_occurrence(null,(select id from location_fixture where kind='created'),(now() at time zone 'Europe/Paris')::date,(now() at time zone 'Europe/Paris')::date,array[current_setting('test.location.vessel')::bigint],'Non validé','',null,null,null);

insert into location_sea_fixture(kind,payload)
select 'draft',jsonb_build_object('version',1,'project','Localisation en mer','client','','clientContact','','description','','specialPersonnel','[]'::jsonb,
  'dapaq','{"method":"","preparedBy":"","agentName":"","agentContact":""}'::jsonb,
  'vessel',jsonb_build_object('id',current_setting('test.location.vessel'),'name','LOCATION-VESSEL','registrationImo','1234','captainName','Localisation CAPITAINE TEMPORAIRE',
    'departurePort','','departureQuay','','arrivalPort','','arrivalQuay','','etd','','eta',''),
  'applicability','{"towing":"","cargo":"","divingSupport":"","supplies":""}'::jsonb,
  'checks',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures','towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned','standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])key),
  'justifications',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures','towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned','standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])key),
  'towedVesselBoarding','{"required":"","measures":"","details":""}'::jsonb,'portServices','[]'::jsonb,'mandatoryServicesNotified',false,
  'supplies','{"delegated":"","shipchandlerName":"","shipchandlerContact":"","items":[],"suppliers":"","customerAccountsPrepared":false}'::jsonb,
  'charts','','waypoints',jsonb_build_array(jsonb_build_object('id','sea-route','number','1','descriptionVhf','','latitude','','longitude','','ukc','','eta','','denseTraffic',false)),
  'locationOverlay','{"version":1,"points":[],"zones":[{"id":"sea-zone","name":"Géométrie adaptée","vertices":[]}]}'::jsonb,
  'decision','NO_GO','risks','Opération interrompue, Armement informé',
  'signature',jsonb_build_object('captainName','Localisation CAPITAINE TEMPORAIRE','date',(now() at time zone 'Europe/Paris')::date,'place','Cherbourg','acknowledged',true),
  'planning',jsonb_build_object('date',(now() at time zone 'Europe/Paris')::date,'operationId',occurrence.id::text||':'||current_setting('test.location.vessel'),
    'projectId',(select id::text from location_fixture where kind='created'),'captainPersonId',(select id::text from public.people where user_id='c1080000-0000-0000-0000-000000000004')))
from public.planning_projects occurrence where occurrence.catalog_project_id=(select id from location_fixture where kind='created');
select lives_ok($$select sea_operation_private.validate_draft(payload,false) from location_sea_fixture where kind='draft'$$,'draft validator accepts independent overlay');
select lives_ok($$select sea_operation_private.validate_draft(payload,true) from location_sea_fixture where kind='draft'$$,'signature validator accepts incomplete NO GO geometry');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set(payload,'{locationOverlay,zones,0,id}','"sea-route"'),false) from location_sea_fixture where kind='draft'$$,'22023','Identifiant partagé entre route et localisation complémentaire.','save validator rejects route-overlay ID collisions');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set(payload,'{locationOverlay,zones,0,id}','"sea-route"'),true) from location_sea_fixture where kind='draft'$$,'22023','Identifiant partagé entre route et localisation complémentaire.','signature validator rejects route-overlay ID collisions');

insert into location_sea_fixture(kind,payload)
select 'base-limit',base||jsonb_build_object('padding',repeat('x',500000-octet_length(base::text)))
from (select (payload-'locationOverlay')||'{"padding":""}'::jsonb as base from location_sea_fixture where kind='draft')source;
insert into location_sea_fixture(kind,payload)
with empty_overlay as (select jsonb_build_object('version',1,'zones','[]'::jsonb,'points',jsonb_agg(jsonb_build_object('id','large-'||n,'number','','descriptionVhf','','latitude','','longitude','','ukc','','eta','','denseTraffic',false))) as value from generate_series(1,200)n),
budget as (select value,(524288-project_location_private.json_bytes(value))::integer as remaining from empty_overlay)
select 'overlay-limit',jsonb_set(value,'{points}',(select jsonb_agg(point||jsonb_build_object('descriptionVhf',repeat('x',least(4000,greatest(0,remaining-(ordinal-1)::integer*4000)))) order by ordinal) from jsonb_array_elements(value->'points') with ordinality p(point,ordinal))) from budget;
select is((select octet_length(payload::text) from location_sea_fixture where kind='base-limit'),500000,'legacy draft boundary is exactly 500000 bytes');
select is((select project_location_private.json_bytes(payload) from location_sea_fixture where kind='overlay-limit'),524288::bigint,'overlay boundary is exactly 512 KiB compact JSON');
select lives_ok($$select sea_operation_private.validate_draft(payload,false) from location_sea_fixture where kind='base-limit'$$,'legacy draft at its old byte limit remains valid');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set(payload,'{padding}',to_jsonb((payload->>'padding')||'x')),false) from location_sea_fixture where kind='base-limit'$$,'22023',null,'legacy draft above 500000 bytes remains rejected');
select lives_ok($$select sea_operation_private.validate_draft(jsonb_set(base.payload,'{locationOverlay}',overlay.payload),false) from location_sea_fixture base cross join location_sea_fixture overlay where base.kind='base-limit' and overlay.kind='overlay-limit'$$,'valid maximum overlay does not consume the old draft budget');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set(jsonb_set(base.payload,'{padding}',to_jsonb((base.payload->>'padding')||'x')),'{locationOverlay}',draft.payload->'locationOverlay'),false) from location_sea_fixture base cross join location_sea_fixture draft where base.kind='base-limit' and draft.kind='draft'$$,'22023',null,'overlay never permits a base draft over 500000 bytes');
select throws_ok($$select project_location_private.validate_overlay(jsonb_set(payload,'{points,199,descriptionVhf}','"x"'), '[]') from location_sea_fixture where kind='overlay-limit'$$,'22023',null,'overlay above 512 KiB is rejected separately');
select lives_ok($$select sea_operation_private.validate_draft(jsonb_set(payload,'{waypoints}',(select jsonb_agg(jsonb_build_object('id','route-'||n,'number',n::text,'descriptionVhf','','latitude','','longitude','','ukc','','eta','','denseTraffic',false)) from generate_series(1,200)n)),false) from location_sea_fixture where kind='draft'$$,'all 200 project route waypoints remain importable');

insert into location_fixture(kind,payload)
with empty_plan as (select jsonb_build_object('version',1,'etd','','charts','','includeInPdf',false,'points','[]'::jsonb,'zones','[]'::jsonb,
  'waypoints',jsonb_agg(jsonb_build_object('id','max-route-'||n,'number',n::text,'descriptionVhf','','latitude','','longitude','','ukc','','eta','','denseTraffic',false))) as value from generate_series(1,200)n),
budget as (select value,(262144-project_location_private.json_bytes(value))::integer as remaining from empty_plan)
select 'max-plan',jsonb_set(value,'{waypoints}',(select jsonb_agg(point||jsonb_build_object('descriptionVhf',repeat('x',least(4000,greatest(0,remaining-(ordinal-1)::integer*4000)))) order by ordinal) from jsonb_array_elements(value->'waypoints') with ordinality p(point,ordinal))) from budget;
select is((select project_location_private.json_bytes(payload) from location_fixture where kind='max-plan'),262144::bigint,'route-only project fixture reaches exactly 256 KiB');
select lives_ok($$select project_location_private.normalize_plan(payload) from location_fixture where kind='max-plan'$$,'a maximum route-only project is valid');
insert into location_sea_fixture(kind,payload)
select 'max-project-copy',jsonb_set(jsonb_set(draft.payload,'{waypoints}',plan.payload->'waypoints'),'{locationOverlay}',
  jsonb_build_object('version',1,'points',plan.payload->'points','zones',plan.payload->'zones'))
from location_sea_fixture draft cross join location_fixture plan where draft.kind='draft' and plan.kind='max-plan';
select ok((select octet_length((payload-'locationOverlay')::text)<500000 from location_sea_fixture where kind='max-project-copy'),'maximum project route leaves headroom for the real planning form');
select lives_ok($$select public.sea_operation_save(null,null,payload) from location_sea_fixture where kind='max-project-copy'$$,'maximum project route saves through the real planning-linked SeaOps RPC');

select lives_ok($$insert into location_sea_fixture(kind,id,version,payload) select 'saved',(record->>'id')::uuid,(record->>'version')::integer,record->'draft' from (select public.sea_operation_save(null,null,payload) as record from location_sea_fixture where kind='draft')saved$$,'management saves an independently edited route and overlay');
select public.projects_save_with_location(target_project_id=>(select id from location_fixture where kind='created'),target_title=>'LOCATION-PROJECT-CHANGED',target_primary_vessel_id=>current_setting('test.location.vessel')::bigint,target_location_plan=>null);
select is((select payload->'locationOverlay' from location_sea_fixture where kind='saved'),(select payload->'locationOverlay' from location_sea_fixture where kind='draft'),'project edits do not replace the saved independent geometry');
select set_config('request.jwt.claim.sub','c1080000-0000-0000-0000-000000000004',true);
select lives_ok($$select public.sea_operation_sign((select id from location_sea_fixture where kind='saved'),(select version from location_sea_fixture where kind='saved'),'Localisation CAPITAINE TEMPORAIRE',true)$$,'actual temporary captain can sign the independent overlay');
select is((select draft->'locationOverlay' from public.sea_operations where id=(select id from location_sea_fixture where kind='saved')),(select payload->'locationOverlay' from location_sea_fixture where kind='draft'),'signing does not reload geometry from the changed project');
select throws_ok($$select public.sea_operation_save((select id from location_sea_fixture where kind='saved'),2,(select payload from location_sea_fixture where kind='draft'))$$,'42501',null,'signed independent geometry remains immutable through the authenticated RPC');
select set_config('request.jwt.claim.sub','c1080000-0000-0000-0000-000000000001',true);
select public.projects_save_with_location(target_project_id=>(select id from location_fixture where kind='created'),target_title=>'LOCATION-PLANNING',target_primary_vessel_id=>current_setting('test.location.vessel')::bigint,target_location_plan=>(select payload from location_fixture where kind='plan'));

select set_config('request.jwt.claim.sub','c1080000-0000-0000-0000-000000000002',true);
select lives_ok($$select public.projects_save_with_location(target_title=>'LOCATION-DIRECTION',target_location_plan=>null)$$,'Direction keeps its existing project-edit authority');
select set_config('request.jwt.claim.sub','c1080000-0000-0000-0000-000000000003',true);
select throws_ok($$select public.projects_save_with_location(target_title=>'LOCATION-MARIN',target_location_plan=>null)$$,'42501',null,'real Marin cannot write a project');
select is((select count(*)::integer from public.projects where id=(select id from location_fixture where kind='created')),0,'real Marin gains no direct Projects read permission');
select ok(exists(select from jsonb_array_elements(public.sea_operation_planning_context((now() at time zone 'Europe/Paris')::date)->'choices') item where item->>'projectId'=(select id::text from location_fixture where kind='created') and item->'locationPlan'->>'version'='1'),'real Marin receives authorized project geography through the existing planning RPC');
select set_config('request.jwt.claim.sub','c1080000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.projects_save_with_location(target_title=>'LOCATION-CAPTAIN',target_location_plan=>null)$$,'42501',null,'real Capitaine cannot write a project');
select ok(exists(select from jsonb_array_elements(public.sea_operation_planning_context((now() at time zone 'Europe/Paris')::date)->'choices') item where item->>'projectId'=(select id::text from location_fixture where kind='created') and item->'locationPlan'->>'version'='1' and exists(select from jsonb_array_elements(item->'captains') captain where captain->>'canSign'='true')),'temporary planning captain receives location without losing actual captain permission');
select set_config('request.jwt.claim.sub','c1080000-0000-0000-0000-000000000005',true);
select ok(not exists(select from jsonb_array_elements(public.sea_operation_planning_context((now() at time zone 'Europe/Paris')::date)->'choices') item where item->>'projectId'=(select id::text from location_fixture where kind='created')),'foreign company planning never exposes the location');
select set_config('request.jwt.claim.sub','c1080000-0000-0000-0000-000000000006',true);
select throws_ok($$select public.projects_save_with_location(target_title=>'LOCATION-INACTIVE',target_location_plan=>null)$$,'42501',null,'inactive membership cannot write a location');
select set_config('request.jwt.claim.sub','c1080000-0000-0000-0000-000000000007',true);
select throws_ok($$select public.projects_save_with_location(target_title=>'LOCATION-ARMEMENT',target_location_plan=>null)$$,'42501',null,'Armement gains no new project-edit authority');

reset role;
select * from finish();
rollback;
