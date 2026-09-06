begin;

select plan(23);

select has_table('public', 'annual_review_objectives', 'annual-review objective tracker exists');
select has_table('public', 'kpi_social_governance_settings', 'Social/Governance report settings exist');
select has_function('public', 'annual_review_update_objective_progress', array['bigint','integer'], 'objective progress RPC exists');
select has_function('public', 'annual_review_update_due_date', array['bigint','date'], 'annual-review due-date RPC exists');
select has_function('public', 'kpi_social_governance_context', array['integer[]'], 'Social/Governance context RPC exists');
select has_function('public', 'kpi_social_governance_save_settings', array['integer','text[]','text'], 'Social/Governance configuration RPC exists');
select ok(not has_table_privilege('authenticated', 'public.kpi_social_governance_settings', 'select'), 'raw KPI settings are not exposed to clients');
select ok(not has_table_privilege('authenticated', 'public.annual_review_objectives', 'update'), 'objective percentages cannot bypass the RPC');
select is((select label from public.action_type_catalog where type_key = 'discrimination_human_rights' limit 1), 'Discrimination et atteintes au droits Humains', 'confidential event type is present in the catalog');

insert into auth.users (id, email) values
  ('7d000000-0000-0000-0000-000000000001', 'governance-direction@example.invalid'),
  ('7d000000-0000-0000-0000-000000000002', 'governance-marin@example.invalid'),
  ('7d000000-0000-0000-0000-000000000003', 'governance-issuer@example.invalid'),
  ('7d000000-0000-0000-0000-000000000004', 'governance-christophe@example.invalid'),
  ('7d000000-0000-0000-0000-000000000005', 'governance-outsider-admin@example.invalid');

insert into public.profiles (id, email, display_name, active_company_id)
select fixture.id, fixture.email, fixture.display_name, company.id
from (values
  ('7d000000-0000-0000-0000-000000000001'::uuid, 'governance-direction@example.invalid', 'Diane DIRECTION'),
  ('7d000000-0000-0000-0000-000000000002'::uuid, 'governance-marin@example.invalid', 'Marc MARIN'),
  ('7d000000-0000-0000-0000-000000000003'::uuid, 'governance-issuer@example.invalid', 'Irène EMETTEUR'),
  ('7d000000-0000-0000-0000-000000000004'::uuid, 'governance-christophe@example.invalid', 'Christophe MINASSIAN'),
  ('7d000000-0000-0000-0000-000000000005'::uuid, 'governance-outsider-admin@example.invalid', 'Alice ADMIN')
) fixture(id, email, display_name)
cross join public.companies company where company.code = 'bbtm';

insert into public.company_memberships (company_id, user_id, active)
select company.id, fixture.user_id, true
from (values
  ('7d000000-0000-0000-0000-000000000001'::uuid),
  ('7d000000-0000-0000-0000-000000000002'::uuid),
  ('7d000000-0000-0000-0000-000000000003'::uuid),
  ('7d000000-0000-0000-0000-000000000004'::uuid),
  ('7d000000-0000-0000-0000-000000000005'::uuid)
) fixture(user_id)
cross join public.companies company where company.code = 'bbtm'
on conflict (company_id, user_id) do update set active = true;

insert into public.user_roles (user_id, company_id, role_key)
select fixture.user_id, company.id, fixture.role_key
from (values
  ('7d000000-0000-0000-0000-000000000001'::uuid, 'direction'),
  ('7d000000-0000-0000-0000-000000000002'::uuid, 'marin'),
  ('7d000000-0000-0000-0000-000000000003'::uuid, 'armement'),
  ('7d000000-0000-0000-0000-000000000004'::uuid, 'direction'),
  ('7d000000-0000-0000-0000-000000000005'::uuid, 'admin')
) fixture(user_id, role_key)
cross join public.companies company where company.code = 'bbtm';

insert into public.people (company_id, user_id, first_name, last_name, function_label, hired_on, active)
select company.id, fixture.user_id, fixture.first_name, fixture.last_name, fixture.function_label, current_date - 500, true
from (values
  ('7d000000-0000-0000-0000-000000000001'::uuid, 'Diane', 'DIRECTION', 'Direction'),
  ('7d000000-0000-0000-0000-000000000002'::uuid, 'Marc', 'MARIN', 'Matelot'),
  ('7d000000-0000-0000-0000-000000000003'::uuid, 'Irène', 'EMETTEUR', 'Armement'),
  ('7d000000-0000-0000-0000-000000000004'::uuid, 'Christophe', 'MINASSIAN', 'Directeur QHSE / Chef de Projet'),
  ('7d000000-0000-0000-0000-000000000005'::uuid, 'Alice', 'ADMIN', 'Administratrice')
) fixture(user_id, first_name, last_name, function_label)
cross join public.companies company where company.code = 'bbtm';

insert into public.vessels (company_id, name, active)
select id, 'GOVERNANCE TEST VESSEL', true from public.companies where code = 'bbtm';

insert into public.working_time_profile_signatures (
  company_id, person_id, version_number, storage_path, mime_type, file_size_bytes, sha256, created_by
)
select person.company_id, person.id, 1, person.company_id || '/' || person.id || '/governance.png',
  'image/png', 128, repeat('e', 64), person.user_id
from public.people person where person.user_id = '7d000000-0000-0000-0000-000000000003';

insert into public.annual_reviews (
  company_id, review_year, due_on, employee_person_id, manager_person_id,
  employee_name_snapshot, employee_function_snapshot, manager_name_snapshot,
  status, starts_at, ends_at, meeting_mode, meeting_location,
  proposed_by_person_id, collaborator_submitted_at, manager_validated_at
)
select company.id, extract(year from current_date)::integer, make_date(extract(year from current_date)::integer + 1, 12, 31),
  sailor.id, manager.id, 'Marc MARIN', 'Matelot', 'Diane DIRECTION', 'awaiting_signature',
  date_trunc('hour', now()) - interval '1 day', date_trunc('hour', now()) - interval '23 hours',
  'in_person', 'Bureau', manager.id, now(), now()
from public.companies company
join public.people sailor on sailor.company_id = company.id and sailor.user_id = '7d000000-0000-0000-0000-000000000002'
join public.people manager on manager.company_id = company.id and manager.user_id = '7d000000-0000-0000-0000-000000000001'
where company.code = 'bbtm';

insert into public.annual_review_responses (
  company_id, review_id, respondent_person_id, respondent_role, answers, share_with_manager, submitted_at
)
select review.company_id, review.id, review.manager_person_id, 'manager',
  jsonb_build_object('esg', jsonb_build_object(
    'environment', 'Réduire les déchets à bord.', 'social', 'Améliorer la communication.',
    'governance', 'Clarifier les processus.', 'other', ''
  )), null, now()
from public.annual_reviews review where review.employee_name_snapshot = 'Marc MARIN';

insert into public.annual_review_responses (
  company_id, review_id, respondent_person_id, respondent_role, answers, share_with_manager, submitted_at
)
select review.company_id, review.id, review.employee_person_id, 'collaborator',
  jsonb_build_object('life', jsonb_build_object(
    'overall', 'très satisfait', 'conditions', jsonb_build_object(
      'missions', 'satisfait', 'crew', 'très satisfait', 'position', 'satisfait', 'recognition', 'peu satisfait'
    )
  )), true, now()
from public.annual_reviews review where review.employee_name_snapshot = 'Marc MARIN';

insert into public.annual_review_objectives (company_id, review_id, objective_key, objective, completion_percent, comment)
select review.company_id, review.id, 'goal-1', 'Obtenir le brevet supérieur', 20, 'Suivi trimestriel'
from public.annual_reviews review where review.employee_name_snapshot = 'Marc MARIN';

insert into public.hr_documents (company_id, person_id, category_key, title, status, issued_on, expires_on, source_label)
select review.company_id, review.employee_person_id, 'annual_review', 'Entretien test.pdf', 'valid',
  current_date, review.due_on, 'annual_review'
from public.annual_reviews review where review.employee_name_snapshot = 'Marc MARIN';
update public.annual_reviews review set hr_document_id = document.id
from public.hr_documents document
where document.person_id = review.employee_person_id and document.title = 'Entretien test.pdf';

set local role authenticated;
select set_config('request.jwt.claim.sub', '7d000000-0000-0000-0000-000000000001', true);
select lives_ok(
  format('select public.annual_review_update_objective_progress(%s, 55)', (select id from public.annual_review_objectives where objective_key = 'goal-1')),
  'Direction can update objective progress'
);
select is((select completion_percent from public.annual_review_objectives where objective_key = 'goal-1'), 55, 'updated progress is persisted');
select lives_ok(
  format('select public.annual_review_update_due_date(%s, %L::date)', (select hr_document_id from public.annual_reviews where employee_name_snapshot = 'Marc MARIN'), make_date(extract(year from current_date)::integer + 2, 6, 30)),
  'Direction can modify the annual-review due date'
);
select is((select expires_on from public.hr_documents where title = 'Entretien test.pdf'), make_date(extract(year from current_date)::integer + 2, 6, 30), 'RH document and review share the modified due date');

select set_config('request.jwt.claim.sub', '7d000000-0000-0000-0000-000000000002', true);
select throws_ok(
  format('select public.annual_review_update_objective_progress(%s, 80)', (select id from public.annual_review_objectives where objective_key = 'goal-1')),
  '42501', 'ANNUAL_REVIEW_OBJECTIVE_UPDATE_FORBIDDEN.', 'Marin cannot update objective progress'
);

select set_config('request.jwt.claim.sub', '7d000000-0000-0000-0000-000000000003', true);
select lives_ok(
  $$select public.action_item_create(
    'SIGNALEMENT-CONFIDENTIEL', (select id from public.vessels where name = 'GOVERNANCE TEST VESSEL'),
    'discrimination_human_rights', null, date_trunc('hour', now()), current_date + 15,
    'À quai', 'Temps clair', 'Signalement confidentiel', 'Analyser le signalement', 0
  )$$,
  'issuer can create the confidential event report'
);
select is((select count(*) from public.action_items where title = 'SIGNALEMENT-CONFIDENTIEL'), 1::bigint, 'issuer can read their confidential report');

select set_config('request.jwt.claim.sub', '7d000000-0000-0000-0000-000000000005', true);
select is((select count(*) from public.action_items where title = 'SIGNALEMENT-CONFIDENTIEL'), 0::bigint, 'an unrelated administrator cannot read the confidential report');
select is((public.kpi_social_governance_context(array[extract(year from current_date)::integer])->>'discriminationCount')::integer, 1, 'the KPI exposes only the aggregate confidential-event count');

select set_config('request.jwt.claim.sub', '7d000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.action_items where title = 'SIGNALEMENT-CONFIDENTIEL'), 1::bigint, 'Christophe MINASSIAN can read the confidential report');

select set_config('request.jwt.claim.sub', '7d000000-0000-0000-0000-000000000001', true);
select lives_ok(
  format(
    'select public.kpi_social_governance_save_settings(%s, array[%L], %L)',
    extract(year from current_date)::integer,
    (select response.id::text || ':governance' from public.annual_review_responses response where response.respondent_role = 'manager'),
    '<p>Priorité au dialogue social.</p>'
  ),
  'Direction can select management ESG answers and save the rich report comment'
);
select is(jsonb_array_length(public.kpi_social_governance_context(array[extract(year from current_date)::integer])->'proposals'), 3, 'Direction sees every management ESG candidate for configuration');
select is((public.kpi_social_governance_context(array[extract(year from current_date)::integer])->'radar'->0->>'value')::numeric, 4.00::numeric, 'shared collaborator answers feed the anonymous well-being radar');

select set_config('request.jwt.claim.sub', '7d000000-0000-0000-0000-000000000002', true);
select is(jsonb_array_length(public.kpi_social_governance_context(array[extract(year from current_date)::integer])->'proposals'), 1, 'non-configurator sees only the proposal selected by Direction');

select * from finish();
rollback;
