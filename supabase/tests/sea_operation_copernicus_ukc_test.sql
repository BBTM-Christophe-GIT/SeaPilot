begin;
select no_plan();

select ok(not (select prosecdef from pg_proc where oid='public.sea_operation_ukc_context(bigint,bigint)'::regprocedure),'the exposed UKC RPC is an invoker wrapper');
select ok(not has_function_privilege('anon','public.sea_operation_ukc_context(bigint,bigint)','EXECUTE'),'anonymous clients cannot obtain vessel context');
select ok(not has_function_privilege('authenticated','sea_operation_private.guard_copernicus_captures()','EXECUTE'),'the UKC trigger is not an RPC');
select ok(not has_table_privilege('authenticated','public.sea_operations','INSERT,UPDATE,DELETE'),'the change adds no direct operation writes');

insert into public.companies(code,name) values('sea-cop-other','Sea Copernicus other');
insert into auth.users(id,email)
select ('a6460000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'sea-copernicus-'||n||'@example.invalid' from generate_series(1,5)n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Copernicus Test '||right(actor.id::text,1),company.id from auth.users actor
join public.companies company on company.code=case when right(actor.id::text,1)='4' then 'sea-cop-other' else 'bbtm' end
where actor.id::text like 'a6460000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like 'a6460000-%' on conflict(company_id,user_id) do nothing;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,(array['capitaine','marin','admin','capitaine'])[right(id::text,1)::integer]
from public.profiles where id::text like 'a6460000-%' and right(id::text,1)<>'5';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'COPERNICUS','TEST 1','Capitaine',true from public.profiles where id='a6460000-0000-0000-0000-000000000001';
insert into public.vessels(company_id,name,active,asset_kind,draft_m)
select company.id,item.name,true,'vessel',item.draught from public.companies company cross join
  (values('SEA-COP-MAIN',2.65::numeric),('SEA-COP-UNKNOWN',null::numeric),('SEA-COP-UNRELATED',3::numeric))item(name,draught) where company.code='bbtm';
insert into public.projects(company_id,title,project_code)
select id,'SEA-COP-PROJECT-'||n,'SEA-COP-'||n from public.companies cross join generate_series(1,4)n where code='bbtm';
insert into public.planning_projects(company_id,title,catalog_project_id,primary_vessel_id,secondary_vessel_id,starts_on,ends_on)
select project.company_id,project.title,project.id,vessel.id,other.id,(now() at time zone 'Europe/Paris')::date,(now() at time zone 'Europe/Paris')::date
from public.projects project join public.vessels vessel on vessel.name='SEA-COP-MAIN' join public.vessels other on other.name='SEA-COP-UNKNOWN'
where project.title in ('SEA-COP-PROJECT-1','SEA-COP-PROJECT-3','SEA-COP-PROJECT-4');
update public.planning_projects set cancelled_at=now() where title='SEA-COP-PROJECT-3';
update public.projects set archived_at=now() where title='SEA-COP-PROJECT-4';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
select person.company_id,vessel.id,person.id,person.id,(now() at time zone 'Europe/Paris')::date-1,
  (now() at time zone 'Europe/Paris')::date+1,'Capitaine','confirmed'
from public.people person join public.vessels vessel on vessel.company_id=person.company_id and vessel.name='SEA-COP-MAIN'
where person.user_id='a6460000-0000-0000-0000-000000000001';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,id,1,'working-time-signatures','sea-copernicus/captain.png','image/png',5,repeat('a',64),user_id
from public.people where user_id='a6460000-0000-0000-0000-000000000001';

create temporary table copernicus_fixture(kind text primary key,payload jsonb,id uuid,exact_row jsonb);
grant all on copernicus_fixture to authenticated;
create temporary table copernicus_context(kind text primary key,project_id bigint,vessel_id bigint);
grant select on copernicus_context to authenticated;
insert into copernicus_context
select 'project-'||right(project.title,1),project.id,vessel.id from public.projects project
join public.vessels vessel on vessel.name='SEA-COP-MAIN' where project.title like 'SEA-COP-PROJECT-%';
insert into copernicus_context
select item.kind,project.id,vessel.id from (values('unknown','SEA-COP-UNKNOWN'),('unrelated','SEA-COP-UNRELATED'))item(kind,name)
join public.vessels vessel on vessel.name=item.name cross join public.projects project where project.title='SEA-COP-PROJECT-1';
insert into copernicus_fixture(kind,payload)
select 'capture',jsonb_build_object('version',1,'projectId',project.id::text,'vesselId',vessel.id::text,'pointId','cop-wp-1',
  'latitude',49.65,'longitude',-1.62,'etaUtc','2026-10-26T11:30:00Z','draftMeters',2.65,'fetchedAt','2026-10-26T08:00:00Z',
  'status','available','message','Synthetic model data for permission and arithmetic tests only.',
  'source',jsonb_build_object('model','NWS','productId','NWSHELF_ANALYSISFORECAST_PHY_004_013',
    'seaLevelDatasetId','cmems_mod_nws_phy-ssh_anfc_1.5km-2D_PT15M-i','bathymetryDatasetId','cmems_mod_nws_phy_anfc_1.5km_static',
    'datasetVersion','202511','datum','model-geoid','referenceTimeUtc','2026-10-26T00:00:00Z',
    'sourceUrl','https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/description'),
  'cell',jsonb_build_object('latitude',49.65,'longitude',-1.62,'resolutionMeters',1500,'depthMeters',20,'depthMinMeters',19,'depthMaxMeters',21,
    'bounds',jsonb_build_object('west',-1.635,'east',-1.605,'south',49.6435,'north',49.6565)),
  'waterLevel',jsonb_build_object('timeBeforeUtc','2026-10-26T11:30:00Z','timeAfterUtc','2026-10-26T11:30:00Z','heightBeforeMeters',1.5,'heightAfterMeters',1.5),
  'estimate',jsonb_build_object('kind','static','waterLevelMeters',1.5,'ukcMeters',18.85,'cellVariability',jsonb_build_object('lowerMeters',17.85,'upperMeters',19.85),
    'dynamicCorrectionsApplied',false,'uncertainty',jsonb_build_object('method','sum-known-standard-uncertainties','quantifiedMeters',null,
      'complete',false,'confidenceLevel',null,'components',jsonb_build_array(
        jsonb_build_object('id','bathymetryVertical','standardUncertaintyMeters',null),jsonb_build_object('id','waterLevel','standardUncertaintyMeters',null),
        jsonb_build_object('id','draft','standardUncertaintyMeters',null),jsonb_build_object('id','positionEffect','standardUncertaintyMeters',null),
        jsonb_build_object('id','temporalInterpolation','standardUncertaintyMeters',0)),
      'missingComponents','["bathymetryVertical","waterLevel","draft","positionEffect"]'::jsonb)))
from public.projects project join public.vessels vessel on vessel.name='SEA-COP-MAIN' where project.title='SEA-COP-PROJECT-1';
insert into copernicus_fixture(kind,payload)
select 'source',jsonb_build_object('version',1,'project','Copernicus UKC fixture','client','','clientContact','','description','',
  'planning',jsonb_build_object('date',(now() at time zone 'Europe/Paris')::date,'projectId',project.id::text,
    'operationId',occurrence.id::text||':'||vessel.id::text,'captainPersonId',person.id::text),
  'specialPersonnel','[]'::jsonb,'dapaq','{"method":"","preparedBy":"","agentName":"","agentContact":""}'::jsonb,
  'vessel',jsonb_build_object('id',vessel.id::text,'name',vessel.name,'registrationImo','','captainName','COPERNICUS TEST 1',
    'departurePort','','departureQuay','','arrivalPort','','arrivalQuay','','etd','','eta','','draftMeters',999),
  'applicability','{"towing":"no","cargo":"no","divingSupport":"no","supplies":"no"}'::jsonb,
  'checks',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])key),
  'justifications',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])key),
  'towedVesselBoarding','{"required":"","measures":"","details":""}'::jsonb,'portServices','[]'::jsonb,'mandatoryServicesNotified',false,
  'supplies','{"delegated":"","shipchandlerName":"","shipchandlerContact":"","items":[],"suppliers":"","customerAccountsPrepared":false}'::jsonb,
  'charts','','waypoints',jsonb_build_array(jsonb_build_object('id','cop-wp-1','number','1','descriptionVhf','','latitude','49.65','longitude','-1.62',
    'eta','2026-10-26T12:30','ukc','annotation historique','denseTraffic',false,'ukcMode','automatic','ukcForecast',capture.payload)),
  'decision','NO_GO','risks','Synthetic fixture.',
  'signature',jsonb_build_object('captainName','COPERNICUS TEST 1','date',(now() at time zone 'Europe/Paris')::date,'place','Cherbourg','acknowledged',true))
from public.projects project join public.planning_projects occurrence on occurrence.catalog_project_id=project.id
join public.vessels vessel on vessel.id=occurrence.primary_vessel_id join public.people person on person.user_id='a6460000-0000-0000-0000-000000000001'
cross join copernicus_fixture capture where project.title='SEA-COP-PROJECT-1' and capture.kind='capture';

set local role authenticated;
select set_config('request.jwt.claim.sub','a6460000-0000-0000-0000-000000000001',true);
select is(public.sea_operation_ukc_context((select project_id from copernicus_context where kind='project-1'),(select vessel_id from copernicus_context where kind='project-1'))->'draftMeters',
  '2.65'::jsonb,'a real Captain obtains the canonical Navires reference');
select is(public.sea_operation_ukc_context((select project_id from copernicus_context where kind='unknown'),(select vessel_id from copernicus_context where kind='unknown'))->'draftMeters',
  'null'::jsonb,'a planned secondary vessel with unknown draught returns null rather than zero');
select throws_ok($$select public.sea_operation_ukc_context((select project_id from copernicus_context where kind='unrelated'),(select vessel_id from copernicus_context where kind='unrelated'))$$,
  '42501',null,'an unrelated same-company vessel cannot be substituted for the planned one');
select throws_ok($$select public.sea_operation_ukc_context((select project_id from copernicus_context where kind='project-2'),(select vessel_id from copernicus_context where kind='project-2'))$$,
  '42501',null,'an unplanned project cannot authorize the provider');
select throws_ok($$select public.sea_operation_ukc_context((select project_id from copernicus_context where kind='project-3'),(select vessel_id from copernicus_context where kind='project-3'))$$,
  '42501',null,'a cancelled occurrence cannot authorize the provider');
select throws_ok($$select public.sea_operation_ukc_context((select project_id from copernicus_context where kind='project-4'),(select vessel_id from copernicus_context where kind='project-4'))$$,
  '42501',null,'an archived project cannot authorize the provider');
select set_config('request.jwt.claim.sub','a6460000-0000-0000-0000-000000000002',true);
select is(public.sea_operation_ukc_context((select (payload->>'projectId')::bigint from copernicus_fixture where kind='capture'),
  (select (payload->>'vesselId')::bigint from copernicus_fixture where kind='capture'))->'draftMeters','2.65'::jsonb,'a real Marin has the same existing operational read scope');
select set_config('request.jwt.claim.sub','a6460000-0000-0000-0000-000000000003',true);
select is(public.sea_operation_ukc_context((select (payload->>'projectId')::bigint from copernicus_fixture where kind='capture'),
  (select (payload->>'vesselId')::bigint from copernicus_fixture where kind='capture'))->'draftMeters','2.65'::jsonb,'a real Admin obtains the scoped reference');
select set_config('request.jwt.claim.sub','a6460000-0000-0000-0000-000000000004',true);
select throws_ok($$select public.sea_operation_ukc_context((select (payload->>'projectId')::bigint from copernicus_fixture where kind='capture'),
  (select (payload->>'vesselId')::bigint from copernicus_fixture where kind='capture'))$$,'42501',null,'another company cannot obtain the context');
select set_config('request.jwt.claim.sub','a6460000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.sea_operation_ukc_context((select (payload->>'projectId')::bigint from copernicus_fixture where kind='capture'),
  (select (payload->>'vesselId')::bigint from copernicus_fixture where kind='capture'))$$,'42501',null,'membership without an operational profile does not authorize access');
select set_config('request.jwt.claim.sub','a6460000-0000-0000-0000-000000000001',true);

insert into copernicus_fixture(kind,id,payload)
select 'record',(saved->>'id')::uuid,saved->'draft' from (select public.sea_operation_save(null,null,(select payload from copernicus_fixture where kind='source'))saved)response;
select is((select payload#>'{vessel,draftMeters}' from copernicus_fixture where kind='record'),'2.65'::jsonb,'save canonicalizes the supplied 999 before checking UKC identity');
select is((select payload#>'{waypoints,0,ukcForecast,estimate,ukcMeters}' from copernicus_fixture where kind='record'),'18.85'::jsonb,'a compatible same-geoid computation is retained');
select is((select payload#>>'{waypoints,0,ukc}' from copernicus_fixture where kind='record'),'annotation historique','the manual UKC text is preserved independently');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),'{waypoints,0,ukcForecast}','{}'))$$,
  '22023',null,'malformed evidence is rejected');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),'{waypoints,0,ukcForecast,estimate,ukcMeters}','100'))$$,
  '22023',null,'a forged UKC cannot pass the arithmetic check');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),'{waypoints,0,ukcForecast,estimate,waterLevelMeters}','100'))$$,
  '22023',null,'a forged level cannot pass the arithmetic check');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),'{waypoints,0,ukcForecast,source,datum}','"LAT"'))$$,
  '22023',null,'a fabricated LAT conversion is rejected');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),'{waypoints,0,ukcForecast,source,datasetVersion}','202511'))$$,
  '22023',null,'dataset versions must be the pinned string release');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),'{waypoints,0,ukcForecast,estimate,uncertainty,complete}','true'))$$,
  '22023',null,'unknown uncertainty cannot be described as a complete budget');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),'{waypoints,0,ukcForecast,waterLevel,timeAfterUtc}','"2026-10-26T12:00:00Z"'))$$,
  '22023',null,'the provider cannot bridge a missing quarter-hour');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),'{waypoints,0,ukcForecast,fetchedAt}','"2026-10-26T12:00:00Z"'))$$,
  '22023',null,'an available forecast cannot have been retrieved after its ETA');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),'{waypoints,0,ukcForecast,etaUtc}','"0999-10-26T11:30:00Z"'))$$,
  '22023','Horodatage de capture UKC invalide.','UTC years below 1000 are rejected consistently with the client and provider');
select is((public.sea_operation_save(null,null,jsonb_set(jsonb_set((select payload from copernicus_fixture where kind='source'),
  '{waypoints,0,latitude}','"49° 39.000′ N"'),'{waypoints,0,longitude}','"001° 37.200′ W"'))#>>'{draft,waypoints,0,ukcForecast,status}'),
  'available','SMCP formatting of an identical position retains its evidence');
select ok(not ((public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),
  '{waypoints,0,latitude}','"49.6502"'))#>'{draft,waypoints,0}') ? 'ukcForecast'),'changing position removes stale evidence');
select ok(not ((public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),
  '{waypoints,0,eta}','"2026-10-26T12:45"'))#>'{draft,waypoints,0}') ? 'ukcForecast'),'changing ETA removes stale evidence');
select ok(not ((public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),
  '{waypoints,0,id}','"cop-wp-replaced"'))#>'{draft,waypoints,0}') ? 'ukcForecast'),'changing point identity removes stale evidence');
select ok(not ((public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),
  '{waypoints,0,ukcForecast,projectId}',to_jsonb((select project_id::text from copernicus_context where kind='project-2'))))#>'{draft,waypoints,0}') ? 'ukcForecast'),
  'evidence for another project is not retained');
select ok(not ((public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),
  '{waypoints,0,ukcForecast,vesselId}',to_jsonb((select vessel_id::text from copernicus_context where kind='unknown'))))#>'{draft,waypoints,0}') ? 'ukcForecast'),
  'evidence for another vessel is not retained');
select is(public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),
  '{waypoints,0,ukcMode}','"manual"'))#>>'{draft,waypoints,0,ukc}','annotation historique','manual mode preserves the annotation');
select ok(not ((public.sea_operation_save(null,null,jsonb_set((select payload from copernicus_fixture where kind='source'),
  '{waypoints,0,ukcMode}','"manual"'))#>'{draft,waypoints,0}') ? 'ukcForecast'),'manual mode strips automatic evidence');
reset role;

insert into copernicus_fixture(kind,payload)
select 'interpolated',jsonb_set(jsonb_set(source.payload,'{waypoints,0,eta}','"2026-10-26T12:37"'),'{waypoints,0,ukcForecast}',
  capture.payload||jsonb_build_object('etaUtc','2026-10-26T11:37:00Z',
    'waterLevel',jsonb_build_object('timeBeforeUtc','2026-10-26T11:30:00Z','timeAfterUtc','2026-10-26T11:45:00Z','heightBeforeMeters',1,'heightAfterMeters',2),
    'estimate',(capture.payload->'estimate')||jsonb_build_object('waterLevelMeters',22::numeric/15,'ukcMeters',20+22::numeric/15-2.65,
      'cellVariability',jsonb_build_object('lowerMeters',19+22::numeric/15-2.65,'upperMeters',21+22::numeric/15-2.65),
      'uncertainty',(capture.payload#>'{estimate,uncertainty}')||jsonb_build_object(
        'components',jsonb_set(capture.payload#>'{estimate,uncertainty,components}','{4,standardUncertaintyMeters}','null'),
        'missingComponents','["bathymetryVertical","waterLevel","draft","positionEffect","temporalInterpolation"]'::jsonb))))
from copernicus_fixture source cross join copernicus_fixture capture where source.kind='source' and capture.kind='capture';
set local role authenticated;
select is(public.sea_operation_save(null,null,(select payload from copernicus_fixture where kind='interpolated'))#>>'{draft,waypoints,0,ukcForecast,status}',
  'available','quarter-hour interpolation is recomputed at the precise ETA with unknown temporal uncertainty');
reset role;
update public.vessels set active=false where name='SEA-COP-MAIN';
set local role authenticated;
select throws_ok($$select public.sea_operation_ukc_context((select project_id from copernicus_context where kind='project-1'),
  (select vessel_id from copernicus_context where kind='project-1'))$$,'42501',null,'an inactive planned vessel cannot authorize the provider');
reset role;
update public.vessels set active=true where name='SEA-COP-MAIN';

-- The same mathematical capture is valid for the separately pinned IBI pair.
insert into copernicus_fixture(kind,payload) select 'ibi',jsonb_set(payload,'{waypoints,0,ukcForecast,source}',jsonb_build_object(
  'model','IBI','productId','IBI_ANALYSISFORECAST_PHY_005_001','seaLevelDatasetId','cmems_mod_ibi_phy_anfc_0.027deg-2D_PT15M-i',
  'bathymetryDatasetId','cmems_mod_ibi_phy_anfc_0.027deg-3D_static','datasetVersion','202411','datum','model-geoid',
  'referenceTimeUtc',null,'sourceUrl','https://data.marine.copernicus.eu/product/IBI_ANALYSISFORECAST_PHY_005_001/description'))
from copernicus_fixture where kind='source';
insert into copernicus_fixture(kind,payload)
select kind||'-shallow',jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(payload,
  '{waypoints,0,ukcForecast,cell,depthMeters}','10'),'{waypoints,0,ukcForecast,cell,depthMinMeters}','9'),'{waypoints,0,ukcForecast,cell,depthMaxMeters}','11'),
  '{waypoints,0,ukcForecast,estimate,ukcMeters}','8.85'),'{waypoints,0,ukcForecast,estimate,cellVariability,lowerMeters}','7.85'),
  '{waypoints,0,ukcForecast,estimate,cellVariability,upperMeters}','9.85') from copernicus_fixture where kind in ('source','ibi');
set local role authenticated;
select is(public.sea_operation_save(null,null,(select payload from copernicus_fixture where kind='ibi'))#>>'{draft,waypoints,0,ukcForecast,source,model}',
  'IBI','the pinned IBI model is accepted without a fabricated CRV');
select throws_ok($$select public.sea_operation_save(null,null,(select payload from copernicus_fixture where kind='source-shallow'))$$,
  '22023',null,'SeaPilot excludes an available NWS result at exactly 10m depth');
select throws_ok($$select public.sea_operation_save(null,null,(select payload from copernicus_fixture where kind='ibi-shallow'))$$,
  '22023',null,'the same conservative SeaPilot barrier applies to IBI');
select set_config('request.jwt.claim.sub','a6460000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.sea_operation_save((select id from copernicus_fixture where kind='record'),1,
  (select payload from copernicus_fixture where kind='source'))$$,'42501',null,'a real Marin cannot rewrite another Captain preparation');
reset role;

update public.vessels set draft_m=3.1 where name='SEA-COP-MAIN';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6460000-0000-0000-0000-000000000001',true);
update copernicus_fixture set payload=saved->'draft' from (select public.sea_operation_save((select id from copernicus_fixture where kind='record'),1,
  (select payload from copernicus_fixture where kind='source'))saved)response where kind='record';
select is((select payload#>'{vessel,draftMeters}' from copernicus_fixture where kind='record'),'3.1'::jsonb,'ordinary save refreshes the real reference');
select ok((select not (payload#>'{waypoints,0}' ? 'ukcForecast') and payload#>>'{waypoints,0,ukcMode}'='automatic' from copernicus_fixture where kind='record'),
  'changed canonical draught removes the stale forecast and retains automatic mode');
reset role;

update copernicus_fixture set payload=jsonb_set(jsonb_set(jsonb_set(jsonb_set(payload,
  '{waypoints,0,ukcForecast,draftMeters}','3.1'),'{waypoints,0,ukcForecast,estimate,ukcMeters}','18.4'),
  '{waypoints,0,ukcForecast,estimate,cellVariability,lowerMeters}','17.4'),'{waypoints,0,ukcForecast,estimate,cellVariability,upperMeters}','19.4') where kind='source';
set local role authenticated;
update copernicus_fixture set payload=saved->'draft' from (select public.sea_operation_save((select id from copernicus_fixture where kind='record'),2,
  (select payload from copernicus_fixture where kind='source'))saved)response where kind='record';
reset role;
update public.vessels set draft_m=3.4 where name='SEA-COP-MAIN';
set local role authenticated;
select is(public.sea_operation_sign((select id from copernicus_fixture where kind='record'),3,'COPERNICUS TEST 1',true)#>'{draft,vessel,draftMeters}',
  '3.1'::jsonb,'signing retains the saved draught and compatible forecast instead of silently changing Navires');
reset role;
update copernicus_fixture fixture set exact_row=to_jsonb(operation),payload=operation.draft
from public.sea_operations operation where fixture.kind='record' and fixture.id=operation.id;
update public.vessels set draft_m=4.1 where name='SEA-COP-MAIN';
select is((select to_jsonb(operation) from public.sea_operations operation where id=(select id from copernicus_fixture where kind='record')),
  (select exact_row from copernicus_fixture where kind='record'),'later Navires edits never rewrite a signed forecast');
select throws_ok($$update public.sea_operations set draft=jsonb_set(draft,'{waypoints,0,ukc}','"forged"')
  where id=(select id from copernicus_fixture where kind='record')$$,'55000',null,'signed evidence remains frozen even for a direct administrative write');
set local role authenticated;
select set_config('request.jwt.claim.sub','a6460000-0000-0000-0000-000000000003',true);
insert into copernicus_fixture(kind,id,payload)
select 'revision',(revised->>'id')::uuid,revised->'draft' from (select public.sea_operation_revise((select id from copernicus_fixture where kind='record'),4)revised)response;
select is((select payload#>'{waypoints,0,ukcForecast}' from copernicus_fixture where kind='revision'),
  (select payload#>'{waypoints,0,ukcForecast}' from copernicus_fixture where kind='record'),'the administrative revision first clones historical evidence exactly');
select ok(not ((public.sea_operation_save((select id from copernicus_fixture where kind='revision'),1,
  (select payload from copernicus_fixture where kind='revision'))#>'{draft,waypoints,0}') ? 'ukcForecast'),'the next ordinary revision save clears the now-stale forecast');
reset role;
select is((select to_jsonb(operation) from public.sea_operations operation where id=(select id from copernicus_fixture where kind='record')),
  (select exact_row from copernicus_fixture where kind='record'),'revising and saving the new draft leaves the original signed row intact');

insert into copernicus_fixture(kind,payload)
select 'unavailable',jsonb_set(payload,'{waypoints,0,ukcForecast}',(payload#>'{waypoints,0,ukcForecast}')||jsonb_build_object(
  'draftMeters',4.1,'status','unavailable','message','Synthetic provider unavailable.',
  'source',null,'cell',null,'waterLevel',null,'estimate',null)) from copernicus_fixture where kind='source';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6460000-0000-0000-0000-000000000001',true);
insert into copernicus_fixture(kind,id,payload)
select 'unavailable-record',(saved->>'id')::uuid,saved->'draft' from (select public.sea_operation_save(null,null,
  (select payload from copernicus_fixture where kind='unavailable'))saved)response;
select is((select payload#>>'{waypoints,0,ukcForecast,status}' from copernicus_fixture where kind='unavailable-record'),'unavailable',
  'an unavailable result may be retained in a preparation without manufacturing a value');
select is(public.sea_operation_sign((select id from copernicus_fixture where kind='unavailable-record'),1,'COPERNICUS TEST 1',true)->>'status','signed',
  'NO GO remains signable with unavailable automatic UKC evidence');
insert into copernicus_fixture(kind,id,payload)
select 'manual-record',(saved->>'id')::uuid,saved->'draft' from (select public.sea_operation_save(null,null,
  jsonb_set((select payload from copernicus_fixture where kind='unavailable'),'{waypoints,0,ukcMode}','"manual"'))saved)response;
select is(public.sea_operation_sign((select id from copernicus_fixture where kind='manual-record'),1,'COPERNICUS TEST 1',true)->>'status','signed',
  'the existing explicit manual NO GO workflow remains signable without a provider account');
insert into copernicus_fixture(kind,id,payload)
select 'absent-record',(saved->>'id')::uuid,saved->'draft' from (select public.sea_operation_save(null,null,
  (select payload#-'{waypoints,0,ukcForecast}' from copernicus_fixture where kind='unavailable'))saved)response;
select is(public.sea_operation_sign((select id from copernicus_fixture where kind='absent-record'),1,'COPERNICUS TEST 1',true)->>'status','signed',
  'NO GO remains signable with no automatic UKC evidence');
reset role;

-- Fully complete GO fixture: only automatic UKC availability may block it.
insert into copernicus_fixture(kind,payload)
select 'go',jsonb_set(jsonb_set(payload||jsonb_build_object('decision','GO','client','Synthetic client','clientContact','Synthetic contact',
  'description','Synthetic operation','charts','Synthetic chart','portServices','["none"]'::jsonb,
  'checks',(select jsonb_object_agg(key,'yes') from jsonb_object_keys(payload->'checks')key),
  'dapaq','{"method":"email","preparedBy":"captain","agentName":"","agentContact":""}'::jsonb,
  'vessel',(payload->'vessel')||jsonb_build_object('registrationImo','SYNTHETIC','departurePort','Cherbourg','departureQuay','Test',
    'arrivalPort','Cherbourg','arrivalQuay','Test','etd','2026-10-26T10:00','eta','2026-10-26T13:00')),
  '{waypoints,0,descriptionVhf}','"Synthetic passage"'),'{waypoints,0,ukc}','""')
from copernicus_fixture where kind='unavailable';
set local role authenticated;
select lives_ok($$select sea_operation_private.validate_draft((select payload from copernicus_fixture where kind='go'),true)$$,
  'the complete GO fixture passes all existing business requirements with a separate automatic UKC field');
select throws_ok($$select sea_operation_private.validate_draft(jsonb_set((select payload from copernicus_fixture where kind='go'),
  '{waypoints,0,ukcMode}','"manual"'),true)$$,'22023','Complétez chaque point du passage plan.','manual GO still requires its original UKC field');
insert into copernicus_fixture(kind,id,payload)
select 'go-record',(saved->>'id')::uuid,saved->'draft' from (select public.sea_operation_save(null,null,
  (select payload from copernicus_fixture where kind='go'))saved)response;
select throws_ok($$select public.sea_operation_sign((select id from copernicus_fixture where kind='go-record'),1,'COPERNICUS TEST 1',true)$$,
  '22023','Recalculez l’UKC automatique avant de signer.','GO with unavailable automatic UKC is rejected by the dedicated guard');
reset role;
update copernicus_fixture set payload=jsonb_set(payload,'{waypoints,0,ukcForecast}',
  (select payload from copernicus_fixture where kind='capture')||jsonb_build_object('draftMeters',4.1,
    'estimate',(select payload->'estimate' from copernicus_fixture where kind='capture')||jsonb_build_object(
      'ukcMeters',17.4,'cellVariability',jsonb_build_object('lowerMeters',16.4,'upperMeters',18.4)))) where kind='go';
set local role authenticated;
update copernicus_fixture set payload=saved->'draft' from (select public.sea_operation_save((select id from copernicus_fixture where kind='go-record'),1,
  (select payload from copernicus_fixture where kind='go'))saved)response where kind='go-record';
select is(public.sea_operation_sign((select id from copernicus_fixture where kind='go-record'),2,'COPERNICUS TEST 1',true)->>'status','signed',
  'GO may be signed with validated available evidence while the manual UKC field stays empty');
reset role;

select * from finish(true);
rollback;
