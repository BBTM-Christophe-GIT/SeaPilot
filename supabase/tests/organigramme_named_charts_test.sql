-- Named charts share the eligible HR/fleet records and isolate all saved configuration.
begin;
do $$
declare
  company bigint;
  other_company bigint;
  other_chart bigint;
  chart bigint;
  ship bigint;
  staff_member bigint;
  staff_alias bigint;
  main_watch bigint;
  named_watch bigint;
  named_support bigint;
  named_link bigint;
  main_snapshot jsonb;
  named_snapshot jsonb;
  actor uuid;
  role_name text;
  role_index integer := 0;
begin
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.companies (code, name) values ('org-named-fixture', 'Other chart company') returning id into other_company;
  assert exists (select 1 from public.organigramme_charts where company_id = other_company and id = 0), 'New company lacks primary chart';
  insert into public.organigramme_charts (company_id, name) values (other_company, 'Autre société') returning id into other_chart;
  insert into public.people (company_id, first_name, last_name, hired_on, active)
  values (company, 'Named', 'ChartTester', current_date - 1, true) returning id into staff_member;
  insert into public.people (company_id, first_name, last_name, hired_on, active)
  values (company, 'Named', 'ChartTester Alias', current_date - 1, true) returning id into staff_alias;
  insert into private.people_directory_aliases (company_id, alias_person_id, canonical_person_id)
  values (company, staff_alias, staff_member);
  insert into public.vessels (company_id, name, asset_kind, active)
  values (company, 'ORG NAMED FIXTURE', 'vessel', true) returning id into ship;

  foreach role_name in array array['admin', 'direction', 'armement', 'capitaine', 'marin'] loop
    role_index := role_index + 1;
    actor := ('a9570000-0000-4000-8000-00000000020' || role_index)::uuid;
    insert into auth.users (id, email) values (actor, 'org-named-' || role_name || '@example.invalid');
    insert into public.profiles (id, email, display_name, active_company_id)
    values (actor, 'org-named-' || role_name || '@example.invalid', 'Org named fixture', company);
    insert into public.company_memberships (company_id, user_id, active) values (company, actor, true)
    on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles (user_id, company_id, role_key) values (actor, company, role_name);
    perform set_config('request.jwt.claim.sub', actor::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';

    if role_name = 'admin' then
      main_watch := public.save_organigramme_watch(null, ship, 'Bordée 1', jsonb_build_array(jsonb_build_object('personId', staff_member, 'functionLabel', 'Fonction principale')));
      perform public.save_organigramme_category('external', 'Structure principale');
      perform public.save_organigramme_link(null, 'external', 'category', 'office', '', 'Lien principal');
      chart := public.create_organigramme_chart('  Équipe hiver  ');
      assert chart > 0, 'Named chart has no distinct identifier';
      select id into strict named_watch from public.organigramme_watches where company_id = company and chart_id = chart and vessel_id = ship and name = 'Bordée 1';
      assert named_watch <> main_watch, 'Default watches share identity';
      assert (select count(*) from public.organigramme_watches where company_id = company and chart_id = chart and vessel_id = ship) = 2, 'New chart lacks empty default watches';
      named_snapshot := public.organigramme_snapshot_v3(chart, current_date);
      assert named_snapshot->'memberships' = '[]'::jsonb and named_snapshot->'support' = '[]'::jsonb
        and named_snapshot->'links' = '[]'::jsonb and named_snapshot->'categoryLabels' = '{}'::jsonb, 'New chart copied existing configuration';

      perform public.save_organigramme_watch(chart, named_watch, ship, 'Bordée 1', jsonb_build_array(jsonb_build_object('personId', staff_member, 'functionLabel', 'Fonction hiver')));
      begin
        perform public.save_organigramme_watch(chart, named_watch, ship, 'Bordée 1', '[]'::jsonb, 1);
        raise exception 'An outdated watch draft could replace the newer composition';
      exception when serialization_failure then null; end;
      begin
        insert into public.organigramme_watch_members (watch_id, person_id) values (named_watch, staff_alias);
        raise exception 'A historical alias was inserted into a named watch';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_organigramme_responsibility(chart, null, staff_alias, 'Alias', 'Test', 'office', 0, null);
        raise exception 'A historical alias was used as a responsibility';
      exception when insufficient_privilege then null; end;
      begin
        perform public.save_organigramme_link(chart, null, 'external', 'person', staff_alias::text, '', 'Alias');
        raise exception 'A historical alias was used as a link target';
      exception when insufficient_privilege then null; end;
      perform public.save_organigramme_category(chart, 'external', 'Structure hiver');
      named_support := public.save_organigramme_responsibility(chart, null, null, 'Conseil hiver', 'Missions hiver', 'external', 0, null);
      named_link := public.save_organigramme_link(chart, null, 'external', 'person', (-named_support)::text, '', 'Lien hiver');
      perform public.rename_organigramme_chart(chart, 'Armement hiver');
      begin
        perform public.create_organigramme_chart('armement hiver');
        raise exception 'Case-insensitive duplicate chart name accepted';
      exception when unique_violation then null; end;
      begin
        perform public.save_organigramme_watch(chart, null, ship, 'Autre bordée', jsonb_build_array(jsonb_build_object('personId', staff_member)));
        raise exception 'New duplicate membership within the same chart accepted';
      exception when unique_violation then null; end;
      begin
        perform public.save_organigramme_watch(chart, main_watch, ship, 'Intrusion', '[]'::jsonb);
        raise exception 'Write to watch from a different chart accepted';
      exception when no_data_found then null; end;
      begin
        perform public.save_organigramme_link(0, null, 'external', 'person', (-named_support)::text, '', 'Intrusion');
        raise exception 'Cross-chart support link accepted';
      exception when insufficient_privilege then null; end;
      begin
        insert into public.organigramme_watches (chart_id, vessel_id, name) values (other_chart, ship, 'Intrusion');
        raise exception 'Other company chart accepted for watch';
      exception when foreign_key_violation then null; end;
      begin
        perform public.organigramme_snapshot_v3(other_chart, current_date);
        raise exception 'Other company chart snapshot accepted';
      exception when no_data_found then null; end;
    end if;

    if role_name in ('admin', 'direction') then
      main_snapshot := public.organigramme_snapshot_v2(current_date);
      named_snapshot := public.organigramme_snapshot_v3(chart, current_date);
      assert named_snapshot->'people' = main_snapshot->'people' and named_snapshot->'vessels' = main_snapshot->'vessels', 'Chart changed shared HR or fleet directory';
      assert not exists (select 1 from jsonb_array_elements(named_snapshot->'people') p where p->>'id' = staff_alias::text), 'Historical alias shown in named chart';
      assert named_snapshot->'emergencyDefaultIds' is not distinct from main_snapshot->'emergencyDefaultIds', 'Chart changed shared emergency default';
      assert named_snapshot->'chartId' = to_jsonb(chart), 'Wrong chart identifier';
      assert (named_snapshot->'charts') @> jsonb_build_array(jsonb_build_object('id', chart, 'name', 'Armement hiver')), 'Renamed chart missing';
      assert not (named_snapshot->'charts') @> jsonb_build_array(jsonb_build_object('id', other_chart)), 'Foreign chart listed';
      assert exists (select 1 from jsonb_array_elements(named_snapshot->'memberships') m where m->>'functionLabel' = 'Fonction hiver'), 'Named membership missing';
      assert exists (select 1 from jsonb_array_elements(main_snapshot->'memberships') m where m->>'functionLabel' = 'Fonction principale'), 'Main membership changed';
      assert not exists (select 1 from jsonb_array_elements(main_snapshot->'watches') w where w->>'id' = named_watch::text), 'Legacy snapshot included named watches';
      assert exists (select 1 from jsonb_array_elements(named_snapshot->'support') s where s->>'id' = named_support::text), 'Named support missing';
      assert not exists (select 1 from jsonb_array_elements(main_snapshot->'support') s where s->>'id' = named_support::text), 'Named support leaked to main chart';
      assert exists (select 1 from jsonb_array_elements(named_snapshot->'links') l where l->>'id' = named_link::text), 'Named link missing';
      assert not exists (select 1 from jsonb_array_elements(main_snapshot->'links') l where l->>'id' = named_link::text), 'Named link leaked to main chart';
      assert named_snapshot->'categoryLabels'->>'external' = 'Structure hiver' and main_snapshot->'categoryLabels'->>'external' = 'Structure principale', 'Category labels not independent';
    else
      assert not exists (select 1 from public.organigramme_charts), 'Chart names leaked to a forbidden role';
      begin
        perform public.organigramme_snapshot_v3(chart, current_date);
        raise exception 'Forbidden profile could load a named chart';
      exception when insufficient_privilege then null; end;
      begin
        perform public.create_organigramme_chart('Interdit');
        raise exception 'Forbidden profile could create a chart';
      exception when insufficient_privilege then null; end;
    end if;
    execute 'reset role';
  end loop;
end;
$$;
rollback;
