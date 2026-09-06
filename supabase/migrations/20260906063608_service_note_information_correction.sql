-- Temporary information-correction entry point for service notes.
-- It deliberately updates document content only: lifecycle, audience, recipients,
-- chronology and signatures remain untouched.

create or replace function public.update_service_note_information(
  p_note_id bigint,
  p_subject text,
  p_body text,
  p_authored_on date,
  p_author_display_name text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_note public.qhse_service_notes%rowtype;
  normalized_subject text := trim(coalesce(p_subject, ''));
  normalized_body text := coalesce(p_body, '');
  normalized_author_name text := trim(coalesce(p_author_display_name, ''));
begin
  select * into target_note
  from public.qhse_service_notes note
  where note.id = p_note_id
  for update;

  if (select auth.uid()) is null
    or target_note.id is null
    or not public.has_company_role(target_note.company_id, array['admin', 'direction']) then
    raise exception using errcode = '42501', message = 'SERVICE_NOTE_INFORMATION_UPDATE_FORBIDDEN.';
  end if;

  if length(normalized_subject) not between 2 and 500 then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_SUBJECT_INVALID.';
  end if;
  if length(trim(normalized_body)) not between 2 and 20000 then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_BODY_INVALID.';
  end if;
  if p_authored_on is null then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_DATE_REQUIRED.';
  end if;
  if length(normalized_author_name) > 250 then
    raise exception using errcode = '23514', message = 'SERVICE_NOTE_AUTHOR_NAME_INVALID.';
  end if;

  update public.qhse_service_notes note
  set subject = normalized_subject,
      body = normalized_body,
      authored_on = p_authored_on,
      author_identity_snapshot = jsonb_set(
        coalesce(note.author_identity_snapshot, '{}'::jsonb),
        '{display_name}',
        to_jsonb(normalized_author_name),
        true
      ),
      updated_at = clock_timestamp()
  where note.id = target_note.id;

  return target_note.id;
end;
$$;

revoke all on function public.update_service_note_information(bigint, text, text, date, text)
  from public, anon;
grant execute on function public.update_service_note_information(bigint, text, text, date, text)
  to authenticated;

comment on function public.update_service_note_information(bigint, text, text, date, text) is
  'Temporarily lets Admin/Direction correct service-note document information without changing status, chronology, audience, recipients or signatures.';
