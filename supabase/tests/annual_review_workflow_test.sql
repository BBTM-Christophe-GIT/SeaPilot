begin;

select plan(37);

select has_table('public', 'annual_reviews', 'annual reviews table exists');
select has_table('public', 'annual_review_responses', 'separate response table exists');
select has_table('public', 'annual_review_events', 'audit event table exists');
select has_function('public', 'annual_review_create_invitation', array['bigint','integer','timestamp with time zone','timestamp with time zone','text','text','text','text'], 'invitation RPC exists');
select has_function('public', 'annual_review_accept_invitation', array['bigint'], 'acceptance RPC exists');
select has_function('public', 'annual_review_counter_propose', array['bigint','timestamp with time zone','timestamp with time zone','text'], 'counter-proposal RPC exists');
select has_function('public', 'annual_review_manager_schedule', array['bigint','boolean','timestamp with time zone','timestamp with time zone','text'], 'manager schedule RPC exists');
select has_function('public', 'annual_review_save_response', array['bigint','jsonb','boolean','boolean'], 'private response RPC exists');
select has_function('public', 'annual_review_validate_manager_report', array['bigint','text','text','bigint','text'], 'manager validation RPC exists');
select has_function('public', 'annual_review_sign_and_archive', array['bigint','text','text','bigint','text'], 'final archive RPC exists');
select is((select is_visible from public.role_module_permissions where role_key = 'admin' and module_key = 'annualReviews'), true, 'admin sees the module');
select is((select is_visible from public.role_module_permissions where role_key = 'direction' and module_key = 'annualReviews'), true, 'direction sees the module');
select is((select is_visible from public.role_module_permissions where role_key = 'armement' and module_key = 'annualReviews'), true, 'armement sees the module');
select is((select is_visible from public.role_module_permissions where role_key = 'capitaine' and module_key = 'annualReviews'), true, 'captain sees the module');
select is((select is_visible from public.role_module_permissions where role_key = 'marin' and module_key = 'annualReviews'), false, 'sailor does not see the manager module');
select is((select public from storage.buckets where id = 'annual-review-reports'), false, 'report bucket is private');
select ok(not has_table_privilege('authenticated', 'public.annual_reviews', 'update'), 'authenticated clients cannot update reviews directly');

insert into auth.users (id, email) values
  ('79000000-0000-0000-0000-000000000101', 'annual-manager@example.invalid'),
  ('79000000-0000-0000-0000-000000000102', 'annual-collaborator@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (values
  ('79000000-0000-0000-0000-000000000101'::uuid, 'annual-manager@example.invalid', 'Marie Manager'),
  ('79000000-0000-0000-0000-000000000102'::uuid, 'annual-collaborator@example.invalid', 'Luc Collaborateur')
) fixture(id, email, display_name)
cross join public.companies company where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, fixture.user_id, true
from (values
  ('79000000-0000-0000-0000-000000000101'::uuid),
  ('79000000-0000-0000-0000-000000000102'::uuid)
) fixture(user_id)
cross join public.companies company where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = true;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (values
  ('79000000-0000-0000-0000-000000000101'::uuid, 'direction'),
  ('79000000-0000-0000-0000-000000000102'::uuid, 'marin')
) fixture(user_id, role_key)
cross join public.companies company where company.code = 'bbtm';

insert into public.people (company_id, user_id, first_name, last_name, function_label, hired_on, active)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name, fixture.function_label, current_date - 365, true
from (values
  ('79000000-0000-0000-0000-000000000101'::uuid, 'Marie', 'MANAGER', 'Direction'),
  ('79000000-0000-0000-0000-000000000102'::uuid, 'Luc', 'COLLABORATEUR', 'Matelot')
) fixture(user_id, first_name, last_name, function_label)
cross join public.companies company where company.code = 'bbtm';

insert into public.working_time_profile_signatures (
  company_id, person_id, version_number, storage_path, mime_type, file_size_bytes, sha256, created_by
)
select company.id, person.id, 1, format('%s/%s/signature.png', company.id, person.id),
  'image/png', 128, repeat(case when person.user_id = '79000000-0000-0000-0000-000000000101' then 'a' else 'b' end, 64), person.user_id
from public.companies company
join public.people person on person.company_id = company.id
where company.code = 'bbtm'
  and person.user_id in ('79000000-0000-0000-0000-000000000101', '79000000-0000-0000-0000-000000000102');

create function pg_temp.complete_annual_review_answers(p_objectives text)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'evaluation', (
      select jsonb_object_agg(question_id, jsonb_build_object('rating', 'Bon', 'comment', ''))
      from unnest(array[
        'bridge_manoeuvres', 'bridge_management', 'bridge_certificates', 'bridge_calls',
        'engine_operation', 'engine_breakdowns', 'engine_inventory', 'engine_lifting',
        'engine_deck', 'engine_maintenance', 'qhse_policy', 'qhse_sms', 'qhse_procedures',
        'qhse_ppe', 'admin_english', 'admin_reporting', 'admin_writing', 'admin_it',
        'admin_certificates', 'behaviour_clients', 'behaviour_team', 'behaviour_image',
        'behaviour_initiative'
      ]) question_id
    ),
    'esg', '{}'::jsonb,
    'life', jsonb_build_object(
      'overall', 'satisfait',
      'conditions', jsonb_build_object(
        'missions', 'satisfait', 'compensation', 'satisfait', 'recognition', 'satisfait',
        'crew', 'satisfait', 'rhythm', 'satisfait', 'position', 'satisfait'
      ),
      'why', ''
    ),
    'evolution', jsonb_build_object(
      'choice', '1. Poursuivre tel qu’aujourd’hui', 'desiredPosition', '',
      'desiredTraining', '', 'reasons', '', 'other', ''
    ),
    'objectives', p_objectives
  );
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000101', true);
select set_config('test.annual_review_id', public.annual_review_create_invitation(
  (select id from public.people where user_id = '79000000-0000-0000-0000-000000000102'),
  extract(year from current_date)::integer,
  now() + interval '7 days', now() + interval '7 days 1 hour',
  'in_person', 'Bureau Armement', null, 'Préparer le bilan annuel'
)::text, true);

select ok(current_setting('test.annual_review_id')::bigint > 0, 'manager creates an invitation for an active collaborator');
select is((select status from public.annual_reviews where id = current_setting('test.annual_review_id')::bigint), 'invitation_pending', 'new interview waits for employee acceptance');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000102', true);
select public.annual_review_accept_invitation(current_setting('test.annual_review_id')::bigint);
select is((select status from public.annual_reviews where id = current_setting('test.annual_review_id')::bigint), 'scheduled', 'employee acceptance schedules the interview');
select throws_ok(
  format(
    'select public.annual_review_save_response(%s, pg_temp.complete_annual_review_answers(''<p>Objectif privé</p>''), true, null)',
    current_setting('test.annual_review_id')::bigint
  ),
  '23514', 'ANNUAL_REVIEW_SHARING_DECISION_REQUIRED.',
  'employee must explicitly choose whether responses may be shared'
);
select public.annual_review_save_response(current_setting('test.annual_review_id')::bigint, pg_temp.complete_annual_review_answers('<p>Objectif privé</p>'), true, false);
select is((select count(*)::integer from public.annual_review_responses where review_id = current_setting('test.annual_review_id')::bigint), 1, 'employee can read the private response they submitted');
select throws_ok(
  format(
    'select public.annual_review_save_response(%s, pg_temp.complete_annual_review_answers(''<p>Objectif modifié</p>''), true, true)',
    current_setting('test.annual_review_id')::bigint
  ),
  '23514', 'ANNUAL_REVIEW_RESPONSE_LOCKED.',
  'employee answers and sharing choice are frozen after submission'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000101', true);
select is((select count(*)::integer from public.annual_review_responses where review_id = current_setting('test.annual_review_id')::bigint), 0, 'manager cannot read a private employee response');
select public.annual_review_save_response(current_setting('test.annual_review_id')::bigint, pg_temp.complete_annual_review_answers('<p>Objectif management</p>'), false, null);
select is((select count(*)::integer from public.annual_review_responses where review_id = current_setting('test.annual_review_id')::bigint), 1, 'manager sees only their own response');

reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'annual-review-reports', format('%s/%s/manager/manager.pdf', review.company_id, review.id),
  '79000000-0000-0000-0000-000000000101'::uuid, '{"mimetype":"application/pdf","size":1000}'::jsonb
from public.annual_reviews review where review.id = current_setting('test.annual_review_id')::bigint;
set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000101', true);
select public.annual_review_validate_manager_report(
  current_setting('test.annual_review_id')::bigint,
  (select format('%s/%s/manager/manager.pdf', company_id, id) from public.annual_reviews where id = current_setting('test.annual_review_id')::bigint),
  format('Entretien Professionnel et d''Evaluation - Luc COLLABORATEUR - %s.pdf', extract(year from current_date)::integer),
  1000, repeat('c', 64)
);
select is((select status from public.annual_reviews where id = current_setting('test.annual_review_id')::bigint), 'awaiting_signature', 'manager validation opens collaborator signature');
select is((select manager_signature_snapshot->>'signer_name' from public.annual_reviews where id = current_setting('test.annual_review_id')::bigint), 'Marie MANAGER', 'manager identity and active signature are frozen');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000102', true);
select is((select count(*)::integer from public.annual_review_responses where review_id = current_setting('test.annual_review_id')::bigint), 2, 'employee can read their response and the manager response');

reset role;
insert into storage.objects (bucket_id, name, owner_id, metadata)
select 'annual-review-reports', format('%s/%s/final/final.pdf', review.company_id, review.id),
  '79000000-0000-0000-0000-000000000102'::uuid, '{"mimetype":"application/pdf","size":1200}'::jsonb
from public.annual_reviews review where review.id = current_setting('test.annual_review_id')::bigint;
set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000102', true);
select ok(public.annual_review_sign_and_archive(
  current_setting('test.annual_review_id')::bigint,
  (select format('%s/%s/final/final.pdf', company_id, id) from public.annual_reviews where id = current_setting('test.annual_review_id')::bigint),
  format('Entretien Professionnel et d''Evaluation - Luc COLLABORATEUR - %s.pdf', extract(year from current_date)::integer),
  1200, repeat('d', 64)
) > 0, 'collaborator signs and creates the HR document');
select is((select status from public.annual_reviews where id = current_setting('test.annual_review_id')::bigint), 'archived', 'signed interview is archived');
select is((select collaborator_signature_snapshot->>'signer_name' from public.annual_reviews where id = current_setting('test.annual_review_id')::bigint), 'Luc COLLABORATEUR', 'collaborator identity and active signature are frozen');
select is((select category_key from public.hr_documents where id = (select hr_document_id from public.annual_reviews where id = current_setting('test.annual_review_id')::bigint)), 'annual_review', 'archive is classified in the annual review HR section');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000101', true);
select set_config('test.annual_review_counter_id', public.annual_review_create_invitation(
  (select id from public.people where user_id = '79000000-0000-0000-0000-000000000102'),
  extract(year from current_date)::integer + 1,
  now() + interval '30 days', now() + interval '30 days 1 hour',
  'video', null, 'https://meet.example.invalid/annual', null
)::text, true);
select ok(current_setting('test.annual_review_counter_id')::bigint > 0, 'manager can create the following annual campaign');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000102', true);
select public.annual_review_counter_propose(
  current_setting('test.annual_review_counter_id')::bigint,
  now() + interval '31 days', now() + interval '31 days 1 hour', 'Autre quart de travail'
);
select is((select status from public.annual_reviews where id = current_setting('test.annual_review_counter_id')::bigint), 'counter_proposed', 'employee can propose another time');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000101', true);
select public.annual_review_manager_schedule(current_setting('test.annual_review_counter_id')::bigint, true, null, null, null);
select is((select status from public.annual_reviews where id = current_setting('test.annual_review_counter_id')::bigint), 'scheduled', 'manager acceptance places the counter-proposal in planning');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000102', true);
select public.annual_review_save_response(current_setting('test.annual_review_counter_id')::bigint, pg_temp.complete_annual_review_answers('<p>Objectif partagé</p>'), true, true);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '79000000-0000-0000-0000-000000000101', true);
select is((select count(*)::integer from public.annual_review_responses where review_id = current_setting('test.annual_review_counter_id')::bigint), 1, 'manager can read a collaborator response only when sharing was chosen');
select is((select count(*)::integer from public.annual_review_events where review_id = current_setting('test.annual_review_counter_id')::bigint), 4, 'the negotiation and response sharing decision are fully audited');

select * from finish();
rollback;
