-- These global operational dictionaries are read by signed-in DPR/QHSE users.
-- Keep the existing office roles able to maintain them and technical imports
-- able to upsert references; remove all anonymous and TRUNCATE privileges.
do $catalogues$
declare table_name text;
begin
  foreach table_name in array array['emergency_exercise_types','port_call_reason_types','waste_types'] loop
    execute format('alter table public.%I enable row level security',table_name);
    execute format('revoke all on table public.%I from public,anon,authenticated',table_name);
    execute format('grant select,insert,update,delete on table public.%I to authenticated,service_role',table_name);
    execute format('create policy %I on public.%I for select to authenticated using (true)',table_name||'_authenticated_read',table_name);
    execute format('create policy %I on public.%I for all to authenticated using (public.has_company_role(public.current_planning_company_id(),array[''admin'',''direction'',''armement''])) with check (public.has_company_role(public.current_planning_company_id(),array[''admin'',''direction'',''armement'']))',table_name||'_office_write',table_name);
  end loop;
end $catalogues$;

-- The legacy resolvers span shared import tables, some without company_id.
-- Their only real callers are technical CLI imports. Do not claim tenant
-- isolation on those legacy tables: restrict execution to the importer role,
-- retain linked SQL under postgres, and remove SECURITY DEFINER/RLS bypass.
do $resolvers$
declare
  signature text;
  definition text;
  marker text:=E'\nbegin\n';
  guard text:=E'  if current_user not in (''postgres'',''service_role'') then\n    raise exception ''SHAREPOINT_IMPORT_PERMISSION_DENIED: technical importer required.'' using errcode=''42501'';\n  end if;\n';
begin
  foreach signature in array array[
    'public.resolve_sharepoint_document_links()',
    'public.resolve_sharepoint_hr_document_links()',
    'public.resolve_sharepoint_planning_links()'
  ] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if (length(definition)-length(replace(definition,marker,'')))/length(marker)<>1 then
      raise exception 'Unexpected legacy resolver structure: %',signature;
    end if;
    execute replace(definition,marker,marker||guard);
    execute format('alter function %s security invoker',signature);
    execute format('alter function %s set search_path = %L',signature,'');
    execute format('revoke all on function %s from public,anon,authenticated',signature);
    execute format('grant execute on function %s to service_role',signature);
    execute format('comment on function %s is %L',signature,'Technical SharePoint import only: service_role API or trusted postgres linked SQL; invoker rights, no interactive/anonymous access.');
  end loop;
end $resolvers$;

notify pgrst,'reload schema';
