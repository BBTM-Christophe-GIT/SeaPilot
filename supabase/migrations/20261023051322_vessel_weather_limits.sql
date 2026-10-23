-- Vessel-specific sea-state matrix. No wind limits and no automatic GO / NO GO.
create function sea_operation_private.valid_weather_matrix(p_value jsonb) returns boolean
language plpgsql immutable strict set search_path = '' as $$
declare field text; axis jsonb; bound jsonb; previous double precision; amount double precision; row jsonb; cell jsonb;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or octet_length(p_value::text) > 32768
    or p_value->'version' is distinct from '1'::jsonb then return false; end if;
  foreach field in array array['hsLowerBoundsMeters','periodLowerBoundsSeconds'] loop
    axis := p_value->field;
    if jsonb_typeof(axis) is distinct from 'array' then return false; end if;
    if jsonb_array_length(axis) <> (case when field = 'hsLowerBoundsMeters' then 7 else 6 end) then return false; end if;
    previous := null;
    for bound in select value from jsonb_array_elements(axis) loop
      if jsonb_typeof(bound) is distinct from 'number' then return false; end if;
      -- JSON is read as IEEE754 numbers by the browser; reject bounds that
      -- collapse to the same number rather than persisting an unreadable matrix.
      amount := (bound #>> '{}')::double precision;
      if amount < 0 or amount > (case when field = 'hsLowerBoundsMeters' then 50 else 120 end)
        or (previous is null and amount <> 0) or (previous is not null and amount <= previous) then return false; end if;
      previous := amount;
    end loop;
  end loop;
  if jsonb_typeof(p_value->'hsUpperBoundMeters') is distinct from 'number' then return false; end if;
  amount := (p_value->>'hsUpperBoundMeters')::double precision;
  if amount <= (p_value #>> '{hsLowerBoundsMeters,6}')::double precision or amount > 50 then return false; end if;
  if jsonb_typeof(p_value->'levels') is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_value->'levels') <> 6 then return false; end if;
  for row in select value from jsonb_array_elements(p_value->'levels') loop
    if jsonb_typeof(row) is distinct from 'array' then return false; end if;
    if jsonb_array_length(row) <> 7 then return false; end if;
    for cell in select value from jsonb_array_elements(row) loop
      if cell = 'null'::jsonb then continue; end if;
      if jsonb_typeof(cell) is distinct from 'string' then return false; end if;
      if cell #>> '{}' not in ('comfortable','uncomfortable','tiring','twelve_hours','unlivable') then return false; end if;
    end loop;
  end loop;
  return true;
exception when numeric_value_out_of_range then return false;
end;
$$;

revoke all on function sea_operation_private.valid_weather_matrix(jsonb) from public,anon,authenticated;
grant execute on function sea_operation_private.valid_weather_matrix(jsonb) to authenticated;

alter table public.vessels add column weather_matrix jsonb;
alter table public.vessels add constraint vessels_weather_matrix_check
  check (weather_matrix is null or sea_operation_private.valid_weather_matrix(weather_matrix));
comment on column public.vessels.weather_matrix is
  'Optional vessel-specific Hs x swell-period matrix, version 1, 6 rows x 7 columns. No automatic navigation decision.';

create function sea_operation_private.capture_vessel_weather_matrix() returns trigger
language plpgsql set search_path = '' as $$
declare supplied jsonb := new.draft #> '{vessel,weatherMatrix}'; canonical jsonb;
begin
  if supplied is not null and supplied <> 'null'::jsonb and not sea_operation_private.valid_weather_matrix(supplied) then
    raise exception 'La matrice Hs × période du navire est invalide.' using errcode = '22023'; end if;
  if new.status = 'draft' then
    if new.vessel_id is null then
      new.draft := new.draft #- '{vessel,weatherMatrix}';
    else
      select vessel.weather_matrix into canonical from public.vessels vessel
        where vessel.id = new.vessel_id and vessel.company_id = new.company_id and vessel.active and vessel.asset_kind = 'vessel';
      if not found then raise exception 'Navire inaccessible.' using errcode = '42501'; end if;
      new.draft := jsonb_set(new.draft,'{vessel,weatherMatrix}',coalesce(canonical,'null'::jsonb));
    end if;
  end if;
  return new;
end;
$$;
revoke all on function sea_operation_private.capture_vessel_weather_matrix() from public,anon,authenticated;
-- The existing immutable trigger runs first; signing never substitutes a newer matrix.
create trigger sea_operations_weather_matrix before insert or update of draft on public.sea_operations
  for each row execute function sea_operation_private.capture_vessel_weather_matrix();

create or replace function sea_operation_private.overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare company bigint := sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company),false) then raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501'; end if;
  return jsonb_build_object('company_id',company,'actor_id',(select auth.uid()),'actor_name',sea_operation_private.actor_name(company),
    'records',coalesce((select jsonb_agg(sea_operation_private.record_json(record) order by record.updated_at desc,record.id)
      from public.sea_operations record where record.company_id = company),'[]'::jsonb),
    'vessels',coalesce((select jsonb_agg(jsonb_build_object('id',vessel.id,'name',vessel.name,
      'registration_imo',concat_ws(' / ',nullif(vessel.registration_number,''),nullif(vessel.imo_number,'')),
      'length_overall',vessel.length_overall,'draft_m',vessel.draft_m,'weather_matrix',vessel.weather_matrix,
      'can_sign',sea_operation_private.can_sign_vessel(company,vessel.id)) order by vessel.name)
      from public.vessels vessel where vessel.company_id = company and vessel.active and vessel.asset_kind = 'vessel'),'[]'::jsonb));
end;
$$;

create or replace function sea_operation_private.planning_context(p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare company bigint := sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company),false) then raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501'; end if;
  if p_date is null or p_date not between date '1900-01-01' and date '9998-12-31' then raise exception 'Date de préparation invalide.' using errcode = '22023'; end if;
  return jsonb_build_object('date',p_date,'choices',coalesce((
    select jsonb_agg(jsonb_build_object('operationId',occurrence.id::text||':'||vessel.id::text,'projectId',coalesce(project.id::text,''),
      'project',case when project.id is not null then concat_ws(' - ',nullif(project.project_code,''),project.title) else occurrence.title end,
      'client',coalesce(client.name,project.client_name,occurrence.client_name,''),
      'clientContact',concat_ws(' · ',nullif(client.contact_name,''),nullif(client.email,''),nullif(client.phone,''),
        nullif(concat_ws(', ',nullif(client.address,''),nullif(concat_ws(' ',nullif(client.postal_code,''),nullif(client.city,'')),''),nullif(client.country,'')),'')),
      'description',regexp_replace(regexp_replace(coalesce(nullif(occurrence.description,''),project.description,''),'<[^>]*>',' ','g'),'[[:space:]]+',' ','g'),
      'vessel',jsonb_build_object('id',vessel.id::text,'name',vessel.name,'lengthOverall',vessel.length_overall,'weatherMatrix',vessel.weather_matrix,
        'registrationImo',concat_ws(' / ',nullif(vessel.registration_number,''),nullif(vessel.imo_number,'')),
        'departurePort',coalesce(project.delivery_port,''),'arrivalPort',coalesce(project.redelivery_port,''),
        'etd',case when (project.delivery_at at time zone 'Europe/Paris')::date = occurrence.starts_on
          then to_char(project.delivery_at at time zone 'Europe/Paris','YYYY-MM-DD"T"HH24:MI') else '' end,
        'eta',case when (project.redelivery_at at time zone 'Europe/Paris')::date = coalesce(occurrence.ends_on,occurrence.starts_on)
          then to_char(project.redelivery_at at time zone 'Europe/Paris','YYYY-MM-DD"T"HH24:MI') else '' end),
      'captains',coalesce((select jsonb_agg(jsonb_build_object('personId',captain.person_id::text,'name',captain.name,'functionLabel',captain.function_label,
        'hasSignature',sea_operation_private.active_signature(company,captain.person_id) <> '{}'::jsonb,
        'canSign',captain.user_id = (select auth.uid())) order by captain.name,captain.person_id)
        from sea_operation_private.captains(company,vessel.id,p_date) captain),'[]'::jsonb),
      'canSign',exists(select 1 from sea_operation_private.captains(company,vessel.id,p_date) captain where captain.user_id = (select auth.uid())))
      order by occurrence.starts_on,occurrence.id,vessel.id)
    from public.planning_projects occurrence
    join public.vessels vessel on vessel.company_id = company and vessel.id in (occurrence.primary_vessel_id,occurrence.secondary_vessel_id)
      and vessel.active and vessel.asset_kind = 'vessel'
    left join public.projects project on project.id = occurrence.catalog_project_id and project.company_id = company
    left join public.clients client on client.id = project.client_id and client.company_id = company
    where occurrence.company_id = company and occurrence.cancelled_at is null and coalesce(project.archived_at is null,true)
      and occurrence.starts_on is not null and p_date between occurrence.starts_on and coalesce(occurrence.ends_on,occurrence.starts_on)
  ),'[]'::jsonb));
end;
$$;

-- The single user-supplied GOURY matrix is not a fleet-wide default. Never overwrite an existing configuration.
update public.vessels set weather_matrix = '{"version":1,"hsLowerBoundsMeters":[0,0.5,1,1.5,2,2.5,3],"hsUpperBoundMeters":3.5,"periodLowerBoundsSeconds":[0,5,7,9,11,13],"levels":[["comfortable","comfortable","uncomfortable","tiring","unlivable","unlivable","unlivable"],["comfortable","comfortable","uncomfortable","tiring","twelve_hours","unlivable","unlivable"],["comfortable","comfortable","uncomfortable","tiring","twelve_hours","unlivable","unlivable"],["comfortable","comfortable","comfortable","uncomfortable","twelve_hours","unlivable","unlivable"],["comfortable","comfortable","comfortable","uncomfortable","tiring","twelve_hours","unlivable"],["comfortable","comfortable","comfortable","comfortable","uncomfortable","tiring","twelve_hours"]]}'::jsonb
where id = 1 and company_id = 1 and asset_kind = 'vessel' and upper(btrim(name)) = 'GOURY' and weather_matrix is null;

notify pgrst, 'reload schema';
