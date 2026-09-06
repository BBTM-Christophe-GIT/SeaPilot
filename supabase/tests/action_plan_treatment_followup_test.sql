begin;

select plan(19);

select has_table(
  'public', 'action_item_treatment_events',
  'action treatment follow-ups use a dedicated immutable journal'
);
select has_function(
  'public', 'action_item_add_treatment_followup',
  array['bigint', 'text', 'text', 'text', 'text', 'bigint', 'boolean'],
  'treatment follow-ups use a protected RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.action_item_add_treatment_followup(bigint,text,text,text,text,bigint,boolean)', 'EXECUTE'),
  'authenticated profiles can invoke the follow-up workflow'
);
select ok(
  not has_function_privilege('anon', 'public.action_item_add_treatment_followup(bigint,text,text,text,text,bigint,boolean)', 'EXECUTE'),
  'anonymous profiles cannot invoke the follow-up workflow'
);
select ok(
  not has_table_privilege('authenticated', 'public.action_item_treatment_events', 'INSERT'),
  'authenticated clients cannot forge a follow-up author or timestamp'
);

insert into auth.users (id, email)
values
  ('7c350000-0000-0000-0000-000000000001', 'followup-admin@example.invalid'),
  ('7c350000-0000-0000-0000-000000000002', 'followup-assignee@example.invalid'),
  ('7c350000-0000-0000-0000-000000000003', 'followup-unrelated@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (values
  ('7c350000-0000-0000-0000-000000000001'::uuid, 'followup-admin@example.invalid', 'Alice ADMIN'),
  ('7c350000-0000-0000-0000-000000000002'::uuid, 'followup-assignee@example.invalid', 'Luc MARIN'),
  ('7c350000-0000-0000-0000-000000000003'::uuid, 'followup-unrelated@example.invalid', 'Paul TERRE')
) fixture(id, email, display_name)
cross join public.companies company where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, fixture.user_id, true
from (values
  ('7c350000-0000-0000-0000-000000000001'::uuid),
  ('7c350000-0000-0000-0000-000000000002'::uuid),
  ('7c350000-0000-0000-0000-000000000003'::uuid)
) fixture(user_id)
cross join public.companies company where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (values
  ('7c350000-0000-0000-0000-000000000001'::uuid, 'admin'),
  ('7c350000-0000-0000-0000-000000000002'::uuid, 'marin'),
  ('7c350000-0000-0000-0000-000000000003'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company where company.code = 'bbtm';

insert into public.people (company_id, user_id, first_name, last_name, function_label, active)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name, fixture.function_label, true
from (values
  ('7c350000-0000-0000-0000-000000000001'::uuid, 'Alice', 'Admin', 'Administrateur'),
  ('7c350000-0000-0000-0000-000000000002'::uuid, 'Luc', 'Marin', 'Matelot'),
  ('7c350000-0000-0000-0000-000000000003'::uuid, 'Paul', 'Terre', 'Matelot')
) fixture(user_id, first_name, last_name, function_label)
cross join public.companies company where company.code = 'bbtm';

insert into public.action_items (
  company_id, category_key, action_type_key, action_type, title, status,
  opened_on, due_on, issuer_person_id, issuer_name, owner_name,
  workflow_status, approved_at, approved_by_person_id,
  comments, realized_action, source_label
)
select company.id, 'action', 'action_progress', 'Action de Progrès - BBTM',
  'ACTION-SUIVI-TRAITEMENT', 'Ecart Non Soldé', current_date, current_date + 30,
  admin_person.id, 'Alice ADMIN', 'Luc MARIN', 'approved', clock_timestamp(), admin_person.id,
  'Commentaire de traitement historique', 'Action réalisée historique', 'seapilot'
from public.companies company
join public.people admin_person
  on admin_person.company_id = company.id
 and admin_person.user_id = '7c350000-0000-0000-0000-000000000001'
where company.code = 'bbtm';

insert into public.action_item_assignees (
  company_id, action_item_id, assignee_kind, person_id, display_name_snapshot
)
select action.company_id, action.id, 'person', assignee.id, 'Luc MARIN'
from public.action_items action
join public.people assignee
  on assignee.company_id = action.company_id
 and assignee.user_id = '7c350000-0000-0000-0000-000000000002'
where action.title = 'ACTION-SUIVI-TRAITEMENT';

select set_config(
  'test.action_followup.id',
  (select id::text from public.action_items where title = 'ACTION-SUIVI-TRAITEMENT'), false
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '7c350000-0000-0000-0000-000000000001', true);

select lives_ok(
  format(
    'select public.action_item_add_treatment_followup(%s,%L,null,null,null,null,false)',
    current_setting('test.action_followup.id')::bigint,
    'Commande validée par le bureau'
  ),
  'an Administrator can add a follow-up comment'
);
select is(
  (select created_by_name from public.action_item_treatment_events where note = 'Commande validée par le bureau'),
  'Alice ADMIN',
  'the journal freezes the follow-up author name'
);
select ok(
  (select created_at is not null from public.action_item_treatment_events where note = 'Commande validée par le bureau'),
  'the journal timestamps the follow-up on the server'
);

select set_config('request.jwt.claim.sub', '7c350000-0000-0000-0000-000000000002', true);

select lives_ok(
  format(
    'insert into storage.objects (bucket_id,name,metadata) values (%L,%L,jsonb_build_object(%L,%L,%L,%s))',
    'action-plan-evidence',
    (select company_id || '/' || id || '/suivi-controle.pdf' from public.action_items where id = current_setting('test.action_followup.id')::bigint),
    'mimetype', 'application/pdf', 'size', 2048
  ),
  'an assigned Marin can upload a scoped PDF follow-up attachment'
);
select lives_ok(
  format(
    'select public.action_item_add_treatment_followup(%s,%L,%L,%L,%L,%s,false)',
    current_setting('test.action_followup.id')::bigint,
    'Contrôle réalisé à bord', 'controle.pdf',
    (select company_id || '/' || id || '/suivi-controle.pdf' from public.action_items where id = current_setting('test.action_followup.id')::bigint),
    'application/pdf', 2048
  ),
  'an assigned Marin can add a comment and its attachment'
);
select ok(
  (select event_type = 'attachment_added'
      and created_by_name = 'Luc MARIN'
      and attachment_file_name = 'controle.pdf'
   from public.action_item_treatment_events where note = 'Contrôle réalisé à bord'),
  'the attachment event retains its type, author and original file name'
);
select is(
  (select count(*) from public.action_item_treatment_events where action_item_id = current_setting('test.action_followup.id')::bigint),
  2::bigint,
  'the assigned user sees the complete action follow-up journal'
);
select lives_ok(
  format(
    'select public.action_item_add_treatment_followup(%s,null,null,null,null,null,true)',
    current_setting('test.action_followup.id')::bigint
  ),
  'an assigned Marin can close the action from the follow-up control'
);
select ok(
  (select status = 'Ecart Soldé' and workflow_status = 'closed' and closed_on = current_date
   from public.action_items where id = current_setting('test.action_followup.id')::bigint),
  'closure keeps the existing atomic sold workflow transition'
);
select ok(
  (select note = 'Action clôturée.' and event_type = 'closed' and created_by_name = 'Luc MARIN'
   from public.action_item_treatment_events
   where action_item_id = current_setting('test.action_followup.id')::bigint
   order by created_at desc, id desc limit 1),
  'closure records a timestamped author event even without a typed comment'
);
select ok(
  (select comments = 'Commentaire de traitement historique'
      and realized_action = 'Action réalisée historique'
   from public.action_items where id = current_setting('test.action_followup.id')::bigint),
  'follow-up steering does not overwrite the existing treatment fields'
);
select throws_ok(
  format(
    'select public.action_item_add_treatment_followup(%s,%L,null,null,null,null,false)',
    current_setting('test.action_followup.id')::bigint, 'Modification après clôture'
  ),
  '55000', null,
  'a closed action cannot receive another follow-up'
);

select set_config('request.jwt.claim.sub', '7c350000-0000-0000-0000-000000000003', true);
select is(
  (select count(*) from public.action_item_treatment_events where action_item_id = current_setting('test.action_followup.id')::bigint),
  0::bigint,
  'an unrelated Marin cannot read the follow-up journal'
);
select throws_ok(
  format(
    'select public.action_item_add_treatment_followup(%s,%L,null,null,null,null,false)',
    current_setting('test.action_followup.id')::bigint, 'Tentative sans affectation'
  ),
  '42501', null,
  'an unrelated Marin cannot add a follow-up'
);

select * from finish();
rollback;
