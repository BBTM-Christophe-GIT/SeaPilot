begin;

select plan(4);

select ok(
  to_regclass('public.project_documents_drive_item_upsert_unique_idx') is not null,
  'project document metadata has a full drive/item upsert index'
);

select ok(
  to_regclass('public.contract_documents_drive_item_upsert_unique_idx') is not null,
  'contract document metadata has a full drive/item upsert index'
);

insert into public.project_documents (
  company_id,
  title,
  sharepoint_drive_id,
  sharepoint_drive_item_id,
  file_url
)
select id, 'Phase 5 project document', 'phase5-project-drive', 'phase5-project-item',
  'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/phase5.pdf'
from public.companies
where code = 'bbtm'
on conflict (sharepoint_drive_id, sharepoint_drive_item_id)
do update set title = excluded.title;

insert into public.project_documents (
  company_id,
  title,
  sharepoint_drive_id,
  sharepoint_drive_item_id,
  file_url
)
select id, 'Phase 5 project document refreshed', 'phase5-project-drive', 'phase5-project-item',
  'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Projets/phase5.pdf'
from public.companies
where code = 'bbtm'
on conflict (sharepoint_drive_id, sharepoint_drive_item_id)
do update set title = excluded.title;

select is(
  (select count(*) from public.project_documents where sharepoint_drive_id = 'phase5-project-drive'),
  1::bigint,
  'replaying project document metadata updates one stable row'
);

insert into public.contract_documents (
  company_id,
  title,
  sharepoint_drive_id,
  sharepoint_drive_item_id,
  file_url
)
select id, 'Phase 5 contract document', 'phase5-contract-drive', 'phase5-contract-item',
  'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels/phase5.pdf'
from public.companies
where code = 'bbtm'
on conflict (sharepoint_drive_id, sharepoint_drive_item_id)
do update set title = excluded.title;

insert into public.contract_documents (
  company_id,
  title,
  sharepoint_drive_id,
  sharepoint_drive_item_id,
  file_url
)
select id, 'Phase 5 contract document refreshed', 'phase5-contract-drive', 'phase5-contract-item',
  'https://bbtm668.sharepoint.com/sites/QHSE/Documents%20Contractuels/phase5.pdf'
from public.companies
where code = 'bbtm'
on conflict (sharepoint_drive_id, sharepoint_drive_item_id)
do update set title = excluded.title;

select is(
  (select count(*) from public.contract_documents where sharepoint_drive_id = 'phase5-contract-drive'),
  1::bigint,
  'replaying contract document metadata updates one stable row'
);

select * from finish();
rollback;
