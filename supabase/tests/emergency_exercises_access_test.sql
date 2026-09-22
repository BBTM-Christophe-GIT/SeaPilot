-- Real authenticated profiles; all fixture data is rolled back.
begin;
do $test$
declare
  company bigint; other_company bigint; vessel bigint; vessel2 bigint; other_vessel bigint;
  actor uuid; role_name text; i integer; person bigint; captain bigint; sailor bigint;
  former bigint; outsider bigint; foreign_person bigint; report_id bigint; j integer;
  roster jsonb; report jsonb; total integer;
  captain_user uuid := 'eea00000-0000-4000-8000-000000000004';
begin
  insert into public.companies(code,name) values('exercise-test','Exercise fixture') returning id into company;
  insert into public.companies(code,name) values('exercise-other','Foreign fixture') returning id into other_company;
  insert into public.vessels(company_id,name) values(company,'Exercise vessel') returning id into vessel;
  insert into public.vessels(company_id,name) values(company,'Exercise vessel 2') returning id into vessel2;
  insert into public.vessels(company_id,name) values(other_company,'Foreign vessel') returning id into other_vessel;
  for i in 1..5 loop
    role_name := (array['admin','direction','armement','capitaine','marin'])[i];
    actor := ('eea00000-0000-4000-8000-00000000000'||i)::uuid;
    insert into auth.users(id,email) values(actor,'exercises-'||role_name||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id)
      values(actor,'exercises-'||role_name||'@example.invalid','Exercise '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true)
      on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    if i>=4 then
      insert into public.people(company_id,user_id,first_name,last_name,employment_population,hired_on)
        values(company,actor,'Exercise',role_name,'offshore',current_date-365) returning id into person;
      if i=4 then captain:=person; else sailor:=person; end if;
    end if;
  end loop;
  insert into public.people(company_id,first_name,last_name,employment_population,hired_on,departed_on)
    values(company,'Exercise','Former','offshore',current_date-500,current_date) returning id into former;
  insert into public.people(company_id,first_name,last_name,employment_population,hired_on)
    values(company,'Exercise','Other watch','offshore',current_date-365) returning id into outsider;
  insert into public.people(company_id,first_name,last_name,employment_population,hired_on)
    values(other_company,'Exercise','Foreign','offshore',current_date-365) returning id into foreign_person;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,starts_at,ends_at,watch_group)
    select company,vessel,p,current_date-1,current_date+5,(current_date-1)::timestamptz,(current_date+6)::timestamptz,
      case when p=outsider then 'Bordée B' else 'Bordée A' end
    from unnest(array[captain,sailor,outsider]) p;
  -- Two vessels, two years, excluded workflow states, and a deleted report.
  for j in 1..7 loop
    insert into public.dpr_reports(company_id,vessel_id,report_date,issuer_user_id,issuer_name_snapshot,
      status,dpr_number,submitted_by,submitted_at,validated_by,validated_at,deleted_at,deleted_by,deletion_reason)
    values(company,case when j=2 then vessel2 else vessel end,
      case when j=3 then date '2025-12-31' else make_date(2026,j,1) end,captain_user,'Fixture captain',
      case j when 4 then 'draft' when 5 then 'reopened' when 7 then 'submitted' else 'validated' end,
      j,captain_user,now(),captain_user,now(),case when j=6 then now() end,
      case when j=6 then captain_user end,case when j=6 then 'Fixture deletion' end) returning id into report_id;
    insert into public.dpr_crew_members(dpr_id,company_id,person_id,crew_function,display_name_snapshot)
      values(report_id,company,sailor,'execution','Fixture sailor'),(report_id,company,sailor,'chief-engineer','Fixture sailor'),
      (report_id,company,captain,'captain','Fixture captain');
    insert into public.dpr_emergency_exercises(dpr_id,company_id,exercise_type_key)
      values(report_id,company,'fire-protection');
  end loop;
  insert into public.dpr_reports(company_id,vessel_id,report_date,issuer_user_id,issuer_name_snapshot,status,dpr_number,submitted_by,submitted_at)
    values(company,vessel,date '2026-08-01',captain_user,'Fixture captain','submitted',8,captain_user,now()) returning id into report_id;
  insert into public.dpr_crew_members(dpr_id,company_id,person_id,crew_function,display_name_snapshot)
    values(report_id,company,former,'execution','Former sailor');
  insert into public.dpr_emergency_exercises(dpr_id,company_id,exercise_type_key) values(report_id,company,'abandon-ship');

  for i in 1..5 loop
    actor := ('eea00000-0000-4000-8000-00000000000'||i)::uuid;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    roster := public.emergency_exercises_people();
    assert roster->>'scope'=case when i<=3 then 'fleet' when i=4 then 'watch' else 'self' end,'Wrong role scope';
    assert jsonb_array_length(roster->'people')=case when i<=3 then 4 when i=4 then 2 else 1 end,'Leaked or missing people';
    assert not exists(select 1 from jsonb_array_elements(roster->'people') p where (p->>'id')::bigint=foreign_person),'Foreign sailor leaked';
    report := public.emergency_exercises_report(sailor,2026);
    select sum((x->>'count')::integer) into total from jsonb_array_elements(report->'counts') x;
    assert total=3,'Duplicate crew or excluded DPR counted / legitimate DPR lost';
    report := public.emergency_exercises_report(sailor,2026,vessel2);
    assert jsonb_array_length(report->'counts')=1 and report->'counts'->0->>'month'='2','Vessel filter ignored';
    report := public.emergency_exercises_report(sailor,2025);
    assert jsonb_array_length(report->'counts')=1 and report->'counts'->0->>'month'='12','Year boundary incorrect';
    report := public.emergency_exercises_report(null,2026);
    select sum((x->>'count')::integer) into total from jsonb_array_elements(report->'counts') x;
    assert total=3,'Default collective double counts participants or includes former sailor';
    if i<=3 then
      report := public.emergency_exercises_report(null,2026,null,'all');
      select sum((x->>'count')::integer) into total from jsonb_array_elements(report->'counts') x;
      assert total=4,'All-personnel filter omitted former sailor';
      report := public.emergency_exercises_report(null,2026,null,'former');
      assert jsonb_array_length(report->'counts')=1 and report->'counts'->0->>'exercise_key'='abandon-ship','Former filter incorrect';
    else
      begin perform public.emergency_exercises_report(outsider,2026); raise exception 'Other watch sailor accepted';
        exception when insufficient_privilege then null; end;
    end if;
    if i=5 then
      assert not exists(select 1 from public.dpr_reports where company_id=company),'Raw captain DPR leaked to sailor';
      begin perform public.emergency_exercises_report(captain,2026); raise exception 'Other sailor accepted';
        exception when insufficient_privilege then null; end;
    end if;
    begin perform public.emergency_exercises_report(foreign_person,2026); raise exception 'Foreign sailor accepted';
      exception when insufficient_privilege then null; end;
    begin perform public.emergency_exercises_report(sailor,2026,other_vessel); raise exception 'Foreign vessel accepted';
      exception when insufficient_privilege then null; end;
    begin perform public.emergency_exercises_report(sailor,999999); raise exception 'Invalid year accepted';
      exception when invalid_parameter_value then null; end;
    execute 'reset role';
  end loop;
  -- Cancellation and expiry revoke the captain's watch scope immediately.
  perform set_config('request.jwt.claim.sub',captain_user::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',captain_user,'role','authenticated')::text,true);
  update public.planning_assignments set confirmation_status='cancelled' where company_id=company and crew_person_id=sailor;
  execute 'set local role authenticated';
  assert jsonb_array_length(public.emergency_exercises_people()->'people')=1,'Cancelled watch member remains visible';
  execute 'reset role';
  update public.planning_assignments set confirmation_status='confirmed' where company_id=company;
  update public.planning_assignments set starts_on=current_date-10,ends_on=current_date-5,
    starts_at=(current_date-10)::timestamptz,ends_at=(current_date-4)::timestamptz where company_id=company;
  execute 'set local role authenticated';
  assert jsonb_array_length(public.emergency_exercises_people()->'people')=1,'Expired watch member remains visible';
  execute 'reset role';
  update public.role_module_permissions set is_visible=false where module_key='emergencyExercises' and role_key='capitaine';
  execute 'set local role authenticated';
  begin perform public.emergency_exercises_people(); raise exception 'Revoked module still accessible';
    exception when insufficient_privilege then null; end;
  execute 'reset role';
  update public.role_module_permissions set is_visible=true where module_key='emergencyExercises' and role_key='capitaine';
  update public.company_memberships set active=false where company_id=company and user_id=captain_user;
  execute 'set local role authenticated';
  begin perform public.emergency_exercises_people(); raise exception 'Inactive member still accessible';
    exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform public.emergency_exercises_people(); raise exception 'Anonymous access';
    exception when insufficient_privilege then null; end;
  execute 'reset role';
end;
$test$;
rollback;
select 'Emergency exercise role, isolation, count and filter assertions passed; fixtures rolled back.' as result;
