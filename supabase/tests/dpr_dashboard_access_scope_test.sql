-- Real authenticated Marin/Capitaine fixtures, never an administrator's UI view.
-- Include a production-sized report set and roll back every fixture and write.
begin;
create temporary table dpr_scope_actors(label text primary key, actor uuid, company_id bigint, person_id bigint);
create temporary table dpr_scope_ships(label text primary key, id bigint);
create temporary table dpr_scope_reports(label text primary key, id bigint);
grant select on dpr_scope_actors, dpr_scope_ships, dpr_scope_reports to authenticated;
insert into public.companies(code, name) values ('dpr-scope-fixture', 'DPR scope fixture'), ('dpr-scope-foreign', 'DPR foreign fixture');
insert into public.role_module_permissions(role_key, module_key, is_visible)
  values ('marin', 'dpr', true), ('capitaine', 'dpr', true)
  on conflict(role_key, module_key) do update set is_visible = true;
do $$
declare fixture_label text; actor uuid; company bigint; person bigint; ship bigint; report bigint; n integer := 0; today date := current_date;
begin
  foreach fixture_label in array array['marin', 'capitaine', 'colleague', 'foreign'] loop
    n := n + 1; actor := ('d9a00000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
    select id into company from public.companies where code = case when fixture_label = 'foreign' then 'dpr-scope-foreign' else 'dpr-scope-fixture' end;
    insert into auth.users(id, email) values(actor, fixture_label || '-dpr-scope@example.invalid');
    insert into public.profiles(id, email, display_name, active_company_id) values(actor, fixture_label || '-dpr-scope@example.invalid', 'DPR scope ' || fixture_label, company);
    insert into public.company_memberships(company_id, user_id, active) values(company, actor, true)
      on conflict(company_id, user_id) do update set active = true;
    insert into public.user_roles(company_id, user_id, role_key) values(company, actor, case when fixture_label = 'capitaine' then 'capitaine' else 'marin' end);
    insert into public.people(company_id, user_id, first_name, last_name, function_label, active)
      values(company, actor, 'DPR', fixture_label, case when fixture_label = 'capitaine' then 'Capitaine' else 'Matelot' end, true) returning id into person;
    insert into dpr_scope_actors values(fixture_label, actor, company, person);
  end loop;
  select company_id, person_id into company, person from dpr_scope_actors where dpr_scope_actors.label = 'marin';
  foreach fixture_label in array array['assigned', 'preparation', 'temporary-captain', 'unassigned'] loop
    insert into public.vessels(company_id, name, asset_kind) values(company, 'DPR-SCOPE-' || fixture_label, 'vessel') returning id into ship;
    insert into dpr_scope_ships values(fixture_label, ship);
    if fixture_label <> 'unassigned' then
      insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at, assignment_role, status_label, confirmation_status)
      values(company, ship, person, case when fixture_label = 'preparation' then today + 15 else today - 2 end,
        case when fixture_label = 'preparation' then today + 20 else today + 2 end,
        (case when fixture_label = 'preparation' then today + 15 else today - 2 end)::timestamp at time zone 'Europe/Paris',
        (case when fixture_label = 'preparation' then today + 21 else today + 3 end)::timestamp at time zone 'Europe/Paris',
        case when fixture_label = 'temporary-captain' then 'Capitaine' else 'Matelot' end, 'En Mer', 'confirmed');
    end if;
  end loop;
  foreach fixture_label in array array['own-recent', 'own-old', 'assigned-colleague', 'preparation-colleague', 'temporary-captain', 'outside-captain-date', 'hidden-colleague', 'foreign'] loop
    select fixture.company_id, fixture.actor into company, actor from dpr_scope_actors fixture where fixture.label = case when fixture_label = 'foreign' then 'foreign' when fixture_label like 'own-%' then 'marin' else 'colleague' end;
    select id into ship from dpr_scope_ships where dpr_scope_ships.label = case fixture_label when 'assigned-colleague' then 'assigned' when 'preparation-colleague' then 'preparation' when 'temporary-captain' then 'temporary-captain' when 'outside-captain-date' then 'temporary-captain' else 'unassigned' end;
    insert into public.dpr_reports(company_id, report_date, vessel_id, issuer_user_id, issuer_name_snapshot, created_by, created_at, description, unlisted_project_name)
      values(company, case when fixture_label = 'outside-captain-date' then today + 10 else today end,
        case when fixture_label = 'foreign' then null else ship end, actor, 'DPR scope fixture', actor,
        case when fixture_label = 'own-recent' then now() else now() - interval '10 days' end, 'Scope fixture', 'Navire à quai') returning id into report;
    insert into dpr_scope_reports values(fixture_label, report);
  end loop;
  select fixture.company_id, fixture.actor into company, actor from dpr_scope_actors fixture where fixture.label = 'colleague';
  insert into public.dpr_reports(company_id, vessel_id, report_date, issuer_user_id, issuer_name_snapshot, created_by, created_at)
    select company, (select id from dpr_scope_ships where dpr_scope_ships.label = 'assigned'), today - 100, actor, 'DPR volume fixture', actor, now() - interval '10 days'
    from generate_series(1, 1300);
  insert into public.dpr_daily_metrics(company_id, dpr_id, fuel_consumed_liters)
    select report.company_id, report.id, 1 from public.dpr_reports report where report.company_id = company;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd9a00000-0000-4000-8000-000000000001', true);
-- These are the dashboard report and child paths which timed out in production.
set local statement_timeout = '4s';
do $$
declare fixture_label text; report_id bigint; allowed bigint[]; saved public.dpr_reports; expected boolean;
begin
  assert (select count(*) from public.dpr_reports) = 1306, 'Marin dashboard lost ownership, vessel grace or dated Captain visibility';
  assert (select count(*) from public.dpr_daily_metrics) = 1306, 'Child scope differs from the visible report scope';
  allowed := public.dpr_manageable_report_ids();
  assert cardinality(allowed) = 2, 'Marin management must stay limited to a recent own report and the dated Captain report';
  foreach fixture_label in array array['own-recent', 'own-old', 'assigned-colleague', 'preparation-colleague', 'temporary-captain', 'outside-captain-date', 'hidden-colleague', 'foreign'] loop
    select id into report_id from dpr_scope_reports where dpr_scope_reports.label = fixture_label;
    assert (report_id = any(allowed)) = public.dpr_user_can_manage_report(report_id), format('Management differs from write guard: %s', fixture_label);
    expected := public.dpr_can_read_report(report_id);
    assert exists(select 1 from public.dpr_reports where id = report_id) = expected, format('Read scope differs from existing guard: %s', fixture_label);
  end loop;
  select * into saved from public.dpr_save_payload(null, jsonb_build_object('reportDate', current_date,
    'unlistedProjectName', 'Navire à quai', 'vesselId', (select id from dpr_scope_ships where dpr_scope_ships.label = 'assigned'),
    'description', 'Saved by actual Marin role', 'metrics', jsonb_build_object('fuelConsumedLiters', '12')));
  assert exists(select 1 from public.dpr_reports where id = saved.id), 'Saved Marin DPR is missing from dashboard';
  assert saved.id = any(public.dpr_manageable_report_ids()), 'New Marin report cannot be managed';
  assert exists(select 1 from public.dpr_daily_metrics where dpr_id = saved.id and fuel_consumed_liters = 12), 'Transactional save lost metrics';
end $$;

select set_config('request.jwt.claim.sub', 'd9a00000-0000-4000-8000-000000000002', true);
do $$ begin
  assert (select count(*) from public.dpr_reports) = 1308, 'Capitaine must retain company DPR history';
  assert cardinality(public.dpr_manageable_report_ids()) = 1308, 'Capitaine management scope narrowed';
  assert not exists(select 1 from public.dpr_reports where id = (select id from dpr_scope_reports where label = 'foreign')), 'Foreign company report leaked';
end $$;
reset role;
update public.role_module_permissions set is_visible = false where module_key = 'dpr' and role_key = 'marin';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd9a00000-0000-4000-8000-000000000001', true);
do $$ begin
  assert not exists(select 1 from public.dpr_reports), 'Disabled DPR module still readable';
  assert public.dpr_manageable_report_ids() = '{}'::bigint[], 'Disabled module still manageable';
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.dpr_manageable_report_ids(); raise exception 'Anonymous RPC callable'; exception when insufficient_privilege then null; end;
  begin perform private.dpr_report_access_scope(false); raise exception 'Anonymous private helper callable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;

