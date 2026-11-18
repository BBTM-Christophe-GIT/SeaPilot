-- Exercise the same RPC with distinct real authenticated roles and roll back all changes.
begin;
do $$
declare
  company bigint;
  other_company bigint;
  person bigint;
  missing_person bigint;
  ship bigint;
  other_ship bigint;
  empty_ship bigint;
  foreign_ship bigint;
  source bigint;
  same_ship_watch bigint;
  other_ship_watch bigint;
  new_watch bigint;
  other_chart bigint;
  other_chart_watch bigint;
  actor uuid;
  role_name text;
  n integer := 0;
begin
  assert not has_function_privilege('anon', 'public.move_organigramme_watch_member(bigint,bigint,bigint,bigint,bigint)', 'EXECUTE');
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies(code, name) values ('org-transfer-other', 'Organigramme transfer tenant')
  returning id into other_company;
  foreach role_name in array array['admin', 'direction', 'capitaine', 'marin'] loop
    n := n + 1;
    actor := ('a9570000-0000-4000-8000-00000000020' || n)::uuid;
    insert into auth.users(id, email) values (actor, 'org-transfer-' || role_name || '@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id)
    values (actor, 'org-transfer-' || role_name || '@example.invalid', 'Org transfer fixture', company);
    insert into public.company_memberships(company_id, user_id, active)
    values (company, actor, true) on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles(user_id, company_id, role_key) values (actor, company, role_name);
  end loop;

  insert into public.people(company_id, first_name, last_name, hired_on, active)
  values (company, 'Transfert', 'PERSONNE', current_date - 365, true) returning id into person;
  insert into public.people(company_id, first_name, last_name, hired_on, active)
  values (company, 'Transfert', 'ABSENT', current_date - 365, true) returning id into missing_person;
  insert into public.vessels(company_id, name, asset_kind, active)
  values (company, 'ORG TRANSFER SHIP', 'vessel', true) returning id into ship;
  insert into public.vessels(company_id, name, asset_kind, active)
  values (company, 'ORG TRANSFER OTHER SHIP', 'vessel', true) returning id into other_ship;
  insert into public.vessels(company_id, name, asset_kind, active)
  values (company, 'ORG TRANSFER EMPTY SHIP', 'vessel', true) returning id into empty_ship;
  insert into public.vessels(company_id, name, asset_kind, active)
  values (other_company, 'ORG TRANSFER FOREIGN SHIP', 'vessel', true) returning id into foreign_ship;
  insert into public.organigramme_charts(company_id, name)
  values (company, 'Org transfer alternate') returning id into other_chart;
  insert into public.organigramme_watches(company_id, chart_id, vessel_id, name)
  values (company, other_chart, other_ship, 'Bordée 1') returning id into other_chart_watch;
  insert into public.organigramme_watches(company_id, chart_id, vessel_id, name)
  values (company, 0, ship, 'Bordée 1') returning id into source;
  insert into public.organigramme_watches(company_id, chart_id, vessel_id, name)
  values (company, 0, ship, 'Bordée 2') returning id into same_ship_watch;
  insert into public.organigramme_watches(company_id, chart_id, vessel_id, name)
  values (company, 0, other_ship, 'Bordée 1') returning id into other_ship_watch;
  insert into public.organigramme_watch_members(company_id, watch_id, person_id, function_label)
  values (company, source, person, 'Fonction personnalisée'), (company, other_chart_watch, person, '');
  insert into public.planning_board_rows(company_id, vessel_id, person_id, watch_group, function_label, created_by)
  values (company, ship, person, 'Bordée 1', 'Fonction planning', 'a9570000-0000-4000-8000-000000000201');

  n := 0;
  foreach role_name in array array['admin', 'direction', 'capitaine', 'marin'] loop
    n := n + 1;
    actor := ('a9570000-0000-4000-8000-00000000020' || n)::uuid;
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    if role_name = 'admin' then
      begin
        perform public.move_organigramme_watch_member(0, person, source, other_ship, other_chart_watch);
        raise exception 'Cross-chart transfer accepted';
      exception when no_data_found then null; end;
      begin
        perform public.move_organigramme_watch_member(0, person, source, foreign_ship, null);
        raise exception 'Cross-company destination accepted';
      exception when insufficient_privilege then null; end;
      begin
        perform public.move_organigramme_watch_member(0, missing_person, source, empty_ship, null);
        raise exception 'Unassigned person accepted by move';
      exception when no_data_found then null; end;
      assert not exists(select 1 from public.organigramme_watches where vessel_id = empty_ship and chart_id = 0), 'Failed transfer created a watch';
      assert exists(select 1 from public.organigramme_watch_members where watch_id = source and person_id = person), 'Rejected transfer changed source';

      perform public.move_organigramme_watch_member(0, person, source, ship, same_ship_watch);
      perform public.move_organigramme_watch_member(0, person, source, ship, same_ship_watch);
      assert (select count(*) = 2 from public.organigramme_watches where id in (source, same_ship_watch) and revision = 2), 'Replay changed watch revisions';
      begin
        perform public.save_organigramme_watch(0, same_ship_watch, ship, 'Bordée 2', '[]'::jsonb, 1);
        raise exception 'Stale editor overwrote transfer';
      exception when serialization_failure then null; end;
      perform public.move_organigramme_watch_member(0, person, same_ship_watch, empty_ship, null);
      perform public.move_organigramme_watch_member(0, person, same_ship_watch, empty_ship, null);
      select id into strict new_watch from public.organigramme_watches where vessel_id = empty_ship and chart_id = 0 and name = 'Bordée 1';
      assert not exists(select 1 from public.organigramme_watch_members where watch_id in (source, same_ship_watch) and person_id = person), 'Moved person still assigned to source watches';
      assert exists(select 1 from public.organigramme_watch_members where watch_id = new_watch and person_id = person and function_label = 'Fonction personnalisée'), 'Function override was lost';
      perform public.move_organigramme_watch_member(0, person, new_watch, ship, source);
    elsif role_name = 'direction' then
      perform public.move_organigramme_watch_member(0, person, source, other_ship, other_ship_watch);
      assert exists(select 1 from public.organigramme_watch_members where watch_id = other_ship_watch and person_id = person), 'Direction could not transfer across vessels';
      assert exists(select 1 from public.organigramme_watch_members where watch_id = other_chart_watch and person_id = person and function_label = ''), 'Transfer mutated other chart';
      assert exists(select 1 from public.planning_board_rows where vessel_id = ship and person_id = person and function_label = 'Fonction planning'), 'Transfer changed Planning';
      perform public.move_organigramme_watch_member(0, person, other_ship_watch, ship, source);
    else
      begin
        perform public.move_organigramme_watch_member(0, person, source, other_ship, other_ship_watch);
        raise exception 'Forbidden profile % could transfer a collaborator', role_name;
      exception when insufficient_privilege then null; end;
    end if;
    execute 'reset role';
  end loop;
end;
$$;
rollback;
