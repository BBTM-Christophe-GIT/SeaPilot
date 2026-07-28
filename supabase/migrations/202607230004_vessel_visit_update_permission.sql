create or replace function public.save_vessel_visit(
  p_visit_id bigint,
  p_vessel_id bigint,
  p_visit_type text,
  p_provider_id bigint,
  p_comments text,
  p_scheduled_at timestamptz[]
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_company_id bigint;
  target_id bigint;
  existing_visit public.vessel_visits%rowtype;
  provider_company_id bigint;
  occurrence_at timestamptz;
  occurrence_count integer;
  first_date date;
  last_date date;
  existing_first_date date;
  existing_last_date date;
  action_name text;
begin
  select company_id into target_company_id from public.vessels where id = p_vessel_id;
  select company_id into provider_company_id from public.service_providers where id = p_provider_id and active;
  occurrence_count := coalesce(array_length(p_scheduled_at, 1), 0);

  if target_company_id is null
    or provider_company_id is distinct from target_company_id
    or p_visit_type not in (
      'water_analysis', 'client_audit', 'imca_audit', 'internal_audit', 'anfr_visit',
      'annual_maritime_affairs', 'annual_classification_society', 'davits_visit',
      'crane_visit', 'fire_visit', 'qhse_visit'
    )
    or occurrence_count not between 1 and 10
    or exists (select 1 from unnest(p_scheduled_at) value where value is null)
    or length(coalesce(p_comments, '')) > 2000 then
    raise exception using errcode = '22023', message = 'PLANNING_VISIT_INVALID';
  end if;

  select min((value at time zone 'Europe/Paris')::date),
         max((value at time zone 'Europe/Paris')::date)
  into first_date, last_date
  from unnest(p_scheduled_at) value;

  if not public.planning_user_can('edit_event', target_company_id, p_vessel_id, first_date, last_date) then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: visite ou audit.';
  end if;

  if p_visit_id is not null then
    select * into existing_visit
    from public.vessel_visits
    where id = p_visit_id and company_id = target_company_id
    for update;

    if existing_visit.id is null then
      raise exception using errcode = 'P0002', message = 'PLANNING_VISIT_NOT_FOUND';
    end if;

    select min((occurrence.scheduled_at at time zone 'Europe/Paris')::date),
           max((occurrence.scheduled_at at time zone 'Europe/Paris')::date)
    into existing_first_date, existing_last_date
    from public.vessel_visit_occurrences occurrence
    where occurrence.visit_id = existing_visit.id;

    if not public.planning_user_can(
      'edit_event',
      existing_visit.company_id,
      existing_visit.vessel_id,
      existing_first_date,
      existing_last_date
    ) then
      raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: visite ou audit existant.';
    end if;
  end if;

  if p_visit_id is null then
    insert into public.vessel_visits (
      company_id, vessel_id, visit_type, provider_id, comments
    ) values (
      target_company_id, p_vessel_id, p_visit_type, p_provider_id, trim(coalesce(p_comments, ''))
    )
    returning id into target_id;
    action_name := 'create';
  else
    update public.vessel_visits
    set vessel_id = p_vessel_id,
        visit_type = p_visit_type,
        provider_id = p_provider_id,
        comments = trim(coalesce(p_comments, '')),
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_visit_id
    returning id into target_id;
    delete from public.vessel_visit_occurrences where visit_id = target_id;
    action_name := 'update';
  end if;

  foreach occurrence_at in array p_scheduled_at loop
    insert into public.vessel_visit_occurrences (company_id, visit_id, scheduled_at)
    values (target_company_id, target_id, occurrence_at);
  end loop;

  insert into public.planning_change_log (
    company_id, entity_kind, entity_id, action, payload, changed_by, changed_by_name,
    vessel_id, starts_on, ends_on, summary
  )
  values (
    target_company_id, 'vessel_visit', target_id, action_name,
    jsonb_build_object(
      'visit', (select to_jsonb(visit) from public.vessel_visits visit where visit.id = target_id),
      'occurrences', (select jsonb_agg(to_jsonb(occurrence) order by occurrence.scheduled_at)
                      from public.vessel_visit_occurrences occurrence where occurrence.visit_id = target_id)
    ),
    auth.uid(), public.planning_current_actor_name(), p_vessel_id, first_date, last_date,
    case when action_name = 'create' then 'Visite / Audit créé' else 'Visite / Audit mis à jour' end
  );

  return target_id;
end;
$$;

revoke all on function public.save_vessel_visit(bigint, bigint, text, bigint, text, timestamptz[]) from public, anon;
grant execute on function public.save_vessel_visit(bigint, bigint, text, bigint, text, timestamptz[]) to authenticated;
