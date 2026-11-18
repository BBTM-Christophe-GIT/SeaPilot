begin;
do $$
declare
  company bigint;
  foreign_company bigint;
  foreign_chart bigint;
  source_chart bigint;
  source_watch bigint;
  source_support bigint;
  obsolete_support bigint;
  copied_chart bigint;
  copied_watch bigint;
  copied_support bigint;
  vessel bigint;
  departed_staff bigint;
  current_staff bigint;
  actor uuid;
  role_name text;
  role_index integer := 0;
begin
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies (code, name) values ('org-copy-fixture', 'Copie fixture société') returning id into foreign_company;
  insert into public.organigramme_charts (company_id, name) values (foreign_company, 'Source étrangère') returning id into foreign_chart;
  insert into public.organigramme_charts (company_id, name) values (company, 'Source Duplication') returning id into source_chart;
  insert into public.vessels (company_id, name, asset_kind, active)
  values (company, 'DUPLICATION FIXTURE', 'vessel', true) returning id into vessel;
  insert into public.organigramme_watches (company_id, chart_id, vessel_id, name, revision)
  values (company, source_chart, vessel, 'Bordée personnalisée', 12) returning id into source_watch;
  insert into public.people (company_id, first_name, last_name, active, hired_on, departed_on)
  values (company, 'Copy', 'Former Employee', false, current_date - 20, current_date - 2) returning id into departed_staff;
  insert into public.people (company_id, first_name, last_name, active, hired_on)
  values (company, 'Copy', 'Current Employee', true, current_date - 20) returning id into current_staff;
  insert into public.organigramme_watch_members (company_id, watch_id, person_id, function_label)
  values (company, source_watch, current_staff, 'Fonction à bord'), (company, source_watch, departed_staff, '');
  insert into public.organigramme_support (company_id, chart_id, name, function_label, category, position, hierarchy_rank)
  values (company, source_chart, 'Direction libre', 'Direction fixture', 'office', 8, '2') returning id into source_support;
  insert into public.organigramme_support (company_id, chart_id, name, function_label, category)
  values (company, source_chart, 'Ancien intervenant', 'Appui fixture', 'external') returning id into obsolete_support;
  insert into public.organigramme_categories (company_id, chart_id, key, label)
  values (company, source_chart, 'external', 'Relais personnalisés');
  insert into public.organigramme_links (company_id, chart_id, source_category, target_kind, target_key, target_section, label)
  values (company, source_chart, 'external', 'person', (-source_support)::text, '', 'Vers la responsabilité'),
    (company, source_chart, 'external', 'person', (-obsolete_support)::text, '', 'Ancienne relation'),
    (company, source_chart, 'external', 'person', current_staff::text, '', 'Vers la fiche RH'),
    (company, source_chart, 'external', 'group', vessel || '-Bordée personnalisée', 'vessel-' || vessel, 'Vers la bordée'),
    (company, source_chart, 'external', 'category', 'office', '', 'Vers la catégorie');
  delete from public.organigramme_support where id = obsolete_support;

  foreach role_name in array array['admin', 'direction', 'armement', 'capitaine', 'marin'] loop
    role_index := role_index + 1;
    actor := ('a9570000-0000-4000-8000-00000000040' || role_index)::uuid;
    insert into auth.users (id, email) values (actor, 'org-copy-' || role_name || '@example.invalid');
    insert into public.profiles (id, email, display_name, active_company_id)
    values (actor, 'org-copy-' || role_name || '@example.invalid', 'Org copy fixture', company);
    insert into public.company_memberships (company_id, user_id, active) values (company, actor, true)
    on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles (user_id, company_id, role_key) values (actor, company, role_name);
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    if role_name in ('admin', 'direction') then
      copied_chart := public.duplicate_organigramme_chart(source_chart, '  Copie ' || role_name || '  ');
      assert copied_chart <> source_chart, 'Source chart reused';
      assert exists (select 1 from public.organigramme_charts where company_id = company and id = copied_chart and name = 'Copie ' || role_name);
      select id into strict copied_watch from public.organigramme_watches where company_id = company and chart_id = copied_chart;
      select id into strict copied_support from public.organigramme_support where company_id = company and chart_id = copied_chart;
      assert copied_watch <> source_watch and copied_support <> source_support, 'Copied chart reused source row IDs';
      assert exists (select 1 from public.organigramme_watches where id = copied_watch and vessel_id = vessel and name = 'Bordée personnalisée' and revision = 1);
      assert exists (select 1 from public.organigramme_watch_members where watch_id = copied_watch and person_id = current_staff and function_label = 'Fonction à bord');
      assert exists (select 1 from public.organigramme_watch_members where watch_id = copied_watch and person_id = departed_staff and function_label = ''), 'Date-ineligible saved member lost';
      assert exists (select 1 from public.organigramme_support where id = copied_support and position = 8 and hierarchy_rank = '2' and function_label = 'Direction fixture');
      assert exists (select 1 from public.organigramme_categories where company_id = company and chart_id = copied_chart and key = 'external' and label = 'Relais personnalisés');
      assert (select count(*) from public.organigramme_links where company_id = company and chart_id = copied_chart) = 4, 'Valid links lost or dangling link copied';
      assert exists (select 1 from public.organigramme_links where chart_id = copied_chart and target_kind = 'person' and target_key = (-copied_support)::text and label = 'Vers la responsabilité'), 'Support link points outside the copy';
      assert exists (select 1 from public.organigramme_links where chart_id = copied_chart and target_kind = 'person' and target_key = current_staff::text);
      assert exists (select 1 from public.organigramme_links where chart_id = copied_chart and target_kind = 'group' and target_key = vessel || '-Bordée personnalisée' and target_section = 'vessel-' || vessel);
      assert exists (select 1 from public.organigramme_links where chart_id = copied_chart and target_kind = 'category' and target_key = 'office');

      perform public.save_organigramme_watch(copied_chart, copied_watch, vessel, 'Bordée personnalisée', '[]'::jsonb, 1);
      assert (select count(*) from public.organigramme_watch_members where watch_id = source_watch) = 2, 'Editing a copy changed the original crew';
      begin
        perform public.duplicate_organigramme_chart(source_chart, 'copie ' || role_name);
        raise exception 'Duplicate name allowed';
      exception when unique_violation then null; end;
      assert (select count(*) from public.organigramme_charts where company_id = company and lower(name) = 'copie ' || role_name) = 1;
      begin
        perform public.duplicate_organigramme_chart(foreign_chart, 'Copie étrangère');
        raise exception 'Cross-company copy allowed';
      exception when no_data_found then null; end;
      assert not exists (select 1 from public.organigramme_charts where company_id = company and name = 'Copie étrangère');
    else
      begin
        perform public.duplicate_organigramme_chart(source_chart, 'Copie interdite');
        raise exception 'Forbidden profile can duplicate a chart';
      exception when insufficient_privilege then null; end;
    end if;
    execute 'reset role';
  end loop;

  assert not has_function_privilege('anon', 'public.duplicate_organigramme_chart(bigint,text)', 'EXECUTE');
end;
$$;
rollback;
