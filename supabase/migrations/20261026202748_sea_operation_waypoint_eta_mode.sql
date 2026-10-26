-- ETA provenance is optional: existing declarations retain their original JSON.
-- The client may prefill an ETA, but the Captain still validates the stored time.
do $migration$
declare
  definition text := pg_get_functiondef('sea_operation_private.validate_draft(jsonb,boolean)'::regprocedure);
  needle text := 'foreach key in array array[''id'',''number'',''descriptionVhf'',''latitude'',''longitude'',''ukc'',''eta''] loop';
  guard text := $guard$if item ? 'etaMode' and (jsonb_typeof(item->'etaMode') is distinct from 'string'
      or item->>'etaMode' not in ('automatic','manual')) then
      raise exception 'Mode ETA du point de passage invalide.' using errcode = '22023';
    end if;
    $guard$;
begin
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1 then
    raise exception 'Expected sea-operation waypoint shape guard missing or ambiguous';
  end if;
  execute replace(definition,needle,guard||needle);
end;
$migration$;
notify pgrst,'reload schema';
