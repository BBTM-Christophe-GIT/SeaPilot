-- The client keeps this live concurrency snapshot outside the signed draft.
-- Read the link from the stored operation, never from a caller-supplied composite.
create or replace function sea_operation_private.record_json(p_record public.sea_operations) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare administration sea_operation_private.record_administration; previous_id uuid; project_ports jsonb;
begin
  if not coalesce(sea_operation_private.can_read(p_record.company_id),false) or sea_operation_private.record_is_deleted(p_record.id)
    or not exists(select 1 from public.sea_operations where id=p_record.id and company_id=p_record.company_id) then
    raise exception 'Opération inaccessible.' using errcode='42501'; end if;
  select * into administration from sea_operation_private.record_administration where operation_id=p_record.id;
  select operation_id into previous_id from sea_operation_private.record_administration where superseded_by_id=p_record.id;
  select jsonb_build_object('projectId',project.id::text,'departurePort',coalesce(project.delivery_port,''),'arrivalPort',coalesce(project.redelivery_port,''))
    into project_ports from public.sea_operations operation
    join public.projects project on project.id::text=operation.draft#>>'{planning,projectId}' and project.company_id=operation.company_id
    where operation.id=p_record.id and operation.company_id=p_record.company_id and operation.status='draft'
      and project.archived_at is null and sea_operation_private.record_is_current(operation.id);
  return to_jsonb(p_record)||jsonb_build_object('can_edit',sea_operation_private.can_edit(p_record),
    'can_sign',sea_operation_private.can_sign_record(p_record),
    'can_revise',p_record.status='signed' and sea_operation_private.record_is_current(p_record.id) and sea_operation_private.can_admin(p_record.company_id),
    'can_delete',sea_operation_private.record_is_current(p_record.id) and sea_operation_private.can_admin(p_record.company_id),
    'previous_revision_id',previous_id,'superseded_by_id',administration.superseded_by_id,'project_ports',project_ports);
end;
$$;

-- Keep the legacy save RPC unchanged. A separate name is unambiguous to
-- PostgREST and old clients cannot silently start changing their linked project.
create or replace function sea_operation_private.save_with_project_ports(p_id uuid,p_version integer,p_draft jsonb,p_project_ports jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare company bigint:=sea_operation_private.company_id(); previous public.sea_operations; project public.projects;
  result jsonb; target_project bigint; key text; departure text; arrival text; base_departure text; base_arrival text;
  change_departure boolean; change_arrival boolean; same_project boolean;
begin
  if (select auth.uid()) is null or not coalesce(sea_operation_private.can_read(company),false) then
    raise exception 'Accès refusé aux opérations en mer.' using errcode='42501'; end if;
  -- The lock/order and checks match the original writer. The old stored draft is
  -- used only after its company, permissions and optimistic version are checked.
  if p_id is not null then
    select operation.* into previous from public.sea_operations operation where operation.id=p_id and operation.company_id=company for update;
    if previous.id is null or not coalesce(sea_operation_private.can_edit(previous),false) then
      raise exception 'Modification de cette opération refusée.' using errcode='42501'; end if;
    if p_version is distinct from previous.version then
      raise exception 'L’opération a été modifiée. Rechargez-la avant de continuer.' using errcode='40001'; end if;
  end if;
  -- All existing payload/planning/captain/signature/UKC guards still run. Any
  -- later project conflict rolls this save back in the same RPC transaction.
  result:=sea_operation_private.save(p_id,p_version,p_draft);
  if p_project_ports is null then return result; end if;
  if jsonb_typeof(p_project_ports) is distinct from 'object'
    or p_project_ports-array['projectId','departurePort','arrivalPort']<>'{}'::jsonb then
    raise exception 'Référence des ports du projet invalide.' using errcode='22023'; end if;
  foreach key in array array['projectId','departurePort','arrivalPort'] loop
    if jsonb_typeof(p_project_ports->key) is distinct from 'string' then
      raise exception 'Référence des ports du projet invalide.' using errcode='22023'; end if;
  end loop;
  target_project:=sea_operation_private.preparation_id(result#>>'{draft,planning,projectId}');
  if target_project is null or p_project_ports->>'projectId' is distinct from target_project::text then
    raise exception 'La référence des ports doit correspondre au projet de l’opération.' using errcode='22023'; end if;
  select item.* into project from public.projects item where item.id=target_project and item.company_id=company for update;
  if project.id is null then raise exception 'Projet inaccessible.' using errcode='42501'; end if;
  if project.archived_at is not null then raise exception 'Un projet archivé ne peut pas être modifié.' using errcode='55000'; end if;
  departure:=nullif(btrim(result#>>'{draft,vessel,departurePort}'),'');
  arrival:=nullif(btrim(result#>>'{draft,vessel,arrivalPort}'),'');
  base_departure:=nullif(btrim(p_project_ports->>'departurePort'),'');
  base_arrival:=nullif(btrim(p_project_ports->>'arrivalPort'),'');
  same_project:=previous.id is not null and previous.draft#>>'{planning,projectId}'=target_project::text;
  change_departure:=departure is distinct from case when same_project then nullif(btrim(previous.draft#>>'{vessel,departurePort}'),'') else base_departure end;
  change_arrival:=arrival is distinct from case when same_project then nullif(btrim(previous.draft#>>'{vessel,arrivalPort}'),'') else base_arrival end;
  -- Compare only fields intentionally edited in this operation. An unrelated
  -- project edit or its other port may have advanced without causing a conflict.
  if change_departure and nullif(btrim(project.delivery_port),'') is distinct from base_departure
    and nullif(btrim(project.delivery_port),'') is distinct from departure then
    raise exception 'Le port de départ du projet a été modifié. Rechargez la fiche avant de continuer.' using errcode='40001'; end if;
  if change_arrival and nullif(btrim(project.redelivery_port),'') is distinct from base_arrival
    and nullif(btrim(project.redelivery_port),'') is distinct from arrival then
    raise exception 'Le port d’arrivée du projet a été modifié. Rechargez la fiche avant de continuer.' using errcode='40001'; end if;
  if change_departure and project.delivery_port is distinct from departure or change_arrival and project.redelivery_port is distinct from arrival then
    -- Existing touch/audit triggers retain actor, timestamp and before/after
    -- values. No commercial fields, planning rows or source snapshots are edited.
    update public.projects item set delivery_port=case when change_departure then departure else item.delivery_port end,
      redelivery_port=case when change_arrival then arrival else item.redelivery_port end,updated_by=(select auth.uid())
      where item.id=target_project and item.company_id=company;
  end if;
  return sea_operation_private.detail((result->>'id')::uuid);
end;
$$;
create or replace function public.sea_operation_save_with_project_ports(p_id uuid,p_version integer,p_draft jsonb,p_project_ports jsonb) returns jsonb
language sql security invoker set search_path='' as $$select sea_operation_private.save_with_project_ports(p_id,p_version,p_draft,p_project_ports);$$;
revoke all on function sea_operation_private.save_with_project_ports(uuid,integer,jsonb,jsonb),
  public.sea_operation_save_with_project_ports(uuid,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function sea_operation_private.save_with_project_ports(uuid,integer,jsonb,jsonb),
  public.sea_operation_save_with_project_ports(uuid,integer,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
