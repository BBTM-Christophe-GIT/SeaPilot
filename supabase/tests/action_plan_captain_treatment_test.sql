begin;

select plan(15);

select has_function(
  'public', 'action_item_treat', array['bigint', 'text', 'text', 'boolean', 'text'],
  'action treatment is exposed through a dedicated server workflow'
);
select ok(
  has_function_privilege('authenticated', 'public.action_item_treat(bigint,text,text,boolean,text)', 'EXECUTE'),
  'authenticated profiles can invoke the treatment workflow'
);
select ok(
  not has_function_privilege('anon', 'public.action_item_treat(bigint,text,text,boolean,text)', 'EXECUTE'),
  'anonymous profiles cannot invoke the treatment workflow'
);

insert into auth.users (id, email)
values
  ('7b000000-0000-0000-0000-000000000001', 'action-captain@example.invalid'),
  ('7b000000-0000-0000-0000-000000000002', 'action-sailor@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (
  values
    ('7b000000-0000-0000-0000-000000000001'::uuid, 'action-captain@example.invalid', 'Captain Action'),
    ('7b000000-0000-0000-0000-000000000002'::uuid, 'action-sailor@example.invalid', 'Sailor Action')
) fixture(id, email, display_name)
cross join public.companies company
where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, fixture.user_id, true
from (
  values
    ('7b000000-0000-0000-0000-000000000001'::uuid),
    ('7b000000-0000-0000-0000-000000000002'::uuid)
) fixture(user_id)
cross join public.companies company
where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (
  values
    ('7b000000-0000-0000-0000-000000000001'::uuid, 'capitaine'),
    ('7b000000-0000-0000-0000-000000000002'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company
where company.code = 'bbtm';

insert into public.action_items (company_id, title, status, opened_on, closed_on, source_label)
select company.id, fixture.title, fixture.status, '2026-08-20'::date, fixture.closed_on, 'sharepoint'
from (
  values
    ('ACTION-CAPTAIN-OPEN', 'Ecart Non Soldé', null::date),
    ('ACTION-CAPTAIN-TO-CLOSE', 'Ecart Non Soldé', null::date),
    ('ACTION-CAPTAIN-CLOSED', 'Ecart Soldé', '2026-08-25'::date)
) fixture(title, status, closed_on)
cross join public.companies company
where company.code = 'bbtm';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7b000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$insert into storage.objects (bucket_id, name, metadata)
    select 'action-plan-evidence', action.company_id || '/' || action.id || '/cloture-test.png',
           jsonb_build_object('mimetype', 'image/png', 'size', 256)
    from public.action_items action
    where action.title = 'ACTION-CAPTAIN-OPEN'$$,
  'a Capitaine can upload treatment evidence in the active company folder'
);

select lives_ok(
  $$select public.action_item_treat(
    (select id from public.action_items where title = 'ACTION-CAPTAIN-OPEN'),
    'Traitement contrôlé',
    'Filtre remplacé',
    false,
    (select company_id || '/' || id || '/cloture-test.png'
     from public.action_items where title = 'ACTION-CAPTAIN-OPEN')
  )$$,
  'a Capitaine can treat an open action'
);
select is(
  (select comments from public.action_items where title = 'ACTION-CAPTAIN-OPEN'),
  'Traitement contrôlé',
  'the workflow saves the treatment comment'
);
select is(
  (select realized_action from public.action_items where title = 'ACTION-CAPTAIN-OPEN'),
  'Filtre remplacé',
  'the workflow saves the realized action'
);
select is(
  (select status from public.action_items where title = 'ACTION-CAPTAIN-OPEN'),
  'Ecart Non Soldé',
  'saving treatment progress keeps the action open'
);
select is(
  (select closure_photo_path from public.action_items where title = 'ACTION-CAPTAIN-OPEN'),
  (select company_id || '/' || id || '/cloture-test.png'
   from public.action_items where title = 'ACTION-CAPTAIN-OPEN'),
  'the workflow retains the scoped closure evidence path'
);
select lives_ok(
  $$select public.action_item_treat(
    (select id from public.action_items where title = 'ACTION-CAPTAIN-TO-CLOSE'),
    'Clôture contrôlée', 'Action terminée', true, null
  )$$,
  'a Capitaine can close an open action'
);
select ok(
  (select status = 'Ecart Soldé' and closed_on = current_date
   from public.action_items where title = 'ACTION-CAPTAIN-TO-CLOSE'),
  'closing an action sets its sold status and closure date atomically'
);
select throws_ok(
  $$update public.action_items set title = 'CAPTAIN-BYPASS'
    where title = 'ACTION-CAPTAIN-OPEN'$$,
  '42501', null,
  'a direct Capitaine update is rejected before it can bypass the workflow'
);
select is(
  (select title from public.action_items where id = (
    select id from public.action_items where title = 'ACTION-CAPTAIN-OPEN'
  )),
  'ACTION-CAPTAIN-OPEN',
  'a Capitaine cannot bypass the workflow to edit general action fields'
);
select throws_ok(
  $$select public.action_item_treat(
    (select id from public.action_items where title = 'ACTION-CAPTAIN-CLOSED'),
    'Nouvelle modification', null, false, null
  )$$,
  '55000', null,
  'a sold action cannot be treated again'
);

select set_config('request.jwt.claim.sub', '7b000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.action_item_treat(
    (select id from public.action_items where title = 'ACTION-CAPTAIN-OPEN'),
    'Tentative marin', null, false, null
  )$$,
  '42501', null,
  'a Marin cannot invoke the action treatment workflow'
);

select * from finish();
rollback;
