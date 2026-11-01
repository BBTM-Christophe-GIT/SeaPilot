-- Synthetic accounts, actual PostgreSQL authenticated roles and live Planning.
-- No published release is inserted: ordinary operational readers use confirmed
-- live assignments. All setup, records, Storage metadata and mutations roll back.
begin;
-- Unrelated permissive Storage policies reference billing metadata. PostgreSQL
-- checks that table privilege while planning storage.objects queries even for
-- another bucket. Supply only this fixture prerequisite inside the rollback;
-- this suite validates object RLS scope, not production table-grant setup.
do $$ begin
  assert (select relrowsecurity from pg_class where oid='public.project_billing_documents'::regclass),
    'Billing metadata RLS must remain enabled for the Storage fixture';
end $$;
grant select on public.project_billing_documents to authenticated;
create temporary table window_actors(label text primary key, actor uuid, company_id bigint, person_id bigint);
create temporary table window_ships(label text primary key, id bigint, company_id bigint);
create temporary table window_records(label text primary key, lifting_id bigint, inspection_id bigint, lsa_id bigint, certificate_id bigint, dpr_id bigint);
grant select on window_actors, window_ships, window_records to authenticated;
insert into public.companies(code, name, active) values ('read-window-test-a', 'Read window company A', true), ('read-window-test-b', 'Read window company B', true);
insert into public.role_module_permissions(role_key, module_key, is_visible)
  select role, module, true from unnest(array['marin', 'capitaine', 'admin']) role cross join unnest(array['lsa', 'lifting', 'dpr']) module
  on conflict(role_key, module_key) do update set is_visible = true;

do $$
declare actor_label text; actor uuid; company bigint; person bigint; n integer := 0; ship bigint; crew bigint; captain bigint;
  first_day date; last_day date; previous_month_day date; last_future_month_day date; exact_previous_end boolean;
  today date := (current_timestamp at time zone 'Europe/Paris')::date; lift bigint; inspection bigint; lsa bigint; certificate bigint; dpr bigint;
begin
  previous_month_day := (today - interval '1 month')::date;
  exact_previous_end := (previous_month_day + interval '1 month')::date = today;
  last_future_month_day := (today + interval '1 month')::date;
  -- On February 28, embarkations on March 29/30/31 all open on February 28.
  -- Select the last included embarkation and its immediately excluded next day.
  while ((last_future_month_day + 1) - interval '1 month')::date <= today loop
    last_future_month_day := last_future_month_day + 1;
  end loop;
  foreach actor_label in array array['marin', 'admin', 'capitaine', 'inactive', 'inactive-person', 'banned', 'anonymous', 'foreign', 'unassigned'] loop
    n := n + 1; actor := ('ac710000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
    select id into strict company from public.companies where code = case when actor_label = 'foreign' then 'read-window-test-b' else 'read-window-test-a' end;
    insert into auth.users(id, email, banned_until, is_anonymous) values(actor, actor_label || '-read-window@example.invalid',
      case when actor_label = 'banned' then current_timestamp + interval '1 day' else null end, actor_label = 'anonymous');
    insert into public.profiles(id, email, display_name, active_company_id) values(actor, actor_label || '-read-window@example.invalid', 'Read window ' || actor_label, company);
    insert into public.company_memberships(company_id, user_id, active) values(company, actor, actor_label <> 'inactive')
      on conflict(company_id, user_id) do update set active = excluded.active;
    insert into public.user_roles(company_id, user_id, role_key) values(company, actor,
      case when actor_label in ('admin', 'capitaine') then actor_label else 'marin' end);
    insert into public.people(company_id, user_id, first_name, last_name, function_label, active)
      values(company, actor, 'Read window', actor_label, case when actor_label = 'capitaine' then 'Capitaine' else 'Matelot' end, actor_label <> 'inactive-person') returning id into person;
    insert into window_actors values(actor_label, actor, company, person);
  end loop;
  select company_id, person_id into company, crew from window_actors where label = 'marin';
  select person_id into captain from window_actors where label = 'capitaine';
  insert into public.lifting_inspector_grants(company_id, user_id) select fixture.company_id, fixture.actor from window_actors fixture where fixture.label = 'capitaine';
  foreach actor_label in array array['current', 'pre-bound', 'pre-inside', 'post-bound', 'post-inside', 'pre-out', 'post-out', 'provisional', 'cancelled', 'named', 'unassigned'] loop
    insert into public.vessels(company_id, name, active, asset_kind) values(company, 'READ-WINDOW-' || actor_label, true, 'vessel') returning id into ship;
    insert into window_ships values(actor_label, ship, company);
    if actor_label <> 'unassigned' then
      first_day := case actor_label
        when 'pre-bound' then last_future_month_day when 'pre-out' then last_future_month_day + 1
        when 'pre-inside' then today + 15 when 'post-bound' then (today - interval '1 month')::date - 3
        when 'post-out' then (today - interval '1 month')::date - 4 when 'post-inside' then today - 11 else today - 2 end;
      -- Month arithmetic clips shorter months and is not reversible. For
      -- March 31, February 28 ends its window on March 28: it is outside. The
      -- nearest eligible end is March 1. Test that adjacent transition rather
      -- than wrongly assuming a February 31 endpoint exists.
      last_day := case actor_label
        when 'post-bound' then previous_month_day + case when exact_previous_end then 0 else 1 end
        when 'post-out' then previous_month_day - case when exact_previous_end then 1 else 0 end
        when 'post-inside' then today - 8 else first_day + 4 end;
      if actor_label in ('post-bound', 'post-out') then first_day := last_day - 3; end if;
      insert into public.planning_assignments(company_id, vessel_id, crew_person_id, captain_person_id, starts_on, ends_on, starts_at, ends_at, confirmation_status)
        values(company, ship, case when actor_label = 'named' then (select person_id from window_actors where label = 'admin') else crew end,
          case when actor_label = 'named' then crew else null end, first_day, last_day,
          first_day::timestamp at time zone 'Europe/Paris', (last_day + 1)::timestamp at time zone 'Europe/Paris',
          case actor_label when 'provisional' then 'provisional' when 'cancelled' then 'cancelled' else 'confirmed' end);
      if actor_label in ('current', 'pre-inside', 'post-inside') then
        insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at, assignment_role, confirmation_status)
          values(company, ship, captain, first_day, last_day, first_day::timestamp at time zone 'Europe/Paris',
            (last_day + 1)::timestamp at time zone 'Europe/Paris', 'Capitaine', 'confirmed');
      end if;
    end if;
    -- Historical certificate dates intentionally do not overlap preparation.
    insert into public.lifting_inventory(company_id, vessel_id, kind, reference, material_type, description)
      values(company, ship, 'lifting', '1', 'Manille', 'Read window item') returning id into lift;
    insert into public.lifting_inspections(company_id, vessel_id, kind, inspection_year, issued_on, expires_on, vessel_snapshot)
      values(company, ship, 'lifting', extract(year from today)::integer, today, today + 365, '{}'::jsonb) returning id into inspection;
    insert into public.lifting_inspection_entries(inspection_id, item_id, item_snapshot) values(inspection, lift, '{}'::jsonb);
    insert into public.lsa_items(company_id, vessel_id, title, category_key, issued_on, expires_on)
      values(company, ship, 'Read window LSA', '07-4-gmdss', today - 500, today - 400) returning id into lsa;
    insert into public.fleet_certificates(company_id, vessel_id, title, category_key, issued_on, expires_on)
      values(company, ship, 'Read window certificate', 'certificate', today - 500, today - 400) returning id into certificate;
    insert into public.dpr_reports(company_id, vessel_id, report_date, issuer_user_id, issuer_name_snapshot, created_by)
      select company, ship, today - 3, fixture.actor, 'Read window administrator', fixture.actor from window_actors fixture where fixture.label = 'admin' returning id into dpr;
    insert into window_records values(actor_label, lift, inspection, lsa, certificate, dpr);
    insert into public.lsa_versions(company_id, certificate_id, version_no, original_file_name, normalized_file_name, storage_path)
      values(company, lsa, 1, 'window.pdf', 'window.pdf', company || '/read-window/' || lsa || '.pdf');
    insert into storage.objects(bucket_id, name, metadata) values('lifting-certificates', company || '/' || ship || '/' || lift || '/1/01234567-89ab-4cde-8fab-0123456789ab.pdf', '{"mimetype":"application/pdf","size":128}'::jsonb);
  end loop;
  select company_id, person_id into company, crew from window_actors where label = 'foreign';
  insert into public.vessels(company_id, name, active, asset_kind) values(company, 'READ-WINDOW-foreign', true, 'vessel') returning id into ship;
  insert into window_ships values('foreign', ship, company);
  insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at, confirmation_status)
    values(company, ship, crew, today - 2, today + 2, (today - 2)::timestamp at time zone 'Europe/Paris', (today + 3)::timestamp at time zone 'Europe/Paris', 'confirmed');
  -- The inactive/banned/anonymous actors are assigned, so account gates are tested
  -- independently from an absence of Planning.
  insert into public.planning_assignments(company_id, vessel_id, crew_person_id, starts_on, ends_on, starts_at, ends_at, confirmation_status)
    select actor.company_id, ship.id, actor.person_id, today - 2, today + 2,
      (today - 2)::timestamp at time zone 'Europe/Paris', (today + 3)::timestamp at time zone 'Europe/Paris', 'confirmed'
    from window_actors actor join window_ships ship on ship.label = 'current'
    where actor.label in ('inactive', 'inactive-person', 'banned', 'anonymous');
end $$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', 'ac710000-0000-4000-8000-000000000001', true);
do $$
declare company bigint; scope bigint[]; visible text[]; ship bigint; record window_records%rowtype; path text; hidden bigint;
begin
  select company_id into company from window_actors where label = 'marin';
  scope := public.assigned_vessel_read_scope();
  select array_agg(label order by label) into visible from window_ships where id = any(scope);
  assert visible = array['current', 'named', 'post-bound', 'post-inside', 'pre-bound', 'pre-inside'], format('Wrong inclusive month scope: %s', visible);
  assert not private.can_read_assigned_vessel(company, (select id from window_ships where label = 'post-out')), 'Outside calendar-month follow-up remained visible';
  assert not private.can_read_assigned_vessel(company, (select id from window_ships where label = 'pre-out')), 'Outside calendar-month preparation remained visible';
  assert private.assigned_vessel_read_scope((select company_id from window_actors where label = 'foreign')) = '{}'::bigint[], 'Caller chose another tenant';
  assert not private.can_read_assigned_vessel(company, (select id from window_ships where label = 'foreign')), 'Foreign ship included';
  assert not private.can_read_assigned_vessel(company, null), 'Null ship included';
  assert not public.lifting_can_access(company, (select id from window_ships where label = 'pre-inside')), 'Legacy lifting writer gained preparation scope';
  assert not public.lsa_can_add_item((select id from window_ships where label = 'pre-inside')), 'Legacy LSA writer gained preparation scope';
  foreach ship in array scope loop
    select * into record from window_records where label = (select label from window_ships where id = ship);
    assert exists(select 1 from public.lifting_available_vessels() vessel where vessel.id = ship), 'Preparation/follow-up ship missing from lifting selector';
    assert exists(select 1 from public.lifting_inventory where id = record.lifting_id), 'Grace lifting inventory hidden';
    assert exists(select 1 from public.lifting_inspections where id = record.inspection_id), 'Grace lifting inspection hidden';
    assert exists(select 1 from public.lifting_inspection_entries where inspection_id = record.inspection_id), 'Grace lifting child entry hidden';
    assert exists(select 1 from public.lsa_available_vessels() vessel where vessel.id = ship), 'Grace LSA ship hidden';
    assert exists(select 1 from public.lsa_items where id = record.lsa_id), 'Grace expired LSA equipment hidden';
    assert exists(select 1 from public.lsa_versions where certificate_id = record.lsa_id), 'Grace LSA document hidden';
    assert exists(select 1 from public.fleet_certificates where id = record.certificate_id), 'Grace historical certificate hidden';
    assert public.dpr_can_read_report(record.dpr_id), 'Grace DPR authored by another account hidden';
    assert not public.dpr_user_can_edit(record.dpr_id), 'DPR consultation escalated to editing';
    path := company || '/' || ship || '/' || record.lifting_id || '/1/01234567-89ab-4cde-8fab-0123456789ab.pdf';
    assert public.lifting_certificate_path_access(path), 'Grace lifting attachment unreadable';
    assert exists(select 1 from storage.objects where bucket_id = 'lifting-certificates' and name = path), 'Grace Storage attachment unreadable';
    if record.label in ('pre-bound', 'pre-inside', 'post-bound', 'post-inside') then
      assert not public.lifting_certificate_path_upload(path), 'Reader scope leaked into upload helper';
      begin perform public.save_lifting_item(ship, 'lifting', '{"material_type":"Manille","description":"Forbidden grace creation"}'); raise exception 'Grace lifting creation accepted'; exception when insufficient_privilege then null; end;
      begin perform public.save_lsa_item(ship, jsonb_build_object('designation_id', (select id from public.lsa_designations where company_id = company and name = 'EPIRB'), 'expires_on', current_date + 90)); raise exception 'Grace LSA creation accepted'; exception when insufficient_privilege then null; end;
    end if;
  end loop;
  select id into hidden from window_ships where label = 'unassigned';
  assert not private.can_read_assigned_vessel(company, hidden), 'Unassigned ship window access';
  assert not exists(select 1 from public.lifting_available_vessels() vessel where vessel.id = hidden), 'Unassigned lifting ship visible';
  assert not public.dpr_can_read_report((select dpr_id from window_records where label = 'unassigned')), 'Unassigned Marin DPR visible';
end $$;

-- A granted captain inspector can inspect during embarkation but not because of
-- the additional preparation/follow-up read window.
select set_config('request.jwt.claim.sub', 'ac710000-0000-4000-8000-000000000003', true);
do $$
declare company bigint; ship bigint; record window_records%rowtype;
begin
  select company_id into company from window_actors where label = 'capitaine';
  assert public.lifting_can_start_inspection(), 'Fixture captain has no existing inspection capability';
  assert private.can_read_assigned_vessel(company, (select id from window_ships where label = 'current')), 'Current captain scope lost';
  for record in select * from window_records where label in ('pre-inside', 'post-inside') loop
    select id into ship from window_ships where label = record.label;
    assert not public.lifting_can_access(company, ship), 'Captain gained grace inspection write scope';
    begin perform public.start_lifting_inspection(ship, 'lifting', current_date, current_date + 365); raise exception 'Captain started grace inspection'; exception when insufficient_privilege then null; end;
    begin perform public.set_lifting_item_active(record.lifting_id, false); raise exception 'Captain archived grace equipment'; exception when insufficient_privilege then null; end;
  end loop;
end $$;

do $$
declare actor_label text; actor uuid;
begin
  foreach actor_label in array array['inactive', 'inactive-person', 'banned', 'anonymous', 'unassigned'] loop
    select window_actors.actor into actor from window_actors where label = actor_label;
    perform set_config('request.jwt.claim.sub', actor::text, true);
    assert public.assigned_vessel_read_scope() = '{}'::bigint[], format('Inactive/unassigned account gained scope: %s', actor_label);
  end loop;
  perform set_config('request.jwt.claim.sub', 'ac710000-0000-4000-8000-000000000008', true);
  assert public.assigned_vessel_read_scope() = array[(select id from window_ships where label = 'foreign')], 'Foreign account lost own ship or gained other tenant ships';
end $$;
reset role;

-- Cancellation removes the extra window immediately, including its endpoints.
update public.planning_assignments set confirmation_status = 'cancelled'
  where company_id = (select company_id from window_actors where label = 'marin') and vessel_id = (select id from window_ships where label = 'pre-bound');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ac710000-0000-4000-8000-000000000001', true);
do $$ begin
  assert not private.can_read_assigned_vessel((select company_id from window_actors where label = 'marin'), (select id from window_ships where label = 'pre-bound')), 'Cancelled future assignment retained window';
end $$;
reset role;
update public.companies set active = false where code = 'read-window-test-a';
set local role authenticated;
do $$ begin assert public.assigned_vessel_read_scope() = '{}'::bigint[], 'Inactive company retained ship window'; end $$;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin assert public.assigned_vessel_read_scope() = '{}'::bigint[], 'Missing JWT subject gained ship window'; end $$;
reset role;
set local role anon;
do $$ begin
  begin perform public.assigned_vessel_read_scope(); raise exception 'Anonymous window RPC callable'; exception when insufficient_privilege then null; end;
  begin perform private.assigned_vessel_read_scope(1); raise exception 'Anonymous private scope callable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
