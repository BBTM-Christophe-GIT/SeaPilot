-- Synthetic LOCAL regression. Real JWT/session roles; all fixtures roll back.
begin;
select no_plan();
select has_column('public','working_time_day_approvals','compliance_analysis_snapshot','new day decisions retain their coverage basis');
select has_column('public','working_time_day_approval_events','compliance_analysis_snapshot','new audit events retain their coverage basis');
select has_column('public','working_time_validations','compliance_analysis_snapshot','new register signatures retain their coverage basis');
select ok(not (select prosecdef from pg_proc where oid='public.working_time_coverage_alerts(date,date,bigint[])'::regprocedure),'the Home batch RPC uses the caller RLS');
select ok(not has_function_privilege('authenticated','private.working_time_register_assignment_analysis(bigint)','EXECUTE'),'callers cannot invoke unrestricted register coverage');

insert into public.companies(code,name) values('wt-coverage-workflow','Synthetic coverage workflow'),('wt-coverage-foreign','Synthetic foreign coverage');
insert into auth.users(id,email)
select ('99615000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'coverage-workflow-'||n||'@example.invalid' from generate_series(1,5)n;
insert into public.profiles(id,email,display_name,active_company_id)
select u.id,u.email,'Synthetic coverage actor',c.id from auth.users u join public.companies c
  on c.code=case when right(u.id::text,1)='5' then 'wt-coverage-foreign' else 'wt-coverage-workflow' end
where u.id::text like '99615000-0000-4000-8000-%';
insert into public.company_memberships(company_id,user_id,active)
select active_company_id,id,true from public.profiles where id::text like '99615000-0000-4000-8000-%'
on conflict(company_id,user_id) do update set active=true;
insert into public.user_roles(user_id,company_id,role_key)
select id,active_company_id,case right(id::text,1) when '1' then 'marin' when '2' then 'capitaine' when '4' then 'direction' else 'admin' end
from public.profiles where id::text like '99615000-0000-4000-8000-%';
insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,hired_on,active)
select active_company_id,id,'Synthetic','Coverage actor '||right(id::text,1),case when right(id::text,1)='2' then 'Capitaine' else 'Matelot' end,
  'COVERAGE-WF-'||right(id::text,1),current_date-10,true from public.profiles where id::text like '99615000-0000-4000-8000-%';
insert into public.working_time_profile_signatures(company_id,person_id,version_number,storage_path,mime_type,file_size_bytes,sha256)
select company_id,id,1,company_id||'/'||id||'/synthetic.png','image/png',10,repeat('a',64)
from public.people where user_id::text like '99615000-0000-4000-8000-%';
insert into public.vessels(company_id,name,acronym,active)
select id,'Coverage workflow vessel','COVWF',true from public.companies where code='wt-coverage-workflow';
insert into public.planning_work_rest_policies(company_id,name,scope,effective_from,
 max_work_24h,min_rest_24h,max_work_7d,min_rest_7d,min_consecutive_rest_hours,max_rest_periods_24h,
 night_starts_at,night_ends_at,max_night_work_24h,max_amplitude_hours,max_interval_between_rests_hours,active)
select id,'Coverage workflow policy','company',current_date-100,12,10,84,52,6,6,'20:00','06:00',10,14,14,true
from public.companies where code='wt-coverage-workflow';
insert into public.planning_assignments(company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,starts_at,ends_at,
 assignment_role,status_label,confirmation_status,watch_group,source_label)
select p.company_id,v.id,cap.id,p.id,current_date-3,current_date+3,(current_date-3)::timestamp at time zone 'UTC',
 (current_date+4)::timestamp at time zone 'UTC',case when p.id=cap.id then 'Capitaine' else 'Matelot' end,
 'En mer','confirmed','Coverage watch','coverage_workflow_test'
from public.people p join public.vessels v on v.company_id=p.company_id and v.acronym='COVWF'
join public.people cap on cap.company_id=p.company_id and cap.sailor_number='COVERAGE-WF-2'
where p.sailor_number in('COVERAGE-WF-1','COVERAGE-WF-2');
insert into public.working_time_registers(company_id,person_id,period_kind,period_start,period_end)
select company_id,id,'monthly',date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month -1 day')::date
from public.people where sailor_number='COVERAGE-WF-1' on conflict do nothing;
select set_config('test.coverage_register',(select r.id::text from public.working_time_registers r join public.people p on p.id=r.person_id
 where p.sailor_number='COVERAGE-WF-1' and r.period_start=date_trunc('month',current_date)::date),true);
select set_config('test.coverage_person',(select id::text from public.people where sailor_number='COVERAGE-WF-1'),true);
select set_config('test.coverage_company',(select id::text from public.companies where code='wt-coverage-workflow'),true);

set local session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claim.sub','99615000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"99615000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(session_user::text,'authenticator','workflow fixture does not use a maintenance session');
select lives_ok($$select public.save_working_time_phases(current_setting('test.coverage_register')::bigint,
 jsonb_build_array(jsonb_build_object('starts_at',(current_date-3)||'T10:00:00Z','ends_at',(current_date-3)||'T12:30:00Z'),
 jsonb_build_object('starts_at',(current_date-3)||'T14:00:00Z','ends_at',(current_date-3)||'T22:00:00Z')),
 'UTC',null,null,'Synthetic prior day')$$,'a Marin saves the first assignment day');
select lives_ok($$select public.save_working_time_phases(current_setting('test.coverage_register')::bigint,
 jsonb_build_array(jsonb_build_object('starts_at',(current_date-2)||'T04:00:00Z','ends_at',(current_date-2)||'T12:00:00Z')),
 'UTC',null,null,'Synthetic covered day')$$,'a Marin saves the day with an unfavorable individual rolling window');
select ok(exists(select 1 from public.working_time_calculation_windows where person_id=current_setting('test.coverage_person')::bigint
 and is_compliant is false),'legacy diagnostic windows contain a breach');
select is(jsonb_array_length(public.working_time_coverage_alerts(current_date-3,current_date+3,array[current_setting('test.coverage_person')::bigint])),0,
 'Home has no alert when a chain covers the complete assignment');
select set_config('test.coverage_approval',public.submit_working_time_day(current_setting('test.coverage_register')::bigint,current_date-2)::text,true);
select is((select status from public.working_time_day_approvals where id=current_setting('test.coverage_approval')::bigint),'submitted',
 'the Marin signs and submits despite an individually unfavorable window');
select set_config('request.jwt.claim.sub','99615000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"99615000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.validate_working_time_day(current_setting('test.coverage_approval')::bigint)$$,
 'the real assigned captain approves a covered day without an unnecessary justification');
select is((select non_compliance_snapshot from public.working_time_day_approvals where id=current_setting('test.coverage_approval')::bigint),'[]'::jsonb,
 'a covered decision does not freeze a false non-compliance');
select ok((select compliance_analysis_snapshot->'assignment_coverage'->0->>'status' in('covered','projected')
 from public.working_time_day_approvals where id=current_setting('test.coverage_approval')::bigint),
 'the new signature explicitly preserves confirmed or projected coverage');
select length(set_config('test.coverage_signed_basis',(select compliance_analysis_snapshot::text from public.working_time_day_approvals
 where id=current_setting('test.coverage_approval')::bigint),true));
select ok((select e.compliance_analysis_snapshot=a.compliance_analysis_snapshot from public.working_time_day_approval_events e
 join public.working_time_day_approvals a on a.id=e.day_approval_id where a.id=current_setting('test.coverage_approval')::bigint
 and e.event_type='validated' order by e.id desc limit 1),'the immutable approval event stores the same analysis basis');
select set_config('test.coverage_source_id',(select max(id)::text from public.working_time_calculation_windows where person_id=current_setting('test.coverage_person')::bigint),true);
select set_config('request.jwt.claim.sub','99615000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"99615000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is(public.working_time_coverage_alerts(current_date-3,current_date+3,array[current_setting('test.coverage_person')::bigint]),'[]'::jsonb,
 'an administrator of another company cannot read scoped coverage alerts');
select is(private.working_time_coverage_alert_rows(array[current_setting('test.coverage_source_id')::bigint],current_date-3,current_date+3),'[]'::jsonb,
 'the authorized worker rejects forged foreign calculation IDs too');
select set_config('request.jwt.claim.sub','99615000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"99615000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.save_working_time_phases(current_setting('test.coverage_register')::bigint,
 jsonb_build_array(jsonb_build_object('starts_at',(current_date-1)||'T00:00:00Z','ends_at',(current_date-1)||'T20:00:00Z')),
 'UTC',null,null,'Synthetic new incompatible future work')$$,'later work is captured and reanalyzed without rewriting the old signed day');
select is((select compliance_analysis_snapshot from public.working_time_day_approvals where id=current_setting('test.coverage_approval')::bigint),
 current_setting('test.coverage_signed_basis')::jsonb,'later incompatible work preserves the earlier signed analysis');
select ok(jsonb_array_length(public.working_time_coverage_alerts(current_date-3,current_date+3,array[current_setting('test.coverage_person')::bigint]))>0,
 'a real coverage gap creates a Home alert');
select ok(not exists(select 1 from jsonb_array_elements(public.working_time_coverage_alerts(current_date-3,current_date+3,
 array[current_setting('test.coverage_person')::bigint])) a where a->'violation_codes'<>jsonb_build_array('assignment_coverage')),
 'coverage alerts use coverage wording rather than an old rolling-window diagnosis');
reset role;
reset session authorization;
select ok(not public.working_time_day_has_non_compliance(current_setting('test.coverage_register')::bigint,current_date-2),
 'a gap on the following day does not mark every assignment day non-compliant');
select ok(public.working_time_day_has_non_compliance(current_setting('test.coverage_register')::bigint,current_date-1),
 'the affected day requires the actual coverage-gap response');
-- Frozen/imported legacy diagnostics may have no current false verdict at all.
-- Coverage alerts must still come from actual intervals and assignment scopes.
update public.working_time_calculation_windows set work_24h_compliant=null,is_compliant=true,violation_codes='{}'
where person_id=current_setting('test.coverage_person')::bigint;
set local session authorization authenticator;
set local role authenticated;
select is((select count(*) from public.working_time_calculation_windows where person_id=current_setting('test.coverage_person')::bigint
 and is_compliant is false),0::bigint,'the fixture has no stored false calculation verdict');
select ok(jsonb_array_length(public.working_time_coverage_alerts(current_date-3,current_date+3,array[current_setting('test.coverage_person')::bigint]))>0,
 'an assignment gap remains visible even with no stored false calculation');
select ok(not exists(select 1 from jsonb_array_elements(public.working_time_coverage_alerts(current_date-3,current_date+3,
 array[current_setting('test.coverage_person')::bigint])) a join public.working_time_calculation_windows c on c.id=(a->>'id')::bigint
 where a->>'window_end'<>to_jsonb(c)->>'window_end' or a->>'local_window_end_date'<>to_jsonb(c)->>'local_window_end_date'),
 'the alert preserves its real source calculation date and window');
-- A stale raw flag on the actual gap day must not contaminate new evidence.
reset role;
reset session authorization;
update public.working_time_calculation_windows set is_compliant=false,violation_codes=array['rest_24h']
where id=(select max(id) from public.working_time_calculation_windows
 where person_id=current_setting('test.coverage_person')::bigint and local_window_end_date=current_date-1);
set local session authorization authenticator;
set local role authenticated;
select set_config('test.coverage_gap_approval',public.submit_working_time_day(current_setting('test.coverage_register')::bigint,current_date-1)::text,true);
select set_config('request.jwt.claim.sub','99615000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"99615000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('seapilot.assignment_coverage_workflow_cache','{"non_compliant":false,"assignment_coverage":[]}',true);
select throws_ok($$select public.validate_working_time_day(current_setting('test.coverage_gap_approval')::bigint)$$,
 '23514','WORKING_TIME_NON_COMPLIANCE_DETAILS_REQUIRED.',
 'a caller-controlled GUC cannot bypass the gap justification');
select lives_ok($$select public.validate_working_time_day_with_comment(current_setting('test.coverage_gap_approval')::bigint,
 'unexpected_operation','Synthetic operational context','Synthetic immediate action','Synthetic compensation','Synthetic captain response')$$,
 'the assigned captain can document and approve the actual gap');
select ok((select exists(select 1 from jsonb_array_elements(non_compliance_snapshot) e where e->>'analysis_kind'='assignment_coverage_gap')
 from public.working_time_day_approvals where id=current_setting('test.coverage_gap_approval')::bigint),
 'new non-compliance evidence records the exact assignment gaps');
select ok((select not exists(select 1 from jsonb_array_elements(non_compliance_snapshot) e
 where e->>'analysis_kind' is distinct from 'assignment_coverage_gap') from public.working_time_day_approvals
 where id=current_setting('test.coverage_gap_approval')::bigint),
 'new assignment signatures never blame obsolete individual-window flags');
select is((select compliance_analysis_snapshot from public.working_time_day_approvals where id=current_setting('test.coverage_approval')::bigint),
 current_setting('test.coverage_signed_basis')::jsonb,'the original signed basis remains immutable after later approval');
select set_config('request.jwt.claim.sub','99615000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"99615000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('test.coverage_manual_register',public.get_or_create_working_time_register(
 current_setting('test.coverage_person')::bigint,'monthly',date_trunc('month',current_date-10)::date)::text,true);
select lives_ok($$select public.save_working_time_phases(current_setting('test.coverage_manual_register')::bigint,
 jsonb_build_array(jsonb_build_object('starts_at',(current_date-10)||'T00:00:00Z','ends_at',(current_date-10)||'T20:00:00Z')),
 'UTC',null,null,'Synthetic manual hours outside assignment')$$,'manual hours outside an actual assignment remain capturable');
select ok(exists(select 1 from jsonb_array_elements(public.working_time_coverage_alerts(current_date-10,current_date-10,
 array[current_setting('test.coverage_person')::bigint])) a where a->>'assignment_id' is null
 and a->'violation_codes'<>jsonb_build_array('assignment_coverage')),
 'outside actual assignments the legacy alert cause is preserved');
reset role;
reset session authorization;
select ok(public.working_time_day_has_non_compliance(current_setting('test.coverage_manual_register')::bigint,current_date-10),
 'outside actual assignments the legacy justification guard remains active');
select * from finish();
rollback;
