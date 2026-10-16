-- Narrow Planning projection for preparation; actual daily functions govern
-- captain authority, including temporary replacements and explicit demotions.
alter table public.sea_operations add column signature_snapshot jsonb not null default '{}'::jsonb;

create function sea_operation_private.captains(p_company bigint,p_vessel bigint,p_date date)
returns table(person_id bigint,user_id uuid,name text,function_label text)
language sql stable security definer set search_path = '' as $$
  select distinct person.id,person.user_id,btrim(concat_ws(' ',person.first_name,upper(person.last_name))),'Capitaine'::text
  from public.planning_assignments assignment
  join public.people person on person.id = assignment.crew_person_id and person.company_id = assignment.company_id
  cross join lateral (select coalesce(nullif(btrim(public.planning_assignment_function_on_date(assignment.id,p_date)),''),'crew') label) effective
  where sea_operation_private.can_read(p_company) and assignment.company_id = p_company and assignment.vessel_id = p_vessel
    and assignment.confirmation_status = 'confirmed' and p_date between assignment.starts_on and assignment.ends_on
    and person.active and (person.hired_on is null or person.hired_on <= p_date) and (person.departed_on is null or person.departed_on >= p_date)
    and translate(lower(case when lower(effective.label) in ('crew','equipage','équipage','marin','officier','pont','machine','mecanique','mécanique')
      then coalesce(person.function_label,'') else effective.label end),'éèêëàâäîïôöùûüç','eeeeaaaiioouuuc') in ('capitaine','captain','commandant')
    and public.planning_status_is_working(public.planning_effective_person_status(p_company,person.id,p_date,p_vessel,assignment.status_label));
$$;

create function sea_operation_private.active_signature(p_company bigint,p_person bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object('signature_id',signature.id,'signer_person_id',person.id,
      'signer_user_id',person.user_id,'signer_name',btrim(concat_ws(' ',person.first_name,upper(person.last_name))),
      'version_number',signature.version_number,'storage_bucket',signature.storage_bucket,'storage_path',signature.storage_path,
      'mime_type',signature.mime_type,'file_size_bytes',signature.file_size_bytes,'sha256',signature.sha256)
    from public.working_time_profile_signatures signature
    join public.people person on person.id = signature.person_id and person.company_id = signature.company_id
    where signature.company_id = p_company and signature.person_id = p_person and signature.valid_to is null and person.active
      and signature.mime_type in ('image/png','image/jpeg','image/webp')
    order by signature.version_number desc limit 1),'{}'::jsonb);
$$;

create function sea_operation_private.planning_context(p_date date) returns jsonb
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
      'vessel',jsonb_build_object('id',vessel.id::text,'name',vessel.name,'lengthOverall',vessel.length_overall,'registrationImo',concat_ws(' / ',nullif(vessel.registration_number,''),nullif(vessel.imo_number,'')),
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

create function sea_operation_private.choice(p_date date,p_operation_id text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare choice jsonb;
begin
  select item into choice from jsonb_array_elements(sea_operation_private.planning_context(p_date)->'choices') item where item->>'operationId' = p_operation_id;
  if choice is null then raise exception 'Cette opération n’est pas disponible dans le planning à cette date.' using errcode = '42501'; end if;
  return choice;
end;
$$;

create function sea_operation_private.planning_draft(p_draft jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare context jsonb := p_draft->'planning'; choice jsonb; captain jsonb; field text;
begin
  if context is null then return p_draft; end if;
  if jsonb_typeof(context) is distinct from 'object' then raise exception 'Contexte planning invalide.' using errcode = '22023'; end if;
  foreach field in array array['date','operationId','projectId','captainPersonId'] loop
    if jsonb_typeof(context->field) is distinct from 'string' then raise exception 'Contexte planning invalide.' using errcode = '22023'; end if;
  end loop;
  if context->>'date' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Date planning invalide.' using errcode = '22023'; end if;
  choice := sea_operation_private.choice((context->>'date')::date,context->>'operationId');
  if choice->>'projectId' is distinct from context->>'projectId' or choice #>> '{vessel,id}' is distinct from p_draft #>> '{vessel,id}' then
    raise exception 'Le projet et le navire doivent correspondre à l’opération sélectionnée.' using errcode = '22023'; end if;
  foreach field in array array['project','client','clientContact','description'] loop
    if btrim(coalesce(choice->>field,'')) <> '' then p_draft := jsonb_set(p_draft,array[field],choice->field); end if;
  end loop;
  foreach field in array array['name','registrationImo','departurePort','arrivalPort'] loop
    if btrim(coalesce(choice->'vessel'->>field,'')) <> '' then p_draft := jsonb_set(p_draft,array['vessel',field],choice->'vessel'->field); end if;
  end loop;
  if context->>'captainPersonId' <> '' then
    select item into captain from jsonb_array_elements(choice->'captains') item where item->>'personId' = context->>'captainPersonId';
    if captain is null then raise exception 'Le capitaine n’exerce pas cette fonction dans le planning sélectionné.' using errcode = '42501'; end if;
    p_draft := jsonb_set(p_draft,'{vessel,captainName}',captain->'name');
    p_draft := jsonb_set(p_draft,'{signature,captainName}',captain->'name');
  end if;
  return p_draft;
exception when invalid_datetime_format or datetime_field_overflow then
  raise exception 'Date planning invalide.' using errcode = '22023';
end;
$$;

create function sea_operation_private.record_date(p_record public.sea_operations) returns date
language sql stable set search_path = '' as $$
  select coalesce(nullif(p_record.draft #>> '{planning,date}','')::date,
    nullif(split_part(p_record.draft #>> '{vessel,etd}','T',1),'')::date,(now() at time zone 'Europe/Paris')::date);
$$;

create or replace function sea_operation_private.can_sign_vessel(p_company_id bigint,p_vessel_id bigint) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from sea_operation_private.captains(p_company_id,p_vessel_id,(now() at time zone 'Europe/Paris')::date) captain
    where captain.user_id = (select auth.uid()));
$$;

create function sea_operation_private.can_sign_payload(p_company bigint,p_vessel bigint,p_draft jsonb) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from sea_operation_private.captains(p_company,p_vessel,
    coalesce(nullif(p_draft #>> '{planning,date}','')::date,nullif(split_part(p_draft #>> '{vessel,etd}','T',1),'')::date,(now() at time zone 'Europe/Paris')::date)) captain
    where captain.user_id = (select auth.uid()) and
      (p_draft->'planning' is null or captain.person_id::text = p_draft #>> '{planning,captainPersonId}'));
$$;

create function sea_operation_private.can_sign_record(p_record public.sea_operations) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare selected text := p_record.draft #>> '{planning,captainPersonId}';
begin
  if p_record.status <> 'draft' or not coalesce(sea_operation_private.can_read(p_record.company_id),false) then return false; end if;
  return exists(select 1 from sea_operation_private.captains(p_record.company_id,p_record.vessel_id,sea_operation_private.record_date(p_record)) captain
    where captain.user_id = (select auth.uid()) and (selected is null or selected = captain.person_id::text));
end;
$$;

create or replace function sea_operation_private.can_edit(p_record public.sea_operations) returns boolean
language sql stable set search_path = '' as $$
  select p_record.status = 'draft' and sea_operation_private.can_read(p_record.company_id)
    and (p_record.created_by = (select auth.uid()) or public.has_company_role(p_record.company_id,array['admin','direction','armement'])
      or sea_operation_private.can_sign_record(p_record));
$$;

create or replace function sea_operation_private.record_json(p_record public.sea_operations) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(p_record) || jsonb_build_object('can_edit',sea_operation_private.can_edit(p_record),'can_sign',sea_operation_private.can_sign_record(p_record));
$$;

alter function sea_operation_private.save(uuid,integer,jsonb) rename to save_core;
-- The existing new-vessel guard must use the same selected day as can_edit;
-- otherwise tomorrow's actual captain could open but not save a prepared file.
do $migration$
declare definition text := pg_get_functiondef('sea_operation_private.save_core(uuid,integer,jsonb)'::regprocedure);
begin
  if position('sea_operation_private.can_sign_vessel(company,vessel)' in definition) = 0 then
    raise exception 'Expected sea operation vessel guard missing';
  end if;
  execute replace(definition,'sea_operation_private.can_sign_vessel(company,vessel)','sea_operation_private.can_sign_payload(company,vessel,p_draft)');
end;
$migration$;
create function sea_operation_private.save(p_id uuid,p_version integer,p_draft jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb; snapshot jsonb := '{}'::jsonb; company bigint := sea_operation_private.company_id();
begin
  if not coalesce(sea_operation_private.can_read(company),false) then raise exception 'Accès refusé aux opérations en mer.' using errcode = '42501'; end if;
  perform sea_operation_private.validate_draft(p_draft,false);
  p_draft := sea_operation_private.planning_draft(p_draft);
  result := sea_operation_private.save_core(p_id,p_version,p_draft);
  if nullif(p_draft #>> '{planning,captainPersonId}','') is not null then
    snapshot := sea_operation_private.active_signature(company,(p_draft #>> '{planning,captainPersonId}')::bigint);
  end if;
  update public.sea_operations set signature_snapshot = snapshot where id = (result->>'id')::uuid;
  return sea_operation_private.detail((result->>'id')::uuid);
end;
$$;

create or replace function sea_operation_private.sign(p_id uuid,p_version integer,p_captain_name text,p_acknowledged boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare record public.sea_operations; actor text; captain record; snapshot jsonb;
begin
  select * into record from public.sea_operations operation where operation.id = p_id for update;
  if record.id is null or not coalesce(sea_operation_private.can_sign_record(record),false) then
    raise exception 'Seul le capitaine effectif du planning de cette opération peut signer.' using errcode = '42501'; end if;
  if p_version is distinct from record.version then raise exception 'L’opération a été modifiée. Rechargez-la avant de signer.' using errcode = '40001'; end if;
  perform sea_operation_private.planning_draft(record.draft);
  select * into captain from sea_operation_private.captains(record.company_id,record.vessel_id,sea_operation_private.record_date(record)) c where c.user_id = (select auth.uid()) limit 1;
  if p_acknowledged is distinct from true or btrim(coalesce(p_captain_name,'')) = ''
    or btrim(p_captain_name) is distinct from btrim(record.draft #>> '{signature,captainName}') then
    raise exception 'Confirmez le nom et l’attestation du capitaine enregistrés.' using errcode = '22023'; end if;
  perform sea_operation_private.validate_draft(record.draft,true);
  -- Legacy unlinked drafts also identify the real signer in the frozen form,
  -- rather than retaining arbitrary names supplied by their preparer.
  record.draft := jsonb_set(jsonb_set(record.draft,'{vessel,captainName}',to_jsonb(captain.name)),'{signature,captainName}',to_jsonb(captain.name));
  snapshot := sea_operation_private.active_signature(record.company_id,captain.person_id);
  if snapshot = '{}'::jsonb then raise exception 'Ajoutez une signature dans votre fiche RH avant de signer cette opération.' using errcode = '22023'; end if;
  actor := captain.name;
  update public.sea_operations operation set status = 'signed',version = operation.version+1,draft = record.draft,
    signed_by = (select auth.uid()),signed_by_name = actor,signed_at = clock_timestamp(),captain_name = actor,
    signature_snapshot = snapshot || jsonb_build_object('captured_at',clock_timestamp()),
    updated_by = (select auth.uid()),updated_by_name = actor,updated_at = clock_timestamp()
    where operation.id = p_id returning * into record;
  return sea_operation_private.record_json(record);
end;
$$;

create table sea_operation_private.signature_preview_grants (
  user_id uuid not null references public.profiles(id) on delete cascade,
  company_id bigint not null references public.companies(id) on delete cascade,
  storage_bucket text not null,storage_path text not null,expires_at timestamptz not null,
  primary key(user_id,storage_bucket,storage_path)
);
revoke all on sea_operation_private.signature_preview_grants from public,anon,authenticated;
create index sea_operation_signature_grants_company_idx on sea_operation_private.signature_preview_grants(company_id);

create function sea_operation_private.captain_signature(p_date date,p_operation_id text,p_captain_person_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare choice jsonb := sea_operation_private.choice(p_date,p_operation_id); captain jsonb; snapshot jsonb; company bigint := sea_operation_private.company_id();
begin
  select item into captain from jsonb_array_elements(choice->'captains') item where item->>'personId' = p_captain_person_id;
  if captain is null then raise exception 'Capitaine non affecté à cette opération.' using errcode = '42501'; end if;
  snapshot := sea_operation_private.active_signature(company,p_captain_person_id::bigint);
  if snapshot = '{}'::jsonb then return null; end if;
  delete from sea_operation_private.signature_preview_grants where user_id = (select auth.uid()) and expires_at < now();
  insert into sea_operation_private.signature_preview_grants(user_id,company_id,storage_bucket,storage_path,expires_at)
    values((select auth.uid()),company,snapshot->>'storage_bucket',snapshot->>'storage_path',now()+interval '10 minutes')
    on conflict(user_id,storage_bucket,storage_path) do update set expires_at = excluded.expires_at,company_id = excluded.company_id;
  return snapshot;
end;
$$;

create function sea_operation_private.can_read_signature(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    exists(select 1 from public.sea_operations operation where sea_operation_private.can_read(operation.company_id)
      and operation.signature_snapshot->>'storage_bucket' = p_bucket and operation.signature_snapshot->>'storage_path' = p_path)
    or exists(select 1 from sea_operation_private.signature_preview_grants scope where scope.user_id = (select auth.uid())
      and sea_operation_private.can_read(scope.company_id) and scope.storage_bucket = p_bucket and scope.storage_path = p_path and scope.expires_at > now()));
$$;
create policy sea_operation_signature_read on storage.objects for select to authenticated
  using (bucket_id = 'working-time-signatures' and sea_operation_private.can_read_signature(bucket_id,name));

create function public.sea_operation_planning_context(p_date date) returns jsonb
language sql stable security invoker set search_path = '' as $$select sea_operation_private.planning_context(p_date);$$;
create function public.sea_operation_captain_signature(p_date date,p_operation_id text,p_captain_person_id text) returns jsonb
language sql security invoker set search_path = '' as $$select sea_operation_private.captain_signature(p_date,p_operation_id,p_captain_person_id);$$;
create or replace function public.sea_operation_save(p_id uuid,p_version integer,p_draft jsonb) returns jsonb
language sql security invoker set search_path = '' as $$select sea_operation_private.save(p_id,p_version,p_draft);$$;
revoke all on all functions in schema sea_operation_private from public,anon,authenticated;
grant execute on all functions in schema sea_operation_private to authenticated;
revoke all on function sea_operation_private.save_core(uuid,integer,jsonb),sea_operation_private.active_signature(bigint,bigint) from authenticated;
revoke all on function public.sea_operation_planning_context(date),public.sea_operation_captain_signature(date,text,text) from public,anon,authenticated;
grant execute on function public.sea_operation_planning_context(date),public.sea_operation_captain_signature(date,text,text) to authenticated;
notify pgrst,'reload schema';
