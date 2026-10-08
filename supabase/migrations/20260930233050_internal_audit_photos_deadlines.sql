-- Private image evidence and editable treatment durations. The audit answer
-- snapshots and the original published migration remain unchanged.
alter table public.internal_audit_findings
  add column opened_on date,
  add column treatment_delay_value integer,
  add column treatment_delay_unit text,
  add column photos jsonb not null default '[]'::jsonb;
alter table public.internal_audit_finding_events add column photos jsonb not null default '[]'::jsonb;
alter table public.internal_audit_findings alter column due_on drop not null;

create function internal_audit_private.finding_due_on(p_opened_on date,p_value integer,p_unit text)
returns date language plpgsql immutable set search_path = '' as $$
begin
  if p_value is null and p_unit is null then return null; end if;
  if p_opened_on is null or p_value is null or p_value not between 1 and 3650 or p_unit is null or p_unit not in ('days','weeks','months') then
    raise exception 'Le délai doit être une durée de 1 à 3 650 jours, semaines ou mois.' using errcode = '22023';
  end if;
  return case p_unit when 'days' then p_opened_on + p_value when 'weeks' then p_opened_on + (7*p_value)
    else (p_opened_on + make_interval(months => p_value))::date end;
end;
$$;

update public.internal_audit_findings
set opened_on = (created_at at time zone 'Europe/Paris')::date,
    treatment_delay_value = case when severity = 'remark' then null else 1 end,
    treatment_delay_unit = case severity when 'major' then 'weeks' when 'minor' then 'months' else null end;
-- Preserve existing positive custom deadlines as an equivalent day duration.
-- Old remarks intentionally lose their deadline. Past/invalid legacy deadlines
-- fall back to the new default; deployment checks must identify any such rows.
update public.internal_audit_findings
set treatment_delay_value=due_on-opened_on,treatment_delay_unit='days'
where severity<>'remark' and due_on>opened_on and due_on-opened_on<=3650;
update public.internal_audit_findings
set due_on = internal_audit_private.finding_due_on(opened_on,treatment_delay_value,treatment_delay_unit);
alter table public.internal_audit_findings alter column opened_on set not null;
alter table public.internal_audit_findings alter column opened_on set default ((now() at time zone 'Europe/Paris')::date);
alter table public.internal_audit_findings add constraint internal_audit_finding_duration_check check (
  (severity = 'remark' and treatment_delay_value is null and treatment_delay_unit is null and due_on is null)
  or (severity <> 'remark' and treatment_delay_value is not null and treatment_delay_unit is not null and due_on is not null
      and due_on = internal_audit_private.finding_due_on(opened_on,treatment_delay_value,treatment_delay_unit))
);
alter table public.internal_audit_findings add constraint internal_audit_finding_photos_array_check
  check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 100);
alter table public.internal_audit_finding_events add constraint internal_audit_event_photos_array_check
  check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 10);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('internal-audit-photos','internal-audit-photos',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function internal_audit_private.photo_is_linked(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    exists (select 1 from public.internal_audit_findings finding cross join lateral jsonb_array_elements(finding.photos) photo where photo->>'storagePath' = p_path)
    or exists (select 1 from public.internal_audit_finding_events event cross join lateral jsonb_array_elements(event.photos) photo where photo->>'storagePath' = p_path));
$$;

create function internal_audit_private.can_upload_photo(p_path text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_variable
declare parts text[] := string_to_array(p_path,'/'); target public.internal_audit_findings; company_id bigint;
begin
  if (select auth.uid()) is null or array_length(parts,1) <> 6 or parts[5] <> (select auth.uid())::text
    or parts[4] not in ('finding','treatment','closure') or parts[6] !~ '^[0-9a-f-]{36}\.(jpg|png|webp)$' then return false; end if;
  company_id := parts[1]::bigint;
  perform parts[3]::uuid;
  if not public.user_belongs_to_company(company_id) or not exists(select 1 from public.internal_audits audit where audit.id = parts[2]::uuid and audit.company_id = company_id) then return false; end if;
  select * into target from public.internal_audit_findings finding where finding.id = parts[3]::uuid;
  if target.id is not null and (target.company_id <> company_id or target.audit_id <> parts[2]::uuid) then return false; end if;
  if parts[4] = 'finding' then
    return internal_audit_private.can_manage(company_id) and (target.id is null or target.status <> 'closed');
  end if;
  if target.id is null or not internal_audit_private.can_read_finding(target.id) then return false; end if;
  if parts[4] = 'closure' then
    return internal_audit_private.can_manage(company_id) and (target.status = 'resolved' or (target.severity = 'remark' and target.status <> 'closed'));
  end if;
  return target.status <> 'closed' or internal_audit_private.can_manage(company_id);
exception when others then return false;
end;
$$;

create function internal_audit_private.can_read_photo(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and (
    exists(select 1 from public.internal_audit_findings finding cross join lateral jsonb_array_elements(finding.photos) photo
      where photo->>'storagePath' = p_path and internal_audit_private.can_read_finding(finding.id))
    or exists(select 1 from public.internal_audit_finding_events event cross join lateral jsonb_array_elements(event.photos) photo
      where photo->>'storagePath' = p_path and internal_audit_private.can_read_finding(event.finding_id))
    or (not internal_audit_private.photo_is_linked(p_path) and internal_audit_private.can_upload_photo(p_path))
  );
$$;

create policy internal_audit_photos_read on storage.objects for select to authenticated
  using(bucket_id='internal-audit-photos' and internal_audit_private.can_read_photo(name));
create policy internal_audit_photos_upload on storage.objects for insert to authenticated
  with check(bucket_id='internal-audit-photos' and owner_id=(select auth.uid())::text and internal_audit_private.can_upload_photo(name));
create policy internal_audit_photos_cleanup on storage.objects for delete to authenticated
  using(bucket_id='internal-audit-photos' and owner_id=(select auth.uid())::text
    and not internal_audit_private.photo_is_linked(name) and internal_audit_private.can_upload_photo(name));
-- No UPDATE policy: evidence paths are fresh UUIDs and cannot be overwritten.

create function internal_audit_private.validate_photo_refs(p_photos jsonb,p_company_id bigint,p_audit_id uuid,p_finding_id uuid,p_kind text,p_existing jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare photo jsonb; normalized jsonb; result jsonb := '[]'::jsonb; existing jsonb;
  object storage.objects; path text; extension text; paths text[] := '{}'; ids uuid[] := '{}'; new_count integer := 0;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise.' using errcode = '42501'; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) > (case when p_kind='finding' then 100 else 10 end) then
    raise exception 'La liste de photos est invalide.' using errcode = '22023';
  end if;
  for photo in select value from jsonb_array_elements(p_photos) loop
    if jsonb_typeof(photo) is distinct from 'object' or jsonb_typeof(photo->'id') is distinct from 'string'
      or jsonb_typeof(photo->'fileName') is distinct from 'string' or length(btrim(photo->>'fileName')) not between 1 and 255
      or jsonb_typeof(photo->'storagePath') is distinct from 'string' or jsonb_typeof(photo->'mimeType') is distinct from 'string'
      or jsonb_typeof(photo->'sizeBytes') is distinct from 'number' or (photo->>'sizeBytes')::numeric not between 1 and 10485760
      or (photo->>'sizeBytes')::numeric <> trunc((photo->>'sizeBytes')::numeric) then
      raise exception 'Métadonnées de photo invalides.' using errcode = '22023';
    end if;
    perform (photo->>'id')::uuid;
    if (photo->>'id')::uuid=any(ids) then raise exception 'Chaque photo doit avoir un identifiant unique.' using errcode='22023'; end if;
    ids:=array_append(ids,(photo->>'id')::uuid);
    extension := case photo->>'mimeType' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else null end;
    if extension is null then raise exception 'Seules les photos JPEG, PNG et WebP sont acceptées.' using errcode = '22023'; end if;
    path := photo->>'storagePath';
    if path = any(paths) then raise exception 'Une photo ne peut pas être ajoutée plusieurs fois.' using errcode = '22023'; end if;
    paths := array_append(paths,path);
    normalized := jsonb_build_object('id',photo->>'id','fileName',btrim(photo->>'fileName'),'storagePath',path,'mimeType',photo->>'mimeType','sizeBytes',(photo->>'sizeBytes')::bigint);
    select value into existing from jsonb_array_elements(p_existing) where value->>'storagePath'=path;
    if existing is not null then
      if normalized <> existing then raise exception 'Une photo enregistrée ne peut pas être remplacée.' using errcode = '22023'; end if;
    else
      new_count := new_count+1;
      if new_count > 10 or path <> p_company_id::text||'/'||p_audit_id::text||'/'||p_finding_id::text||'/'||p_kind||'/'||(select auth.uid())::text||'/'||(photo->>'id')||'.'||extension then
        raise exception 'Le chemin de la photo est invalide pour cet écart.' using errcode = '22023';
      end if;
      if not internal_audit_private.can_upload_photo(path) or internal_audit_private.photo_is_linked(path) then raise exception 'La photo est inaccessible ou déjà utilisée.' using errcode = '42501'; end if;
      select * into object from storage.objects where bucket_id='internal-audit-photos' and name=path and owner_id=(select auth.uid())::text;
      if object.id is null or object.metadata->>'mimetype' is distinct from photo->>'mimeType'
        or (object.metadata->>'size')::bigint is distinct from (photo->>'sizeBytes')::bigint then
        raise exception 'La photo téléversée est absente ou invalide.' using errcode = '22023';
      end if;
    end if;
    result := result || jsonb_build_array(normalized);
  end loop;
  if exists(select 1 from jsonb_array_elements(p_existing) old_photo where not (old_photo->>'storagePath'=any(paths))) then
    raise exception 'Les photos déjà enregistrées doivent être conservées.' using errcode = '22023';
  end if;
  return result;
end;
$$;

create or replace function internal_audit_private.save_finding(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  company_id bigint := internal_audit_private.assert_manager(p_payload);
  target public.internal_audit_findings; old_finding public.internal_audit_findings;
  audit public.internal_audits; question jsonb; label text;
  person_id bigint := (p_payload->>'assigneePersonId')::bigint;
  vessel_id bigint := (p_payload->>'assigneeVesselId')::bigint;
  assigned_role text := p_payload->>'assigneeRole';
  opened_date date; delay_value integer; delay_unit text; deadline date; evidence jsonb;
begin
  select * into old_finding from public.internal_audit_findings finding where finding.id=(p_payload->>'id')::uuid for update;
  if old_finding.id is not null and old_finding.company_id<>company_id then raise exception 'Écart inaccessible.' using errcode='42501'; end if;
  if old_finding.status='closed' then raise exception 'Un écart clos doit être rouvert avant modification.' using errcode='55000'; end if;
  select * into audit from public.internal_audits a where a.id=(p_payload->>'auditId')::uuid and a.company_id=company_id for update;
  select item into question from jsonb_array_elements(audit.rows) item where item->>'id'=p_payload->>'questionId';
  if audit.id is null or question is null then raise exception 'La question ne figure pas dans cet audit.' using errcode='22023'; end if;
  if old_finding.id is not null and (old_finding.audit_id<>audit.id or old_finding.question_id<>p_payload->>'questionId') then
    raise exception 'L’audit et la question d’un écart existant sont conservés.' using errcode='22023';
  end if;
  if person_id is not null and (assigned_role is not null or vessel_id is not null) then raise exception 'Choisissez une personne ou une fonction sur un navire.' using errcode='22023'; end if;
  if person_id is not null then
    select btrim(concat_ws(' ',person.first_name,person.last_name)) into label from public.people person where person.id=person_id and person.company_id=company_id and person.active;
  elsif assigned_role in ('captain','chief_engineer','crew') and vessel_id is not null then
    select case assigned_role when 'captain' then 'Capitaines ' when 'chief_engineer' then 'Chefs Mécaniciens ' else 'Équipage ' end||vessel.name
      into label from public.vessels vessel where vessel.id=vessel_id and vessel.company_id=company_id and vessel.active;
  end if;
  if label is null then raise exception 'Responsable de traitement invalide.' using errcode='22023'; end if;
  opened_date := coalesce(old_finding.opened_on,(clock_timestamp() at time zone 'Europe/Paris')::date);
  if p_payload->>'severity'='remark' then delay_value:=null; delay_unit:=null;
  else
    delay_value := coalesce((p_payload->>'treatmentDelayValue')::integer,case when old_finding.severity=p_payload->>'severity' then old_finding.treatment_delay_value end,1);
    delay_unit := coalesce(p_payload->>'treatmentDelayUnit',case when old_finding.severity=p_payload->>'severity' then old_finding.treatment_delay_unit end,
      case when p_payload->>'severity'='major' then 'weeks' else 'months' end);
  end if;
  deadline := internal_audit_private.finding_due_on(opened_date,delay_value,delay_unit);
  evidence := internal_audit_private.validate_photo_refs(coalesce(p_payload->'photos',old_finding.photos,'[]'::jsonb),company_id,audit.id,(p_payload->>'id')::uuid,'finding',coalesce(old_finding.photos,'[]'::jsonb));
  insert into public.internal_audit_findings(id,company_id,audit_id,question_id,reference,severity,description,assignee_person_id,assignee_role,assignee_vessel_id,assignee_label,
    opened_on,treatment_delay_value,treatment_delay_unit,due_on,photos)
  values((p_payload->>'id')::uuid,company_id,audit.id,question->>'id',coalesce(question->>'reference',''),p_payload->>'severity',btrim(p_payload->>'description'),person_id,assigned_role,vessel_id,label,
    opened_date,delay_value,delay_unit,deadline,evidence)
  on conflict(id) do update set severity=excluded.severity,description=excluded.description,assignee_person_id=excluded.assignee_person_id,
    assignee_role=excluded.assignee_role,assignee_vessel_id=excluded.assignee_vessel_id,assignee_label=excluded.assignee_label,
    treatment_delay_value=excluded.treatment_delay_value,treatment_delay_unit=excluded.treatment_delay_unit,due_on=excluded.due_on,photos=excluded.photos,updated_at=clock_timestamp()
  returning * into target;
  if old_finding.id is null or (old_finding.assignee_person_id,old_finding.assignee_role,old_finding.assignee_vessel_id,old_finding.due_on,old_finding.treatment_delay_value,old_finding.treatment_delay_unit,old_finding.severity,old_finding.description,old_finding.photos)
    is distinct from (target.assignee_person_id,target.assignee_role,target.assignee_vessel_id,target.due_on,target.treatment_delay_value,target.treatment_delay_unit,target.severity,target.description,target.photos) then
    insert into public.internal_audit_finding_events(company_id,finding_id,actor_id,actor_name,status,treatment)
    values(company_id,target.id,(select auth.uid()),internal_audit_private.actor_name(company_id),target.status,
      case when old_finding.id is null then 'Écart créé : ' else 'Écart mis à jour : ' end||target.description||' — Responsable : '||target.assignee_label||
      case when target.due_on is null then ' — Remarque sans échéance ni obligation de clôture.' else ' — Échéance : '||target.due_on::text end||
      case when jsonb_array_length(target.photos)>0 then ' — Photos du constat : '||jsonb_array_length(target.photos)::text else '' end);
  end if;
  return to_jsonb(target);
end;
$$;

create function internal_audit_private.photo_upload_scope(p_finding_id uuid,p_kind text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare target public.internal_audit_findings;
begin
  select * into target from public.internal_audit_findings finding where finding.id=p_finding_id;
  if target.id is null or p_kind is null or p_kind not in ('treatment','closure') or not internal_audit_private.can_upload_photo(
    target.company_id::text||'/'||target.audit_id::text||'/'||target.id::text||'/'||p_kind||'/'||(select auth.uid())::text||'/00000000-0000-0000-0000-000000000000.jpg') then
    raise exception 'Vous ne pouvez pas ajouter de photos à ce traitement.' using errcode='42501';
  end if;
  return jsonb_build_object('company_id',target.company_id,'audit_id',target.audit_id);
end;
$$;

create function internal_audit_private.add_treatment(p_finding_id uuid,p_status text,p_treatment text,p_photos jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.internal_audit_findings; event public.internal_audit_finding_events; manager boolean; evidence jsonb; note text;
begin
  select * into target from public.internal_audit_findings finding where finding.id=p_finding_id for update;
  if target.id is null or not internal_audit_private.can_read_finding(target.id) then raise exception 'Écart inaccessible.' using errcode='42501'; end if;
  manager:=internal_audit_private.can_manage(target.company_id);
  if target.status='closed' and not manager then raise exception 'Un écart clos ne peut plus être traité.' using errcode='55000'; end if;
  if p_status is null or p_status not in ('open','in_progress','resolved','closed') or length(btrim(coalesce(p_treatment,'')))>10000 then raise exception 'Statut ou commentaire de traitement invalide.' using errcode='22023'; end if;
  if p_status='closed' and not manager then raise exception 'La vérification et la clôture sont réservées à la gestion des audits.' using errcode='42501'; end if;
  if p_status='closed' and target.status<>'resolved' and target.severity<>'remark' then raise exception 'Traitez l’écart avant de vérifier sa clôture.' using errcode='22023'; end if;
  evidence:=internal_audit_private.validate_photo_refs(coalesce(p_photos,'[]'::jsonb),target.company_id,target.audit_id,target.id,
    case when p_status='closed' then 'closure' else 'treatment' end);
  note:=nullif(btrim(p_treatment),'');
  if note is null then
    if p_status='closed' then note:='Clôture de l’écart vérifiée.';
    elsif jsonb_array_length(evidence)>0 then note:='Photos ajoutées au traitement.';
    else raise exception 'Ajoutez un commentaire ou une photo au traitement.' using errcode='22023'; end if;
  end if;
  insert into public.internal_audit_finding_events(company_id,finding_id,actor_id,actor_name,status,treatment,photos)
    values(target.company_id,target.id,(select auth.uid()),internal_audit_private.actor_name(target.company_id),p_status,note,evidence) returning * into event;
  update public.internal_audit_findings set status=p_status,treatment=note,
    resolved_at=case when p_status in ('resolved','closed') then coalesce(target.resolved_at,event.created_at) else null end,
    closed_at=case when p_status='closed' then event.created_at else null end,updated_at=event.created_at where id=target.id;
  return to_jsonb(event);
end;
$$;

-- Keep the three-argument API for previously deployed clients and SQL tests.
create or replace function internal_audit_private.add_treatment(p_finding_id uuid,p_status text,p_treatment text)
returns jsonb language sql security invoker set search_path = '' as $$
  select internal_audit_private.add_treatment(p_finding_id,p_status,p_treatment,'[]'::jsonb);
$$;
create function public.internal_audit_add_treatment(p_finding_id uuid,p_status text,p_treatment text,p_photos jsonb)
returns jsonb language sql security invoker set search_path = '' as $$select internal_audit_private.add_treatment(p_finding_id,p_status,p_treatment,p_photos);$$;
create function public.internal_audit_photo_upload_scope(p_finding_id uuid,p_kind text)
returns jsonb language sql stable security invoker set search_path = '' as $$select internal_audit_private.photo_upload_scope(p_finding_id,p_kind);$$;

revoke all on function internal_audit_private.finding_due_on(date,integer,text),internal_audit_private.photo_is_linked(text),
  internal_audit_private.can_upload_photo(text),internal_audit_private.can_read_photo(text),internal_audit_private.validate_photo_refs(jsonb,bigint,uuid,uuid,text,jsonb),
  internal_audit_private.photo_upload_scope(uuid,text),internal_audit_private.add_treatment(uuid,text,text,jsonb),
  public.internal_audit_add_treatment(uuid,text,text,jsonb),public.internal_audit_photo_upload_scope(uuid,text) from public,anon,authenticated;
grant execute on function internal_audit_private.finding_due_on(date,integer,text),internal_audit_private.photo_is_linked(text),
  internal_audit_private.can_upload_photo(text),internal_audit_private.can_read_photo(text),internal_audit_private.validate_photo_refs(jsonb,bigint,uuid,uuid,text,jsonb),
  internal_audit_private.photo_upload_scope(uuid,text),internal_audit_private.add_treatment(uuid,text,text,jsonb),
  public.internal_audit_add_treatment(uuid,text,text,jsonb),public.internal_audit_photo_upload_scope(uuid,text) to authenticated;
notify pgrst,'reload schema';

comment on column public.internal_audit_findings.photos is 'Immutable private finding evidence references; signed URLs are generated for authorized readers only.';
comment on column public.internal_audit_finding_events.photos is 'Private treatment and closure evidence retained in the immutable event history.';
comment on column public.internal_audit_findings.due_on is 'Server-calculated deadline from opening date and editable duration; remarks have no deadline.';
