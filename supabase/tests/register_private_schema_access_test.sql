-- Regress the private-schema lookup required by invoker RPCs and LSA RLS.
-- Full write/scope matrices live in the LSA and emergency exercise suites.
begin;

do $test$
declare
  company bigint; vessel bigint; item bigint; designation bigint; person bigint;
  actor uuid; role_name text; signature text; routine oid; roster jsonb;
begin
  assert has_schema_privilege('authenticated','private','USAGE'), 'Authenticated invoker cannot resolve private functions';
  assert not has_schema_privilege('authenticated','private','CREATE'), 'Authenticated can create private objects';
  assert not has_schema_privilege('anon','private','USAGE'), 'Anonymous can resolve private objects';
  assert not has_schema_privilege('anon','private','CREATE'), 'Anonymous can create private objects';
  assert not exists (
    select 1 from pg_namespace n,
      lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
    where n.nspname='private' and a.grantee=0 and a.privilege_type in ('USAGE','CREATE')
  ), 'PUBLIC received private-schema access';

  foreach signature in array array[
    'public.lsa_available_vessels()',
    'public.lsa_can_add_item(bigint)',
    'public.lsa_next_item_number(bigint,bigint)',
    'public.save_lsa_item(bigint,jsonb,bigint,timestamptz)',
    'public.save_lsa_catalog_entry(text,jsonb)',
    'public.update_lsa_item_expiry(bigint,date,timestamptz)',
    'public.delete_lsa_item(bigint,timestamptz)',
    'public.emergency_exercises_people()',
    'public.emergency_exercises_report(bigint,integer,bigint,text)'
  ] loop
    routine:=signature::regprocedure::oid;
    assert not (select prosecdef from pg_proc where oid=routine), signature||' bypasses its invoker';
    assert has_function_privilege('authenticated',routine,'EXECUTE'), signature||' unavailable to authenticated';
    assert not has_function_privilege('anon',routine,'EXECUTE'), signature||' available to anonymous';
    assert not exists (
      select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=routine and a.grantee=0 and a.privilege_type='EXECUTE'
    ), signature||' executable by PUBLIC';
  end loop;

  foreach signature in array array[
    'private.lsa_has_access()',
    'private.lsa_can_add_item(bigint)',
    'private.lsa_next_item_number(bigint,bigint)',
    'private.save_lsa_item(bigint,jsonb,bigint,timestamptz)',
    'private.save_lsa_catalog_entry(text,jsonb)',
    'private.update_lsa_item_expiry(bigint,date,timestamptz)',
    'private.delete_lsa_item(bigint,timestamptz)',
    'private.emergency_exercises_people()',
    'private.emergency_exercises_report(bigint,integer,bigint,text)'
  ] loop
    routine:=signature::regprocedure::oid;
    assert has_function_privilege('authenticated',routine,'EXECUTE'), signature||' blocks an invoker or RLS';
    assert not has_function_privilege('anon',routine,'EXECUTE'), signature||' available to anonymous';
    assert not exists (
      select 1 from pg_proc p, lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=routine and a.grantee=0 and a.privilege_type='EXECUTE'
    ), signature||' executable by PUBLIC';
  end loop;

  assert not has_table_privilege('authenticated','private.lsa_transfer_audit','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'Transfer audit exposed';
  assert not has_table_privilege('authenticated','private.lsa_designation_counters','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'Number counters exposed';
  assert not has_table_privilege('authenticated','private.planning_calendar_subscriptions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), 'Private calendar subscriptions exposed';
  assert not has_function_privilege('authenticated','private.can_access_lsa_vessel(bigint,bigint)','EXECUTE'), 'Internal vessel helper exposed';
  assert not has_function_privilege('authenticated','private.seed_lsa_catalog(bigint)','EXECUTE'), 'Internal catalogue seed exposed';
  assert not has_function_privilege('authenticated','private.seed_new_company_lsa_catalog()','EXECUTE'), 'Internal catalogue trigger exposed';
  execute 'set local role authenticated';
  begin
    perform 1 from private.lsa_transfer_audit;
    raise exception 'Authenticated read private audit directly';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.lsa_designation_counters;
    raise exception 'Authenticated read private counters directly';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.planning_calendar_subscriptions;
    raise exception 'Authenticated read private calendar subscriptions directly';
  exception when insufficient_privilege then null; end;
  begin
    perform private.can_access_lsa_vessel(null,null);
    raise exception 'Authenticated called internal vessel helper';
  exception when insufficient_privilege then null; end;
  begin
    execute 'create table private.register_access_probe (id bigint)';
    raise exception 'Authenticated created a private table';
  exception when insufficient_privilege then null; end;
  execute 'reset role';

  insert into public.companies(code,name)
    values('register-acl-'||gen_random_uuid(),'Register schema access fixture') returning id into company;
  insert into public.vessels(company_id,name,acronym,active,asset_kind)
    values(company,'Register schema access vessel','RACL',true,'vessel') returning id into vessel;
  select id into strict designation from public.lsa_designations where company_id=company and name='EPIRB';
  insert into public.lsa_items(company_id,vessel_id,title,category_key,issued_on,expires_on)
    values(company,vessel,'Register schema access item','07-2-life-jacket',current_date-1,current_date+1) returning id into item;

  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    perform set_config('request.jwt.claim.sub','',true);
    perform set_config('request.jwt.claims','{}',true);
    actor:=gen_random_uuid();
    insert into auth.users(id,email) values(actor,actor::text||'@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id)
      values(actor,actor::text||'@example.invalid','Register ACL '||role_name,company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true)
      on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    if role_name in ('capitaine','marin') then
      insert into public.people(company_id,user_id,first_name,last_name,function_label,sailor_number,active,employment_population,hired_on)
        values(company,actor,'Register ACL',role_name,case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,
          actor::text,true,'offshore',current_date-365) returning id into person;
      insert into public.planning_assignments(company_id,vessel_id,crew_person_id,starts_on,ends_on,assignment_role,confirmation_status)
        values(company,vessel,person,current_date-1,current_date+1,
          case when role_name='capitaine' then 'Capitaine' else 'Matelot' end,'confirmed');
    end if;
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    assert exists(select 1 from public.lsa_items where id=item), role_name||' cannot traverse LSA RLS';
    assert exists(select 1 from public.lsa_available_vessels() where id=vessel), role_name||' cannot load LSA vessels';
    assert public.lsa_can_add_item(vessel), role_name||' cannot traverse LSA capability wrapper';
    assert public.lsa_next_item_number(vessel,designation)=1, role_name||' cannot traverse LSA numbering wrapper';
    roster:=public.emergency_exercises_people();
    assert roster->>'scope'=case when role_name in ('admin','direction','armement') then 'fleet'
      when role_name='capitaine' then 'watch' else 'self' end, role_name||' exercise scope changed';
    assert jsonb_array_length(public.emergency_exercises_report(null,2026)->'counts')=0,
      role_name||' cannot traverse exercise report wrapper';
    execute 'reset role';

    -- Schema USAGE must preserve navigation/module checks for every real role.
    update public.role_module_permissions set is_visible=false where role_key=role_name and module_key in ('lsa','emergencyExercises');
    execute 'set local role authenticated';
    assert not exists(select 1 from public.lsa_items), role_name||' disabled LSA module still readable';
    assert not exists(select 1 from public.lsa_available_vessels()), role_name||' disabled LSA module leaked vessels';
    assert not public.lsa_can_add_item(vessel), role_name||' disabled LSA module retained capability';
    begin
      perform public.emergency_exercises_people();
      raise exception 'Disabled exercise module remained accessible for %',role_name;
    exception when insufficient_privilege then null; end;
    begin
      perform public.emergency_exercises_report(null,2026);
      raise exception 'Disabled exercise module report remained accessible for %',role_name;
    exception when insufficient_privilege then null; end;
    execute 'reset role';
    update public.role_module_permissions set is_visible=true where role_key=role_name and module_key in ('lsa','emergencyExercises');

    update public.company_memberships set active=false where company_id=company and user_id=actor;
    execute 'set local role authenticated';
    assert not exists(select 1 from public.lsa_items), role_name||' inactive membership retained LSA access';
    assert not exists(select 1 from public.lsa_available_vessels()), role_name||' inactive membership retained LSA vessels';
    assert not public.lsa_can_add_item(vessel), role_name||' inactive membership retained LSA capability';
    begin
      perform public.emergency_exercises_people();
      raise exception 'Inactive member retained exercise access for %',role_name;
    exception when insufficient_privilege then null; end;
    begin
      perform public.emergency_exercises_report(null,2026);
      raise exception 'Inactive member retained exercise report access for %',role_name;
    exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;

  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  execute 'set local role anon';
  begin
    perform 1 from public.lsa_items;
    raise exception 'Anonymous read LSA inventory';
  exception when insufficient_privilege then null; end;
  begin
    perform public.lsa_available_vessels();
    raise exception 'Anonymous accessed LSA vessels';
  exception when insufficient_privilege then null; end;
  begin
    perform public.emergency_exercises_people();
    raise exception 'Anonymous accessed exercise roster';
  exception when insufficient_privilege then null; end;
  begin
    perform public.emergency_exercises_report(null,2026);
    raise exception 'Anonymous accessed exercise report';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end;
$test$;
rollback;

select 'Private-schema privileges, invoker RPCs and five-profile register denials passed; fixtures rolled back.' as result;
