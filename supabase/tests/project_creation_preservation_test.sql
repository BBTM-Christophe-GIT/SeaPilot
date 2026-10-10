-- Exercise the real project writers, with authenticated profile fixtures.
-- No production account, project, counter or contract is changed: all fixtures
-- and assertions belong to this transaction and are rolled back.
begin;

create temporary table creation_assertions (description text not null);
grant select, insert on creation_assertions to authenticated;
create function pg_temp.creation_ok(condition boolean, description text)
returns void language plpgsql as $$
begin
  if not coalesce(condition, false) then
    raise exception 'Project creation assertion failed: %', description;
  end if;
  insert into pg_temp.creation_assertions values (description);
end;
$$;
create function pg_temp.creation_error(statement text, expected_state text, description text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate <> expected_state then
      raise exception 'Project creation assertion %: expected %, received % (%)',
        description, expected_state, sqlstate, sqlerrm;
    end if;
    perform pg_temp.creation_ok(true, description);
    return;
  end;
  raise exception 'Project creation assertion %: statement unexpectedly succeeded', description;
end;
$$;

insert into public.companies(code, name) values
  ('test-project-creation-preservation', 'Project creation preservation fixtures'),
  ('test-project-creation-preservation-foreign', 'Project creation foreign fixtures');
insert into auth.users(id, email) values
  ('c1020000-0000-0000-0000-000000000001', 'creation-admin@example.invalid'),
  ('c1020000-0000-0000-0000-000000000002', 'creation-direction@example.invalid'),
  ('c1020000-0000-0000-0000-000000000003', 'creation-marin@example.invalid'),
  ('c1020000-0000-0000-0000-000000000004', 'creation-capitaine@example.invalid'),
  ('c1020000-0000-0000-0000-000000000005', 'creation-foreign@example.invalid'),
  ('c1020000-0000-0000-0000-000000000006', 'creation-inactive@example.invalid'),
  ('c1020000-0000-0000-0000-000000000007', 'creation-armement@example.invalid');
insert into public.profiles(id, email, display_name, active_company_id)
select actor.id, actor.email, 'Creation fixture ' || actor.email, company.id
from auth.users actor cross join public.companies company
where actor.id::text like 'c1020000-%'
  and company.code = case when actor.id::text like '%005'
    then 'test-project-creation-preservation-foreign' else 'test-project-creation-preservation' end;
insert into public.company_memberships(user_id, company_id, active)
select id, active_company_id, true from public.profiles where id::text like 'c1020000-%'
on conflict (user_id, company_id) do update set active = true;
insert into public.user_roles(user_id, company_id, role_key)
select id, active_company_id, case
  when id::text like '%002' then 'direction'
  when id::text like '%003' then 'marin'
  when id::text like '%004' then 'capitaine'
  when id::text like '%007' then 'armement'
  else 'admin' end
from public.profiles where id::text like 'c1020000-%';
update public.company_memberships set active = false
where user_id = 'c1020000-0000-0000-0000-000000000006';

insert into public.vessels(company_id, name, acronym, active)
select company.id, fixture.name, fixture.acronym, fixture.active
from public.companies company cross join (values
  ('CREATION-A', 'CRA', true, 'test-project-creation-preservation'),
  ('CREATION-B', 'CRB', true, 'test-project-creation-preservation'),
  ('CREATION-INACTIVE', 'CRI', false, 'test-project-creation-preservation'),
  ('CREATION-FOREIGN', 'CRF', true, 'test-project-creation-preservation-foreign')
) fixture(name, acronym, active, company_code) where company.code = fixture.company_code;
insert into public.clients(company_id, name, source_label)
select id, case when code = 'test-project-creation-preservation'
  then 'Creation client' else 'Creation foreign client' end, 'seapilot'
from public.companies where code like 'test-project-creation-preservation%';
-- The current insert trigger already creates a contract; do not duplicate it.
insert into public.projects(company_id, project_code, title, status, source_label,
  sharepoint_list_id, sharepoint_item_id)
select id, 'P950', 'Creation numbering collision', 'Validé', 'sharepoint',
  'creation-fixture-list', '950' from public.companies
where code = 'test-project-creation-preservation';

select set_config('test.creation_company', (select id::text from public.companies where code = 'test-project-creation-preservation'), true);
select set_config('test.creation_client', (select id::text from public.clients where name = 'Creation client'), true);
select set_config('test.creation_foreign_client', (select id::text from public.clients where name = 'Creation foreign client'), true);
select set_config('test.creation_vessel', (select id::text from public.vessels where name = 'CREATION-A'), true);
select set_config('test.creation_secondary', (select id::text from public.vessels where name = 'CREATION-B'), true);
select set_config('test.creation_inactive_vessel', (select id::text from public.vessels where name = 'CREATION-INACTIVE'), true);
select set_config('test.creation_foreign_vessel', (select id::text from public.vessels where name = 'CREATION-FOREIGN'), true);
select set_config('test.creation_save_signature', 'public.projects_save(bigint,text,bigint,bigint,bigint,text,text,date,date,timestamptz,timestamptz,timestamptz,timestamptz,text,text,text,text,boolean,boolean,text,text,integer,numeric,text,text,integer,numeric,numeric,text,numeric,numeric,text,text,text,jsonb,timestamptz)', true);

select pg_temp.creation_ok((select relrowsecurity from pg_class where oid = 'public.projects'::regclass), 'project RLS remains enabled');
select pg_temp.creation_ok(not has_function_privilege('anon', current_setting('test.creation_save_signature'), 'execute'), 'anonymous callers cannot execute project creation');
select pg_temp.creation_ok(has_function_privilege('authenticated', current_setting('test.creation_save_signature'), 'execute'), 'authenticated creation uses the controlled RPC');
select pg_temp.creation_ok(not has_table_privilege('authenticated', 'public.projects', 'INSERT'), 'authenticated callers cannot bypass project creation');
select pg_temp.creation_ok(not has_table_privilege('authenticated', 'public.project_contracts', 'INSERT'), 'authenticated callers cannot bypass contract creation');
select pg_temp.creation_ok(exists(select from pg_constraint where conrelid = 'public.projects'::regclass and conname = 'projects_title_not_blank_check'), 'database protects project titles');
select pg_temp.creation_ok(exists(select from pg_trigger where tgrelid = 'public.projects'::regclass and tgname = 'projects_assign_code' and tgenabled <> 'D'), 'atomic number allocation trigger remains enabled');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'c1020000-0000-0000-0000-000000000001', true);
select public.projects_set_number_floor(950);
do $$
declare created public.projects;
begin
  perform pg_temp.creation_ok(public.projects_peek_next_code('P') = 'P951', 'number preview skips an existing historical code');
  created := public.projects_save(target_title => '  Creation minimal project  ');
  perform set_config('test.creation_project', created.id::text, true);
  perform pg_temp.creation_ok(created.title = 'Creation minimal project', 'admin creates and trims a project title');
  perform pg_temp.creation_ok(created.project_code = 'P951', 'server allocates the previewed free P code');
  perform pg_temp.creation_ok(created.company_id = current_setting('test.creation_company')::bigint and created.created_by = auth.uid(), 'creation uses the active company and authenticated actor');
  perform pg_temp.creation_ok(created.status = 'Non validé', 'new project keeps the existing default status');
  perform pg_temp.creation_ok(created.archived_at is null and created.archived_by is null, 'a new project is active');
  perform pg_temp.creation_ok(created.starts_on is null and created.ends_on is null and created.delivery_at is null and created.redelivery_at is null, 'creation still permits absent dates');
  perform pg_temp.creation_ok(created.client_id is null and created.primary_vessel_id is null and created.secondary_vessel_id is null, 'creation still permits absent client and vessels');
  perform pg_temp.creation_ok((select count(*) from public.project_contracts where project_id = created.id and company_id = created.company_id) = 1, 'creation atomically provides exactly one contract');
  perform pg_temp.creation_ok(exists(select from public.projects_catalog_options() where id = created.id), 'new project enters dependent module selection lists');
  perform pg_temp.creation_ok(exists(select from public.planning_project_catalog() where id = created.id), 'new project enters Planning selection lists');
  perform pg_temp.creation_ok(public.projects_peek_next_code('P') = 'P952', 'number advances once after successful creation');
end;
$$;

select set_config('request.jwt.claim.sub', 'c1020000-0000-0000-0000-000000000002', true);
do $$
declare created public.projects;
        occurrence_id bigint;
        business_status text;
        quick record;
begin
  created := public.projects_save(target_title => 'Creation complete project',
    target_client_id => current_setting('test.creation_client')::bigint,
    target_primary_vessel_id => current_setting('test.creation_vessel')::bigint,
    target_secondary_vessel_id => current_setting('test.creation_secondary')::bigint,
    target_status => 'Validé', target_starts_on => '2026-10-05', target_ends_on => '2026-10-08',
    target_delivery_at => '2026-10-05T10:00:00+02', target_redelivery_at => '2026-10-08T18:00:00+02',
    target_contract_type => 'BIMCO', target_owner_identity => 'BBTM fixture owner',
    target_charter_hire => 2400, target_hire_currency => 'eur', target_hire_unit => 'jour',
    target_mobilisation_fee => 1000, target_fee_currency => 'eur',
    target_supplytime_data => '{"box19_special_fuel":"Fuel fixture"}'::jsonb);
  perform pg_temp.creation_ok(created.project_code = 'P952' and created.created_by = auth.uid() and created.status = 'Validé', 'Direction creates the next numbered project with its chosen status');
  perform pg_temp.creation_ok(created.client_name = 'Creation client' and created.primary_vessel_name = 'CREATION-A' and created.secondary_vessel_name = 'CREATION-B', 'same-company client and vessel snapshots are resolved server-side');
  perform pg_temp.creation_ok(created.starts_on = '2026-10-05'::date and created.ends_on = '2026-10-08'::date and created.contract_type = 'BIMCO', 'contract type and project dates are preserved');
  perform pg_temp.creation_ok((select count(*) from public.project_contracts where project_id = created.id) = 1, 'full creation also creates one contract');
  perform pg_temp.creation_ok(exists(select from public.projects_contracts() where project_id = created.id and charter_hire = 2400 and hire_currency = 'EUR' and mobilisation_fee = 1000 and fee_currency = 'EUR' and owner_identity = 'BBTM fixture owner' and supplytime_data ->> 'box19_special_fuel' = 'Fuel fixture'), 'typed tariffs and document clauses persist in the same contract');
  select id into occurrence_id from public.projects_save_planning_occurrence(null, created.id,
    '2026-10-05', '2026-10-08', array[current_setting('test.creation_vessel')::bigint, current_setting('test.creation_secondary')::bigint],
    'Non validé', 'First mission fixture', null, null, null);
  perform pg_temp.creation_ok(exists(select from public.planning_operations_view where id = occurrence_id and catalog_project_id = created.id and status = 'Non validé'), 'first operation keeps its existing non-validated status and project association');
  perform pg_temp.creation_ok((select count(*) from public.planning_operations_view where catalog_project_id = created.id) = 1, 'first operation does not duplicate the catalog project');
  foreach business_status in array array['Brouillon', 'Non validé', 'Validé', 'Stand-by météo', 'Facturé'] loop
    created := public.projects_save(target_title => 'Creation status ' || business_status, target_status => business_status);
    perform pg_temp.creation_ok(created.status = business_status and created.archived_at is null, 'creation preserves existing business status: ' || business_status);
  end loop;
  select * into quick from public.planning_create_quick_project('Creation Planning quick draft', current_setting('test.creation_vessel')::bigint, '2026-10-10');
  perform pg_temp.creation_ok(quick.catalog_project_id is not null and quick.status = 'Brouillon', 'Planning quick creation still produces a draft project and occurrence');
  perform pg_temp.creation_ok(exists(select from public.projects where id = quick.catalog_project_id and status = 'Brouillon' and archived_at is null), 'Planning quick creation uses the same active project catalog');
  perform pg_temp.creation_ok((select count(*) from public.project_contracts where project_id = quick.catalog_project_id) = 1 and (select count(*) from public.planning_operations_view where catalog_project_id = quick.catalog_project_id) = 1, 'Planning quick creation persists one contract and one operation');
end;
$$;

-- Exercise failure boundaries using the Admin writer. A contract constraint
-- failure occurs after the project insert and must roll back its number too.
select set_config('request.jwt.claim.sub', 'c1020000-0000-0000-0000-000000000001', true);
do $$
declare previous_code text := public.projects_peek_next_code('P');
        previous_count bigint := (select count(*) from public.projects);
begin
  perform pg_temp.creation_error('select public.projects_save(target_title => '' '')', '22023', 'blank title is rejected');
  perform pg_temp.creation_error('select public.projects_save(target_title => ''Creation invalid period'', target_starts_on => ''2026-10-08'', target_ends_on => ''2026-10-05'')', '22023', 'inverted project period is rejected');
  perform pg_temp.creation_error(format('select public.projects_save(target_title => ''Creation same vessels'', target_primary_vessel_id => %s, target_secondary_vessel_id => %s)', current_setting('test.creation_vessel'), current_setting('test.creation_vessel')), '22023', 'duplicate vessel selections are rejected');
  perform pg_temp.creation_error(format('select public.projects_save(target_title => ''Creation foreign client'', target_client_id => %s)', current_setting('test.creation_foreign_client')), '23503', 'foreign-company client is rejected');
  perform pg_temp.creation_error(format('select public.projects_save(target_title => ''Creation foreign vessel'', target_primary_vessel_id => %s)', current_setting('test.creation_foreign_vessel')), '23503', 'foreign-company vessel is rejected');
  perform pg_temp.creation_error(format('select public.projects_save(target_title => ''Creation inactive vessel'', target_primary_vessel_id => %s)', current_setting('test.creation_inactive_vessel')), '23503', 'inactive vessel is rejected');
  perform pg_temp.creation_error('select public.projects_save(target_title => ''Creation invalid contract'', target_charter_hire => -1, target_hire_currency => ''EUR'')', '23514', 'invalid contract tariff rejects the complete creation');
  perform pg_temp.creation_ok((select count(*) from public.projects) = previous_count and not exists(select from public.projects where title = 'Creation invalid contract'), 'failed creations leave no partially created project');
  perform pg_temp.creation_ok(public.projects_peek_next_code('P') = previous_code, 'failed creations do not consume project numbers');
end;
$$;

do $$
declare actor text;
begin
  foreach actor in array array['c1020000-0000-0000-0000-000000000003', 'c1020000-0000-0000-0000-000000000004', 'c1020000-0000-0000-0000-000000000007', 'c1020000-0000-0000-0000-000000000006'] loop
    perform set_config('request.jwt.claim.sub', actor, true);
    perform pg_temp.creation_error('select public.projects_save(target_title => ''Creation unauthorized'')', '42501', 'real non-manager or inactive member cannot create a project: ' || actor);
  end loop;
  foreach actor in array array['c1020000-0000-0000-0000-000000000003', 'c1020000-0000-0000-0000-000000000004'] loop
    perform set_config('request.jwt.claim.sub', actor, true);
    perform pg_temp.creation_ok(not exists(select from public.projects), 'real field profile receives no commercial project rows: ' || actor);
  end loop;
  perform set_config('request.jwt.claim.sub', 'c1020000-0000-0000-0000-000000000005', true);
  perform pg_temp.creation_error(format('select public.projects_save(target_project_id => %s, target_title => ''Creation foreign update'')', current_setting('test.creation_project')), 'P0002', 'foreign Admin cannot rewrite a project in another company');
end;
$$;

reset role;
select count(*) || ' project creation preservation assertions passed using real authenticated fixtures' as result
from creation_assertions;
rollback;
