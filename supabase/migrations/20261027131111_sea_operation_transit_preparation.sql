-- Transit is a virtual mission: no commercial project or planning occurrence is created.
create function sea_operation_private.preparation_id(p_value text) returns bigint
language plpgsql immutable set search_path='' as $$
begin
  if p_value is null or p_value='' then return null; end if;
  if p_value !~ '^[1-9][0-9]{0,18}$' or p_value::numeric>9223372036854775807 then
    raise exception 'Identifiant de préparation invalide.' using errcode='22023'; end if;
  return p_value::bigint;
end;
$$;

create function sea_operation_private.preparation_date(p_value text) returns date
language plpgsql immutable set search_path='' as $$
declare result date;
begin
  if p_value is null or p_value !~ '^[1-9][0-9]{3}-[0-9]{2}-[0-9]{2}$' then
    raise exception 'Date de préparation invalide.' using errcode='22023'; end if;
  result:=p_value::date;
  if to_char(result,'YYYY-MM-DD')<>p_value then raise exception 'Date de préparation invalide.' using errcode='22023'; end if;
  return result;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Date de préparation invalide.' using errcode='22023';
end;
$$;
create function sea_operation_private.preparation_day(p_draft jsonb) returns date
language sql stable set search_path='' as $$
  select coalesce(nullif(p_draft#>>'{planning,date}','')::date,nullif(p_draft#>>'{transit,date}','')::date,
    nullif(split_part(p_draft#>>'{vessel,etd}','T',1),'')::date,(now() at time zone 'Europe/Paris')::date);
$$;
create function sea_operation_private.preparation_mission(p_draft jsonb) returns text
language sql immutable set search_path='' as $$
  select case when p_draft ? 'planning' then
    case when coalesce(p_draft#>>'{planning,projectId}','')<>'' then 'project:'||(p_draft#>>'{planning,projectId}')
      else 'occurrence:'||split_part(p_draft#>>'{planning,operationId}',':',1) end
    when p_draft ? 'transit' then 'transit' else null end;
$$;

create function sea_operation_private.clients_catalog() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare company bigint:=sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company),false) then raise exception 'Accès refusé aux opérations en mer.' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',client.id::text,'name',client.name,
    'contact',concat_ws(' · ',nullif(client.contact_name,''),nullif(client.email,''),nullif(client.phone,''),
      nullif(concat_ws(', ',nullif(client.address,''),nullif(concat_ws(' ',nullif(client.postal_code,''),nullif(client.city,'')),''),nullif(client.country,'')),'')))
    order by client.name,client.id) from public.clients client where client.company_id=company and client.active and client.archived_at is null),'[]'::jsonb);
end;
$$;

create function sea_operation_private.vessel_context(p_date date,p_vessel_id bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare company bigint:=sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company),false) then raise exception 'Accès refusé aux opérations en mer.' using errcode='42501'; end if;
  if p_date is null or p_date not between date '1000-01-01' and date '9999-12-31' then raise exception 'Date de préparation invalide.' using errcode='22023'; end if;
  if not exists(select from public.vessels vessel where vessel.id=p_vessel_id and vessel.company_id=company and vessel.active and vessel.asset_kind='vessel') then
    raise exception 'Navire inaccessible.' using errcode='42501'; end if;
  return jsonb_build_object('date',p_date,'vesselId',p_vessel_id::text,
    'captains',coalesce((select jsonb_agg(jsonb_build_object('personId',captain.person_id::text,'name',captain.name,'functionLabel',captain.function_label,
      'hasSignature',sea_operation_private.active_signature(company,captain.person_id)<>'{}'::jsonb,'canSign',captain.user_id=(select auth.uid())) order by captain.name,captain.person_id)
      from sea_operation_private.captains(company,p_vessel_id,p_date) captain),'[]'::jsonb),
    'canSign',exists(select from sea_operation_private.captains(company,p_vessel_id,p_date) captain where captain.user_id=(select auth.uid())));
end;
$$;
create function public.sea_operation_vessel_context(p_date date,p_vessel_id bigint) returns jsonb
language sql stable security invoker set search_path='' as $$select sea_operation_private.vessel_context(p_date,p_vessel_id);$$;

create function sea_operation_private.vessel_captain_signature(p_date date,p_vessel_id bigint,p_captain_person_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare context jsonb:=sea_operation_private.vessel_context(p_date,p_vessel_id); snapshot jsonb; company bigint:=sea_operation_private.company_id(); person bigint;
begin
  person:=sea_operation_private.preparation_id(p_captain_person_id);
  if not exists(select from jsonb_array_elements(context->'captains') captain where captain->>'personId'=p_captain_person_id) then
    raise exception 'Capitaine non affecté à ce navire et à cette date.' using errcode='42501'; end if;
  snapshot:=sea_operation_private.active_signature(company,person);
  if snapshot='{}'::jsonb then return null; end if;
  delete from sea_operation_private.signature_preview_grants where user_id=(select auth.uid()) and expires_at<now();
  insert into sea_operation_private.signature_preview_grants(user_id,company_id,storage_bucket,storage_path,expires_at)
    values((select auth.uid()),company,snapshot->>'storage_bucket',snapshot->>'storage_path',now()+interval '10 minutes')
    on conflict(user_id,storage_bucket,storage_path) do update set company_id=excluded.company_id,expires_at=excluded.expires_at;
  return snapshot;
end;
$$;
create function public.sea_operation_vessel_captain_signature(p_date date,p_vessel_id bigint,p_captain_person_id text) returns jsonb
language sql security invoker set search_path='' as $$select sea_operation_private.vessel_captain_signature(p_date,p_vessel_id,p_captain_person_id);$$;

-- Previous JSON is supplied only from a scoped, version-checked locked record below.
create function sea_operation_private.canonical_preparation(p_draft jsonb,p_previous jsonb default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare company bigint:=sea_operation_private.company_id(); choice jsonb; context jsonb; captain jsonb; selected text; vessel public.vessels; client public.clients;
  mission text; previous_mission text; locked_client boolean; linked boolean:=p_draft ? 'planning' or p_draft ? 'transit'; field text;
begin
  if not coalesce(sea_operation_private.can_read(company),false) then raise exception 'Accès refusé aux opérations en mer.' using errcode='42501'; end if;
  if p_draft ? 'planning' and p_draft ? 'transit' then raise exception 'Choisissez un projet ou Transit.' using errcode='22023'; end if;
  if p_draft ? 'planning' then
    context:=p_draft->'planning';
    if jsonb_typeof(context) is distinct from 'object' then raise exception 'Contexte planning invalide.' using errcode='22023'; end if;
    foreach field in array array['date','operationId','projectId','captainPersonId'] loop
      if jsonb_typeof(context->field) is distinct from 'string' then raise exception 'Contexte planning invalide.' using errcode='22023'; end if;
    end loop;
    choice:=sea_operation_private.choice(sea_operation_private.preparation_date(context->>'date'),context->>'operationId');
    if choice->>'projectId' is distinct from context->>'projectId' then raise exception 'Le projet doit correspondre à l’opération sélectionnée.' using errcode='22023'; end if;
    p_draft:=jsonb_set(p_draft,'{project}',choice->'project');
  elsif p_draft ? 'transit' then
    context:=p_draft->'transit';
    if jsonb_typeof(context) is distinct from 'object' or jsonb_typeof(context->'date') is distinct from 'string'
      or jsonb_typeof(context->'captainPersonId') is distinct from 'string' then raise exception 'Contexte Transit invalide.' using errcode='22023'; end if;
    if context-array['date','captainPersonId']<>'{}'::jsonb then raise exception 'Contexte Transit invalide.' using errcode='22023'; end if;
    perform sea_operation_private.preparation_date(context->>'date');
    p_draft:=jsonb_set(p_draft,'{project}','"Transit"'::jsonb);
  end if;
  if p_draft ? 'clientId' and jsonb_typeof(p_draft->'clientId') is distinct from 'string' then raise exception 'Client invalide.' using errcode='22023'; end if;
  perform sea_operation_private.preparation_id(p_draft->>'clientId');
  if linked then perform sea_operation_private.preparation_id(context->>'captainPersonId'); end if;
  mission:=sea_operation_private.preparation_mission(p_draft); previous_mission:=sea_operation_private.preparation_mission(p_previous);
  if p_previous is not null and previous_mission is not null and mission is null then
    raise exception 'Sélectionnez un projet ou Transit pour changer de mission.' using errcode='22023'; end if;
  locked_client:=p_previous is not null and btrim(coalesce(p_previous->>'client',''))<>'' and mission is not distinct from previous_mission;
  if locked_client then
    p_draft:=jsonb_set(p_draft,'{client}',p_previous->'client');
    if p_previous ? 'clientId' then p_draft:=jsonb_set(p_draft,'{clientId}',p_previous->'clientId'); else p_draft:=p_draft-'clientId'; end if;
  elsif choice is not null and btrim(coalesce(choice->>'client',''))<>'' then
    p_draft:=jsonb_set(jsonb_set(p_draft,'{client}',choice->'client'),'{clientId}',coalesce(choice->'clientId','""'::jsonb));
  elsif nullif(p_draft->>'clientId','') is not null then
    select item.* into client from public.clients item where item.id=sea_operation_private.preparation_id(p_draft->>'clientId')
      and item.company_id=company and item.active and item.archived_at is null;
    if not found then raise exception 'Client inaccessible.' using errcode='42501'; end if;
    p_draft:=jsonb_set(p_draft,'{client}',to_jsonb(client.name));
  elsif linked or p_draft ? 'clientId' then
    if btrim(coalesce(p_draft->>'client',''))<>'' then raise exception 'Sélectionnez un client enregistré.' using errcode='22023'; end if;
    p_draft:=jsonb_set(p_draft,'{client}','""'::jsonb);
  end if;
  -- Client contact, description, ports, quays and ETD/ETA are intentional operational edits.
  if nullif(p_draft#>>'{vessel,id}','') is not null then
    select item.* into vessel from public.vessels item where item.id=sea_operation_private.preparation_id(p_draft#>>'{vessel,id}')
      and item.company_id=company and item.active and item.asset_kind='vessel';
    if not found then raise exception 'Navire inaccessible.' using errcode='42501'; end if;
    p_draft:=jsonb_set(p_draft,'{vessel,name}',to_jsonb(vessel.name));
    selected:=concat_ws(' / ',nullif(vessel.registration_number,''),nullif(vessel.imo_number,''));
    if btrim(selected)<>'' then p_draft:=jsonb_set(p_draft,'{vessel,registrationImo}',to_jsonb(selected)); end if;
  end if;
  if linked then
    selected:=context->>'captainPersonId';
    if selected<>'' then
      if vessel.id is null then raise exception 'Choisissez le navire du capitaine.' using errcode='42501'; end if;
      select item into captain from jsonb_array_elements(sea_operation_private.vessel_context(sea_operation_private.preparation_day(p_draft),vessel.id)->'captains') item where item->>'personId'=selected;
      if captain is null then raise exception 'Le capitaine n’exerce pas cette fonction sur le navire et au jour choisis.' using errcode='42501'; end if;
      selected:=captain->>'name';
    end if;
    p_draft:=jsonb_set(jsonb_set(p_draft,'{vessel,captainName}',to_jsonb(selected)),'{signature,captainName}',to_jsonb(selected));
  end if;
  return p_draft;
end;
$$;
create or replace function sea_operation_private.planning_draft(p_draft jsonb) returns jsonb
language sql stable security definer set search_path='' as $$select sea_operation_private.canonical_preparation(p_draft);$$;

create or replace function sea_operation_private.record_date(p_record public.sea_operations) returns date
language sql stable set search_path='' as $$select sea_operation_private.preparation_day(p_record.draft);$$;
create or replace function sea_operation_private.can_sign_payload(p_company bigint,p_vessel bigint,p_draft jsonb) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select from sea_operation_private.captains(p_company,p_vessel,sea_operation_private.preparation_day(p_draft)) captain
    where captain.user_id=(select auth.uid()) and (coalesce(p_draft#>>'{planning,captainPersonId}',p_draft#>>'{transit,captainPersonId}') is null
      or captain.person_id::text=coalesce(p_draft#>>'{planning,captainPersonId}',p_draft#>>'{transit,captainPersonId}')));
$$;
create or replace function sea_operation_private.can_sign_record(p_record public.sea_operations) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin
  if p_record.status<>'draft' or not coalesce(sea_operation_private.can_read(p_record.company_id),false)
    or not sea_operation_private.record_is_current(p_record.id) then return false; end if;
  return sea_operation_private.can_sign_payload(p_record.company_id,p_record.vessel_id,p_record.draft);
end;
$$;
create or replace function sea_operation_private.save(p_id uuid,p_version integer,p_draft jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; snapshot jsonb:='{}'::jsonb; company bigint:=sea_operation_private.company_id(); previous public.sea_operations; selected text;
begin
  if not coalesce(sea_operation_private.can_read(company),false) then raise exception 'Accès refusé aux opérations en mer.' using errcode='42501'; end if;
  if p_id is not null then
    select operation.* into previous from public.sea_operations operation where operation.id=p_id and operation.company_id=company for update;
    if previous.id is null or not coalesce(sea_operation_private.can_edit(previous),false) then raise exception 'Modification de cette opération refusée.' using errcode='42501'; end if;
    if p_version is distinct from previous.version then raise exception 'L’opération a été modifiée. Rechargez-la avant de continuer.' using errcode='40001'; end if;
  end if;
  perform sea_operation_private.validate_draft(p_draft,false);
  p_draft:=sea_operation_private.canonical_preparation(p_draft,case when previous.id is null then null else previous.draft end);
  result:=sea_operation_private.save_core(p_id,p_version,p_draft);
  selected:=coalesce(p_draft#>>'{planning,captainPersonId}',p_draft#>>'{transit,captainPersonId}');
  if nullif(selected,'') is not null then snapshot:=sea_operation_private.active_signature(company,sea_operation_private.preparation_id(selected)); end if;
  update public.sea_operations set signature_snapshot=snapshot where id=(result->>'id')::uuid;
  return sea_operation_private.detail((result->>'id')::uuid);
end;
$$;

-- Project authorization is retained; the operational vessel can be any active
-- vessel of that same company, independently of its commercial assignment.
create or replace function sea_operation_private.ukc_context(p_project_id bigint,p_vessel_id bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare company bigint:=sea_operation_private.company_id(); vessel public.vessels;
begin
  if not coalesce(sea_operation_private.can_read(company),false) then raise exception 'Accès refusé aux opérations en mer.' using errcode='42501'; end if;
  if p_project_id is null or p_project_id<=0 or p_vessel_id is null or p_vessel_id<=0 then raise exception 'Projet ou navire invalide.' using errcode='22023'; end if;
  select item.* into vessel from public.vessels item where item.id=p_vessel_id and item.company_id=company and item.active and item.asset_kind='vessel'
    and exists(select from public.projects project where project.id=p_project_id and project.company_id=company and project.archived_at is null
      and exists(select from public.planning_projects occurrence where occurrence.company_id=company and occurrence.catalog_project_id=project.id and occurrence.cancelled_at is null));
  if not found then raise exception 'Projet ou navire inaccessible.' using errcode='42501'; end if;
  return jsonb_build_object('projectId',p_project_id::text,'vesselId',vessel.id::text,'draftMeters',vessel.draft_m);
end;
$$;
create function sea_operation_private.transit_ukc_context(p_date date,p_vessel_id bigint) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare context jsonb:=sea_operation_private.vessel_context(p_date,p_vessel_id); company bigint:=sea_operation_private.company_id(); draft numeric;
begin
  select vessel.draft_m into draft from public.vessels vessel where vessel.id=p_vessel_id and vessel.company_id=company;
  return jsonb_build_object('projectId','','vesselId',context->>'vesselId','transit',jsonb_build_object('date',context->>'date','vesselId',context->>'vesselId'),'draftMeters',draft);
end;
$$;
create function public.sea_operation_transit_ukc_context(p_date date,p_vessel_id bigint) returns jsonb
language sql stable security invoker set search_path='' as $$select sea_operation_private.transit_ukc_context(p_date,p_vessel_id);$$;

-- Guarded source patches preserve later payload/UKC/signature protections.
do $migration$
declare definition text; needle text; replacement text; anchor integer;
begin
  definition:=replace(pg_get_functiondef('sea_operation_private.overview()'::regprocedure),E'\r\n',E'\n');
  needle:='''records'',';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected overview records anchor.'; end if;
  execute replace(definition,needle,'''clients'',sea_operation_private.clients_catalog(),'||needle);

  definition:=replace(pg_get_functiondef('sea_operation_private.planning_context(date)'::regprocedure),E'\r\n',E'\n');
  needle:='''client'',coalesce(client.name,project.client_name,occurrence.client_name,''''),';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected planning client anchor.'; end if;
  execute replace(definition,needle,'''clientId'',coalesce(client.id::text,project.client_id::text,''''),'||needle);

  definition:=replace(pg_get_functiondef('sea_operation_private.validate_draft(jsonb,boolean)'::regprocedure),E'\r\n',E'\n');
  if position('Contexte Transit' in definition)>0 then raise exception 'Unexpected existing Transit validation.'; end if;
  needle:=E'\nbegin\n'; anchor:=position(needle in definition);
  if anchor=0 then raise exception 'Expected draft validation entry point.'; end if;
  replacement:=E'  if p_draft ? ''transit'' then\n'
    ||E'    if p_draft ? ''planning'' or jsonb_typeof(p_draft->''transit'') is distinct from ''object''\n'
    ||E'      or jsonb_typeof(p_draft#>''{transit,date}'') is distinct from ''string'' or jsonb_typeof(p_draft#>''{transit,captainPersonId}'') is distinct from ''string'' then\n'
    ||E'      raise exception ''Contexte Transit invalide.'' using errcode=''22023''; end if;\n'
    ||E'    if (p_draft->''transit'')-array[''date'',''captainPersonId'']<>''{}''::jsonb then raise exception ''Contexte Transit invalide.'' using errcode=''22023''; end if;\n'
    ||E'    perform sea_operation_private.preparation_date(p_draft#>>''{transit,date}'');\n'
    ||E'    perform sea_operation_private.preparation_id(p_draft#>>''{transit,captainPersonId}'');\n'
    ||E'  end if;\n'
    ||E'  if p_draft ? ''clientId'' then\n'
    ||E'    if jsonb_typeof(p_draft->''clientId'') is distinct from ''string'' then raise exception ''Client invalide.'' using errcode=''22023''; end if;\n'
    ||E'    perform sea_operation_private.preparation_id(p_draft->>''clientId'');\n'
    ||E'  end if;\n';
  execute left(definition,anchor+length(needle)-1)||replacement||substr(definition,anchor+length(needle));

  definition:=replace(pg_get_functiondef('sea_operation_private.sign(uuid,integer,text,boolean)'::regprocedure),E'\r\n',E'\n');
  needle:='perform sea_operation_private.planning_draft(record.draft);';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected sign preparation guard.'; end if;
  definition:=replace(definition,needle,'perform sea_operation_private.canonical_preparation(record.draft,record.draft);');
  needle:='where c.user_id = (select auth.uid()) limit 1;';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected actual signer selection guard.'; end if;
  execute replace(definition,needle,'where c.user_id = (select auth.uid()) and (coalesce(record.draft#>>''{planning,captainPersonId}'',record.draft#>>''{transit,captainPersonId}'') is null or c.person_id::text=coalesce(record.draft#>>''{planning,captainPersonId}'',record.draft#>>''{transit,captainPersonId}'')) limit 1;');

  definition:=replace(pg_get_functiondef('sea_operation_private.validate_copernicus_capture(jsonb)'::regprocedure),E'\r\n',E'\n');
  needle:='foreach key in array array[''projectId'',''vesselId''] loop';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected UKC identity loop.'; end if;
  replacement:=E'if p_capture ? ''transit'' then\n'
    ||E'    if p_capture->>''projectId'' is distinct from '''' or jsonb_typeof(p_capture->''transit'') is distinct from ''object''\n'
    ||E'      or jsonb_typeof(p_capture#>''{transit,date}'') is distinct from ''string''\n'
    ||E'      or p_capture#>''{transit,vesselId}'' is distinct from p_capture->''vesselId'' then\n'
    ||E'      raise exception ''Contexte Transit UKC invalide.'' using errcode=''22023''; end if;\n'
    ||E'    if (p_capture->''transit'')-array[''date'',''vesselId'']<>''{}''::jsonb then raise exception ''Contexte Transit UKC invalide.'' using errcode=''22023''; end if;\n'
    ||E'    perform sea_operation_private.preparation_date(p_capture#>>''{transit,date}'');\n'
    ||E'  elsif jsonb_typeof(p_capture->''projectId'') is distinct from ''string'' or p_capture->>''projectId'' !~ ''^[1-9][0-9]{0,18}$'' then\n'
    ||E'    raise exception ''Projet de capture UKC invalide.'' using errcode=''22023'';\n'
    ||E'  else perform sea_operation_private.preparation_id(p_capture->>''projectId''); end if;\n'
    ||E'  foreach key in array array[''vesselId''] loop';
  execute replace(definition,needle,replacement);

  definition:=replace(pg_get_functiondef('sea_operation_private.guard_copernicus_captures()'::regprocedure),E'\r\n',E'\n');
  needle:='or capture->>''projectId'' is distinct from new.draft#>>''{planning,projectId}''';
  if (length(definition)-length(replace(definition,needle,'')))/length(needle)<>1 then raise exception 'Expected UKC project guard.'; end if;
  replacement:='or capture->>''projectId'' is distinct from (case when new.draft ? ''transit'' then '''' else new.draft#>>''{planning,projectId}'' end)'
    ||E'\n        or capture->''transit'' is distinct from (case when new.draft ? ''transit'' then jsonb_build_object(''date'',new.draft#>>''{transit,date}'',''vesselId'',new.vessel_id::text) else null::jsonb end)';
  execute replace(definition,needle,replacement);
end;
$migration$;

revoke all on function sea_operation_private.preparation_id(text),sea_operation_private.preparation_date(text),
  sea_operation_private.preparation_day(jsonb),sea_operation_private.preparation_mission(jsonb),sea_operation_private.clients_catalog(),
  sea_operation_private.vessel_context(date,bigint),sea_operation_private.vessel_captain_signature(date,bigint,text),
  sea_operation_private.canonical_preparation(jsonb,jsonb),sea_operation_private.transit_ukc_context(date,bigint),
  public.sea_operation_vessel_context(date,bigint),public.sea_operation_vessel_captain_signature(date,bigint,text),public.sea_operation_transit_ukc_context(date,bigint)
  from public,anon,authenticated,service_role;
grant execute on function sea_operation_private.preparation_id(text),sea_operation_private.preparation_date(text),
  sea_operation_private.preparation_day(jsonb),sea_operation_private.preparation_mission(jsonb),sea_operation_private.clients_catalog(),
  sea_operation_private.vessel_context(date,bigint),sea_operation_private.vessel_captain_signature(date,bigint,text),
  sea_operation_private.canonical_preparation(jsonb,jsonb),sea_operation_private.transit_ukc_context(date,bigint),
  public.sea_operation_vessel_context(date,bigint),public.sea_operation_vessel_captain_signature(date,bigint,text),public.sea_operation_transit_ukc_context(date,bigint)
  to authenticated;
notify pgrst,'reload schema';
