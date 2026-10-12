-- Empty registry: reviewed private source paths are loaded separately by the
-- operator. Keep tombstones after purge so legacy paths cannot be recreated.
create table document_drive_private.frozen_sources (
  source_bucket text not null check (source_bucket in (
    'procedure-documents','fleet-certificates','hr-documents','project-files',
    'expense-note-pdfs','working-time-imports','documentary-audit-files',
    'purchase-request-attachments','lifting-certificates','annual-review-reports','vessel-visits')),
  source_path text not null check (length(source_path) between 1 and 2000
    and source_path !~ '(^/|(^|/)\.\.?(/|$)|[\\[:cntrl:]])'
    and lower(source_path) ~ '\.(pdf|doc|docx|dotx|xls|xlsx|xlsm)$'),
  frozen_at timestamptz not null default now(),
  primary key (source_bucket,source_path)
);
comment on table document_drive_private.frozen_sources is
  'Operator-reviewed legacy document paths. Retained after purge to prevent users from recreating inaccessible Storage copies.';
revoke all on document_drive_private.frozen_sources from public,anon,authenticated;
grant all on document_drive_private.frozen_sources to service_role;

create function document_drive_private.source_is_frozen(target_bucket text,target_path text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from document_drive_private.frozen_sources f
    where f.source_bucket=target_bucket and f.source_path=target_path);
$$;
revoke all on function document_drive_private.source_is_frozen(text,text) from public,anon;
grant execute on function document_drive_private.source_is_frozen(text,text) to authenticated;

-- Restrictive policies combine with every existing permissive business policy.
-- Reads and paths outside the registry retain their existing permissions.
create policy document_drive_freeze_insert on storage.objects as restrictive
for insert to authenticated with check (
  not document_drive_private.source_is_frozen(bucket_id,name));
create policy document_drive_freeze_update on storage.objects as restrictive
for update to authenticated using (
  not document_drive_private.source_is_frozen(bucket_id,name)) with check (
  not document_drive_private.source_is_frozen(bucket_id,name));
create policy document_drive_freeze_delete on storage.objects as restrictive
for delete to authenticated using (
  not document_drive_private.source_is_frozen(bucket_id,name));

-- service_role deliberately retains its Storage API purge privileges and
-- bypasses RLS; service-role upload jobs must remain suspended during cutover.
