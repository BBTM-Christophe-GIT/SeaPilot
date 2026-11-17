create function sea_operation_private.validate_waypoint_provenance(p_draft jsonb) returns void
language plpgsql stable set search_path = '' as $$
declare
  point jsonb;
  weather jsonb;
  component jsonb;
  grid jsonb;
  model jsonb;
  ukc jsonb;
  field text;
  value numeric;
begin
  if jsonb_typeof(p_draft->'waypoints') is distinct from 'array' then return; end if;

  for point in select entry from jsonb_array_elements(p_draft->'waypoints') as x(entry) loop
    ukc := point->'ukcForecast';
    if ukc ? 'reasonCode' and (ukc->>'status' is distinct from 'unavailable'
      or jsonb_typeof(ukc->'reasonCode') is distinct from 'string'
      or ukc->>'reasonCode' not in ('outside-horizon','outside-coverage','land-cell','missing-depth','missing-water-level',
        'unconfirmed-datum','incompatible-grid','incompatible-metadata','shallow-water','past-eta')) then
      raise exception 'Motif d’indisponibilité UKC invalide.' using errcode = '22023';
    end if;
    if ukc ? 'cellPosition' then
      grid := ukc->'cellPosition';
      if ukc->>'status' is distinct from 'unavailable' or jsonb_typeof(grid) is distinct from 'object'
        or jsonb_typeof(grid->'latitude') is distinct from 'number' or jsonb_typeof(grid->'longitude') is distinct from 'number'
        or abs((grid->>'latitude')::numeric) > 90 or abs((grid->>'longitude')::numeric) > 180 then
        raise exception 'Position de maille UKC invalide.' using errcode = '22023';
      end if;
    end if;

    weather := point->'weather';
    model := weather->'model';
    if (model ? 'product' and (jsonb_typeof(model->'product') is distinct from 'string'
        or length(model->>'product') not between 1 and 120))
      or (model ? 'validTime' and sea_operation_private.capture_timestamp(model->'validTime') is null)
      or (model ? 'selection' and (jsonb_typeof(model->'selection') is distinct from 'string'
        or model->>'selection' not in ('nearest','marine-fallback')))
      or (model ? 'distanceKm' and (jsonb_typeof(model->'distanceKm') is distinct from 'number'
        or (model->>'distanceKm')::numeric not between 0 and 10)) then
      raise exception 'Provenance du modèle météo invalide.' using errcode = '22023';
    end if;

    if weather ? 'seaState' then
      component := weather->'seaState';
      if jsonb_typeof(component) is distinct from 'object' or component->>'component' is distinct from 'total'
        or sea_operation_private.capture_timestamp(component->'time') is null then
        raise exception 'État de mer total invalide.' using errcode = '22023';
      end if;
      foreach field in array array['heightMeters','periodSeconds','directionDegrees'] loop
        if component->field = 'null'::jsonb then continue; end if;
        if jsonb_typeof(component->field) is distinct from 'number' then
          raise exception 'État de mer total invalide.' using errcode = '22023';
        end if;
        value := (component->>field)::numeric;
        if value < 0 or value > (case when field = 'directionDegrees' then 360 else 1.7976931348623157e308 end) then
          raise exception 'État de mer total invalide.' using errcode = '22023';
        end if;
      end loop;
    end if;

    foreach field in array array['wind','waves','seaState'] loop
      component := weather->field;
      if field <> 'wind' and component ? 'periodKind' and
        (jsonb_typeof(component->'periodKind') is distinct from 'string' or component->>'periodKind' not in ('mean','peak')) then
        raise exception 'Type de période météo invalide.' using errcode = '22023';
      end if;
      if component ? 'grid' then
        grid := component->'grid';
        if jsonb_typeof(grid) is distinct from 'object'
          or jsonb_typeof(grid->'latitude') is distinct from 'number'
          or jsonb_typeof(grid->'longitude') is distinct from 'number'
          or jsonb_typeof(grid->'distanceKm') is distinct from 'number'
          or abs((grid->>'latitude')::numeric) > 90 or abs((grid->>'longitude')::numeric) > 180
          or (grid->>'distanceKm')::numeric not between 0 and (case when field = 'wind' then 20016 else 10 end) then
          raise exception 'Maille de prévision météo invalide.' using errcode = '22023';
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function sea_operation_private.guard_waypoint_captures() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform sea_operation_private.validate_waypoint_captures(new.draft);
  perform sea_operation_private.validate_waypoint_provenance(new.draft);
  return new;
end;
$$;

revoke all on function sea_operation_private.validate_waypoint_provenance(jsonb) from public, anon, authenticated;
grant execute on function sea_operation_private.validate_waypoint_provenance(jsonb) to authenticated;
