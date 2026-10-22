-- GO / NO GO declaration: drafts are collaborative; a real assigned captain
-- signs the exact saved revision. Signed declarations cannot be rewritten.
create schema if not exists sea_operation_private;
revoke all on schema sea_operation_private from public, anon;
grant usage on schema sea_operation_private to authenticated;

create function sea_operation_private.company_id() returns bigint
language sql stable security definer set search_path = '' as $$
  select profile.active_company_id from public.profiles profile
  join public.company_memberships membership on membership.user_id = profile.id
    and membership.company_id = profile.active_company_id and membership.active
  where profile.id = (select auth.uid());
$$;

create function sea_operation_private.can_read(p_company_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and p_company_id = sea_operation_private.company_id()
    and public.has_company_role(p_company_id,array['admin','direction','armement','capitaine','marin'])
    and exists(select 1 from public.user_roles assignment
      join public.role_module_permissions permission on permission.role_key = assignment.role_key
      where assignment.user_id = (select auth.uid()) and assignment.company_id = p_company_id
        and permission.module_key = 'seaOperations' and permission.is_visible);
$$;

create function sea_operation_private.actor_name(p_company_id bigint) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(concat_ws(' ',person.first_name,person.last_name)),''),
    nullif(btrim(profile.display_name),''),profile.email,'Utilisateur SeaPilot')
  from public.profiles profile left join public.people person on person.user_id = profile.id
    and person.company_id = p_company_id and person.active
  where profile.id = (select auth.uid()) order by person.id limit 1;
$$;

create function sea_operation_private.can_sign_vessel(p_company_id bigint,p_vessel_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select sea_operation_private.can_read(p_company_id)
    and public.has_company_role(p_company_id,array['capitaine'])
    and exists(select 1 from public.people person join public.planning_assignments assignment
      on assignment.company_id = person.company_id and assignment.vessel_id = p_vessel_id
      where person.user_id = (select auth.uid()) and person.company_id = p_company_id and person.active
        and assignment.confirmation_status = 'confirmed'
        and (now() at time zone 'Europe/Paris')::date between assignment.starts_on and assignment.ends_on
        and (assignment.captain_person_id = person.id or (assignment.crew_person_id = person.id and
          translate(lower(case when lower(btrim(coalesce(assignment.assignment_role,'')))
            in ('','crew','equipage','équipage','pont','machine','mecanique','mécanique','officier','marin')
            then coalesce(person.function_label,'') else assignment.assignment_role end),
            'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc') ~ '(capitaine|captain|commandant)')));
$$;

create function sea_operation_private.active_checks(p_draft jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select array['vesselCondition','stability','provisions','water','fuel','operationEquipment',
    'navigationEquipment','seaClosures','crewCredentials','crewRoles','watchesAssigned',
    'standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather']::text[]
    || case when p_draft #>> '{applicability,towing}' = 'yes'
      then array['towingLimits','towingPlan','towingInsurance','towingAuthorization'] else '{}'::text[] end
    || case when p_draft #>> '{applicability,cargo}' = 'yes'
      then array['cargoStability','dangerousGoods','cargoLashing'] else '{}'::text[] end
    || case when p_draft #>> '{applicability,divingSupport}' = 'yes'
      then array['divingMedicalKit'] else '{}'::text[] end;
$$;

create function sea_operation_private.validate_draft(p_draft jsonb,p_sign boolean default false) returns void
language plpgsql immutable set search_path = '' as $$
declare key text; item jsonb; answer text; departure timestamptz; arrival timestamptz; signature_date date;
  all_checks constant text[] := array['vesselCondition','stability','provisions','water','fuel','operationEquipment','navigationEquipment','seaClosures',
    'towingLimits','towingPlan','towingInsurance','towingAuthorization','cargoStability','dangerousGoods','cargoLashing','divingMedicalKit',
    'crewCredentials','crewRoles','watchesAssigned','standingOrders','nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'];
  blocking constant text[] := array['vesselCondition','stability','divingMedicalKit','crewCredentials','crewRoles','watchesAssigned',
    'nauticalDocumentation','navigationNotices','portWorkNotices','portRegulations','berthAvailable','weather'];
begin
  if jsonb_typeof(p_draft) is distinct from 'object'
    or jsonb_typeof(p_draft->'version') is distinct from 'number'
    or p_draft->'version' is distinct from '1'::jsonb
    or octet_length(p_draft::text) > 500000 then
    raise exception 'Le formulaire Opération en Mer est invalide.' using errcode = '22023'; end if;
  foreach key in array array['project','client','clientContact','description','charts','risks','decision'] loop
    if jsonb_typeof(p_draft->key) is distinct from 'string' then
      raise exception 'Le champ % est invalide.',key using errcode = '22023'; end if;
  end loop;
  foreach key in array array['vessel','applicability','checks','justifications','dapaq','towedVesselBoarding','supplies','signature'] loop
    if jsonb_typeof(p_draft->key) is distinct from 'object' then
      raise exception 'La rubrique % est invalide.',key using errcode = '22023'; end if;
  end loop;
  foreach key in array array['specialPersonnel','portServices','waypoints'] loop
    if jsonb_typeof(p_draft->key) is distinct from 'array' then
      raise exception 'La liste % est invalide.',key using errcode = '22023'; end if;
  end loop;
  foreach key in array all_checks loop
    if jsonb_typeof(p_draft->'checks'->key) is distinct from 'string'
      or p_draft->'checks'->>key not in ('','yes','no')
      or jsonb_typeof(p_draft->'justifications'->key) is distinct from 'string' then
      raise exception 'Le contrôle % est invalide.',key using errcode = '22023'; end if;
  end loop;
  if exists(select 1 from jsonb_object_keys(p_draft->'checks') k where not k = any(all_checks))
    or p_draft->>'decision' not in ('','GO','NO_GO') then
    raise exception 'Contrôle ou décision inconnu.' using errcode = '22023'; end if;
  foreach key in array array['towing','cargo','divingSupport','supplies'] loop
    if jsonb_typeof(p_draft->'applicability'->key) is distinct from 'string'
      or p_draft->'applicability'->>key not in ('','yes','no') then
      raise exception 'L’applicabilité % est invalide.',key using errcode = '22023'; end if;
  end loop;
  foreach key in array array['id','name','registrationImo','captainName','departurePort','departureQuay','arrivalPort','arrivalQuay','etd','eta'] loop
    if jsonb_typeof(p_draft->'vessel'->key) is distinct from 'string' then
      raise exception 'Le champ navire % est invalide.',key using errcode = '22023'; end if;
  end loop;
  foreach key in array array['captainName','date','place'] loop
    if jsonb_typeof(p_draft->'signature'->key) is distinct from 'string' then
      raise exception 'La signature est invalide.' using errcode = '22023'; end if;
  end loop;
  if jsonb_typeof(p_draft #> '{signature,acknowledged}') is distinct from 'boolean' then
    raise exception 'L’attestation de signature est invalide.' using errcode = '22023'; end if;
  foreach key in array array['method','preparedBy','agentName','agentContact'] loop
    if jsonb_typeof(p_draft->'dapaq'->key) is distinct from 'string' then
      raise exception 'La DAPAQ est invalide.' using errcode = '22023'; end if;
  end loop;
  if p_draft #>> '{dapaq,method}' not in ('','nomade','email')
    or p_draft #>> '{dapaq,preparedBy}' not in ('','armament','captain','agent')
    or jsonb_typeof(p_draft #> '{towedVesselBoarding,required}') is distinct from 'string'
    or p_draft #>> '{towedVesselBoarding,required}' not in ('','yes','no')
    or jsonb_typeof(p_draft #> '{towedVesselBoarding,measures}') is distinct from 'string'
    or p_draft #>> '{towedVesselBoarding,measures}' not in ('','sms','specific')
    or jsonb_typeof(p_draft #> '{towedVesselBoarding,details}') is distinct from 'string'
    or jsonb_typeof(p_draft->'mandatoryServicesNotified') is distinct from 'boolean'
    or jsonb_typeof(p_draft #> '{supplies,delegated}') is distinct from 'string'
    or p_draft #>> '{supplies,delegated}' not in ('','yes','no')
    or jsonb_typeof(p_draft #> '{supplies,items}') is distinct from 'array'
    or jsonb_typeof(p_draft #> '{supplies,customerAccountsPrepared}') is distinct from 'boolean' then
    raise exception 'DAPAQ, remorquage ou approvisionnement invalide.' using errcode = '22023'; end if;
  foreach key in array array['shipchandlerName','shipchandlerContact','suppliers'] loop
    if jsonb_typeof(p_draft->'supplies'->key) is distinct from 'string' then
      raise exception 'Approvisionnement invalide.' using errcode = '22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_draft->'specialPersonnel') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'name') is distinct from 'string'
      or jsonb_typeof(item->'phone') is distinct from 'string' then
      raise exception 'Contact spécial invalide.' using errcode = '22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_draft->'portServices') loop
    if jsonb_typeof(item) is distinct from 'string' or item #>> '{}' not in ('towing','pilotage','mooring','none') then
      raise exception 'Service portuaire invalide.' using errcode = '22023'; end if;
  end loop;
  if (select count(*) <> count(distinct value) from jsonb_array_elements(p_draft->'portServices'))
    or ((p_draft->'portServices') ? 'none' and jsonb_array_length(p_draft->'portServices') > 1) then
    raise exception 'Les services portuaires sont contradictoires.' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(p_draft #> '{supplies,items}') loop
    if jsonb_typeof(item) is distinct from 'string'
      or item #>> '{}' not in ('spareParts','materials','filters','tools','chemicals','provisions','drinkingWater','hygiene','cleaning','fuel') then
      raise exception 'Besoin d’approvisionnement invalide.' using errcode = '22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(p_draft->'waypoints') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'denseTraffic') is distinct from 'boolean' then
      raise exception 'Point du passage plan invalide.' using errcode = '22023'; end if;
    foreach key in array array['id','number','descriptionVhf','latitude','longitude','ukc','eta'] loop
      if jsonb_typeof(item->key) is distinct from 'string' then
        raise exception 'Point du passage plan invalide.' using errcode = '22023'; end if;
    end loop;
  end loop;
  begin
    foreach key in array array['etd','eta'] loop
      if p_draft->'vessel'->>key <> '' and p_draft->'vessel'->>key !~ '^\d{4}-\d{2}-\d{2}[T ][0-9]{2}:[0-9]{2}' then
        raise invalid_datetime_format;
      end if;
    end loop;
    if p_draft #>> '{vessel,etd}' <> '' then departure := (p_draft #>> '{vessel,etd}')::timestamptz; end if;
    if p_draft #>> '{vessel,eta}' <> '' then arrival := (p_draft #>> '{vessel,eta}')::timestamptz; end if;
    if departure is not null and arrival is not null and arrival < departure then
      raise exception 'L’ETA ne peut pas précéder l’ETD.' using errcode = '22023'; end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'ETD ou ETA invalide.' using errcode = '22023';
  end;
  if not p_sign then return; end if;
  if btrim(p_draft->>'project') = '' or btrim(p_draft #>> '{vessel,id}') = ''
    or btrim(p_draft #>> '{vessel,name}') = '' or p_draft->>'decision' = '' then
    raise exception 'Renseignez le projet, le navire et la décision avant signature.' using errcode = '22023'; end if;
  foreach key in array array['captainName','date','place'] loop
    if btrim(p_draft->'signature'->>key) = '' then
      raise exception 'Renseignez le nom, la date et le lieu de signature.' using errcode = '22023'; end if;
  end loop;
  if p_draft #>> '{signature,acknowledged}' <> 'true' then
    raise exception 'L’attestation du capitaine est requise.' using errcode = '22023'; end if;
  begin
    if p_draft #>> '{signature,date}' !~ '^\d{4}-\d{2}-\d{2}$' then raise invalid_datetime_format; end if;
    signature_date := (p_draft #>> '{signature,date}')::date;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'La date de signature est invalide.' using errcode = '22023';
  end;
  if p_draft->>'decision' = 'NO_GO' then
    if btrim(p_draft->>'risks') = '' then raise exception 'Renseignez les risques ou le motif de NO GO à transmettre à l’Armement.' using errcode = '22023'; end if;
    return;
  end if;
  foreach key in array sea_operation_private.active_checks(p_draft) loop
    answer := p_draft->'checks'->>key;
    if answer = '' then raise exception 'Le contrôle % doit être renseigné.',key using errcode = '22023'; end if;
    if answer = 'no' and key = any(blocking) then
      raise exception 'GO impossible : le contrôle % est bloquant.',key using errcode = '22023'; end if;
    if answer = 'no' and key = any(array['provisions','water','fuel','standingOrders']) then
      raise exception 'Le contrôle % doit être confirmé Oui.',key using errcode = '22023'; end if;
    if answer = 'no' and key = any(array['operationEquipment','navigationEquipment','seaClosures','towingAuthorization','cargoStability','cargoLashing'])
      and btrim(p_draft->'justifications'->>key) = '' then
      raise exception 'Justifiez la réponse Non au contrôle %.',key using errcode = '22023'; end if;
  end loop;
  -- Required operation-specific details are checked again on the server.
  foreach key in array array['client','clientContact','description','charts'] loop
    if btrim(p_draft->>key) = '' then raise exception 'Le champ % est requis pour GO.',key using errcode = '22023'; end if;
  end loop;
  foreach key in array array['registrationImo','captainName','departurePort','departureQuay','arrivalPort','arrivalQuay','etd','eta'] loop
    if btrim(p_draft->'vessel'->>key) = '' then raise exception 'Le champ navire % est requis pour GO.',key using errcode = '22023'; end if;
  end loop;
  foreach key in array array['towing','cargo','divingSupport','supplies'] loop
    if p_draft->'applicability'->>key = '' then raise exception 'Précisez l’applicabilité %.',key using errcode = '22023'; end if;
  end loop;
  if p_draft #>> '{dapaq,method}' = '' or p_draft #>> '{dapaq,preparedBy}' = ''
    or (p_draft #>> '{dapaq,method}' = 'nomade' and p_draft #>> '{dapaq,preparedBy}' = 'agent')
    or (p_draft #>> '{dapaq,preparedBy}' = 'agent' and
      (btrim(p_draft #>> '{dapaq,agentName}') = '' or btrim(p_draft #>> '{dapaq,agentContact}') = '')) then
    raise exception 'Complétez le mode, le responsable et les coordonnées éventuelles de la DAPAQ.' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(p_draft->'specialPersonnel') loop
    if btrim(item->>'name') = '' or btrim(item->>'phone') = '' then
      raise exception 'Complétez les contacts du personnel spécial.' using errcode = '22023'; end if;
  end loop;
  if p_draft #>> '{applicability,towing}' = 'yes' then
    if p_draft #>> '{towedVesselBoarding,required}' = ''
      or (p_draft #>> '{towedVesselBoarding,required}' = 'yes' and
        (p_draft #>> '{towedVesselBoarding,measures}' = '' or
          (p_draft #>> '{towedVesselBoarding,measures}' = 'specific' and btrim(p_draft #>> '{towedVesselBoarding,details}') = ''))) then
      raise exception 'Complétez les mesures de sécurité sur le remorqué.' using errcode = '22023'; end if;
  end if;
  if jsonb_array_length(p_draft->'portServices') = 0 or
    (not (p_draft->'portServices') ? 'none' and p_draft->>'mandatoryServicesNotified' <> 'true') then
    raise exception 'Renseignez les services portuaires et confirmez leur information.' using errcode = '22023'; end if;
  if p_draft #>> '{applicability,supplies}' = 'yes' and
    (p_draft #>> '{supplies,delegated}' = '' or jsonb_array_length(p_draft #> '{supplies,items}') = 0
      or (p_draft #>> '{supplies,delegated}' = 'yes' and
        (btrim(p_draft #>> '{supplies,shipchandlerName}') = '' or btrim(p_draft #>> '{supplies,shipchandlerContact}') = ''))
      or (p_draft #>> '{supplies,delegated}' = 'no' and btrim(p_draft #>> '{supplies,suppliers}') = '')) then
    raise exception 'Complétez la prise en charge et les besoins d’approvisionnement.' using errcode = '22023'; end if;
  if jsonb_array_length(p_draft->'waypoints') = 0 then
    raise exception 'Le passage plan doit comporter au moins un point.' using errcode = '22023'; end if;
  for item in select value from jsonb_array_elements(p_draft->'waypoints') loop
    foreach key in array array['number','descriptionVhf','latitude','longitude','ukc','eta'] loop
      if btrim(item->>key) = '' then raise exception 'Complétez chaque point du passage plan.' using errcode = '22023'; end if;
    end loop;
    begin
      if item->>'eta' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        if item->>'eta' !~ '^\d{4}-\d{2}-\d{2}[T ][0-9]{2}:[0-9]{2}' then raise invalid_datetime_format; end if;
        perform (item->>'eta')::timestamptz;
      end if;
    exception when invalid_datetime_format or datetime_field_overflow then
      raise exception 'L’ETA du point de passage est invalide.' using errcode = '22023';
    end;
  end loop;
end;
$$;

create table public.sea_operations (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  vessel_id bigint,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft','signed')),
  draft jsonb not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_by_name text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_by_name text not null,
  updated_at timestamptz not null default clock_timestamp(),
  signed_by uuid references public.profiles(id) on delete restrict,
  signed_by_name text,
  signed_at timestamptz,
  captain_name text,
  foreign key (vessel_id,company_id) references public.vessels(id,company_id) on delete restrict,
  check ((status = 'signed') = (signed_by is not null and signed_by_name is not null and signed_at is not null and captain_name is not null))
);
create index sea_operations_company_updated_idx on public.sea_operations(company_id,updated_at desc,id);
create index sea_operations_vessel_idx on public.sea_operations(vessel_id,company_id);
create index sea_operations_created_by_idx on public.sea_operations(created_by);
create index sea_operations_updated_by_idx on public.sea_operations(updated_by);
create index sea_operations_signed_by_idx on public.sea_operations(signed_by);
alter table public.sea_operations enable row level security;
revoke all on public.sea_operations from public, anon, authenticated;
grant select on public.sea_operations to authenticated;
create policy sea_operations_read on public.sea_operations for select to authenticated
  using (sea_operation_private.can_read(company_id));

create function sea_operation_private.can_edit(p_record public.sea_operations) returns boolean
language sql stable set search_path = '' as $$
  select p_record.status = 'draft' and sea_operation_private.can_read(p_record.company_id)
    and (p_record.created_by = (select auth.uid())
      or public.has_company_role(p_record.company_id,array['admin','direction','armement'])
      or sea_operation_private.can_sign_vessel(p_record.company_id,p_record.vessel_id));
$$;

create function sea_operation_private.record_json(p_record public.sea_operations) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(p_record) || jsonb_build_object('can_edit',sea_operation_private.can_edit(p_record),
    'can_sign',p_record.status = 'draft' and sea_operation_private.can_sign_vessel(p_record.company_id,p_record.vessel_id));
$$;

create function sea_operation_private.freeze_signed() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'signed' then raise exception 'Une opération signée est conservée sans modification.' using errcode = '55000'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger sea_operations_immutable before update or delete on public.sea_operations
  for each row execute function sea_operation_private.freeze_signed();

create function sea_operation_private.overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare company bigint := sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company),false) then raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501'; end if;
  return jsonb_build_object('company_id',company,'actor_id',(select auth.uid()),'actor_name',sea_operation_private.actor_name(company),
    'records',coalesce((select jsonb_agg(sea_operation_private.record_json(record) order by record.updated_at desc,record.id)
      from public.sea_operations record where record.company_id = company),'[]'::jsonb),
    'vessels',coalesce((select jsonb_agg(jsonb_build_object('id',vessel.id,'name',vessel.name,
      'registration_imo',concat_ws(' / ',nullif(vessel.registration_number,''),nullif(vessel.imo_number,'')),
      'length_overall',vessel.length_overall,'can_sign',sea_operation_private.can_sign_vessel(company,vessel.id)) order by vessel.name)
      from public.vessels vessel where vessel.company_id = company and vessel.active and vessel.asset_kind = 'vessel'),'[]'::jsonb));
end;
$$;

create function sea_operation_private.detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare record public.sea_operations;
begin
  select * into record from public.sea_operations operation where operation.id = p_id;
  if record.id is null or not coalesce(sea_operation_private.can_read(record.company_id),false) then
    raise exception 'Opération inaccessible.' using errcode = '42501'; end if;
  return sea_operation_private.record_json(record);
end;
$$;

create function sea_operation_private.save(p_id uuid,p_version integer,p_draft jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare company bigint := sea_operation_private.company_id(); record public.sea_operations;
  vessel bigint; actor text; vessel_name text;
begin
  if not coalesce(sea_operation_private.can_read(company),false) then raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501'; end if;
  perform sea_operation_private.validate_draft(p_draft);
  if btrim(p_draft #>> '{vessel,id}') <> '' then
    if p_draft #>> '{vessel,id}' !~ '^[1-9][0-9]{0,17}$' then raise exception 'Navire invalide.' using errcode = '22023'; end if;
    vessel := (p_draft #>> '{vessel,id}')::bigint;
    select v.name into vessel_name from public.vessels v where v.id = vessel and v.company_id = company and v.active and v.asset_kind = 'vessel';
    if vessel_name is null then
      raise exception 'Navire inaccessible.' using errcode = '42501'; end if;
    p_draft := jsonb_set(p_draft,'{vessel,name}',to_jsonb(vessel_name));
  end if;
  actor := sea_operation_private.actor_name(company);
  if p_id is null then
    if p_version is not null then raise exception 'Version de création invalide.' using errcode = '22023'; end if;
    insert into public.sea_operations(company_id,vessel_id,draft,created_by,created_by_name,updated_by,updated_by_name)
    values(company,vessel,p_draft,(select auth.uid()),actor,(select auth.uid()),actor) returning * into record;
  else
    select * into record from public.sea_operations operation where operation.id = p_id for update;
    if record.id is null or not coalesce(sea_operation_private.can_edit(record),false) then
      raise exception 'Modification de cette opération refusée.' using errcode = '42501'; end if;
    if p_version is distinct from record.version then raise exception 'L’opération a été modifiée. Rechargez-la avant de continuer.' using errcode = '40001'; end if;
    if record.created_by <> (select auth.uid()) and not public.has_company_role(company,array['admin','direction','armement'])
      and not coalesce(sea_operation_private.can_sign_vessel(company,vessel),false) then
      raise exception 'Le capitaine doit être affecté au navire choisi.' using errcode = '42501'; end if;
    update public.sea_operations operation set vessel_id = vessel,draft = p_draft,version = operation.version+1,
      updated_by = (select auth.uid()),updated_by_name = actor,updated_at = clock_timestamp()
      where operation.id = p_id returning * into record;
  end if;
  return sea_operation_private.record_json(record);
end;
$$;

create function sea_operation_private.sign(p_id uuid,p_version integer,p_captain_name text,p_acknowledged boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare record public.sea_operations; actor text;
begin
  select * into record from public.sea_operations operation where operation.id = p_id for update;
  if record.id is null or record.status <> 'draft'
    or not coalesce(sea_operation_private.can_sign_vessel(record.company_id,record.vessel_id),false) then
    raise exception 'Seul le capitaine réellement affecté à ce navire peut signer cette opération.' using errcode = '42501'; end if;
  if p_version is distinct from record.version then raise exception 'L’opération a été modifiée. Rechargez-la avant de signer.' using errcode = '40001'; end if;
  if p_acknowledged is distinct from true or btrim(coalesce(p_captain_name,'')) = ''
    or btrim(p_captain_name) is distinct from btrim(record.draft #>> '{signature,captainName}') then
    raise exception 'Confirmez le nom et l’attestation du capitaine enregistrés.' using errcode = '22023'; end if;
  perform sea_operation_private.validate_draft(record.draft,true);
  actor := sea_operation_private.actor_name(record.company_id);
  update public.sea_operations operation set status = 'signed',version = operation.version+1,
    signed_by = (select auth.uid()),signed_by_name = actor,signed_at = clock_timestamp(),captain_name = btrim(p_captain_name),
    updated_by = (select auth.uid()),updated_by_name = actor,updated_at = clock_timestamp()
    where operation.id = p_id returning * into record;
  return sea_operation_private.record_json(record);
end;
$$;

create function public.sea_operations_overview() returns jsonb language sql stable security invoker set search_path = '' as $$select sea_operation_private.overview();$$;
create function public.sea_operation_detail(p_id uuid) returns jsonb language sql stable security invoker set search_path = '' as $$select sea_operation_private.detail(p_id);$$;
create function public.sea_operation_save(p_id uuid,p_version integer,p_draft jsonb) returns jsonb language sql security invoker set search_path = '' as $$select sea_operation_private.save(p_id,p_version,p_draft);$$;
create function public.sea_operation_sign(p_id uuid,p_version integer,p_captain_name text,p_acknowledged boolean) returns jsonb language sql security invoker set search_path = '' as $$select sea_operation_private.sign(p_id,p_version,p_captain_name,p_acknowledged);$$;

revoke all on all functions in schema sea_operation_private from public,anon,authenticated;
grant execute on all functions in schema sea_operation_private to authenticated;
revoke all on function public.sea_operations_overview(),public.sea_operation_detail(uuid),public.sea_operation_save(uuid,integer,jsonb),
  public.sea_operation_sign(uuid,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.sea_operations_overview(),public.sea_operation_detail(uuid),public.sea_operation_save(uuid,integer,jsonb),
  public.sea_operation_sign(uuid,integer,text,boolean) to authenticated;

insert into public.role_module_permissions(role_key,module_key,is_visible)
select role.key,'seaOperations',true from public.roles role where role.key in ('admin','direction','armement','capitaine','marin')
on conflict(role_key,module_key) do nothing;
comment on table public.sea_operations is 'GO / NO GO opération en mer: company-scoped drafts, exact-revision captain attestation and immutable signed snapshots based on procedure 63.';
