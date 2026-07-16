begin;

select plan(18);

select has_column(
  'public',
  'planning_projects',
  'catalog_project_id',
  'planning occurrences have an optional catalog project reference'
);
select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'planning_projects_catalog_project_company_fkey'
      and conrelid = 'public.planning_projects'::regclass
  ),
  'catalog project and occurrence company are protected by a composite foreign key'
);
select ok(
  to_regclass('public.planning_projects_catalog_project_dates_idx') is not null,
  'catalog occurrence lookups have a partial date index'
);
select ok(
  to_regprocedure('public.projects_create_planning_occurrence(bigint,date,date,bigint,text,text)') is not null,
  'secure planning occurrence RPC exists'
);
select ok(
  has_function_privilege('authenticated', 'public.projects_create_planning_occurrence(bigint,date,date,bigint,text,text)', 'EXECUTE'),
  'authenticated users can invoke the RPC and rely on its role checks'
);
select ok(
  not has_function_privilege('anon', 'public.projects_create_planning_occurrence(bigint,date,date,bigint,text,text)', 'EXECUTE'),
  'anonymous users cannot invoke the planning occurrence RPC'
);

insert into public.companies (code, name)
values ('projects-occ-other', 'Projects occurrence other company');

insert into auth.users (id, email)
values
  ('71000000-0000-0000-0000-000000000001', 'projects-occ-admin@example.invalid'),
  ('71000000-0000-0000-0000-000000000002', 'projects-occ-direction@example.invalid'),
  ('71000000-0000-0000-0000-000000000003', 'projects-occ-armement@example.invalid'),
  ('71000000-0000-0000-0000-000000000004', 'projects-occ-capitaine@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('71000000-0000-0000-0000-000000000001'::uuid, 'projects-occ-admin@example.invalid', 'Projects occurrence admin'),
    ('71000000-0000-0000-0000-000000000002'::uuid, 'projects-occ-direction@example.invalid', 'Projects occurrence direction'),
    ('71000000-0000-0000-0000-000000000003'::uuid, 'projects-occ-armement@example.invalid', 'Projects occurrence armement'),
    ('71000000-0000-0000-0000-000000000004'::uuid, 'projects-occ-capitaine@example.invalid', 'Projects occurrence capitaine')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('71000000-0000-0000-0000-000000000001'::uuid, 'admin'),
    ('71000000-0000-0000-0000-000000000002'::uuid, 'direction'),
    ('71000000-0000-0000-0000-000000000003'::uuid, 'armement'),
    ('71000000-0000-0000-0000-000000000004'::uuid, 'capitaine')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select company.id, 'PROJECTS-OCC-VESSEL', 'POV', true
from public.companies company where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select company.id, 'PROJECTS-OCC-FOREIGN', 'POF', true
from public.companies company where company.code = 'projects-occ-other';

select set_config('test.projects_occ_foreign_vessel_id', id::text, true)
from public.vessels
where name = 'PROJECTS-OCC-FOREIGN';

insert into public.projects (
  company_id, title, project_code, primary_vessel_id, primary_vessel_name,
  client_name, description, source_label
)
select company.id, 'Projects occurrence catalog', 'P7100', vessel.id, vessel.name,
       'Projects occurrence client', 'Mission catalogue', 'seapilot'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.name = 'PROJECTS-OCC-VESSEL'
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.projects_create_planning_occurrence(
      (select id from public.projects where title = 'Projects occurrence catalog'),
      '2026-08-01', '2026-08-03', null, 'Planifie', 'Rotation 1'
    )$$,
  'admin creates a first occurrence from the catalog project'
);
select lives_ok(
  $$select public.projects_create_planning_occurrence(
      (select id from public.projects where title = 'Projects occurrence catalog'),
      '2026-08-10', '2026-08-12', null, 'A planifier', 'Rotation 2'
    )$$,
  'the same catalog project can be executed a second time'
);
select is(
  (select count(*)::integer from public.planning_projects where description in ('Rotation 1', 'Rotation 2')),
  2,
  'two calls create two independent planning rows'
);
select is(
  (select count(distinct catalog_project_id)::integer from public.planning_projects where description in ('Rotation 1', 'Rotation 2')),
  1,
  'both occurrences retain the same catalog project reference'
);
select is(
  (select count(distinct id)::integer from public.planning_projects where description in ('Rotation 1', 'Rotation 2')),
  2,
  'the two executions have distinct planning identifiers'
);
select is(
  (select min(primary_vessel_name) from public.planning_projects where description in ('Rotation 1', 'Rotation 2')),
  'PROJECTS-OCC-VESSEL',
  'the vessel snapshot is resolved server-side'
);
select is(
  (select min(event_type) from public.planning_projects where description in ('Rotation 1', 'Rotation 2')),
  'operation',
  'new occurrences use the supported Planning operation type'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000002', true);
select lives_ok(
  $$select public.projects_create_planning_occurrence(
      (select id from public.projects where title = 'Projects occurrence catalog'),
      '2026-09-01', '2026-09-02'
    )$$,
  'direction can create a planning occurrence'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.projects_create_planning_occurrence(
      (select id from public.projects where title = 'Projects occurrence catalog'),
      '2026-10-01', '2026-10-02'
    )$$,
  '42501',
  'Insufficient permission to schedule a catalog project',
  'armement cannot schedule a catalog project'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000004', true);
select throws_ok(
  $$select public.projects_create_planning_occurrence(
      (select id from public.projects where title = 'Projects occurrence catalog'),
      '2026-10-01', '2026-10-02'
    )$$,
  '42501',
  'Insufficient permission to schedule a catalog project',
  'capitaine cannot schedule a catalog project'
);

select set_config('request.jwt.claim.sub', '71000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.projects_create_planning_occurrence(
      (select id from public.projects where title = 'Projects occurrence catalog'),
      '2026-11-05', '2026-11-01'
    )$$,
  '22023',
  'Planning occurrence end date precedes start date',
  'inverted dates are rejected in the database'
);
select throws_ok(
  $$select public.projects_create_planning_occurrence(
      (select id from public.projects where title = 'Projects occurrence catalog'),
      '2026-11-01', '2026-11-05',
      current_setting('test.projects_occ_foreign_vessel_id')::bigint
    )$$,
  '22023',
  'A vessel from the active company is required',
  'a vessel from another company is rejected'
);

select * from finish();
rollback;
