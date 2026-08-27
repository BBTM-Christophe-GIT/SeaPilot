begin;

select plan(23);

select has_function(
  'public', 'action_item_create',
  array['text', 'bigint', 'text', 'text', 'timestamp with time zone', 'date', 'text', 'text', 'text', 'text', 'numeric'],
  'event reports are created through a dedicated workflow'
);
select has_function(
  'public', 'action_item_approve', array['bigint', 'text', 'bigint[]', 'bigint[]'],
  'event reports are approved through a dedicated workflow'
);
select ok(
  not has_table_privilege('authenticated', 'public.action_items', 'INSERT'),
  'authenticated clients cannot bypass report creation with a direct insert'
);
select ok(
  not has_table_privilege('authenticated', 'public.action_items', 'UPDATE'),
  'authenticated clients cannot bypass approval or treatment with a direct update'
);
select ok(
  not has_function_privilege('anon', 'public.action_item_approve(bigint,text,bigint[],bigint[])', 'EXECUTE'),
  'anonymous clients cannot approve reports'
);

insert into auth.users (id, email)
values
  ('7c000000-0000-0000-0000-000000000001', 'action-office@example.invalid'),
  ('7c000000-0000-0000-0000-000000000002', 'christophe-action@example.invalid'),
  ('7c000000-0000-0000-0000-000000000003', 'action-vessel-sailor@example.invalid'),
  ('7c000000-0000-0000-0000-000000000004', 'action-unrelated-sailor@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('7c000000-0000-0000-0000-000000000001'::uuid, 'action-office@example.invalid', 'Office Action'),
    ('7c000000-0000-0000-0000-000000000002'::uuid, 'christophe-action@example.invalid', 'Christophe MINASSIAN'),
    ('7c000000-0000-0000-0000-000000000003'::uuid, 'action-vessel-sailor@example.invalid', 'Sailor Vessel'),
    ('7c000000-0000-0000-0000-000000000004'::uuid, 'action-unrelated-sailor@example.invalid', 'Sailor Unrelated')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, fixture.user_id, true
from (
  values
    ('7c000000-0000-0000-0000-000000000001'::uuid),
    ('7c000000-0000-0000-0000-000000000002'::uuid),
    ('7c000000-0000-0000-0000-000000000003'::uuid),
    ('7c000000-0000-0000-0000-000000000004'::uuid)
) fixture(user_id)
cross join public.companies company
where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('7c000000-0000-0000-0000-000000000001'::uuid, 'armement'),
    ('7c000000-0000-0000-0000-000000000002'::uuid, 'direction'),
    ('7c000000-0000-0000-0000-000000000003'::uuid, 'marin'),
    ('7c000000-0000-0000-0000-000000000004'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.people (company_id, user_id, first_name, last_name, function_label, active)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name, fixture.function_label, true
from (
  values
    ('7c000000-0000-0000-0000-000000000001'::uuid, 'Claire', 'BUREAU', 'Responsable armement'),
    ('7c000000-0000-0000-0000-000000000002'::uuid, 'Christophe', 'MINASSIAN', 'Directeur QHSE / Chef de Projet'),
    ('7c000000-0000-0000-0000-000000000003'::uuid, 'Luc', 'MARIN', 'Matelot'),
    ('7c000000-0000-0000-0000-000000000004'::uuid, 'Paul', 'TERRE', 'Matelot')
) fixture(user_id, first_name, last_name, function_label)
cross join public.companies company
where company.code = 'bbtm';

insert into public.vessels (company_id, name, active)
select company.id, 'ACTION TEST VESSEL', true
from public.companies company where company.code = 'bbtm';

insert into public.planning_assignments (
  company_id, vessel_id, crew_person_id, starts_on, ends_on,
  assignment_role, confirmation_status, source_label
)
select company.id, vessel.id, sailor.id, current_date - 2, current_date + 2,
  'Matelot', 'confirmed', 'test'
from public.companies company
join public.vessels vessel on vessel.company_id = company.id and vessel.name = 'ACTION TEST VESSEL'
join public.people sailor on sailor.company_id = company.id and sailor.last_name = 'MARIN'
where company.code = 'bbtm';

insert into public.working_time_profile_signatures (
  company_id, person_id, version_number, storage_path, mime_type,
  file_size_bytes, sha256, created_by
)
select company.id, issuer.id, 1, company.id || '/' || issuer.id || '/action-issuer.png',
  'image/png', 256, repeat('a', 64), issuer.user_id
from public.companies company
join public.people issuer on issuer.company_id = company.id and issuer.last_name = 'BUREAU'
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.action_item_create(
    'RAPPORT-EVENEMENT-TEST',
    (select id from public.vessels where name = 'ACTION TEST VESSEL'),
    'action_progress', 'Remarque', '2026-08-27T09:15:00+02'::timestamptz,
    '2026-09-10'::date, 'Navire à quai', 'Vent 12 nœuds, mer belle',
    'Description du constat', 'Sécuriser la zone', 0
  )$$,
  'an office profile can create and submit an event report'
);

select set_config(
  'test.action_event.id',
  (select id::text from public.action_items where title = 'RAPPORT-EVENEMENT-TEST'), true
);

select ok(
  (select workflow_status = 'pending_approval'
      and owner_name is null
      and anomaly_cause is null
      and deviation_type is null
      and occurred_at = '2026-08-27T09:15:00+02'::timestamptz
   from public.action_items where id = current_setting('test.action_event.id')::bigint),
  'creation records the exact time, clears an inapplicable deviation and waits for approval without an owner'
);
select is(
  (select issuer_signature_snapshot->>'storage_path'
   from public.action_items where id = current_setting('test.action_event.id')::bigint),
  (select company_id || '/' || id || '/action-issuer.png'
   from public.people where last_name = 'BUREAU'),
  'creation freezes the active issuer signature metadata'
);
select is(
  (select approver_person_id from public.action_items where id = current_setting('test.action_event.id')::bigint),
  (select id from public.people where first_name = 'Christophe' and last_name = 'MINASSIAN'),
  'creation routes the report to Christophe MINASSIAN'
);
select throws_ok(
  $$select public.action_item_create(
    'AUDIT-SANS-ECART', (select id from public.vessels where name = 'ACTION TEST VESSEL'),
    'audit_client', null, now(), current_date + 5, null, null, null, 'Corriger', 0
  )$$,
  '22023', null,
  'an audit or configured visit requires a deviation type'
);
select lives_ok(
  $$select public.action_item_create(
    'AUDIT-AVEC-ECART', (select id from public.vessels where name = 'ACTION TEST VESSEL'),
    'audit_client', 'Non Conformité Mineure', now(), current_date + 5,
    null, null, null, 'Corriger', 0
  )$$,
  'an audit accepts a configured deviation type'
);
select throws_ok(
  $$select public.action_item_approve(
    current_setting('test.action_event.id')::bigint,
    'Panne Equipement', '{}'::bigint[],
    array[(select id from public.vessels where name = 'ACTION TEST VESSEL')]
  )$$,
  '42501', null,
  'the issuer cannot approve the report instead of Christophe'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000004', true);
select is(
  (select count(*) from public.action_items where id = current_setting('test.action_event.id')::bigint),
  0::bigint,
  'an unrelated Marin cannot see the pending report'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000002', true);
select is(
  (select count(*) from public.action_items where id = current_setting('test.action_event.id')::bigint),
  1::bigint,
  'Christophe can see a report awaiting his approval'
);
select lives_ok(
  $$select public.action_item_approve(
    current_setting('test.action_event.id')::bigint,
    'Panne Equipement',
    array[(select id from public.people where last_name = 'BUREAU')],
    array[(select id from public.vessels where name = 'ACTION TEST VESSEL')]
  )$$,
  'Christophe can define the anomaly cause and multiple treatment owners'
);
select ok(
  (select workflow_status = 'approved'
      and anomaly_cause = 'Panne Equipement'
      and owner_name like '%Claire BUREAU%'
      and owner_name like '%Équipage — ACTION TEST VESSEL%'
   from public.action_items where id = current_setting('test.action_event.id')::bigint),
  'approval records the cause and the human-readable multi-assignee summary'
);
select is(
  (select count(*) from public.action_item_assignees
   where action_item_id = current_setting('test.action_event.id')::bigint),
  2::bigint,
  'approval creates both the individual and vessel-crew assignments'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000003', true);
select is(
  (select count(*) from public.action_items where id = current_setting('test.action_event.id')::bigint),
  1::bigint,
  'a Marin currently planned on the assigned vessel can see the action'
);
select ok(
  public.action_item_user_can_treat(current_setting('test.action_event.id')::bigint),
  'the planned vessel crew member is recognized as a treatment owner'
);
select lives_ok(
  $$select public.action_item_treat(
    current_setting('test.action_event.id')::bigint,
    'Contrôle réalisé par le bord', 'Zone sécurisée', false, null
  )$$,
  'the assigned Marin can save the treatment'
);
select is(
  (select realized_action from public.action_items where id = current_setting('test.action_event.id')::bigint),
  'Zone sécurisée',
  'the assigned Marin treatment is persisted'
);

select set_config('request.jwt.claim.sub', '7c000000-0000-0000-0000-000000000004', true);
select is(
  (select count(*) from public.action_items where id = current_setting('test.action_event.id')::bigint),
  0::bigint,
  'an unrelated Marin still cannot see the approved report'
);
select throws_ok(
  $$select public.action_item_treat(
    current_setting('test.action_event.id')::bigint,
    'Tentative sans affectation', null, false, null
  )$$,
  '42501', null,
  'an unrelated Marin cannot treat the action'
);

select * from finish();
rollback;
