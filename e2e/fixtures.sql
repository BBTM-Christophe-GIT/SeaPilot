-- Synthetic accounts for the disposable SeaPilotCI database only.
-- This is deliberately not a seed or migration for a deployed environment.
begin;
set local time zone 'Europe/Paris';

insert into public.companies (code, name)
values ('seapilot-browser-ci', 'SeaPilot browser CI'), ('seapilot-browser-other', 'SeaPilot browser other company')
on conflict (code) do nothing;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select fixture.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
  fixture.email, extensions.crypt('SeaPilot-CI-only-2026!', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('full_name', fixture.display_name), now(), now(), '', '', '', ''
from (values
  ('c1b00000-0000-4000-8000-000000000001'::uuid, 'marin@seapilot-ci.example.invalid', 'CI MARIN'),
  ('c1b00000-0000-4000-8000-000000000002'::uuid, 'capitaine@seapilot-ci.example.invalid', 'CI CAPITAINE'),
  ('c1b00000-0000-4000-8000-000000000003'::uuid, 'outsider@seapilot-ci.example.invalid', 'CI OUTSIDER'),
  ('c1b00000-0000-4000-8000-000000000004'::uuid, 'foreign@seapilot-ci.example.invalid', 'CI FOREIGN')
) fixture(id, email, display_name)
on conflict (id) do update set encrypted_password = excluded.encrypted_password, email_confirmed_at = excluded.email_confirmed_at;

insert into auth.identities (user_id, provider_id, identity_data, provider, created_at, updated_at)
select id, id::text, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), 'email', now(), now()
from auth.users where id::text like 'c1b00000-0000-4000-8000-%'
on conflict (provider_id, provider) do nothing;

insert into public.profiles (id, email, display_name, active_company_id)
select actor.id, actor.email, actor.raw_user_meta_data->>'full_name', company.id
from auth.users actor
join public.companies company on company.code = case
  when actor.id = 'c1b00000-0000-4000-8000-000000000004' then 'seapilot-browser-other'
  else 'seapilot-browser-ci' end
where actor.id::text like 'c1b00000-0000-4000-8000-%'
on conflict (id) do update set email = excluded.email, display_name = excluded.display_name,
  active_company_id = excluded.active_company_id;

-- Keep reruns deterministic even if a future Auth trigger pre-creates a profile.
insert into public.company_memberships (company_id, user_id, active)
select active_company_id, id, true
from public.profiles where id::text like 'c1b00000-0000-4000-8000-%'
on conflict (company_id, user_id) do update set active = true;

delete from public.user_roles where user_id::text like 'c1b00000-0000-4000-8000-%';
insert into public.user_roles (user_id, company_id, role_key)
select id, active_company_id, case when id = 'c1b00000-0000-4000-8000-000000000002' then 'capitaine' else 'marin' end
from public.profiles where id::text like 'c1b00000-0000-4000-8000-%'
on conflict do nothing;

insert into public.people (company_id, user_id, first_name, last_name, function_label, sailor_number, hired_on, active)
select active_company_id, id, 'CI', split_part(display_name, ' ', 2),
  case when id = 'c1b00000-0000-4000-8000-000000000002' then 'Capitaine' else 'Matelot' end,
  'CI-BROWSER-' || right(id::text, 1), current_date - 730, true
from public.profiles where id::text like 'c1b00000-0000-4000-8000-%'
on conflict (user_id) do nothing;

insert into public.vessels (company_id, name, acronym, active, asset_kind)
select company.id, fixture.name, fixture.acronym, true, 'vessel'
from (values
  ('seapilot-browser-ci', 'CI VESSEL ASSIGNED', 'CI-A'),
  ('seapilot-browser-ci', 'CI VESSEL UNASSIGNED', 'CI-U'),
  ('seapilot-browser-other', 'CI VESSEL FOREIGN', 'CI-F')
) fixture(company_code, name, acronym)
join public.companies company on company.code = fixture.company_code
where not exists (select 1 from public.vessels vessel where vessel.company_id = company.id and vessel.acronym = fixture.acronym);

delete from public.planning_assignments where source_label = 'seapilot_browser_ci';
insert into public.planning_assignments (
  company_id, vessel_id, captain_person_id, crew_person_id, starts_on, ends_on,
  starts_at, ends_at, assignment_role, status_label, confirmation_status, watch_group, source_label
)
select person.company_id, vessel.id, captain.id, person.id, current_date - 60, current_date + 60,
  (current_date - 60)::timestamp at time zone 'Europe/Paris',
  (current_date + 61)::timestamp at time zone 'Europe/Paris',
  person.function_label, 'En Mer', 'confirmed', 'CI Bordée', 'seapilot_browser_ci'
from public.people person
join public.vessels vessel on vessel.company_id = person.company_id and vessel.acronym = 'CI-A'
join public.people captain on captain.sailor_number = 'CI-BROWSER-2'
where person.sailor_number in ('CI-BROWSER-1', 'CI-BROWSER-2');

-- Publish the existing assignment fixtures and a one-day mission for both field profiles.
insert into public.planning_releases (company_id, version_number, snapshot, published_by, published_by_name)
select vessel.company_id, 1 + coalesce((select max(release.version_number)
  from public.planning_releases release where release.company_id = vessel.company_id), 0),
  public.planning_release_snapshot(vessel.company_id) || jsonb_build_object('projects', jsonb_build_array(
    jsonb_build_object('id', 601, 'title', 'P601 - Assistance et remorquage portuaire à Cherbourg',
      'starts_on', current_date, 'ends_on', current_date, 'primary_vessel_id', vessel.id,
      'primary_vessel_name', vessel.name, 'event_type', 'operation', 'status', 'Confirmé',
      'source_label', 'seapilot_browser_ci')
  )), 'c1b00000-0000-4000-8000-000000000002'::uuid, 'CI CAPITAINE'
from public.vessels vessel
join public.companies company on company.id = vessel.company_id and company.code = 'seapilot-browser-ci'
where vessel.acronym = 'CI-A' and not exists (
  select 1 from public.planning_releases release
  where release.company_id = vessel.company_id and release.snapshot -> 'projects' @> jsonb_build_array(
    jsonb_build_object('source_label', 'seapilot_browser_ci', 'id', 601, 'starts_on', current_date)
  )
);

insert into public.working_time_registers (company_id, person_id, period_kind, period_start, period_end, created_by)
select person.company_id, person.id, 'monthly', month.starts_on,
  (month.starts_on + interval '1 month - 1 day')::date, person.user_id
from public.people person
cross join (values
  ((date_trunc('month', now()) - interval '1 month')::date),
  (date_trunc('month', now())::date),
  ((date_trunc('month', now()) + interval '1 month')::date)
) month(starts_on)
where person.sailor_number in ('CI-BROWSER-1', 'CI-BROWSER-2')
on conflict do nothing;

-- The editing guard also applies to fixture inserts. Seed with each owner's identity.
do $fixture$
declare actor record;
begin
  for actor in select id, user_id, company_id, sailor_number from public.people
    where sailor_number in ('CI-BROWSER-1', 'CI-BROWSER-2')
  loop
    perform set_config('request.jwt.claim.sub', actor.user_id::text, true);
    insert into public.working_time_intervals (
      company_id, register_id, person_id, local_work_date, starts_at, ends_at,
      timezone_name, utc_offset_minutes, vessel_id, watch_group, source_type, source_record_key
    )
    select actor.company_id, register.id, actor.id, entry.work_date,
      instant.starts_at, instant.ends_at,
      'Europe/Paris', (extract(epoch from ((instant.starts_at at time zone 'Europe/Paris')
        - (instant.starts_at at time zone 'UTC'))) / 60)::smallint,
      vessel.id, 'CI Bordée', 'migration', concat_ws(':', 'ci-amplitude', actor.id, entry.work_date, phase.starts_at)
    from (values (0), (1), (2), (3)) fixture_day(days_ago)
    cross join lateral (select current_date - fixture_day.days_ago work_date) entry
    join public.working_time_registers register on register.person_id = actor.id
      and register.period_kind = 'monthly' and entry.work_date between register.period_start and register.period_end
    join public.vessels vessel on vessel.company_id = actor.company_id and vessel.acronym = 'CI-A'
    cross join (values (time '08:00', time '12:00'), (time '16:00', time '19:30')) phase(starts_at, ends_at)
    cross join lateral (select (entry.work_date + phase.starts_at) at time zone 'Europe/Paris' starts_at,
      (entry.work_date + phase.ends_at) at time zone 'Europe/Paris' ends_at) instant
    where fixture_day.days_ago < 2 or actor.sailor_number = 'CI-BROWSER-1'
    on conflict do nothing;
  end loop;
  perform set_config('request.jwt.claim.sub', '', true);
end;
$fixture$;

insert into public.dpr_reports (
  company_id, vessel_id, report_date, unlisted_project_name, issuer_user_id,
  issuer_name_snapshot, description, created_by, source_label
)
select vessel.company_id, vessel.id, current_date, fixture.project,
  actor.id, actor.display_name, 'Synthetic report for browser scope checks.', actor.id, 'seapilot'
from (values
  ('CI-A', 'CI VISIBLE REPORT', 'c1b00000-0000-4000-8000-000000000003'::uuid),
  ('CI-U', 'CI UNASSIGNED REPORT', 'c1b00000-0000-4000-8000-000000000003'::uuid),
  ('CI-F', 'CI HIDDEN FOREIGN REPORT', 'c1b00000-0000-4000-8000-000000000004'::uuid)
) fixture(acronym, project, user_id)
join public.vessels vessel on vessel.acronym = fixture.acronym
join public.profiles actor on actor.id = fixture.user_id
where not exists (select 1 from public.dpr_reports report where report.unlisted_project_name = fixture.project);

commit;
