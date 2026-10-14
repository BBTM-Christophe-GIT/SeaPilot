-- Medical records stay outside exposed schemas and have no direct client grants.
-- Only active company administrators and currently published, confirmed captains
-- may read or write; navigation permissions never confer access to patient data.
create schema medical_logbook_private;
revoke all on schema medical_logbook_private from public, anon, authenticated;
grant usage on schema medical_logbook_private to authenticated;
alter default privileges in schema medical_logbook_private revoke execute on functions from public;

create table medical_logbook_private.entries (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete restrict,
  vessel_id bigint not null references public.vessels(id) on delete restrict,
  occurred_on date not null,
  occurred_time time without time zone not null check (extract(second from occurred_time) = 0),
  patient_name text not null check (length(btrim(patient_name)) between 1 and 160),
  injury_illness text not null check (length(btrim(injury_illness)) between 1 and 4000),
  treatment_medicines text not null check (length(btrim(treatment_medicines)) between 1 and 4000),
  first_aider_name text not null check (length(btrim(first_aider_name)) between 1 and 160),
  signature_name text not null check (length(btrim(signature_name)) between 1 and 160),
  signature_version_id bigint not null references public.working_time_profile_signatures(id) on delete restrict,
  signature_snapshot jsonb not null check (jsonb_typeof(signature_snapshot) = 'object'),
  revision integer not null default 1 check (revision >= 1),
  archived boolean not null default false,
  created_by uuid not null,
  updated_by uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index medical_logbook_entries_vessel_idx
  on medical_logbook_private.entries(company_id, vessel_id, occurred_on desc, occurred_time desc, id desc);
create index medical_logbook_entries_vessel_fk_idx on medical_logbook_private.entries(vessel_id);
create index medical_logbook_entries_signature_fk_idx on medical_logbook_private.entries(signature_version_id);
create index medical_logbook_entries_signature_path_idx on medical_logbook_private.entries((signature_snapshot->>'storage_path'));

create table medical_logbook_private.history (
  id bigint generated always as identity primary key,
  entry_id bigint not null references medical_logbook_private.entries(id) on delete restrict,
  signature_version_id bigint not null references public.working_time_profile_signatures(id) on delete restrict,
  revision integer not null,
  action text not null check (action in ('created', 'updated', 'archived', 'restored')),
  changed_at timestamptz not null,
  actor_id uuid not null,
  actor_name text not null,
  entry jsonb not null,
  unique(entry_id, revision)
);
create index medical_logbook_history_signature_path_idx on medical_logbook_private.history((entry#>>'{signature_snapshot,storage_path}'));
create index medical_logbook_history_signature_fk_idx on medical_logbook_private.history(signature_version_id);
alter table medical_logbook_private.entries enable row level security;
alter table medical_logbook_private.history enable row level security;
revoke all on all tables in schema medical_logbook_private from public, anon, authenticated;
revoke all on all sequences in schema medical_logbook_private from public, anon, authenticated;

create function medical_logbook_private.can_access(p_vessel_id bigint)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.vessels vessel
    join public.companies company on company.id = vessel.company_id and company.active
    join public.profiles profile on profile.id = auth.uid() and profile.active_company_id = company.id
    join public.company_memberships membership
      on membership.user_id = profile.id and membership.company_id = company.id and membership.active
    where vessel.id = p_vessel_id and vessel.active and vessel.asset_kind = 'vessel'
      and (
        public.has_company_role(company.id, array['admin'])
        or (
          public.has_company_role(company.id, array['capitaine'])
          and exists (
            select 1 from public.people person
            join public.planning_assignments assignment on assignment.company_id = company.id
              and assignment.vessel_id = vessel.id
              and (assignment.crew_person_id = person.id or assignment.captain_person_id = person.id)
            where person.company_id = company.id and person.user_id = auth.uid() and person.active
              and assignment.confirmation_status = 'confirmed'
              and (current_timestamp at time zone 'Europe/Paris')::date between assignment.starts_on and assignment.ends_on
              and exists (
                select 1 from (
                  select release.snapshot from public.planning_releases release
                  where release.company_id = company.id order by release.version_number desc limit 1
                ) published
                cross join lateral jsonb_array_elements(coalesce(published.snapshot->'assignments', '[]'::jsonb)) item
                where item->>'id' = assignment.id::text and item->>'vessel_id' = vessel.id::text
                  and item->>'confirmation_status' = 'confirmed'
                  and (item->>'crew_person_id' = person.id::text or item->>'captain_person_id' = person.id::text)
                  and (current_timestamp at time zone 'Europe/Paris')::date::text
                    between item->>'starts_on' and item->>'ends_on'
              )
          )
        )
      )
  );
$$;

create function medical_logbook_private.entry_json(p_entry medical_logbook_private.entries)
returns jsonb language sql immutable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p_entry.id, 'company_id', p_entry.company_id, 'vessel_id', p_entry.vessel_id,
    'occurred_on', to_char(p_entry.occurred_on, 'YYYY-MM-DD'), 'occurred_time', to_char(p_entry.occurred_time, 'HH24:MI'),
    'patient_name', p_entry.patient_name, 'injury_illness', p_entry.injury_illness,
    'treatment_medicines', p_entry.treatment_medicines, 'first_aider_name', p_entry.first_aider_name,
    'signature_name', p_entry.signature_name, 'signature_version_id', p_entry.signature_version_id, 'signature_snapshot', p_entry.signature_snapshot,
    'revision', p_entry.revision, 'archived', p_entry.archived, 'created_at', p_entry.created_at, 'updated_at', p_entry.updated_at
  );
$$;

create function medical_logbook_private.validate_content(p_entry jsonb)
returns jsonb language plpgsql immutable security invoker set search_path = '' as $$
declare
  field text; field_limit integer;
  occurred_on date; occurred_time time without time zone;
begin
  if p_entry is null or jsonb_typeof(p_entry) <> 'object'
    or exists(select 1 from jsonb_object_keys(p_entry) key where key <> all(array[
      'occurred_on', 'occurred_time', 'patient_name', 'injury_illness', 'treatment_medicines',
      'first_aider_name'
    ])) then
    raise exception 'MEDICAL_LOGBOOK_INVALID_CONTENT' using errcode = '22023';
  end if;
  foreach field in array array['occurred_on', 'occurred_time', 'patient_name', 'injury_illness', 'treatment_medicines', 'first_aider_name'] loop
    if jsonb_typeof(p_entry->field) is distinct from 'string' then
      raise exception 'MEDICAL_LOGBOOK_REQUIRED_FIELD: %', field using errcode = '22023';
    end if;
    if field not in ('occurred_on', 'occurred_time') then
      field_limit := case when field in ('injury_illness', 'treatment_medicines') then 4000 else 160 end;
      if length(btrim(p_entry->>field)) not between 1 and field_limit then
        raise exception 'MEDICAL_LOGBOOK_INVALID_FIELD: %', field using errcode = '22023';
      end if;
      p_entry := jsonb_set(p_entry, array[field], to_jsonb(btrim(p_entry->>field)));
    end if;
  end loop;
  if p_entry->>'occurred_on' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or p_entry->>'occurred_time' !~ '^[0-9]{2}:[0-9]{2}(:00)?$' then
    raise exception 'MEDICAL_LOGBOOK_INVALID_DATE_TIME' using errcode = '22023';
  end if;
  begin
    occurred_on := (p_entry->>'occurred_on')::date;
    occurred_time := (p_entry->>'occurred_time')::time;
    if extract(hour from occurred_time) >= 24 or to_char(occurred_on, 'YYYY-MM-DD') <> p_entry->>'occurred_on' then
      raise exception 'MEDICAL_LOGBOOK_INVALID_DATE_TIME' using errcode = '22023';
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'MEDICAL_LOGBOOK_INVALID_DATE_TIME' using errcode = '22023';
  end;
  return p_entry || jsonb_build_object('occurred_time', to_char(occurred_time, 'HH24:MI'));
end;
$$;

-- The signed identity and version come only from the connected account's active
-- personnel profile. Lock both version and object until the entry is committed.
create function medical_logbook_private.capture_signature(p_company_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare person bigint; signature public.working_time_profile_signatures%rowtype; snapshot jsonb; object_id uuid;
begin
  if auth.uid() is null then raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501'; end if;
  select record.id into person from public.people record
    where record.company_id = p_company_id and record.user_id = auth.uid() and record.active order by record.id limit 1;
  if person is null then raise exception 'MEDICAL_LOGBOOK_PROFILE_SIGNATURE_REQUIRED' using errcode = '23514'; end if;
  select * into signature from public.working_time_profile_signatures record
    where record.company_id = p_company_id and record.person_id = person and record.valid_to is null
      and record.valid_from <= clock_timestamp() and record.storage_bucket = 'working-time-signatures' and record.mime_type = 'image/png'
    order by record.version_number desc limit 1 for share;
  if signature.id is null then raise exception 'MEDICAL_LOGBOOK_PROFILE_SIGNATURE_REQUIRED' using errcode = '23514'; end if;
  select object.id into object_id from storage.objects object join storage.buckets bucket on bucket.id = object.bucket_id and not bucket.public
    where object.bucket_id = signature.storage_bucket and object.name = signature.storage_path
      and object.metadata->>'mimetype' = 'image/png'
      and case when object.metadata->>'size' ~ '^[0-9]+$'
        then (object.metadata->>'size')::numeric between 1 and 1048576 and (object.metadata->>'size')::numeric = signature.file_size_bytes
        else false end
    for share of object;
  if object_id is null then raise exception 'MEDICAL_LOGBOOK_PROFILE_SIGNATURE_REQUIRED' using errcode = '23514'; end if;
  snapshot := public.working_time_active_signature_snapshot(p_company_id, person);
  if snapshot->>'signature_id' is distinct from signature.id::text then
    raise exception 'MEDICAL_LOGBOOK_PROFILE_SIGNATURE_REQUIRED' using errcode = '23514';
  end if;
  if length(btrim(coalesce(snapshot->>'signer_name', ''))) not between 1 and 160 then
    raise exception 'MEDICAL_LOGBOOK_PROFILE_SIGNATURE_REQUIRED' using errcode = '23514';
  end if;
  return snapshot;
end;
$$;

create function medical_logbook_private.get_signer()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare company bigint; person bigint; signer_name text; profile_name text; signature jsonb;
begin
  select profile.active_company_id, profile.display_name into company, profile_name from public.profiles profile where profile.id = auth.uid();
  if auth.uid() is null or company is null or not public.has_company_role(company, array['admin', 'capitaine'])
    or not exists(select 1 from public.companies record where record.id = company and record.active) then
    raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501';
  end if;
  select record.id, btrim(record.first_name || ' ' || record.last_name) into person, signer_name from public.people record
    where record.company_id = company and record.user_id = auth.uid() and record.active order by record.id limit 1;
  if person is not null then
    begin signature := medical_logbook_private.capture_signature(company); exception when check_violation then signature := null; end;
  end if;
  return jsonb_build_object('person_id', person, 'signer_name', coalesce(signer_name, profile_name, ''), 'signature', signature);
end;
$$;

create function medical_logbook_private.protect_entry()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'MEDICAL_LOGBOOK_NO_HARD_DELETE' using errcode = '42501'; end if;
  if new.id <> old.id or new.company_id <> old.company_id or new.vessel_id <> old.vessel_id
    or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'MEDICAL_LOGBOOK_IMMUTABLE_SCOPE' using errcode = '42501';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'MEDICAL_LOGBOOK_INVALID_REVISION' using errcode = '40001';
  end if;
  return new;
end;
$$;
create trigger medical_logbook_entry_guard before update or delete on medical_logbook_private.entries
  for each row execute function medical_logbook_private.protect_entry();

create function medical_logbook_private.reject_history_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin raise exception 'MEDICAL_LOGBOOK_IMMUTABLE_HISTORY' using errcode = '42501'; end;
$$;
create trigger medical_logbook_history_guard before update or delete on medical_logbook_private.history
  for each row execute function medical_logbook_private.reject_history_mutation();

create function medical_logbook_private.record_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_name text; action text;
begin
  if auth.uid() is null then raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501'; end if;
  select coalesce(nullif(btrim(profile.display_name), ''), profile.email) into actor_name
    from public.profiles profile where profile.id = auth.uid();
  action := case when tg_op = 'INSERT' then 'created'
    when old.archived is distinct from new.archived then case when new.archived then 'archived' else 'restored' end
    else 'updated' end;
  insert into medical_logbook_private.history(entry_id, signature_version_id, revision, action, changed_at, actor_id, actor_name, entry)
    values(new.id, new.signature_version_id, new.revision, action, new.updated_at, auth.uid(), coalesce(actor_name, auth.uid()::text), medical_logbook_private.entry_json(new));
  return new;
end;
$$;
create trigger medical_logbook_entry_history after insert or update on medical_logbook_private.entries
  for each row execute function medical_logbook_private.record_history();

create function medical_logbook_private.get_vessels()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles profile join public.companies company on company.id = profile.active_company_id and company.active
    where profile.id = auth.uid() and public.has_company_role(company.id, array['admin', 'capitaine'])
  ) then raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', vessel.id, 'company_id', vessel.company_id, 'name', vessel.name, 'acronym', vessel.acronym,
    'registration_number', vessel.registration_number, 'call_sign', vessel.call_sign, 'registration_port', vessel.registration_port,
    'length_overall', vessel.length_overall, 'illustration_thumbnail_url', vessel.illustration_thumbnail_url, 'can_write', true
  ) order by vessel.id), '[]'::jsonb) into result
  from public.vessels vessel where medical_logbook_private.can_access(vessel.id);
  return result;
end;
$$;

create function medical_logbook_private.list_entries(p_vessel_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not medical_logbook_private.can_access(p_vessel_id) then raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(medical_logbook_private.entry_json(entry) order by entry.occurred_on desc, entry.occurred_time desc, entry.id desc), '[]'::jsonb)
    into result from medical_logbook_private.entries entry where entry.vessel_id = p_vessel_id;
  return result;
end;
$$;

create function medical_logbook_private.save_entry(p_vessel_id bigint, p_entry_id bigint, p_expected_revision integer, p_entry jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare content jsonb; target medical_logbook_private.entries%rowtype; company bigint; signature jsonb;
begin
  if not medical_logbook_private.can_access(p_vessel_id) then raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501'; end if;
  content := medical_logbook_private.validate_content(p_entry);
  if p_entry_id is null then
    if p_expected_revision is not null then raise exception 'MEDICAL_LOGBOOK_REVISION_CONFLICT' using errcode = '40001'; end if;
    select vessel.company_id into strict company from public.vessels vessel where vessel.id = p_vessel_id;
    signature := medical_logbook_private.capture_signature(company);
    if content->>'first_aider_name' <> signature->>'signer_name' then
      raise exception 'MEDICAL_LOGBOOK_FIRST_AIDER_MUST_BE_SIGNER' using errcode = '22023';
    end if;
    insert into medical_logbook_private.entries(company_id, vessel_id, occurred_on, occurred_time, patient_name,
      injury_illness, treatment_medicines, first_aider_name, signature_name, signature_version_id, signature_snapshot, created_by, updated_by)
    values(company, p_vessel_id, (content->>'occurred_on')::date, (content->>'occurred_time')::time,
      content->>'patient_name', content->>'injury_illness', content->>'treatment_medicines', signature->>'signer_name',
      signature->>'signer_name', (signature->>'signature_id')::bigint, signature, auth.uid(), auth.uid()) returning * into target;
  else
    select * into target from medical_logbook_private.entries entry where entry.id = p_entry_id and entry.vessel_id = p_vessel_id for update;
    if target.id is null then raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501'; end if;
    if p_expected_revision is null or p_expected_revision <> target.revision then
      raise exception 'MEDICAL_LOGBOOK_REVISION_CONFLICT' using errcode = '40001';
    end if;
    if target.archived then raise exception 'MEDICAL_LOGBOOK_RESTORE_BEFORE_EDIT' using errcode = '22023'; end if;
    signature := medical_logbook_private.capture_signature(target.company_id);
    if content->>'first_aider_name' <> signature->>'signer_name' then
      raise exception 'MEDICAL_LOGBOOK_FIRST_AIDER_MUST_BE_SIGNER' using errcode = '22023';
    end if;
    update medical_logbook_private.entries entry set occurred_on = (content->>'occurred_on')::date,
      occurred_time = (content->>'occurred_time')::time, patient_name = content->>'patient_name', injury_illness = content->>'injury_illness',
      treatment_medicines = content->>'treatment_medicines', first_aider_name = signature->>'signer_name',
      signature_name = signature->>'signer_name', signature_version_id = (signature->>'signature_id')::bigint, signature_snapshot = signature,
      revision = entry.revision + 1, updated_by = auth.uid(), updated_at = clock_timestamp()
    where entry.id = target.id returning * into target;
  end if;
  return medical_logbook_private.entry_json(target);
end;
$$;

create function medical_logbook_private.set_archived(p_entry_id bigint, p_expected_revision integer, p_archived boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target medical_logbook_private.entries%rowtype;
begin
  select * into target from medical_logbook_private.entries entry where entry.id = p_entry_id for update;
  if target.id is null or not medical_logbook_private.can_access(target.vessel_id) then
    raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision <> target.revision then
    raise exception 'MEDICAL_LOGBOOK_REVISION_CONFLICT' using errcode = '40001';
  end if;
  if p_archived is null then raise exception 'MEDICAL_LOGBOOK_INVALID_ARCHIVE_STATE' using errcode = '22023'; end if;
  if target.archived is distinct from p_archived then
    update medical_logbook_private.entries entry set archived = p_archived, revision = entry.revision + 1,
      updated_by = auth.uid(), updated_at = clock_timestamp() where entry.id = target.id returning * into target;
  end if;
  return medical_logbook_private.entry_json(target);
end;
$$;

create function medical_logbook_private.get_history(p_entry_id bigint)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare vessel bigint; result jsonb;
begin
  select entry.vessel_id into vessel from medical_logbook_private.entries entry where entry.id = p_entry_id;
  if vessel is null or not medical_logbook_private.can_access(vessel) then
    raise exception 'MEDICAL_LOGBOOK_PERMISSION_DENIED' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', history.id, 'revision', history.revision, 'action', history.action,
    'changed_at', history.changed_at, 'actor_name', history.actor_name, 'entry', history.entry) order by history.revision desc), '[]'::jsonb)
    into result from medical_logbook_private.history history where history.entry_id = p_entry_id;
  return result;
end;
$$;

-- This policy adds access only to signature versions frozen on an authorized
-- medical entry, including its audit. It does not grant personnel-table access,
-- signature upload/update/delete rights, or public download URLs.
create function medical_logbook_private.can_read_signature_object(p_bucket text, p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and p_bucket = 'working-time-signatures' and (
    exists(select 1 from medical_logbook_private.entries entry
      where entry.signature_snapshot->>'storage_bucket' = p_bucket and entry.signature_snapshot->>'storage_path' = p_path
        and medical_logbook_private.can_access(entry.vessel_id))
    or exists(select 1 from medical_logbook_private.history history
      join medical_logbook_private.entries entry on entry.id = history.entry_id
      where history.entry#>>'{signature_snapshot,storage_bucket}' = p_bucket and history.entry#>>'{signature_snapshot,storage_path}' = p_path
        and medical_logbook_private.can_access(entry.vessel_id))
  );
$$;

revoke all on all functions in schema medical_logbook_private from public, anon, authenticated;
grant execute on function medical_logbook_private.get_signer() to authenticated;
grant execute on function medical_logbook_private.get_vessels() to authenticated;
grant execute on function medical_logbook_private.list_entries(bigint) to authenticated;
grant execute on function medical_logbook_private.save_entry(bigint, bigint, integer, jsonb) to authenticated;
grant execute on function medical_logbook_private.set_archived(bigint, integer, boolean) to authenticated;
grant execute on function medical_logbook_private.get_history(bigint) to authenticated;
grant execute on function medical_logbook_private.can_read_signature_object(text, text) to authenticated;
create policy medical_logbook_signature_snapshot_read on storage.objects for select to authenticated
  using (bucket_id = 'working-time-signatures' and medical_logbook_private.can_read_signature_object(bucket_id, name));

create function public.get_medical_logbook_signer()
returns jsonb language sql security invoker set search_path = '' as $$ select medical_logbook_private.get_signer(); $$;
create function public.get_medical_logbook_vessels()
returns jsonb language sql stable security invoker set search_path = '' as $$ select medical_logbook_private.get_vessels(); $$;
create function public.list_medical_logbook_entries(p_vessel_id bigint)
returns jsonb language sql stable security invoker set search_path = '' as $$ select medical_logbook_private.list_entries(p_vessel_id); $$;
create function public.save_medical_logbook_entry(p_vessel_id bigint, p_entry_id bigint, p_expected_revision integer, p_entry jsonb)
returns jsonb language sql security invoker set search_path = '' as $$ select medical_logbook_private.save_entry(p_vessel_id, p_entry_id, p_expected_revision, p_entry); $$;
create function public.set_medical_logbook_entry_archived(p_entry_id bigint, p_expected_revision integer, p_archived boolean)
returns jsonb language sql security invoker set search_path = '' as $$ select medical_logbook_private.set_archived(p_entry_id, p_expected_revision, p_archived); $$;
create function public.get_medical_logbook_history(p_entry_id bigint)
returns jsonb language sql stable security invoker set search_path = '' as $$ select medical_logbook_private.get_history(p_entry_id); $$;
revoke all on function public.get_medical_logbook_vessels() from public, anon, authenticated;
revoke all on function public.get_medical_logbook_signer() from public, anon, authenticated;
revoke all on function public.list_medical_logbook_entries(bigint) from public, anon, authenticated;
revoke all on function public.save_medical_logbook_entry(bigint, bigint, integer, jsonb) from public, anon, authenticated;
revoke all on function public.set_medical_logbook_entry_archived(bigint, integer, boolean) from public, anon, authenticated;
revoke all on function public.get_medical_logbook_history(bigint) from public, anon, authenticated;
grant execute on function public.get_medical_logbook_vessels() to authenticated;
grant execute on function public.get_medical_logbook_signer() to authenticated;
grant execute on function public.list_medical_logbook_entries(bigint) to authenticated;
grant execute on function public.save_medical_logbook_entry(bigint, bigint, integer, jsonb) to authenticated;
grant execute on function public.set_medical_logbook_entry_archived(bigint, integer, boolean) to authenticated;
grant execute on function public.get_medical_logbook_history(bigint) to authenticated;

insert into public.role_module_permissions(role_key, module_key, is_visible)
values ('admin', 'medicalLogbook', true), ('capitaine', 'medicalLogbook', true)
on conflict(role_key, module_key) do update set is_visible = excluded.is_visible, updated_at = now();
comment on schema medical_logbook_private is 'Confidential vessel medical logbook. Do not add this schema to exposed Data API schemas.';
comment on function medical_logbook_private.can_access(bigint) is 'Administrator of active company, or active captain with matching current confirmed assignment in both latest published release and live planning. No navigation override.';
notify pgrst, 'reload schema';
