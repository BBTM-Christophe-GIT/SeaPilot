-- Actual authenticated role fixtures; no production personnel or DPRs are touched.
begin;
insert into public.role_module_permissions(role_key,module_key,is_visible)
select key,'emergencyExercises',true from public.roles where key in ('admin','direction','armement','capitaine','marin')
on conflict(role_key,module_key) do update set is_visible=true;
do $test$
declare
  company bigint; foreign_company bigint; vessel bigint; second_vessel bigint; old_vessel bigint; foreign_vessel bigint;
  captain bigint; sailor bigint; outsider bigint; former bigint; future_rehire bigint; foreign_person bigint;
  actor uuid; role_name text; person bigint; report_id bigint; i integer; j integer;
  today date := (now() at time zone 'Europe/Paris')::date;
  year_value integer := extract(year from (now() at time zone 'Europe/Paris'))::integer - 1;
  dates jsonb; payload jsonb; month_row jsonb; roster jsonb;
  captain_user uuid := 'eec00000-0000-4000-8000-000000000004';
begin
  insert into public.companies(code,name) values('monthly-exercise-test','Monthly exercise fixture') returning id into company;
  insert into public.companies(code,name) values('monthly-exercise-foreign','Foreign monthly fixture') returning id into foreign_company;
  insert into public.vessels(company_id,name) values(company,'Monthly unit A') returning id into vessel;
  insert into public.vessels(company_id,name) values(company,'Monthly unit B') returning id into second_vessel;
  insert into public.vessels(company_id,name) values(company,'Outside current read window') returning id into old_vessel;
  insert into public.vessels(company_id,name) values(foreign_company,'Foreign unit') returning id into foreign_vessel;
  dates := jsonb_build_array(
    jsonb_build_object('hiredOn',make_date(year_value,3,1),'departedOn',make_date(year_value,5,1),'contractType','CDI','departureReason','Fin de contrat'),
    jsonb_build_object('hiredOn',make_date(year_value,7,1),'departedOn','','contractType','CDI','departureReason',''));
  for i in 1..5 loop
    role_name := (array['admin','direction','armement','capitaine','marin'])[i];
    actor := ('eec00000-0000-4000-8000-00000000000'||i)::uuid;
    insert into auth.users(id,email) values(actor,'monthly-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,'monthly-'||role_name||'@example.invalid',role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    if i>=4 then
      insert into public.people(company_id,user_id,first_name,last_name,employment_population,employment_periods)
      values(company,actor,'Monthly',role_name,'offshore',dates) returning id into person;
      if i=4 then captain:=person; else sailor:=person; end if;
    end if;
  end loop;
  insert into public.people(company_id,first_name,last_name,employment_population,employment_periods)
    values(company,'Other','Watch','offshore',dates) returning id into outsider;
  insert into public.people(company_id,first_name,last_name,employment_population,hired_on,departed_on)
    values(company,'Former','Excluded','offshore',make_date(year_value,1,1),today-1) returning id into former;
  -- The legacy columns point at a future rehire, while an earlier period covers today.
  insert into public.people(company_id,first_name,last_name,employment_population,employment_periods)
    values(company,'Future','Rehire','offshore',jsonb_build_array(
      jsonb_build_object('hiredOn',make_date(year_value,1,1),'departedOn',today+14,'contractType','CDI','departureReason','Fin'),
      jsonb_build_object('hiredOn',today+15,'departedOn','','contractType','CDI','departureReason',''))) returning id into future_rehire;
  insert into public.people(company_id,first_name,last_name,employment_population,hired_on)
    values(foreign_company,'Foreign','Person','offshore',make_date(year_value,1,1)) returning id into foreign_person;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,watch_group)
    select company,vessel,p,make_date(year_value,1,1),make_date(year_value,12,31),'confirmed','A'
    from unnest(array[captain,sailor,outsider,former,future_rehire]) p;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,watch_group)
    select company,second_vessel,p,make_date(year_value,3,1),make_date(year_value,3,31),'confirmed','A' from unnest(array[captain,sailor]) p;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,watch_group)
    select company,old_vessel,p,make_date(year_value,3,1),make_date(year_value,3,31),'confirmed','A' from unnest(array[captain,sailor]) p;
  -- Current confirmed assignments authorize A/B and identify the actual captain watch.
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,starts_at,ends_at,confirmation_status,watch_group)
    select company,v,p,today-1,today+5,(today-1)::timestamptz,(today+6)::timestamptz,'confirmed',case when p=outsider then 'B' else 'A' end
    from unnest(array[vessel,second_vessel]) v cross join unnest(array[captain,sailor,outsider,future_rehire]) p;
  -- Confirmed presence, not cancelled/draft planning, defines monthly eligibility.
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,confirmation_status,watch_group)
    values(company,vessel,sailor,make_date(year_value,6,1),make_date(year_value,6,30),'cancelled','A');
  for j in 1..5 loop
    insert into public.dpr_reports(company_id,vessel_id,report_date,issuer_user_id,issuer_name_snapshot,status,dpr_number,submitted_by,submitted_at,
      validated_by,validated_at,deleted_at,deleted_by,deletion_reason)
    values(company,case when j=2 then second_vessel when j=3 then old_vessel else vessel end,
      case when j=4 then make_date(year_value,4,15) when j=5 then make_date(year_value,6,15) else make_date(year_value,3,15) end,
      captain_user,'Monthly captain',case when j=4 then 'draft' else 'validated' end,j,captain_user,now(),captain_user,now(),null,null,null)
    returning id into report_id;
    insert into public.dpr_crew_members(dpr_id,company_id,person_id,crew_function,display_name_snapshot)
      values(report_id,company,sailor,'execution','Monthly sailor'),(report_id,company,sailor,'chief-engineer','Duplicate function'),
      (report_id,company,captain,'captain','Monthly captain');
    insert into public.dpr_emergency_exercises(dpr_id,company_id,exercise_type_key) values(report_id,company,'fire-protection');
    if j=1 then insert into public.dpr_emergency_exercises(dpr_id,company_id,exercise_type_key) values(report_id,company,'abandon-ship'); end if;
  end loop;
  for i in 1..5 loop
    actor := ('eec00000-0000-4000-8000-00000000000'||i)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    payload := public.emergency_exercises_performance(year_value);
    assert payload->>'scope'=case when i<=3 then 'fleet' when i=4 then 'watch' else 'self' end,'Role scope mismatch';
    assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint in (former,foreign_person)), 'Former/foreign population leaked';
    assert (select count(*) from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=sailor)=8,'Hire, departure or rehire gap ignored';
    assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=sailor and (p->>'month')::integer in (1,2,5,6)), 'Pre-hire/gap months became obligations';
    select p into month_row from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=sailor and p->>'month'='3';
    assert (month_row->>'fireCount')::integer=case when i<=3 then 3 else 2 end, 'Duplicate crew or read-window data entered counts';
    assert month_row->>'abandonCount'='1','Abandon participation lost';
    assert (select count(*) from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=sailor and p->>'month'='3')=1,'Multi-vessel person-month duplicated';
    assert (select p->>'fireCount' from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=sailor and p->>'month'='4')='0','Draft DPR counted';
    if i<=3 then
      assert exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=future_rehire),'Future rehire hid an employment period active today';
    else
      assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint=outsider),'Other captain watch leaked';
      assert not exists(select 1 from jsonb_array_elements(payload->'vessels') v where (v->>'id')::bigint=old_vessel),'Outside-window vessel leaked';
    end if;
    if i=5 then assert not exists(select 1 from jsonb_array_elements(payload->'personMonths') p where (p->>'personId')::bigint<>sailor),'Sailor not self-only'; end if;
    assert jsonb_array_length(public.emergency_exercises_performance(extract(year from today)::integer+1)->'personMonths')=0,'Future months became obligations';
    execute 'reset role';
  end loop;
  update public.role_module_permissions set is_visible=false where role_key='marin' and module_key='emergencyExercises';
  actor := 'eec00000-0000-4000-8000-000000000005';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  begin perform public.emergency_exercises_performance(year_value); raise exception 'Hidden module access accepted'; exception when insufficient_privilege then null; end;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  begin perform public.emergency_exercises_performance(year_value); raise exception 'Anonymous access accepted'; exception when insufficient_privilege then null; end;
  execute 'reset role';
end;
$test$;
select 'PASS: monthly objectives, rehires/current period, crew deduplication, read windows, tenant and actual five-role authorization' as result;
rollback;
