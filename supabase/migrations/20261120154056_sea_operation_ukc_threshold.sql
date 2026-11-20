-- Derive the display threshold after the vessel's reference draught is frozen.
-- Historical signed declarations and their exact administrative clones remain intact.
create or replace function sea_operation_private.guard_copernicus_captures() returns trigger
language plpgsql set search_path = '' as $$
declare
  point jsonb;
  original_point jsonb;
  points jsonb := '[]'::jsonb;
  capture jsonb;
  latitude numeric;
  longitude numeric;
  eta timestamptz;
  canonical numeric;
  stale boolean;
  changed boolean := false;
  mode text;
  signing_go boolean;
begin
  if tg_op = 'INSERT' and sea_operation_private.is_admin_revision_clone(new) then return new; end if;
  canonical := sea_operation_private.copernicus_number(new.draft#>'{vessel,draftMeters}');
  signing_go := new.status = 'signed' and new.draft->>'decision' = 'GO';

  for point in select value from jsonb_array_elements(new.draft->'waypoints') loop
    original_point := point;
    if point ? 'ukcMode' and (jsonb_typeof(point->'ukcMode') is distinct from 'string'
      or point->>'ukcMode' not in ('manual','automatic')) then
      raise exception 'Mode UKC invalide.' using errcode = '22023';
    end if;
    mode := coalesce(point->>'ukcMode','automatic');
    point := jsonb_set(point, '{ukcMode}', to_jsonb(mode)) - array['ukcFallbackMeters','ukcThresholdMeters'];
    if mode = 'manual' then
      point := point - 'ukcForecast';
    elsif point ? 'ukcForecast' then
      capture := point->'ukcForecast';
      perform sea_operation_private.validate_copernicus_capture(capture);
      latitude := sea_operation_private.capture_coordinate(point->>'latitude','latitude');
      longitude := sea_operation_private.capture_coordinate(point->>'longitude','longitude');
      eta := sea_operation_private.capture_eta_utc(point->>'eta');
      stale := canonical is null or latitude is null or longitude is null or eta is null
        or capture->>'projectId' is distinct from (case when new.draft ? 'transit' then '' else new.draft#>>'{planning,projectId}' end)
        or capture->'transit' is distinct from (case when new.draft ? 'transit' then
          jsonb_build_object('date',new.draft#>>'{transit,date}','vesselId',new.vessel_id::text) end)
        or capture->>'vesselId' is distinct from new.vessel_id::text
        or capture->>'pointId' is distinct from point->>'id'
        or abs((capture->>'latitude')::numeric-latitude) > 0.00000001
        or abs((capture->>'longitude')::numeric-longitude) > 0.00000001
        or (capture->>'draftMeters')::numeric is distinct from canonical
        or sea_operation_private.capture_timestamp(capture->'etaUtc') is distinct from eta;
      if stale then point := point - 'ukcForecast'; end if;
    end if;

    if mode = 'automatic' and point#>>'{ukcForecast,status}' is distinct from 'available' then
      if canonical > 0 and canonical <= 50 then
        point := jsonb_set(point, '{ukcThresholdMeters}', to_jsonb(canonical + 3));
      elsif signing_go then
        raise exception 'Renseignez le tirant d’eau du navire ou saisissez l’UKC manuellement.' using errcode = '22023';
      end if;
    end if;
    changed := changed or point is distinct from original_point;
    points := points || jsonb_build_array(point);
  end loop;
  if changed then new.draft := jsonb_set(new.draft,'{waypoints}',points); end if;
  return new;
end;
$$;

comment on function sea_operation_private.guard_copernicus_captures() is
  'Validates UKC captures and derives the separate indicative threshold (canonical draught + 3 m) when an estimate is unavailable. Signed declarations are immutable.';

-- Apply the same default when signing drafts saved before the mode existed.
-- Preserve the required UKC text for points explicitly set to manual.
do $migration$
declare
  definition text := pg_get_functiondef('sea_operation_private.validate_draft(jsonb,boolean)'::regprocedure);
  needle text := 'coalesce(item->>''ukcMode'',''manual'')';
begin
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1 then
    raise exception 'Expected passage-plan UKC mode default.';
  end if;
  execute replace(definition, needle, 'coalesce(item->>''ukcMode'',''automatic'')');
end;
$migration$;
