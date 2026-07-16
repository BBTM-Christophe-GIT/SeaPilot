-- Allow company administrators to permanently delete leave entries while
-- preserving an auditable snapshot of the deleted record.

create or replace function public.delete_planning_leave(p_absence_id bigint)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.planning_absences%rowtype;
  related_dependency public.planning_dependencies%rowtype;
begin
  if not public.has_role('admin') then
    raise exception using errcode = '42501', message = 'PLANNING_PERMISSION_DENIED: suppression des congés.';
  end if;

  select absence.*
  into target
  from public.planning_absences absence
  where absence.id = p_absence_id
    and absence.company_id = public.current_planning_company_id()
  for update;

  if target.id is null then
    raise exception using errcode = 'P0002', message = 'PLANNING_ABSENCE_NOT_FOUND';
  end if;

  if target.absence_type <> 'leave' then
    raise exception using errcode = '22023', message = 'PLANNING_DELETE_LEAVE_ONLY';
  end if;

  for related_dependency in
    select dependency.*
    from public.planning_dependencies dependency
    where dependency.company_id = target.company_id
      and (
        (dependency.predecessor_kind = 'absence' and dependency.predecessor_id = target.id)
        or (dependency.successor_kind = 'absence' and dependency.successor_id = target.id)
      )
    for update
  loop
    delete from public.planning_dependencies
    where id = related_dependency.id;

    insert into public.planning_change_log (
      company_id,
      entity_kind,
      entity_id,
      action,
      payload,
      changed_by,
      changed_by_name,
      vessel_id,
      starts_on,
      ends_on,
      summary
    )
    values (
      related_dependency.company_id,
      'dependency',
      related_dependency.id,
      'delete',
      to_jsonb(related_dependency),
      auth.uid(),
      public.planning_current_actor_name(),
      related_dependency.vessel_id,
      related_dependency.starts_on,
      related_dependency.ends_on,
      'Dépendance Planning supprimée avec les congés'
    );
  end loop;

  delete from public.planning_absences
  where id = target.id
    and company_id = target.company_id;

  insert into public.planning_change_log (
    company_id,
    entity_kind,
    entity_id,
    action,
    payload,
    changed_by,
    changed_by_name,
    starts_on,
    ends_on,
    summary
  )
  values (
    target.company_id,
    'absence',
    target.id,
    'delete',
    jsonb_build_object('before', to_jsonb(target), 'after', null),
    auth.uid(),
    public.planning_current_actor_name(),
    (target.starts_at at time zone 'Europe/Paris')::date,
    ((target.ends_at - interval '1 millisecond') at time zone 'Europe/Paris')::date,
    'Congés supprimés'
  );

  return target.id;
end;
$$;

revoke all on function public.delete_planning_leave(bigint) from public, anon;
grant execute on function public.delete_planning_leave(bigint) to authenticated;

comment on function public.delete_planning_leave(bigint) is
  'Permanently deletes a leave entry and its Planning dependencies for the active company; restricted to administrators and recorded in Planning history.';
