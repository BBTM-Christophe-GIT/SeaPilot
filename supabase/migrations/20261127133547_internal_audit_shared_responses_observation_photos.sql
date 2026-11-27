-- Observation evidence is registered once even when a common response uses it
-- on multiple questions. Removed draft references do not unprotect the file.
create table internal_audit_private.observation_photos (
  storage_path text primary key,
  object_id uuid not null unique references storage.objects(id) on delete restrict,
  audit_id uuid not null,
  company_id bigint not null,
  photo jsonb not null,
  foreign key (audit_id,company_id) references public.internal_audits(id,company_id) on delete restrict
);
create index internal_audit_observation_photos_audit_idx
  on internal_audit_private.observation_photos(audit_id,company_id);
alter table internal_audit_private.observation_photos enable row level security;
revoke all on table internal_audit_private.observation_photos from public,anon,authenticated;

create function internal_audit_private.can_access_observation_upload(p_path text,p_require_editable boolean)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  parts text[] := string_to_array(p_path,'/');
  scope_company_id bigint;
  scope_audit_id uuid;
begin
  if (select auth.uid()) is null
    or cardinality(parts) is distinct from 6
    or parts[2] <> parts[3]
    or parts[4] <> 'observation'
    or parts[5] <> (select auth.uid())::text
    or parts[6] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$' then
    return false;
  end if;
  scope_company_id := parts[1]::bigint;
  scope_audit_id := parts[2]::uuid;
  return parts[1] = scope_company_id::text and parts[2] = scope_audit_id::text
    and public.current_planning_company_id() = scope_company_id
    and internal_audit_private.can_manage(scope_company_id)
    and exists(select 1 from public.internal_audits audit
      where audit.id = scope_audit_id and audit.company_id = scope_company_id
        and (not p_require_editable or audit.status <> 'completed'))
    and not exists(select 1 from internal_audit_private.observation_photos saved where saved.storage_path = p_path);
exception when invalid_text_representation or numeric_value_out_of_range then
  return false;
end;
$$;

create function internal_audit_private.can_read_observation_photo(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists(
    select 1 from internal_audit_private.observation_photos saved
    join public.internal_audits audit on (audit.id,audit.company_id) = (saved.audit_id,saved.company_id)
    where saved.storage_path = p_path
      and (internal_audit_private.can_manage(saved.company_id) or exists(
        select 1 from jsonb_array_elements(audit.rows) question
        join public.internal_audit_findings finding
          on (finding.audit_id,finding.company_id,finding.question_id) = (audit.id,audit.company_id,question->>'id')
        where (question->'observationPhotos') @> jsonb_build_array(jsonb_build_object('storagePath',p_path))
          and internal_audit_private.can_read_finding(finding.id)
      ))
  );
$$;

revoke all on function internal_audit_private.can_access_observation_upload(text,boolean),
  internal_audit_private.can_read_observation_photo(text) from public,anon,authenticated;
grant execute on function internal_audit_private.can_access_observation_upload(text,boolean),
  internal_audit_private.can_read_observation_photo(text) to authenticated;

-- The owner can still clean up a staged file if another manager completes the
-- audit before attachment. This requires both SELECT and DELETE on that file.
create policy internal_audit_observation_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'internal-audit-photos' and (
    internal_audit_private.can_read_observation_photo(name)
    or (owner_id = (select auth.uid())::text and internal_audit_private.can_access_observation_upload(name,false))
  ));
create policy internal_audit_observation_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'internal-audit-photos' and owner_id = (select auth.uid())::text
    and internal_audit_private.can_access_observation_upload(name,true));
create policy internal_audit_observation_photos_cleanup on storage.objects for delete to authenticated
  using (bucket_id = 'internal-audit-photos' and owner_id = (select auth.uid())::text
    and internal_audit_private.can_access_observation_upload(name,false));

create function internal_audit_private.normalize_observation_photos(p_photos jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  photo jsonb;
  normalized jsonb := '[]'::jsonb;
  photo_id uuid;
  photo_ids uuid[] := '{}';
  paths text[] := '{}';
  path text;
  size_bytes numeric;
begin
  if jsonb_typeof(p_photos) is distinct from 'array' or jsonb_array_length(p_photos) > 100 then
    raise exception 'La liste de photos d’observation est invalide.' using errcode = '22023';
  end if;
  for photo in select value from jsonb_array_elements(p_photos) loop
    if jsonb_typeof(photo) is distinct from 'object'
      or jsonb_typeof(photo->'id') is distinct from 'string'
      or jsonb_typeof(photo->'fileName') is distinct from 'string'
      or length(btrim(photo->>'fileName')) not between 1 and 255
      or jsonb_typeof(photo->'storagePath') is distinct from 'string'
      or jsonb_typeof(photo->'mimeType') is distinct from 'string'
      or photo->>'mimeType' not in ('image/jpeg','image/png','image/webp')
      or jsonb_typeof(photo->'sizeBytes') is distinct from 'number' then
      raise exception 'Métadonnées de photo d’observation invalides.' using errcode = '22023';
    end if;
    size_bytes := (photo->>'sizeBytes')::numeric;
    if size_bytes <> trunc(size_bytes) or size_bytes not between 1 and 10485760
      or photo->>'id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Métadonnées de photo d’observation invalides.' using errcode = '22023';
    end if;
    photo_id := (photo->>'id')::uuid;
    path := photo->>'storagePath';
    if photo_id = any(photo_ids) or path = any(paths) then
      raise exception 'Une photo ne peut pas être ajoutée deux fois à la même observation.' using errcode = '22023';
    end if;
    photo_ids := array_append(photo_ids,photo_id);
    paths := array_append(paths,path);
    normalized := normalized || jsonb_build_array(jsonb_build_object(
      'id',photo_id,'fileName',btrim(photo->>'fileName'),'storagePath',path,'mimeType',photo->>'mimeType','sizeBytes',size_bytes::bigint
    ));
  end loop;
  return normalized;
end;
$$;

create function internal_audit_private.validate_shared_responses()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  photo jsonb;
  saved internal_audit_private.observation_photos;
  uploaded storage.objects;
  path text;
  extension text;
begin
  if jsonb_typeof(new.rows) is distinct from 'array' then return new; end if;
  if tg_op = 'INSERT' then
    -- Creation copies the questions from the template. Common responses and
    -- evidence belong to the editable audit, never to a template. The regular
    -- save upserts existing audits: leave its row data to the UPDATE phase.
    if exists(select 1 from public.internal_audits audit where audit.id = new.id) then return new; end if;
    select coalesce(jsonb_agg(question - 'responseGroupId' - 'observationPhotos' order by ordinal),'[]'::jsonb)
      into new.rows from jsonb_array_elements(new.rows) with ordinality items(question,ordinal);
    return new;
  end if;
  if not (old.rows @? '$[*].responseGroupId' or old.rows @? '$[*].observationPhotos'
    or new.rows @? '$[*].responseGroupId' or new.rows @? '$[*].observationPhotos') then
    return new;
  end if;

  -- Older clients can omit a field. Null explicitly unlinks a row, and an
  -- empty array explicitly removes its draft photo references.
  select coalesce(jsonb_agg(pending.question
    || case when not pending.question ? 'responseGroupId' and prior.question ? 'responseGroupId'
      then jsonb_build_object('responseGroupId',prior.question->'responseGroupId') else '{}'::jsonb end
    || case when pending.question ? 'observationPhotos'
      then jsonb_build_object('observationPhotos',internal_audit_private.normalize_observation_photos(pending.question->'observationPhotos'))
      when prior.question ? 'observationPhotos'
      then jsonb_build_object('observationPhotos',prior.question->'observationPhotos') else '{}'::jsonb end
    order by pending.ordinal),'[]'::jsonb)
  into new.rows
  from jsonb_array_elements(new.rows) with ordinality pending(question,ordinal)
  left join jsonb_array_elements(old.rows) prior(question) on prior.question->>'id' = pending.question->>'id';

  if exists(select 1 from jsonb_array_elements(new.rows) question
    where question->>'responseGroupId' is not null
      and (jsonb_typeof(question->'responseGroupId') <> 'string'
        or question->>'responseGroupId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then
    raise exception 'L’identifiant de la réponse commune est invalide.' using errcode = '22023';
  end if;
  if exists(select 1 from jsonb_array_elements(new.rows) question
    where question->>'responseGroupId' is not null
    group by question->>'responseGroupId'
    having count(*) < 2 or count(distinct jsonb_build_array(question->'answer',question->'observation',
      coalesce(question->'observationPhotos','[]'::jsonb))) <> 1) then
    raise exception 'Une réponse commune doit être identique sur au moins deux références.' using errcode = '22023';
  end if;

  for photo in
    select distinct item
    from jsonb_array_elements(new.rows) question
    cross join lateral jsonb_array_elements(coalesce(question->'observationPhotos','[]'::jsonb)) item
  loop
    path := photo->>'storagePath';
    select * into saved from internal_audit_private.observation_photos item where item.storage_path = path;
    if saved.storage_path is not null then
      if (saved.audit_id,saved.company_id) is distinct from (new.id,new.company_id) or saved.photo <> photo then
        raise exception 'Cette photo d’observation ne peut pas être réutilisée ou remplacée.' using errcode = '22023';
      end if;
      continue;
    end if;
    extension := case photo->>'mimeType' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' else 'webp' end;
    if path is distinct from new.company_id::text||'/'||new.id::text||'/'||new.id::text||'/observation/'
      ||(select auth.uid())::text||'/'||(photo->>'id')||'.'||extension
      or not internal_audit_private.can_access_observation_upload(path,true) then
      raise exception 'La photo d’observation est inaccessible pour cet audit.' using errcode = '42501';
    end if;
    select * into uploaded from storage.objects
      where bucket_id = 'internal-audit-photos' and name = path and owner_id = (select auth.uid())::text;
    if uploaded.id is null or uploaded.metadata->>'mimetype' is distinct from photo->>'mimeType'
      or uploaded.metadata->>'size' is distinct from photo->>'sizeBytes' then
      raise exception 'La photo d’observation téléversée est absente ou invalide.' using errcode = '22023';
    end if;
    insert into internal_audit_private.observation_photos(storage_path,object_id,audit_id,company_id,photo)
      values (path,uploaded.id,new.id,new.company_id,photo);
  end loop;
  return new;
end;
$$;

revoke all on function internal_audit_private.normalize_observation_photos(jsonb),
  internal_audit_private.validate_shared_responses() from public,anon,authenticated;

create trigger internal_audits_validate_shared_responses
  before insert or update of rows on public.internal_audits
  for each row execute function internal_audit_private.validate_shared_responses();
