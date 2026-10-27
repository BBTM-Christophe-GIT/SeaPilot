-- Optional project geography is business data, separate from SharePoint provenance.
create schema project_location_private;
revoke all on schema project_location_private from public, anon, authenticated;
grant usage on schema project_location_private to authenticated;

create function project_location_private.json_bytes(p_value jsonb) returns bigint
language plpgsql immutable strict set search_path = '' as $$
declare result bigint; count_items bigint;
begin
  if jsonb_typeof(p_value) = 'object' then
    select coalesce(sum(octet_length(to_jsonb(key)::text) + 2 + project_location_private.json_bytes(value)),0), count(*)
      into result, count_items from jsonb_each(p_value);
    return 2 + result - case when count_items > 0 then 1 else 0 end;
  elsif jsonb_typeof(p_value) = 'array' then
    select coalesce(sum(1 + project_location_private.json_bytes(value)),0), count(*)
      into result, count_items from jsonb_array_elements(p_value);
    return 2 + result - case when count_items > 0 then 1 else 0 end;
  end if;
  return octet_length(p_value::text);
end;
$$;

-- Match JavaScript string.length, including two UTF-16 units for non-BMP characters.
create function project_location_private.text_field(p_value jsonb,p_key text,p_max integer) returns text
language plpgsql immutable set search_path = '' as $$
declare result text;
begin
  if jsonb_typeof(p_value->p_key) is distinct from 'string' then raise exception 'Localisation du projet invalide.' using errcode='22023'; end if;
  result := p_value->>p_key;
  if char_length(result) + (select count(*) from regexp_matches(result,U&'[\+010000-\+10FFFF]','g')) > p_max then
    raise exception 'Localisation du projet : texte trop long.' using errcode='22023'; end if;
  return result;
end;
$$;

create function project_location_private.waypoint(p_value jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare result jsonb; field text;
begin
  if jsonb_typeof(p_value) is distinct from 'object' or jsonb_typeof(p_value->'denseTraffic') is distinct from 'boolean' then
    raise exception 'Point de localisation invalide.' using errcode='22023'; end if;
  result := jsonb_build_object('id',project_location_private.text_field(p_value,'id',200),
    'number',project_location_private.text_field(p_value,'number',80),
    'descriptionVhf',project_location_private.text_field(p_value,'descriptionVhf',4000),
    'latitude',project_location_private.text_field(p_value,'latitude',80),
    'longitude',project_location_private.text_field(p_value,'longitude',80),
    'ukc',project_location_private.text_field(p_value,'ukc',200),
    'eta',project_location_private.text_field(p_value,'eta',80),'denseTraffic',p_value->'denseTraffic');
  foreach field in array array['etaMode','ukcMode'] loop
    if p_value ? field then
      if jsonb_typeof(p_value->field) is distinct from 'string' or p_value->>field not in ('manual','automatic') then
        raise exception 'Mode de localisation invalide.' using errcode='22023'; end if;
      result := result || jsonb_build_object(field,p_value->field);
    end if;
  end loop;
  return result;
end;
$$;

create function project_location_private.normalize_plan(p_value jsonb,p_check_size boolean default true) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare result jsonb; items jsonb; item jsonb; normalized jsonb; vertices jsonb; vertex jsonb; field text; identity text; identities text[] := '{}';
begin
  if p_value is null or p_value = 'null'::jsonb then return null; end if;
  if jsonb_typeof(p_value) is distinct from 'object' or p_value->'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_value->'includeInPdf') is distinct from 'boolean'
    or (p_check_size and (octet_length(p_value::text) > 524288 or project_location_private.json_bytes(p_value) > 262144)) then
    raise exception 'Localisation du projet invalide ou trop volumineuse.' using errcode='22023'; end if;
  result := jsonb_build_object('version',1,'etd',project_location_private.text_field(p_value,'etd',80),
    'charts',project_location_private.text_field(p_value,'charts',20000),'includeInPdf',p_value->'includeInPdf');
  foreach field in array array['waypoints','points','zones'] loop
    if jsonb_typeof(p_value->field) is distinct from 'array' then raise exception 'Collection de localisation invalide.' using errcode='22023'; end if;
    if jsonb_array_length(p_value->field) > (case when field='zones' then 50 else 200 end) then
      raise exception 'Trop de points ou zones de localisation.' using errcode='22023'; end if;
    items := '[]'::jsonb;
    for item in select value from jsonb_array_elements(p_value->field) loop
      if field = 'zones' then
        if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'vertices') is distinct from 'array' then
          raise exception 'Zone de localisation invalide.' using errcode='22023'; end if;
        if jsonb_array_length(item->'vertices') > 200 then raise exception 'Trop de sommets dans la zone.' using errcode='22023'; end if;
        vertices := '[]'::jsonb;
        for vertex in select value from jsonb_array_elements(item->'vertices') loop
          if jsonb_typeof(vertex) is distinct from 'object' then raise exception 'Sommet de localisation invalide.' using errcode='22023'; end if;
          vertices := vertices || jsonb_build_array(jsonb_build_object('latitude',project_location_private.text_field(vertex,'latitude',80),
            'longitude',project_location_private.text_field(vertex,'longitude',80)));
        end loop;
        normalized := jsonb_build_object('id',project_location_private.text_field(item,'id',200),
          'name',project_location_private.text_field(item,'name',500),'vertices',vertices);
      else
        normalized := project_location_private.waypoint(item);
      end if;
      identity := normalized->>'id';
      if btrim(identity) = '' or identity = any(identities) then raise exception 'Identifiant de localisation vide ou dupliqué.' using errcode='22023'; end if;
      identities := array_append(identities,identity);
      items := items || jsonb_build_array(normalized);
    end loop;
    result := result || jsonb_build_object(field,items);
  end loop;
  return result;
end;
$$;

create function project_location_private.validate_overlay(p_overlay jsonb,p_waypoints jsonb) returns void
language plpgsql immutable set search_path = '' as $$
declare canonical jsonb; identity text; identities text[] := '{}'; item jsonb;
begin
  if jsonb_typeof(p_overlay) is distinct from 'object' or jsonb_typeof(p_waypoints) is distinct from 'array'
    or octet_length(p_overlay::text) > 1048576 or project_location_private.json_bytes(p_overlay) > 524288 then
    raise exception 'Localisation complémentaire invalide.' using errcode='22023'; end if;
  canonical := project_location_private.normalize_plan(p_overlay || jsonb_build_object('etd','','charts','','waypoints','[]'::jsonb,'includeInPdf',false),false)
    - array['etd','charts','waypoints','includeInPdf'];
  if canonical is distinct from p_overlay then raise exception 'La localisation complémentaire doit contenir uniquement ses géométries.' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_waypoints)
    union all select value from jsonb_array_elements(canonical->'points')
    union all select value from jsonb_array_elements(canonical->'zones') loop
    identity := item->>'id';
    if identity = any(identities) then raise exception 'Identifiant partagé entre route et localisation complémentaire.' using errcode='22023'; end if;
    identities := array_append(identities,identity);
  end loop;
end;
$$;

revoke all on all functions in schema project_location_private from public, anon, authenticated;
grant execute on all functions in schema project_location_private to authenticated;

alter table public.projects add column location_plan jsonb;
alter table public.projects add constraint projects_location_plan_check check (
  location_plan is null or (jsonb_typeof(location_plan)='object' and project_location_private.normalize_plan(location_plan)=location_plan)
);
comment on column public.projects.location_plan is 'Versioned optional location plan; editable geography only, without weather/radio/UKC captures. Separate from source_payload.';

-- Direct table writes remain revoked. This private writer carries only the
-- existing Admin/Direction project-edit authority and an exact concurrency token.
create function project_location_private.set_plan(p_project_id bigint,p_plan jsonb,p_expected_updated_at timestamptz) returns public.projects
language plpgsql security definer set search_path = '' as $$
declare company bigint := public.current_planning_company_id(); result public.projects; normalized jsonb := project_location_private.normalize_plan(p_plan);
begin
  if (select auth.uid()) is null or not coalesce(public.user_belongs_to_company(company),false)
    or not coalesce(public.has_any_role(array['admin','direction']),false) then
    raise exception 'Droits insuffisants pour modifier la localisation du projet.' using errcode='42501'; end if;
  select project.* into result from public.projects project where project.id=p_project_id and project.company_id=company for update;
  if not found then raise exception 'Projet inaccessible.' using errcode='P0002'; end if;
  if result.archived_at is not null then raise exception 'Un projet archivé ne peut pas être modifié.' using errcode='55000'; end if;
  if p_expected_updated_at is null or result.updated_at is distinct from p_expected_updated_at then
    raise exception 'Le projet a été modifié par un autre utilisateur.' using errcode='P0001'; end if;
  update public.projects project set location_plan=normalized,updated_by=(select auth.uid())
    where project.id=p_project_id and project.company_id=company returning project.* into result;
  return result;
end;
$$;
revoke all on function project_location_private.set_plan(bigint,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function project_location_private.set_plan(bigint,jsonb,timestamptz) to authenticated;


-- A separate name keeps older PostgREST callers unambiguous and preserves old snapshots.
create function public.projects_save_with_location(
  target_location_plan jsonb,
  target_project_id bigint default null,
  target_title text default null,
  target_client_id bigint default null,
  target_primary_vessel_id bigint default null,
  target_secondary_vessel_id bigint default null,
  target_status text default null,
  target_description text default null,
  target_starts_on date default null,
  target_ends_on date default null,
  target_delivery_at timestamptz default null,
  target_redelivery_at timestamptz default null,
  target_charter_starts_at timestamptz default null,
  target_charter_ends_at timestamptz default null,
  target_delivery_port text default null,
  target_redelivery_port text default null,
  target_contract_type text default null,
  target_operation_area text default null,
  target_is_rov_support boolean default false,
  target_is_diving_support boolean default false,
  target_owner_identity text default null,
  target_vessel_assignment_limit text default null,
  target_extension_count integer default null,
  target_extension_duration numeric default null,
  target_extension_unit text default null,
  target_auto_extension_period text default 'Voyage',
  target_max_extension_days integer default null,
  target_mobilisation_fee numeric default null,
  target_demobilisation_fee numeric default null,
  target_fee_currency text default null,
  target_charter_hire numeric default null,
  target_extension_hire numeric default null,
  target_hire_currency text default null,
  target_hire_unit text default null,
  target_max_audit_period text default null,
  target_supplytime_data jsonb default '{}'::jsonb,
  target_expected_updated_at timestamptz default null
) returns public.projects
language plpgsql security invoker set search_path = '' as $$
declare normalized jsonb := project_location_private.normalize_plan(target_location_plan); result public.projects;
begin
  result := public.projects_save(
    target_project_id => target_project_id,
    target_title => target_title,
    target_client_id => target_client_id,
    target_primary_vessel_id => target_primary_vessel_id,
    target_secondary_vessel_id => target_secondary_vessel_id,
    target_status => target_status,
    target_description => target_description,
    target_starts_on => target_starts_on,
    target_ends_on => target_ends_on,
    target_delivery_at => target_delivery_at,
    target_redelivery_at => target_redelivery_at,
    target_charter_starts_at => target_charter_starts_at,
    target_charter_ends_at => target_charter_ends_at,
    target_delivery_port => target_delivery_port,
    target_redelivery_port => target_redelivery_port,
    target_contract_type => target_contract_type,
    target_operation_area => target_operation_area,
    target_is_rov_support => target_is_rov_support,
    target_is_diving_support => target_is_diving_support,
    target_owner_identity => target_owner_identity,
    target_vessel_assignment_limit => target_vessel_assignment_limit,
    target_extension_count => target_extension_count,
    target_extension_duration => target_extension_duration,
    target_extension_unit => target_extension_unit,
    target_auto_extension_period => target_auto_extension_period,
    target_max_extension_days => target_max_extension_days,
    target_mobilisation_fee => target_mobilisation_fee,
    target_demobilisation_fee => target_demobilisation_fee,
    target_fee_currency => target_fee_currency,
    target_charter_hire => target_charter_hire,
    target_extension_hire => target_extension_hire,
    target_hire_currency => target_hire_currency,
    target_hire_unit => target_hire_unit,
    target_max_audit_period => target_max_audit_period,
    target_supplytime_data => target_supplytime_data,
    target_expected_updated_at => target_expected_updated_at
  );
  if result.location_plan is distinct from normalized then
    result := project_location_private.set_plan(result.id,normalized,result.updated_at);
  end if;
  return result;
end;
$$;
revoke all on function public.projects_save_with_location(jsonb,bigint,text,bigint,bigint,bigint,text,text,date,date,timestamptz,timestamptz,timestamptz,timestamptz,text,text,text,text,boolean,boolean,text,text,integer,numeric,text,text,integer,numeric,numeric,text,numeric,numeric,text,text,text,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.projects_save_with_location(jsonb,bigint,text,bigint,bigint,bigint,text,text,date,date,timestamptz,timestamptz,timestamptz,timestamptz,text,text,text,text,boolean,boolean,text,text,integer,numeric,text,text,integer,numeric,numeric,text,numeric,numeric,text,text,text,jsonb,timestamptz) to authenticated;

-- Reuse the existing company/profile/temporary-captain projection without recanonicalizing edited routes.
do $migration$
declare definition text; needle constant text := '''description'',regexp_replace';
begin
  definition := pg_get_functiondef('sea_operation_private.planning_context(date)'::regprocedure);
  definition := replace(definition,E'\r\n',E'\n');
  if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1 then
    raise exception 'Expected unique planning location projection anchor.';
  end if;
  execute replace(definition,needle,'''locationPlan'',project.location_plan,' || chr(10) || '      ' || needle);
end;
$migration$;

-- Optional independent geometry is validated at save/sign without fetching a newer project.
do $migration$
declare definition text; anchor integer; needle constant text := E'\nbegin\n';
  size_needle constant text := 'or octet_length(p_draft::text) > 500000';
begin
  definition := pg_get_functiondef('sea_operation_private.validate_draft(jsonb,boolean)'::regprocedure);
  definition := replace(definition,E'\r\n',E'\n');
  if position('locationOverlay' in definition) > 0 then raise exception 'Unexpected pre-existing location overlay validation.'; end if;
  if (length(definition)-length(replace(definition,size_needle,'')))/length(size_needle) <> 1 then
    raise exception 'Expected unique sea-operation payload size guard.'; end if;
  -- The original 500000-byte budget still applies to every non-overlay field.
  -- Overlay JSON has its own 512 KiB budget; formatting whitespace is not payload.
  definition := replace(definition,size_needle,
    'or octet_length((p_draft-''locationOverlay'')::text) > 500000 or project_location_private.json_bytes(p_draft) > 1024288');
  anchor := position(needle in definition);
  if anchor = 0 then raise exception 'Expected sea-operation validation entry point.'; end if;
  execute left(definition,anchor+length(needle)-1)
    || E'  if p_draft ? ''locationOverlay'' then perform project_location_private.validate_overlay(p_draft->''locationOverlay'',p_draft->''waypoints''); end if;\n'
    || substr(definition,anchor+length(needle));
end;
$migration$;
notify pgrst,'reload schema';
