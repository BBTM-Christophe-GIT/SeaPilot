create function sea_operation_private.guard_port_water_levels() returns trigger
language plpgsql set search_path = '' as $$
declare
  levels jsonb := new.draft #> '{vessel,portWaterLevels}';
  item record;
  level jsonb;
  port_name text;
  port_time timestamptz;
  fetched timestamptz;
  expected_url text;
  expected_datum text;
  lat double precision;
  lon double precision;
  sample_lat double precision;
  sample_lon double precision;
begin
  if levels is null or (tg_op = 'UPDATE' and old.status = 'signed') then return new; end if;
  if tg_op = 'INSERT' and sea_operation_private.is_admin_revision_clone(new) then return new; end if;
  if jsonb_typeof(levels) is distinct from 'object' or levels - array['departure','arrival'] <> '{}'::jsonb then
    raise exception 'Prévisions des niveaux d’eau portuaires invalides.' using errcode = '22023';
  end if;

  for item in select * from jsonb_each(levels) loop
    level := item.value;
    if jsonb_typeof(level) is distinct from 'object'
      or level - array['portKey','portName','latitude','longitude','etaUtc','fetchedAt','heightMeters',
        'sampleLatitude','sampleLongitude','source','sourceUrl','datum'] <> '{}'::jsonb
      or jsonb_typeof(level->'portName') is distinct from 'string'
      or length(level->>'portName') not between 1 and 300
      or jsonb_typeof(level->'portKey') is distinct from 'string'
      or level->>'portKey' !~ '^(sandre|wpi):[a-zA-Z0-9._-]{1,80}$' then
      raise exception 'Port de la prévision de niveau d’eau invalide.' using errcode = '22023';
    end if;
    port_name := btrim(new.draft->'vessel'->>(case item.key when 'departure' then 'departurePort' else 'arrivalPort' end));
    port_time := sea_operation_private.capture_eta_utc(
      new.draft->'vessel'->>(case item.key when 'departure' then 'etd' else 'eta' end));
    if coalesce(port_name,'') = '' or level->>'portName' is distinct from port_name or port_time is null
      or sea_operation_private.capture_timestamp(level->'etaUtc') is distinct from port_time then
      levels := levels - item.key;
      continue;
    end if;

    expected_url := case level->>'source'
      when 'copernicus-nws' then 'https://data.marine.copernicus.eu/product/NWSHELF_ANALYSISFORECAST_PHY_004_013/description'
      when 'copernicus-ibi' then 'https://data.marine.copernicus.eu/product/IBI_ANALYSISFORECAST_PHY_005_001/description'
      when 'copernicus-med' then 'https://data.marine.copernicus.eu/product/MEDSEA_ANALYSISFORECAST_PHY_006_013/description'
      when 'shom-tolosa' then 'https://www.shom.fr/fr/copernicus'
      when 'shom-hycom' then 'https://www.shom.fr/fr/copernicus'
    end;
    expected_datum := case when level->>'source' in ('shom-tolosa','shom-hycom') then 'model-mean-sea-level' else 'model-geoid' end;
    fetched := sea_operation_private.capture_timestamp(level->'fetchedAt');
    if expected_url is null or level->>'sourceUrl' is distinct from expected_url
      or level->>'datum' is distinct from expected_datum or fetched is null
      or fetched > port_time or fetched > now() + interval '1 minute'
      or jsonb_typeof(level->'heightMeters') is distinct from 'number'
      or abs((level->>'heightMeters')::numeric) > 100
      or jsonb_typeof(level->'latitude') is distinct from 'number'
      or jsonb_typeof(level->'longitude') is distinct from 'number'
      or jsonb_typeof(level->'sampleLatitude') is distinct from 'number'
      or jsonb_typeof(level->'sampleLongitude') is distinct from 'number'
      or abs((level->>'latitude')::numeric) > 90 or abs((level->>'longitude')::numeric) > 180
      or abs((level->>'sampleLatitude')::numeric) > 90 or abs((level->>'sampleLongitude')::numeric) > 180 then
      raise exception 'Provenance du niveau d’eau portuaire invalide.' using errcode = '22023';
    end if;
    lat := radians((level->>'latitude')::double precision);
    lon := radians((level->>'longitude')::double precision);
    sample_lat := radians((level->>'sampleLatitude')::double precision);
    sample_lon := radians((level->>'sampleLongitude')::double precision);
    if 12742.0176 * asin(sqrt(least(1, sin((lat-sample_lat)/2)^2
      + cos(lat)*cos(sample_lat)*sin((lon-sample_lon)/2)^2))) > 2.001 then
      raise exception 'Maille trop éloignée du port pour le niveau d’eau.' using errcode = '22023';
    end if;
  end loop;
  if levels = '{}'::jsonb then
    new.draft := new.draft #- '{vessel,portWaterLevels}';
  else
    new.draft := jsonb_set(new.draft, '{vessel,portWaterLevels}', levels);
  end if;
  return new;
end;
$$;

revoke all on function sea_operation_private.guard_port_water_levels() from public, anon, authenticated;

create trigger sea_operations_port_water_levels
before insert or update of draft on public.sea_operations
for each row execute function sea_operation_private.guard_port_water_levels();
