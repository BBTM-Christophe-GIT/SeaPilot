begin;
select no_plan();
select col_type_is('public','vessels','weather_matrix','jsonb','vessel matrices use JSONB');
select col_is_null('public','vessels','weather_matrix','unknown vessel limits remain nullable');
select col_hasnt_default('public','vessels','weather_matrix','no matrix is invented for another vessel');
select ok((select relrowsecurity from pg_class where oid = 'public.vessels'::regclass),'vessel RLS remains enabled');
select has_trigger('public','sea_operations','sea_operations_weather_matrix','draft saves capture canonical vessel limits');
select ok(not has_function_privilege('anon','sea_operation_private.valid_weather_matrix(jsonb)','EXECUTE'),'anonymous users cannot invoke the private validator');
select ok(not has_function_privilege('authenticated','sea_operation_private.capture_vessel_weather_matrix()','EXECUTE'),'capture trigger is not a new user RPC');

insert into public.companies(code,name) values ('matrix-test-foreign','Matrix foreign company');
insert into auth.users(id,email)
select ('a6380000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'matrix-test-'||n||'@example.invalid' from generate_series(1,6) n;
insert into public.profiles(id,email,display_name,active_company_id)
select actor.id,actor.email,'Matrix Test '||right(actor.id::text,1),company.id from auth.users actor join public.companies company
on company.code = case when right(actor.id::text,1) = '6' then 'matrix-test-foreign' else 'bbtm' end where actor.id::text like 'a6380000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like 'a6380000-%' on conflict(company_id,user_id) do update set active = true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '6' then 'admin' else (array['admin','direction','armement','capitaine','marin'])[right(id::text,1)::integer] end
from public.profiles where id::text like 'a6380000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,active)
select active_company_id,id,'Matrix','Test '||right(id::text,1),case when right(id::text,1) = '4' then 'Capitaine' else 'Matelot' end,true
from public.profiles where id::text like 'a6380000-%';

create temporary table matrix_fixture(kind text primary key,payload jsonb);
grant all on matrix_fixture to authenticated;
insert into matrix_fixture values ('matrix','{"version":1,"hsLowerBoundsMeters":[0,0.5,1,1.5,2,2.5,3],"hsUpperBoundMeters":3.5,"periodLowerBoundsSeconds":[0,5,7,9,11,13],"levels":[["comfortable","comfortable","uncomfortable","tiring","unlivable","unlivable","unlivable"],["comfortable","comfortable","uncomfortable","tiring","twelve_hours","unlivable","unlivable"],["comfortable","comfortable","uncomfortable","tiring","twelve_hours","unlivable","unlivable"],["comfortable","comfortable","comfortable","uncomfortable","twelve_hours","unlivable","unlivable"],["comfortable","comfortable","comfortable","uncomfortable","tiring","twelve_hours","unlivable"],["comfortable","comfortable","comfortable","comfortable","uncomfortable","tiring","twelve_hours"]]}');
insert into public.vessels(company_id,name,active,asset_kind,weather_matrix)
select id,'MATRIX-TEST-CONFIGURED',true,'vessel',(select payload from matrix_fixture where kind = 'matrix') from public.companies where code = 'bbtm';
insert into public.vessels(company_id,name,active,asset_kind) select id,'MATRIX-TEST-UNKNOWN',true,'vessel' from public.companies where code = 'bbtm';
insert into public.vessels(company_id,name,active,asset_kind) select id,'MATRIX-TEST-INACTIVE',false,'vessel' from public.companies where code = 'bbtm';
insert into public.vessels(company_id,name,active,asset_kind) select id,'MATRIX-TEST-OFFICE',true,'office' from public.companies where code = 'bbtm';
insert into public.vessels(company_id,name,active,asset_kind,weather_matrix)
select id,'MATRIX-TEST-FOREIGN',true,'vessel',(select payload from matrix_fixture where kind = 'matrix') from public.companies where code = 'matrix-test-foreign';
insert into matrix_fixture values ('foreign-vessel',to_jsonb((select id from public.vessels where name = 'MATRIX-TEST-FOREIGN')));
insert into public.planning_projects(company_id,title,primary_vessel_id,starts_on,ends_on)
select company_id,'MATRIX-TEST-MISSION',id,(now() at time zone 'Europe/Paris')::date,(now() at time zone 'Europe/Paris')::date+1
from public.vessels where name = 'MATRIX-TEST-CONFIGURED';
insert into public.planning_assignments(company_id,vessel_id,crew_person_id,captain_person_id,starts_on,ends_on,assignment_role,confirmation_status)
select person.company_id,vessel.id,person.id,person.id,(now() at time zone 'Europe/Paris')::date,(now() at time zone 'Europe/Paris')::date+1,
  case right(person.user_id::text,1) when '4' then 'Capitaine' else 'Matelot' end,'confirmed'
from public.people person join public.vessels vessel on vessel.company_id = person.company_id and vessel.name = 'MATRIX-TEST-CONFIGURED'
where person.user_id in ('a6380000-0000-0000-0000-000000000004','a6380000-0000-0000-0000-000000000005');
insert into public.planning_days(company_id,person_id,vessel_id,work_date,function_label,slot365,source_label)
select assignment.company_id,assignment.crew_person_id,assignment.vessel_id,(now() at time zone 'Europe/Paris')::date,
  case right(person.user_id::text,1) when '5' then 'Capitaine' else 'Matelot' end,'assignment:'||assignment.id,'seapilot-assignment-note'
from public.planning_assignments assignment join public.people person on person.id = assignment.crew_person_id where person.user_id::text like 'a6380000-%';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,created_by)
select company_id,id,1,'working-time-signatures','matrix-test/captain.png','image/png',5,repeat('c',64),user_id
from public.people where user_id = 'a6380000-0000-0000-0000-000000000005';

insert into matrix_fixture(kind,payload)
select 'draft',jsonb_build_object('version',1,'project','Matrix test operation','client','','clientContact','','description','Manual mission stays intact',
  'specialPersonnel','[]'::jsonb,'dapaq','{"method":"","preparedBy":"","agentName":"","agentContact":""}'::jsonb,
  'vessel',jsonb_build_object('id',id::text,'name',name,'registrationImo','','captainName','Matrix Test 5','departurePort','','departureQuay','','arrivalPort','','arrivalQuay','','etd','','eta',''),
  'applicability','{"towing":"no","cargo":"no","divingSupport":"no","supplies":"no"}'::jsonb,
  'checks',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures','towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned','standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']) key),
  'justifications',(select jsonb_object_agg(key,'') from unnest(array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures','towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned','standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']) key),
  'towedVesselBoarding','{"required":"","measures":"","details":""}'::jsonb,'portServices','[]'::jsonb,'mandatoryServicesNotified',false,
  'supplies','{"delegated":"","shipchandlerName":"","shipchandlerContact":"","items":[],"suppliers":"","customerAccountsPrepared":false}'::jsonb,
  'charts','','waypoints','[]'::jsonb,'decision','NO_GO','risks','Preparation suspended; captain decision explicit.',
  'signature',jsonb_build_object('captainName','Matrix Test 5','date',(now() at time zone 'Europe/Paris')::date,'place','Cherbourg','acknowledged',true))
from public.vessels where name = 'MATRIX-TEST-CONFIGURED';

set local role authenticated;
select lives_ok(format($$select set_config('request.jwt.claim.sub',%L,true); insert into matrix_fixture(kind,payload) values (%L,public.sea_operation_save(null,null,(select payload from matrix_fixture where kind = 'draft')))$$,
  'a6380000-0000-0000-0000-'||lpad(n::text,12,'0'),'saved-'||n),'real profile '||n||' can prepare the existing operation workflow') from generate_series(1,5) n;
select is(payload #> '{draft,vessel,weatherMatrix}',(select payload from matrix_fixture where kind = 'matrix'),'server captures canonical vessel matrix for '||kind)
from matrix_fixture where kind like 'saved-%';
select is((public.sea_operation_save(null,null,jsonb_set((select payload from matrix_fixture where kind = 'draft'),'{vessel,weatherMatrix}',
  jsonb_set((select payload from matrix_fixture where kind = 'matrix'),'{levels,0,6}','"comfortable"')))) #> '{draft,vessel,weatherMatrix}',
  (select payload from matrix_fixture where kind = 'matrix'),'real temporary Marin captain cannot forge a more comfortable matrix');
select is((public.sea_operation_save(null,null,jsonb_set((select payload from matrix_fixture where kind = 'draft'),'{vessel,id}',to_jsonb((select id::text from public.vessels where name = 'MATRIX-TEST-UNKNOWN'))))) #> '{draft,vessel,weatherMatrix}',
  'null'::jsonb,'a vessel without a matrix stores explicit null instead of a fleet default');
select is((public.sea_operation_save(null,null,jsonb_set((select payload from matrix_fixture where kind = 'draft'),'{vessel,id}','""'))) #> '{draft,vessel,weatherMatrix}',
  null::jsonb,'an unselected vessel does not capture any matrix');
select is((select payload #>> '{draft,decision}' from matrix_fixture where kind = 'saved-5'),'NO_GO','matrix capture never replaces the explicit captain decision');
select is((select payload #>> '{draft,description}' from matrix_fixture where kind = 'saved-5'),'Manual mission stays intact','capture preserves the remaining draft fields');
select is((select vessel->'weather_matrix' from jsonb_array_elements(public.sea_operations_overview()->'vessels') vessel where vessel->>'name' = 'MATRIX-TEST-CONFIGURED'),
  (select payload from matrix_fixture where kind = 'matrix'),'real Marin overview reads the canonical configuration');
select is((select choice #> '{vessel,weatherMatrix}' from jsonb_array_elements(public.sea_operation_planning_context((now() at time zone 'Europe/Paris')::date)->'choices') choice where choice->>'project' = 'MATRIX-TEST-MISSION'),
  (select payload from matrix_fixture where kind = 'matrix'),'planning returns the matrix for the exact chosen vessel');
select is((select (choice->>'canSign')::boolean from jsonb_array_elements(public.sea_operation_planning_context((now() at time zone 'Europe/Paris')::date)->'choices') choice where choice->>'project' = 'MATRIX-TEST-MISSION'),
  true,'real Marin temporarily assigned Captain retains existing sign rights');
select is((select count(*)::integer from jsonb_array_elements(public.sea_operations_overview()->'vessels') vessel where vessel->>'name' in ('MATRIX-TEST-FOREIGN','MATRIX-TEST-INACTIVE','MATRIX-TEST-OFFICE')),0,'overview keeps company, active and vessel-kind boundaries');
select throws_ok($$select public.sea_operation_save(null,null,jsonb_set((select payload from matrix_fixture where kind = 'draft'),'{vessel,id}',to_jsonb((select payload #>> '{}' from matrix_fixture where kind = 'foreign-vessel'))))$$,
  '42501',null,'another company vessel cannot supply a matrix to this operation');

select throws_ok(format($$select public.sea_operation_save(null,null,jsonb_set((select payload from matrix_fixture where kind = 'draft'),'{vessel,weatherMatrix}',%L::jsonb))$$,invalid),
  '22023',null,'malformed supplied capture is rejected: '||label)
from (values ('false','boolean'),('[]','array'),('{"version":1}','missing dimensions')) bad(invalid,label);
select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000001',true);
select is((select weather_matrix from public.vessels where name = 'MATRIX-TEST-CONFIGURED'),(select payload from matrix_fixture where kind = 'matrix'),'real Admin reads vessel limits');
select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000002',true);
select is((select weather_matrix from public.vessels where name = 'MATRIX-TEST-CONFIGURED'),(select payload from matrix_fixture where kind = 'matrix'),'real Direction reads vessel limits');
select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000003',true);
select is((select weather_matrix from public.vessels where name = 'MATRIX-TEST-CONFIGURED'),(select payload from matrix_fixture where kind = 'matrix'),'real Armement reads vessel limits');
select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000004',true);
select is((select weather_matrix from public.vessels where name = 'MATRIX-TEST-CONFIGURED'),(select payload from matrix_fixture where kind = 'matrix'),'real Capitaine reads vessel limits');
select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000005',true);
select is((select weather_matrix from public.vessels where name = 'MATRIX-TEST-CONFIGURED'),(select payload from matrix_fixture where kind = 'matrix'),'real Marin reads vessel limits');
select is((select count(*)::integer from public.vessels where name = 'MATRIX-TEST-FOREIGN'),0,'another company configuration stays inaccessible');

select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000004',true);
select is((public.sea_operation_detail(((select payload from matrix_fixture where kind = 'saved-5')->>'id')::uuid)->>'can_sign')::boolean,false,'an HR Captain downgraded to Matelot cannot sign this vessel');
select throws_ok($$select public.sea_operation_sign(((select payload from matrix_fixture where kind = 'saved-5')->>'id')::uuid,1,'Matrix Test 5',true)$$,
  '42501',null,'new metadata does not bypass the actual daily Captain assignment');
select is((select weather_matrix from public.vessels where name = 'MATRIX-TEST-CONFIGURED'),(select payload from matrix_fixture where kind = 'matrix'),'real Capitaine reads existing vessel limits');
with changed as (update public.vessels set weather_matrix = null where name = 'MATRIX-TEST-CONFIGURED' returning id)
select is((select count(*)::integer from changed),0,'real Capitaine cannot edit vessel characteristics');
select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000002',true);
with changed as (update public.vessels set weather_matrix = null where name = 'MATRIX-TEST-CONFIGURED' returning id)
select is((select count(*)::integer from changed),0,'Direction vessel rights stay read only');
select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000003',true);
with changed as (update public.vessels set weather_matrix = null where name = 'MATRIX-TEST-CONFIGURED' returning id)
select is((select count(*)::integer from changed),0,'Armement vessel rights stay read only');

select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000001',true);
select throws_ok(format($$update public.vessels set weather_matrix = jsonb_set((select payload from matrix_fixture where kind = 'matrix'),%L::text[],%L::jsonb) where name = 'MATRIX-TEST-CONFIGURED'$$,path,value),
  '23514',null,'canonical matrices reject malformed input: '||label)
from (values ('{version}','2','version'),('{version}','"1"','string version'),('{hsLowerBoundsMeters}','[0,1]','wrong Hs dimensions'),
  ('{hsLowerBoundsMeters}','[0,0.5,1,1,2,2.5,3]','repeated Hs lower bound'),('{hsLowerBoundsMeters,0}','0.1','nonzero first Hs bound'),
  ('{hsLowerBoundsMeters,2}','"1"','string Hs bound'),('{hsLowerBoundsMeters,6}','1e400','nonfinite Hs bound'),
  ('{hsLowerBoundsMeters}','[0,0.5,0.50000000000000000001,1.5,2,2.5,3]','Hs bounds collapse at browser precision'),
  ('{hsUpperBoundMeters}','3','upper bound equal to last lower bound'),('{hsUpperBoundMeters}','50.1','upper bound beyond supported metres'),
  ('{hsUpperBoundMeters}','3.00000000000000000001','Hs upper bound collapses at browser precision'),
  ('{periodLowerBoundsSeconds}','[0,5,7]','wrong period dimensions'),('{periodLowerBoundsSeconds,0}','1','nonzero first period'),
  ('{periodLowerBoundsSeconds,5}','121','period lower bound beyond120'),('{periodLowerBoundsSeconds,3}','6','unordered periods'),
  ('{levels}','[]','wrong row count'),('{levels,0}','[]','wrong column count'),('{levels,0,0}','true','boolean cell'),
  ('{levels,0,0}','"safe"','unknown state code')) invalid(path,value,label);
select throws_ok($$update public.vessels set weather_matrix = 'null'::jsonb where name = 'MATRIX-TEST-CONFIGURED'$$,'23514',null,'JSON null is not a vessel matrix; SQL NULL means unknown');
select throws_ok($$update public.vessels set weather_matrix = (select payload from matrix_fixture where kind = 'matrix') || jsonb_build_object('oversized',repeat('x',32769)) where name = 'MATRIX-TEST-CONFIGURED'$$,
  '23514',null,'matrix storage is bounded at32KiB');
select lives_ok($$update public.vessels set weather_matrix = jsonb_set((select payload from matrix_fixture where kind = 'matrix'),'{levels,0,0}','null') where name = 'MATRIX-TEST-CONFIGURED'$$,'null cells explicitly represent undefined conditions');
select lives_ok($$update public.vessels set weather_matrix = null where name = 'MATRIX-TEST-UNKNOWN'$$,'administrator can clear a configuration explicitly');
with changed as (update public.vessels set weather_matrix = null where name = 'MATRIX-TEST-FOREIGN' returning id)
select is((select count(*)::integer from changed),0,'administrator cannot overwrite a foreign company configuration');

select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000005',true);
select lives_ok($$select public.sea_operation_sign(((select payload from matrix_fixture where kind = 'saved-5')->>'id')::uuid,1,'Matrix Test 5',true)$$,'real temporary Captain signs the saved revision after vessel configuration changed');
select is(public.sea_operation_detail(((select payload from matrix_fixture where kind = 'saved-5')->>'id')::uuid) #> '{draft,vessel,weatherMatrix}',
  (select payload from matrix_fixture where kind = 'matrix'),'signature freezes the saved matrix instead of substituting the newer Navire configuration');
select lives_ok($$select public.sea_operation_save(((select payload from matrix_fixture where kind = 'saved-1')->>'id')::uuid,1,(select payload from matrix_fixture where kind = 'draft'))$$,'actual assigned Captain may update another preparation with unchanged existing rights');
select is(public.sea_operation_detail(((select payload from matrix_fixture where kind = 'saved-1')->>'id')::uuid) #> '{draft,vessel,weatherMatrix}',
  jsonb_set((select payload from matrix_fixture where kind = 'matrix'),'{levels,0,0}','null'),'a subsequent draft save captures the new canonical configuration');
select throws_ok($$select public.sea_operation_save(((select payload from matrix_fixture where kind = 'saved-5')->>'id')::uuid,2,(select payload from matrix_fixture where kind = 'draft'))$$,
  '42501',null,'signed snapshots remain uneditable through the existing RPC');

reset role;
select throws_ok($$update public.sea_operations set draft = draft #- '{vessel,weatherMatrix}' where id = ((select payload from matrix_fixture where kind = 'saved-5')->>'id')::uuid$$,
  '55000','Une opération signée est conservée sans modification.','signed immutability still runs before the matrix trigger');
insert into public.sea_operations(company_id,vessel_id,draft,status,created_by,created_by_name,updated_by,updated_by_name,signed_by,signed_by_name,signed_at,captain_name)
select company_id,vessel_id,draft #- '{vessel,weatherMatrix}','signed',created_by,created_by_name,updated_by,updated_by_name,signed_by,signed_by_name,signed_at,captain_name
from public.sea_operations where id = ((select payload from matrix_fixture where kind = 'saved-5')->>'id')::uuid;
select ok(exists(select 1 from public.sea_operations where draft->>'project' = 'Matrix test operation' and status = 'signed' and not (draft->'vessel' ? 'weatherMatrix')),'historical signed payloads without a matrix remain valid and are not rewritten');
update public.company_memberships set active = false where user_id = 'a6380000-0000-0000-0000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub','a6380000-0000-0000-0000-000000000005',true);
select throws_ok($$select public.sea_operations_overview()$$,'42501',null,'inactive membership cannot read the new metadata');
reset role;
set local role anon;
select throws_ok($$select public.sea_operations_overview()$$,'42501',null,'anonymous users cannot read the vessel metadata');
select * from finish();
rollback;
