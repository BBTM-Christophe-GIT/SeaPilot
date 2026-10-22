-- Certificate bytes are available to every company profile except Marin.
-- Keep membership checks in one helper for Storage and migrated Drive/Blob reads.
create function public.can_download_fleet_certificates()
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null
    and public.has_company_role(public.current_planning_company_id(),
      array['admin','direction','armement','capitaine']);
$$;
revoke all on function public.can_download_fleet_certificates() from public, anon;
grant execute on function public.can_download_fleet_certificates() to authenticated, service_role;

comment on function public.can_download_fleet_certificates() is
  'Read/download fleet certificate files for active Admin, Direction, Armement and Capitaine company members; Marin is excluded.';

-- This bucket also contains finding evidence and LSA/register documents. Only
-- the certificate registry (including historical versions) defines this boundary.
create schema if not exists fleet_certificate_private;
revoke all on schema fleet_certificate_private from public, anon;
grant usage on schema fleet_certificate_private to authenticated, service_role;

-- A narrow existence check must also see certificates hidden by vessel RLS.
-- No certificate metadata or storage addresses are returned to the caller.
create function fleet_certificate_private.is_certificate_file(target_bucket text, target_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and target_bucket = 'fleet-certificates' and (
    exists (select 1 from public.fleet_certificates c
      where c.storage_bucket = target_bucket and c.storage_path = target_path)
    or exists (select 1 from public.fleet_certificate_versions v
      where v.storage_bucket = target_bucket and v.storage_path = target_path)
  );
$$;
revoke all on function fleet_certificate_private.is_certificate_file(text,text) from public, anon;
grant execute on function fleet_certificate_private.is_certificate_file(text,text) to authenticated, service_role;

create function public.fleet_certificate_file_read_allowed(target_bucket text, target_path text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select not fleet_certificate_private.is_certificate_file(target_bucket, target_path)
    or public.can_download_fleet_certificates();
$$;
revoke all on function public.fleet_certificate_file_read_allowed(text,text) from public, anon;
grant execute on function public.fleet_certificate_file_read_allowed(text,text) to authenticated, service_role;

-- Restrictive guards cover both ordinary reads and the Blob uploader-owned OR
-- branch after a former uploader is downgraded to Marin. Other files retain
-- their existing permissive policies; these guards grant no access themselves.
create policy fleet_certificate_download_guard on storage.objects
as restrictive for select to authenticated using (
  public.fleet_certificate_file_read_allowed(bucket_id, name)
);
create policy fleet_certificate_download_guard on public.document_drive_files
as restrictive for select to authenticated using (
  public.fleet_certificate_file_read_allowed(source_bucket, source_path)
);
create policy fleet_certificate_download_guard on public.document_blob_files
as restrictive for select to authenticated using (
  public.fleet_certificate_file_read_allowed(source_bucket, source_path)
);

-- Keep document_drive_can_read consistent for direct access checks as well.
create or replace function public.document_drive_can_read(target_bucket text, target_path text)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
begin
  if auth.uid() is null then return false; end if;
  case target_bucket
    when 'procedure-documents' then
      if target_path like 'sources/%' then
        return public.has_any_role(array['admin','direction']) and exists (
          select 1 from public.procedures d
          where d.source_storage_bucket=target_bucket and d.source_storage_path=target_path
        );
      end if;
      return target_path like 'published/%' and exists (
        select 1 from public.published_procedures d
        where d.storage_bucket=target_bucket and d.storage_path=target_path
      );
    when 'fleet-certificates' then
      return split_part(target_path,'/',1)=public.current_planning_company_id()::text
        and public.has_any_role(array['admin','direction','armement','capitaine','marin'])
        and public.fleet_certificate_file_read_allowed(target_bucket,target_path);
    when 'hr-documents' then
      return exists (select 1 from public.hr_documents d
        where d.storage_bucket=target_bucket and d.storage_path=target_path);
    when 'project-files' then
      return exists (select 1 from public.project_drive_files d
          where d.source_bucket=target_bucket and d.source_path=target_path)
        or exists (select 1 from public.project_generated_documents d
          where d.storage_bucket=target_bucket and d.storage_path=target_path)
        or exists (select 1 from public.contract_documents d
          where d.storage_bucket=target_bucket and d.storage_path=target_path)
        or exists (select 1 from public.project_billing_documents d
          where d.bucket_name=target_bucket and d.object_path=target_path);
    when 'expense-note-pdfs' then
      return exists (select 1 from public.expense_notes d where d.pdf_path=target_path);
    when 'working-time-imports' then
      return exists (select 1 from public.working_time_import_batches d
        where d.source_storage_bucket=target_bucket and d.source_storage_path=target_path
          and public.working_time_can_manage_imports(d.company_id));
    when 'documentary-audit-files' then
      return documentary_audit_private.can_read_file(target_path);
    when 'purchase-request-attachments' then
      return exists (select 1 from public.purchase_request_attachments d
        where d.storage_bucket=target_bucket and d.storage_path=target_path);
    when 'lifting-certificates' then
      return public.lifting_certificate_path_access(target_path);
    when 'annual-review-reports' then
      return exists (select 1 from public.annual_reviews d
        where ((d.manager_report_bucket=target_bucket and d.manager_report_path=target_path)
          or (d.final_report_bucket=target_bucket and d.final_report_path=target_path))
          and public.annual_review_can_read(d.id));
    when 'vessel-visits' then
      return exists (select 1 from public.vessel_visit_attachments d
        where d.bucket_name=target_bucket and d.object_path=target_path);
    else return false;
  end case;
end;
$$;
