-- All fixture rows and generated projects are rolled back.
begin;
do $$
declare
  company bigint;
  other_company bigint;
  vessel bigint;
  foreign_vessel bigint;
  inactive_vessel bigint;
  actor uuid;
  role_name text;
  saved record;
  saved_code text;
  project_count bigint;
begin
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies(code, name) values('quick-test-' || gen_random_uuid(), 'Quick project fixture') returning id into other_company;
  insert into public.vessels(company_id, name, active) values(company, '__Quick active__', true) returning id into vessel;
  insert into public.vessels(company_id, name, active) values(company, '__Quick inactive__', false) returning id into inactive_vessel;
  insert into public.vessels(company_id, name, active) values(other_company, '__Quick foreign__', true) returning id into foreign_vessel;

  foreach role_name in array array['admin','direction','armement','capitaine','marin'] loop
    actor := gen_random_uuid();
    insert into auth.users(id,email) values(actor, actor || '@example.invalid');
    insert into public.profiles(id,email,display_name,active_company_id) values(actor,actor || '@example.invalid','Quick project test',company);
    insert into public.company_memberships(company_id,user_id,active) values(company,actor,true) on conflict(company_id,user_id) do update set active=true;
    insert into public.user_roles(user_id,company_id,role_key) values(actor,company,role_name);
    perform set_config('request.jwt.claim.sub',actor::text,true);
    perform set_config('request.jwt.claims',json_build_object('sub',actor,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    if role_name in ('admin','direction') then
      select * into strict saved from public.planning_create_quick_project('  Mission rapide  ', vessel, '2026-09-25');
      assert saved.status = 'Brouillon', 'Operation must remain a draft';
      assert saved.starts_on = '2026-09-25'::date and saved.ends_on = saved.starts_on, 'Operation uses selected cell date';
      assert saved.primary_vessel_id = vessel, 'Operation uses selected vessel';
      select project_code into strict saved_code from public.projects where id=saved.catalog_project_id and status='Brouillon' and title='Mission rapide' and client_id is null;
      assert saved_code ~ '^P[0-9]+$', 'Project must receive a P number';
      assert exists(select 1 from public.project_contracts where project_id=saved.catalog_project_id), 'Contract must exist for later completion';
      assert exists(select 1 from public.planning_operation_vessels where planning_occurrence_id=saved.id and vessel_id=vessel), 'Operation vessel association must exist';
      assert exists(select 1 from public.planning_project_catalog() where id=saved.catalog_project_id and status='Brouillon'), 'Draft must appear in catalog';
      select count(*) into project_count from public.projects;
      begin
        perform public.planning_create_quick_project('Invalid vessel', inactive_vessel, '2026-09-25');
        raise exception 'Inactive vessel accepted';
      exception when sqlstate '22023' or foreign_key_violation then null;
      end;
      assert (select count(*) from public.projects)=project_count, 'Failure must roll back project creation';
      begin
        perform public.planning_create_quick_project('Foreign vessel', foreign_vessel, '2026-09-25');
        raise exception 'Foreign vessel accepted';
      exception when sqlstate '22023' or sqlstate 'P0002' or foreign_key_violation then null;
      end;
      begin
        perform public.planning_create_quick_project('   ', vessel, '2026-09-25');
        raise exception 'Blank title accepted';
      exception when sqlstate '22023' then null;
      end;
      begin
        perform public.planning_create_quick_project('Missing date', vessel, null);
        raise exception 'Missing date accepted';
      exception when sqlstate '22023' then null;
      end;
    else
      begin
        perform public.planning_create_quick_project('Forbidden', vessel, '2026-09-25');
        raise exception 'Unauthorized role accepted';
      exception when insufficient_privilege then null;
      end;
    end if;
    execute 'reset role';
  end loop;
  assert not has_function_privilege('anon', 'public.planning_create_quick_project(text,bigint,date)', 'execute'), 'Anonymous execution allowed';
end;
$$;
rollback;
