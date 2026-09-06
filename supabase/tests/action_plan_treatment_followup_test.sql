begin;

select plan(31);

select has_table('public', 'action_item_treatment_events', 'follow-ups use an immutable journal');
select has_function('public', 'action_item_add_treatment_followup', array['bigint','text','text','text','text','bigint','boolean'], 'signed follow-up RPC exists');
select has_function('public', 'action_item_review_closure', array['bigint','boolean','text'], 'closure review RPC exists');
select ok(has_function_privilege('authenticated', 'public.action_item_add_treatment_followup(bigint,text,text,text,text,bigint,boolean)', 'EXECUTE'), 'authenticated profiles can invoke follow-up');
select ok(has_function_privilege('authenticated', 'public.action_item_review_closure(bigint,boolean,text)', 'EXECUTE'), 'authenticated profiles can invoke review with server-side role checks');
select ok(not has_function_privilege('anon', 'public.action_item_add_treatment_followup(bigint,text,text,text,text,bigint,boolean)', 'EXECUTE'), 'anonymous profiles cannot invoke follow-up');
select ok(not has_table_privilege('authenticated', 'public.action_item_treatment_events', 'INSERT'), 'clients cannot forge journal identity, date or signature');

insert into auth.users (id, email) values
  ('7c350000-0000-0000-0000-000000000001', 'followup-admin@example.invalid'),
  ('7c350000-0000-0000-0000-000000000002', 'followup-assignee@example.invalid'),
  ('7c350000-0000-0000-0000-000000000003', 'followup-unrelated@example.invalid'),
  ('7c350000-0000-0000-0000-000000000004', 'followup-direction@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (values
  ('7c350000-0000-0000-0000-000000000001'::uuid, 'followup-admin@example.invalid', 'Alice ADMIN'),
  ('7c350000-0000-0000-0000-000000000002'::uuid, 'followup-assignee@example.invalid', 'Luc MARIN'),
  ('7c350000-0000-0000-0000-000000000003'::uuid, 'followup-unrelated@example.invalid', 'Paul TERRE'),
  ('7c350000-0000-0000-0000-000000000004'::uuid, 'followup-direction@example.invalid', 'Diane DIRECTION')
) fixture(id, email, display_name)
cross join public.companies company where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, fixture.user_id, true
from (values
  ('7c350000-0000-0000-0000-000000000001'::uuid),
  ('7c350000-0000-0000-0000-000000000002'::uuid),
  ('7c350000-0000-0000-0000-000000000003'::uuid),
  ('7c350000-0000-0000-0000-000000000004'::uuid)
) fixture(user_id)
cross join public.companies company where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = excluded.active;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (values
  ('7c350000-0000-0000-0000-000000000001'::uuid, 'admin'),
  ('7c350000-0000-0000-0000-000000000002'::uuid, 'marin'),
  ('7c350000-0000-0000-0000-000000000003'::uuid, 'marin'),
  ('7c350000-0000-0000-0000-000000000004'::uuid, 'direction')
) fixture(user_id, role_key)
cross join public.companies company where company.code = 'bbtm';

insert into public.people (company_id, user_id, first_name, last_name, function_label, active)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name, fixture.function_label, true
from (values
  ('7c350000-0000-0000-0000-000000000001'::uuid, 'Alice', 'Admin', 'Administrateur'),
  ('7c350000-0000-0000-0000-000000000002'::uuid, 'Luc', 'Marin', 'Matelot'),
  ('7c350000-0000-0000-0000-000000000003'::uuid, 'Paul', 'Terre', 'Matelot'),
  ('7c350000-0000-0000-0000-000000000004'::uuid, 'Diane', 'Direction', 'Direction')
) fixture(user_id, first_name, last_name, function_label)
cross join public.companies company where company.code = 'bbtm';

insert into storage.objects (bucket_id, name, metadata)
select 'working-time-signatures', company.id || '/' || person.id || '/action-test.png',
  jsonb_build_object('mimetype', 'image/png', 'size', 128)
from public.people person
join public.companies company on company.id = person.company_id
where person.user_id::text like '7c350000-%';

insert into public.working_time_profile_signatures (
  company_id, person_id, version_number, storage_path, mime_type, file_size_bytes, sha256
)
select person.company_id, person.id, 1,
  person.company_id || '/' || person.id || '/action-test.png', 'image/png', 128,
  repeat(substr(md5(person.id::text), 1, 1), 64)
from public.people person where person.user_id::text like '7c350000-%';

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
join public.people admin_person on admin_person.company_id = company.id
 and admin_person.user_id = '7c350000-0000-0000-0000-000000000001'
where company.code = 'bbtm';

insert into public.action_item_assignees (company_id, action_item_id, assignee_kind, person_id, display_name_snapshot)
select action.company_id, action.id, 'person', assignee.id, 'Luc MARIN'
from public.action_items action
join public.people assignee on assignee.company_id = action.company_id
 and assignee.user_id = '7c350000-0000-0000-0000-000000000002'
where action.title = 'ACTION-SUIVI-TRAITEMENT';

select set_config('test.action_followup.id', (select id::text from public.action_items where title = 'ACTION-SUIVI-TRAITEMENT'), false);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '7c350000-0000-0000-0000-000000000001', true);

select lives_ok(format('select public.action_item_add_treatment_followup(%s,%L,null,null,null,null,false)', current_setting('test.action_followup.id')::bigint, 'Commande validée par le bureau'), 'Administrator can add a signed comment');
select is((select created_by_name from public.action_item_treatment_events where note = 'Commande validée par le bureau'), 'Alice ADMIN', 'journal freezes Firstname LASTNAME');
select ok((select created_at is not null and signature_snapshot <> '{}'::jsonb and signature_version_id is not null from public.action_item_treatment_events where note = 'Commande validée par le bureau'), 'journal freezes server date and active signature');

select set_config('request.jwt.claim.sub', '7c350000-0000-0000-0000-000000000002', true);
select lives_ok(format('insert into storage.objects (bucket_id,name,metadata) values (%L,%L,jsonb_build_object(%L,%L,%L,%s))', 'action-plan-evidence', (select company_id || '/' || id || '/suivi-controle.pdf' from public.action_items where id = current_setting('test.action_followup.id')::bigint), 'mimetype', 'application/pdf', 'size', 2048), 'assigned Marin can upload scoped follow-up evidence');
select lives_ok(format('select public.action_item_add_treatment_followup(%s,%L,%L,%L,%L,%s,false)', current_setting('test.action_followup.id')::bigint, 'Contrôle réalisé à bord', 'controle.pdf', (select company_id || '/' || id || '/suivi-controle.pdf' from public.action_items where id = current_setting('test.action_followup.id')::bigint), 'application/pdf', 2048), 'assigned Marin can add a signed comment and attachment');
select ok((select event_type = 'attachment_added' and created_by_name = 'Luc MARIN' and attachment_file_name = 'controle.pdf' and signature_snapshot <> '{}'::jsonb from public.action_item_treatment_events where note = 'Contrôle réalisé à bord'), 'attachment event keeps author, file and signature');
select is((select count(*) from public.action_item_treatment_events where action_item_id = current_setting('test.action_followup.id')::bigint), 2::bigint, 'assignee sees complete journal');
select lives_ok(format('select public.action_item_add_treatment_followup(%s,null,null,null,null,null,true)', current_setting('test.action_followup.id')::bigint), 'Marin can request closure');
select ok((select workflow_status = 'approved' and closed_on is null and closure_review_status = 'pending' from public.action_items where id = current_setting('test.action_followup.id')::bigint), 'closure request keeps action open pending countersignature');
select ok((select event_type = 'closure_requested' and created_by_name = 'Luc MARIN' and signature_snapshot <> '{}'::jsonb from public.action_item_treatment_events where action_item_id = current_setting('test.action_followup.id')::bigint order by id desc limit 1), 'closure request is signed and timestamped');
set local role postgres;
select ok((select count(*) > 0 from public.planning_notifications where entity_kind = 'action_item' and entity_id = current_setting('test.action_followup.id')::bigint and notification_type = 'action_closure_requested' and recipient_user_id = '7c350000-0000-0000-0000-000000000004'), 'Direction receives bell notification for review');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7c350000-0000-0000-0000-000000000004', true);
select lives_ok(format('select public.action_item_review_closure(%s,false,%L)', current_setting('test.action_followup.id')::bigint, 'Contrôle complémentaire requis'), 'Direction can reject closure');
select ok((select workflow_status = 'approved' and closed_on is null and closure_review_status = 'none' from public.action_items where id = current_setting('test.action_followup.id')::bigint), 'rejection leaves action open');
select ok((select event_type = 'closure_rejected' and created_by_name = 'Diane DIRECTION' and signature_snapshot <> '{}'::jsonb from public.action_item_treatment_events where action_item_id = current_setting('test.action_followup.id')::bigint order by id desc limit 1), 'rejection is countersigned');
set local role postgres;
select ok((select count(*) > 0 from public.planning_notifications where entity_id = current_setting('test.action_followup.id')::bigint and notification_type = 'action_closure_rejected' and recipient_user_id = '7c350000-0000-0000-0000-000000000002'), 'closure requester is notified of refusal');

set local role authenticated;
select set_config('request.jwt.claim.sub', '7c350000-0000-0000-0000-000000000002', true);
select lives_ok(format('select public.action_item_add_treatment_followup(%s,%L,null,null,null,null,true)', current_setting('test.action_followup.id')::bigint, 'Contrôle complémentaire réalisé'), 'Marin can submit another closure request');
select set_config('request.jwt.claim.sub', '7c350000-0000-0000-0000-000000000004', true);
select lives_ok(format('select public.action_item_review_closure(%s,true,null)', current_setting('test.action_followup.id')::bigint), 'Direction can approve closure');
select ok((select status = 'Ecart Soldé' and workflow_status = 'closed' and closed_on = current_date and closure_review_status = 'none' from public.action_items where id = current_setting('test.action_followup.id')::bigint), 'approval atomically closes action');
select ok((select event_type = 'closure_approved' and created_by_name = 'Diane DIRECTION' and signature_snapshot <> '{}'::jsonb from public.action_item_treatment_events where action_item_id = current_setting('test.action_followup.id')::bigint order by id desc limit 1), 'approval is countersigned');
set local role postgres;
select ok((select count(distinct recipient_user_id) >= 2 from public.planning_notifications where entity_id = current_setting('test.action_followup.id')::bigint and notification_type = 'action_closure_approved'), 'participants and owners receive approval notifications');
select ok((select comments = 'Commentaire de traitement historique' and realized_action = 'Action réalisée historique' from public.action_items where id = current_setting('test.action_followup.id')::bigint), 'signed follow-up does not overwrite treatment fields');
set local role authenticated;
select set_config('request.jwt.claim.sub', '7c350000-0000-0000-0000-000000000004', true);
select throws_ok(format('select public.action_item_add_treatment_followup(%s,%L,null,null,null,null,false)', current_setting('test.action_followup.id')::bigint, 'Modification après clôture'), '55000', null, 'closed action rejects later follow-up');

select set_config('request.jwt.claim.sub', '7c350000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.action_item_treatment_events where action_item_id = current_setting('test.action_followup.id')::bigint), 0::bigint, 'unrelated Marin cannot read journal');
select throws_ok(format('select public.action_item_add_treatment_followup(%s,%L,null,null,null,null,false)', current_setting('test.action_followup.id')::bigint, 'Tentative sans affectation'), '42501', null, 'unrelated Marin cannot add follow-up');

select * from finish();
rollback;
