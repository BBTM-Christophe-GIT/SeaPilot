begin;

select plan(36);

select is(
  (
    select count(*)::integer
    from pg_class
    where oid in (
      'public.clients'::regclass,
      'public.projects'::regclass,
      'public.project_contracts'::regclass,
      'public.project_documents'::regclass,
      'public.contract_documents'::regclass,
      'public.project_change_log'::regclass
    )
      and relrowsecurity
  ),
  6,
  'RLS is enabled on every Projects domain table'
);
select ok(not has_table_privilege('authenticated', 'public.clients', 'DELETE'), 'clients cannot be physically deleted');
select ok(not has_table_privilege('authenticated', 'public.projects', 'DELETE'), 'projects cannot be physically deleted');
select ok(not has_table_privilege('authenticated', 'public.project_contracts', 'DELETE'), 'contracts cannot be physically deleted');
select ok(not has_table_privilege('authenticated', 'public.project_documents', 'DELETE'), 'project document metadata cannot be physically deleted');
select ok(not has_table_privilege('authenticated', 'public.contract_documents', 'DELETE'), 'contract document metadata cannot be physically deleted');
select ok(not has_table_privilege('authenticated', 'public.projects', 'INSERT'), 'project creation cannot bypass projects_save');
select ok(not has_table_privilege('authenticated', 'public.projects', 'UPDATE'), 'project updates cannot bypass projects_save');
select ok(
  not has_table_privilege('anon', 'public.projects', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'anonymous users have no project table privilege'
);
select ok(not has_sequence_privilege('anon', 'public.projects_id_seq', 'USAGE'), 'anonymous users cannot allocate project IDs');
select has_column('public', 'planning_projects', 'catalog_project_id', 'planning projects remain separate with an optional catalog link');

insert into auth.users (id, email)
values
  ('60000000-0000-0000-0000-000000000001', 'phase6-admin@example.invalid'),
  ('60000000-0000-0000-0000-000000000002', 'phase6-direction@example.invalid'),
  ('60000000-0000-0000-0000-000000000003', 'phase6-armement@example.invalid'),
  ('60000000-0000-0000-0000-000000000004', 'phase6-capitaine@example.invalid'),
  ('60000000-0000-0000-0000-000000000005', 'phase6-marin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('60000000-0000-0000-0000-000000000001'::uuid, 'phase6-admin@example.invalid', 'Phase 6 admin'),
    ('60000000-0000-0000-0000-000000000002'::uuid, 'phase6-direction@example.invalid', 'Phase 6 direction'),
    ('60000000-0000-0000-0000-000000000003'::uuid, 'phase6-armement@example.invalid', 'Phase 6 armement'),
    ('60000000-0000-0000-0000-000000000004'::uuid, 'phase6-capitaine@example.invalid', 'Phase 6 capitaine'),
    ('60000000-0000-0000-0000-000000000005'::uuid, 'phase6-marin@example.invalid', 'Phase 6 marin')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('60000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('60000000-0000-0000-0000-000000000002'::uuid, 'direction'),
    ('60000000-0000-0000-0000-000000000003'::uuid, 'armement'),
    ('60000000-0000-0000-0000-000000000004'::uuid, 'capitaine'),
    ('60000000-0000-0000-0000-000000000005'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.clients (company_id, name, source_label)
select id, 'Phase 6 fixture client', 'seapilot'
from public.companies where code = 'bbtm';

insert into public.projects (company_id, title, project_code, client_id, client_name, source_label)
select company.id, 'Phase 6 fixture project', 'P6000', client.id, client.name, 'seapilot'
from public.companies company
join public.clients client on client.company_id = company.id and client.name = 'Phase 6 fixture client'
where company.code = 'bbtm';

insert into public.project_contracts (company_id, project_id, owner_identity, source_label)
select company_id, id, 'Phase 6 owner', 'seapilot'
from public.projects where title = 'Phase 6 fixture project';

insert into public.project_documents (
  company_id, project_id, project_code, project_title, title, source_label,
  sharepoint_drive_id, sharepoint_drive_item_id, file_url
)
select company_id, id, project_code, title, 'phase6-project.pdf', 'sharepoint',
       'phase6-project-drive', 'phase6-project-item', 'https://bbtm668.sharepoint.com/sites/QHSE/phase6-project.pdf'
from public.projects where title = 'Phase 6 fixture project';

insert into public.contract_documents (
  company_id, project_id, project_code, project_title, title, source_label,
  sharepoint_drive_id, sharepoint_drive_item_id, file_url
)
select company_id, id, project_code, title, 'phase6-contract.pdf', 'sharepoint',
       'phase6-contract-drive', 'phase6-contract-item', 'https://bbtm668.sharepoint.com/sites/QHSE/phase6-contract.pdf'
from public.projects where title = 'Phase 6 fixture project';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Admin: full catalog access and business writes.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000001', true);
select is((select count(*)::integer from public.projects where title = 'Phase 6 fixture project'), 1, 'admin reads projects');
select is((select count(*)::integer from public.clients where name = 'Phase 6 fixture client'), 1, 'admin reads clients');
select is((select count(*)::integer from public.project_contracts where owner_identity = 'Phase 6 owner'), 1, 'admin reads contracts');
select is((select count(*)::integer from public.project_documents where title = 'phase6-project.pdf'), 1, 'admin reads project documents');
select is((select count(*)::integer from public.contract_documents where title = 'phase6-contract.pdf'), 1, 'admin reads contract documents');
select lives_ok($$select public.projects_save(target_title => 'Phase 6 admin project')$$, 'admin creates a project through the RPC');
select is(
  (select count(*)::integer from public.projects_catalog_options() where title = 'Phase 6 admin project'),
  1,
  'a newly created project is immediately available to dependent modules'
);
select lives_ok(
  $$insert into public.project_documents (
      company_id, title, source_label, sharepoint_drive_id, sharepoint_drive_item_id, file_url
    ) values (
      public.current_planning_company_id(), 'phase6-admin-document.pdf', 'sharepoint',
      'phase6-admin-drive', 'phase6-admin-item',
      'https://bbtm668.sharepoint.com/sites/QHSE/phase6-admin-document.pdf'
    )$$,
  'admin can refresh SharePoint document metadata'
);

-- Direction: full catalog access and RPC writes, but no metadata import.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000002', true);
select is((select count(*)::integer from public.projects where title = 'Phase 6 fixture project'), 1, 'direction reads projects');
select is((select count(*)::integer from public.project_documents where title = 'phase6-project.pdf'), 1, 'direction reads documents');
select lives_ok($$select public.projects_save(target_title => 'Phase 6 direction project')$$, 'direction creates a project through the RPC');
select throws_ok(
  $$insert into public.project_documents (
      company_id, title, source_label, sharepoint_drive_id, sharepoint_drive_item_id, file_url
    ) values (
      public.current_planning_company_id(), 'phase6-direction-document.pdf', 'sharepoint',
      'phase6-direction-drive', 'phase6-direction-item',
      'https://bbtm668.sharepoint.com/sites/QHSE/phase6-direction-document.pdf'
    )$$,
  '42501', null, 'direction cannot import SharePoint metadata directly'
);

-- Armement: no sensitive catalog rows; minimal options only for dependent modules.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000003', true);
select is((select count(*)::integer from public.projects where title = 'Phase 6 fixture project'), 0, 'armement cannot read full projects');
select is((select count(*)::integer from public.clients where name = 'Phase 6 fixture client'), 0, 'armement cannot read clients');
select is((select count(*)::integer from public.project_documents where title = 'phase6-project.pdf'), 0, 'armement cannot read document metadata');
select throws_ok(
  $$select public.projects_save(target_title => 'Phase 6 forbidden armement project')$$,
  '42501', 'Insufficient permission to save a project', 'armement cannot write projects'
);
select is(
  (select count(*)::integer from public.projects_catalog_options() where title = 'Phase 6 fixture project'),
  1,
  'armement reads only the minimal project options needed by dependent modules'
);

-- Capitaine: no catalog read or write, including minimal options.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000004', true);
select is((select count(*)::integer from public.projects where title = 'Phase 6 fixture project'), 0, 'capitaine cannot read full projects');
select throws_ok(
  $$select public.projects_save(target_title => 'Phase 6 forbidden capitaine project')$$,
  '42501', 'Insufficient permission to save a project', 'capitaine cannot write projects'
);
select throws_ok(
  $$select * from public.projects_catalog_options()$$,
  '42501', 'Insufficient permission to read project catalog options', 'capitaine cannot read project options'
);

-- Marin: explicit negative coverage missing from the earlier phase tests.
select set_config('request.jwt.claim.sub', '60000000-0000-0000-0000-000000000005', true);
select is((select count(*)::integer from public.projects where title = 'Phase 6 fixture project'), 0, 'marin cannot read full projects');
select is((select count(*)::integer from public.project_documents where title = 'phase6-project.pdf'), 0, 'marin cannot read document metadata');
select throws_ok(
  $$select public.projects_save(target_title => 'Phase 6 forbidden marin project')$$,
  '42501', 'Insufficient permission to save a project', 'marin cannot write projects'
);
select throws_ok(
  $$select * from public.projects_catalog_options()$$,
  '42501', 'Insufficient permission to read project catalog options', 'marin cannot read project options'
);
select throws_ok(
  $$select * from public.resolve_sharepoint_project_document_links()$$,
  '42501', 'Document reconciliation requires service_role or admin', 'marin cannot reconcile SharePoint document links'
);

select * from finish();
rollback;
