begin;

select plan(54);

select ok(
  to_regprocedure('public.clients_save(bigint,text,text,text,text,text,text,text,boolean,timestamp with time zone)') is not null,
  'client save RPC exists'
);
select ok(
  to_regprocedure('public.projects_save(bigint,text,bigint,bigint,bigint,text,text,date,date,timestamp with time zone,timestamp with time zone,timestamp with time zone,timestamp with time zone,text,text,text,text,boolean,boolean,text,text,integer,numeric,text,text,integer,numeric,numeric,text,numeric,numeric,text,text,text,jsonb,timestamp with time zone)') is not null,
  'atomic project and contract save RPC exists'
);
select has_function('public', 'projects_catalog_options', array[]::text[], 'dependent-module project catalog RPC exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.projects'::regclass),
  'projects RLS remains enabled'
);
select ok(not has_table_privilege('authenticated', 'public.clients', 'INSERT'), 'clients cannot bypass their RPC');
select ok(not has_table_privilege('authenticated', 'public.projects', 'INSERT'), 'projects cannot bypass their RPC on create');
select ok(not has_table_privilege('authenticated', 'public.projects', 'UPDATE'), 'projects cannot bypass their RPC');
select ok(not has_table_privilege('authenticated', 'public.project_contracts', 'INSERT'), 'contracts cannot bypass their RPC on create');
select ok(not has_table_privilege('authenticated', 'public.project_contracts', 'UPDATE'), 'contracts cannot bypass their RPC');
select ok(not has_table_privilege('authenticated', 'public.projects', 'DELETE'), 'physical project deletion remains unavailable');
select ok(
  exists(select 1 from pg_constraint where conname = 'clients_name_not_blank_check' and conrelid = 'public.clients'::regclass),
  'client names cannot be blank'
);
select ok(
  exists(select 1 from pg_constraint where conname = 'projects_title_not_blank_check' and conrelid = 'public.projects'::regclass),
  'project titles cannot be blank'
);
select ok(
  exists(select 1 from pg_constraint where conname = 'project_contracts_extension_bundle_check' and conrelid = 'public.project_contracts'::regclass),
  'extension fields are validated together'
);

insert into public.companies (code, name) values ('phase4-other', 'Phase 4 other company');

insert into auth.users (id, email)
values
  ('20000000-0000-0000-0000-000000000001', 'phase4-admin@example.invalid'),
  ('20000000-0000-0000-0000-000000000002', 'phase4-direction@example.invalid'),
  ('20000000-0000-0000-0000-000000000003', 'phase4-armement@example.invalid'),
  ('20000000-0000-0000-0000-000000000004', 'phase4-capitaine@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('20000000-0000-0000-0000-000000000001'::uuid, 'phase4-admin@example.invalid', 'Phase 4 admin'),
    ('20000000-0000-0000-0000-000000000002'::uuid, 'phase4-direction@example.invalid', 'Phase 4 direction'),
    ('20000000-0000-0000-0000-000000000003'::uuid, 'phase4-armement@example.invalid', 'Phase 4 armement'),
    ('20000000-0000-0000-0000-000000000004'::uuid, 'phase4-capitaine@example.invalid', 'Phase 4 capitaine')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('20000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('20000000-0000-0000-0000-000000000002'::uuid, 'direction'),
    ('20000000-0000-0000-0000-000000000003'::uuid, 'armement'),
    ('20000000-0000-0000-0000-000000000004'::uuid, 'capitaine')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active, fleet_exit_on)
select company.id, fixture.name, fixture.acronym, fixture.active, fixture.fleet_exit_on
from (
  values
    ('PHASE4-A', 'P4A', true, null::date),
    ('PHASE4-B', 'P4B', true, null::date),
    ('PHASE4-INACTIVE', 'P4I', false, null::date)
) fixture(name, acronym, active, fleet_exit_on)
cross join public.companies company
where company.code = 'bbtm';

insert into public.clients (company_id, name, source_label, sharepoint_list_id, sharepoint_item_id)
select company.id, 'Imported client phase 4', 'sharepoint', 'phase4-clients', '701'
from public.companies company where company.code = 'bbtm';

insert into public.clients (company_id, name, source_label)
select company.id, 'Other company client phase 4', 'seapilot'
from public.companies company where company.code = 'phase4-other';

select set_config('test.phase4_other_client_id', id::text, true)
from public.clients
where name = 'Other company client phase 4';

insert into public.projects (
  company_id, title, project_code, source_label, sharepoint_list_id, sharepoint_item_id
)
select company.id, fixture.title, fixture.project_code, 'sharepoint', 'phase4-projects', fixture.item_id
from (
  values
    ('Imported project phase 4', 'P800', '800'),
    ('Collision project phase 4', 'P950', '950')
) fixture(title, project_code, item_id)
cross join public.companies company
where company.code = 'bbtm';

insert into public.project_contracts (
  company_id, project_id, owner_identity, source_label, sharepoint_list_id, sharepoint_item_id
)
select project.company_id, project.id, 'Imported owner', 'sharepoint', 'phase4-projects', '800'
from public.projects project where project.title = 'Imported project phase 4';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.clients_save(target_name => 'Phase 4 client', target_code => 'P4C', target_city => 'Brest')$$,
  'admin creates a client through the RPC'
);
select is(
  (select source_label from public.clients where name = 'Phase 4 client'),
  'seapilot',
  'new clients are sourced from SeaPilot'
);
select lives_ok(
  $$select public.clients_save(
      target_client_id => (select id from public.clients where name = 'Phase 4 client'),
      target_name => 'Phase 4 client',
      target_code => 'P4C2',
      target_city => 'Cherbourg'
    )$$,
  'admin updates a client through the RPC'
);
select is((select code from public.clients where name = 'Phase 4 client'), 'P4C2', 'client changes are persisted');
select throws_ok(
  $$select public.clients_save(target_name => 'Phase 4 client')$$,
  '23505',
  'An active client with this name already exists',
  'duplicate active client names are rejected transactionally'
);
select throws_ok(
  $$select public.clients_save(
      target_client_id => (select id from public.clients where name = 'Phase 4 client'),
      target_name => 'Phase 4 client',
      target_expected_updated_at => '2000-01-01'::timestamptz
    )$$,
  '40001',
  'Client was modified by another user',
  'stale client writes are rejected'
);

select lives_ok($$select public.projects_set_number_floor(950)$$, 'admin aligns the counter to a colliding historical number');
select lives_ok(
  $$select public.projects_save(
      target_title => 'Phase 4 project',
      target_client_id => (select id from public.clients where name = 'Phase 4 client'),
      target_primary_vessel_id => (select id from public.vessels where name = 'PHASE4-A'),
      target_secondary_vessel_id => (select id from public.vessels where name = 'PHASE4-B'),
      target_status => 'Offre transmise',
      target_starts_on => '2026-08-01',
      target_ends_on => '2026-08-10',
      target_delivery_at => '2026-08-01T08:00:00+02',
      target_redelivery_at => '2026-08-10T18:00:00+02',
      target_owner_identity => 'BBTM',
      target_extension_count => 1,
      target_extension_duration => 5,
      target_extension_unit => 'jours',
      target_mobilisation_fee => 1000,
      target_fee_currency => 'eur',
      target_charter_hire => 12000,
      target_hire_currency => 'eur',
      target_hire_unit => 'jour',
      target_supplytime_data => '{"box05_cancelling_date":"31 juillet 2026"}'::jsonb
    )$$,
  'project and contract are created atomically'
);
select is((select project_code from public.projects where title = 'Phase 4 project'), 'P951', 'number allocation skips a historical collision');
select is((select client_name from public.projects where title = 'Phase 4 project'), 'Phase 4 client', 'client snapshot is resolved server-side');
select is((select primary_vessel_name from public.projects where title = 'Phase 4 project'), 'PHASE4-A', 'vessel snapshot is resolved server-side');
select is(
  (select fee_currency from public.project_contracts where project_id = (select id from public.projects where title = 'Phase 4 project')),
  'EUR',
  'typed contract values are normalized and persisted'
);
select is(
  (select supplytime_data ->> 'box05_cancelling_date' from public.project_contracts where project_id = (select id from public.projects where title = 'Phase 4 project')),
  '31 juillet 2026',
  'SUPPLYTIME data is persisted in the same transaction'
);
select is(
  (select count(*)::integer from public.projects_catalog_options() where title = 'Phase 4 project'),
  1,
  'a new project is immediately available to dependent modules without duplication'
);
select lives_ok(
  $$select public.projects_save(
      target_project_id => (select id from public.projects where title = 'Phase 4 project'),
      target_title => 'Phase 4 project',
      target_client_id => (select id from public.clients where name = 'Phase 4 client'),
      target_primary_vessel_id => (select id from public.vessels where name = 'PHASE4-A'),
      target_secondary_vessel_id => (select id from public.vessels where name = 'PHASE4-B'),
      target_status => 'Contrat signé',
      target_owner_identity => 'BBTM updated'
    )$$,
  'project status and contract can be updated together'
);
select is((select status from public.projects where title = 'Phase 4 project'), 'Contrat signé', 'status change is persisted');
select is((select project_code from public.projects where title = 'Phase 4 project'), 'P951', 'project number is immutable on update');

select throws_ok(
  $$select public.projects_save(target_title => ' ')$$,
  '22023', 'Project title is required', 'blank project titles are rejected by the RPC'
);
select throws_ok(
  $$select public.projects_save(target_title => 'Bad dates', target_starts_on => '2026-08-10', target_ends_on => '2026-08-01')$$,
  '22023', 'Project end date cannot precede its start date', 'invalid project dates are rejected'
);
select throws_ok(
  $$select public.projects_save(
      target_title => 'Same vessels',
      target_primary_vessel_id => (select id from public.vessels where name = 'PHASE4-A'),
      target_secondary_vessel_id => (select id from public.vessels where name = 'PHASE4-A')
    )$$,
  '22023', 'Primary and secondary vessels must be different', 'duplicate vessel selections are rejected'
);
select throws_ok(
  $$select public.projects_save(target_title => 'Partial extension', target_extension_count => 1)$$,
  '22023', 'Extension count, duration and unit must be provided together with positive values', 'partial extension data is rejected'
);
select throws_ok(
  $$select public.projects_save(target_title => 'Missing currency', target_charter_hire => 1000)$$,
  '22023', 'A three-letter hire currency is required', 'commercial amounts require a currency'
);
select throws_ok(
  $$select public.projects_save(target_title => 'Bad supplytime', target_supplytime_data => '{"unknown":"value"}'::jsonb)$$,
  '22023', 'Invalid supplytime-2017-v1 payload', 'unknown SUPPLYTIME fields are rejected'
);
select throws_ok(
  $$select public.projects_save(
      target_title => 'Inactive vessel',
      target_primary_vessel_id => (select id from public.vessels where name = 'PHASE4-INACTIVE')
    )$$,
  '23503', 'Selected primary vessel is unavailable in the active company', 'inactive vessels cannot be selected for new projects'
);

select lives_ok(
  $$select public.projects_save(
      target_project_id => (select id from public.projects where title = 'Imported project phase 4'),
      target_title => 'Imported project phase 4 updated',
      target_status => 'Validé',
      target_owner_identity => 'Imported owner updated'
    )$$,
  'an imported project can be modified through canonical fields'
);
select is(
  (select source_label || ':' || sharepoint_list_id || ':' || sharepoint_item_id from public.projects where project_code = 'P800'),
  'sharepoint:phase4-projects:800',
  'project SharePoint provenance is preserved'
);
select is(
  (select source_label || ':' || sharepoint_list_id || ':' || sharepoint_item_id from public.project_contracts where project_id = (select id from public.projects where project_code = 'P800')),
  'sharepoint:phase4-projects:800',
  'contract SharePoint provenance is preserved'
);
select throws_ok(
  $$select public.projects_save(
      target_project_id => (select id from public.projects where title = 'Phase 4 project'),
      target_title => 'Phase 4 project',
      target_expected_updated_at => '2000-01-01'::timestamptz
    )$$,
  '40001', 'Project was modified by another user', 'stale project writes are rejected'
);
select lives_ok(
  $$select public.projects_archive((select id from public.projects where title = 'Phase 4 project'))$$,
  'project archiving remains a controlled soft transition'
);
select is(
  (select count(*)::integer from public.projects_catalog_options() where title = 'Phase 4 project'),
  0,
  'archived projects disappear from dependent-module options'
);
select throws_ok(
  $$select public.projects_save(
      target_project_id => (select id from public.projects where title = 'Phase 4 project'),
      target_title => 'Phase 4 project'
    )$$,
  '55000', 'An archived project cannot be modified', 'archived projects cannot be edited'
);
select ok(
  (select count(*) > 0 from public.project_change_log where entity_type = 'projects' and action = 'update'),
  'project and status updates are audited'
);
select ok(
  (select count(*) > 0 from public.project_change_log where entity_type = 'project_contracts' and action = 'update'),
  'contract updates are audited'
);
select ok(
  not exists (
    select 1 from public.project_change_log
    where entity_type = 'clients'
      and (
        coalesce(old_values, '{}'::jsonb) ?| array['email', 'phone', 'address']
        or coalesce(new_values, '{}'::jsonb) ?| array['email', 'phone', 'address']
      )
  ),
  'client contact data remains excluded from audit snapshots'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', true);
select lives_ok($$select public.projects_save(target_title => 'Direction phase 4 project')$$, 'direction can save projects');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.projects_save(target_title => 'Armement forbidden project')$$,
  '42501', 'Insufficient permission to save a project', 'armement cannot write the project catalog'
);
select lives_ok($$select * from public.projects_catalog_options()$$, 'armement can read minimal project options for dependent modules');

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select * from public.projects_catalog_options()$$,
  '42501', 'Insufficient permission to read project catalog options', 'capitaine cannot bypass the validated project option role matrix'
);

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.projects_save(
      target_title => 'Cross-company client project',
      target_client_id => current_setting('test.phase4_other_client_id')::bigint
    )$$,
  '23503', 'Selected client is unavailable in the active company', 'cross-company client relations are rejected'
);
select hasnt_column('public', 'planning_projects', 'catalog_project_id', 'planning projects remain independent from the catalog');
select throws_ok(
  $$insert into public.clients (name) values ('Bypass client')$$,
  '42501', null, 'authenticated users cannot bypass the client RPC with direct table writes'
);

select * from finish();
rollback;
