-- Optional waypoint captures remain preparation evidence. No historical row is rewritten.
-- Keep the existing RPC permissions, signing rules and signed-row freeze unchanged.
create function sea_operation_private.capture_coordinate(p_value text,p_axis text) returns numeric
language plpgsql immutable set search_path = '' as $coordinate$
declare
  value text := upper(replace(btrim(regexp_replace(p_value,U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]',' ','g')),',','.'));
  hemisphere text;
  raw text;
  markers text[];
  parts text[];
  degree numeric;
  minute numeric := 0;
  second numeric := 0;
  marker text;
  marker_index integer;
  marker_at integer;
begin
  if value is null or length(value) = 0 or length(value) > 80 or p_axis not in ('latitude','longitude') then return null; end if;
  select array_agg(match[1]) into markers from regexp_matches(value,'[NSEWO]','g') match;
  if coalesce(cardinality(markers),0) > 1 then return null; end if;
  hemisphere := markers[1];
  if hemisphere is not null and (not (hemisphere = any(case when p_axis = 'latitude' then array['N','S'] else array['E','W','O'] end))
    or value !~ ('^('||hemisphere||'[^NSEWO]+|[^NSEWO]+'||hemisphere||')$')) then return null; end if;
  raw := btrim(regexp_replace(value,'[NSEWO]','','g'));
  if raw !~ $re$^[+-]?\d+(\.\d+)?([\s°º'′"″:]+\d+(\.\d+)?){0,2}[\s°º'′"″:]*$$re$ then return null; end if;
  value := replace(replace(replace(raw,'º','°'),'′',''''),'″','"');
  for marker_index in 1..3 loop
    marker := (array['°','''','"'])[marker_index];
    marker_at := strpos(value,marker);
    if marker_at > 0 and (strpos(substr(value,marker_at+1),marker) > 0
      or (select count(*) from regexp_matches(substr(value,1,marker_at-1),'[+-]?\d+(\.\d+)?','g')) <> marker_index) then return null; end if;
  end loop;
  select array_agg(match[1]) into parts from regexp_matches(raw,'([+-]?\d+(?:\.\d+)?)','g') match;
  degree := parts[1]::numeric;
  if cardinality(parts) > 1 then
    minute := parts[2]::numeric;
    if degree <> trunc(degree) then return null; end if;
  end if;
  if cardinality(parts) > 2 then
    second := parts[3]::numeric;
    if minute <> trunc(minute) then return null; end if;
  end if;
  if minute >= 60 or second >= 60 then return null; end if;
  if hemisphere is not null and raw ~ '^[+-]' and (left(raw,1) = '-') is distinct from (hemisphere = any(array['S','W','O'])) then return null; end if;
  degree := abs(degree)+minute/60+second/3600;
  if degree > (case when p_axis = 'latitude' then 90 else 180 end) then return null; end if;
  return degree * case when hemisphere = any(array['S','W','O']) or (hemisphere is null and left(raw,1) = '-') then -1 else 1 end;
end;
$coordinate$;

create function sea_operation_private.capture_timestamp(p_value jsonb) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare value text := p_value #>> '{}'; result timestamptz;
begin
  if jsonb_typeof(p_value) is distinct from 'string'
    or value !~ '^[1-9]\d{3}-\d{2}-\d{2}T[0-2][0-9]:[0-5][0-9]:[0-5][0-9](\.\d{1,3})?Z$' then return null; end if;
  result := value::timestamptz;
  if to_char(result at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS') <> left(value,19) then return null; end if;
  return result;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end;
$$;

create function sea_operation_private.capture_eta_utc(p_value text) returns timestamptz
language plpgsql stable set search_path = '' as $$
declare wall timestamp; candidates timestamptz[];
begin
  if p_value is null or p_value !~ '^[1-9]\d{3}-\d{2}-\d{2}T([01][0-9]|2[0-3]):[0-5][0-9]$' then return null; end if;
  wall := p_value::timestamp;
  if to_char(wall,'YYYY-MM-DD"T"HH24:MI') <> p_value then return null; end if;
  -- Like the browser parser, derive the Paris offsets around this day and require
  -- exactly one UTC instant: reject the missing and repeated DST clock hours.
  select array_agg(distinct candidate) into candidates from (
    select (wall at time zone 'UTC') -
      ((sample at time zone 'Europe/Paris')-(sample at time zone 'UTC')) candidate
    from (select (wall at time zone 'UTC') + day * interval '24 hours' sample from generate_series(-1,1) day) samples
  ) offsets where candidate at time zone 'Europe/Paris' = wall;
  return case when cardinality(candidates) = 1 then candidates[1] else null end;
exception when invalid_datetime_format or datetime_field_overflow then return null;
end;
$$;

create function sea_operation_private.validate_waypoint_captures(p_draft jsonb) returns void
language plpgsql stable set search_path = '' as $$
declare
  point jsonb;
  capture jsonb;
  component jsonb;
  contact jsonb;
  key text;
  latitude numeric;
  longitude numeric;
  local_eta timestamptz;
  date_value date;
  max_number constant numeric := 1.7976931348623157e308;
begin
  if jsonb_typeof(p_draft->'waypoints') is distinct from 'array' then return; end if;
  for point in select value from jsonb_array_elements(p_draft->'waypoints') loop
    if not (point ? 'weather' or point ? 'radio') then continue; end if;
    latitude := sea_operation_private.capture_coordinate(point->>'latitude','latitude');
    longitude := sea_operation_private.capture_coordinate(point->>'longitude','longitude');
    if latitude is null or longitude is null then
      raise exception 'Les coordonnées de la capture du waypoint sont invalides.' using errcode = '22023'; end if;
    if point ? 'weather' then
      capture := point->'weather';
      if jsonb_typeof(capture) is distinct from 'object' then raise exception 'Capture météo invalide.' using errcode = '22023'; end if;
      foreach key in array array['pointId','windMessage','wavesMessage','attribution','sourceUrl'] loop
        if jsonb_typeof(capture->key) is distinct from 'string' or length(capture->>key) > 2048 then
          raise exception 'Champ de capture météo invalide.' using errcode = '22023'; end if;
      end loop;
      if capture->>'pointId' is distinct from point->>'id'
        or jsonb_typeof(capture->'latitude') is distinct from 'number'
        or jsonb_typeof(capture->'longitude') is distinct from 'number' then
        raise exception 'Identification de capture météo invalide.' using errcode = '22023'; end if;
      if abs((capture->>'latitude')::numeric-latitude) >= 0.00000001
        or abs((capture->>'longitude')::numeric-longitude) >= 0.00000001
        or sea_operation_private.capture_timestamp(capture->'etaUtc') is null
        or sea_operation_private.capture_timestamp(capture->'fetchedAt') is null then
        raise exception 'Position ou date de capture météo invalide.' using errcode = '22023'; end if;
      local_eta := sea_operation_private.capture_eta_utc(point->>'eta');
      if local_eta is null or local_eta is distinct from sea_operation_private.capture_timestamp(capture->'etaUtc') then
        raise exception 'La capture météo ne correspond pas à l’ETA du waypoint.' using errcode = '22023'; end if;
      if not ((capture->>'attribution' = 'Météo-France' and capture->>'sourceUrl' = 'https://www.data.gouv.fr/datasets/paquets-de-modele-de-vagues-mfwam-resolution-0-025deg')
        or (capture->>'attribution' = 'Open-Meteo' and capture->>'sourceUrl' = 'https://open-meteo.com/en/docs/marine-weather-api')) then
        raise exception 'Source météo invalide.' using errcode = '22023'; end if;
      foreach key in array array['wind','waves'] loop
        component := capture->key;
        if component = 'null'::jsonb then continue; end if;
        if jsonb_typeof(component) is distinct from 'object'
          or sea_operation_private.capture_timestamp(component->'time') is null then
          raise exception 'Prévision de capture météo invalide.' using errcode = '22023'; end if;
        if key = 'wind' then
          foreach key in array array['speedKnots','gustKnots','directionDegrees'] loop
            if component->key is distinct from 'null'::jsonb then
              if jsonb_typeof(component->key) is distinct from 'number' then raise exception 'Vent de capture météo invalide.' using errcode = '22023'; end if;
              if (component->>key)::numeric < 0 or (component->>key)::numeric > max_number then raise exception 'Vent de capture météo invalide.' using errcode = '22023'; end if;
            end if;
          end loop;
        else
          if component->>'component' is distinct from 'swell' then raise exception 'Composante de houle invalide.' using errcode = '22023'; end if;
          foreach key in array array['heightMeters','periodSeconds','directionDegrees'] loop
            if component->key is distinct from 'null'::jsonb then
              if jsonb_typeof(component->key) is distinct from 'number' then raise exception 'Houle de capture météo invalide.' using errcode = '22023'; end if;
              if (component->>key)::numeric < 0 or (component->>key)::numeric > max_number then raise exception 'Houle de capture météo invalide.' using errcode = '22023'; end if;
            end if;
          end loop;
        end if;
        if component->'directionDegrees' is distinct from 'null'::jsonb and (component->>'directionDegrees')::numeric > 360 then
          raise exception 'Direction météo invalide.' using errcode = '22023'; end if;
      end loop;
      if capture ? 'model' then
        component := capture->'model';
        if jsonb_typeof(component) is distinct from 'object'
          or jsonb_typeof(component->'name') is distinct from 'string' or length(component->>'name') > 2048
          or sea_operation_private.capture_timestamp(component->'referenceTime') is null
          or jsonb_typeof(component->'latitude') is distinct from 'number' or jsonb_typeof(component->'longitude') is distinct from 'number' then
          raise exception 'Modèle météo invalide.' using errcode = '22023'; end if;
        if abs((component->>'latitude')::numeric) > 90 or abs((component->>'longitude')::numeric) > 180 then
          raise exception 'Grille du modèle météo invalide.' using errcode = '22023'; end if;
      end if;
    end if;
    if point ? 'radio' then
      capture := point->'radio';
      if jsonb_typeof(capture) is distinct from 'object'
        or jsonb_typeof(capture->'version') is distinct from 'number' or capture->'version' is distinct from '1'::jsonb
        or jsonb_typeof(capture->'latitude') is distinct from 'number' or jsonb_typeof(capture->'longitude') is distinct from 'number'
        or sea_operation_private.capture_timestamp(capture->'capturedAt') is null
        or jsonb_typeof(capture->'verifiedOn') is distinct from 'string'
        or capture->>'verifiedOn' !~ '^[1-9]\d{3}-\d{2}-\d{2}$'
        or jsonb_typeof(capture->'contacts') is distinct from 'array' then
        raise exception 'Capture radio invalide.' using errcode = '22023'; end if;
      if abs((capture->>'latitude')::numeric-latitude) >= 0.00000001 or abs((capture->>'longitude')::numeric-longitude) >= 0.00000001
        or jsonb_array_length(capture->'contacts') > 64 then raise exception 'Position ou contacts de capture radio invalides.' using errcode = '22023'; end if;
      begin
        date_value := (capture->>'verifiedOn')::date;
        if to_char(date_value,'YYYY-MM-DD') <> capture->>'verifiedOn' then raise invalid_datetime_format; end if;
      exception when invalid_datetime_format or datetime_field_overflow then
        raise exception 'Date de vérification radio invalide.' using errcode = '22023';
      end;
      for contact in select value from jsonb_array_elements(capture->'contacts') loop
        if jsonb_typeof(contact) is distinct from 'object' then raise exception 'Contact radio invalide.' using errcode = '22023'; end if;
        foreach key in array array['id','kind','name','area','vhf','source','sourceLabel'] loop
          if jsonb_typeof(contact->key) is distinct from 'string' or length(contact->>key) > 2048 then
            raise exception 'Champ de contact radio invalide.' using errcode = '22023'; end if;
        end loop;
        foreach key in array array['phone','mmsi'] loop
          if contact ? key and (jsonb_typeof(contact->key) is distinct from 'string' or length(contact->>key) > 2048) then
            raise exception 'Coordonnées de contact radio invalides.' using errcode = '22023'; end if;
        end loop;
        if contact->>'kind' not in ('rescue','port') or jsonb_typeof(contact->'distanceNm') is distinct from 'number' then
          raise exception 'Type ou distance de contact radio invalide.' using errcode = '22023'; end if;
        if (contact->>'distanceNm')::numeric < 0 or (contact->>'distanceNm')::numeric > max_number
          or contact->>'source' !~ '^https://[^/?#@]+([/?#].*)?$'
          or contact->>'source' ~ '[[:cntrl:] ]' then
          raise exception 'Source ou distance de contact radio invalide.' using errcode = '22023'; end if;
      end loop;
    end if;
  end loop;
end;
$$;

create function sea_operation_private.guard_waypoint_captures() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform sea_operation_private.validate_waypoint_captures(new.draft);
  return new;
end;
$$;

-- Alphabetical trigger order keeps sea_operations_immutable first on updates.
create trigger sea_operations_waypoint_captures before insert or update of draft on public.sea_operations
for each row execute function sea_operation_private.guard_waypoint_captures();

revoke all on function sea_operation_private.capture_coordinate(text,text),
  sea_operation_private.capture_timestamp(jsonb),sea_operation_private.capture_eta_utc(text),
  sea_operation_private.validate_waypoint_captures(jsonb),sea_operation_private.guard_waypoint_captures() from public,anon,authenticated;
grant execute on function sea_operation_private.capture_coordinate(text,text),
  sea_operation_private.capture_timestamp(jsonb),sea_operation_private.capture_eta_utc(text),
  sea_operation_private.validate_waypoint_captures(jsonb) to authenticated;
