begin;

select plan(8);

insert into auth.users (id, email)
values ('74000000-0000-0000-0000-000000000111', 'historical-planning-armement@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select '74000000-0000-0000-0000-000000000111',
       'historical-planning-armement@example.invalid',
       'Historical planning armement',
       company.id
from public.companies company
where company.code = 'bbtm';

insert into public.user_roles (user_id, company_id, role_key)
select '74000000-0000-0000-0000-000000000111', company.id, 'armement'
from public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, acronym, active)
select id, 'HISTORICAL ASSIGNMENT TEST VESSEL', 'HAT', true
from public.companies
where code = 'bbtm';

insert into public.people (
  company_id, first_name, last_name, function_label, hired_on, departed_on, active
)
select company.id, fixture.first_name, fixture.last_name, fixture.function_label,
       fixture.hired_on, fixture.departed_on, false
from (
  values
    ('Loic', 'HISTORIQUE', 'Matelot', '2024-07-01'::date, '2025-12-02'::date),
    ('Bordee', 'HISTORIQUE', 'Matelot', '2024-01-01'::date, '2025-12-31'::date),
    ('Regle', 'HISTORIQUE', 'Matelot', '2024-01-01'::date, '2026-07-31'::date)
) fixture(first_name, last_name, function_label, hired_on, departed_on)
cross join public.companies company
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '74000000-0000-0000-0000-000000000111', true);

select lives_ok(
  $$
    select public.apply_planning_grid_cells(jsonb_build_array(jsonb_build_object(
      'personId', (select id from public.people where first_name = 'Loic' and last_name = 'HISTORIQUE'),
      'vesselId', (select id from public.vessels where name = 'HISTORICAL ASSIGNMENT TEST VESSEL'),
      'workDate', '2025-01-15',
      'status', 'En Mer',
      'note', '',
      'watchGroup', 'Bordée 1',
      'functionLabel', 'Matelot'
    )))
  $$,
  'an inactive historical sailor can receive a grid embarkation during employment'
);

select is(
  (
    select count(*)::integer
    from public.planning_assignments assignment
    join public.people person on person.id = assignment.crew_person_id
    where person.first_name = 'Loic'
      and person.last_name = 'HISTORIQUE'
      and '2025-01-15' between assignment.starts_on and assignment.ends_on
  ),
  1,
  'the historical grid embarkation creates a native Planning assignment'
);

select is(
  (
    select assignment.status_label
    from public.planning_assignments assignment
    join public.people person on person.id = assignment.crew_person_id
    where person.first_name = 'Loic'
      and person.last_name = 'HISTORIQUE'
      and '2025-01-15' between assignment.starts_on and assignment.ends_on
    order by assignment.id desc
    limit 1
  ),
  'En Mer',
  'the requested historical grid embarkation keeps the selected status'
);

select throws_ok(
  $$
    select public.apply_planning_grid_cells(jsonb_build_array(jsonb_build_object(
      'personId', (select id from public.people where first_name = 'Loic' and last_name = 'HISTORIQUE'),
      'vesselId', (select id from public.vessels where name = 'HISTORICAL ASSIGNMENT TEST VESSEL'),
      'workDate', '2026-01-15',
      'status', 'En Mer',
      'note', '',
      'watchGroup', 'Bordée 1',
      'functionLabel', 'Matelot'
    )))
  $$,
  '23503',
  'PLANNING_GRID_PERSON_NOT_FOUND',
  'a grid embarkation after the departure date remains rejected'
);

select lives_ok(
  $$
    insert into public.planning_assignments (
      company_id, vessel_id, crew_person_id, starts_on, ends_on,
      starts_at, ends_at, assignment_role, status_label,
      confirmation_status, watch_group, source_label
    )
    select company.id, vessel.id, person.id,
           '2026-07-20', '2026-07-21',
           '2026-07-20 08:00 Europe/Paris'::timestamptz,
           '2026-07-21 20:00 Europe/Paris'::timestamptz,
           'Matelot', 'En Mer', 'provisional', 'Bordée 1', 'historical-test'
    from public.companies company
    join public.vessels vessel on vessel.company_id = company.id
      and vessel.name = 'HISTORICAL ASSIGNMENT TEST VESSEL'
    join public.people person on person.company_id = company.id
      and person.first_name = 'Regle' and person.last_name = 'HISTORIQUE'
    where company.code = 'bbtm'
  $$,
  'the assignment trigger accepts an inactive sailor inside employment dates'
);

select throws_ok(
  $$
    insert into public.planning_assignments (
      company_id, vessel_id, crew_person_id, starts_on, ends_on,
      starts_at, ends_at, assignment_role, status_label,
      confirmation_status, watch_group, source_label
    )
    select company.id, vessel.id, person.id,
           '2026-08-05', '2026-08-06',
           '2026-08-05 08:00 Europe/Paris'::timestamptz,
           '2026-08-06 20:00 Europe/Paris'::timestamptz,
           'Matelot', 'En Mer', 'provisional', 'Bordée 1', 'historical-test'
    from public.companies company
    join public.vessels vessel on vessel.company_id = company.id
      and vessel.name = 'HISTORICAL ASSIGNMENT TEST VESSEL'
    join public.people person on person.company_id = company.id
      and person.first_name = 'Regle' and person.last_name = 'HISTORIQUE'
    where company.code = 'bbtm'
  $$,
  'P0001',
  'PLANNING_CONTROL_BLOCKED: inactive_person',
  'the assignment trigger still blocks a period after departure'
);

select lives_ok(
  $$
    select public.create_planning_board_assignments(
      (select id from public.vessels where name = 'HISTORICAL ASSIGNMENT TEST VESSEL'),
      'Bordée 2',
      '2025-01-10',
      '2025-01-12',
      jsonb_build_array(jsonb_build_object(
        'personId', (select id from public.people where first_name = 'Bordee' and last_name = 'HISTORIQUE'),
        'functionLabel', 'Matelot'
      ))
    )
  $$,
  'a historical sailor can be used when creating a board during employment'
);

select throws_ok(
  $$
    select public.create_planning_board_assignments(
      (select id from public.vessels where name = 'HISTORICAL ASSIGNMENT TEST VESSEL'),
      'Bordée 2',
      '2026-01-10',
      '2026-01-12',
      jsonb_build_array(jsonb_build_object(
        'personId', (select id from public.people where first_name = 'Bordee' and last_name = 'HISTORIQUE'),
        'functionLabel', 'Matelot'
      ))
    )
  $$,
  '23503',
  'PLANNING_BOARD_PERSON_NOT_FOUND',
  'board creation after departure remains rejected'
);

select * from finish();
rollback;
