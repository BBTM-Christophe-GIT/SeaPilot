-- Optional manual map framing is part of each retained snapshot, never live state.
create function sea_operation_private.validate_map_viewport(p_value jsonb) returns void
language plpgsql immutable security invoker set search_path='' as $$
declare field text; value numeric;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or not (p_value ?& array['centerLatitude','centerLongitude','longitudeSpan']) then
    raise exception 'Cadrage de carte invalide.' using errcode='22023'; end if;
  if p_value-array['centerLatitude','centerLongitude','longitudeSpan']<>'{}'::jsonb then
    raise exception 'Cadrage de carte invalide.' using errcode='22023'; end if;
  foreach field in array array['centerLatitude','centerLongitude','longitudeSpan'] loop
    if jsonb_typeof(p_value->field) is distinct from 'number' then raise exception 'Cadrage de carte invalide.' using errcode='22023'; end if;
    value:=(p_value->>field)::numeric;
    if (field='centerLatitude' and value not between -90 and 90)
      or (field='centerLongitude' and value not between -180 and 180)
      or (field='longitudeSpan' and value not between 0.02 and 360) then
      raise exception 'Cadrage de carte hors limites.' using errcode='22023'; end if;
  end loop;
end;
$$;
revoke all on function sea_operation_private.validate_map_viewport(jsonb) from public,anon,authenticated,service_role;
grant execute on function sea_operation_private.validate_map_viewport(jsonb) to authenticated;

-- Preserve existing canonicalization, limits, RPC permissions and signature guards.
do $migration$
declare definition text; needle text; replacement text; anchor integer;
begin
  definition:=replace(pg_get_functiondef('project_location_private.normalize_plan(jsonb,boolean)'::regprocedure),E'\r\n',E'\n');
  needle:='  foreach field in array array[''waypoints'',''points'',''zones''] loop';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected project location collections anchor.'; end if;
  replacement:=E'  if p_value ? ''mapViewport'' then\n'
    ||E'    perform sea_operation_private.validate_map_viewport(p_value->''mapViewport'');\n'
    ||E'    result:=result||jsonb_build_object(''mapViewport'',p_value->''mapViewport'');\n'
    ||E'  end if;\n';
  execute replace(definition,needle,replacement||needle);

  definition:=replace(pg_get_functiondef('project_location_private.validate_overlay(jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
  needle:=E'\nbegin\n'; anchor:=position(needle in definition);
  if anchor=0 then raise exception 'Expected overlay validation entry point.'; end if;
  replacement:=E'  if p_overlay ? ''mapViewport'' then raise exception ''Le cadrage est distinct des géométries complémentaires.'' using errcode=''22023''; end if;\n';
  execute left(definition,anchor+length(needle)-1)||replacement||substr(definition,anchor+length(needle));

  definition:=replace(pg_get_functiondef('sea_operation_private.validate_draft(jsonb,boolean)'::regprocedure),E'\r\n',E'\n');
  needle:=E'\nbegin\n'; anchor:=position(needle in definition);
  if anchor=0 then raise exception 'Expected operation validation entry point.'; end if;
  replacement:=E'  if p_draft ? ''mapViewport'' then perform sea_operation_private.validate_map_viewport(p_draft->''mapViewport''); end if;\n';
  execute left(definition,anchor+length(needle)-1)||replacement||substr(definition,anchor+length(needle));
end;
$migration$;
notify pgrst,'reload schema';
