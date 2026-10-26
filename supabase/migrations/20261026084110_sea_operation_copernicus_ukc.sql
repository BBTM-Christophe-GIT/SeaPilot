-- Narrow read-only authorization for the server-side Copernicus provider.
-- No Project catalog permission, service-role credential or table grant is added.
create function sea_operation_private.ukc_context(p_project_id bigint,p_vessel_id bigint) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare company bigint := sea_operation_private.company_id(); vessel public.vessels;
begin
  if not coalesce(sea_operation_private.can_read(company),false) then
    raise exception 'Accès refusé aux opérations en mer.' using errcode='42501'; end if;
  if p_project_id is null or p_project_id <= 0 or p_vessel_id is null or p_vessel_id <= 0 then
    raise exception 'Projet ou navire invalide.' using errcode='22023'; end if;
  select item.* into vessel from public.vessels item
  where item.id=p_vessel_id and item.company_id=company and item.active and item.asset_kind='vessel'
    and exists(select 1 from public.projects project
      where project.id=p_project_id and project.company_id=company and project.archived_at is null
        and exists(select 1 from public.planning_projects occurrence
          where occurrence.company_id=company and occurrence.catalog_project_id=project.id
            and occurrence.cancelled_at is null
            and p_vessel_id in (occurrence.primary_vessel_id,occurrence.secondary_vessel_id)));
  if not found then raise exception 'Projet ou navire inaccessible.' using errcode='42501'; end if;
  return jsonb_build_object('projectId',p_project_id::text,'vesselId',vessel.id::text,'draftMeters',vessel.draft_m);
end;
$$;

create function public.sea_operation_ukc_context(p_project_id bigint,p_vessel_id bigint) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select sea_operation_private.ukc_context(p_project_id,p_vessel_id);
$$;
revoke all on function sea_operation_private.ukc_context(bigint,bigint),public.sea_operation_ukc_context(bigint,bigint)
  from public,anon,authenticated,service_role;
grant execute on function sea_operation_private.ukc_context(bigint,bigint),public.sea_operation_ukc_context(bigint,bigint) to authenticated;
comment on function public.sea_operation_ukc_context(bigint,bigint) is
  'Authorized planned project/vessel and canonical draft for indicative Copernicus UKC. No navigation decision or broad project catalog access.';

-- JSON numbers must also be representable by the browser's finite number type.
create function sea_operation_private.copernicus_number(p_value jsonb) returns numeric
language plpgsql immutable set search_path = '' as $$
declare result numeric;
begin
  if jsonb_typeof(p_value) is distinct from 'number' or length(p_value::text)>512 then return null; end if;
  result:=(p_value#>>'{}')::numeric;
  return case when abs(result)<=1.7976931348623157e308 then result else null end;
exception when invalid_text_representation or numeric_value_out_of_range then return null;
end;
$$;

create function sea_operation_private.copernicus_contains(p_bounds jsonb,p_latitude numeric,p_longitude numeric) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(p_latitude between (p_bounds->>'south')::numeric and (p_bounds->>'north')::numeric
    and (case when (p_bounds->>'west')::numeric<(p_bounds->>'east')::numeric
      then p_longitude between (p_bounds->>'west')::numeric and (p_bounds->>'east')::numeric
        or (abs(p_longitude)=180 and ((p_bounds->>'west')::numeric=-180 or (p_bounds->>'east')::numeric=180))
      else p_longitude>=(p_bounds->>'west')::numeric or p_longitude<=(p_bounds->>'east')::numeric end),false);
$$;

create function sea_operation_private.validate_copernicus_capture(p_capture jsonb) returns void
language plpgsql stable set search_path = '' as $$
declare
  source jsonb:=p_capture->'source'; cell jsonb:=p_capture->'cell'; bounds jsonb;
  water jsonb:=p_capture->'waterLevel'; estimate jsonb:=p_capture->'estimate'; key text;
  product text; sea_dataset text; bathy_dataset text; release text;
  target timestamptz; consulted timestamptz; before_time timestamptz; after_time timestamptz; run_time timestamptz;
  depth numeric; low_depth numeric; high_depth numeric; height_before numeric; height_after numeric; level numeric; draught numeric;
  components jsonb; missing jsonb; expected_variability jsonb;
begin
  if jsonb_typeof(p_capture) is distinct from 'object' or p_capture->'version' is distinct from '1'::jsonb
    or not (p_capture ?& array['source','cell','waterLevel','estimate'])
    or jsonb_typeof(p_capture->'pointId') is distinct from 'string' or p_capture->>'pointId' !~ '^[A-Za-z0-9._:-]{1,100}$'
    or jsonb_typeof(p_capture->'message') is distinct from 'string' or length(p_capture->>'message') not between 1 and 2048
    or p_capture->>'status' is null or p_capture->>'status' not in ('available','unavailable') then
    raise exception 'Capture UKC Copernicus invalide.' using errcode='22023'; end if;
  foreach key in array array['projectId','vesselId'] loop
    if jsonb_typeof(p_capture->key) is distinct from 'string' or p_capture->>key !~ '^[1-9][0-9]{0,18}$' then
      raise exception 'Identifiant de capture UKC invalide.' using errcode='22023'; end if;
    if (p_capture->>key)::numeric>9223372036854775807 then
      raise exception 'Identifiant de capture UKC invalide.' using errcode='22023'; end if;
  end loop;
  foreach key in array array['latitude','longitude','draftMeters'] loop
    if sea_operation_private.copernicus_number(p_capture->key) is null then
      raise exception 'Position ou tirant de capture UKC invalide.' using errcode='22023'; end if;
  end loop;
  draught:=(p_capture->>'draftMeters')::numeric;
  if abs((p_capture->>'latitude')::numeric)>90 or abs((p_capture->>'longitude')::numeric)>180
    or draught<=0 or draught>50 then raise exception 'Position ou tirant de capture UKC invalide.' using errcode='22023'; end if;
  target:=sea_operation_private.capture_timestamp(p_capture->'etaUtc');
  consulted:=sea_operation_private.capture_timestamp(p_capture->'fetchedAt');
  if target is null or consulted is null then raise exception 'Horodatage de capture UKC invalide.' using errcode='22023'; end if;

  if source<>'null'::jsonb then
    if jsonb_typeof(source) is distinct from 'object' or source->>'datum' is distinct from 'model-geoid'
      or not (source ? 'referenceTimeUtc') or source->>'model' is null or source->>'model' not in ('NWS','IBI') then
      raise exception 'Référence du modèle UKC invalide.' using errcode='22023'; end if;
    foreach key in array array['model','productId','seaLevelDatasetId','bathymetryDatasetId','datasetVersion','datum','sourceUrl'] loop
      if jsonb_typeof(source->key) is distinct from 'string' then
        raise exception 'Provenance du modèle UKC invalide.' using errcode='22023'; end if;
    end loop;
    if source->>'model'='NWS' then
      product:='NWSHELF_ANALYSISFORECAST_PHY_004_013'; sea_dataset:='cmems_mod_nws_phy-ssh_anfc_1.5km-2D_PT15M-i';
      bathy_dataset:='cmems_mod_nws_phy_anfc_1.5km_static'; release:='202511';
    else
      product:='IBI_ANALYSISFORECAST_PHY_005_001'; sea_dataset:='cmems_mod_ibi_phy_anfc_0.027deg-2D_PT15M-i';
      bathy_dataset:='cmems_mod_ibi_phy_anfc_0.027deg-3D_static'; release:='202411';
    end if;
    if source->>'productId' is distinct from product or source->>'seaLevelDatasetId' is distinct from sea_dataset
      or source->>'bathymetryDatasetId' is distinct from bathy_dataset or source->>'datasetVersion' is distinct from release
      or source->>'sourceUrl' is distinct from 'https://data.marine.copernicus.eu/product/'||product||'/description' then
      raise exception 'Provenance du modèle UKC invalide.' using errcode='22023'; end if;
    if source->'referenceTimeUtc'<>'null'::jsonb then
      run_time:=sea_operation_private.capture_timestamp(source->'referenceTimeUtc');
      if run_time is null then raise exception 'Date du modèle UKC invalide.' using errcode='22023'; end if;
    end if;
  end if;

  if cell<>'null'::jsonb then
    if jsonb_typeof(cell) is distinct from 'object' or jsonb_typeof(cell->'bounds') is distinct from 'object'
      or not (cell ?& array['depthMinMeters','depthMaxMeters']) then
      raise exception 'Maille du modèle UKC invalide.' using errcode='22023'; end if;
    foreach key in array array['latitude','longitude','resolutionMeters','depthMeters'] loop
      if sea_operation_private.copernicus_number(cell->key) is null then
        raise exception 'Maille du modèle UKC invalide.' using errcode='22023'; end if;
    end loop;
    bounds:=cell->'bounds';
    foreach key in array array['west','east','south','north'] loop
      if sea_operation_private.copernicus_number(bounds->key) is null then
        raise exception 'Emprise du modèle UKC invalide.' using errcode='22023'; end if;
    end loop;
    depth:=(cell->>'depthMeters')::numeric;
    if abs((cell->>'latitude')::numeric)>90 or abs((cell->>'longitude')::numeric)>180 or depth<=0
      or (cell->>'resolutionMeters')::numeric<=0 or abs((bounds->>'west')::numeric)>180 or abs((bounds->>'east')::numeric)>180
      or (bounds->>'south')::numeric< -90 or (bounds->>'north')::numeric>90
      or (bounds->>'south')::numeric>=(bounds->>'north')::numeric or bounds->'west'=bounds->'east'
      or ((bounds->>'west')::numeric=180 and (bounds->>'east')::numeric=-180)
      or not sea_operation_private.copernicus_contains(bounds,(cell->>'latitude')::numeric,(cell->>'longitude')::numeric) then
      raise exception 'Emprise du modèle UKC invalide.' using errcode='22023'; end if;
    if cell->'depthMinMeters'<>'null'::jsonb then
      low_depth:=sea_operation_private.copernicus_number(cell->'depthMinMeters');
      if low_depth is null or low_depth<0 or low_depth>depth then raise exception 'Variabilité bathymétrique UKC invalide.' using errcode='22023'; end if;
    end if;
    if cell->'depthMaxMeters'<>'null'::jsonb then
      high_depth:=sea_operation_private.copernicus_number(cell->'depthMaxMeters');
      if high_depth is null or high_depth<depth then raise exception 'Variabilité bathymétrique UKC invalide.' using errcode='22023'; end if;
    end if;
  end if;

  if water<>'null'::jsonb then
    if jsonb_typeof(water) is distinct from 'object'
      or sea_operation_private.copernicus_number(water->'heightBeforeMeters') is null
      or sea_operation_private.copernicus_number(water->'heightAfterMeters') is null then
      raise exception 'Niveau d’eau du modèle UKC invalide.' using errcode='22023'; end if;
    before_time:=sea_operation_private.capture_timestamp(water->'timeBeforeUtc');
    after_time:=sea_operation_private.capture_timestamp(water->'timeAfterUtc');
    height_before:=(water->>'heightBeforeMeters')::numeric; height_after:=(water->>'heightAfterMeters')::numeric;
    if before_time is null or after_time is null or mod(extract(epoch from before_time),900)<>0
      or mod(extract(epoch from after_time),900)<>0 or after_time<before_time or after_time-before_time>interval '15 minutes'
      or (after_time=before_time and height_before<>height_after) then
      raise exception 'Échéances du modèle UKC invalides.' using errcode='22023'; end if;
  end if;
  if p_capture->>'status'='unavailable' then
    if estimate is distinct from 'null'::jsonb then raise exception 'Une capture UKC indisponible ne contient pas de calcul.' using errcode='22023'; end if;
    return;
  end if;
  if jsonb_typeof(source) is distinct from 'object' or jsonb_typeof(cell) is distinct from 'object'
    or jsonb_typeof(water) is distinct from 'object' or jsonb_typeof(estimate) is distinct from 'object'
    or consulted>target or target<before_time or target>after_time or run_time>before_time or depth<=10
    or not sea_operation_private.copernicus_contains(bounds,(p_capture->>'latitude')::numeric,(p_capture->>'longitude')::numeric) then
    raise exception 'Le modèle ne permet pas de calcul UKC pour ce point et cette ETA.' using errcode='22023'; end if;
  level:=case when target=before_time then height_before when target=after_time then height_after
    else height_before+(height_after-height_before)*extract(epoch from target-before_time)/extract(epoch from after_time-before_time) end;
  if estimate->>'kind' is distinct from 'static' or estimate->'dynamicCorrectionsApplied' is distinct from 'false'::jsonb
    or sea_operation_private.copernicus_number(estimate->'waterLevelMeters') is null
    or sea_operation_private.copernicus_number(estimate->'ukcMeters') is null then
    raise exception 'Calcul de capture UKC invalide.' using errcode='22023'; end if;
  if abs((estimate->>'waterLevelMeters')::numeric-level)>0.00000001
    or abs((estimate->>'ukcMeters')::numeric-(depth+level-draught))>0.00000001 then
    raise exception 'Arithmétique de capture UKC invalide.' using errcode='22023'; end if;
  if low_depth is null or high_depth is null then
    if estimate->'cellVariability' is distinct from 'null'::jsonb then raise exception 'Variabilité UKC invalide.' using errcode='22023'; end if;
  else
    expected_variability:=estimate->'cellVariability';
    if jsonb_typeof(expected_variability) is distinct from 'object'
      or sea_operation_private.copernicus_number(expected_variability->'lowerMeters') is null
      or sea_operation_private.copernicus_number(expected_variability->'upperMeters') is null then
      raise exception 'Variabilité UKC invalide.' using errcode='22023'; end if;
    if abs((expected_variability->>'lowerMeters')::numeric-(low_depth+level-draught))>0.00000001
      or abs((expected_variability->>'upperMeters')::numeric-(high_depth+level-draught))>0.00000001 then
      raise exception 'Variabilité UKC invalide.' using errcode='22023'; end if;
  end if;
  components:=jsonb_build_array(
    jsonb_build_object('id','bathymetryVertical','standardUncertaintyMeters',null),
    jsonb_build_object('id','waterLevel','standardUncertaintyMeters',null),
    jsonb_build_object('id','draft','standardUncertaintyMeters',null),
    jsonb_build_object('id','positionEffect','standardUncertaintyMeters',null),
    jsonb_build_object('id','temporalInterpolation','standardUncertaintyMeters',case when target in (before_time,after_time) then 0 else null end));
  missing:='["bathymetryVertical","waterLevel","draft","positionEffect"]'::jsonb
    || case when target in (before_time,after_time) then '[]'::jsonb else '["temporalInterpolation"]'::jsonb end;
  if estimate->'uncertainty' is distinct from jsonb_build_object('method','sum-known-standard-uncertainties',
    'quantifiedMeters',null,'complete',false,'confidenceLevel',null,'components',components,'missingComponents',missing) then
    raise exception 'Budget d’incertitude UKC invalide.' using errcode='22023'; end if;
end;
$$;

create function sea_operation_private.guard_copernicus_captures() returns trigger
language plpgsql set search_path = '' as $$
declare point jsonb; points jsonb:='[]'::jsonb; capture jsonb; latitude numeric; longitude numeric;
  eta timestamptz; canonical numeric; stale boolean; changed boolean:=false; mode text;
begin
  -- An administrative revision starts as the exact historical declaration.
  if tg_op='INSERT' and sea_operation_private.is_admin_revision_clone(new) then return new; end if;
  canonical:=sea_operation_private.copernicus_number(new.draft#>'{vessel,draftMeters}');
  for point in select value from jsonb_array_elements(new.draft->'waypoints') loop
    if point ? 'ukcMode' and (jsonb_typeof(point->'ukcMode') is distinct from 'string' or point->>'ukcMode' not in ('manual','automatic')) then
      raise exception 'Mode UKC invalide.' using errcode='22023'; end if;
    mode:=coalesce(point->>'ukcMode','manual');
    if mode='manual' then
      if point ? 'ukcForecast' then point:=point-'ukcForecast'; changed:=true; end if;
    elsif point ? 'ukcForecast' then
      capture:=point->'ukcForecast';
      perform sea_operation_private.validate_copernicus_capture(capture);
      latitude:=sea_operation_private.capture_coordinate(point->>'latitude','latitude');
      longitude:=sea_operation_private.capture_coordinate(point->>'longitude','longitude');
      eta:=sea_operation_private.capture_eta_utc(point->>'eta');
      stale:=canonical is null or latitude is null or longitude is null or eta is null
        or capture->>'projectId' is distinct from new.draft#>>'{planning,projectId}'
        or capture->>'vesselId' is distinct from new.vessel_id::text or capture->>'pointId' is distinct from point->>'id'
        or abs((capture->>'latitude')::numeric-latitude)>0.00000001 or abs((capture->>'longitude')::numeric-longitude)>0.00000001
        or (capture->>'draftMeters')::numeric is distinct from canonical
        or sea_operation_private.capture_timestamp(capture->'etaUtc') is distinct from eta;
      if stale then
        if new.status='signed' and new.draft->>'decision'='GO' then raise exception 'Recalculez l’UKC automatique avant de signer.' using errcode='22023'; end if;
        point:=point-'ukcForecast'; changed:=true;
      end if;
    end if;
    if new.status='signed' and new.draft->>'decision'='GO' and mode='automatic' and point#>>'{ukcForecast,status}' is distinct from 'available' then
      raise exception 'Recalculez l’UKC automatique avant de signer.' using errcode='22023'; end if;
    points:=points||jsonb_build_array(point);
  end loop;
  if changed then new.draft:=jsonb_set(new.draft,'{waypoints}',points); end if;
  return new;
end;
$$;

-- Alphabetical ordering: immutable → vessel_draft → vessel_ukc → waypoint.
-- The captured TE has already been canonicalised for ordinary draft saves.
create trigger sea_operations_vessel_ukc_forecasts before insert or update of draft,status on public.sea_operations
  for each row execute function sea_operation_private.guard_copernicus_captures();
revoke all on function sea_operation_private.copernicus_number(jsonb),sea_operation_private.copernicus_contains(jsonb,numeric,numeric),
  sea_operation_private.validate_copernicus_capture(jsonb),sea_operation_private.guard_copernicus_captures() from public,anon,authenticated,service_role;
comment on function sea_operation_private.guard_copernicus_captures() is
  'Validated same-product/model-geoid UKC evidence; stale draft captures are removed after canonical draught, signed declarations are never rewritten. SeaPilot excludes depths <=10m for both models.';

-- Keep the manual field independent from the derived automatic value. The GO
-- transition trigger requires valid available evidence; NO GO stays signable
-- when the Captain records an interruption before the data can be completed.
do $migration$
declare definition text:=pg_get_functiondef('sea_operation_private.validate_draft(jsonb,boolean)'::regprocedure);
  needle text:='if btrim(item->>key) = '''' then raise exception ''Complétez chaque point du passage plan.''';
begin
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then
    raise exception 'Expected manual passage-plan field guard missing'; end if;
  execute replace(definition,needle,
    'if btrim(item->>key) = '''' and not (key=''ukc'' and coalesce(item->>''ukcMode'',''manual'')=''automatic'') then raise exception ''Complétez chaque point du passage plan.''');
end;
$migration$;
notify pgrst,'reload schema';
