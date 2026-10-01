-- Shared documentary audits (OVID, eCMID, external ISM and client audits).
-- Public RPCs are invokers; authorization and controlled writes live in an
-- unexposed schema. Evidence is private, append-only and scoped to its dossier.
create schema documentary_audit_private;
revoke all on schema documentary_audit_private from public,anon;
grant usage on schema documentary_audit_private to authenticated;

create table public.documentary_audits (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  kind text not null check(kind in ('ovid','ecmid','external_ism','client')),
  site_id bigint not null,
  vessel_id bigint not null,
  year integer not null check(year between 1900 and 9998),
  title text not null check(length(btrim(title)) between 1 and 200),
  audited_on date,
  auditor_name text not null default '' check(length(auditor_name)<=200),
  files jsonb not null default '[]'::jsonb check(jsonb_typeof(files)='array' and jsonb_array_length(files)<=100),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(id,company_id),unique(company_id,kind,year,vessel_id),
  foreign key(site_id,company_id) references public.vessels(id,company_id) on delete restrict,
  foreign key(vessel_id,company_id) references public.vessels(id,company_id) on delete restrict,
  check(site_id=vessel_id)
);

create table public.documentary_audit_findings (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  audit_id uuid not null,
  reference text not null default '' check(length(reference)<=200),
  category text not null check(category in ('finding','major','minor','remark')),
  description text not null check(length(btrim(description)) between 1 and 10000),
  assignee_person_id bigint,
  assignee_role text check(assignee_role in ('captain','chief_engineer','crew')),
  assignee_vessel_id bigint,
  assignee_label text not null,
  opened_on date not null default ((now() at time zone 'Europe/Paris')::date),
  treatment_delay_value integer,
  treatment_delay_unit text,
  due_on date,
  status text not null default 'open' check(status in ('open','in_progress','resolved','closed')),
  treatment text not null default '',
  resolved_at timestamptz,
  closed_at timestamptz,
  files jsonb not null default '[]'::jsonb check(jsonb_typeof(files)='array' and jsonb_array_length(files)<=100),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique(id,company_id),
  foreign key(audit_id,company_id) references public.documentary_audits(id,company_id) on delete restrict,
  foreign key(assignee_person_id,company_id) references public.people(id,company_id) on delete restrict,
  foreign key(assignee_vessel_id,company_id) references public.vessels(id,company_id) on delete restrict,
  check((assignee_person_id is not null and assignee_role is null and assignee_vessel_id is null)
    or (assignee_person_id is null and assignee_role is not null and assignee_vessel_id is not null)),
  check((category='remark' and treatment_delay_value is null and treatment_delay_unit is null and due_on is null)
    or (category='finding' and treatment_delay_value is null and treatment_delay_unit is null and due_on is null)
    or (category<>'remark' and treatment_delay_value is not null and treatment_delay_unit is not null and due_on is not null
      and due_on=internal_audit_private.finding_due_on(opened_on,treatment_delay_value,treatment_delay_unit))),
  check((status='closed')=(closed_at is not null)),
  check(status not in ('resolved','closed') or resolved_at is not null)
);

create table public.documentary_audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id bigint not null references public.companies(id) on delete restrict,
  finding_id uuid not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  status text not null check(status in ('open','in_progress','resolved','closed')),
  treatment text not null check(length(btrim(treatment)) between 1 and 20000),
  files jsonb not null default '[]'::jsonb check(jsonb_typeof(files)='array' and jsonb_array_length(files)<=100),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(finding_id,company_id) references public.documentary_audit_findings(id,company_id) on delete restrict
);

create index documentary_audits_site_idx on public.documentary_audits(site_id,company_id);
create index documentary_audits_vessel_idx on public.documentary_audits(vessel_id,company_id);
create index documentary_audit_findings_audit_idx on public.documentary_audit_findings(audit_id,company_id);
create index documentary_audit_findings_person_idx on public.documentary_audit_findings(assignee_person_id,company_id);
create index documentary_audit_findings_vessel_idx on public.documentary_audit_findings(assignee_vessel_id,company_id);
create index documentary_audit_findings_due_idx on public.documentary_audit_findings(company_id,due_on);
create index documentary_audit_events_finding_idx on public.documentary_audit_events(finding_id,company_id,created_at);
create index documentary_audit_events_actor_idx on public.documentary_audit_events(actor_id);
create index documentary_audit_events_company_idx on public.documentary_audit_events(company_id,created_at);

create function documentary_audit_private.can_read_finding(p_finding_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.documentary_audit_findings finding
    where finding.id=p_finding_id and (internal_audit_private.can_manage(finding.company_id)
      or internal_audit_private.is_assigned(finding.company_id,finding.assignee_person_id,finding.assignee_role,finding.assignee_vessel_id)));
$$;
create function documentary_audit_private.can_read_audit(p_audit_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and exists(select 1 from public.documentary_audits audit
    where audit.id=p_audit_id and (internal_audit_private.can_manage(audit.company_id)
      or exists(select 1 from public.documentary_audit_findings finding where finding.audit_id=audit.id
        and internal_audit_private.is_assigned(finding.company_id,finding.assignee_person_id,finding.assignee_role,finding.assignee_vessel_id))));
$$;

alter table public.documentary_audits enable row level security;
alter table public.documentary_audit_findings enable row level security;
alter table public.documentary_audit_events enable row level security;
revoke all on public.documentary_audits,public.documentary_audit_findings,public.documentary_audit_events from public,anon,authenticated;
grant select on public.documentary_audits,public.documentary_audit_findings,public.documentary_audit_events to authenticated;
create policy documentary_audits_read on public.documentary_audits for select to authenticated using(documentary_audit_private.can_read_audit(id));
create policy documentary_audit_findings_read on public.documentary_audit_findings for select to authenticated using(documentary_audit_private.can_read_finding(id));
create policy documentary_audit_events_read on public.documentary_audit_events for select to authenticated using(documentary_audit_private.can_read_finding(finding_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documentary-audit-files','documentary-audit-files',false,26214400,array[
  'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain','text/csv','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create function documentary_audit_private.file_extension(p_mime text)
returns text language sql immutable set search_path='' as $$
  select case p_mime when 'application/pdf' then 'pdf'
    when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx'
    when 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then 'xlsx'
    when 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then 'pptx'
    when 'text/plain' then 'txt' when 'text/csv' then 'csv'
    when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else null end;
$$;
create function documentary_audit_private.file_is_linked(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and (
    exists(select 1 from public.documentary_audits audit cross join lateral jsonb_array_elements(audit.files) file where file->>'storagePath'=p_path)
    or exists(select 1 from public.documentary_audit_findings finding cross join lateral jsonb_array_elements(finding.files) file where file->>'storagePath'=p_path)
    or exists(select 1 from public.documentary_audit_events event cross join lateral jsonb_array_elements(event.files) file where file->>'storagePath'=p_path));
$$;
create function documentary_audit_private.can_upload_file(p_path text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare parts text[]:=string_to_array(p_path,'/'); v_company_id bigint; audit public.documentary_audits; finding public.documentary_audit_findings;
begin
  if (select auth.uid()) is null or array_length(parts,1) is distinct from 6 or parts[5]<>(select auth.uid())::text
    or parts[4] not in ('audit','finding','treatment','closure')
    or parts[6]!~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx|xlsx|pptx|txt|csv|jpg|png|webp)$' then return false; end if;
  v_company_id:=parts[1]::bigint;
  perform parts[3]::uuid;
  if not public.user_belongs_to_company(v_company_id) then return false; end if;
  select * into audit from public.documentary_audits a where a.id=parts[2]::uuid and a.company_id=v_company_id;
  if audit.id is null then return false; end if;
  if parts[4]='audit' then return parts[3]=audit.id::text and internal_audit_private.can_manage(v_company_id); end if;
  select * into finding from public.documentary_audit_findings f where f.id=parts[3]::uuid;
  if finding.id is not null and (finding.company_id<>v_company_id or finding.audit_id<>audit.id) then return false; end if;
  if parts[4]='finding' then return internal_audit_private.can_manage(v_company_id) and (finding.id is null or finding.status<>'closed'); end if;
  if finding.id is null or not documentary_audit_private.can_read_finding(finding.id) then return false; end if;
  if parts[4]='closure' then return internal_audit_private.can_manage(v_company_id)
    and (finding.status='resolved' or (finding.category='remark' and finding.status<>'closed')); end if;
  return finding.status<>'closed' or internal_audit_private.can_manage(v_company_id);
exception when others then return false;
end;
$$;
create function documentary_audit_private.can_read_file(p_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select (select auth.uid()) is not null and (
    exists(select 1 from public.documentary_audits audit cross join lateral jsonb_array_elements(audit.files) file
      where file->>'storagePath'=p_path and documentary_audit_private.can_read_audit(audit.id))
    or exists(select 1 from public.documentary_audit_findings finding cross join lateral jsonb_array_elements(finding.files) file
      where file->>'storagePath'=p_path and documentary_audit_private.can_read_finding(finding.id))
    or exists(select 1 from public.documentary_audit_events event cross join lateral jsonb_array_elements(event.files) file
      where file->>'storagePath'=p_path and documentary_audit_private.can_read_finding(event.finding_id))
    or (not documentary_audit_private.file_is_linked(p_path) and documentary_audit_private.can_upload_file(p_path)));
$$;
create policy documentary_audit_files_read on storage.objects for select to authenticated
  using(bucket_id='documentary-audit-files' and documentary_audit_private.can_read_file(name));
create policy documentary_audit_files_upload on storage.objects for insert to authenticated
  with check(bucket_id='documentary-audit-files' and owner_id=(select auth.uid())::text and documentary_audit_private.can_upload_file(name));
create policy documentary_audit_files_cleanup on storage.objects for delete to authenticated
  using(bucket_id='documentary-audit-files' and owner_id=(select auth.uid())::text
    and not documentary_audit_private.file_is_linked(name) and documentary_audit_private.can_upload_file(name));
-- No UPDATE policy: stored evidence is never replaced via upsert.

create function documentary_audit_private.validate_file_refs(p_files jsonb,p_company_id bigint,p_audit_id uuid,p_record_id uuid,p_kind text,p_existing jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare file jsonb; normalized jsonb; result jsonb:='[]'::jsonb; existing jsonb; object storage.objects;
  path text; extension text; paths text[]:='{}'; ids uuid[]:='{}'; new_count integer:=0; byte_limit bigint;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise.' using errcode='42501'; end if;
  if p_files is null or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>100 then raise exception 'La liste de fichiers est invalide.' using errcode='22023'; end if;
  for file in select value from jsonb_array_elements(p_files) loop
    if jsonb_typeof(file) is distinct from 'object' or jsonb_typeof(file->'id') is distinct from 'string'
      or jsonb_typeof(file->'fileName') is distinct from 'string' or length(btrim(file->>'fileName')) not between 1 and 255
      or jsonb_typeof(file->'storagePath') is distinct from 'string' or jsonb_typeof(file->'mimeType') is distinct from 'string'
      or jsonb_typeof(file->'sizeBytes') is distinct from 'number' or (file->>'sizeBytes')::numeric not between 1 and 26214400
      or (file->>'sizeBytes')::numeric<>trunc((file->>'sizeBytes')::numeric) then raise exception 'Métadonnées de fichier invalides.' using errcode='22023'; end if;
    perform (file->>'id')::uuid;
    if (file->>'id')::uuid=any(ids) then raise exception 'Chaque fichier doit avoir un identifiant unique.' using errcode='22023'; end if;
    ids:=array_append(ids,(file->>'id')::uuid);
    extension:=documentary_audit_private.file_extension(file->>'mimeType');
    byte_limit:=case when file->>'mimeType' like 'image/%' then 10485760 else 26214400 end;
    if extension is null or (file->>'sizeBytes')::bigint>byte_limit then raise exception 'Format ou taille de fichier non autorisé.' using errcode='22023'; end if;
    path:=file->>'storagePath';
    if path=any(paths) then raise exception 'Un fichier ne peut pas être ajouté plusieurs fois.' using errcode='22023'; end if;
    paths:=array_append(paths,path);
    normalized:=jsonb_build_object('id',file->>'id','fileName',btrim(file->>'fileName'),'storagePath',path,'mimeType',file->>'mimeType','sizeBytes',(file->>'sizeBytes')::bigint);
    select value into existing from jsonb_array_elements(p_existing) where value->>'storagePath'=path;
    if existing is not null then
      if normalized<>existing then raise exception 'Un fichier enregistré ne peut pas être remplacé.' using errcode='22023'; end if;
    else
      new_count:=new_count+1;
      if new_count>10 or path<>p_company_id::text||'/'||p_audit_id::text||'/'||p_record_id::text||'/'||p_kind||'/'||(select auth.uid())::text||'/'||(file->>'id')||'.'||extension then
        raise exception 'Le chemin ou le nombre de fichiers est invalide pour cet enregistrement.' using errcode='22023'; end if;
      if not documentary_audit_private.can_upload_file(path) or documentary_audit_private.file_is_linked(path) then raise exception 'Le fichier est inaccessible ou déjà utilisé.' using errcode='42501'; end if;
      select * into object from storage.objects where bucket_id='documentary-audit-files' and name=path and owner_id=(select auth.uid())::text;
      if object.id is null or object.metadata->>'mimetype' is distinct from file->>'mimeType'
        or (object.metadata->>'size')::bigint is distinct from (file->>'sizeBytes')::bigint then raise exception 'Le fichier téléversé est absent ou invalide.' using errcode='22023'; end if;
    end if;
    result:=result||jsonb_build_array(normalized);
  end loop;
  if exists(select 1 from jsonb_array_elements(p_existing) old_file where not(old_file->>'storagePath'=any(paths))) then
    raise exception 'Les fichiers déjà enregistrés doivent être conservés.' using errcode='22023'; end if;
  return result;
end;
$$;

create function documentary_audit_private.save_audit(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id bigint:=internal_audit_private.assert_manager(p_payload); old_audit public.documentary_audits;
  target public.documentary_audits; vessel public.vessels; evidence jsonb;
begin
  if p_payload->>'id' is null or p_payload->>'kind' is null or p_payload->>'kind' not in ('ovid','ecmid','external_ism','client')
    or p_payload->>'year' is null or (p_payload->>'year')::integer not between 1900 and 9998
    or jsonb_typeof(p_payload->'title') is distinct from 'string' or length(btrim(p_payload->>'title')) not between 1 and 200 then raise exception 'Dossier invalide.' using errcode='22023'; end if;
  select * into old_audit from public.documentary_audits audit where audit.id=(p_payload->>'id')::uuid for update;
  if old_audit.id is not null and old_audit.company_id<>v_company_id then raise exception 'Dossier inaccessible.' using errcode='42501'; end if;
  if old_audit.id is not null and (old_audit.kind<>p_payload->>'kind' or old_audit.site_id is distinct from (p_payload->>'siteId')::bigint or old_audit.year<>(p_payload->>'year')::integer) then
    raise exception 'Le type, le navire et l’année d’un dossier existant sont conservés.' using errcode='22023'; end if;
  select * into vessel from public.vessels v where v.id=(p_payload->>'siteId')::bigint and v.company_id=v_company_id and v.active;
  if vessel.id is null then raise exception 'Choisissez un navire actif de cette société.' using errcode='22023'; end if;
  evidence:=documentary_audit_private.validate_file_refs(coalesce(p_payload->'files',old_audit.files,'[]'::jsonb),v_company_id,(p_payload->>'id')::uuid,(p_payload->>'id')::uuid,'audit',coalesce(old_audit.files,'[]'::jsonb));
  insert into public.documentary_audits(id,company_id,kind,site_id,vessel_id,year,title,audited_on,auditor_name,files)
  values((p_payload->>'id')::uuid,v_company_id,p_payload->>'kind',vessel.id,vessel.id,(p_payload->>'year')::integer,btrim(p_payload->>'title'),(p_payload->>'auditedOn')::date,coalesce(btrim(p_payload->>'auditorName'),''),evidence)
  on conflict(id) do update set title=excluded.title,audited_on=excluded.audited_on,auditor_name=excluded.auditor_name,files=excluded.files,updated_at=clock_timestamp()
  where old_audit.id is not null and documentary_audits.company_id=excluded.company_id and documentary_audits.kind=excluded.kind
    and documentary_audits.year=excluded.year and documentary_audits.vessel_id=excluded.vessel_id
  returning * into target;
  if target.id is null then raise exception 'Dossier inaccessible ou identité modifiée simultanément.' using errcode='42501'; end if;
  return to_jsonb(target);
end;
$$;

create function documentary_audit_private.save_finding(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_company_id bigint:=internal_audit_private.assert_manager(p_payload); old_finding public.documentary_audit_findings;
  target public.documentary_audit_findings; audit public.documentary_audits; label text;
  person_id bigint:=(p_payload->>'assigneePersonId')::bigint; vessel_id bigint:=(p_payload->>'assigneeVesselId')::bigint;
  assigned_role text:=p_payload->>'assigneeRole'; opened_date date; delay_value integer; delay_unit text; deadline date; evidence jsonb;
begin
  if p_payload->>'id' is null or p_payload->>'category' is null or p_payload->>'category' not in ('finding','major','minor','remark')
    or jsonb_typeof(p_payload->'description') is distinct from 'string' or length(btrim(p_payload->>'description')) not between 1 and 10000 then raise exception 'Constat invalide.' using errcode='22023'; end if;
  select * into old_finding from public.documentary_audit_findings f where f.id=(p_payload->>'id')::uuid for update;
  if old_finding.id is not null and old_finding.company_id<>v_company_id then raise exception 'Écart inaccessible.' using errcode='42501'; end if;
  if old_finding.status='closed' then raise exception 'Un écart clos doit être rouvert avant modification.' using errcode='55000'; end if;
  if p_payload ? 'status' and p_payload->>'status' is distinct from coalesce(old_finding.status,'open') then
    raise exception 'Le statut d’un constat change uniquement par un événement de suivi.' using errcode='22023'; end if;
  select * into audit from public.documentary_audits a where a.id=(p_payload->>'auditId')::uuid and a.company_id=v_company_id for update;
  if audit.id is null then raise exception 'Dossier inaccessible.' using errcode='42501'; end if;
  if old_finding.id is not null and old_finding.audit_id<>audit.id then raise exception 'Le dossier d’un écart existant est conservé.' using errcode='22023'; end if;
  if person_id is not null and (assigned_role is not null or vessel_id is not null) then raise exception 'Choisissez une personne ou une fonction sur un navire.' using errcode='22023'; end if;
  if person_id is not null then
    select btrim(concat_ws(' ',person.first_name,person.last_name)) into label from public.people person where person.id=person_id and person.company_id=v_company_id and person.active;
  elsif assigned_role in ('captain','chief_engineer','crew') and vessel_id is not null then
    select case assigned_role when 'captain' then 'Capitaines ' when 'chief_engineer' then 'Chefs Mécaniciens ' else 'Équipage ' end||vessel.name into label
      from public.vessels vessel where vessel.id=vessel_id and vessel.company_id=v_company_id and vessel.active;
  end if;
  if label is null then raise exception 'Responsable de traitement invalide.' using errcode='22023'; end if;
  opened_date:=coalesce(old_finding.opened_on,(clock_timestamp() at time zone 'Europe/Paris')::date);
  if p_payload->>'category'='remark' then delay_value:=null; delay_unit:=null;
  elsif p_payload->>'category' in ('major','minor') then
    if (p_payload->>'treatmentDelayValue' is null)<>(p_payload->>'treatmentDelayUnit' is null) then raise exception 'Durée de traitement incomplète.' using errcode='22023'; end if;
    delay_value:=coalesce((p_payload->>'treatmentDelayValue')::integer,case when old_finding.category=p_payload->>'category' then old_finding.treatment_delay_value end,1);
    delay_unit:=coalesce(p_payload->>'treatmentDelayUnit',case when old_finding.category=p_payload->>'category' then old_finding.treatment_delay_unit end,case when p_payload->>'category'='major' then 'weeks' else 'months' end);
  else
    delay_value:=case when p_payload ? 'treatmentDelayValue' then (p_payload->>'treatmentDelayValue')::integer when old_finding.category='finding' then old_finding.treatment_delay_value end;
    delay_unit:=case when p_payload ? 'treatmentDelayUnit' then p_payload->>'treatmentDelayUnit' when old_finding.category='finding' then old_finding.treatment_delay_unit end;
  end if;
  deadline:=internal_audit_private.finding_due_on(opened_date,delay_value,delay_unit);
  evidence:=documentary_audit_private.validate_file_refs(coalesce(p_payload->'files',old_finding.files,'[]'::jsonb),v_company_id,audit.id,(p_payload->>'id')::uuid,'finding',coalesce(old_finding.files,'[]'::jsonb));
  insert into public.documentary_audit_findings(id,company_id,audit_id,reference,category,description,assignee_person_id,assignee_role,assignee_vessel_id,assignee_label,opened_on,treatment_delay_value,treatment_delay_unit,due_on,files)
  values((p_payload->>'id')::uuid,v_company_id,audit.id,coalesce(btrim(p_payload->>'reference'),''),p_payload->>'category',btrim(p_payload->>'description'),person_id,assigned_role,vessel_id,label,opened_date,delay_value,delay_unit,deadline,evidence)
  on conflict(id) do update set reference=excluded.reference,category=excluded.category,description=excluded.description,assignee_person_id=excluded.assignee_person_id,
    assignee_role=excluded.assignee_role,assignee_vessel_id=excluded.assignee_vessel_id,assignee_label=excluded.assignee_label,
    treatment_delay_value=excluded.treatment_delay_value,treatment_delay_unit=excluded.treatment_delay_unit,due_on=excluded.due_on,files=excluded.files,updated_at=clock_timestamp()
  where old_finding.id is not null and documentary_audit_findings.company_id=excluded.company_id and documentary_audit_findings.audit_id=excluded.audit_id
  returning * into target;
  if target.id is null then raise exception 'Écart inaccessible ou dossier modifié simultanément.' using errcode='42501'; end if;
  insert into public.documentary_audit_events(company_id,finding_id,actor_id,actor_name,status,treatment)
  values(v_company_id,target.id,(select auth.uid()),internal_audit_private.actor_name(v_company_id),target.status,
    case when old_finding.id is null then 'Création du constat. Responsable : ' else 'Modification du constat. Responsable : ' end||label||case when deadline is null then '. Sans échéance.' else '. Échéance : '||deadline::text end);
  return to_jsonb(target);
end;
$$;

create function documentary_audit_private.add_treatment(p_finding_id uuid,p_status text,p_treatment text,p_files jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.documentary_audit_findings; event public.documentary_audit_events; manager boolean; evidence jsonb; note text;
begin
  select * into target from public.documentary_audit_findings finding where finding.id=p_finding_id for update;
  if target.id is null or not documentary_audit_private.can_read_finding(target.id) then raise exception 'Écart inaccessible.' using errcode='42501'; end if;
  manager:=internal_audit_private.can_manage(target.company_id);
  if target.status='closed' and not manager then raise exception 'Un écart clos ne peut plus être traité.' using errcode='55000'; end if;
  if p_status is null or p_status not in ('open','in_progress','resolved','closed') or length(btrim(coalesce(p_treatment,'')))>10000 then raise exception 'Statut ou commentaire de traitement invalide.' using errcode='22023'; end if;
  if p_status='closed' and not manager then raise exception 'La vérification et la clôture sont réservées à la gestion des audits.' using errcode='42501'; end if;
  if p_status='closed' and target.status<>'resolved' and target.category<>'remark' then raise exception 'Traitez l’écart avant de vérifier sa clôture.' using errcode='22023'; end if;
  evidence:=documentary_audit_private.validate_file_refs(coalesce(p_files,'[]'::jsonb),target.company_id,target.audit_id,target.id,case when p_status='closed' then 'closure' else 'treatment' end);
  note:=nullif(btrim(p_treatment),'');
  if note is null then
    if p_status='closed' then note:='Clôture de l’écart vérifiée.';
    elsif jsonb_array_length(evidence)>0 then note:='Pièces justificatives ajoutées au traitement.';
    else raise exception 'Ajoutez un commentaire ou un fichier au traitement.' using errcode='22023'; end if;
  end if;
  insert into public.documentary_audit_events(company_id,finding_id,actor_id,actor_name,status,treatment,files)
  values(target.company_id,target.id,(select auth.uid()),internal_audit_private.actor_name(target.company_id),p_status,note,evidence) returning * into event;
  update public.documentary_audit_findings set status=p_status,treatment=note,
    resolved_at=case when p_status in ('resolved','closed') then coalesce(target.resolved_at,event.created_at) else null end,
    closed_at=case when p_status='closed' then event.created_at else null end,updated_at=event.created_at where id=target.id;
  return to_jsonb(event);
end;
$$;

create function documentary_audit_private.upload_scope(p_audit_id uuid,p_finding_id uuid,p_kind text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare audit public.documentary_audits; finding public.documentary_audit_findings; record_id uuid;
begin
  if (select auth.uid()) is null then raise exception 'Authentification requise.' using errcode='42501'; end if;
  select * into finding from public.documentary_audit_findings f where f.id=p_finding_id;
  if finding.id is not null and p_audit_id is not null and finding.audit_id<>p_audit_id then
    raise exception 'Le dossier et l’écart ne correspondent pas.' using errcode='42501'; end if;
  select * into audit from public.documentary_audits a where a.id=coalesce(p_audit_id,finding.audit_id);
  record_id:=case when p_kind='audit' then audit.id else p_finding_id end;
  if audit.id is null or record_id is null or p_kind is null or not documentary_audit_private.can_upload_file(
    audit.company_id::text||'/'||audit.id::text||'/'||record_id::text||'/'||p_kind||'/'||(select auth.uid())::text||'/00000000-0000-0000-0000-000000000000.pdf') then
    raise exception 'Vous ne pouvez pas ajouter de fichiers à cet enregistrement.' using errcode='42501'; end if;
  return jsonb_build_object('company_id',audit.company_id,'audit_id',audit.id);
end;
$$;

create function documentary_audit_private.overview(p_kind text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_company_id bigint:=public.current_planning_company_id(); manager boolean;
begin
  if (select auth.uid()) is null or not public.user_belongs_to_company(v_company_id) then raise exception 'Authentification requise.' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('ovid','ecmid','external_ism','client') then raise exception 'Type d’audit invalide.' using errcode='22023'; end if;
  manager:=internal_audit_private.can_manage(v_company_id);
  return jsonb_build_object('company_id',v_company_id,
    'sites',coalesce((select jsonb_agg(jsonb_build_object('id',vessel.id::text,'company_id',vessel.company_id,'name',vessel.name,
      'kind','vessel','vessel_id',vessel.id,'anniversary_on',null) order by vessel.name) from public.vessels vessel
      where vessel.company_id=v_company_id and vessel.active and (manager
        or exists(select 1 from public.documentary_audits audit where audit.vessel_id=vessel.id and audit.kind=p_kind and documentary_audit_private.can_read_audit(audit.id)))),'[]'::jsonb),
    'people',coalesce((select jsonb_agg(jsonb_build_object('id',person.id,'name',btrim(concat_ws(' ',person.first_name,person.last_name)),'function_label',person.function_label) order by person.last_name,person.first_name)
      from public.people person where person.company_id=v_company_id and person.active and manager),'[]'::jsonb),
    'audits',coalesce((select jsonb_agg(to_jsonb(audit) order by audit.year desc,audit.title) from public.documentary_audits audit where audit.company_id=v_company_id and audit.kind=p_kind and documentary_audit_private.can_read_audit(audit.id)),'[]'::jsonb),
    'findings',coalesce((select jsonb_agg(to_jsonb(finding) order by finding.due_on,finding.created_at) from public.documentary_audit_findings finding
      join public.documentary_audits audit on audit.id=finding.audit_id where finding.company_id=v_company_id and audit.kind=p_kind and documentary_audit_private.can_read_finding(finding.id)),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(event) order by event.created_at,event.id) from public.documentary_audit_events event
      join public.documentary_audit_findings finding on finding.id=event.finding_id join public.documentary_audits audit on audit.id=finding.audit_id
      where event.company_id=v_company_id and audit.kind=p_kind and documentary_audit_private.can_read_finding(finding.id)),'[]'::jsonb),
    'permissions',jsonb_build_object('canManage',manager,'treatableFindingIds',coalesce((select jsonb_agg(finding.id) from public.documentary_audit_findings finding
      join public.documentary_audits audit on audit.id=finding.audit_id where finding.company_id=v_company_id and audit.kind=p_kind
      and (finding.status<>'closed' or manager) and documentary_audit_private.can_read_finding(finding.id)),'[]'::jsonb)));
end;
$$;

create function public.documentary_audits_overview(p_kind text) returns jsonb language sql stable security invoker set search_path='' as $$select documentary_audit_private.overview(p_kind);$$;
create function public.documentary_audit_save(p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select documentary_audit_private.save_audit(p_payload);$$;
create function public.documentary_audit_save_finding(p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select documentary_audit_private.save_finding(p_payload);$$;
create function public.documentary_audit_add_treatment(p_finding_id uuid,p_status text,p_treatment text,p_files jsonb) returns jsonb language sql security invoker set search_path='' as $$select documentary_audit_private.add_treatment(p_finding_id,p_status,p_treatment,p_files);$$;
create function public.documentary_audit_upload_scope(p_audit_id uuid,p_finding_id uuid,p_kind text) returns jsonb language sql stable security invoker set search_path='' as $$select documentary_audit_private.upload_scope(p_audit_id,p_finding_id,p_kind);$$;

revoke all on all functions in schema documentary_audit_private from public,anon,authenticated;
grant execute on all functions in schema documentary_audit_private to authenticated;
revoke all on function public.documentary_audits_overview(text),public.documentary_audit_save(jsonb),public.documentary_audit_save_finding(jsonb),
  public.documentary_audit_add_treatment(uuid,text,text,jsonb),public.documentary_audit_upload_scope(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.documentary_audits_overview(text),public.documentary_audit_save(jsonb),public.documentary_audit_save_finding(jsonb),
  public.documentary_audit_add_treatment(uuid,text,text,jsonb),public.documentary_audit_upload_scope(uuid,uuid,text) to authenticated;

insert into public.role_module_permissions(role_key,module_key,is_visible)
select key,'ovid',true from public.roles where key in ('admin','direction','armement','capitaine','marin')
on conflict(role_key,module_key) do nothing;
comment on table public.documentary_audits is 'One documentary audit dossier per company, type, campaign year and vessel, with private retained report files.';
comment on table public.documentary_audit_findings is 'Assigned documentary audit findings, nonconformities and optional remarks with server-calculated deadlines.';
comment on table public.documentary_audit_events is 'Append-only real-actor treatment and closure history with retained private attachments.';
notify pgrst,'reload schema';
