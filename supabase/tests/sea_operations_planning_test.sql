begin;
select no_plan();
insert into public.companies(code,name) values('sea-plan-other','Sea Planning isolation');
insert into auth.users(id,email) select ('a6310000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'sea-plan-'||n||'@example.invalid' from generate_series(1,4)n;
insert into public.profiles(id,email,display_name,active_company_id)
select fixture.id,fixture.email,'Sea Planning fixture',company.id from auth.users fixture join public.companies company
on company.code = case when right(fixture.id::text,1)='4' then 'sea-plan-other' else 'bbtm' end where fixture.id::text like 'a6310000-%';
insert into public.company_memberships(company_id,user_id,active) select active_company_id,id,true from public.profiles where id::text like 'a6310000-%' on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '1' then 'armement' when '2' then 'marin' when '3' then 'capitaine' else 'admin' end from public.profiles where id::text like 'a6310000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,grade_label,active)
select active_company_id,id,case right(id::text,1) when '2' then 'Alice' when '3' then 'Bob' else 'Manager' end,
case right(id::text,1) when '2' then 'Temporaire' when '3' then 'Permanent' else 'Test' end,
case right(id::text,1) when '3' then 'Capitaine' else 'Matelot' end,'Capitaine 200',true
from public.profiles where id::text like 'a6310000-%';
insert into public.vessels(company_id,name,registration_number,imo_number,active,asset_kind)
select id,'SEA-PLAN-'||n,'REG'||n,'IMO'||n,true,'vessel' from public.companies cross join generate_series(1,2)n where code='bbtm';
insert into public.clients(company_id,name,email,phone,contact_name,address,postal_code,city,country)
select id,'SEA-CLIENT-'||n,'contact'||n||'@example.invalid','0'||n,'Agent '||n,'Quai '||n,'76000','Le Havre','France'
from public.companies cross join generate_series(1,2)n where code='bbtm';
insert into public.projects(company_id,title,project_code,client_id,delivery_port,redelivery_port,description)
select client.company_id,'SEA-PROJECT-'||n,'SP'||n,client.id,'Départ '||n,'Arrivée '||n,'Description catalogue '||n
from public.clients client cross join generate_series(1,2)n where client.name='SEA-CLIENT-'||n;
insert into public.planning_projects(company_id,title,catalog_project_id,primary_vessel_id,starts_on,ends_on,description)
select project.company_id,'SEA-OCCURRENCE-'||n,project.id,vessel.id,(now() at time zone 'Europe/Paris')::date,(now() at time zone 'Europe/Paris')::date+1,'Mission planning '||n
from public.projects project cross join generate_series(1,2)n join public.vessels vessel on vessel.name='SEA-PLAN-'||n where project.title='SEA-PROJECT-'||n;
insert into public.planning_assignments(company_id,vessel_id,crew_person_id,captain_person_id,starts_on,ends_on,assignment_role,confirmation_status)
select person.company_id,vessel.id,person.id,person.id,(now() at time zone 'Europe/Paris')::date,(now() at time zone 'Europe/Paris')::date+1,
case right(person.user_id::text,1) when '2' then 'Matelot' else 'Capitaine' end,'confirmed'
from public.people person join public.vessels vessel on vessel.name = case right(person.user_id::text,1) when '2' then 'SEA-PLAN-1' else 'SEA-PLAN-2' end
where person.user_id in('a6310000-0000-0000-0000-000000000002','a6310000-0000-0000-0000-000000000003');
insert into public.planning_days(company_id,person_id,vessel_id,work_date,function_label,slot365,source_label)
select assignment.company_id,assignment.crew_person_id,assignment.vessel_id,(now() at time zone 'Europe/Paris')::date,
case right(person.user_id::text,1) when '2' then 'Capitaine' else 'Matelot' end,'assignment:'||assignment.id,'seapilot-assignment-note'
from public.planning_assignments assignment join public.people person on person.id=assignment.crew_person_id where person.user_id::text like 'a6310000-%';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,id,1,'working-time-signatures','sea-plan/captain-'||right(user_id::text,1)||'-v1.png','image/png',5,repeat('a',64),user_id
from public.people where user_id in('a6310000-0000-0000-0000-000000000002','a6310000-0000-0000-0000-000000000003');
insert into storage.objects(bucket_id,name) values('working-time-signatures','sea-plan/captain-2-v1.png'),('working-time-signatures','sea-plan/captain-3-v1.png');

create temporary table sea_plan_fixture(kind text primary key,payload jsonb,id uuid);
grant all on sea_plan_fixture to authenticated;
insert into sea_plan_fixture(kind,payload)
select 'draft',jsonb_build_object('version',1,'project','spoof','client','spoof','clientContact','','description','','specialPersonnel','[]'::jsonb,
'dapaq','{"method":"","preparedBy":"","agentName":"","agentContact":""}'::jsonb,
'vessel',jsonb_build_object('id',(select id::text from public.vessels where name='SEA-PLAN-1'),'name','spoof','registrationImo','spoof','captainName','spoof','departurePort','','departureQuay','Quai saisi','arrivalPort','','arrivalQuay','Quai arrivée','etd','','eta',''),
'applicability','{"towing":"","cargo":"","divingSupport":"","supplies":""}'::jsonb,
'checks',(select jsonb_object_agg(check_id,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures','towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned','standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])check_id),
'justifications',(select jsonb_object_agg(check_id,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures','towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned','standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'])check_id),
'towedVesselBoarding','{"required":"","measures":"","details":""}'::jsonb,'portServices','[]'::jsonb,'mandatoryServicesNotified',false,
'supplies','{"delegated":"","shipchandlerName":"","shipchandlerContact":"","items":[],"suppliers":"","customerAccountsPrepared":false}'::jsonb,
'charts','','waypoints','[]'::jsonb,'decision','NO_GO','risks','Opération interrompue, Armement informé',
'signature',jsonb_build_object('captainName','spoof','date',(now() at time zone 'Europe/Paris')::date,'place','Le Havre','acknowledged',true),
'planning',jsonb_build_object('date',(now() at time zone 'Europe/Paris')::date,'operationId',occurrence.id::text||':'||occurrence.primary_vessel_id::text,'projectId',occurrence.catalog_project_id::text,
'captainPersonId',(select id::text from public.people where user_id='a6310000-0000-0000-0000-000000000002')))
from public.planning_projects occurrence where occurrence.title='SEA-OCCURRENCE-1';

set local role authenticated;
select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000001',true);
insert into sea_plan_fixture(kind,payload) values('context',public.sea_operation_planning_context((now() at time zone 'Europe/Paris')::date));
select is((select count(*)::integer from sea_plan_fixture f cross join lateral jsonb_array_elements(f.payload->'choices') choice where f.kind='context' and choice->>'project' like '%SEA-PROJECT-%'),2,'same-day projects remain two explicit choices');
select is((select choice->>'client' from sea_plan_fixture f cross join lateral jsonb_array_elements(f.payload->'choices') choice where f.kind='context' and choice->>'projectId'=(select payload#>>'{planning,projectId}' from sea_plan_fixture where kind='draft')),'SEA-CLIENT-1','project context has its own client');
select ok((select choice->>'clientContact' from sea_plan_fixture f cross join lateral jsonb_array_elements(f.payload->'choices') choice where f.kind='context' and choice->>'project' like '%SEA-PROJECT-1') like '%contact1@example.invalid%','only the selected client operational contact is projected');
select is((select choice#>>'{captains,0,name}' from sea_plan_fixture f cross join lateral jsonb_array_elements(f.payload->'choices') choice where f.kind='context' and choice->>'project' like '%SEA-PROJECT-1'),'Alice TEMPORAIRE','the temporary Planning captain is returned with first name and uppercase surname');
select is((select jsonb_array_length(choice->'captains') from sea_plan_fixture f cross join lateral jsonb_array_elements(f.payload->'choices') choice where f.kind='context' and choice->>'project' like '%SEA-PROJECT-2'),0,'an explicit daily Matelot function overrides permanent Captain HR and assignment roles');
select lives_ok($$insert into sea_plan_fixture(kind,id)select 'record',(public.sea_operation_save(null,null,(select payload from sea_plan_fixture where kind='draft'))->>'id')::uuid$$,'management prepares a linked operation');
select is((select draft->>'project' from public.sea_operations where id=(select id from sea_plan_fixture where kind='record')),(select choice->>'project' from sea_plan_fixture f cross join lateral jsonb_array_elements(f.payload->'choices') choice where f.kind='context' and choice->>'project' like '%SEA-PROJECT-1'),'server normalizes the selected project instead of retaining a spoofed title');
select is((select draft#>>'{vessel,captainName}' from public.sea_operations where id=(select id from sea_plan_fixture where kind='record')),'Alice TEMPORAIRE','server identifies the effective captain');
select is((select draft#>>'{vessel,departureQuay}' from public.sea_operations where id=(select id from sea_plan_fixture where kind='record')),'Quai saisi','missing source values can be completed by the preparer');
select is((select draft#>>'{vessel,departurePort}' from public.sea_operations where id=(select id from sea_plan_fixture where kind='record')),'','the preparer may clear the source departure port while editing operational details');
select is((select draft#>>'{vessel,etd}' from public.sea_operations where id=(select id from sea_plan_fixture where kind='record')),'','the absence of a planned time never invents midnight');
select is((select signature_snapshot->>'storage_path' from public.sea_operations where id=(select id from sea_plan_fixture where kind='record')),'sea-plan/captain-2-v1.png','the draft obtains a server-selected RH signature snapshot');
insert into sea_plan_fixture(kind,id)
select 'future',(public.sea_operation_save(null,null,
  jsonb_set(jsonb_set((select payload from sea_plan_fixture where kind='draft'),'{planning}',
    jsonb_build_object('date',(now() at time zone 'Europe/Paris')::date+1,'operationId',choice->>'operationId','projectId',choice->>'projectId',
      'captainPersonId',(select id::text from public.people where user_id='a6310000-0000-0000-0000-000000000003'))),'{vessel,id}',choice#>'{vessel,id}'))->>'id')::uuid
from sea_plan_fixture f cross join lateral jsonb_array_elements(f.payload->'choices') choice where f.kind='context' and choice->>'project' like '%SEA-PROJECT-2';

select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000002',true);
select is((public.sea_operation_detail((select id from sea_plan_fixture where kind='record'))->>'can_sign')::boolean,true,'a real Marin with temporary captain duty can sign the chosen operation');
select is((select jsonb_array_length(choice->'captains') from jsonb_array_elements(public.sea_operation_planning_context((now() at time zone 'Europe/Paris')::date+1)->'choices') choice where choice->>'project' like '%SEA-PROJECT-1'),0,'temporary captain duty expires on the exact next day');
select lives_ok($$select public.sea_operation_captain_signature((now() at time zone 'Europe/Paris')::date,(select payload#>>'{planning,operationId}' from sea_plan_fixture where kind='draft'),(select payload#>>'{planning,captainPersonId}' from sea_plan_fixture where kind='draft'))$$,'a validated selected captain signature receives narrow preview access');
select is(sea_operation_private.can_read_signature('working-time-signatures','sea-plan/captain-2-v1.png'),true,'the validated signature image is readable');
select throws_ok($$select public.sea_operation_captain_signature((now() at time zone 'Europe/Paris')::date,(select payload#>>'{planning,operationId}' from sea_plan_fixture where kind='draft'),'99999999')$$,'42501',null,'arbitrary person signature IDs are refused');
select lives_ok($$select public.sea_operation_sign((select id from sea_plan_fixture where kind='record'),1,'Alice TEMPORAIRE',true)$$,'temporary captain signs using their real active RH image');
select is((select signed_by::text from public.sea_operations where id=(select id from sea_plan_fixture where kind='record')),'a6310000-0000-0000-0000-000000000002','actual authenticated temporary captain identity is frozen');
select is((select signature_snapshot->>'signature_id' from public.sea_operations where id=(select id from sea_plan_fixture where kind='record')),
  (select id::text from public.working_time_profile_signatures where storage_path='sea-plan/captain-2-v1.png'),'the exact RH signature version is frozen');

select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000003',true);
select is((public.sea_operation_detail((select id from sea_plan_fixture where kind='record'))->>'can_sign')::boolean,false,'a real Captain profile cannot substitute for another effective captain');
select is((select jsonb_array_length(choice->'captains') from jsonb_array_elements(public.sea_operation_planning_context((now() at time zone 'Europe/Paris')::date+1)->'choices') choice where choice->>'project' like '%SEA-PROJECT-2'),1,'the next day restores the assignment function after the daily override');
select is((public.sea_operation_detail((select id from sea_plan_fixture where kind='future'))->>'can_edit')::boolean,true,'tomorrow effective captain can edit a prepared operation despite being Matelot today');
select lives_ok($$select public.sea_operation_save((select id from sea_plan_fixture where kind='future'),1,
  (public.sea_operation_detail((select id from sea_plan_fixture where kind='future'))->'draft'))$$,'future captain save uses the same mission date as its edit permission');
select lives_ok($$select public.sea_operation_sign((select id from sea_plan_fixture where kind='future'),2,'Bob PERMANENT',true)$$,
  'signing a future preparation uses confirmed duties for the selected mission day');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from sea_plan_fixture where kind='draft'),'{planning,captainPersonId}',to_jsonb(public.current_person_id()::text)))$$,'42501',null,'an unrelated permanent captain cannot be injected into the linked draft');

reset role;
update public.working_time_profile_signatures set valid_to=now(),revoked_by='a6310000-0000-0000-0000-000000000002',revocation_reason='Fixture renewal' where storage_path='sea-plan/captain-2-v1.png';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,person_id,2,storage_bucket,'sea-plan/captain-2-v2.png',mime_type,file_size_bytes,repeat('b',64),created_by from public.working_time_profile_signatures where storage_path='sea-plan/captain-2-v1.png';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000002',true);
select is((select signature_snapshot->>'storage_path' from public.sea_operations where id=(select id from sea_plan_fixture where kind='record')),'sea-plan/captain-2-v1.png','renewing the HR signature never changes the signed operation');
select is(sea_operation_private.can_read_signature('working-time-signatures','sea-plan/captain-2-v1.png'),true,'historical signature remains readable after renewal');
reset role;
update public.working_time_profile_signatures set valid_to=now(),revoked_by='a6310000-0000-0000-0000-000000000002',revocation_reason='Fixture removal' where storage_path='sea-plan/captain-2-v2.png';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000002',true);
select is(public.sea_operation_captain_signature((now() at time zone 'Europe/Paris')::date,(select payload#>>'{planning,operationId}' from sea_plan_fixture where kind='draft'),(select payload#>>'{planning,captainPersonId}' from sea_plan_fixture where kind='draft')),null::jsonb,'the absence of an active RH signature is explicit');
insert into sea_plan_fixture(kind,id)select 'unsigned',(public.sea_operation_save(null,null,(select payload from sea_plan_fixture where kind='draft'))->>'id')::uuid;
select throws_ok($$select public.sea_operation_sign((select id from sea_plan_fixture where kind='unsigned'),1,'Alice TEMPORAIRE',true)$$,'22023',null,'a real temporary captain cannot sign without an active RH image');
reset role;
update public.planning_projects set cancelled_at=now() where title='SEA-OCCURRENCE-1';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000002',true);
select throws_ok($$select public.sea_operation_sign((select id from sea_plan_fixture where kind='unsigned'),1,'Alice TEMPORAIRE',true)$$,'42501',null,'a cancelled Planning operation cannot be signed from an old preparation');
select set_config('request.jwt.claim.sub','a6310000-0000-0000-0000-000000000004',true);
select is(jsonb_array_length(public.sea_operation_planning_context((now() at time zone 'Europe/Paris')::date)->'choices'),0,'another company receives no linked project or captain');
select is(sea_operation_private.can_read_signature('working-time-signatures','sea-plan/captain-2-v1.png'),false,'foreign company cannot read the RH snapshot');
select throws_ok($$select public.sea_operation_captain_signature((now() at time zone 'Europe/Paris')::date,(select payload#>>'{planning,operationId}' from sea_plan_fixture where kind='draft'),(select payload#>>'{planning,captainPersonId}' from sea_plan_fixture where kind='draft'))$$,'42501',null,'foreign operation IDs cannot issue signature grants');
select * from finish();
rollback;
