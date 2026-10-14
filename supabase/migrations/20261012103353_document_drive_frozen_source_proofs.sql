-- No private document paths or fingerprints are embedded in this migration.
-- Existing freezes remain effective while the operator loads reviewed proofs.
alter table document_drive_private.frozen_sources
  add column source_id uuid,
  add column source_sha256 text,
  add constraint frozen_source_proof_complete check (
    (source_id is null and source_sha256 is null)
    or (source_id is not null and source_sha256 is not null and source_sha256 ~ '^[a-f0-9]{64}$'));

-- The schema stays outside the Data API. Only the service role can compare the
-- complete frozen set; browser roles cannot call this function or see paths.
grant usage on schema document_drive_private to service_role;
create function public.document_drive_sources_frozen(p_records jsonb)
returns boolean language plpgsql stable security invoker set search_path='' as $$
declare expected_count integer;
begin
  if jsonb_typeof(p_records) is distinct from 'array' then return false; end if;
  expected_count := jsonb_array_length(p_records);
  if expected_count = 0 or expected_count > 10000 then return false; end if;
  if not exists(select 1 from pg_catalog.pg_class where oid='storage.objects'::regclass and relrowsecurity)
    or (select count(*) from pg_catalog.pg_policy p where p.polrelid='storage.objects'::regclass
      and not p.polpermissive and 'authenticated'::regrole::oid=any(p.polroles)
      and ((p.polname='document_drive_freeze_insert' and p.polcmd='a' and p.polwithcheck is not null)
        or (p.polname='document_drive_freeze_update' and p.polcmd='w' and p.polqual is not null and p.polwithcheck is not null)
        or (p.polname='document_drive_freeze_delete' and p.polcmd='d' and p.polqual is not null))) <> 3
    then return false; end if;
  if expected_count <> (select count(*) from document_drive_private.frozen_sources) then return false; end if;
  return (select count(*)=expected_count
    and count(distinct (r.source_bucket,r.source_path))=expected_count
    from jsonb_to_recordset(p_records) as r(source_bucket text,source_path text,source_id uuid,source_sha256 text)
    join document_drive_private.frozen_sources f
      on f.source_bucket=r.source_bucket and f.source_path=r.source_path
      and f.source_id=r.source_id and f.source_sha256=r.source_sha256);
exception when invalid_parameter_value or invalid_text_representation then
  return false;
end;
$$;
revoke all on function public.document_drive_sources_frozen(jsonb) from public,anon,authenticated;
grant execute on function public.document_drive_sources_frozen(jsonb) to service_role;
comment on function public.document_drive_sources_frozen(jsonb) is
  'Service-only, read-only comparison of the complete private frozen source set and operator-reviewed ID/SHA256 proofs. False until all proofs are loaded.';
