begin;

select plan(54);

select has_table('public', 'clients', 'clients table exists');
select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'project_contracts', 'project_contracts table exists');
select has_table('public', 'project_number_counters', 'project number counter exists');
select has_table('public', 'project_change_log', 'project audit log exists');

select has_column('public', 'projects', 'company_id', 'projects are tenant scoped');
select has_column('public', 'projects', 'delivery_at', 'delivery timestamp is typed');
select has_column('public', 'projects', 'redelivery_at', 'redelivery timestamp is typed');
select has_column('public', 'projects', 'operation_area', 'operation area is typed');
select has_column('public', 'projects', 'source_payload', 'project source payload is preserved');
select has_column('public', 'project_documents', 'sharepoint_drive_item_id', 'document drive item id is preserved');
select has_column('public', 'project_documents', 'file_size_bytes', 'document size metadata is typed');
select has_column('public', 'project_contracts', 'supplytime_data', 'SUPPLYTIME payload exists');

select has_pk('public', 'project_number_counters', 'counter has a primary key');
select ok(
  to_regclass('public.projects_company_code_normalized_unique_idx') is not null,
  'normalized project code has a unique index'
);
select hasnt_column('public', 'planning_projects', 'catalog_project_id', 'planning_projects remains separate');
select has_fk('public', 'project_contracts', 'contract is related to a catalog project');
select ok(
  to_regclass('public.project_documents_drive_item_unique_idx') is not null,
  'SharePoint drive item identity is unique'
);
select ok(
  (
    select bool_and(relrowsecurity)
    from pg_class
    where oid = any (array[
      'public.clients'::regclass,
      'public.projects'::regclass,
      'public.project_contracts'::regclass,
      'public.project_documents'::regclass,
      'public.contract_documents'::regclass,
      'public.project_number_counters'::regclass,
      'public.project_change_log'::regclass
    ])
  ),
  'RLS is enabled on every Projects domain table'
);
select ok(
  not has_table_privilege('authenticated', 'public.projects', 'DELETE'),
  'authenticated users cannot physically delete projects'
);
select ok(
  not has_table_privilege('authenticated', 'public.project_documents', 'DELETE'),
  'authenticated users cannot physically delete project documents'
);

select ok(
  public.is_valid_supplytime_data('{"box01_owners":"BBTM","signature_owners":null}'::jsonb),
  'documented SUPPLYTIME string/null keys are accepted'
);
select ok(
  not public.is_valid_supplytime_data('{"unknown":"value"}'::jsonb),
  'unknown SUPPLYTIME keys are rejected'
);
select ok(
  not public.is_valid_supplytime_data('{"box01_owners":{"nested":true}}'::jsonb),
  'nested SUPPLYTIME values are rejected'
);
select ok(
  public.is_valid_project_source_payload('{"legacy":"value"}'::jsonb),
  'object source payload is accepted'
);
select ok(
  not public.is_valid_project_source_payload('["legacy"]'::jsonb),
  'array source payload is rejected'
);
select matches(
  pg_get_functiondef('public.allocate_next_project_code(bigint,text)'::regprocedure),
  '(?i)for update',
  'project number allocation locks the counter row'
);

insert into public.companies (code, name) values ('phase1-other', 'Phase 1 other company');

insert into auth.users (id, email)
values
  ('10000000-0000-0000-0000-000000000001', 'phase1-admin@example.invalid'),
  ('10000000-0000-0000-0000-000000000002', 'phase1-direction@example.invalid'),
  ('10000000-0000-0000-0000-000000000003', 'phase1-armement@example.invalid'),
  ('10000000-0000-0000-0000-000000000004', 'phase1-capitaine@example.invalid'),
  ('10000000-0000-0000-0000-000000000005', 'phase1-inactive-admin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('10000000-0000-0000-0000-000000000001'::uuid, 'phase1-admin@example.invalid', 'Phase 1 admin'),
    ('10000000-0000-0000-0000-000000000002'::uuid, 'phase1-direction@example.invalid', 'Phase 1 direction'),
    ('10000000-0000-0000-0000-000000000003'::uuid, 'phase1-armement@example.invalid', 'Phase 1 armement'),
    ('10000000-0000-0000-0000-000000000004'::uuid, 'phase1-capitaine@example.invalid', 'Phase 1 capitaine'),
    ('10000000-0000-0000-0000-000000000005'::uuid, 'phase1-inactive-admin@example.invalid', 'Phase 1 inactive admin')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('10000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('10000000-0000-0000-0000-000000000002'::uuid, 'direction'),
    ('10000000-0000-0000-0000-000000000003'::uuid, 'armement'),
    ('10000000-0000-0000-0000-000000000004'::uuid, 'capitaine'),
    ('10000000-0000-0000-0000-000000000005'::uuid, 'admin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.projects (
  company_id,
  title,
  project_code,
  source_label,
  sharepoint_list_id,
  sharepoint_item_id
)
select company.id, 'Other company project', 'P777', 'sharepoint', 'other-project-list', '777'
from public.companies company
where company.code = 'phase1-other';

update public.company_memberships
set active = false
where user_id = '10000000-0000-0000-0000-000000000005';

update public.companies set active = false where code = 'phase1-other';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.projects_set_number_floor(900)$$,
  'admin can align the explicit project number floor'
);
select lives_ok(
  $$select public.projects_create('Admin project')$$,
  'admin can create a project through the RPC'
);
select is(
  (select project_code from public.projects where title = 'Admin project'),
  'P900',
  'first server-allocated code uses the configured floor'
);
select lives_ok(
  $$select public.projects_set_number_floor(500)$$,
  'setting a lower floor is accepted without decreasing the counter'
);
select is(
  (select next_number from public.projects_set_number_floor(500)),
  901,
  'project number floor remains monotonic'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.projects_create('Direction project')$$,
  'direction can create a project through the RPC'
);
select is(
  (select project_code from public.projects where title = 'Direction project'),
  'P901',
  'consecutive creation receives the next unique code'
);
select is(
  (select count(*)::integer from public.projects),
  2,
  'direction reads projects from the active company only'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*)::integer from public.projects),
  0,
  'armement has no catalog access in the validated minimal matrix'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select is(
  (select count(*)::integer from public.projects),
  0,
  'capitaine has no catalog access in the validated minimal matrix'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*)::integer from public.projects where title = 'Other company project'),
  0,
  'admin cannot read a project from another company'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$
    insert into public.project_documents (
      title, source_label, sharepoint_drive_id, sharepoint_drive_item_id, file_url
    ) values ('Direction document', 'sharepoint', 'drive-direction', 'item-direction', 'https://sharepoint.invalid/direction')
  $$,
  '42501',
  null,
  'direction cannot write SharePoint document metadata'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$
    insert into public.project_documents (
      project_id, title, file_name, source_label, sharepoint_drive_id, sharepoint_drive_item_id, file_url
    )
    select id, 'Admin document', 'admin-document.pdf', 'sharepoint', 'drive-admin', 'item-admin', 'https://sharepoint.invalid/admin'
    from public.projects where title = 'Admin project'
  $$,
  'admin can write SharePoint document metadata'
);
select throws_ok(
  $$delete from public.projects where title = 'Admin project'$$,
  '42501',
  null,
  'physical project deletion is denied'
);
select throws_ok(
  $$update public.projects set sharepoint_item_id = 'tampered' where title = 'Admin project'$$,
  '42501',
  null,
  'authenticated users cannot mutate source identity'
);
select lives_ok(
  $$
    select public.projects_set_supplytime(
      (select id from public.projects where title = 'Admin project'),
      '{"box01_owners":"BBTM","box02_charterers":"Client"}'::jsonb
    )
  $$,
  'admin can persist a valid SUPPLYTIME payload'
);
select throws_ok(
  $$
    select public.projects_set_supplytime(
      (select id from public.projects where title = 'Admin project'),
      '{"unknown":"value"}'::jsonb
    )
  $$,
  'P0001',
  'Invalid supplytime-2017-v1 payload',
  'unknown SUPPLYTIME keys are rejected by the RPC'
);
select ok(
  (select count(*) > 0 from public.project_change_log where entity_type = 'projects'),
  'project changes are audited'
);
select ok(
  not exists (
    select 1
    from public.project_change_log
    where coalesce(old_values, '{}'::jsonb) ? 'source_payload'
       or coalesce(new_values, '{}'::jsonb) ? 'source_payload'
  ),
  'raw source payload is excluded from audit snapshots'
);
select lives_ok(
  $$insert into public.clients (name, email, phone, address) values ('Audited client', 'private@example.invalid', '+33000000000', 'Private address')$$,
  'admin can create a client'
);
select ok(
  not exists (
    select 1
    from public.project_change_log
    where entity_type = 'clients'
      and (
        coalesce(old_values, '{}'::jsonb) ?| array['email', 'phone', 'address']
        or coalesce(new_values, '{}'::jsonb) ?| array['email', 'phone', 'address']
      )
  ),
  'client contact details are excluded from audit snapshots'
);
select lives_ok(
  $$select public.projects_archive((select id from public.projects where title = 'Admin project'))$$,
  'admin can archive through the controlled RPC'
);
select ok(
  (select archived_at is not null from public.projects where title = 'Admin project'),
  'archiving is a soft state transition'
);
select ok(
  (
    select bool_and(coalesce(qual, '') like '%user_belongs_to_company%')
    from pg_policies
    where schemaname = 'public'
      and tablename in ('dpr_items', 'dpr_archives', 'purchase_requests', 'action_items', 'action_documents')
  ),
  'dependent-module policies include company isolation'
);
select matches(
  pg_get_functiondef('public.resolve_sharepoint_operation_links()'::regprocedure),
  'project.company_id = request.company_id',
  'dependent project reconciliation is company scoped'
);
select throws_ok(
  $$
    insert into public.projects (
      title, source_label, sharepoint_list_id, sharepoint_item_id
    ) values ('Spoofed source project', 'seapilot', 'spoofed-list', 'spoofed-item')
  $$,
  '42501',
  null,
  'an authenticated creation cannot spoof SharePoint provenance'
);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000005', true);
select throws_ok(
  $$select public.projects_create('Inactive membership project')$$,
  '42501',
  'Insufficient permission to create a project',
  'an inactive company membership cannot use a security-definer project RPC'
);

select * from finish();
rollback;
