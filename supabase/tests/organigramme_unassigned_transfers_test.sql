-- Real role membership and current HR eligibility. Roll back every fixture and assignment.
begin;
do $$
declare
  company bigint;
  actor uuid;
  admin_id uuid := 'a9570000-0000-4000-8000-000000000301';
  direction_id uuid := 'a9570000-0000-4000-8000-000000000302';
  crew bigint;
  office_person bigint;
  future_person bigint;
  alias_person bigint;
  candidate bigint;
  ship bigint;
  empty_ship bigint;
  first_watch bigint;
  second_watch bigint;
  alternate bigint;
  alternate_watch bigint;
  created_watch bigint;
  role_name text;
  n integer := 0;
begin
  assert not has_function_privilege('anon', 'public.move_organigramme_watch_member(bigint,bigint,bigint,bigint,bigint)', 'EXECUTE');
  select id into strict company from public.companies where code = 'bbtm';
  foreach role_name in array array['admin', 'direction', 'capitaine', 'marin'] loop
    n := n + 1;
    actor := ('a9570000-0000-4000-8000-00000000030' || n)::uuid;
    insert into auth.users(id, email) values (actor, 'org-assign-' || role_name || '@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
    values (actor, 'org-assign-' || role_name || '@example.invalid', 'Org assign fixture', company);
    insert into public.company_memberships(company_id, user_id, active)
    values (company, actor, true) on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles(user_id, company_id, role_key) values (actor, company, role_name);
  end loop;
  insert into public.people(company_id, first_name, last_name, grade_label, hired_on, active)
  values (company, 'Affectation', 'MARIN', 'Matelot', current_date - 365, true) returning id into crew;
  insert into public.people(company_id, first_name, last_name, grade_label, hired_on, active)
  values (company, 'Affectation', 'BUREAU', 'Sédentaire', current_date - 365, true) returning id into office_person;
  insert into public.people(company_id, first_name, last_name, grade_label, hired_on, active)
  values (company, 'Affectation', 'FUTUR', 'Matelot', current_date + 10, true) returning id into future_person;
  insert into public.people(company_id, first_name, last_name, grade_label, hired_on, active)
  values (company, 'Affectation', 'ALIAS', 'Matelot', current_date - 365, true) returning id into alias_person;
  insert into private.people_directory_aliases(company_id, alias_person_id, canonical_person_id)
  values (company, alias_person, crew);
  insert into public.vessels(company_id, name, asset_kind, active)
  values (company, 'ORG ASSIGN SHIP', 'vessel', true) returning id into ship;
  insert into public.vessels(company_id, name, asset_kind, active)
  values (company, 'ORG ASSIGN EMPTY SHIP', 'vessel', true) returning id into empty_ship;
  insert into public.organigramme_charts(company_id, name)
  values (company, 'Org assign alternate') returning id into alternate;
  insert into public.organigramme_watches(company_id, chart_id, vessel_id, name)
  values (company, 0, ship, 'Bordée 1') returning id into first_watch;
  insert into public.organigramme_watches(company_id, chart_id, vessel_id, name)
  values (company, 0, ship, 'Bordée 2') returning id into second_watch;
  insert into public.organigramme_watches(company_id, chart_id, vessel_id, name)
  values (company, alternate, ship, 'Bordée 1') returning id into alternate_watch;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  foreach candidate in array array[office_person, future_person, alias_person] loop
    begin
      perform public.move_organigramme_watch_member(0, candidate, null, ship, first_watch);
      raise exception 'Ineligible collaborator could be assigned';
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    perform public.move_organigramme_watch_member(0, crew, null, ship, alternate_watch);
    raise exception 'Cross-chart assignment accepted';
  exception when no_data_found then null; end;
  perform public.move_organigramme_watch_member(0, crew, null, ship, first_watch);
  perform public.move_organigramme_watch_member(0, crew, null, ship, first_watch);
  assert (select revision = 2 from public.organigramme_watches where id = first_watch), 'Replay incremented revision';
  assert exists (select 1 from public.organigramme_watch_members
    where watch_id = first_watch and person_id = crew and function_label = ''), 'Assignment did not inherit HR function';
  begin
    perform public.move_organigramme_watch_member(0, crew, null, ship, second_watch);
    raise exception 'A stale unassigned card created a duplicate';
  exception when unique_violation then null; end;
  begin
    perform public.move_organigramme_watch_member(0, crew, null, empty_ship, null);
    raise exception 'A stale unassigned card created a first watch';
  exception when unique_violation then null; end;
  assert not exists(select 1 from public.organigramme_watches where chart_id = 0 and vessel_id = empty_ship), 'Rejected drop left an empty watch';
  begin
    perform public.save_organigramme_watch(0, first_watch, ship, 'Bordée 1', '[]'::jsonb, 1);
    raise exception 'A stale watch edit removed the new assignment';
  exception when serialization_failure then null; end;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', direction_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', direction_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.move_organigramme_watch_member(alternate, crew, null, empty_ship, null);
  perform public.move_organigramme_watch_member(alternate, crew, null, empty_ship, null);
  select id into strict created_watch from public.organigramme_watches
    where chart_id = alternate and vessel_id = empty_ship and name = 'Bordée 1' and revision = 2;
  assert exists(select 1 from public.organigramme_watch_members where watch_id = created_watch and person_id = crew), 'First watch assignment missing';
  assert exists(select 1 from public.organigramme_watch_members where watch_id = first_watch and person_id = crew), 'Assignment changed principal chart';
  perform public.move_organigramme_watch_member(alternate, crew, created_watch, ship, alternate_watch);
  assert exists(select 1 from public.organigramme_watch_members where watch_id = alternate_watch and person_id = crew), 'Existing transfer from new watch failed';
  execute 'reset role';

  foreach n in array array[3, 4] loop
    actor := ('a9570000-0000-4000-8000-00000000030' || n)::uuid;
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.move_organigramme_watch_member(0, crew, null, ship, second_watch);
      raise exception 'Forbidden profile could assign a crew member';
    exception when insufficient_privilege then null; end;
    execute 'reset role';
  end loop;
end;
$$;
rollback;
