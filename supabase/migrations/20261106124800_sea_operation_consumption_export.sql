create function sea_operation_private.consumption_export(p_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  company bigint := sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company), false) then
    raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501';
  end if;
  if p_ids is null or cardinality(p_ids) > 200 then
    raise exception 'Sélectionnez au plus 200 opérations par lot.' using errcode = '22023';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'operationId', operation.id,
      'record', reading.inputs || reading.results || jsonb_build_object(
        'version', reading.version,
        'updatedAt', reading.updated_at,
        'includedInReference', reading.included_in_reference
      )
    ) order by array_position(p_ids, operation.id))
    from public.sea_operations operation
    join sea_operation_private.consumption reading
      on reading.lineage_id = sea_operation_private.consumption_lineage(operation.id)
      and reading.company_id = operation.company_id and reading.vessel_id = operation.vessel_id
    where operation.id = any(p_ids) and operation.company_id = company
      and operation.status = 'signed' and operation.draft->>'decision' = 'GO'
      and sea_operation_private.record_is_current(operation.id)
  ), '[]'::jsonb);
end;
$$;

create function public.sea_operation_consumption_export(p_ids uuid[]) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sea_operation_private.consumption_export(p_ids);
$$;

revoke all on function sea_operation_private.consumption_export(uuid[]),
  public.sea_operation_consumption_export(uuid[]) from public, anon, authenticated, service_role;
grant execute on function sea_operation_private.consumption_export(uuid[]),
  public.sea_operation_consumption_export(uuid[]) to authenticated;

notify pgrst, 'reload schema';
