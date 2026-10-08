-- Decision notifications reuse the existing recipient/fingerprint uniqueness and RLS.
-- No historical decisions are replayed.
create or replace function public.planning_notify_absence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  decision_title text;
  decision_body text;
  person_name text;
begin
  -- Editing a decided request must not recreate or overwrite its decision notice.
  if tg_op = 'UPDATE' and new.absence_type = 'leave'
    and new.status in ('approved', 'rejected') and old.status = new.status then
    return new;
  end if;

  perform public.planning_queue_notification(new.company_id, 'absence', case when new.status = 'approved' then 'warning' else 'information' end,
    'Absence ' || new.status, new.absence_type || ' · du ' || new.starts_at::date::text || ' au ' || new.ends_at::date::text,
    'absence', new.id, new.person_id, null, (new.starts_at at time zone 'Europe/Paris')::date,
    'absence:' || new.id || ':' || new.status, false);

  if new.absence_type = 'leave' and new.status in ('approved', 'rejected') then
    select concat_ws(' ', person.first_name, person.last_name) into person_name
    from public.people person where person.id = new.person_id and person.company_id = new.company_id;
    decision_title := case new.status when 'approved' then 'Congés acceptés' else 'Congés refusés' end;
    decision_body := 'La demande de congés pour ' || coalesce(person_name, 'le marin')
      || ' du ' || to_char(new.starts_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI')
      || ' au ' || to_char(new.ends_at at time zone 'Europe/Paris', 'DD/MM/YYYY HH24:MI')
      || case new.status when 'approved' then ' a été acceptée.' else ' a été refusée.' end
      || case when nullif(btrim(new.review_comment), '') is not null
        then E'\nCommentaire : ' || btrim(new.review_comment) else '' end;

    insert into public.planning_notifications (
      company_id, recipient_user_id, notification_type, severity, title, body,
      entity_kind, entity_id, person_id, due_on, fingerprint
    ) values (
      new.company_id, new.requested_by, 'absence',
      case new.status when 'approved' then 'information' else 'warning' end,
      decision_title, left(decision_body, 2000), 'absence_decision', new.id, new.person_id,
      (new.starts_at at time zone 'Europe/Paris')::date, 'absence:' || new.id || ':' || new.status
    ) on conflict (company_id, recipient_user_id, fingerprint) do update set
      title = excluded.title, body = excluded.body, severity = excluded.severity,
      entity_kind = excluded.entity_kind, entity_id = excluded.entity_id,
      person_id = excluded.person_id, due_on = excluded.due_on,
      read_at = null, created_at = now();
  end if;
  return new;
end;
$$;

revoke all on function public.planning_notify_absence() from public, anon, authenticated;
