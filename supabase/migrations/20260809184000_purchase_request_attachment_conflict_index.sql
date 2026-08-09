drop index if exists public.purchase_request_attachments_sharepoint_unique_idx;

create unique index purchase_request_attachments_sharepoint_unique_idx
  on public.purchase_request_attachments (
    sharepoint_list_id,
    purchase_sharepoint_item_id,
    sharepoint_server_relative_url
  );

comment on index public.purchase_request_attachments_sharepoint_unique_idx is
  'Index non partiel requis par ON CONFLICT pour les pièces jointes SharePoint.';
