-- Real JWT profiles and Paris-relative dates. All fixtures and fictitious
-- signature metadata roll back; no signature file is uploaded or used.
begin;

do $test$
declare
  today date := timezone('Europe/Paris', statement_timestamp())::date;
  earliest date := (timezone('Europe/Paris', statement_timestamp())::date - interval '2 months')::date;
  company bigint; foreign_company bigint; vessel bigint;
  actor uuid; person bigint; captain bigint; sailor bigint; other_captain bigint;
  role_name text; label text; day_fixture record; approval bigint; register bigint;
  assignment bigint; starts_at timestamptz; ends_at timestamptz; saved bigint;
  day_context jsonb;
begin
  assert public.working_time_captain_approval_date_allowed(earliest), 'Calendar two-month boundary excluded';
  assert public.working_time_captain_approval_date_allowed(today), 'Today excluded';
  assert not public.working_time_captain_approval_date_allowed(earliest-1), 'Day before calendar boundary allowed';
  assert not public.working_time_captain_approval_date_allowed(today+1), 'Future captain approval allowed';
  assert not public.working_time_captain_approval_date_allowed(null), 'NULL captain approval date allowed';
  assert has_function_privilege('authenticated','public.working_time_captain_approval_date_allowed(date)','EXECUTE'),
    'Approval-window capability unavailable to authenticated';
  assert not has_function_privilege('anon','public.working_time_captain_approval_date_allowed(date)','EXECUTE'),
    'Approval-window capability exposed to anonymous';
  -- The Marin manual-entry grace period is a separate, unchanged rule.
  assert public.working_time_entry_date_is_open(date '2026-12-31',date '2027-01-05'), 'Marin grace period shortened';
  assert not public.working_time_entry_date_is_open(date '2026-12-31',date '2027-01-06'), 'Marin grace period extended';

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  insert into public.companies(code,name) values('wt-window-'||gen_random_uuid(),'Captain approval window fixture') returning id into company;
  insert into public.companies(code,name) values('wt-window-foreign-'||gen_random_uuid(),'Foreign approval window fixture') returning id into foreign_company;
  insert into public.vessels(company_id,name,acronym,active,asset_kind)
    values(company,'Captain approval window vessel','WTCW',true,'vessel') returning id into vessel;

  create temp table wt_window_actors(fixture_key text primary key,user_id uuid,person_id bigint,company_id bigint,role_key text);
  foreach label in array array['captain','other-captain','sailor','peer','admin','direction','armement','foreign'] loop
    actor:=gen_random_uuid();
    role_name:=case when label in ('captain','other-captain','foreign') then 'capitaine'
      when label in ('sailor','peer') then 'marin' else label end;
    insert into auth.users(id,email) values(actor,actor::text||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id)
      values(actor,actor::text||'@example.invalid','Approval window '||label,case when label='foreign' then foreign_company else company end);
    insert into public.company_memberships(company_id,user_id,active)
      values(case when label='foreign' then foreign_company else company end,actor,true)
      on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key)
      values(actor,case when label='foreign' then foreign_company else company end,role_name);
    insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,hired_on,active)
      values(case when label='foreign' then foreign_company else company end,actor,'Approval window',label,
        case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,actor::text,earliest-30,true) returning id into person;
    insert into wt_window_actors values(label,actor,person,case when label='foreign' then foreign_company else company end,role_name);
    -- Synthetic metadata only. The RPC freezes it without reading a file.
    insert into public.working_time_profile_signatures
      (company_id,person_id,version_number,storage_bucket,storage_path,mime_type,file_size_bytes,sha256,valid_from)
    values(case when label='foreign' then foreign_company else company end,person,1,'working-time-signatures',
      'fixture-only/approval-window/'||actor||'.png','image/png',128,repeat('a',64),earliest::timestamptz);
  end loop;
  select person_id into captain from wt_window_actors where fixture_key='captain';
  select person_id into other_captain from wt_window_actors where fixture_key='other-captain';
  select person_id into sailor from wt_window_actors where fixture_key='sailor';
  -- Privileged fixture inserts still pass the real workflow trigger's actor
  -- checks. Use the fixture Admin without changing the PostgreSQL setup role.
  select user_id into actor from wt_window_actors where fixture_key='admin';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);

  insert into public.planning_work_rest_policies
    (company_id,name,scope,vessel_id,effective_from,effective_to,max_work_24h,min_rest_24h,
      max_work_7d,min_rest_7d,min_consecutive_rest_hours,max_rest_periods_24h,
      night_starts_at,night_ends_at,max_night_work_24h,include_handover,active)
  values(company,'Captain window fixture policy','vessel',vessel,earliest-10,today+2,
    12,10,84,52,6,6,'22:00','06:00',10,false,true);

  create temp table wt_window_days(fixture_key text primary key,work_date date,register_id bigint,interval_id bigint,approval_id bigint);
  insert into wt_window_days(fixture_key,work_date) values
    ('old',earliest-1),('boundary',earliest),('historical',(today-interval '1 month')::date),
    ('today',today),('future',today+1),('other-approver',earliest+1),('self',today),
    ('pending-in-window',(today-interval '1 month')::date+1),
    ('fallback-direction',earliest-2),('fallback-admin',earliest-3),('fallback-armement',earliest-4);

  for day_fixture in select * from wt_window_days order by work_date,fixture_key loop
    person:=case when day_fixture.fixture_key='self' then captain else sailor end;
    select user_id into actor from wt_window_actors where person_id=person;
    insert into public.working_time_registers(company_id,person_id,period_kind,period_start,period_end,status)
      values(company,person,'monthly',date_trunc('month',day_fixture.work_date)::date,
        (date_trunc('month',day_fixture.work_date)+interval '1 month - 1 day')::date,'draft')
      on conflict(company_id,person_id,period_kind,period_start,period_end) do nothing;
    select id into strict register from public.working_time_registers r where r.company_id=company and r.person_id=person
      and r.period_kind='monthly' and r.period_start=date_trunc('month',day_fixture.work_date)::date;
    starts_at:=(day_fixture.work_date::timestamp+interval '8 hours') at time zone 'Europe/Paris';
    ends_at:=(day_fixture.work_date::timestamp+case when day_fixture.fixture_key='boundary' then interval '22 hours' else interval '9 hours' end)
      at time zone 'Europe/Paris';
    insert into public.working_time_intervals
      (company_id,register_id,person_id,local_work_date,starts_at,ends_at,timezone_name,utc_offset_minutes,
        vessel_id,watch_group,author_user_id,author_person_id,source_type,source_record_key)
    values(company,register,person,day_fixture.work_date,starts_at,ends_at,'Europe/Paris',
      (extract(epoch from ((starts_at at time zone 'Europe/Paris')-(starts_at at time zone 'UTC')))/60)::integer,
      vessel,'Bordée historique',actor,person,'migration','approval-window-'||day_fixture.fixture_key)
    returning id into saved;
    assignment:=null;
    if day_fixture.fixture_key not like 'fallback-%' then
      insert into public.planning_assignments
        (company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,starts_at,ends_at,
          assignment_role,status_label,confirmation_status,watch_group,source_label)
      values(company,vessel,captain,person,day_fixture.work_date,day_fixture.work_date,
        day_fixture.work_date::timestamp at time zone 'Europe/Paris',
        (day_fixture.work_date::timestamp+interval '23 hours 59 minutes') at time zone 'Europe/Paris',
        case when person=captain then '2nd Capitaine' else 'Matelot' end,'En mer','confirmed','Bordée historique','approval-window')
      returning id into assignment;
      if person<>captain then
        insert into public.planning_assignments
          (company_id,vessel_id,captain_person_id,crew_person_id,starts_on,ends_on,starts_at,ends_at,
            assignment_role,status_label,confirmation_status,watch_group,source_label)
        values(company,vessel,captain,captain,day_fixture.work_date,day_fixture.work_date,
          day_fixture.work_date::timestamp at time zone 'Europe/Paris',
          (day_fixture.work_date::timestamp+interval '23 hours 59 minutes') at time zone 'Europe/Paris',
          '2nd Capitaine','En mer','confirmed','Bordée historique','approval-window');
      end if;
    end if;
    insert into public.working_time_day_approvals
      (company_id,register_id,person_id,local_work_date,status,planning_assignment_id,vessel_id,watch_group,
        approver_person_id,submitted_by,submitted_by_person_id,submitted_at,subject_signature_snapshot,
        subject_identity_snapshot,approver_identity_snapshot,vessel_snapshot,watch_snapshot)
    values(company,register,person,day_fixture.work_date,'submitted',assignment,vessel,'Bordée historique',
      case when day_fixture.fixture_key like 'fallback-%' or day_fixture.fixture_key='self' then null
        when day_fixture.fixture_key='other-approver' then other_captain else captain end,
      actor,person,starts_at,jsonb_build_object('signer_person_id',person,'sha256',repeat('b',64),'fixture',true),
      jsonb_build_object('person_id',person),jsonb_build_object('person_id',captain),
      jsonb_build_object('id',vessel),jsonb_build_object('watch_group','Bordée historique')) returning id into approval;
    update wt_window_days set register_id=register,interval_id=saved,approval_id=approval where fixture_key=day_fixture.fixture_key;
  end loop;
  grant select on wt_window_actors,wt_window_days to authenticated;

  -- A peer captain shares a pending day's watch but is not its approver.
  insert into public.planning_assignments
    (company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,status_label,confirmation_status,watch_group)
  values(company,vessel,other_captain,(today-interval '1 month')::date+1,(today-interval '1 month')::date+1,
    '2nd Capitaine','En mer','confirmed','Bordée historique');
  assert public.working_time_day_has_non_compliance((select register_id from wt_window_days where fixture_key='boundary'),earliest),
    'Boundary fixture must retain a real calculated non-conformity';

  select user_id into actor from wt_window_actors where fixture_key='captain';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
  assert public.working_time_captain_matches_day(company,sailor,captain,earliest), 'Historical confirmed assignment no longer matches';
  assert public.working_time_captain_matches_day(company,sailor,other_captain,(today-interval '1 month')::date+1),
    'Other-captain denial must exercise a genuine same-watch Planning candidate';
  execute 'set local role authenticated';
  assert exists(select 1 from public.working_time_registers where id=(select register_id from wt_window_days where fixture_key='historical')),
    'Captain lost historical monthly register access';
  assert exists(select 1 from public.working_time_day_approvals where id=(select approval_id from wt_window_days where fixture_key='old')),
    'Approval window unexpectedly removed historical reads';
  assert exists(select 1 from public.working_time_intervals where id=(select interval_id from wt_window_days where fixture_key='historical')),
    'Captain lost historical interval access';
  day_context:=public.working_time_entry_context(earliest,today);
  assert exists(select 1 from jsonb_array_elements(day_context->'readable_people') p where (p->>'person_id')::bigint=sailor),
    'Captain historical personnel disappeared';

  foreach label in array array['old','future','other-approver','self','fallback-direction'] loop
    select * into strict day_fixture from wt_window_days where wt_window_days.fixture_key=label;
    begin
      perform public.validate_working_time_day(day_fixture.approval_id);
      raise exception 'Captain validated forbidden % day',label;
    exception when insufficient_privilege then null; end;
  end loop;
  foreach label in array array['old','future'] loop
    select * into strict day_fixture from wt_window_days where wt_window_days.fixture_key=label;
    begin
      perform public.save_working_time_phases(day_fixture.register_id,
        jsonb_build_array(jsonb_build_object('starts_at',(day_fixture.work_date::timestamp+interval '10 hours') at time zone 'Europe/Paris',
          'ends_at',(day_fixture.work_date::timestamp+interval '11 hours') at time zone 'Europe/Paris')),'Europe/Paris');
      raise exception 'Captain edited forbidden % day',label;
    exception when insufficient_privilege then null; end;
    begin
      perform public.save_working_time_day_comment(day_fixture.register_id,day_fixture.work_date,
        'safety_emergency','Contexte fixture','Mesure fixture','Repos fixture','Justification fixture');
      raise exception 'Captain commented forbidden % day',label;
    exception when insufficient_privilege then null; end;
  end loop;

  -- Both ends of the window remain available, and compliance still gates approval.
  select * into strict day_fixture from wt_window_days where fixture_key='boundary';
  begin
    perform public.validate_working_time_day(day_fixture.approval_id);
    raise exception 'Non-compliant boundary day validated without justification';
  exception when check_violation then
    assert sqlerrm='WORKING_TIME_NON_COMPLIANCE_DETAILS_REQUIRED.', 'Unexpected boundary compliance refusal';
  end;
  perform public.validate_working_time_day_with_comment(day_fixture.approval_id,
    'safety_emergency','Intervention urgente fixture','Relève organisée fixture','Repos compensateur fixture','Écart documenté fixture');
  select * into strict day_fixture from wt_window_days where fixture_key='historical';
  perform public.validate_working_time_day(day_fixture.approval_id);
  select * into strict day_fixture from wt_window_days where fixture_key='today';
  perform public.save_working_time_phases(day_fixture.register_id,
    jsonb_build_array(jsonb_build_object('starts_at',(today::timestamp+interval '10 hours') at time zone 'Europe/Paris',
      'ends_at',(today::timestamp+interval '11 hours') at time zone 'Europe/Paris')),'Europe/Paris');
  perform public.validate_working_time_day(day_fixture.approval_id);
  execute 'reset role';

  assert (select status='validated' and validated_by_person_id=captain
    and (subject_signature_snapshot->>'signer_person_id')::bigint=sailor
    and (approver_signature_snapshot->>'signer_person_id')::bigint=captain
    and planning_assignment_id is not null and vessel_id=vessel and watch_group='Bordée historique'
    and jsonb_array_length(interval_snapshot)=1 and jsonb_array_length(non_compliance_snapshot)>0
    from public.working_time_day_approvals where id=(select approval_id from wt_window_days where fixture_key='boundary')),
    'Approval changed historical attribution, signatures, hours or violation evidence';
  assert exists(select 1 from public.working_time_day_approval_events where day_approval_id=
    (select approval_id from wt_window_days where fixture_key='boundary') and event_type='validated' and actor_person_id=captain),
    'Captain validation lost its immutable audit event';
  assert exists(select 1 from public.working_time_intervals where id=(select interval_id from wt_window_days where fixture_key='boundary') and voided_at is null),
    'Boundary validation removed recorded work';

  foreach label in array array['other-captain','foreign','sailor','peer'] loop
    select user_id into actor from wt_window_actors where wt_window_actors.fixture_key=label;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    begin
      perform public.validate_working_time_day((select approval_id from wt_window_days where fixture_key='pending-in-window'));
      raise exception 'Forbidden profile % validated sailor day',label;
    exception when insufficient_privilege then null; end;
    if label in ('foreign','peer') then
      assert not exists(select 1 from public.working_time_day_approvals where person_id=sailor),label||' leaked sailor approvals';
    elsif label='sailor' then
      assert exists(select 1 from public.working_time_intervals where id=(select interval_id from wt_window_days where fixture_key='old')),
        'Marin lost their own historical reads';
    end if;
    execute 'reset role';
  end loop;

  -- The new captain cutoff must not narrow existing management fallback rights.
  foreach label in array array['direction','admin','armement'] loop
    select user_id into actor from wt_window_actors where wt_window_actors.fixture_key=label;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    assert exists(select 1 from public.working_time_registers where id=(select register_id from wt_window_days where fixture_key='old')),
      label||' lost company history';
    perform public.validate_working_time_day((select approval_id from wt_window_days where fixture_key='fallback-'||label));
    if label='direction' then
      begin
        perform public.validate_working_time_day((select approval_id from wt_window_days where fixture_key='old'));
        raise exception 'Direction took an approval assigned to a captain';
      exception when insufficient_privilege then null; end;
    end if;
    execute 'reset role';
  end loop;
  assert (select count(*)=3 from public.working_time_day_approvals where id in
    (select approval_id from wt_window_days where fixture_key like 'fallback-%') and status='validated'),
    'Management fallback approval outside captain window changed';
  assert (select count(*)=5 from public.working_time_day_approvals where id in
    (select approval_id from wt_window_days where fixture_key in ('old','future','other-approver','self','pending-in-window')) and status='submitted'),
    'A refused captain/profile mutation changed pending evidence';
end;
$test$;

rollback;
select 'Captain calendar approval window, historical access, correction, compliance and real-profile isolation passed; fixtures rolled back.' as result;
