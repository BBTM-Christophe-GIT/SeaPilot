-- Present one sailor in the register catalogue, while keeping monthly register
-- instances as the immutable workflow/audit boundary. Management can browse the
-- catalogue without having a linked HR person; editing still requires the
-- existing, stricter working-time permission functions.

create or replace function public.working_time_entry_context(
  p_starts_on date,
  p_ends_on date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_person_id bigint := public.current_person_id();
  can_browse_company boolean;
  editable_people jsonb;
  readable_people jsonb;
begin
  if (select auth.uid()) is null or target_company_id is null then
    raise exception using errcode = '42501', message = 'WORKING_TIME_COMPANY_REQUIRED.';
  end if;
  if p_starts_on is null or p_ends_on is null or p_ends_on < p_starts_on then
    raise exception using errcode = '22023', message = 'WORKING_TIME_PERIOD_INVALID.';
  end if;

  can_browse_company := public.has_company_role(
    target_company_id,
    array['admin', 'direction', 'armement']
  );
  if actor_person_id is null and not can_browse_company then
    raise exception using errcode = '42501', message = 'WORKING_TIME_PROFILE_NOT_LINKED: fiche RH requise.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', person.id,
    'first_name', person.first_name,
    'last_name', person.last_name,
    'function_label', person.function_label,
    'is_self', person.id = actor_person_id
  ) order by person.id <> actor_person_id, person.last_name, person.first_name), '[]'::jsonb)
  into readable_people
  from public.people person
  where person.company_id = target_company_id
    and person.active
    and (
      can_browse_company
      or person.id = actor_person_id
      or public.working_time_captain_can_access_period(
        target_company_id, person.id, p_starts_on, p_ends_on
      )
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'person_id', person.id,
    'first_name', person.first_name,
    'last_name', person.last_name,
    'function_label', person.function_label,
    'is_self', person.id = actor_person_id
  ) order by person.id <> actor_person_id, person.last_name, person.first_name), '[]'::jsonb)
  into editable_people
  from public.people person
  where actor_person_id is not null
    and person.company_id = target_company_id
    and person.active
    and (
      public.working_time_can_manage_entry_scope(target_company_id)
      or (
        person.id = actor_person_id
        and public.has_company_role(target_company_id, array['marin', 'capitaine'])
      )
      or public.working_time_captain_can_access_period(
        target_company_id, person.id, p_starts_on, p_ends_on
      )
    );

  return jsonb_build_object(
    'current_person_id', actor_person_id,
    'readable_people', readable_people,
    'editable_people', editable_people
  );
end;
$$;

comment on function public.working_time_entry_context(date, date) is
  'Returns separate readable and editable HR scopes. Management browsing does not require a linked HR person; mutations keep their existing stricter guards.';

-- Reuse the Planning P1.3 recipient-specific notification inbox for work/rest
-- non-conformities. No separate threshold or notification table is introduced.

alter table public.planning_notifications
  drop constraint if exists planning_notifications_type_check;
alter table public.planning_notifications
  add constraint planning_notifications_type_check check (notification_type in (
    'new_assignment', 'assignment_modified', 'publication', 'handover', 'absence',
    'critical_conflict', 'expiring_certificate', 'vacant_position',
    'working_time_non_compliance'
  ));

create or replace function public.working_time_queue_non_compliance_notification(
  p_calculation_id bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  calculation public.working_time_calculation_windows%rowtype;
  sailor_name text;
  target_title text;
  target_severity text;
  violation_labels text[] := array[]::text[];
  target_body text;
  affected integer := 0;
begin
  select * into calculation
  from public.working_time_calculation_windows
  where id = p_calculation_id;

  if calculation.id is null or calculation.is_compliant is distinct from false then
    return 0;
  end if;

  select trim(concat_ws(' ', person.first_name, person.last_name))
  into sailor_name
  from public.people person
  where person.id = calculation.person_id
    and person.company_id = calculation.company_id;
  sailor_name := coalesce(nullif(sailor_name, ''), 'Marin #' || calculation.person_id::text);

  if 'work_24h' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'travail maximal sur 24 h dépassé'); end if;
  if 'work_7d' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'travail maximal sur 7 jours dépassé'); end if;
  if 'night_work_24h' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'travail de nuit dépassé'); end if;
  if 'rest_24h' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'repos total sur 24 h insuffisant'); end if;
  if 'consecutive_rest' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'repos consécutif insuffisant'); end if;
  if 'rest_periods_24h' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'repos trop fractionné'); end if;
  if 'rest_7d' = any(calculation.violation_codes) then violation_labels := array_append(violation_labels, 'repos sur 7 jours insuffisant'); end if;

  if calculation.violation_codes && array['work_24h', 'work_7d', 'night_work_24h']::text[]
    and calculation.violation_codes && array['rest_24h', 'consecutive_rest', 'rest_periods_24h', 'rest_7d']::text[] then
    target_title := 'Travail dépassé et repos insuffisant — ' || sailor_name;
  elsif calculation.violation_codes && array['work_24h', 'work_7d', 'night_work_24h']::text[] then
    target_title := 'Temps de travail dépassé — ' || sailor_name;
  elsif calculation.violation_codes && array['rest_24h', 'consecutive_rest', 'rest_periods_24h', 'rest_7d']::text[] then
    target_title := 'Temps de repos insuffisant — ' || sailor_name;
  else
    target_title := 'Temps de travail non conforme — ' || sailor_name;
  end if;

  target_severity := case
    when calculation.violation_codes && array['work_24h', 'work_7d', 'rest_24h', 'consecutive_rest', 'rest_7d']::text[] then 'critical'
    else 'warning'
  end;
  target_body := 'Journée du ' || calculation.local_window_end_date::text
    || ' · ' || coalesce(array_to_string(violation_labels, ' · '), 'écart détecté')
    || ' · Travail 24 h : ' || round(calculation.work_24h_seconds / 3600.0, 2)::text || ' h'
    || ' · Repos 24 h : ' || round(calculation.rest_24h_seconds / 3600.0, 2)::text || ' h'
    || ' · Repos consécutif : ' || round(calculation.longest_rest_24h_seconds / 3600.0, 2)::text || ' h'
    || ' · Travail 7 j : ' || round(calculation.work_7d_seconds / 3600.0, 2)::text || ' h'
    || ' · Repos 7 j : ' || round(calculation.rest_7d_seconds / 3600.0, 2)::text || ' h.';

  with recipients as (
    select distinct role.user_id
    from public.user_roles role
    where role.company_id = calculation.company_id
      and role.role_key in ('admin', 'direction', 'armement')
  )
  insert into public.planning_notifications (
    company_id, recipient_user_id, notification_type, severity, title, body,
    entity_kind, entity_id, person_id, vessel_id, due_on, fingerprint
  )
  select calculation.company_id, recipient.user_id, 'working_time_non_compliance',
    target_severity, target_title, target_body, 'working_time_calculation',
    calculation.id, calculation.person_id, calculation.vessel_id,
    calculation.local_window_end_date,
    'working-time-non-compliance:' || calculation.id::text
  from recipients recipient
  where recipient.user_id is not null
  on conflict (company_id, recipient_user_id, fingerprint) do update set
    severity = excluded.severity,
    title = excluded.title,
    body = excluded.body,
    person_id = excluded.person_id,
    vessel_id = excluded.vessel_id,
    due_on = excluded.due_on,
    created_at = case
      when public.planning_notifications.body is distinct from excluded.body then now()
      else public.planning_notifications.created_at
    end,
    read_at = case
      when public.planning_notifications.body is distinct from excluded.body then null
      else public.planning_notifications.read_at
    end;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.working_time_queue_non_compliance_notification(bigint)
  from public, anon, authenticated;

create or replace function public.working_time_notify_non_compliance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_compliant is false and (
    tg_op = 'INSERT'
    or old.is_compliant is distinct from false
    or old.violation_codes is distinct from new.violation_codes
    or old.work_24h_seconds is distinct from new.work_24h_seconds
    or old.rest_24h_seconds is distinct from new.rest_24h_seconds
    or old.longest_rest_24h_seconds is distinct from new.longest_rest_24h_seconds
    or old.work_7d_seconds is distinct from new.work_7d_seconds
    or old.rest_7d_seconds is distinct from new.rest_7d_seconds
  ) then
    perform public.working_time_queue_non_compliance_notification(new.id);
  elsif tg_op = 'UPDATE' and old.is_compliant is false and new.is_compliant is true then
    update public.planning_notifications notification
    set severity = 'information',
        title = 'Écart de temps de travail résolu',
        body = notification.body || ' Situation recalculée conforme le ' || now()::date::text || '.',
        read_at = coalesce(notification.read_at, now())
    where notification.company_id = new.company_id
      and notification.entity_kind = 'working_time_calculation'
      and notification.entity_id = new.id
      and notification.notification_type = 'working_time_non_compliance';
  end if;
  return new;
end;
$$;

revoke all on function public.working_time_notify_non_compliance()
  from public, anon, authenticated;
drop trigger if exists working_time_calculation_non_compliance_notify
  on public.working_time_calculation_windows;
create trigger working_time_calculation_non_compliance_notify
after insert or update on public.working_time_calculation_windows
for each row execute function public.working_time_notify_non_compliance();

create or replace function public.refresh_working_time_notifications(p_reference_date date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  item record;
  affected integer := 0;
  month_start date := date_trunc('month', p_reference_date)::date;
  month_end date := (date_trunc('month', p_reference_date) + interval '1 month - 1 day')::date;
begin
  if target_company_id is null
    or not public.has_any_role(array['admin', 'direction', 'armement']) then
    raise exception using errcode = '42501', message = 'Vous ne pouvez pas actualiser les notifications de temps de travail.';
  end if;

  for item in
    select calculation.id
    from public.working_time_calculation_windows calculation
    where calculation.company_id = target_company_id
      and calculation.local_window_end_date between month_start and month_end
      and calculation.is_compliant is false
  loop
    affected := affected + public.working_time_queue_non_compliance_notification(item.id);
  end loop;
  return affected;
end;
$$;

revoke all on function public.refresh_working_time_notifications(date) from public, anon;
grant execute on function public.refresh_working_time_notifications(date) to authenticated;

-- Backfill current non-conformities for existing management recipients.
do $$
declare item record;
begin
  for item in
    select calculation.id
    from public.working_time_calculation_windows calculation
    where calculation.is_compliant is false
  loop
    perform public.working_time_queue_non_compliance_notification(item.id);
  end loop;
end;
$$;

comment on function public.refresh_working_time_notifications(date) is
  'Requeues idempotent monthly work/rest non-compliance alerts for Admin, Direction and Armement recipients.';
