create or replace function public.audit_fleet_certificate_finding()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  followup_note text := nullif(current_setting('seapilot.finding_followup_note', true), '');
begin
  if tg_op = 'INSERT' then
    insert into public.fleet_certificate_finding_events (
      company_id, finding_id, event_type, to_status, note, created_by
    ) values (
      new.company_id, new.id, 'created', new.status, 'Écart créé', auth.uid()
    );
    return new;
  end if;

  if old.responsible_person_id is distinct from new.responsible_person_id
    or old.responsible_name is distinct from new.responsible_name then
    insert into public.fleet_certificate_finding_events (
      company_id, finding_id, event_type, from_status, to_status, note, created_by
    ) values (
      new.company_id, new.id, 'assigned', old.status, new.status,
      'Responsable : ' || new.responsible_name, auth.uid()
    );
  end if;

  if old.status is distinct from new.status then
    insert into public.fleet_certificate_finding_events (
      company_id, finding_id, event_type, from_status, to_status, note, created_by
    ) values (
      new.company_id, new.id,
      case when new.status = 'closed' then 'validated' else 'status_changed' end,
      old.status, new.status, 'État mis à jour', auth.uid()
    );
  elsif old.progress is distinct from new.progress then
    insert into public.fleet_certificate_finding_events (
      company_id, finding_id, event_type, from_status, to_status, note, created_by
    ) values (
      new.company_id, new.id, 'progress_updated', old.status, new.status,
      'Avancement : ' || new.progress::text || ' %'
        || case when followup_note is null then '' else ' — ' || followup_note end,
      auth.uid()
    );
  end if;

  return new;
end;
$$;

revoke all on function public.audit_fleet_certificate_finding() from public, anon, authenticated;

create or replace function public.save_fleet_certificate_finding_followup(
  p_finding_id bigint,
  p_progress integer,
  p_note text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  finding_company_id bigint;
  current_progress integer;
  normalized_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_progress < 0 or p_progress > 100 then
    raise exception using errcode = '22023', message = 'L’avancement doit être compris entre 0 et 100.';
  end if;

  select finding.company_id, finding.progress
  into finding_company_id, current_progress
  from public.fleet_certificate_findings finding
  where finding.id = p_finding_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Écart introuvable ou inaccessible.';
  end if;

  if current_progress is distinct from p_progress then
    perform set_config('seapilot.finding_followup_note', coalesce(normalized_note, ''), true);

    update public.fleet_certificate_findings finding
    set progress = p_progress
    where finding.id = p_finding_id;
  elsif normalized_note is not null then
    insert into public.fleet_certificate_finding_events (
      company_id,
      finding_id,
      event_type,
      note,
      created_by
    ) values (
      finding_company_id,
      p_finding_id,
      'commented',
      normalized_note,
      auth.uid()
    );
  end if;
end;
$$;

revoke all on function public.save_fleet_certificate_finding_followup(bigint, integer, text)
  from public, anon, authenticated;
grant execute on function public.save_fleet_certificate_finding_followup(bigint, integer, text)
  to authenticated;

comment on function public.save_fleet_certificate_finding_followup(bigint, integer, text) is
  'Enregistre en une transaction un changement d’avancement et sa note dans un événement d’historique unique.';
