begin;

do $$
declare
  company bigint;
  other_company bigint;
  chart bigint;
  other_chart bigint;
  foreign_chart bigint;
  copy_chart bigint;
  person bigint;
  foreign_person bigint;
  snapshot jsonb;
  actor uuid;
  actor_role text;
  actor_index integer := 0;
begin
  assert not has_function_privilege('anon', 'public.save_organigramme_card_setting(bigint,bigint,text,text)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.organigramme_snapshot_v4(bigint,date)', 'EXECUTE');
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies (code, name) values ('org-card-foreign', 'Organigramme tiers') returning id into other_company;
  insert into public.people (company_id, first_name, last_name, function_label, active, hired_on)
    values (company, 'Carte', 'PERSONNEL', 'Matelot', true, current_date - 10) returning id into person;
  insert into public.people (company_id, first_name, last_name, function_label, active, hired_on)
    values (other_company, 'Carte', 'TIERS', 'Matelot', true, current_date - 10) returning id into foreign_person;
  insert into public.organigramme_charts (company_id, name) values (company, 'Cartes personnalisées') returning id into chart;
  insert into public.organigramme_charts (company_id, name) values (company, 'Organigramme parallèle') returning id into other_chart;
  insert into public.organigramme_charts (company_id, name) values (other_company, 'Organigramme tiers') returning id into foreign_chart;

  foreach actor_role in array array['admin', 'direction', 'capitaine', 'marin'] loop
    actor_index := actor_index + 1;
    actor := ('a1100000-0000-4000-9000-00000000000' || actor_index)::uuid;
    insert into auth.users (id, email) values (actor, 'org-card-' || actor_role || '@example.invalid');
    insert into public.profiles (id, email, display_name, active_company_id)
      values (actor, 'org-card-' || actor_role || '@example.invalid', 'Réglages carte', company);
    insert into public.company_memberships (company_id, user_id, active) values (company, actor, true)
      on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles (company_id, user_id, role_key) values (company, actor, actor_role);
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    if actor_role in ('admin', 'direction') then
      perform public.save_organigramme_card_setting(chart, person, 'color', 'blue');
      perform public.save_organigramme_card_setting(chart, person, 'temporary_function', '  Responsable d’essai  ');
      snapshot := public.organigramme_snapshot_v4(chart, current_date);
      assert snapshot->'cardColors'->>person::text = 'blue', 'Color missing after function update';
      assert snapshot->'temporaryFunctions'->>person::text = 'Responsable d’essai', 'Temporary function missing';
      assert exists (
        select 1 from jsonb_array_elements(snapshot->'people') p
        where (p->>'id')::bigint = person and p->>'functionLabel' = 'Matelot'
      ), 'The HR function was replaced';
      assert not (public.organigramme_snapshot_v3(chart, current_date) ? 'temporaryFunctions'), 'Legacy snapshots picked up a temporary function';
      assert public.organigramme_snapshot_v4(other_chart, current_date)->'temporaryFunctions' = '{}'::jsonb, 'Other chart picked up a temporary function';
      assert public.organigramme_snapshot_v4(other_chart, current_date)->'cardColors' = '{}'::jsonb, 'Other chart picked up a color';
      if actor_role = 'admin' then
        copy_chart := public.duplicate_organigramme_chart(chart, 'Copie colorée');
        snapshot := public.organigramme_snapshot_v4(copy_chart, current_date);
        assert snapshot->'cardColors'->>person::text = 'blue', 'Copy missed the card color';
        assert snapshot->'temporaryFunctions' = '{}'::jsonb, 'Copy inherited the original’s temporary function';
      end if;

      begin
        perform public.save_organigramme_card_setting(chart, person, 'color', '#000000');
        raise exception 'Non-pastel color accepted';
      exception when check_violation then null; end;
      begin
        perform public.save_organigramme_card_setting(chart, foreign_person, 'color', 'pink');
        raise exception 'Foreign person accepted';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_organigramme_card_setting(foreign_chart, person, 'color', 'pink');
        raise exception 'Foreign chart accepted';
      exception when no_data_found then null; end;

      perform public.save_organigramme_card_setting(chart, person, 'color', null);
      snapshot := public.organigramme_snapshot_v4(chart, current_date);
      assert snapshot->'cardColors' = '{}'::jsonb;
      assert snapshot->'temporaryFunctions'->>person::text = 'Responsable d’essai';
      perform public.save_organigramme_card_setting(chart, person, 'temporary_function', null);
      assert not exists (
        select 1 from public.organigramme_card_settings where company_id = company and chart_id = chart and person_id = person
      ), 'Empty settings kept';
    else
      begin
        perform public.save_organigramme_card_setting(chart, person, 'temporary_function', 'À refuser');
        raise exception 'Unexpected write by %', actor_role;
      exception when insufficient_privilege then null; end;
      begin
        perform public.organigramme_snapshot_v4(chart, current_date);
        raise exception 'Unexpected chart view by %', actor_role;
      exception when insufficient_privilege then null; end;
      assert not exists (select 1 from public.organigramme_card_settings), 'Private colors or temporary functions visible';
    end if;
    execute 'reset role';
  end loop;
end;
$$;

rollback;
