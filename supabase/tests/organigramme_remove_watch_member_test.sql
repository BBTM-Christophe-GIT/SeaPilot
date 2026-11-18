begin;

do $$
declare
  company bigint;
  other_company bigint;
  ship bigint;
  foreign_ship bigint;
  crew bigint;
  legacy_crew bigint;
  chart_copy bigint;
  foreign_chart bigint;
  source_watch bigint;
  other_watch bigint;
  copy_watch bigint;
  foreign_watch bigint;
  actor uuid;
  role_name text;
  role_index integer := 0;
  snapshot jsonb;
begin
  assert not has_function_privilege('anon', 'public.remove_organigramme_watch_member(bigint,bigint,bigint)', 'EXECUTE');
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies (code, name) values ('org-remove-foreign', 'Société sans affectation') returning id into other_company;
  insert into public.vessels (company_id, name, active, asset_kind) values (company, 'NAVIRE RETRAIT', true, 'vessel') returning id into ship;
  insert into public.vessels (company_id, name, active, asset_kind) values (other_company, 'NAVIRE TIERS', true, 'vessel') returning id into foreign_ship;
  insert into public.people (company_id, first_name, last_name, function_label, hired_on, active)
  values (company, 'Marin', 'RETRAIT', 'Matelot', current_date - 365, true) returning id into crew;
  insert into public.people (company_id, first_name, last_name, function_label, hired_on, active)
  values (company, 'Marin', 'HISTORIQUE', 'Matelot', current_date - 365, true) returning id into legacy_crew;
  insert into public.organigramme_charts (company_id, name) values (company, 'Version parallèle') returning id into chart_copy;
  insert into public.organigramme_charts (company_id, name) values (other_company, 'Société tierce') returning id into foreign_chart;
  insert into public.organigramme_watches (company_id, chart_id, vessel_id, name, revision)
  values (company, 0, ship, 'Bordée de départ', 5) returning id into source_watch;
  insert into public.organigramme_watches (company_id, chart_id, vessel_id, name)
  values (company, 0, ship, 'Bordée de reprise') returning id into other_watch;
  insert into public.organigramme_watches (company_id, chart_id, vessel_id, name)
  values (company, chart_copy, ship, 'Bordée parallèle') returning id into copy_watch;
  insert into public.organigramme_watches (company_id, chart_id, vessel_id, name)
  values (other_company, foreign_chart, foreign_ship, 'Bordée tierce') returning id into foreign_watch;
  insert into public.organigramme_watch_members (company_id, watch_id, person_id, function_label) values
    (company, source_watch, crew, 'Chef de quart'),
    (company, source_watch, legacy_crew, ''),
    (company, other_watch, legacy_crew, 'Officier'),
    (company, copy_watch, crew, 'Officier');
  insert into public.organigramme_card_settings (company_id, chart_id, person_id, color, temporary_function_label)
  values (company, 0, crew, 'blue', 'Chef de mission');

  foreach role_name in array array['admin', 'direction', 'capitaine', 'marin'] loop
    role_index := role_index + 1;
    actor := ('a1110000-0000-4000-9000-00000000000' || role_index)::uuid;
    insert into auth.users (id, email) values (actor, 'org-remove-' || role_name || '@example.invalid');
    insert into public.profiles (id, email, display_name, active_company_id)
    values (actor, 'org-remove-' || role_name || '@example.invalid', 'Retrait de bordée', company);
    insert into public.company_memberships (company_id, user_id, active) values (company, actor, true)
      on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles (company_id, user_id, role_key) values (company, actor, role_name);
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    if role_name = 'admin' then
      begin
        perform public.remove_organigramme_watch_member(0, crew, copy_watch);
        raise exception 'Watch from another chart accepted';
      exception when no_data_found then null; end;
      begin
        perform public.remove_organigramme_watch_member(foreign_chart, crew, foreign_watch);
        raise exception 'Foreign chart accepted';
      exception when no_data_found then null; end;

      perform public.remove_organigramme_watch_member(0, crew, source_watch);
      perform public.remove_organigramme_watch_member(0, crew, source_watch);
      assert (select revision = 6 from public.organigramme_watches where id = source_watch), 'Retry changed revision';
      snapshot := public.organigramme_snapshot_v4(0, current_date);
      assert not exists (select 1 from jsonb_array_elements(snapshot->'memberships') as m where (m->>'personId')::bigint = crew),
        'Crew member remains assigned in the selected chart';
      assert snapshot->'temporaryFunctions'->>crew::text = 'Chef de mission', 'Temporary function lost';
      assert snapshot->'cardColors'->>crew::text = 'blue', 'Card color lost';
      assert exists (select 1 from public.people where id = crew and function_label = 'Matelot'), 'RH record affected';
      assert exists (select 1 from public.organigramme_watch_members
        where watch_id = copy_watch and person_id = crew and function_label = 'Officier'), 'Parallel chart modified';

      begin
        perform public.save_organigramme_watch(0, source_watch, ship, 'Bordée de départ',
          jsonb_build_array(jsonb_build_object('personId', crew)), 5);
        raise exception 'Stale watch draft accepted';
      exception when serialization_failure then null; end;
      perform public.move_organigramme_watch_member(0, crew, null, ship, other_watch);
      assert exists (select 1 from public.organigramme_watch_members where watch_id = other_watch and person_id = crew),
        'Unassigned crew member could not be reassigned';
    elsif role_name = 'direction' then
      perform public.remove_organigramme_watch_member(0, legacy_crew, source_watch);
      assert not exists (select 1 from public.organigramme_watch_members where watch_id = source_watch and person_id = legacy_crew);
      assert exists (select 1 from public.organigramme_watch_members
        where watch_id = other_watch and person_id = legacy_crew and function_label = 'Officier'), 'Second historical membership removed';
    else
      begin
        perform public.remove_organigramme_watch_member(0, crew, other_watch);
        raise exception 'Unexpected unassignment by %', role_name;
      exception when insufficient_privilege then null; end;
    end if;
    execute 'reset role';
  end loop;
  assert exists (select 1 from public.organigramme_watch_members where watch_id = other_watch and person_id = crew),
    'Unauthorized actor changed existing membership';
end;
$$;

rollback;
