-- Observations are an annex: never rewrite the captain's signed forecast/draft.
create table sea_operation_private.weather_observations (
  operation_id uuid not null references public.sea_operations(id) on delete restrict,
  point_id text not null check (length(point_id) between 1 and 2048),
  eta_utc timestamptz not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  result jsonb,
  next_attempt_at timestamptz not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_id uuid,
  lease_expires_at timestamptz,
  completed_at timestamptz,
  primary key(operation_id,point_id),
  check ((lease_id is null) = (lease_expires_at is null)),
  check (result is null or jsonb_typeof(result) = 'object')
);
alter table sea_operation_private.weather_observations enable row level security;
revoke all on sea_operation_private.weather_observations from public,anon,authenticated,service_role;
create index sea_operation_observations_pending_idx on sea_operation_private.weather_observations(next_attempt_at,eta_utc)
  where completed_at is null;
create index sea_operation_observations_expiry_idx on sea_operation_private.weather_observations(expires_at)
  where completed_at is null;

create function sea_operation_private.enqueue_weather_observations(p_record public.sea_operations) returns void
language plpgsql security definer set search_path = '' as $$
declare point jsonb; latitude double precision; longitude double precision; eta timestamptz;
begin
  if p_record.status <> 'signed' then return; end if;
  for point in select value from jsonb_array_elements(p_record.draft->'waypoints') loop
    latitude := sea_operation_private.capture_coordinate(point->>'latitude','latitude');
    longitude := sea_operation_private.capture_coordinate(point->>'longitude','longitude');
    eta := sea_operation_private.capture_eta_utc(point->>'eta');
    -- Legacy time-only ETAs and incomplete positions have no defensible observation time.
    if latitude is null or longitude is null or eta is null or coalesce(btrim(point->>'id'),'') = ''
      or length(point->>'id')>2048 then continue; end if;
    insert into sea_operation_private.weather_observations(operation_id,point_id,eta_utc,latitude,longitude,next_attempt_at,expires_at)
    values(p_record.id,point->>'id',eta,latitude,longitude,
      greatest(clock_timestamp(),eta+interval '1 hour'),eta+interval '7 days')
    on conflict(operation_id,point_id) do nothing;
  end loop;
end;
$$;

create function sea_operation_private.enqueue_signed_weather_observations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'signed' and old.status = 'draft' then
    perform sea_operation_private.enqueue_weather_observations(new);
  end if;
  return new;
end;
$$;
create trigger sea_operations_weather_observations after update of status on public.sea_operations
for each row execute function sea_operation_private.enqueue_signed_weather_observations();

create function sea_operation_private.weather_observations(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare operation public.sea_operations;
begin
  select * into operation from public.sea_operations where id=p_id;
  if operation.id is null or not coalesce(sea_operation_private.can_read(operation.company_id),false) then
    raise exception 'Opération inaccessible.' using errcode='42501';
  end if;
  return jsonb_build_object('operationId',p_id,'points',coalesce((
    select jsonb_agg(case when observation.result is not null and (observation.result->>'status'='recorded' or observation.expires_at>now())
      then observation.result else jsonb_build_object(
      'pointId',observation.point_id,'latitude',observation.latitude,'longitude',observation.longitude,
      'etaUtc',to_char(observation.eta_utc at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'recordedAt',to_char(operation.signed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'wind',null,'waves',null,
      'status',case when observation.expires_at <= now() then 'unavailable' else 'pending' end,
      'message',case when observation.expires_at <= now() then 'Aucune mesure officielle enregistrée dans la fenêtre de collecte.'
        else 'Les mesures officielles seront recherchées après la date du waypoint.' end
    ) end order by observation.eta_utc,observation.point_id)
    from sea_operation_private.weather_observations observation where observation.operation_id=p_id),'[]'::jsonb));
end;
$$;
create function public.sea_operation_weather_observations(p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sea_operation_private.weather_observations(p_id);
$$;

create function sea_operation_private.claim_weather_observations(p_limit integer default 20) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare claimed_jobs jsonb; new_quota integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 40 then raise exception 'Lot invalide.' using errcode='22023'; end if;
  new_quota:=greatest(1,(p_limit*3)/4);
  -- Expiration does not discard an already collected wind or wave measurement.
  with expired as (
    select operation_id,point_id from sea_operation_private.weather_observations
    where completed_at is null and expires_at <= clock_timestamp()
      and (lease_expires_at is null or lease_expires_at <= clock_timestamp())
    order by expires_at,operation_id,point_id for update skip locked limit p_limit
  ) update sea_operation_private.weather_observations observation set completed_at=clock_timestamp(),lease_id=null,lease_expires_at=null,
    result=case when result->>'status'='recorded' then result else jsonb_build_object(
      'pointId',observation.point_id,'latitude',observation.latitude,'longitude',observation.longitude,
      'etaUtc',to_char(eta_utc at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'recordedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'wind',null,'waves',null,'status','unavailable','message','Aucune mesure officielle disponible dans la fenêtre de collecte de sept jours.') end
    from expired where observation.operation_id=expired.operation_id and observation.point_id=expired.point_id;
  -- Reserve 30/40 places for new points and at least 10/40 for retries when both
  -- queues are busy. Either queue may use capacity left unused by the other.
  with new_points as (
    select operation_id,point_id from sea_operation_private.weather_observations
    where completed_at is null and next_attempt_at <= clock_timestamp() and expires_at > clock_timestamp()
      and eta_utc+interval '1 hour' <= clock_timestamp() and attempt_count=0
      and (lease_expires_at is null or lease_expires_at <= clock_timestamp())
    order by next_attempt_at,eta_utc,operation_id,point_id for update skip locked limit new_quota
  ), retry_points as (
    select operation_id,point_id from sea_operation_private.weather_observations
    where completed_at is null and next_attempt_at <= clock_timestamp() and expires_at > clock_timestamp()
      and eta_utc+interval '1 hour' <= clock_timestamp() and attempt_count>0
      and (lease_expires_at is null or lease_expires_at <= clock_timestamp())
    order by next_attempt_at,eta_utc,operation_id,point_id for update skip locked limit (p_limit-(select count(*) from new_points))
  ), extra_new_points as (
    select observation.operation_id,observation.point_id from sea_operation_private.weather_observations observation
    where completed_at is null and next_attempt_at <= clock_timestamp() and expires_at > clock_timestamp()
      and eta_utc+interval '1 hour' <= clock_timestamp() and attempt_count=0
      and (lease_expires_at is null or lease_expires_at <= clock_timestamp())
      and not exists(select 1 from new_points where new_points.operation_id=observation.operation_id and new_points.point_id=observation.point_id)
    order by next_attempt_at,eta_utc,observation.operation_id,observation.point_id for update skip locked
    limit (p_limit-(select count(*) from new_points)-(select count(*) from retry_points))
  ), due as (
    select * from new_points union all select * from retry_points union all select * from extra_new_points
  ), claimed as (
    update sea_operation_private.weather_observations observation set lease_id=gen_random_uuid(),
      lease_expires_at=least(clock_timestamp()+interval '5 minutes',observation.expires_at),attempt_count=attempt_count+1
    from due where observation.operation_id=due.operation_id and observation.point_id=due.point_id
    returning observation.*
  ) select coalesce(jsonb_agg(jsonb_build_object('operationId',operation_id,'pointId',point_id,
    'latitude',latitude,'longitude',longitude,'etaUtc',to_char(eta_utc at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'leaseId',lease_id)),'[]'::jsonb) into claimed_jobs from claimed;
  return claimed_jobs;
end;
$$;

create function sea_operation_private.complete_weather_observation(p_operation_id uuid,p_point_id text,p_lease_id uuid,p_result jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare observation sea_operation_private.weather_observations; component jsonb; component_key text; metric text; combined jsonb;
  old_component jsonb; new_component jsonb; merged_component jsonb; old_score integer; new_score integer;
begin
  select * into observation from sea_operation_private.weather_observations
    where operation_id=p_operation_id and point_id=p_point_id and lease_id=p_lease_id
      and lease_expires_at > clock_timestamp() and completed_at is null for update;
  if observation.operation_id is null then return false; end if;
  if jsonb_typeof(p_result) is distinct from 'object' or length(p_result::text)>65536
    or p_result->>'pointId' is distinct from observation.point_id
    or p_result->>'status' is null or p_result->>'status' not in ('recorded','pending','unavailable')
    or jsonb_typeof(p_result->'message') is distinct from 'string' or length(p_result->>'message')>2000
    or jsonb_typeof(p_result->'latitude') is distinct from 'number' or jsonb_typeof(p_result->'longitude') is distinct from 'number'
    or sea_operation_private.capture_timestamp(p_result->'etaUtc') is distinct from observation.eta_utc
    or sea_operation_private.capture_timestamp(p_result->'recordedAt') is null then
    raise exception 'Observation invalide.' using errcode='22023'; end if;
  if abs((p_result->>'latitude')::numeric-observation.latitude::numeric)>=0.00000001
    or abs((p_result->>'longitude')::numeric-observation.longitude::numeric)>=0.00000001 then
    raise exception 'Position d’observation invalide.' using errcode='22023'; end if;
  foreach component_key in array array['wind','waves'] loop
    component:=p_result->component_key;
    if component='null'::jsonb then continue; end if;
    if jsonb_typeof(component) is distinct from 'object'
      or sea_operation_private.capture_timestamp(component->'observedAt') is null
      or jsonb_typeof(component->'station') is distinct from 'object'
      or jsonb_typeof(component->'source') is distinct from 'object'
      or sea_operation_private.capture_timestamp(component->'observedAt') > sea_operation_private.capture_timestamp(p_result->'recordedAt')
      or abs(extract(epoch from sea_operation_private.capture_timestamp(component->'observedAt')-observation.eta_utc))>1800 then
      raise exception 'Mesure officielle invalide.' using errcode='22023'; end if;
    if not coalesce((component#>>'{source,provider}'='Météo-France'
      and component#>>'{source,sourceUrl}'='https://www.data.gouv.fr/datasets/archives-annuelles-des-observations-bouees'
      and component#>>'{source,license}'='Licence Ouverte 2.0'
      and component#>>'{source,licenseUrl}'='https://www.etalab.gouv.fr/licence-ouverte-open-licence/'
      and component#>>'{source,quality}'='not_provided') or (component#>>'{source,provider}'='Met Office'
      and component#>>'{source,sourceUrl}'='https://registry.opendata.aws/met-office-uk-marine-observations/'
      and component#>>'{source,license}'='CC BY-SA 4.0'
      and component#>>'{source,licenseUrl}'='https://creativecommons.org/licenses/by-sa/4.0/'
      and component#>>'{source,quality}'='good'),false) then
      raise exception 'Source de mesure officielle invalide.' using errcode='22023'; end if;
    if jsonb_typeof(component#>'{station,id}') is distinct from 'string' or length(component#>>'{station,id}') not between 1 and 128
      or jsonb_typeof(component#>'{station,name}') is distinct from 'string' or length(component#>>'{station,name}') not between 1 and 256
      or jsonb_typeof(component#>'{station,latitude}') is distinct from 'number'
      or jsonb_typeof(component#>'{station,longitude}') is distinct from 'number'
      or jsonb_typeof(component#>'{station,distanceKm}') is distinct from 'number' then
      raise exception 'Station de mesure officielle invalide.' using errcode='22023'; end if;
    if abs((component#>>'{station,latitude}')::numeric)>90 or abs((component#>>'{station,longitude}')::numeric)>180
      or (component#>>'{station,distanceKm}')::numeric not between 0 and 50 then
      raise exception 'Position de station officielle invalide.' using errcode='22023'; end if;
    foreach metric in array case when component_key='wind' then array['speedKnots','directionDegrees','instrumentHeightMeters'] else array['heightMeters','periodSeconds','directionDegrees'] end loop
      if component->metric='null'::jsonb then continue; end if;
      if jsonb_typeof(component->metric) is distinct from 'number' then raise exception 'Valeur de mesure officielle invalide.' using errcode='22023'; end if;
      if (component->>metric)::numeric<0 or (component->>metric)::numeric>(case metric when 'speedKnots' then 300 when 'directionDegrees' then 360 else 100 end)
        or (metric='periodSeconds' and (component->>metric)::numeric=0) then
        raise exception 'Valeur de mesure officielle hors limites.' using errcode='22023'; end if;
    end loop;
    if component_key='waves' and (component->>'component' is null or component->>'component' not in ('swell','total')
      or component->>'periodKind' is null or component->>'periodKind' not in ('peak','mean')) then
      raise exception 'Composante de mesure officielle invalide.' using errcode='22023'; end if;
    if (component_key='wind' and component->'speedKnots'='null'::jsonb and component->'directionDegrees'='null'::jsonb)
      or (component_key='waves' and component->'heightMeters'='null'::jsonb and component->'periodSeconds'='null'::jsonb and component->'directionDegrees'='null'::jsonb) then
      raise exception 'Mesure officielle vide.' using errcode='22023'; end if;
  end loop;
  if (p_result->'wind'='null'::jsonb and p_result->'waves'='null'::jsonb) = (p_result->>'status'='recorded') then
    raise exception 'Statut d’observation invalide.' using errcode='22023'; end if;
  -- Keep each station/time component intact; do not combine different stations or hours.
  -- A less complete retry cannot erase a measurement obtained on a previous day.
  combined:=p_result;
  foreach component_key in array array['wind','waves'] loop
    old_component:=observation.result->component_key;
    new_component:=p_result->component_key;
    -- Complementary fields may be joined only for the exact same measured
    -- source, station, instant and sea component / instrument height.
    if jsonb_typeof(old_component)='object' and jsonb_typeof(new_component)='object'
      and old_component->'source'=new_component->'source' and old_component->'station'=new_component->'station'
      and sea_operation_private.capture_timestamp(old_component->'observedAt')=sea_operation_private.capture_timestamp(new_component->'observedAt')
      and ((component_key='wind' and old_component->'instrumentHeightMeters'=new_component->'instrumentHeightMeters')
        or (component_key='waves' and old_component->'component'=new_component->'component' and old_component->'periodKind'=new_component->'periodKind')) then
      merged_component:=old_component;
      foreach metric in array case when component_key='wind' then array['speedKnots','directionDegrees','instrumentHeightMeters'] else array['heightMeters','periodSeconds','directionDegrees'] end loop
        if old_component->metric='null'::jsonb and new_component->metric<>'null'::jsonb then
          merged_component:=jsonb_set(merged_component,array[metric],new_component->metric);
        end if;
      end loop;
      combined:=jsonb_set(combined,array[component_key],merged_component);
      continue;
    end if;
    select count(*) into old_score from jsonb_each(coalesce(nullif(observation.result->component_key,'null'::jsonb),'{}'::jsonb))
      where jsonb_each.key=any(case when component_key='wind' then array['speedKnots','directionDegrees'] else array['heightMeters','periodSeconds','directionDegrees'] end) and value<>'null'::jsonb;
    select count(*) into new_score from jsonb_each(coalesce(nullif(p_result->component_key,'null'::jsonb),'{}'::jsonb))
      where jsonb_each.key=any(case when component_key='wind' then array['speedKnots','directionDegrees'] else array['heightMeters','periodSeconds','directionDegrees'] end) and value<>'null'::jsonb;
    if old_score>0 and old_score>=new_score then
      combined:=jsonb_set(combined,array[component_key],observation.result->component_key);
    end if;
  end loop;
  if combined->'wind'<>'null'::jsonb or combined->'waves'<>'null'::jsonb then combined:=jsonb_set(combined,'{status}','"recorded"'); end if;
  update sea_operation_private.weather_observations set result=combined,lease_id=null,lease_expires_at=null,
    -- Leave one hour of slack so tomorrow's cron does not start a few seconds
    -- before a strict +24 h deadline and accidentally postpone retries by 48 h.
    next_attempt_at=clock_timestamp()+interval '23 hours',
    completed_at=case when combined#>'{wind,speedKnots}'<>'null'::jsonb and combined#>'{wind,directionDegrees}'<>'null'::jsonb
      and combined#>'{waves,heightMeters}'<>'null'::jsonb and combined#>'{waves,periodSeconds}'<>'null'::jsonb
      and combined#>'{waves,directionDegrees}'<>'null'::jsonb then clock_timestamp() else null end
    where operation_id=p_operation_id and point_id=p_point_id;
  return true;
end;
$$;

create function public.sea_operation_weather_observations_claim(p_limit integer default 20) returns jsonb
language sql security invoker set search_path = '' as $$select sea_operation_private.claim_weather_observations(p_limit);$$;
create function public.sea_operation_weather_observation_complete(p_operation_id uuid,p_point_id text,p_lease_id uuid,p_result jsonb) returns boolean
language sql security invoker set search_path = '' as $$select sea_operation_private.complete_weather_observation(p_operation_id,p_point_id,p_lease_id,p_result);$$;

revoke all on function sea_operation_private.enqueue_weather_observations(public.sea_operations),
  sea_operation_private.enqueue_signed_weather_observations(),sea_operation_private.weather_observations(uuid),
  sea_operation_private.claim_weather_observations(integer),sea_operation_private.complete_weather_observation(uuid,text,uuid,jsonb),
  public.sea_operation_weather_observations(uuid),public.sea_operation_weather_observations_claim(integer),
  public.sea_operation_weather_observation_complete(uuid,text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function sea_operation_private.weather_observations(uuid),public.sea_operation_weather_observations(uuid) to authenticated;
grant usage on schema sea_operation_private to service_role;
grant execute on function sea_operation_private.claim_weather_observations(integer),sea_operation_private.complete_weather_observation(uuid,text,uuid,jsonb),
  public.sea_operation_weather_observations_claim(integer),public.sea_operation_weather_observation_complete(uuid,text,uuid,jsonb) to service_role;

-- Backfill only annex rows; signed sea_operations and their timestamps remain intact.
do $$declare operation public.sea_operations; begin
  for operation in select * from public.sea_operations where status='signed' loop
    perform sea_operation_private.enqueue_weather_observations(operation);
  end loop;
end;$$;

comment on table sea_operation_private.weather_observations is 'Official marine observations collected after ETA day, separate from immutable captain-signed forecasts; server-only lease queue and authenticated company-scoped read RPC.';
