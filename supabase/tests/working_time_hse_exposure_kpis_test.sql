begin;

select plan(14);

select has_table('public', 'hse_exposure_methodologies', 'versioned exposure methodologies exist');
select has_table('public', 'hse_exposure_hours', 'exposure is stored separately from work intervals');
select has_table('public', 'hse_safety_events', 'classified safety events exist');
select has_function('public', 'refresh_hse_exposure_hours', array['date','date','bigint'], 'exposure refresh RPC exists');
select has_function('public', 'hse_kpi_summary', array['date','date','bigint','bigint','text','bigint','text','bigint','bigint','text','text'], 'filtered KPI RPC exists');
select ok(not has_function_privilege('anon', 'public.hse_kpi_summary(date,date,bigint,bigint,text,bigint,text,bigint,bigint,text,text)', 'EXECUTE'), 'anonymous KPI access is denied');

insert into auth.users (id, email) values ('78600000-0000-0000-0000-000000000001', 'hse-admin@example.invalid');
insert into public.profiles (id,email,display_name,active_company_id)
select '78600000-0000-0000-0000-000000000001', 'hse-admin@example.invalid', 'HSE Admin', id from public.companies where code='bbtm';
insert into public.user_roles (user_id,company_id,role_key)
select '78600000-0000-0000-0000-000000000001', id, 'admin' from public.companies where code='bbtm';
insert into public.people (company_id,user_id,first_name,last_name,function_label,employment_population,active)
select id,'78600000-0000-0000-0000-000000000001','HSE','ADMIN','QHSE','sedentary',true from public.companies where code='bbtm';
insert into public.people (company_id,first_name,last_name,function_label,employment_population,active)
select id,'PERSONNE','SEDENTAIRE','Support','sedentary',true from public.companies where code='bbtm';
insert into public.vessels (company_id,name,acronym,active) select id,'HSE TEST VESSEL','HSE-T',true from public.companies where code='bbtm';

insert into public.planning_assignments (company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,source_label)
select company.id,vessel.id,person.id,'2026-11-02','2026-11-03','Support','test'
from public.companies company join public.vessels vessel on vessel.company_id=company.id and vessel.acronym='HSE-T'
join public.people person on person.company_id=company.id and person.last_name='SEDENTAIRE';
insert into public.planning_publications (company_id,vessel_id,scope_key,starts_on,ends_on,status,current_version)
select company.id,vessel.id,'vessel:'||vessel.id,'2026-11-01','2026-11-30','published',1
from public.companies company join public.vessels vessel on vessel.company_id=company.id and vessel.acronym='HSE-T';
insert into public.planning_days (company_id,person_id,vessel_id,crew_name,work_date,function_label,source_label)
select company.id,person.id,vessel.id,'PERSONNE SEDENTAIRE',test_day.work_date,'Support','test'
from public.companies company join public.vessels vessel on vessel.company_id=company.id and vessel.acronym='HSE-T'
join public.people person on person.company_id=company.id and person.last_name='SEDENTAIRE'
cross join (values (date '2026-11-03'), (date '2026-11-04')) test_day(work_date);
insert into public.working_time_registers (company_id,person_id,period_kind,period_start,period_end,created_by)
select company.id,person.id,'monthly','2026-11-01','2026-11-30','78600000-0000-0000-0000-000000000001'
from public.companies company join public.people person on person.company_id=company.id and person.last_name='SEDENTAIRE';
insert into public.working_time_intervals (
 company_id,register_id,person_id,local_work_date,starts_at,ends_at,timezone_name,utc_offset_minutes,
 vessel_id,author_user_id,author_person_id,source_type,source_record_key
)
select register.company_id,register.id,register.person_id,'2026-11-02','2026-11-02 08:00+01','2026-11-02 14:00+01','Europe/Paris',60,
 vessel.id,'78600000-0000-0000-0000-000000000001',admin_person.id,'manual','hse-actual-day'
from public.working_time_registers register
join public.people subject on subject.id=register.person_id and subject.last_name='SEDENTAIRE'
join public.people admin_person on admin_person.company_id=register.company_id and admin_person.last_name='ADMIN'
join public.vessels vessel on vessel.company_id=register.company_id and vessel.acronym='HSE-T';

set local role authenticated;
select set_config('request.jwt.claim.sub','78600000-0000-0000-0000-000000000001',true);
select lives_ok(
  format('select public.refresh_hse_exposure_hours(%L,%L,%s)', '2026-11-01'::date, '2026-11-30'::date,
    (select id from public.hse_exposure_methodologies where name='SeaPilot - conversion Planning sédentaire' order by id limit 1)),
  'authorized exposure refresh succeeds'
);
select is((select count(*)::integer from public.hse_exposure_hours where exposure_date='2026-11-02'),1,'actual time suppresses the Planning fallback day');
select is((select exposure_seconds from public.hse_exposure_hours where exposure_date='2026-11-02'),21600::bigint,'actual sedentary hours are retained as exposure');
select is((select exposure_seconds from public.hse_exposure_hours where exposure_date='2026-11-03'),39600::bigint,'an assignment-only Planning day contributes 11 hours');
select is((select exposure_seconds from public.hse_exposure_hours where exposure_date='2026-11-04'),39600::bigint,'a historical planning_days row contributes 11 hours');
select is((select count(*)::integer from public.hse_exposure_hours where exposure_date='2026-11-03'),1,'duplicate Planning sources never duplicate a person-day');

insert into public.hse_safety_events (company_id,occurred_on,classification,population,title)
select id,'2026-11-03','FAC','sedentary','First aid test' from public.companies where code='bbtm';
select is(
  (public.hse_kpi_summary('2026-11-01','2026-11-30',
    (select id from public.hse_exposure_methodologies where name='SeaPilot - conversion Planning sédentaire' order by id limit 1),
    null,null,null,null,null,null,null,'sedentary')->>'FAC')::integer,
  1,
  'FAC classification is counted by the filtered KPI RPC'
);
select cmp_ok(
  (public.hse_kpi_summary('2026-11-01','2026-11-30',
    (select id from public.hse_exposure_methodologies where name='SeaPilot - conversion Planning sédentaire' order by id limit 1),
    null,null,null,null,null,null,null,'sedentary')->>'FAC_rate')::numeric,
  '>', 0::numeric,
  'configured IMCA case rates are produced when exposure hours exist'
);

select * from finish();
rollback;
