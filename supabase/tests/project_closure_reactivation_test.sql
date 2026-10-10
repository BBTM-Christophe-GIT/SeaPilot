-- Real authenticated fixtures exercise the lifecycle RPCs and field-profile
-- history. Every fixture, temporary helper and assertion is rolled back.
begin;

create temporary table lifecycle_assertions (description text not null);
grant select, insert on lifecycle_assertions to authenticated;

create function pg_temp.lifecycle_ok(condition boolean, description text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then
    raise exception 'Lifecycle assertion failed: %', description;
  end if;
  insert into pg_temp.lifecycle_assertions values (description);
end;
$$;

create function pg_temp.lifecycle_error(statement text, expected_state text, description text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate <> expected_state then
      raise exception 'Lifecycle assertion %: expected %, received % (%)',
        description, expected_state, sqlstate, sqlerrm;
    end if;
    perform pg_temp.lifecycle_ok(true, description);
    return;
  end;
  raise exception 'Lifecycle assertion %: statement unexpectedly succeeded', description;
end;
$$;

insert into public.companies(code, name) values
  ('test-project-closure', 'Project closure fixtures'),
  ('test-project-closure-foreign', 'Project closure foreign fixtures');
insert into auth.users(id, email) values
  ('c1010000-0000-0000-0000-000000000001', 'closure-admin@example.invalid'),
  ('c1010000-0000-0000-0000-000000000002', 'closure-direction@example.invalid'),
  ('c1010000-0000-0000-0000-000000000003', 'closure-marin@example.invalid'),
  ('c1010000-0000-0000-0000-000000000004', 'closure-capitaine@example.invalid'),
  ('c1010000-0000-0000-0000-000000000005', 'closure-foreign@example.invalid'),
  ('c1010000-0000-0000-0000-000000000006', 'closure-inactive@example.invalid');
insert into public.profiles(id, email, display_name, active_company_id)
select actor.id, actor.email, 'Lifecycle fixture ' || actor.email, company.id
from auth.users actor cross join public.companies company
where actor.id::text like 'c1010000-%'
  and company.code = case when actor.id::text like '%005'
    then 'test-project-closure-foreign' else 'test-project-closure' end;
insert into public.company_memberships(user_id, company_id, active)
select id, active_company_id, true from public.profiles where id::text like 'c1010000-%'
on conflict (user_id, company_id) do update set active = true;
insert into public.user_roles(user_id, company_id, role_key)
select id, active_company_id, case
  when id::text like '%002' then 'direction'
  when id::text like '%003' then 'marin'
  when id::text like '%004' then 'capitaine'
  else 'admin' end
from public.profiles where id::text like 'c1010000-%';
update public.company_memberships set active = false
where user_id = 'c1010000-0000-0000-0000-000000000006';

insert into public.vessels(company_id, name, acronym)
select id, 'LIFECYCLE VESSEL', 'LCV' from public.companies where code = 'test-project-closure';
insert into public.projects(company_id, project_code, title, status, contract_type, source_label,
  sharepoint_list_id, sharepoint_item_id)
select company.id, fixture.code, fixture.title, fixture.status, 'BIMCO', 'sharepoint',
  'lifecycle-fixture-list', fixture.code
from public.companies company cross join (values
  ('LIFECYCLE-A', 'Lifecycle historical project', 'Non validé', 'test-project-closure'),
  ('LIFECYCLE-B', 'Lifecycle alternate project', 'Validé', 'test-project-closure'),
  ('LIFECYCLE-HIDDEN', 'Lifecycle project without DPR', 'Validé', 'test-project-closure'),
  ('LIFECYCLE-FOREIGN', 'Lifecycle foreign project', 'Validé', 'test-project-closure-foreign')
) fixture(code, title, status, company_code) where company.code = fixture.company_code;
insert into public.project_contracts(company_id, project_id, owner_identity, charter_hire, hire_currency, source_label)
select company_id, id, 'Lifecycle contract owner', 2650, 'EUR', 'seapilot'
from public.projects where project_code = 'LIFECYCLE-A'
on conflict (project_id, company_id) do update
set owner_identity = excluded.owner_identity, charter_hire = excluded.charter_hire,
  hire_currency = excluded.hire_currency;
insert into public.planning_projects(company_id, title, catalog_project_id, primary_vessel_id,
  starts_on, ends_on, status, source_label)
select project.company_id, 'Lifecycle historical occurrence', project.id, vessel.id,
  current_date - 1, current_date + 1, 'Validé', 'seapilot'
from public.projects project join public.vessels vessel on vessel.company_id = project.company_id
where project.project_code = 'LIFECYCLE-A' and vessel.name = 'LIFECYCLE VESSEL';

select set_config('test.lifecycle_project', (select id::text from public.projects where project_code = 'LIFECYCLE-A'), true);
select set_config('test.lifecycle_alternate', (select id::text from public.projects where project_code = 'LIFECYCLE-B'), true);
select set_config('test.lifecycle_foreign', (select id::text from public.projects where project_code = 'LIFECYCLE-FOREIGN'), true);
select set_config('test.lifecycle_vessel', (select id::text from public.vessels where name = 'LIFECYCLE VESSEL'), true);

select pg_temp.lifecycle_ok(not has_function_privilege('anon', 'public.projects_reactivate(bigint)', 'execute'), 'anonymous reactivation is denied');
select pg_temp.lifecycle_ok(not has_function_privilege('anon', 'public.projects_set_status(bigint,text)', 'execute'), 'anonymous status changes are denied');
select pg_temp.lifecycle_ok(not has_function_privilege('anon', 'public.dpr_report_projects()', 'execute'), 'anonymous historical project lookup is denied');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c1010000-0000-0000-0000-000000000003', true);
select set_config('test.lifecycle_marin_dpr', created.id::text, true)
from public.dpr_create_draft(current_date,
  target_project_id => current_setting('test.lifecycle_project')::bigint,
  target_vessel_id => current_setting('test.lifecycle_vessel')::bigint) created;
select pg_temp.lifecycle_ok((public.dpr_entry_context(current_date, current_setting('test.lifecycle_vessel')::bigint) ->> 'projectId')::bigint
  = current_setting('test.lifecycle_project')::bigint, 'a real Marin receives the active Planning project before closure');
select pg_temp.lifecycle_ok((select count(*) from public.dpr_report_projects()) = 1, 'Marin sees their own project history before closure');
select set_config('request.jwt.claim.sub', 'c1010000-0000-0000-0000-000000000004', true);
select set_config('test.lifecycle_captain_dpr', created.id::text, true)
from public.dpr_create_draft(current_date,
  target_project_id => current_setting('test.lifecycle_alternate')::bigint,
  target_vessel_id => current_setting('test.lifecycle_vessel')::bigint) created;
select pg_temp.lifecycle_ok((select count(*) from public.dpr_report_projects()) = 2, 'Capitaine sees both historical project labels before closure');

-- Apply the narrow status mutation before closure; an attempted mutation after
-- closure must fail rather than silently reopening or overwriting the project.
select set_config('request.jwt.claim.sub', 'c1010000-0000-0000-0000-000000000001', true);
do $$
declare project_id bigint := current_setting('test.lifecycle_project')::bigint;
        result public.projects;
begin
  result := public.projects_set_status(project_id, 'Stand-by météo');
  perform pg_temp.lifecycle_ok(result.status = 'Stand-by météo' and result.contract_type = 'BIMCO', 'admin changes only the requested project status');
  perform pg_temp.lifecycle_error(format('select public.projects_set_status(%s, %L)', project_id, 'Clôturé'), '23514', 'closure is not a business status');
  perform pg_temp.lifecycle_error(format('select public.projects_set_status(%s, null)', project_id), '23514', 'null status is rejected');
  perform pg_temp.lifecycle_ok((select count(*) from public.planning_operations_view where catalog_project_id = project_id) = 1, 'Planning occurrence exists before closure');
  result := public.projects_archive(project_id);
  perform pg_temp.lifecycle_ok(result.archived_at is not null and result.archived_by = auth.uid() and result.status = 'Stand-by météo', 'closure records its actor and preserves business status');
  perform public.projects_archive(current_setting('test.lifecycle_alternate')::bigint);
  perform pg_temp.lifecycle_ok(not exists (select from public.projects_catalog_options() where id = project_id), 'closed project leaves active commercial options');
  perform pg_temp.lifecycle_ok(not exists (select from public.planning_project_catalog() where id = project_id), 'closed project leaves the active Planning catalog');
  perform pg_temp.lifecycle_ok((select count(*) from public.planning_operations_view where catalog_project_id = project_id) = 1, 'closure preserves the historical Planning occurrence');
  perform pg_temp.lifecycle_ok((select contract.charter_hire from public.projects_contracts() contract where contract.project_id = result.id) = 2650, 'closure preserves the contract tariff');
  perform pg_temp.lifecycle_error(format('select public.projects_set_status(%s, %L)', project_id, 'Validé'), 'P0001', 'status mutation refuses an already closed project');
end;
$$;

-- Test real field profiles, including their different historical scopes.
do $$
declare actor text;
        project_id bigint := current_setting('test.lifecycle_project')::bigint;
        alternate_id bigint := current_setting('test.lifecycle_alternate')::bigint;
        report_id bigint;
        expected_projects integer;
        result public.dpr_reports;
        context jsonb;
begin
  foreach actor in array array['c1010000-0000-0000-0000-000000000003', 'c1010000-0000-0000-0000-000000000004'] loop
    perform set_config('request.jwt.claim.sub', actor, true);
    expected_projects := case when actor like '%003' then 1 else 2 end;
    report_id := current_setting(case when actor like '%003' then 'test.lifecycle_marin_dpr' else 'test.lifecycle_captain_dpr' end)::bigint;
    perform pg_temp.lifecycle_ok((select count(*) from public.dpr_report_projects()) = expected_projects, 'closure preserves historical project count for ' || actor);
    perform pg_temp.lifecycle_ok(exists (select from public.dpr_report_projects() where id = project_id and archived_at is not null), 'archived marker is available in historical project labels for ' || actor);
    perform pg_temp.lifecycle_ok(not exists (select from public.dpr_report_projects() where project_code in ('LIFECYCLE-HIDDEN', 'LIFECYCLE-FOREIGN')), 'history exposes neither unrelated nor foreign projects for ' || actor);
    perform pg_temp.lifecycle_ok(not exists (select from public.projects), 'commercial project rows stay hidden from ' || actor);
    context := public.dpr_entry_context(current_date, current_setting('test.lifecycle_vessel')::bigint);
    perform pg_temp.lifecycle_ok(context -> 'projectId' = 'null'::jsonb and context -> 'project' = 'null'::jsonb, 'closed Planning project is not offered for a new DPR for ' || actor);
    perform pg_temp.lifecycle_ok((context ->> 'vesselId')::bigint = current_setting('test.lifecycle_vessel')::bigint, 'closure preserves the selected vessel context for ' || actor);
    perform pg_temp.lifecycle_error(format('select public.dpr_create_draft(current_date, %s)', project_id), '23514', 'new DPR cannot select an archived project for ' || actor);
    perform pg_temp.lifecycle_error(format('select public.dpr_create_draft(current_date, %s)', current_setting('test.lifecycle_foreign')::bigint), '23514', 'new DPR cannot select a foreign project for ' || actor);
    result := public.dpr_update_draft(report_id, current_date,
      target_project_id => case when actor like '%003' then project_id else alternate_id end,
      target_vessel_id => current_setting('test.lifecycle_vessel')::bigint,
      target_description => 'Historical draft retained');
    perform pg_temp.lifecycle_ok(result.description = 'Historical draft retained' and result.project_id is not null, 'historical draft remains editable with its original closed project for ' || actor);
    perform pg_temp.lifecycle_error(format('select public.dpr_update_draft(%s, current_date, %s)', report_id, case when actor like '%003' then alternate_id else project_id end), '23514', 'historical draft cannot switch to another archived project for ' || actor);
    perform pg_temp.lifecycle_error(format('select public.dpr_update_draft(%s, current_date, %s)', report_id, current_setting('test.lifecycle_foreign')::bigint), '23514', 'historical draft cannot switch to a foreign project for ' || actor);
    perform pg_temp.lifecycle_error(format('select public.projects_set_status(%s, %L)', project_id, 'Validé'), '42501', 'field profile cannot change project status: ' || actor);
    perform pg_temp.lifecycle_error(format('select public.projects_reactivate(%s)', project_id), '42501', 'field profile cannot reactivate a project: ' || actor);
    perform pg_temp.lifecycle_error(format('select public.projects_archive(%s)', project_id), '42501', 'field profile cannot archive a project: ' || actor);
  end loop;
end;
$$;

do $$
declare actor text;
        project_id bigint := current_setting('test.lifecycle_project')::bigint;
        expected_state text;
begin
  foreach actor in array array['c1010000-0000-0000-0000-000000000005', 'c1010000-0000-0000-0000-000000000006', ''] loop
    perform set_config('request.jwt.claim.sub', actor, true);
    expected_state := case when actor like '%005' then 'P0001' else '42501' end;
    perform pg_temp.lifecycle_error(format('select public.projects_set_status(%s, %L)', project_id, 'Validé'), expected_state, 'status mutation rejects foreign, inactive or unauthenticated actor: ' || actor);
    perform pg_temp.lifecycle_error(format('select public.projects_reactivate(%s)', project_id), expected_state, 'reactivation rejects foreign, inactive or unauthenticated actor: ' || actor);
    perform pg_temp.lifecycle_error(format('select public.projects_archive(%s)', project_id), expected_state, 'archive rejects foreign, inactive or unauthenticated actor: ' || actor);
  end loop;
end;
$$;

select set_config('request.jwt.claim.sub', 'c1010000-0000-0000-0000-000000000002', true);
do $$
declare project_id bigint := current_setting('test.lifecycle_project')::bigint;
        result public.projects;
begin
  result := public.projects_reactivate(project_id);
  perform pg_temp.lifecycle_ok(result.archived_at is null and result.archived_by is null and result.status = 'Stand-by météo' and result.contract_type = 'BIMCO', 'Direction reactivates with the original status and contract');
  perform pg_temp.lifecycle_ok(exists (select from public.projects_catalog_options() where id = project_id), 'reactivation restores active commercial options');
  perform pg_temp.lifecycle_ok(exists (select from public.planning_project_catalog() where id = project_id), 'reactivation restores active Planning catalog');
  perform pg_temp.lifecycle_ok((select count(*) from public.planning_operations_view where catalog_project_id = project_id) = 1, 'reactivation keeps the same Planning occurrence');
  perform pg_temp.lifecycle_ok((select contract.charter_hire from public.projects_contracts() contract where contract.project_id = result.id) = 2650, 'reactivation preserves the contract tariff');
  result := public.projects_set_status(project_id, 'Facturé');
  perform pg_temp.lifecycle_ok(result.status = 'Facturé' and result.archived_at is null, 'Direction can change status after reactivation');
  perform pg_temp.lifecycle_error('select public.projects_reactivate(-1)', 'P0001', 'reactivation rejects a nonexistent project');
  perform pg_temp.lifecycle_error('select public.projects_set_status(-1, ''Validé'')', 'P0001', 'status mutation rejects a nonexistent project');
end;
$$;
select set_config('request.jwt.claim.sub', 'c1010000-0000-0000-0000-000000000001', true);
select pg_temp.lifecycle_ok((public.projects_reactivate(current_setting('test.lifecycle_alternate')::bigint)).archived_at is null, 'Admin can reactivate the alternate project');
select set_config('request.jwt.claim.sub', 'c1010000-0000-0000-0000-000000000003', true);
select pg_temp.lifecycle_ok((public.dpr_entry_context(current_date, current_setting('test.lifecycle_vessel')::bigint) ->> 'projectId')::bigint
  = current_setting('test.lifecycle_project')::bigint, 'reactivation restores the real Marin Planning prefill');
select pg_temp.lifecycle_ok(exists (select from public.dpr_report_projects() where id = current_setting('test.lifecycle_project')::bigint and archived_at is null), 'historical project marker is cleared after reactivation');

reset role;
select count(*) || ' project closure/reactivation assertions passed using real authenticated fixtures' as result
from lifecycle_assertions;
rollback;
