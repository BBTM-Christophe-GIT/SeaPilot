-- Retain only the six declared visual symbols on isolated points. No business
-- rows, planning identities, route waypoints or signed snapshots are rewritten.
create function project_location_private.waypoint(p_value jsonb,p_isolated boolean) returns jsonb
language plpgsql immutable security invoker set search_path='' as $$
declare result jsonb;
begin
  if p_isolated is not true then return project_location_private.waypoint(p_value); end if;
  if p_value ? 'isolatedPointIcon' and (jsonb_typeof(p_value->'isolatedPointIcon') is distinct from 'string'
    or p_value->>'isolatedPointIcon' not in ('buoy','pin','platform','wind-farm','mooring','anchor')) then
    raise exception 'Icône de point isolé invalide.' using errcode='22023'; end if;
  result:=project_location_private.waypoint(p_value-'isolatedPointIcon');
  if p_value ? 'isolatedPointIcon' then result:=result||jsonb_build_object('isolatedPointIcon',p_value->'isolatedPointIcon'); end if;
  return result;
end;
$$;
revoke all on function project_location_private.waypoint(jsonb,boolean) from public,anon,authenticated,service_role;
grant execute on function project_location_private.waypoint(jsonb,boolean) to authenticated;

do $migration$
declare definition text; needle text; replacement text; anchor integer;
begin
  definition:=replace(pg_get_functiondef('project_location_private.waypoint(jsonb)'::regprocedure),E'\r\n',E'\n');
  needle:=E'\nbegin\n'; anchor:=position(needle in definition);
  if anchor=0 then raise exception 'Expected location waypoint entry point.'; end if;
  replacement:=E'  if p_value ? ''isolatedPointIcon'' then raise exception ''Les icônes sont réservées aux points isolés.'' using errcode=''22023''; end if;\n';
  execute left(definition,anchor+length(needle)-1)||replacement||substr(definition,anchor+length(needle));

  definition:=replace(pg_get_functiondef('project_location_private.normalize_plan(jsonb,boolean)'::regprocedure),E'\r\n',E'\n');
  needle:='project_location_private.waypoint(item)';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected location waypoint normalization anchor.'; end if;
  definition:=replace(definition,needle,'project_location_private.waypoint(item,field=''points'')');
  needle:='if field = ''zones'' then';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected location zone anchor.'; end if;
  definition:=replace(definition,needle,needle||E'\n        if item ? ''isolatedPointIcon'' then raise exception ''Les icônes sont réservées aux points isolés.'' using errcode=''22023''; end if;');
  needle:='if jsonb_typeof(vertex) is distinct from ''object'' then';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected location vertex anchor.'; end if;
  execute replace(definition,needle,E'if vertex ? ''isolatedPointIcon'' then raise exception ''Les icônes sont réservées aux points isolés.'' using errcode=''22023''; end if;\n          '||needle);

  definition:=replace(pg_get_functiondef('project_location_private.validate_overlay(jsonb,jsonb)'::regprocedure),E'\r\n',E'\n');
  needle:='  canonical := project_location_private.normalize_plan';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected overlay normalization anchor.'; end if;
  execute replace(definition,needle,E'  if exists(select from jsonb_array_elements(p_waypoints) point where point ? ''isolatedPointIcon'') then\n    raise exception ''Les icônes sont réservées aux points isolés.'' using errcode=''22023''; end if;\n'||needle);

  definition:=replace(pg_get_functiondef('sea_operation_private.validate_draft(jsonb,boolean)'::regprocedure),E'\r\n',E'\n');
  needle:='if jsonb_typeof(item) is distinct from ''object'' or jsonb_typeof(item->''denseTraffic'') is distinct from ''boolean'' then';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected operation route waypoint validation anchor.'; end if;
  execute replace(definition,needle,E'if item ? ''isolatedPointIcon'' then raise exception ''Les icônes sont réservées aux points isolés.'' using errcode=''22023''; end if;\n    '||needle);
end;
$migration$;
notify pgrst,'reload schema';
