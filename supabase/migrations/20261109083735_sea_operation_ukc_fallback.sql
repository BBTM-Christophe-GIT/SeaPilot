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
  fallback jsonb;
begin
  -- Administrative revisions start as exact copies of the signed declaration.
  if tg_op = 'INSERT' and sea_operation_private.is_admin_revision_clone(new) then return new; end if;
  canonical := sea_operation_private.copernicus_number(new.draft#>'{vessel,draftMeters}');
  signing_go := new.status = 'signed' and new.draft->>'decision' = 'GO';

  for point in select value from jsonb_array_elements(new.draft->'waypoints') loop
    original_point := point;
    if point ? 'ukcMode' and (jsonb_typeof(point->'ukcMode') is distinct from 'string'
      or point->>'ukcMode' not in ('manual','automatic')) then
      raise exception 'Mode UKC invalide.' using errcode = '22023';
    end if;
    mode := coalesce(point->>'ukcMode','manual');
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
      if stale then
        if signing_go then raise exception 'Recalculez l’UKC automatique avant de signer.' using errcode = '22023'; end if;
        point := point - 'ukcForecast';
      end if;
    end if;

    -- A numeric marker opts in to the theoretical depth. The canonical draught
    -- determines the value independently of the client and of provider evidence.
    fallback := null;
    if mode = 'automatic' and point#>>'{ukcForecast,status}' is distinct from 'available'
      and canonical > 0 and canonical <= 50 and jsonb_typeof(point->'ukcFallbackMeters') = 'number' then
      fallback := to_jsonb(canonical + 5);
      point := jsonb_set(point, '{ukcFallbackMeters}', fallback);
    else
      point := point - 'ukcFallbackMeters';
    end if;

    if signing_go and mode = 'automatic' and point#>>'{ukcForecast,status}' is distinct from 'available'
      and fallback is null then
      raise exception 'Recalculez l’UKC automatique avant de signer.' using errcode = '22023';
    end if;
    changed := changed or point is distinct from original_point;
    points := points || jsonb_build_array(point);
  end loop;
  if changed then new.draft := jsonb_set(new.draft,'{waypoints}',points); end if;
  return new;
end;
$$;

comment on function sea_operation_private.guard_copernicus_captures() is
  'Validates same-product UKC evidence and canonicalizes optional theoretical fallback depth separately. Signed declarations are immutable. SeaPilot excludes model depths <=10m.';
