-- Service-note lifecycle: managers may recall only the latest published note,
-- re-publish a recalled note, or permanently delete a private draft.

alter table public.qhse_service_notes
  add column if not exists last_recalled_at timestamptz,
  add column if not exists last_recalled_by uuid references public.profiles(id) on delete set null,
  add column if not exists last_recalled_chronology_code text;

alter table public.qhse_service_notes
  drop constraint if exists qhse_service_notes_status_check,
  drop constraint if exists qhse_service_notes_publication_check;

alter table public.qhse_service_notes
  add constraint qhse_service_notes_status_check
    check (status in ('draft', 'published', 'archived', 'recalled')),
  add constraint qhse_service_notes_publication_check check (
    (status = 'draft' and published_at is null and published_by is null)
    or (status in ('published', 'archived') and published_at is not null)
    or (
      status = 'recalled'
      and published_at is not null
      and chronology_code = ''
      and last_recalled_at is not null
      and last_recalled_by is not null
    )
  );

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
          note.status in ('draft', 'recalled')
          and public.has_company_role(note.company_id, array['admin', 'direction'])
        )
      )
  );
$$;

create or replace function public.publish_service_note(p_note_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
  actor_person public.people%rowtype;
  actor_profile public.profiles%rowtype;
  author_signature jsonb;
  recipient_count integer;
  chronology_sequence integer;
  chronology_year text := to_char(current_date, 'YY');
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id;

  if (select auth.uid()) is null
    or target_note.id is null
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_PUBLISH_FORBIDDEN.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(format('service-notes-lifecycle:%s', target_note.company_id), 0)
  );

  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id
  for update;

  if target_note.status not in ('draft', 'recalled') then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_PUBLISH_FORBIDDEN.';
  end if;
  if length(trim(target_note.subject)) < 2 or length(trim(target_note.body)) < 2 then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_CONTENT_REQUIRED.';
  end if;

  if target_note.author_person_id is null then
    select * into actor_person
    from public.people person
    where person.user_id = (select auth.uid())
      and person.company_id = target_note.company_id
    limit 1;

    if actor_person.id is null then
      raise exception using errcode = '23514', message = 'SERVICE_NOTE_AUTHOR_PROFILE_REQUIRED.';
    end if;

    select * into actor_profile
    from public.profiles profile
    where profile.id = (select auth.uid());

    target_note.author_person_id := actor_person.id;
    target_note.author_identity_snapshot := jsonb_build_object(
      'user_id', (select auth.uid()),
      'person_id', actor_person.id,
      'first_name', coalesce(actor_person.first_name, ''),
      'last_name', coalesce(actor_person.last_name, ''),
      'display_name', coalesce(nullif(trim(actor_person.first_name || ' ' || actor_person.last_name), ''), actor_profile.display_name, actor_profile.email, ''),
      'function_label', coalesce(actor_person.function_label, '')
    );
  end if;

  author_signature := public.working_time_active_signature_snapshot(
    target_note.company_id,
    target_note.author_person_id
  );
  if author_signature = '{}'::jsonb then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_AUTHOR_SIGNATURE_REQUIRED.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(format('service-notes:%s:%s', target_note.company_id, chronology_year), 0)
  );

  select coalesce(max(substring(note.chronology_code from format('^NS ([0-9]+)-%s', chronology_year))::integer), 0) + 1
  into chronology_sequence
  from public.qhse_service_notes note
  where note.company_id = target_note.company_id
    and note.id <> target_note.id;

  if target_note.status = 'recalled' then
    delete from public.qhse_service_note_signatures signature
    where signature.note_id = target_note.id;

    delete from public.qhse_service_note_recipients recipient
    where recipient.note_id = target_note.id;
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

  select count(*) into recipient_count
  from public.qhse_service_note_recipients recipient
  where recipient.note_id = target_note.id;
  if recipient_count = 0 then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_RECIPIENTS_REQUIRED.';
  end if;

  update public.qhse_service_notes
  set chronology_code = format('NS %s-%s', lpad(chronology_sequence::text, 2, '0'), chronology_year),
      status = 'published',
      author_person_id = target_note.author_person_id,
      author_identity_snapshot = target_note.author_identity_snapshot,
      author_signature_snapshot = author_signature,
      published_at = clock_timestamp(),
      published_by = (select auth.uid()),
      source_kind = 'seapilot',
      updated_at = clock_timestamp()
  where id = target_note.id;

  return target_note.id;
end;
$$;

create or replace function public.recall_service_note(p_note_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
  latest_published_note_id bigint;
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id;

  if (select auth.uid()) is null
    or target_note.id is null
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_RECALL_FORBIDDEN.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(format('service-notes-lifecycle:%s', target_note.company_id), 0)
  );

  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id
  for update;

  if target_note.status <> 'published' then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_RECALL_PUBLISHED_ONLY.';
  end if;

  select note.id into latest_published_note_id
  from public.qhse_service_notes note
  where note.company_id = target_note.company_id
    and note.status = 'published'
  order by note.published_at desc nulls last, note.id desc
  limit 1;

  if latest_published_note_id is distinct from target_note.id then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_RECALL_LATEST_ONLY.';
  end if;

  update public.qhse_service_notes
  set last_recalled_chronology_code = target_note.chronology_code,
      chronology_code = '',
      status = 'recalled',
      last_recalled_at = clock_timestamp(),
      last_recalled_by = (select auth.uid()),
      updated_at = clock_timestamp()
  where id = target_note.id;

  return target_note.id;
end;
$$;

create or replace function public.delete_service_note_draft(p_note_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
begin
  select * into target_note
  from public.qhse_service_notes
  where id = p_note_id
  for update;

  if (select auth.uid()) is null
    or target_note.id is null
    or target_note.status <> 'draft'
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_DELETE_DRAFT_FORBIDDEN.';
  end if;

  delete from public.qhse_service_notes note
  where note.id = target_note.id;

  return target_note.id;
end;
$$;

drop policy if exists qhse_service_note_recipients_read on public.qhse_service_note_recipients;
create policy qhse_service_note_recipients_read on public.qhse_service_note_recipients
for select to authenticated
using ((select public.service_note_can_read(note_id)));

revoke all on function public.service_note_can_read(bigint) from public, anon;
revoke all on function public.publish_service_note(bigint) from public, anon;
revoke all on function public.recall_service_note(bigint) from public, anon;
revoke all on function public.delete_service_note_draft(bigint) from public, anon;
grant execute on function public.service_note_can_read(bigint) to authenticated;
grant execute on function public.publish_service_note(bigint) to authenticated;
grant execute on function public.recall_service_note(bigint) to authenticated;
grant execute on function public.delete_service_note_draft(bigint) to authenticated;

comment on column public.qhse_service_notes.last_recalled_chronology_code is
  'Last chronology code retained for the management audit trail after the active note code is removed.';
comment on function public.recall_service_note(bigint) is
  'Recalls only the latest published company note. The note becomes manager-only and loses its active chronology code.';
comment on function public.delete_service_note_draft(bigint) is
  'Permanently deletes a private draft after an explicit Admin/Direction request.';
