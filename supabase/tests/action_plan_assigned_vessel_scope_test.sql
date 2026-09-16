begin;

-- Use authenticated identities and real RLS, not an administrator's simulated view.
do $$
declare
  company bigint;
  vessel bigint;
  other_vessel bigint;
  sailor bigint;
  captain bigint;
  actor uuid;
  today date := (current_timestamp at time zone 'Europe/Paris')::date;
  visible text[];
  scope bigint[];
  foreign_report bigint;
begin
  select id into strict company from public.companies where code = 'bbtm';
  insert into public.vessels (company_id, name) values (company, 'TEST-ACTION-SCOPE-CURRENT') returning id into vessel;
  insert into public.vessels (company_id, name) values (company, 'TEST-ACTION-SCOPE-OTHER') returning id into other_vessel;

  foreach actor in array array[
    '7c460000-0000-0000-0000-000000000001'::uuid,
    '7c460000-0000-0000-0000-000000000002'::uuid,
    '7c460000-0000-0000-0000-000000000003'::uuid
  ] loop
    insert into auth.users (id, email) values (actor, actor || '@example.invalid');
    insert into public.profiles (id, email, display_name, active_company_id)
      values (actor, actor || '@example.invalid', 'Action scope fixture', company);
    insert into public.company_memberships (company_id, user_id, active) values (company, actor, true)
      on conflict (company_id, user_id) do update set active = true;
    insert into public.user_roles (company_id, user_id, role_key) values (company, actor,
      case right(actor::text, 1) when '1' then 'marin' when '2' then 'capitaine' else 'direction' end);
    insert into public.people (company_id, user_id, first_name, last_name, active)
      values (company, actor, 'Scope', right(actor::text, 1), true);
  end loop;
  select id into sailor from public.people where user_id = '7c460000-0000-0000-0000-000000000001';
  select id into captain from public.people where user_id = '7c460000-0000-0000-0000-000000000002';

  insert into public.planning_assignments (company_id, vessel_id, crew_person_id, starts_on, ends_on, confirmation_status)
    values (company, vessel, sailor, today, today, 'confirmed'),
           (company, vessel, captain, today, today, 'confirmed'),
           (company, other_vessel, sailor, today + 1, today + 3, 'confirmed'),
           (company, other_vessel, captain, today - 3, today - 1, 'confirmed');

  insert into public.action_items (company_id, vessel_id, title, status, closed_on, source_label, action_type_key)
    values (company, vessel, 'TEST-ACTION-SCOPE-OPEN', 'Non soldé', null, 'sharepoint', 'action_progress'),
           (company, vessel, 'TEST-ACTION-SCOPE-CLOSED', 'Soldé', today, 'sharepoint', 'action_progress'),
           (company, vessel, 'TEST-ACTION-SCOPE-NATIVE', 'Non soldé', null, 'seapilot', 'action_progress'),
           (company, vessel, 'TEST-ACTION-SCOPE-CONFIDENTIAL', 'Non soldé', null, 'sharepoint', 'discrimination_human_rights'),
           (company, other_vessel, 'TEST-ACTION-SCOPE-OTHER', 'Non soldé', null, 'sharepoint', 'action_progress'),
           (company, null, 'TEST-ACTION-SCOPE-UNASSIGNED', 'Non soldé', null, 'sharepoint', 'action_progress');
  select id into foreign_report from public.action_items where title = 'TEST-ACTION-SCOPE-OTHER';
  -- Ownership and personal assignment must not bypass the vessel boundary.
  update public.action_items set issuer_person_id = sailor where id = foreign_report;
  insert into public.action_item_assignees (company_id, action_item_id, assignee_kind, person_id, display_name_snapshot)
    values (company, foreign_report, 'person', captain, 'Scope captain');

  foreach actor in array array['7c460000-0000-0000-0000-000000000001'::uuid, '7c460000-0000-0000-0000-000000000002'::uuid] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    set local role authenticated;
    select public.action_plan_current_vessel_scope() into scope;
    if scope <> array[vessel] then raise exception 'Incorrect assigned vessel scope for %: %', actor, scope; end if;
    select array_agg(title order by title) into visible from public.action_items where title like 'TEST-ACTION-SCOPE-%';
    if visible is distinct from array['TEST-ACTION-SCOPE-CLOSED', 'TEST-ACTION-SCOPE-NATIVE', 'TEST-ACTION-SCOPE-OPEN'] then
      raise exception 'RLS leaked or hid reports for %: %', actor, visible;
    end if;
    if public.action_item_user_can_read(foreign_report) then raise exception 'Direct report access bypassed scope'; end if;
    set local role postgres;
  end loop;

  perform set_config('request.jwt.claim.sub', '7c460000-0000-0000-0000-000000000003', true);
  set local role authenticated;
  select array_agg(title order by title) into visible from public.action_items where title like 'TEST-ACTION-SCOPE-%';
  if cardinality(visible) <> 5 then raise exception 'Direction lost fleet access or gained confidential access: %', visible; end if;
  set local role postgres;

  update public.planning_assignments set confirmation_status = 'cancelled'
    where crew_person_id in (sailor, captain) and vessel_id = vessel;
  foreach actor in array array['7c460000-0000-0000-0000-000000000001'::uuid, '7c460000-0000-0000-0000-000000000002'::uuid] loop
    perform set_config('request.jwt.claim.sub', actor::text, true);
    set local role authenticated;
    if cardinality(public.action_plan_current_vessel_scope()) <> 0 then raise exception 'Cancelled, future or past assignment leaked'; end if;
    if exists (select 1 from public.action_items where title like 'TEST-ACTION-SCOPE-%') then raise exception 'Reports visible without current assignment'; end if;
    set local role postgres;
  end loop;
end;
$$;

select 'PASS: Marin, Capitaine, Direction, current date boundaries, future/past/cancelled assignments, closed/native/imported reports, ownership, assignees and confidentiality' as result;
rollback;
