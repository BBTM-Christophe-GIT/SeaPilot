-- Phase 5: stable, replayable SharePoint document metadata refresh.
-- Files remain in SharePoint; these indexes only protect metadata identity.

create unique index if not exists project_documents_drive_item_upsert_unique_idx
  on public.project_documents (sharepoint_drive_id, sharepoint_drive_item_id);

create unique index if not exists contract_documents_drive_item_upsert_unique_idx
  on public.contract_documents (sharepoint_drive_id, sharepoint_drive_item_id);

comment on column public.project_documents.file_url is
  'Original protected SharePoint URL. SeaPilot opens it in SharePoint and never persists file content.';

comment on column public.contract_documents.file_url is
  'Original protected SharePoint URL. SeaPilot opens it in SharePoint and never persists file content.';
