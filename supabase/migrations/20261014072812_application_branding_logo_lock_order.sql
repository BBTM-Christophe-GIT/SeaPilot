-- Storage API cleanup locks object rows before probing DELETE policies.
-- Publication uses the same object -> branding order, avoiding a lock inversion
-- while retaining the shared cleanup lock that protects the current logo.
create or replace function application_branding_private.save_logo(p_logo_path text, p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target application_branding_private.settings; object_row storage.objects; expected_mime text;
begin
  if not application_branding_private.can_manage() then
    raise exception 'APPLICATION_BRANDING_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_logo_path is not null then
    if p_logo_path !~ ('^logos/' || auth.uid()::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](png|jpg|webp)$') then
      raise exception 'APPLICATION_BRANDING_INVALID_LOGO' using errcode = '22023';
    end if;
    expected_mime := case split_part(p_logo_path, '.', 2) when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'webp' then 'image/webp' end;
    select * into object_row from storage.objects where bucket_id = 'application-branding' and name = p_logo_path for share;
    if object_row.id is null or object_row.owner_id is distinct from auth.uid()::text
      or object_row.metadata->>'mimetype' is distinct from expected_mime
      or not (case when coalesce(object_row.metadata->>'size', '') ~ '^[0-9]{1,10}$'
        then (object_row.metadata->>'size')::bigint between 1 and 2097152 else false end) then
      raise exception 'APPLICATION_BRANDING_INVALID_LOGO' using errcode = '22023';
    end if;
  end if;
  select * into target from application_branding_private.settings where singleton for update;
  if p_expected_revision is null or target.revision is distinct from p_expected_revision then
    raise exception 'APPLICATION_BRANDING_REVISION_CHANGED' using errcode = '40001';
  end if;
  update application_branding_private.settings set logo_path = p_logo_path,
    revision = revision + 1, updated_by = auth.uid(), updated_at = clock_timestamp() where singleton;
  return public.get_application_branding();
end $$;

-- CREATE OR REPLACE preserves the existing authenticated-only function ACL.
notify pgrst, 'reload schema';
