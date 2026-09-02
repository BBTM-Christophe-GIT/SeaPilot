-- QHSE service notes: private drafts, company-wide publication, linked files,
-- one shared signature register and notification-ready recipient rows.

create table public.qhse_service_notes (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade
    default public.current_planning_company_id(),
  chronology_code text not null default '',
  subject text not null default '',
  body text not null default '',
  scope text not null default 'all_accounts',
  vessel_id bigint references public.vessels(id) on delete set null,
  status text not null default 'draft',
  author_person_id bigint references public.people(id) on delete set null
    default public.current_person_id(),
  author_identity_snapshot jsonb not null default '{}'::jsonb,
  author_signature_snapshot jsonb not null default '{}'::jsonb,
  authored_on date not null default current_date,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  source_kind text not null default 'seapilot',
  source_file_name text,
  source_web_url text,
  source_modified_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qhse_service_notes_status_check check (status in ('draft', 'published', 'archived')),
  constraint qhse_service_notes_scope_check check (scope = 'all_accounts'),
  constraint qhse_service_notes_source_kind_check check (source_kind in ('seapilot', 'sharepoint')),
  constraint qhse_service_notes_subject_check check (status = 'draft' or length(trim(subject)) between 2 and 500),
  constraint qhse_service_notes_body_check check (status = 'draft' or length(trim(body)) between 2 and 20000),
  constraint qhse_service_notes_identity_snapshot_check check (jsonb_typeof(author_identity_snapshot) = 'object'),
  constraint qhse_service_notes_signature_snapshot_check check (jsonb_typeof(author_signature_snapshot) = 'object'),
  constraint qhse_service_notes_publication_check check (
    (status = 'draft' and published_at is null and published_by is null)
    or (status in ('published', 'archived') and published_at is not null)
  ),
  constraint qhse_service_notes_company_key unique (id, company_id),
  constraint qhse_service_notes_source_url_unique unique (company_id, source_web_url)
);

create table public.qhse_service_note_attachments (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  note_id bigint not null,
  attachment_kind text not null,
  display_name text not null,
  storage_bucket text,
  storage_path text,
  external_url text,
  linked_record_id bigint,
  mime_type text,
  file_size_bytes bigint,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint qhse_service_note_attachments_note_fk foreign key (note_id, company_id)
    references public.qhse_service_notes(id, company_id) on delete cascade,
  constraint qhse_service_note_attachments_kind_check check (
    attachment_kind in ('file', 'procedure', 'action_item', 'fleet_certificate')
  ),
  constraint qhse_service_note_attachments_name_check check (length(trim(display_name)) between 1 and 500),
  constraint qhse_service_note_attachments_source_check check (
    (attachment_kind = 'file' and storage_bucket = 'service-note-files' and storage_path is not null)
    or (attachment_kind <> 'file' and linked_record_id is not null and external_url is not null)
  ),
  constraint qhse_service_note_attachments_size_check check (file_size_bytes is null or file_size_bytes between 1 and 52428800),
  constraint qhse_service_note_attachments_unique_object unique (storage_bucket, storage_path)
);

create table public.qhse_service_note_recipients (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  note_id bigint not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  person_id bigint references public.people(id) on delete set null,
  first_name_snapshot text not null default '',
  last_name_snapshot text not null default '',
  function_snapshot text not null default '',
  created_at timestamptz not null default now(),
  constraint qhse_service_note_recipients_note_fk foreign key (note_id, company_id)
    references public.qhse_service_notes(id, company_id) on delete cascade,
  constraint qhse_service_note_recipients_unique_user unique (note_id, user_id),
  constraint qhse_service_note_recipients_company_key unique (id, company_id)
);

create table public.qhse_service_note_signatures (
  id bigint generated always as identity primary key,
  company_id bigint not null references public.companies(id) on delete cascade,
  note_id bigint not null,
  recipient_id bigint not null,
  user_id uuid not null references public.profiles(id) on delete restrict,
  person_id bigint not null references public.people(id) on delete restrict,
  identity_snapshot jsonb not null,
  signature_version_id bigint not null references public.working_time_profile_signatures(id) on delete restrict,
  signature_snapshot jsonb not null,
  signed_at timestamptz not null default now(),
  read_confirmed boolean not null default true,
  constraint qhse_service_note_signatures_note_fk foreign key (note_id, company_id)
    references public.qhse_service_notes(id, company_id) on delete cascade,
  constraint qhse_service_note_signatures_recipient_fk foreign key (recipient_id, company_id)
    references public.qhse_service_note_recipients(id, company_id) on delete restrict,
  constraint qhse_service_note_signatures_identity_check check (jsonb_typeof(identity_snapshot) = 'object'),
  constraint qhse_service_note_signatures_snapshot_check check (jsonb_typeof(signature_snapshot) = 'object'),
  constraint qhse_service_note_signatures_unique_recipient unique (recipient_id),
  constraint qhse_service_note_signatures_unique_user unique (note_id, user_id)
);

create index qhse_service_notes_company_status_idx on public.qhse_service_notes (company_id, status, published_at desc);
create index qhse_service_note_attachments_note_idx on public.qhse_service_note_attachments (note_id, sort_order, id);
create index qhse_service_note_recipients_user_idx on public.qhse_service_note_recipients (user_id, note_id);
create index qhse_service_note_recipients_note_idx on public.qhse_service_note_recipients (note_id, id);
create index qhse_service_note_signatures_note_idx on public.qhse_service_note_signatures (note_id, signed_at, id);

create or replace function public.service_note_can_read(target_note_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.qhse_service_notes note
    where note.id = target_note_id
      and public.user_belongs_to_company(note.company_id)
      and (
        note.status in ('published', 'archived')
        or (
          note.status = 'draft'
          and public.has_company_role(note.company_id, array['admin', 'direction'])
        )
      )
  );
$$;

create or replace function public.service_note_can_manage(target_note_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.qhse_service_notes note
    where note.id = target_note_id
      and note.status = 'draft'
      and public.has_company_role(note.company_id, array['admin', 'direction'])
  );
$$;

create or replace function public.service_note_create_draft()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_company_id bigint := public.current_planning_company_id();
  actor_person public.people%rowtype;
  actor_profile public.profiles%rowtype;
  target_note public.qhse_service_notes%rowtype;
  chronology_sequence integer;
  chronology_year text := to_char(current_date, 'YY');
begin
  if (select auth.uid()) is null
    or target_company_id is null
    or not public.has_company_role(target_company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_CREATE_FORBIDDEN.';
  end if;

  select * into actor_person
  from public.people person
  where person.user_id = (select auth.uid())
    and person.company_id = target_company_id
  limit 1;

  select * into actor_profile
  from public.profiles profile
  where profile.id = (select auth.uid());

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(format('service-notes:%s:%s', target_company_id, chronology_year), 0)
  );

  select coalesce(max(substring(note.chronology_code from format('^NS ([0-9]+)-%s', chronology_year))::integer), 0) + 1
  into chronology_sequence
  from public.qhse_service_notes note
  where note.company_id = target_company_id;

  insert into public.qhse_service_notes (
    company_id, chronology_code, author_person_id, author_identity_snapshot, created_by
  ) values (
    target_company_id,
    format('NS %s-%s', lpad(chronology_sequence::text, 2, '0'), chronology_year),
    actor_person.id,
    jsonb_build_object(
      'user_id', (select auth.uid()),
      'person_id', actor_person.id,
      'first_name', coalesce(actor_person.first_name, ''),
      'last_name', coalesce(actor_person.last_name, ''),
      'display_name', coalesce(nullif(trim(actor_person.first_name || ' ' || actor_person.last_name), ''), actor_profile.display_name, actor_profile.email, ''),
      'function_label', coalesce(actor_person.function_label, '')
    ),
    (select auth.uid())
  ) returning * into target_note;

  return target_note.id;
end;
$$;

create or replace function public.service_note_upload_context(p_note_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
begin
  select * into target_note from public.qhse_service_notes where id = p_note_id;
  if target_note.id is null or not public.service_note_can_manage(target_note.id) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_DRAFT_FORBIDDEN.';
  end if;
  return jsonb_build_object(
    'company_id', target_note.company_id,
    'note_id', target_note.id,
    'bucket', 'service-note-files',
    'path_prefix', format('drafts/%s/%s/', target_note.company_id, target_note.id),
    'max_file_size_bytes', 52428800
  );
end;
$$;

create or replace function public.service_note_can_manage_storage_object(
  target_bucket text,
  target_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  path_company_id bigint;
  path_note_id bigint;
begin
  if target_bucket <> 'service-note-files'
    or target_path !~ '^drafts/[0-9]+/[0-9]+/.+' then
    return false;
  end if;
  path_company_id := split_part(target_path, '/', 2)::bigint;
  path_note_id := split_part(target_path, '/', 3)::bigint;
  return exists (
    select 1 from public.qhse_service_notes note
    where note.id = path_note_id
      and note.company_id = path_company_id
      and public.service_note_can_manage(note.id)
  );
exception when others then
  return false;
end;
$$;

create or replace function public.publish_service_note(p_note_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
  author_signature jsonb;
  recipient_count integer;
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id
  for update;

  if target_note.id is null or not public.service_note_can_manage(target_note.id) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_PUBLISH_FORBIDDEN.';
  end if;
  if length(trim(target_note.subject)) < 2 or length(trim(target_note.body)) < 2 then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_CONTENT_REQUIRED.';
  end if;
  if target_note.author_person_id is null then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_AUTHOR_PROFILE_REQUIRED.';
  end if;

  author_signature := public.working_time_active_signature_snapshot(
    target_note.company_id,
    target_note.author_person_id
  );
  if author_signature = '{}'::jsonb then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_AUTHOR_SIGNATURE_REQUIRED.';
  end if;

  insert into public.qhse_service_note_recipients (
    company_id, note_id, user_id, person_id,
    first_name_snapshot, last_name_snapshot, function_snapshot
  )
  select
    target_note.company_id,
    target_note.id,
    account.user_id,
    person.id,
    coalesce(person.first_name, ''),
    coalesce(person.last_name, ''),
    coalesce(person.function_label, '')
  from (
    select membership.user_id
    from public.company_memberships membership
    where membership.company_id = target_note.company_id
      and membership.active
    union
    select profile.id
    from public.profiles profile
    where profile.active_company_id = target_note.company_id
  ) account
  left join public.people person
    on person.user_id = account.user_id
   and person.company_id = target_note.company_id
  on conflict (note_id, user_id) do nothing;

  get diagnostics recipient_count = row_count;
  if recipient_count = 0 then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_RECIPIENTS_REQUIRED.';
  end if;

  update public.qhse_service_notes
  set status = 'published',
      author_signature_snapshot = author_signature,
      published_at = clock_timestamp(),
      published_by = (select auth.uid()),
      updated_at = clock_timestamp()
  where id = target_note.id;

  return target_note.id;
end;
$$;

create or replace function public.sign_service_note(p_note_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
  target_recipient public.qhse_service_note_recipients%rowtype;
  signature_data jsonb;
  existing_signature_id bigint;
  inserted_signature_id bigint;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_SIGN_FORBIDDEN.';
  end if;

  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id
  for update;

  if target_note.id is null
    or target_note.status <> 'published'
    or not public.user_belongs_to_company(target_note.company_id) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_SIGN_FORBIDDEN.';
  end if;

  select * into target_recipient
  from public.qhse_service_note_recipients recipient
  where recipient.note_id = target_note.id
    and recipient.user_id = (select auth.uid())
  for update;

  if target_recipient.id is null or target_recipient.person_id is null then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_LINKED_PERSON_REQUIRED.';
  end if;

  select signature.id into existing_signature_id
  from public.qhse_service_note_signatures signature
  where signature.note_id = target_note.id
    and signature.user_id = (select auth.uid());
  if existing_signature_id is not null then
    return existing_signature_id;
  end if;

  signature_data := public.working_time_active_signature_snapshot(
    target_note.company_id,
    target_recipient.person_id
  );
  if signature_data = '{}'::jsonb then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_ACTIVE_SIGNATURE_REQUIRED.';
  end if;

  insert into public.qhse_service_note_signatures (
    company_id, note_id, recipient_id, user_id, person_id,
    identity_snapshot, signature_version_id, signature_snapshot, signed_at
  ) values (
    target_note.company_id,
    target_note.id,
    target_recipient.id,
    (select auth.uid()),
    target_recipient.person_id,
    jsonb_build_object(
      'first_name', target_recipient.first_name_snapshot,
      'last_name', target_recipient.last_name_snapshot,
      'function_label', target_recipient.function_snapshot,
      'person_id', target_recipient.person_id,
      'user_id', target_recipient.user_id
    ),
    (signature_data->>'signature_id')::bigint,
    signature_data,
    clock_timestamp()
  ) returning id into inserted_signature_id;

  return inserted_signature_id;
end;
$$;

revoke all on function public.service_note_can_read(bigint) from public, anon;
revoke all on function public.service_note_can_manage(bigint) from public, anon;
revoke all on function public.service_note_create_draft() from public, anon;
revoke all on function public.service_note_upload_context(bigint) from public, anon;
revoke all on function public.service_note_can_manage_storage_object(text, text) from public, anon;
revoke all on function public.publish_service_note(bigint) from public, anon;
revoke all on function public.sign_service_note(bigint) from public, anon;

grant execute on function public.service_note_can_read(bigint) to authenticated;
grant execute on function public.service_note_can_manage(bigint) to authenticated;
grant execute on function public.service_note_create_draft() to authenticated;
grant execute on function public.service_note_upload_context(bigint) to authenticated;
grant execute on function public.service_note_can_manage_storage_object(text, text) to authenticated;
grant execute on function public.publish_service_note(bigint) to authenticated;
grant execute on function public.sign_service_note(bigint) to authenticated;

alter table public.qhse_service_notes enable row level security;
alter table public.qhse_service_note_attachments enable row level security;
alter table public.qhse_service_note_recipients enable row level security;
alter table public.qhse_service_note_signatures enable row level security;

create policy qhse_service_notes_read on public.qhse_service_notes
for select to authenticated
using ((select public.service_note_can_read(id)));

create policy qhse_service_notes_insert on public.qhse_service_notes
for insert to authenticated
with check (
  status = 'draft'
  and created_by = (select auth.uid())
  and public.has_company_role(company_id, array['admin', 'direction'])
);

create policy qhse_service_notes_update_draft on public.qhse_service_notes
for update to authenticated
using ((select public.service_note_can_manage(id)))
with check (
  status = 'draft'
  and public.has_company_role(company_id, array['admin', 'direction'])
);

create policy qhse_service_notes_delete_draft on public.qhse_service_notes
for delete to authenticated
using ((select public.service_note_can_manage(id)));

create policy qhse_service_note_attachments_read on public.qhse_service_note_attachments
for select to authenticated
using ((select public.service_note_can_read(note_id)));

create policy qhse_service_note_attachments_insert on public.qhse_service_note_attachments
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (select public.service_note_can_manage(note_id))
);

create policy qhse_service_note_attachments_update on public.qhse_service_note_attachments
for update to authenticated
using ((select public.service_note_can_manage(note_id)))
with check ((select public.service_note_can_manage(note_id)));

create policy qhse_service_note_attachments_delete on public.qhse_service_note_attachments
for delete to authenticated
using ((select public.service_note_can_manage(note_id)));

create policy qhse_service_note_recipients_read on public.qhse_service_note_recipients
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.has_company_role(company_id, array['admin', 'direction'])
  or (select public.service_note_can_read(note_id))
);

create policy qhse_service_note_signatures_read on public.qhse_service_note_signatures
for select to authenticated
using ((select public.service_note_can_read(note_id)));

revoke all on table public.qhse_service_notes from anon, authenticated;
revoke all on table public.qhse_service_note_attachments from anon, authenticated;
revoke all on table public.qhse_service_note_recipients from anon, authenticated;
revoke all on table public.qhse_service_note_signatures from anon, authenticated;

grant select, insert, update, delete on table public.qhse_service_notes to authenticated;
grant select, insert, update, delete on table public.qhse_service_note_attachments to authenticated;
grant select on table public.qhse_service_note_recipients to authenticated;
grant select on table public.qhse_service_note_signatures to authenticated;
grant usage, select on sequence public.qhse_service_notes_id_seq to authenticated;
grant usage, select on sequence public.qhse_service_note_attachments_id_seq to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-note-files', 'service-note-files', false, 52428800, null)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy service_note_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'service-note-files'
  and exists (
    select 1
    from public.qhse_service_note_attachments attachment
    where attachment.storage_bucket = storage.objects.bucket_id
      and attachment.storage_path = storage.objects.name
      and public.service_note_can_read(attachment.note_id)
  )
);

create policy service_note_files_insert on storage.objects
for insert to authenticated
with check (public.service_note_can_manage_storage_object(bucket_id, name));

create policy service_note_files_update on storage.objects
for update to authenticated
using (public.service_note_can_manage_storage_object(bucket_id, name))
with check (public.service_note_can_manage_storage_object(bucket_id, name));

create policy service_note_files_delete on storage.objects
for delete to authenticated
using (public.service_note_can_manage_storage_object(bucket_id, name));

create policy service_note_signature_snapshot_read on storage.objects
for select to authenticated
using (
  bucket_id = 'working-time-signatures'
  and (
    exists (
      select 1
      from public.qhse_service_note_signatures signature
      where signature.signature_snapshot->>'storage_bucket' = storage.objects.bucket_id
        and signature.signature_snapshot->>'storage_path' = storage.objects.name
        and public.service_note_can_read(signature.note_id)
    )
    or exists (
      select 1
      from public.qhse_service_notes note
      where note.author_signature_snapshot->>'storage_bucket' = storage.objects.bucket_id
        and note.author_signature_snapshot->>'storage_path' = storage.objects.name
        and public.service_note_can_read(note.id)
    )
  )
);

with module_default as (
  select role.key as role_key, 'serviceNotes'::text as module_key, true as is_visible
  from public.roles role
)
insert into public.role_module_permissions (role_key, module_key, is_visible)
select role_key, module_key, is_visible
from module_default
on conflict (role_key, module_key) do update
set is_visible = excluded.is_visible,
    updated_at = now();

-- Historical SharePoint library inventory (Power Query list
-- cca511f3-7021-4167-a738-cfd05f9f4012, view EB2E36B5-E003-4708-8EC0-777F4261142A).
with target_company as (
  select id from public.companies where active order by id limit 1
), historical(code, subject, source_file_name, source_web_url, source_modified_at) as (
  values
    ('NS 01-25', 'Registre des Exercices de Sécurité', 'NS 01-25 - Registre des Exercices de Sécurité.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2001-25%20-%20Registre%20des%20Exercices%20de%20S%C3%A9curit%C3%A9.docx?web=1', '2025-11-10T15:00:00Z'::timestamptz),
    ('NS 02-25', 'GRY - Revue d''Exploitation', 'NS 02-25 - GRY - Revue d''Exploitation.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2002-25%20-%20GRY%20-%20Revue%20d%27Exploitation.docx?web=1', '2025-11-10T15:03:00Z'::timestamptz),
    ('NS 03-25', 'GRY - Escales GOURY - Projet P144 EMDT', 'NS 03-25 - GRY - Escales GOURY – Projet P144 EMDT.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2003-25%20-%20GRY%20-%20Escales%20GOURY%20%E2%80%93%20Projet%20P144%20EMDT.docx?web=1', '2025-11-10T15:03:00Z'::timestamptz),
    ('NS 04-25', 'GRY - Utilisation de la DMR - EMDT', 'NS 04-25 - GRY - Utilisation de la DMR - EMDT.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2004-25%20-%20GRY%20-%20Utilisation%20de%20la%20DMR%20-%20EMDT.docx?web=1', '2025-11-10T15:04:00Z'::timestamptz),
    ('NS 05-25', 'RZL - Procédures et manuels d''urgence', 'NS 05-25 - RZL - Procédures et manuels d’urgence.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2005-25%20-%20RZL%20-%20Proc%C3%A9dures%20et%20manuels%20d%E2%80%99urgence.docx?web=1', '2025-11-10T15:05:00Z'::timestamptz),
    ('NS 06-25', 'Règles de communication VHF dans les zones portuaires du Havre', 'NS 06-25 - Règles de communication VHF dans les zones portuaires du Havre.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2006-25%20-%20R%C3%A8gles%20de%20communication%20VHF%20dans%20les%20zones%20portuaires%20du%20Havre.docx?web=1', '2025-11-19T13:48:00Z'::timestamptz),
    ('NS 07-25', 'Ordres permanents du Capitaine', 'NS 07-25 - Ordres permanents du Capitaine.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2007-25%20-%20Ordres%20permanents%20du%20Capitaine.docx?web=1', '2026-02-19T12:50:16Z'::timestamptz),
    ('NS 08-25', 'Lutte contre le narcotrafic maritime', 'NS 08-25 - Lutte contre le narcotrafic maritime.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2008-25%20-%20Lutte%20contre%20le%20narcotrafic%20maritime.docx?web=1', '2025-11-28T10:16:41Z'::timestamptz),
    ('NS 01-26', 'Inventaire du matériel nautique et d''armement - HOLENN EUSA', 'NS 01-26 - Inventaire du matériel nautique et d’armement – HOLENN EUSA.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2001-26%20-%20Inventaire%20du%20mat%C3%A9riel%20nautique%20et%20d%E2%80%99armement%20%E2%80%93%20HOLENN%20EUSA.docx?web=1', '2026-02-19T11:04:00Z'::timestamptz),
    ('NS 02-26', 'Manuel des Conditions de Travail et Formation - CSE', 'NS 02-26 - Manuel des Conditions de Travail et Formation – CSE.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2002-26%20-%20Manuel%20des%20Conditions%20de%20Travail%20et%20Formation%20%E2%80%93%20CSE.docx?web=1', '2026-04-30T13:05:00Z'::timestamptz),
    ('NS 03-26', 'Transmission et formation interne', 'NS 03-26 - Transmission et formation interne.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2003-26%20-%20Transmission%20et%20formation%20interne.docx?web=1', '2026-03-18T15:51:00Z'::timestamptz),
    ('NS 03-26', 'Entrée dans les 500 m', 'NS 03-26 - Entrée dans les 500m.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2003-26%20-%20Entr%C3%A9e%20dans%20les%20500m.docx?web=1', '2026-04-30T13:48:00Z'::timestamptz),
    ('NS 04-26', 'Gestion des Achats', 'NS 04-26 - Gestion des Achats.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2004-26%20-%20Gestion%20des%20Achats.docx?web=1', '2026-05-02T14:12:00Z'::timestamptz),
    ('NS 05-26', 'Politique Drogue et Alcool', 'NS 05-26 - Politique Drogue et Alcool.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2005-26%20-%20Politique%20Drogue%20et%20Alcool.docx?web=1', '2026-06-25T07:35:00Z'::timestamptz),
    ('NS 06-26', 'Organisation des relèves', 'NS 06-26 - Organisation des relèves.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2006-26%20-%20Organisation%20des%20rel%C3%A8ves.docx?web=1', '2026-07-10T14:01:00Z'::timestamptz),
    ('NS 07-26-KROKDUR', 'Mise à jour du DUP de KROKDUR', 'NS 07-26 - Mise à jour du DUP.docx', 'https://bbtm668.sharepoint.com/sites/QHSE/Notes%20de%20Service/NS%2007-26%20-%20Mise%20%C3%A0%20jour%20du%20DUP.docx?web=1', '2026-09-01T14:35:28Z'::timestamptz)
)
insert into public.qhse_service_notes (
  company_id, chronology_code, subject, body, status, authored_on,
  published_at, source_kind, source_file_name, source_web_url, source_modified_at,
  created_by, author_identity_snapshot, author_signature_snapshot
)
select
  company.id,
  historical.code,
  historical.subject,
  'Note de service historique importée depuis SharePoint.',
  'published',
  historical.source_modified_at::date,
  historical.source_modified_at,
  'sharepoint',
  historical.source_file_name,
  historical.source_web_url,
  historical.source_modified_at,
  coalesce((select profile.id from public.profiles profile where profile.active_company_id = company.id order by profile.created_at limit 1), (select id from public.profiles order by created_at limit 1)),
  jsonb_build_object('display_name', 'Import SharePoint'),
  '{}'::jsonb
from target_company company
cross join historical
on conflict (company_id, source_web_url) do update
set chronology_code = excluded.chronology_code,
    subject = excluded.subject,
    source_file_name = excluded.source_file_name,
    source_modified_at = excluded.source_modified_at,
    updated_at = now();

comment on table public.qhse_service_notes is
  'One canonical service-note record. Drafts are private to Admin/Direction; published notes are company-readable.';
comment on table public.qhse_service_note_recipients is
  'Immutable company-account distribution snapshot created atomically when a note is published.';
comment on table public.qhse_service_note_signatures is
  'One immutable acknowledgement per recipient, referencing a frozen profile-signature version on the shared note.';
comment on table public.qhse_service_note_attachments is
  'Files or links to QHSE procedures, action-plan items and fleet certificates inventoried on a service note.';
