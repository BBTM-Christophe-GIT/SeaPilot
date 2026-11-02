-- Synthetic crew and real authenticated profiles. Every fixture and grant rolls back.
begin;
insert into public.role_module_permissions(role_key,module_key,is_visible)
select key,'emergencyExercises',true from public.roles where key in ('admin','direction','armement','capitaine','marin')
on conflict(role_key,module_key) do update set is_visible=true;
-- Current schema rejects null source/status values. Relax only these fixture
-- columns inside the rollback transaction to also exercise legacy nullable rows.
-- The production migration does not change either NOT NULL constraint.
alter table public.planning_assignments alter column status_label drop not null;
alter table public.planning_days alter column source_label drop not null;

do $test$
declare
  company bigint; foreign_company bigint; unit_a bigint; unit_b bigint; empty_unit bigint; old_unit bigint; foreign_unit bigint;
  crew bigint[] := '{}'; person bigint; supervisor bigint; gap_person bigint; former bigint; foreign_person bigint;
  actor uuid; role_name text; i integer; j integer; report_id bigint; old_assignment bigint; selected_assignment bigint;
  year_value integer := extract(year from (now() at time zone 'Europe/Paris'))::integer-1;
  today date := (now() at time zone 'Europe/Paris')::date;
  month_end date := (date_trunc('month',now() at time zone 'Europe/Paris')+interval '1 month - 1 day')::date;
  report_day date; payload jsonb; month_row jsonb; unit_row jsonb; current_month integer := extract(month from today)::integer;
  captain_user uuid := 'eec20000-0000-4000-8000-000000000004';
  foreign_user uuid := 'eec20000-0000-4000-8000-000000000006';
begin
  -- RESET ROLE does not clear JWT settings. Privileged fixture setup must not
  -- inherit an authenticated actor, including from an API-backed test session.
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  insert into public.companies(code,name) values('exercise-crew-test','Exercise crew fixture') returning id into company;
  insert into public.companies(code,name) values('exercise-crew-foreign','Foreign crew fixture') returning id into foreign_company;
  insert into public.vessels(company_id,name) values(company,'Crew unit A') returning id into unit_a;
  insert into public.vessels(company_id,name) values(company,'Crew unit B') returning id into unit_b;
  insert into public.vessels(company_id,name) values(company,'Authorized unit without any DPR') returning id into empty_unit;
  insert into public.vessels(company_id,name) values(company,'Outside read window') returning id into old_unit;
  insert into public.vessels(company_id,name) values(foreign_company,'Foreign crew unit') returning id into foreign_unit;

  for i in 1..5 loop
    role_name := (array['admin','direction','armement','capitaine','marin'])[i];
    actor := ('eec20000-0000-4000-8000-00000000000'||i)::uuid;
    insert into auth.users(id,email) values(actor,'crew-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,'crew-'||role_name||'@example.invalid',role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
  end loop;
  for i in 1..8 loop
    insert into public.people(company_id,user_id,first_name,last_name,employment_population,hired_on)
    values(company,case i when 1 then captain_user when 2 then 'eec20000-0000-4000-8000-000000000005'::uuid else null end,
      'Synthetic', 'Crew '||i,'offshore',make_date(year_value,1,1)) returning id into person;
    crew := array_append(crew,person);
  end loop;
  insert into public.people(company_id,first_name,last_name,employment_population,hired_on)
    values(company,'Synthetic','Responsible only','offshore',make_date(year_value,1,1)) returning id into supervisor;
  insert into public.people(company_id,first_name,last_name,employment_population,employment_periods)
    values(company,'Synthetic','Rehire gap','offshore',jsonb_build_array(
      jsonb_build_object('hiredOn',make_date(year_value,1,1),'departedOn',make_date(year_value,5,4),'contractType','CDI','departureReason','Fin'),
      jsonb_build_object('hiredOn',make_date(year_value,5,7),'departedOn','','contractType','CDI','departureReason',''))) returning id into gap_person;
  insert into public.people(company_id,first_name,last_name,employment_population,hired_on,departed_on,active)
    values(company,'Synthetic','Historical crew','offshore',make_date(year_value,1,1),make_date(year_value,6,4),false) returning id into former;

  -- Eight distinct sailors rotate in one month; only four are present each day.
  for i in 1..8 loop
    insert into public.planning_assignments(company_id,vessel_id,crew_person_id,captain_person_id,starts_on,ends_on,confirmation_status,watch_group,status_label)
    values(company,unit_a,crew[i],supervisor,make_date(year_value,3,case when i<=4 then 1 else 15 end),
      make_date(year_value,3,case when i<=4 then 14 else 31 end),'confirmed',case when i<=4 then 'A' else 'B' end,'En Mer')
    returning id into selected_assignment;
    if i=1 then old_assignment:=selected_assignment; end if;
  end loop;
  -- Duplicate functions/rotations cannot duplicate a person-day. A note on the
  -- superseded assignment must not erase the newer confirmed onboard decision.
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,watch_group,status_label)
    values(company,unit_a,crew[1],make_date(year_value,3,1),make_date(year_value,3,14),'confirmed','A','En Mer');
  insert into public.planning_days(company_id,person_id,vessel_id,work_date,sailor_status,source_label,slot365)
    values(company,crew[1],unit_a,make_date(year_value,3,9),'Repos','seapilot-assignment-note','assignment:'||old_assignment);

  -- Current live authorization, independent of historical DPR membership.
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,watch_group,status_label)
    select company,v,p,today-1,today+2,'confirmed','A','En Mer'
    from unnest(array[unit_a,unit_b,empty_unit]) v cross join unnest(crew[1:4]) p;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,watch_group,status_label)
    select company,unit_a,p,today-1,today+2,'confirmed','B','En Mer' from unnest(crew[5:8]) p;
  -- A future day in THIS month creates an open obligation, not a future-month target.
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,watch_group,status_label)
    values(company,unit_a,supervisor,month_end,month_end,'confirmed','B','En Mer');

  -- Daily override > assignment > imported period. Approved absence wins over all.
  insert into public.planning_periods(company_id,person_id,vessel_id,starts_on,ends_on,sailor_status,watch_group)
    values(company,crew[1],unit_b,make_date(year_value,4,1),make_date(year_value,4,15),'Embarqué','A');
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,watch_group,status_label)
    values(company,unit_b,crew[1],make_date(year_value,4,1),make_date(year_value,4,10),'confirmed','A','En Mer') returning id into selected_assignment;
  insert into public.planning_days(company_id,person_id,vessel_id,work_date,sailor_status,source_label,slot365)
    values(company,crew[1],unit_b,make_date(year_value,4,2),'Repos','seapilot-assignment-note','assignment:'||selected_assignment);
  insert into public.planning_absences(company_id,person_id,absence_type,starts_at,ends_at,status,reason,requested_by,reviewed_by,reviewed_at)
    values(company,crew[1],'leave',make_date(year_value,4,3)::timestamp at time zone 'Europe/Paris',
      make_date(year_value,4,4)::timestamp at time zone 'Europe/Paris','approved','Fixture',captain_user,captain_user,now()),
      (company,crew[1],'leave',make_date(year_value,4,4)::timestamp at time zone 'Europe/Paris',
      make_date(year_value,4,5)::timestamp at time zone 'Europe/Paris','requested','Fixture',captain_user,null,null);
  insert into public.planning_days(company_id,person_id,vessel_id,work_date,sailor_status,source_label)
    values(company,crew[1],unit_b,make_date(year_value,4,16),'En Mer','sharepoint'),
      (company,crew[1],unit_b,make_date(year_value,4,17),'A Terre','sharepoint');
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,watch_group,status_label)
    values(company,unit_b,crew[1],make_date(year_value,4,11),make_date(year_value,4,12),'confirmed','A','Repos') returning id into selected_assignment;
  insert into public.planning_days(company_id,person_id,vessel_id,work_date,sailor_status,source_label,slot365)
    values(company,crew[1],unit_b,make_date(year_value,4,12),'En Mer','seapilot-assignment-note','assignment:'||selected_assignment);
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,watch_group,status_label)
    values(company,unit_b,crew[2],make_date(year_value,4,2),make_date(year_value,4,2),'confirmed','A','En Mer'),
      (company,unit_b,crew[1],make_date(year_value,4,18),make_date(year_value,4,18),'confirmed','A','En Mer'),
      (company,unit_a,crew[1],make_date(year_value,4,19),make_date(year_value,4,19),'confirmed','A','En Mer'),
      (company,unit_a,crew[1],make_date(year_value,4,20),make_date(year_value,4,20),'confirmed','A','En Mer'),
      (company,unit_b,crew[1],make_date(year_value,4,20),make_date(year_value,4,20),'confirmed','A','En Mer'),
      (company,empty_unit,crew[3],make_date(year_value,4,25),make_date(year_value,4,25),'confirmed','A','En Mer'),
      (company,old_unit,crew[3],make_date(year_value,4,26),make_date(year_value,4,26),'confirmed','A','En Mer'),
      (company,unit_b,gap_person,make_date(year_value,5,1),make_date(year_value,5,10),'confirmed','A','En Mer'),
      (company,unit_b,former,make_date(year_value,6,1),make_date(year_value,6,6),'confirmed','A','En Mer'),
      (company,unit_b,crew[4],make_date(year_value,7,1),make_date(year_value,7,31),'cancelled','A','En Mer'),
      (company,unit_b,crew[4],make_date(year_value,8,1),make_date(year_value,8,31),'provisional','A','En Mer'),
      (company,unit_b,crew[4],make_date(year_value,9,1),make_date(year_value,9,30),'confirmed','A','Extra'),
      (company,unit_b,crew[4],make_date(year_value,10,1),make_date(year_value,10,31),'confirmed','A','Statut inconnu');
  -- Local midnight disembarkation is exclusive, even when ends_on also lists it.
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,starts_at,ends_at,confirmation_status,status_label)
    values(company,unit_b,crew[4],make_date(year_value,7,1),make_date(year_value,7,2),
      make_date(year_value,7,1)::timestamp at time zone 'Europe/Paris',make_date(year_value,7,2)::timestamp at time zone 'Europe/Paris','confirmed','En Mer');
  -- Hidden-ship sources still take part in daily conflict/priority resolution.
  -- They may suppress fictitious visible presence but must never leak in output.
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,status_label)
    select company,v,p,make_date(year_value,11,1),make_date(year_value,11,1),'confirmed','En Mer'
    from unnest(array[unit_a,old_unit]) v cross join unnest(crew[1:2]) p;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,status_label)
    select company,unit_a,p,make_date(year_value,12,1),make_date(year_value,12,1),'confirmed','En Mer' from unnest(crew[1:2]) p;
  insert into public.planning_days(company_id,person_id,vessel_id,work_date,sailor_status,source_label)
    select company,p,old_unit,make_date(year_value,12,1),'En Mer','sharepoint' from unnest(crew[1:2]) p;
  -- The canonical assignment loader defaults null/blank status to En Mer.
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,status_label)
    values(company,unit_b,crew[4],make_date(year_value,11,3),make_date(year_value,11,3),'confirmed',null),
      (company,unit_b,crew[4],make_date(year_value,11,4),make_date(year_value,11,4),'confirmed','   ');
  insert into public.planning_days(company_id,person_id,vessel_id,work_date,sailor_status,source_label)
    values(company,crew[4],unit_b,make_date(year_value,11,5),'En Mer',null);

  insert into public.emergency_exercise_types(key,label,display_order,active)
    values('tbt','Fixture TBT excluded',999,true),('crew-inactive','Fixture inactive excluded',1000,false)
    on conflict(key) do update set active=excluded.active;
  -- DPR 1: actual first watch + falsely listed second watch; DPR 2: other category.
  -- Draft, deleted, wrong-vessel and wrong-day evidence must never add credit.
  for j in 1..6 loop
    report_day := make_date(year_value,3,case when j=2 then 6 when j=3 then 7 when j=4 then 8 when j=6 then 20 else 5 end);
    insert into public.dpr_reports(company_id,vessel_id,report_date,issuer_user_id,issuer_name_snapshot,status,dpr_number,
      submitted_by,submitted_at,validated_by,validated_at,deleted_at,deleted_by,deletion_reason)
    values(company,case when j=5 then unit_b else unit_a end,report_day,captain_user,'Synthetic issuer',case when j=3 then 'draft' else 'validated' end,j,
      captain_user,now(),captain_user,now(),case when j=4 then now() else null end,
      case when j=4 then captain_user else null end,case when j=4 then 'Fixture deletion' else null end) returning id into report_id;
    insert into public.dpr_crew_members(dpr_id,company_id,person_id,crew_function,display_name_snapshot)
      select report_id,company,p,'execution','Synthetic crew' from unnest(case when j=1 then crew else crew[1:4] end) p;
    insert into public.dpr_crew_members(dpr_id,company_id,person_id,crew_function,display_name_snapshot)
      values(report_id,company,crew[1],'chief-engineer','Duplicate function');
    insert into public.dpr_emergency_exercises(dpr_id,company_id,exercise_type_key)
      values(report_id,company,case when j=2 then 'sea-rescue' else 'fire-protection' end);
    if j=1 then insert into public.dpr_emergency_exercises(dpr_id,company_id,exercise_type_key) values(report_id,company,'abandon-ship'); end if;
    insert into public.dpr_hse_actions(dpr_id,company_id,tbt_performed,tbt_theme) values(report_id,company,true,'Synthetic toolbox');
  end loop;

  -- Employment gaps/departures cannot earn credit even if a DPR lists the person.
  for j in 1..2 loop
    insert into public.dpr_reports(company_id,vessel_id,report_date,issuer_user_id,issuer_name_snapshot,status,dpr_number,
      submitted_by,submitted_at,validated_by,validated_at)
    values(company,unit_b,make_date(year_value,case when j=1 then 5 else 6 end,5),captain_user,'Synthetic issuer','validated',6+j,
      captain_user,now(),captain_user,now()) returning id into report_id;
    insert into public.dpr_crew_members(dpr_id,company_id,person_id,crew_function,display_name_snapshot)
      values(report_id,company,case when j=1 then gap_person else former end,'execution','Synthetic crew');
    insert into public.dpr_emergency_exercises(dpr_id,company_id,exercise_type_key) values(report_id,company,'fire-protection');
    insert into public.dpr_hse_actions(dpr_id,company_id,tbt_performed,tbt_theme) values(report_id,company,true,'Synthetic toolbox');
  end loop;
  if month_end>today then
    insert into public.dpr_reports(company_id,vessel_id,report_date,issuer_user_id,issuer_name_snapshot,status,dpr_number,
      submitted_by,submitted_at,validated_by,validated_at)
    values(company,unit_a,month_end,captain_user,'Synthetic issuer','validated',9,captain_user,now(),captain_user,now()) returning id into report_id;
    insert into public.dpr_crew_members(dpr_id,company_id,person_id,crew_function,display_name_snapshot)
      values(report_id,company,supervisor,'execution','Synthetic future crew');
    insert into public.dpr_emergency_exercises(dpr_id,company_id,exercise_type_key) values(report_id,company,'fire-protection');
    insert into public.dpr_hse_actions(dpr_id,company_id,tbt_performed,tbt_theme) values(report_id,company,true,'Synthetic future toolbox');
  end if;

  for i in 1..5 loop
    actor := ('eec20000-0000-4000-8000-00000000000'||i)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    payload := public.emergency_exercises_performance(year_value);
    assert payload->>'schemaVersion'='2','V2 contract absent';
    assert payload->>'scope'=case when i<=3 then 'fleet' when i=4 then 'watch' else 'self' end,'Actual profile scope changed';
    assert jsonb_array_length(payload->'crewDays')=jsonb_array_length(payload->'vessels')*(make_date(year_value+1,1,1)-make_date(year_value,1,1)),'Daily vessel calendar is incomplete';
    assert exists(select 1 from jsonb_array_elements(payload->'crewDays') d where (d->>'vesselId')::bigint=empty_unit and d->>'on'=make_date(year_value,1,1)::text and d->>'count'='0'),'Absent planning day did not explicitly contain zero';
    assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p cross join jsonb_array_elements(payload->'exerciseTypes') t
      where not(p->'counts' ? (t->>'key')) or (p->'counts'->>(t->>'key'))::integer<>(select sum((u->'counts'->>(t->>'key'))::integer) from jsonb_array_elements(p->'units') u)), 'Global category counts are incomplete or differ from unit sums';
    assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where p->>'fireCount'<>p->'counts'->>'fire-protection'
      or p->>'abandonCount'<>p->'counts'->>'abandon-ship' or (p->>'tbtCount')::integer<>(select sum((u->>'tbtCount')::integer) from jsonb_array_elements(p->'units') u)),'V1 aliases or global TBT sum diverged';
    assert not exists(select 1 from jsonb_array_elements(payload->'exerciseTypes') t where t->>'key' in ('tbt','crew-inactive')),'Bonus or inactive category became mandatory';
    assert (select t->>'cadenceMonths' from jsonb_array_elements(payload->'exerciseTypes') t where t->>'key'='fire-protection')='1','Fire cadence changed';
    assert (select t->>'cadenceMonths' from jsonb_array_elements(payload->'exerciseTypes') t where t->>'key'='abandon-ship')='1','Abandon cadence changed';
    assert not exists(select 1 from jsonb_array_elements(payload->'exerciseTypes') t where t->>'key' not in ('fire-protection','abandon-ship') and t->>'cadenceMonths'<>'2'),'Other category cadence changed';
    assert exists(select 1 from jsonb_array_elements(payload->'vessels') v where (v->>'id')::bigint=empty_unit),'First-DPR prerequisite hid an authorized vessel';
    assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=supervisor),'Responsible officer without own presence counted';
    assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=any(crew[1:2]) and p->>'month'='11'),'Hidden cross-vessel conflict invented visible presence';
    select p into month_row from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=crew[2] and p->>'month'='3';
    assert month_row->>'fireCount'='1' and month_row->>'abandonCount'='1','Wrong watch/day/vessel, draft, deleted or duplicate credit';
    assert month_row->'counts'->>'sea-rescue'='1' and month_row->>'tbtCount'='2','Other exercise or TBT distinct-DPR count lost';
    assert month_row->>'presenceDays'='14','First rotation daily presence incorrect';
    if i<=3 then
      assert (select count(*) from jsonb_array_elements(payload->'personMonths') p where p->>'month'='3')=8,'Two watches did not yield eight distinct monthly people';
      assert (select count(*) from jsonb_array_elements(payload->'crewDays') d where (d->>'vesselId')::bigint=unit_a and d->>'on' between make_date(year_value,3,1)::text and make_date(year_value,3,31)::text and d->>'count'='4')=31,'Four crew/day or duplicate-rotation dedup failed';
      assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where p->>'month'='3' and (p->>'personId')::bigint=any(crew[5:8]) and ((p->>'fireCount')::integer<>0 or (p->>'tbtCount')::integer<>0)),'First watch DPR credited the other watch';
      select p into month_row from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=crew[1] and p->>'month'='4';
      assert month_row->>'presenceDays'='15','Daily overrides, approved absence, imports or cross-ship conflict ignored';
      select u into unit_row from jsonb_array_elements(month_row->'units') u where (u->>'vesselId')::bigint=unit_b;
      assert unit_row->>'presenceDays'='14','Unit-local presence counted incorrectly';
      assert (select p->>'presenceDays' from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=gap_person and p->>'month'='5')='7','Employment gap counted as presence';
      assert (select p->>'presenceDays' from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=former and p->>'month'='6')='3','Historical employee wrongly excluded based on current employment';
      assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint in(gap_person,former) and ((p->>'fireCount')::integer<>0 or (p->>'tbtCount')::integer<>0)),'Gap or post-departure DPR credited';
      assert (select p->>'presenceDays' from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=crew[4] and p->>'month'='7')='1','Exclusive local disembarkation midnight counted twice';
      assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=crew[4] and (p->>'month')::integer in (8,9,10)),'Provisional/Extra/unknown status invented presence';
      assert (select p->>'presenceDays' from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=crew[4] and p->>'month'='11')='3','Null/blank assignment or nullable daily source lost canonical presence';
    else
      assert not exists(select 1 from jsonb_array_elements(payload->'vessels') v where (v->>'id')::bigint=old_unit),'Outside read window vessel leaked';
      assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=any(crew[5:8])),'Other watch personnel leaked';
      assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=any(crew[1:2]) and p->>'month'='12'),'Hidden higher-priority day invented visible presence';
      assert not exists(select 1 from jsonb_array_elements(payload->'crewDays') d where (d->>'vesselId')::bigint=old_unit),'Hidden vessel leaked through daily aggregates';
    end if;
    if i=5 then
      assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint<>crew[2]),'Marin data not self-only';
      assert not exists(select 1 from jsonb_array_elements(payload->'crewDays') d where (d->>'count')::integer not in (0,1)),'Self daily aggregate disclosed other crew sizes';
    end if;
    assert jsonb_array_length(public.emergency_exercises_performance(extract(year from today)::integer+1)->'personMonths')=0,'Future year obligations invented';
    if i<=3 then
      payload := public.emergency_exercises_performance(extract(year from today)::integer);
      assert exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=supervisor and (p->>'month')::integer=current_month),'Current-month planned second watch omitted';
      assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=supervisor and ((p->>'fireCount')::integer<>0 or (p->>'tbtCount')::integer<>0)),'Future DPR became completed exercise evidence';
      assert not exists(select 1 from jsonb_array_elements(payload->'crewDays') d where (d->>'on')::date>month_end),'Future-month presence entered denominator';
      assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'month')::integer>current_month),'Future month entered obligations';
    end if;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{}',true);
  end loop;
  -- A separate real tenant may see only its own catalogue and personnel.
  insert into auth.users(id,email) values(foreign_user,'crew-foreign@example.invalid');
  insert into public.profiles(id,email,active_company_id) values(foreign_user,'crew-foreign@example.invalid',foreign_company);
  insert into public.company_memberships(company_id,user_id,active) values(foreign_company,foreign_user,true) on conflict(company_id,user_id) do update set active=true;
  insert into public.user_roles(user_id,company_id,role_key) values(foreign_user,foreign_company,'admin');
  insert into public.people(company_id,first_name,last_name,employment_population,hired_on) values(foreign_company,'Synthetic','Foreign','offshore',make_date(year_value,1,1)) returning id into foreign_person;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,status_label)
    values(foreign_company,foreign_unit,foreign_person,make_date(year_value,3,1),make_date(year_value,3,1),'confirmed','En Mer');
  perform set_config('request.jwt.claim.sub',foreign_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',foreign_user,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  payload := public.emergency_exercises_performance(year_value);
  assert (select count(*) from jsonb_array_elements(payload->'vessels'))=1 and (payload->'vessels'->0->>'id')::bigint=foreign_unit,'Cross-tenant vessel exposure';
  assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint<>foreign_person),'Cross-tenant crew exposure';
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  update public.role_module_permissions set is_visible=false where role_key='marin' and module_key='emergencyExercises';
  actor := 'eec20000-0000-4000-8000-000000000005';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin perform public.emergency_exercises_performance(year_value); raise exception 'Hidden module accepted'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  begin perform public.emergency_exercises_performance(year_value); raise exception 'Anonymous access accepted'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
end;
$test$;
select 'PASS: two watches/eight people/four daily, exact onboard DPR/TBT, daily priorities, replacements/transfers, employment history, first-DPR absence and five real-profile/tenant/module/read-window scopes' as result;
rollback;
