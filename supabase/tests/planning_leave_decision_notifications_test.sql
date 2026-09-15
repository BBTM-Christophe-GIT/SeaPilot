-- Real database roles and recipient RLS; all fixtures and notifications are rolled back.
begin;
do $$
declare
  company bigint := (select id from public.companies where code = 'bbtm');
  manager uuid := gen_random_uuid();
  sailor uuid := gen_random_uuid();
  captain uuid := gen_random_uuid();
  sailor_person bigint;
  captain_person bigint;
  approved_id bigint;
  rejected_id bigint;
  delegated_id bigint;
  notification_id bigint;
  original_body text;
begin
  insert into auth.users(id, email)
  select id, id::text || '@example.invalid' from unnest(array[manager, sailor, captain]) id;
  insert into public.profiles(id, email, display_name, active_company_id)
  select id, id::text || '@example.invalid', 'Notification fixture', company from unnest(array[manager, sailor, captain]) id;
  insert into public.company_memberships(company_id, user_id, active)
  select company, id, true from unnest(array[manager, sailor, captain]) id
  on conflict (company_id, user_id) do update set active = true;
  insert into public.user_roles(company_id, user_id, role_key)
  values (company, manager, 'admin'), (company, sailor, 'marin'), (company, captain, 'capitaine');
  insert into public.people(company_id, user_id, first_name, last_name, function_label, hired_on, active)
  values (company, sailor, 'Sam', 'NOTIFICATION', 'Matelot', current_date - 365, true) returning id into sailor_person;
  insert into public.people(company_id, user_id, first_name, last_name, function_label, hired_on, active)
  values (company, captain, 'Camille', 'NOTIFICATION', 'Capitaine', current_date - 365, true) returning id into captain_person;

  insert into public.planning_absences(company_id, person_id, absence_type, starts_at, ends_at, reason, requested_by, updated_by)
  values (company, sailor_person, 'leave', '2027-01-11 08:00 Europe/Paris', '2027-01-12 18:00 Europe/Paris', '', sailor, sailor)
  returning id into approved_id;
  insert into public.planning_absences(company_id, person_id, absence_type, starts_at, ends_at, reason, requested_by, updated_by)
  values (company, captain_person, 'leave', '2027-02-01 08:00 Europe/Paris', '2027-02-02 18:00 Europe/Paris', '', captain, captain)
  returning id into rejected_id;
  insert into public.planning_absences(company_id, person_id, absence_type, starts_at, ends_at, reason, requested_by, updated_by)
  values (company, captain_person, 'leave', '2027-03-01 08:00 Europe/Paris', '2027-03-02 18:00 Europe/Paris', '', manager, manager)
  returning id into delegated_id;
  if exists (select 1 from public.planning_notifications where entity_kind = 'absence_decision' and entity_id in (approved_id,rejected_id,delegated_id)) then
    raise exception 'A request must not create a decision notification';
  end if;

  perform set_config('request.jwt.claim.sub', sailor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
  begin
    perform public.review_planning_absence(approved_id, 'approve', '');
    raise exception 'A Marin must not approve leave';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', manager::text, true);
  set local role authenticated;
  perform public.review_planning_absence(approved_id, 'approve', 'Bon repos');
  perform public.review_planning_absence(rejected_id, 'reject', 'Effectif insuffisant');
  perform public.review_planning_absence(delegated_id, 'approve', 'Accord');
  reset role;

  if (select count(*) from public.planning_notifications where entity_kind = 'absence_decision' and entity_id in (approved_id,rejected_id,delegated_id)) <> 3 then
    raise exception 'Each decision must create exactly one requester notice';
  end if;
  if not exists (select 1 from public.planning_notifications where entity_id = delegated_id and entity_kind = 'absence_decision' and recipient_user_id = manager) then
    raise exception 'The author, not the beneficiary, must receive a delegated request decision';
  end if;
  if not exists (select 1 from public.planning_notifications where entity_id = approved_id and entity_kind = 'absence_decision' and title = 'Congés acceptés' and body like '%11/01/2027 08:00%' and body like '%Bon repos%' and read_at is null) then
    raise exception 'Approval must include local dates, comment, and unread status';
  end if;

  perform set_config('request.jwt.claim.sub', sailor::text, true);
  set local role authenticated;
  if (select count(*) from public.planning_notifications where entity_kind = 'absence_decision' and entity_id in (approved_id,rejected_id,delegated_id)) <> 1 then
    raise exception 'A Marin must only read their own decision';
  end if;
  select id, body into notification_id, original_body from public.planning_notifications where entity_kind='absence_decision' and entity_id=approved_id;
  perform public.mark_planning_notification_read(notification_id, true);
  reset role;
  update public.planning_absences set review_comment='Unchanged decision metadata' where id=approved_id;
  if not exists (select 1 from public.planning_notifications where id=notification_id and read_at is not null and body=original_body) then
    raise exception 'An edit must not overwrite or re-notify a read decision';
  end if;

  perform set_config('request.jwt.claim.sub', captain::text, true);
  set local role authenticated;
  if (select count(*) from public.planning_notifications where entity_kind='absence_decision' and entity_id in (approved_id,rejected_id,delegated_id)) <> 1 then
    raise exception 'A Capitaine must only read their own emitted request decision';
  end if;
  if not exists (select 1 from public.planning_notifications where entity_id=rejected_id and entity_kind='absence_decision' and title='Congés refusés' and body like '%Effectif insuffisant%') then
    raise exception 'The refusal comment must be visible to its author';
  end if;
  begin
    perform public.mark_planning_notification_read(notification_id, true);
    raise exception 'A Capitaine must not mark someone else notice read';
  exception when no_data_found then null;
  end;
  reset role;

  if has_function_privilege('authenticated', 'public.planning_notify_absence()', 'execute')
    or has_function_privilege('anon', 'public.planning_notify_absence()', 'execute') then
    raise exception 'The trigger must not be callable as a public RPC';
  end if;
end;
$$;
select 'Planning leave approval/refusal notifications and recipient RLS: passed' as result;
rollback;
