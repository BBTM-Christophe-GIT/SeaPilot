-- Run after optimize_planning_company_permission_initplans. Fixture accounts
-- exercise the actual RLS policies; no role-preview session is used.
begin;
do $$
declare
  main_company bigint; other_company bigint; ship_a bigint; ship_b bigint; foreign_ship bigint;
  actor uuid; office uuid := '86300000-0000-0000-0000-000000000001';
  crew bigint; master bigint; outsider bigint; own_person bigint; foreign_person bigint;
  assignment_id bigint; own_assignment bigint; spec record; params record; action_name text;
  expected_ids bigint[]; actual_ids bigint[]; old_allowed boolean; new_allowed boolean;
  checks integer := 0;
begin
  insert into public.companies(code,name) values ('planning-initplan-fixture','Planning initplan fixture') returning id into main_company;
  insert into public.companies(code,name) values ('planning-initplan-other','Planning initplan other') returning id into other_company;
  insert into auth.users(id,email)
  select ('86300000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
    'planning-initplan-' || n || '@example.invalid' from generate_series(1,10) n;
  insert into public.profiles(id,email,display_name,active_company_id)
  select id,email,'Planning initplan fixture',case when right(id::text,2)='07' then other_company else main_company end
  from auth.users where id::text like '86300000-%';
  insert into public.user_roles(user_id,company_id,role_key)
  select profile.id,profile.active_company_id,fixture.role_key
  from (values (1,'admin'),(2,'direction'),(3,'armement'),(4,'marin'),(5,'capitaine'),
    (7,'admin'),(8,'admin'),(9,'armement'),(9,'capitaine')) fixture(n,role_key)
  join public.profiles profile on profile.id=('86300000-0000-0000-0000-' || lpad(fixture.n::text,12,'0'))::uuid;
  update public.company_memberships set active=false where user_id='86300000-0000-0000-0000-000000000008';
  insert into public.people(company_id,user_id,first_name,last_name,active)
  select active_company_id,id,'Planning','INITPLAN ' || right(id::text,2),true
  from public.profiles where id::text like '86300000-%';
  select id into crew from public.people where user_id='86300000-0000-0000-0000-000000000004';
  select id into master from public.people where user_id='86300000-0000-0000-0000-000000000005';
  select id into own_person from public.people where user_id='86300000-0000-0000-0000-000000000010';
  select id into foreign_person from public.people where user_id='86300000-0000-0000-0000-000000000007';
  insert into public.people(company_id,first_name,last_name,active) values(main_company,'Other','INITPLAN CREW',true) returning id into outsider;
  insert into public.vessels(company_id,name,acronym) values(main_company,'INITPLAN SHIP A','IPA') returning id into ship_a;
  insert into public.vessels(company_id,name,acronym) values(main_company,'INITPLAN SHIP B','IPB') returning id into ship_b;
  insert into public.vessels(company_id,name,acronym) values(other_company,'INITPLAN FOREIGN','IPF') returning id into foreign_ship;
  insert into public.planning_vessel_permissions(company_id,user_id,vessel_id,action_key,starts_on,ends_on,reason,granted_by)
  select main_company,'86300000-0000-0000-0000-000000000006',ship_b,action_key,'2039-01-01','2039-01-03','Scoped initplan fixture',office
  from (values ('read'),('edit_event'),('view_history')) actions(action_key);

  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,captain_person_id,starts_on,ends_on,status_label,watch_group)
  values(main_company,ship_a,crew,master,'2039-01-01','2039-01-03','En Mer','Initplan') returning id into assignment_id;
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,status_label,watch_group)
  values(main_company,ship_b,outsider,'2039-01-01','2039-01-03','En Mer','Initplan'),
    (main_company,ship_b,outsider,'2039-02-01','2039-02-03','Repos','Initplan'),
    (other_company,foreign_ship,foreign_person,'2039-01-01','2039-01-03','En Mer','Initplan');
  insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,status_label,watch_group)
  values(main_company,ship_a,own_person,'2039-01-01','2039-01-03','En Mer','Initplan') returning id into own_assignment;
  insert into public.planning_periods(company_id,person_id,vessel_id,crew_name,starts_on,ends_on,sailor_status)
  values(main_company,crew,ship_a,'Initplan crew','2039-01-01','2039-01-03','En Mer'),
    (main_company,outsider,ship_b,'Initplan outsider','2039-01-01','2039-01-03','Repos'),
    (main_company,outsider,ship_b,'Initplan outsider','2039-02-01','2039-02-03','Repos'),
    (main_company,own_person,null,'Initplan own','2039-01-01','2039-01-03','Formation'),
    (other_company,foreign_person,foreign_ship,'Initplan foreign','2039-01-01','2039-01-03','En Mer');
  insert into public.planning_days(company_id,person_id,vessel_id,work_date,sailor_status)
  values(main_company,crew,ship_a,'2039-01-01','En Mer'),(main_company,outsider,ship_b,'2039-01-01','Repos'),
    (main_company,outsider,ship_b,'2039-02-01','Repos'),(main_company,own_person,null,'2039-01-01','Formation'),
    (other_company,foreign_person,foreign_ship,'2039-01-01','En Mer');
  insert into public.planning_board_rows(company_id,vessel_id,person_id,watch_group,created_by)
  values(main_company,ship_a,crew,'Initplan',office),(main_company,ship_b,outsider,'Initplan',office),
    (other_company,foreign_ship,foreign_person,'Initplan',office);
  insert into public.planning_projects(company_id,title,starts_on,ends_on,primary_vessel_id,secondary_vessel_id,status)
  values(main_company,'Initplan ship A','2039-01-01','2039-01-03',ship_a,null,'Brouillon'),
    (main_company,'Initplan ship B','2039-01-01','2039-01-03',ship_b,null,'Brouillon'),
    (main_company,'Initplan mixed','2039-01-01','2039-01-03',ship_a,ship_b,'Brouillon'),
    (main_company,'Initplan undated',null,null,null,null,'Brouillon'),
    (other_company,'Initplan foreign','2039-01-01','2039-01-03',foreign_ship,null,'Brouillon');
  insert into public.planning_change_log(company_id,entity_kind,entity_id,action,vessel_id,starts_on,ends_on)
  values(main_company,'assignment',assignment_id,'update',ship_a,'2039-01-01','2039-01-03'),
    (main_company,'assignment',assignment_id,'update',ship_b,'2039-01-01','2039-01-03'),
    (main_company,'assignment',assignment_id,'update',ship_b,'2039-02-01','2039-02-03'),
    (main_company,'assignment',assignment_id,'update',null,null,null),
    (other_company,'assignment',assignment_id,'update',foreign_ship,'2039-01-01','2039-01-03');
  perform set_config('request.jwt.claim.role','authenticated',true);

  for actor in select id from public.profiles where id::text like '86300000-%' order by id loop
    perform set_config('request.jwt.claim.sub',actor::text,true);
    -- Every original permissive SELECT branch is included, including the ALL
    -- edit policy. Compute the old result as postgres, then use real RLS.
    for spec in select * from (values
      ('planning_periods','public.planning_can_read_row(company_id,vessel_id,person_id,starts_on,ends_on) or public.planning_user_can(''edit_event'',company_id,vessel_id,starts_on,ends_on)'),
      ('planning_assignments','public.planning_can_read_row(company_id,vessel_id,crew_person_id,starts_on,ends_on) or public.planning_user_can(''edit_event'',company_id,vessel_id,starts_on,ends_on)'),
      ('planning_days','public.planning_can_read_row(company_id,vessel_id,person_id,work_date,coalesce(disembark_on,work_date)) or public.planning_user_can(''edit_event'',company_id,vessel_id,work_date,coalesce(disembark_on,work_date))'),
      ('planning_board_rows','public.planning_can_read_row(company_id,vessel_id,person_id,null,null)'),
      ('planning_change_log','public.planning_user_can(''view_history'',company_id,vessel_id,starts_on,ends_on)'),
      ('planning_projects','public.planning_can_read_row(company_id,primary_vessel_id,null,coalesce(starts_on,current_date),coalesce(ends_on,starts_on,current_date)) or (secondary_vessel_id is not null and public.planning_can_read_row(company_id,secondary_vessel_id,null,coalesce(starts_on,current_date),coalesce(ends_on,starts_on,current_date))) or (public.planning_user_can(''edit_event'',company_id,primary_vessel_id,starts_on,coalesce(ends_on,starts_on)) and (secondary_vessel_id is null or public.planning_user_can(''edit_event'',company_id,secondary_vessel_id,starts_on,coalesce(ends_on,starts_on))))')
    ) comparisons(table_name,old_predicate) loop
      execute format('select coalesce(array_agg(id order by id),array[]::bigint[]) from public.%I where company_id in ($1,$2) and (%s)',spec.table_name,spec.old_predicate)
        into expected_ids using main_company,other_company;
      execute 'set local role authenticated';
      execute format('select coalesce(array_agg(id order by id),array[]::bigint[]) from public.%I where company_id in ($1,$2)',spec.table_name)
        into actual_ids using main_company,other_company;
      execute 'reset role';
      if actual_ids is distinct from expected_ids then raise exception 'RLS visibility changed for fixture % on %',right(actor::text,2),spec.table_name; end if;
      checks:=checks+1;
    end loop;
    select coalesce(array_agg(id order by id),array[]::bigint[]) into expected_ids
      from public.planning_assignments where company_id in(main_company,other_company)
      and company_id=public.current_planning_company_id()
      and public.planning_can_read_row(company_id,vessel_id,crew_person_id,starts_on,ends_on);
    execute 'set local role authenticated';
    select coalesce(array_agg(id order by id),array[]::bigint[]) into actual_ids
      from public.planning_assignment_overview() where id in(select id from public.planning_assignments where company_id in(main_company,other_company));
    execute 'reset role';
    if actual_ids is distinct from expected_ids then raise exception 'Assignment RPC changed for fixture %',right(actor::text,2); end if;
    checks:=checks+1;

    -- Check NULL vessel/person/dates and dates outside delegated grants too.
    for params in select * from (values
      (main_company,ship_a,crew,date '2039-01-01',date '2039-01-03'),
      (main_company,ship_b,outsider,date '2039-01-01',date '2039-01-03'),
      (main_company,ship_b,outsider,date '2039-02-01',date '2039-02-03'),
      (main_company,null::bigint,own_person,null::date,null::date),
      (main_company,null::bigint,null::bigint,null::date,null::date),
      (other_company,foreign_ship,foreign_person,date '2039-01-01',date '2039-01-03'),
      (null::bigint,null::bigint,null::bigint,null::date,null::date)
    ) cases(company_id,vessel_id,person_id,starts_on,ends_on) loop
      old_allowed:=public.planning_can_read_row(params.company_id,params.vessel_id,params.person_id,params.starts_on,params.ends_on);
      new_allowed:=params.company_id=public.current_planning_company_id()
        and (public.planning_can_read_row(public.current_planning_company_id(),null,null,null,null) or old_allowed);
      if coalesce(old_allowed,false) is distinct from coalesce(new_allowed,false) then raise exception 'Read predicate changed for fixture %',right(actor::text,2); end if;
      checks:=checks+1;
      foreach action_name in array array['edit_event','view_history'] loop
        old_allowed:=public.planning_user_can(action_name,params.company_id,params.vessel_id,params.starts_on,params.ends_on);
        new_allowed:=params.company_id=public.current_planning_company_id()
          and (public.planning_user_can(action_name,public.current_planning_company_id(),null,null,null) or old_allowed);
        if coalesce(old_allowed,false) is distinct from coalesce(new_allowed,false) then raise exception 'Action predicate changed for fixture %',right(actor::text,2); end if;
        checks:=checks+1;
      end loop;
    end loop;
  end loop;
  if checks<>280 then raise exception 'Expected 280 equivalence assertions, ran %',checks; end if;
  if has_function_privilege('anon','public.planning_assignment_overview()','EXECUTE') then raise exception 'Anonymous assignment access changed'; end if;
end $$;
rollback;
select '280 real-role RLS/RPC/tenant/delegation/null equivalence checks passed; all fixtures rolled back' as result;

